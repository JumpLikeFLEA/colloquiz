"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Link2, Mic, Square, Trash2 } from "lucide-react";
import { voiceCopy } from "@/lib/alliengll/voiceCopy";
import type { VoiceTaskBlock } from "@/lib/lessons";
import {
  VOICE_RECORDER_BITS_PER_SECOND,
  formatClock,
  pickRecorderMimeType,
  recorderSupport,
  resolveUploadMime,
  uploadPercent,
} from "@/lib/voice/recorder";
import type { VoiceCap } from "@/lib/voice/analysisCaps";
import { capNoticeText } from "@/lib/voice/capNotice";
import { voiceObjectName, type VoiceMimeType } from "@/lib/voice/recording";
import { postVoiceSubmission, sendVoiceTake, uploadVoiceTake } from "@/lib/voice/send";
import { addTake, findTake, removeTake, takesFull } from "@/lib/voice/takes";
import type { VoiceTaskSubmission, VoiceTasksContext } from "@/lib/voice/taskContext";
import { SUBMIT_BUTTON_CLASS } from "../practice/practiceClasses";
import { FeedbackContentView } from "./FeedbackContentView";

// VOICE-014 (docs/decisions/0189): the AI feedback view is its own chunk, fetched only when a
// sent take is drawn while the analysis is switched on. ssr: false because it polls.
const VoiceAnalysisPanel = dynamic(() => import("./analysis/VoiceAnalysisPanel").then((m) => m.VoiceAnalysisPanel), {
  ssr: false,
  loading: () => <div className="mt-1 h-24 rounded-xl border border-border bg-card" aria-hidden="true" />,
});

function formatCapTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The voice recorder (VOICE-005, docs/decisions/0111): record -> listen ->
 * record again -> send. Up to five takes are kept in memory and the learner
 * sends the one they choose (VOICE-008, docs/decisions/0141 Decision 11). Lives in the voice block's own chunk (LessonPlayer's
 * `next/dynamic`), so a lesson without a voice task never downloads it.
 *
 * States, from the context the page built and what happens here:
 *   - practice: record and listen only. Nothing leaves the device (no
 *     request is made at all), matching privacy-policy.md's "Practice
 *     recordings ... stay on your device and are never uploaded".
 *   - send: as practice, plus Send. The upload happens only on Send.
 *   - sent: the learner's own take plays back, "waiting for feedback";
 *     recording again and sending replaces it (0110 Decision 3). While the AI analysis is
 *     switched on (`context.analysis`), the AI feedback view sits under it (VOICE-014).
 *   - feedback published: shown under the recording; the block is locked.
 *   - unsupported: no getUserMedia or no MediaRecorder (an in-app browser,
 *     say): the open-in-your-browser fallback (0097), with a Copy link.
 */

// The paid card's "Back to course" button (LessonUnavailable.tsx), plus the
// pointer and disabled states a <button> needs.
const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

const NOTICE_CLASS = "rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground";
const ERROR_NOTICE_CLASS = "rounded-xl bg-destructive-subtle px-3 py-2 text-sm text-destructive-text";

type Take = { id: string; url: string; blob: Blob; mime: VoiceMimeType | null; submissionId: string };
type Phase = "idle" | "starting" | "recording" | "sending" | "send_failed";
type Notice = { text: string; error: boolean };

const NO_SUBSCRIBE = () => () => {};
function detectSupport() {
  return recorderSupport({
    hasGetUserMedia: typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function",
    hasMediaRecorder: typeof MediaRecorder !== "undefined",
  });
}

