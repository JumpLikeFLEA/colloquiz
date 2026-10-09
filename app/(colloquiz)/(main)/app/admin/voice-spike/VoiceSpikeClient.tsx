"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// VOICE-001 — THROWAWAY recorder matrix page. See page.tsx.

const CANDIDATE_MIMES = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
];

const BITRATES = [0, 16000, 24000, 32000, 48000, 64000, 128000];

const TAKE_LABELS = [
  "(no label)",
  "1: default MIME, 32 kbps, 60 s",
  "2: default MIME, 32 kbps, 30 s, lock/switch midway",
  "3: default MIME, 48 kbps, 30 s",
];

const PROTOCOL = [
  "Copy report BEFORE recording and keep it (environment, header, isTypeSupported).",
  "Take 1: pick label 1, bitrate 32000, default MIME. Speak continuously for 60 s. Stop.",
  "Take 2: label 2, same settings. Record 30 s; midway lock the screen or switch app, return, stop. Note what the log shows.",
  "Take 3: label 3, bitrate 48000, 30 s. Stop.",
  "Play back all three takes (use the Takes list), Download takes 1 and 3, and note any failure.",
  "Copy report again (the second report is the one to send).",
];

// Container from the first bytes of the file, for browsers whose
// MediaRecorder.mimeType / Blob.type come back empty (Firefox 157, 0097).
function sniffContainer(head: Uint8Array): string {
  const hex = Array.from(head.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join(" ");
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  let kind = "unknown";
  if (ascii(0, 4) === "OggS") kind = "ogg";
  else if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) kind = "webm/matroska";
  else if (ascii(4, 8) === "ftyp") kind = `mp4 (brand ${ascii(8, 12)})`;
  else if (ascii(0, 4) === "RIFF") kind = "riff/wav";
  else if (ascii(0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) kind = "mp3/aac";
  return `${kind} [${hex}]`;
}

function readHead(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob.slice(0, 16));
  });
}

type Take = {
  label: string;
  requestedMime: string;
  requestedBps: number;
  recorderMime: string;
  firstChunkMime: string;
  sniffed: string;
  blobMime: string;
  recorderBps: number | null;
  bytes: number;
  seconds: number;
  bytesPerMinute: number;
  effectiveKbps: number;
};

function supportedList(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of CANDIDATE_MIMES) {
    try {
      out[m] =
        typeof MediaRecorder === "undefined"
          ? "no MediaRecorder"
          : String(MediaRecorder.isTypeSupported(m));
    } catch (e) {
      out[m] = `threw: ${(e as Error).name}`;
    }
  }
  return out;
}

