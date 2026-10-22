import { voiceCopy } from "../alliengll/voiceCopy";
import type { VoiceCap } from "./analysisCaps";

/**
 * The line the recorder shows when a send is refused for a cap (VOICE-014,
 * docs/decisions/0189; the cap itself is 0185). Pure: the caller passes how a time is
 * written, so a test does not depend on the machine's zone.
 */
export function capNoticeText(cap: VoiceCap, formatTime: (iso: string) => string): string {
  if (cap.kind === "task_cap") return `${voiceCopy.capNotSent} ${voiceCopy.capTask}`;
  const when = cap.retryAt ? `${voiceCopy.capDailyRetry} ${formatTime(cap.retryAt)}.` : voiceCopy.capDailyLater;
  return `${voiceCopy.capNotSent} ${voiceCopy.capDaily} ${when}`;
}