export function VoiceRecorder({ block, context }: { block: VoiceTaskBlock; context: VoiceTasksContext }) {
  // The server can't detect a browser feature, so it renders "supported" and
  // the client corrects it after hydration (no mismatch).
  const support = useSyncExternalStore(NO_SUBSCRIBE, detectSupport, () => "supported" as const);
  const [mode, setMode] = useState<"practice" | "send">(context.mode);
  const [sent, setSent] = useState<VoiceTaskSubmission | null>(
    context.mode === "send" ? (context.submissions[block.id] ?? null) : null,
  );
  const [takes, setTakes] = useState<readonly Take[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timersRef = useRef<{ tick?: ReturnType<typeof setInterval>; limit?: ReturnType<typeof setTimeout> }>({});
  const urlsRef = useRef<string[]>([]);
  const refreshedRef = useRef(false);
  const capRef = useRef<VoiceCap | null>(null);

  // Release the microphone and every blob URL when the block goes away.
  useEffect(() => {
    const timers = timersRef.current;
    const urls = urlsRef.current;
    return () => {
      clearInterval(timers.tick);
      clearTimeout(timers.limit);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const locked = sent?.feedback != null;

  async function startRecording() {
    if (takesFull(takes)) {
      setNotice({ text: voiceCopy.takesFull, error: false });
      return;
    }
    setNotice(null);
    setPhase("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setPhase("idle");
      setNotice({
        text: name === "NotAllowedError" || name === "SecurityError" ? voiceCopy.denied : voiceCopy.micError,
        error: true,
      });
      return;
    }
    streamRef.current = stream;

    const requested = pickRecorderMimeType(
      typeof MediaRecorder.isTypeSupported === "function" ? (t) => MediaRecorder.isTypeSupported(t) : undefined,
    );
    const options: MediaRecorderOptions = { audioBitsPerSecond: VOICE_RECORDER_BITS_PER_SECOND };
    if (requested) options.mimeType = requested;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      clearInterval(timersRef.current.tick);
      clearTimeout(timersRef.current.limit);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      // Firefox reports "" for both (0097); the bytes are read below.
      const reported = recorder.mimeType || chunks[0]?.type || "";
      const blob = new Blob(chunks, reported ? { type: reported } : undefined);
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const url = URL.createObjectURL(blob);
      urlsRef.current.push(url);
      const submissionId = crypto.randomUUID();
      setTakes((list) =>
        addTake(list, { id: submissionId, url, blob, mime: resolveUploadMime(head, reported, requested), submissionId }),
      );
      setPhase("idle");
    };

    const startedAt = Date.now();
    setElapsed(0);
    timersRef.current.tick = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    timersRef.current.limit = setTimeout(() => {
      setNotice({ text: voiceCopy.timeLimit, error: false });
      stopRecording();
    }, block.maxSeconds * 1000);
    recorder.start();
    setPhase("recording");
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function deleteTake(id: string) {
    const gone = findTake(takes, id);
    if (!gone) return;
    URL.revokeObjectURL(gone.url);
    const at = urlsRef.current.indexOf(gone.url);
    if (at >= 0) urlsRef.current.splice(at, 1);
    setTakes((list) => removeTake(list, id));
    setNotice(null);
    if (failedId === id) {
      setFailedId(null);
      setPhase("idle");
    }
  }

  async function send(id: string) {
    const take = findTake(takes, id);
    if (!take || context.mode !== "send") return;
    if (!take.mime) {
      setNotice({ text: voiceCopy.noContainer, error: true });
      return;
    }
    setNotice(null);
    setFailedId(null);
    capRef.current = null;
    setProgress(0);
    setSendingId(id);
    setPhase("sending");
    const objectName = voiceObjectName(context.courseId, context.userId, take.submissionId, take.mime);
    const outcome = await sendVoiceTake(
      {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        take: take.blob,
        contentType: take.mime,
        submissionId: take.submissionId,
        objectName,
        lessonId: context.lessonId,
        blockId: block.id,
        onProgress: (loaded, total) => setProgress(uploadPercent(loaded, total)),
      },
      {
        // The browser client loads only now, on Send: the same chunk the
        // player's own signed-in recording uses (LessonPlayer.tsx).
        getAccessToken: async () => {
          const { createClient } = await import("@/lib/supabase/client");
          const { data } = await createClient().auth.getSession();
          return data.session?.access_token ?? null;
        },
        upload: uploadVoiceTake,
        submit: async (body) => {
          const res = await postVoiceSubmission(body);
          capRef.current = res.cap ?? null;
          return res;
        },
      },
    );

    switch (outcome) {
      case "sent":
        // The local take becomes the sent one; it plays from the blob URL
        // already in hand, no signed URL needed this visit.
        // Its blob URL stays alive as the sent playback; other takes stay listed.
        setSent({ id: take.submissionId, playbackUrl: take.url, removed: false, feedback: null });
        setTakes((list) => removeTake(list, id));
        setSendingId(null);
        setPhase("idle");
        return;
      case "practice":
        setMode("practice");
        setNotice({ text: voiceCopy.refused, error: false });
        setSendingId(null);
        setPhase("idle");
        return;
      case "locked":
        setNotice({ text: voiceCopy.lockedMeanwhile, error: false });
        setSendingId(null);
        setPhase("idle");
        return;
      case "capped":
        // The take stays in the list, unsent; retrying now would be refused again.
        setNotice({
          text: capRef.current ? capNoticeText(capRef.current, formatCapTime) : voiceCopy.capNotSent,
          error: false,
        });
        setSendingId(null);
        setPhase("idle");
        return;
      default:
        setSendingId(null);
        setFailedId(id);
        setPhase("send_failed");
    }
  }

  // A signed URL lives 15 minutes (0110 Decision 5). If the page sat open
  // past that, the audio element errors; ask for a fresh one, once.
  async function refreshPlayback() {
    if (!sent || refreshedRef.current || sent.playbackUrl?.startsWith("blob:")) return;
    refreshedRef.current = true;
    try {
      const res = await fetch(`/api/voice/submissions/${sent.id}/playback`, { cache: "no-store" });
      if (!res.ok) return;
      const { url } = (await res.json()) as { url?: string };
      if (url) setSent((s) => (s ? { ...s, playbackUrl: url } : s));
    } catch {
      // Leave the failed player as it is.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // No clipboard either; the address bar still has the link.
    }
  }

  if (support === "unsupported") {
    return (
      <div className="mt-4 flex flex-col items-start gap-3">
        <p className={NOTICE_CLASS}>{voiceCopy.unsupported}</p>
        <button type="button" onClick={copyLink} className={SECONDARY_BUTTON_CLASS}>
          <Link2 className="size-4" aria-hidden="true" />
          {copied ? voiceCopy.linkCopied : voiceCopy.copyLink}
        </button>
      </div>
    );
  }

  const busy = phase === "starting" || phase === "recording" || phase === "sending";
  const showSent = sent !== null && phase !== "recording";
  const full = takesFull(takes);
  const showAnalysis = context.analysis === true && mode === "send" && showSent;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {showSent && (
        <div className="flex flex-col gap-2">
          {sent.removed || !sent.playbackUrl ? (
            <p className={NOTICE_CLASS}>{voiceCopy.removed}</p>
          ) : (
            <audio controls preload="metadata" src={sent.playbackUrl} onError={refreshPlayback} className="w-full" />
          )}
          {sent.feedback ? (
            <>
              <div className="rounded-xl bg-brand-subtle px-4 py-3 text-sm text-foreground">
                <p className="mb-1 font-semibold text-brand-text">{voiceCopy.feedbackHeading}</p>
                <FeedbackContentView content={sent.feedback} />
              </div>
              <p className="text-xs text-muted-foreground">{voiceCopy.locked}</p>
            </>
          ) : (
            <p className="text-sm font-medium text-foreground">
              {showAnalysis && context.mode === "send" && context.slot === "self_paced" ? voiceCopy.sentSelfPaced : voiceCopy.sent}
            </p>
          )}
          {showAnalysis && (
            <VoiceAnalysisPanel
              key={sent.id}
              submissionId={sent.id}
              cohort={context.mode === "send" && context.slot === "enrolment"}
              listenFor={block.compare === "before" ? undefined : block.listenFor}
            />
          )}
        </div>
      )}

      {takes.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={voiceCopy.takesLabel}>
          {takes.map((take, i) => (
            <li key={take.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {voiceCopy.take} {i + 1}
              </p>
              <audio controls preload="metadata" src={take.url} className="w-full" />
              <div className="flex flex-wrap items-center gap-2">
                {mode === "send" && !locked && (
                  <button type="button" onClick={() => send(take.id)} disabled={busy} className={SUBMIT_BUTTON_CLASS}>
                    {failedId === take.id ? voiceCopy.retry : voiceCopy.sendThisTake}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteTake(take.id)}
                  disabled={busy}
                  className={SECONDARY_BUTTON_CLASS}
                  aria-label={`${voiceCopy.deleteTake} ${voiceCopy.take.toLowerCase()} ${i + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {voiceCopy.deleteTake}
                </button>
              </div>
              {sendingId === take.id && (
                <div className="flex flex-col gap-1" role="status">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {voiceCopy.sending} {progress}%
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {phase === "recording" && (
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground" role="status">
          <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
          {voiceCopy.recording} {formatClock(elapsed)} / {formatClock(block.maxSeconds)}
        </p>
      )}

      {phase === "send_failed" && <p className={ERROR_NOTICE_CLASS}>{voiceCopy.uploadFailed}</p>}
      {notice && <p className={notice.error ? ERROR_NOTICE_CLASS : NOTICE_CLASS}>{notice.text}</p>}

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          {phase === "recording" ? (
            <button type="button" onClick={stopRecording} className={`${SUBMIT_BUTTON_CLASS} gap-1.5`}>
              <Square className="size-4" aria-hidden="true" />
              {voiceCopy.stop}
            </button>
          ) : takes.length > 0 || sent ? (
            <button type="button" onClick={startRecording} disabled={busy || full} className={SECONDARY_BUTTON_CLASS}>
              <Mic className="size-4" aria-hidden="true" />
              {voiceCopy.recordAgain}
            </button>
          ) : (
            <button type="button" onClick={startRecording} disabled={busy} className={`${SUBMIT_BUTTON_CLASS} gap-1.5`}>
              <Mic className="size-4" aria-hidden="true" />
              {voiceCopy.record}
            </button>
          )}
        </div>
      )}

      {full && phase !== "recording" && <p className="text-xs text-muted-foreground">{voiceCopy.takesFull}</p>}
      {takes.length > 0 && <p className="text-xs text-muted-foreground">{voiceCopy.takesNote}</p>}
      {mode === "send" && sent && !locked && takes.length > 0 && (
        <p className="text-xs text-muted-foreground">{voiceCopy.resendNote}</p>
      )}
      {mode === "practice" && <p className="text-xs text-muted-foreground">{voiceCopy.practiceNote}</p>}
    </div>
  );
}