export function VoiceSpikeClient() {
  const [env, setEnv] = useState<Record<string, string>>({});
  const [supported, setSupported] = useState<Record<string, string>>({});
  const [mime, setMime] = useState("");
  const [bps, setBps] = useState(0);
  const [label, setLabel] = useState(TAKE_LABELS[0]);
  const [recording, setRecording] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [takes, setTakes] = useState<Take[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState("");
  const [copied, setCopied] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);

  const note = useCallback((msg: string) => {
    setLog((l) => [...l, `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  }, []);

  useEffect(() => {
    // One-time environment probe; setState here is the point of the page.
    /* eslint-disable react-hooks/set-state-in-effect */
    setEnv({
      userAgent: navigator.userAgent,
      secureContext: String(window.isSecureContext),
      getUserMedia: String(!!navigator.mediaDevices?.getUserMedia),
      mediaRecorder: String(typeof MediaRecorder !== "undefined"),
      permissionsPolicyHeader: "fetching…",
    });
    setSupported(supportedList());
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(location.href, { method: "HEAD", cache: "no-store" })
      .then((r) => {
        const v = r.headers.get("permissions-policy");
        setEnv((p) => ({ ...p, permissionsPolicyHeader: v ?? "none set" }));
      })
      .catch((err) =>
        setEnv((p) => ({ ...p, permissionsPolicyHeader: `fetch failed: ${(err as Error).message}` })),
      );
    const onVis = () => note(`visibilitychange -> ${document.visibilityState}`);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [note]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function start() {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      note("getUserMedia: granted");
      stream.getAudioTracks().forEach((t) => {
        t.onmute = () => note("track mute");
        t.onunmute = () => note("track unmute");
        t.onended = () => note("track ended");
      });
      const opts: MediaRecorderOptions = {};
      if (mime) opts.mimeType = mime;
      if (bps) opts.audioBitsPerSecond = bps;
      const rec = new MediaRecorder(stream, opts);
      recorderRef.current = rec;
      let firstChunkMime = "(no chunk)";
      rec.ondataavailable = (ev) => {
        if (ev.data.size) {
          if (!chunksRef.current.length) firstChunkMime = ev.data.type;
          chunksRef.current.push(ev.data);
        }
      };
      rec.onerror = (ev) =>
        note(`recorder error: ${String((ev as unknown as { error?: Error }).error?.name ?? ev.type)}`);
      rec.onpause = () => note("recorder pause");
      rec.onresume = () => note("recorder resume");
      rec.onstop = async () => {
        const seconds = (performance.now() - startedRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        stream.getTracks().forEach((t) => t.stop());
        note(`recorder stop: ${blob.size} bytes, ${seconds.toFixed(1)} s`);
        let sniffed = "(not read)";
        try {
          sniffed = sniffContainer(await readHead(blob));
        } catch (err) {
          sniffed = `sniff failed: ${(err as Error).name}`;
        }
        note(`first chunk type="${firstChunkMime}" sniffed=${sniffed}`);
        setTakes((t) => [
          ...t,
          {
            label,
            requestedMime: mime || "(browser default)",
            requestedBps: bps,
            recorderMime: rec.mimeType,
            firstChunkMime,
            sniffed,
            blobMime: blob.type,
            recorderBps: typeof rec.audioBitsPerSecond === "number" ? rec.audioBitsPerSecond : null,
            bytes: blob.size,
            seconds: Math.round(seconds * 10) / 10,
            bytesPerMinute: seconds > 0 ? Math.round((blob.size / seconds) * 60) : 0,
            effectiveKbps: seconds > 0 ? Math.round((blob.size * 8) / seconds / 100) / 10 : 0,
          },
        ]);
        setUrl(URL.createObjectURL(blob));
        setRecording(false);
      };
      rec.start();
      startedRef.current = performance.now();
      setRecording(true);
      note(`recorder start: mimeType=${rec.mimeType} audioBitsPerSecond=${rec.audioBitsPerSecond}`);
    } catch (err) {
      const e = err as Error;
      note(`FAILED ${e.name}: ${e.message}`);
    }
  }

  function stop() {
    try {
      recorderRef.current?.stop();
    } catch (err) {
      note(`stop threw ${(err as Error).name}`);
    }
  }

  function onPick(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const probe = document.createElement("audio");
    setFileInfo(
      `${f.name} · type="${f.type}" · ${f.size} bytes · canPlayType=${probe.canPlayType(f.type) || "(empty)"}`,
    );
    setUrl(URL.createObjectURL(f));
    note(`picked file ${f.name} (${f.type}, ${f.size} B)`);
    readHead(f)
      .then((h) => note(`picked file sniffed=${sniffContainer(h)}`))
      .catch((err) => note(`picked file sniff failed: ${(err as Error).name}`));
  }

  const reportText = JSON.stringify({ env, supported, takes, log }, null, 2);

  function copy() {
    // writeText can be missing (insecure context) or reject (in-app browsers);
    // both land in the read-only textarea below for a manual select-all.
    const fail = () => setCopied("clipboard blocked: select all in the box below");
    if (!navigator.clipboard?.writeText) return fail();
    navigator.clipboard
      .writeText(reportText)
      .then(() => setCopied("copied"))
      .catch(fail);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">VOICE-001 recorder spike</h1>
        <p className="text-sm text-muted-foreground mt-1">Throwaway. Admin/editor only.</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="font-medium">Protocol (per device and browser)</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          {PROTOCOL.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="font-medium">Environment</h2>
        <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(env, null, 2)}</pre>
        <h2 className="font-medium pt-2">isTypeSupported</h2>
        <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(supported, null, 2)}</pre>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-medium">Record</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Take label
            <select
              className="rounded-md border border-border bg-background px-2 py-1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={recording}
            >
              {TAKE_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            MIME
            <select
              className="rounded-md border border-border bg-background px-2 py-1"
              value={mime}
              onChange={(e) => setMime(e.target.value)}
              disabled={recording}
            >
              <option value="">(browser default)</option>
              {CANDIDATE_MIMES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            audioBitsPerSecond
            <select
              className="rounded-md border border-border bg-background px-2 py-1"
              value={bps}
              onChange={(e) => setBps(Number(e.target.value))}
              disabled={recording}
            >
              {BITRATES.map((b) => (
                <option key={b} value={b}>
                  {b === 0 ? "(not set)" : b}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={start}
            disabled={recording}
            className="cursor-pointer rounded-xl bg-brand px-4 min-h-11 text-white disabled:opacity-50 disabled:pointer-events-none"
          >
            Start
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={!recording}
            className="cursor-pointer rounded-xl border border-border px-4 min-h-11 disabled:opacity-50 disabled:pointer-events-none"
          >
            Stop
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-medium">Playback / cross-playback</h2>
        {url ? (
          <>
            <audio
              key={url}
              controls
              src={url}
              className="w-full"
              onLoadedMetadata={(e) => note(`audio metadata: duration=${e.currentTarget.duration}`)}
              onPlay={() => note("audio play")}
              onError={(e) =>
                note(`audio error code=${e.currentTarget.error?.code} ${e.currentTarget.error?.message ?? ""}`)
              }
            />
            <a href={url} download="voice-spike" className="text-sm text-brand-text underline">
              Download
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing recorded or loaded yet.</p>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Play a file from another device
          <input type="file" accept="audio/*,video/webm,video/mp4,.webm,.mp4,.m4a,.ogg,.wav" onChange={onPick} />
        </label>
        {fileInfo && <p className="text-xs break-all">{fileInfo}</p>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="font-medium">Takes</h2>
        {takes.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(takes, null, 2)}</pre>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="font-medium">Event log</h2>
        <pre className="text-xs whitespace-pre-wrap break-all">{log.join("\n") || "(empty)"}</pre>
        <button type="button" onClick={copy} className="cursor-pointer rounded-xl border border-border px-4 min-h-11">
          Copy report {copied && `(${copied})`}
        </button>
        {copied.startsWith("clipboard blocked") && (
          <textarea
            readOnly
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className="w-full h-32 text-xs rounded-md border border-border bg-background p-2"
            value={reportText}
          />
        )}
      </section>
    </div>
  );
}
