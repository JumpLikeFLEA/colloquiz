"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Ban, CircleStop, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import type { RunPhase } from "@/lib/cohortSchedule";
import type { CourseFormat } from "@/lib/courseAuthoring";
import type { CourseCall, CourseRun } from "@/lib/courseRuns";
import type { CourseRunInvite, InviteEditorState } from "@/lib/runInvites";
import { pluralize } from "@/lib/format";
import { LocalTime, LocalTimeZone } from "../LocalTime";
import { postJson } from "../postJson";
import { CallDialog } from "./CallDialog";
import { InviteDialog, TIER_LABELS } from "./InviteDialog";
import { RunDialog } from "./RunDialog";

// AUTH-010 — the runs page. Composed from the course editor's own classes
// (section cards, row lists, icon buttons, status pills, AlertDialog
// confirms); no new tokens. `phase` only picks which controls a run shows;
// each RPC enforces the same rule and its refusal is toasted.

export type RunWithPhase = CourseRun & { phase: RunPhase; invites: CourseRunInvite[] };

const PHASE_LABEL: Record<RunPhase, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  ended: "Ended",
};

const PHASE_PILL: Record<RunPhase, string> = {
  upcoming: "bg-muted text-muted-foreground",
  in_progress: "bg-brand-subtle text-brand-text",
  ended: "bg-muted text-muted-foreground",
};

// COH-003: an invite's state comes from course_run_invites (059); these
// only name it. Same pill vocabulary as the run phases above.
const INVITE_LABEL: Record<InviteEditorState, string> = {
  pending: "Not claimed",
  claimed: "Claimed",
  expired: "Expired",
  revoked: "Revoked",
};

const INVITE_PILL: Record<InviteEditorState, string> = {
  pending: "bg-muted text-muted-foreground",
  claimed: "bg-brand-subtle text-brand-text",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-muted text-muted-foreground",
};

type Confirm =
  | { kind: "close-run"; run: RunWithPhase }
  | { kind: "delete-run"; run: RunWithPhase }
  | { kind: "delete-call"; call: CourseCall }
  | { kind: "revoke-invite"; invite: CourseRunInvite };

const ICON_BUTTON =
  "cursor-pointer disabled:cursor-not-allowed shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50";

