// The string contracts Studio's date fields keep: a date is "YYYY-MM-DD"
// (what <input type="date"> produced) and a date with a time is
// "YYYY-MM-DDTHH:mm" (what <input type="datetime-local"> produced, read by
// fromLocalDateTime in lib/cohortSchedule.ts). The picker components in
// app/components/DateField.tsx and DateTimeField.tsx convert to and from
// these, so the callers did not change when the native inputs went.

const DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_TEXT = /^(\d{1,2}):(\d{2})$/;
const DATE_TIME_VALUE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** "YYYY-MM-DD" to a local-midnight Date; null for anything else, incl. 2026-02-30. */
export function parseDateValue(value: string): Date | null {
  const m = DATE_VALUE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** A Date's local calendar day as "YYYY-MM-DD". */
export function formatDateValue(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Typed time ("9:05", "09:05", " 19:00 ") to "HH:mm"; null when not a real 24-hour time. */
export function parseTimeText(text: string): string | null {
  const m = TIME_TEXT.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
}

/** "YYYY-MM-DDTHH:mm" into its date and time halves; both "" when it isn't one. */
export function splitDateTime(value: string): { date: string; time: string } {
  const m = DATE_TIME_VALUE.exec(value);
  return m ? { date: m[1], time: m[2] } : { date: "", time: "" };
}

/** The two halves back to "YYYY-MM-DDTHH:mm"; "" unless both are valid. */
export function joinDateTime(date: string, timeText: string): string {
  const time = parseTimeText(timeText);
  if (!parseDateValue(date) || !time) return "";
  return `${date}T${time}`;
}

/** "20 Oct 2026", Studio's date wording. */
export function displayDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