export function RunsView({
  courseId,
  courseTitle,
  format,
  runs,
}: {
  courseId: string;
  courseTitle: string;
  format: CourseFormat;
  runs: RunWithPhase[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [runDialog, setRunDialog] = useState<{ run: RunWithPhase | null } | null>(null);
  const [callDialog, setCallDialog] = useState<{ runId: string; call: CourseCall | null } | null>(null);
  const [inviteDialog, setInviteDialog] = useState<{ runId: string; runTitle: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  async function act(url: string, method: "POST" | "DELETE", success: string) {
    setBusy(true);
    try {
      await postJson(url, {}, method);
      toast.success(success);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function runConfirmed(c: Confirm) {
    if (c.kind === "close-run") {
      act(`/api/admin/courses/${courseId}/runs/${c.run.id}/close`, "POST", "Run closed.");
    } else if (c.kind === "delete-run") {
      act(`/api/admin/courses/${courseId}/runs/${c.run.id}`, "DELETE", "Run deleted.");
    } else if (c.kind === "revoke-invite") {
      act(
        `/api/admin/courses/${courseId}/invites/${c.invite.id}/revoke`,
        "POST",
        c.invite.state === "claimed" ? "Invite revoked. The learner's access to this run has ended." : "Invite revoked.",
      );
    } else {
      act(`/api/admin/courses/${courseId}/calls/${c.call.id}`, "DELETE", "Call deleted.");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/app/admin/courses/${courseId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          {courseTitle}
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-2">Runs and calls</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Times are in your timezone (<LocalTimeZone />
          ).
        </p>
      </div>

      {format !== "cohort" ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          <p>This course is self-paced. Runs exist only on a cohort course.</p>
          <Link href={`/app/admin/courses/${courseId}`} className="text-foreground underline underline-offset-2">
            Set the format on the course page
          </Link>
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Runs <span className="text-muted-foreground font-normal">({pluralize(runs.length, "run")})</span>
            </h2>
            <button
              onClick={() => setRunDialog({ run: null })}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
            >
              <Plus className="size-3.5" />
              New run
            </button>
          </div>

          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
              No runs yet. A run&rsquo;s end follows from the latest week of the course&rsquo;s lessons.
            </div>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
                  <div className="flex-1 min-w-48">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{run.title || "Untitled run"}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${PHASE_PILL[run.phase]}`}>
                        {PHASE_LABEL[run.phase]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Starts <LocalTime iso={run.startsAt} /> · Ends <LocalTime iso={run.endsAt} />
                    </p>
                    {run.phase !== "upcoming" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {run.phase === "in_progress"
                          ? "Started: its start is locked, so no lesson re-locks. It can end early, never later."
                          : "Ended: every lesson is open to this run's learners."}
                      </p>
                    )}
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setRunDialog({ run })}
                      disabled={busy}
                      aria-label={`Edit ${run.title || "run"}`}
                      className={ICON_BUTTON}
                    >
                      <Pencil size={14} />
                    </button>
                    {run.phase === "in_progress" && (
                      <button
                        onClick={() => setConfirm({ kind: "close-run", run })}
                        disabled={busy}
                        aria-label={`Close ${run.title || "run"} now`}
                        title="Close run now"
                        className={ICON_BUTTON}
                      >
                        <CircleStop size={14} />
                      </button>
                    )}
                    {run.phase === "upcoming" && (
                      <button
                        onClick={() => setConfirm({ kind: "delete-run", run })}
                        disabled={busy}
                        aria-label={`Delete ${run.title || "run"}`}
                        className={`${ICON_BUTTON} hover:text-destructive-text`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-border px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-foreground">
                      Calls{" "}
                      <span className="text-muted-foreground font-normal">
                        ({pluralize(run.calls.length, "call")}, extended tier only)
                      </span>
                    </h3>
                    <button
                      onClick={() => setCallDialog({ runId: run.id, call: null })}
                      disabled={busy}
                      className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <Plus className="size-3" />
                      Add call
                    </button>
                  </div>
                  {run.calls.length > 0 && (
                    <div className="rounded-xl border border-border divide-y divide-border">
                      {run.calls.map((call) => (
                        <div key={call.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                          <div className="flex-1 min-w-48">
                            <p className="text-sm text-foreground">
                              <LocalTime iso={call.startsAt} />
                              {call.title ? ` · ${call.title}` : ""}
                            </p>
                            <a
                              href={call.meetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground break-all"
                            >
                              {call.meetUrl}
                              <ExternalLink className="size-3 shrink-0" />
                            </a>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => setCallDialog({ runId: run.id, call })}
                              disabled={busy}
                              aria-label="Edit call"
                              className={ICON_BUTTON}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setConfirm({ kind: "delete-call", call })}
                              disabled={busy}
                              aria-label="Delete call"
                              className={`${ICON_BUTTON} hover:text-destructive-text`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-foreground">
                      Invites{" "}
                      <span className="text-muted-foreground font-normal">
                        ({pluralize(run.invites.length, "invite")})
                      </span>
                    </h3>
                    {run.phase !== "ended" && (
                      <button
                        onClick={() => setInviteDialog({ runId: run.id, runTitle: run.title || "this run" })}
                        disabled={busy}
                        className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        <Plus className="size-3" />
                        New invite
                      </button>
                    )}
                  </div>
                  {run.invites.length > 0 && (
                    <div className="rounded-xl border border-border divide-y divide-border">
                      {run.invites.map((invite) => (
                        <div key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                          <div className="flex-1 min-w-48">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm text-foreground">{invite.inviteeName}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${INVITE_PILL[invite.state]}`}>
                                {INVITE_LABEL[invite.state]}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 break-all">
                              {invite.inviteeContact} · {TIER_LABELS[invite.tier]} ·{" "}
                              {invite.state === "claimed" && invite.claimedAt ? (
                                <>
                                  claimed <LocalTime iso={invite.claimedAt} />
                                </>
                              ) : invite.state === "revoked" && invite.revokedAt ? (
                                <>
                                  revoked <LocalTime iso={invite.revokedAt} />
                                </>
                              ) : (
                                <>
                                  {invite.state === "expired" ? "expired" : "expires"} <LocalTime iso={invite.expiresAt} />
                                </>
                              )}
                            </p>
                          </div>
                          {(invite.state === "pending" || invite.state === "claimed") && (
                            <div className="ml-auto flex shrink-0 items-center gap-1">
                              <button
                                onClick={() => setConfirm({ kind: "revoke-invite", invite })}
                                disabled={busy}
                                aria-label={`Revoke the invite for ${invite.inviteeName}`}
                                title="Revoke"
                                className={`${ICON_BUTTON} hover:text-destructive-text`}
                              >
                                <Ban size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {runDialog && (
        <RunDialog
          courseId={courseId}
          run={runDialog.run}
          onClose={() => setRunDialog(null)}
          onSaved={() => {
            setRunDialog(null);
            router.refresh();
          }}
        />
      )}

      {callDialog && (
        <CallDialog
          courseId={courseId}
          runId={callDialog.runId}
          call={callDialog.call}
          onClose={() => setCallDialog(null)}
          onSaved={() => {
            setCallDialog(null);
            router.refresh();
          }}
        />
      )}

      {inviteDialog && (
        <InviteDialog
          courseId={courseId}
          runId={inviteDialog.runId}
          runTitle={inviteDialog.runTitle}
          onClose={() => setInviteDialog(null)}
          onCreated={() => router.refresh()}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "close-run"
                ? "Close this run now?"
                : confirm?.kind === "delete-run"
                  ? "Delete this run?"
                  : confirm?.kind === "revoke-invite"
                    ? `Revoke the invite for ${confirm.invite.inviteeName}?`
                    : "Delete this call?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "close-run"
                ? "The run ends now, and every lesson opens for its learners. A run can't be reopened or extended afterwards."
                : confirm?.kind === "delete-run"
                  ? "Only a run that hasn't started and that nobody has enrolled in can be deleted."
                  : confirm?.kind === "revoke-invite"
                    ? confirm.invite.state === "claimed"
                      ? "The learner who claimed it loses access to this run. Access through any other run stays. Use this after a refund or a chargeback. It can't be undone; a new invite enrols them again."
                      : "The link stops working. It can't be undone; create a new invite if needed."
                    : "Learners on the extended tier will no longer see it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) runConfirmed(confirm);
                setConfirm(null);
              }}
              className="rounded-xl"
            >
              {confirm?.kind === "close-run" ? "Close run" : confirm?.kind === "revoke-invite" ? "Revoke" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
