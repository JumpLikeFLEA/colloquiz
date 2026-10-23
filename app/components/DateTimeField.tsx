"use client";

import { useState } from "react";
import { DateField } from "@/app/components/DateField";
import { joinDateTime, parseTimeText, splitDateTime } from "@/lib/dateField";

// A date and a typed 24-hour time, replacing <input type="datetime-local">.
// The value is the same "YYYY-MM-DDTHH:mm" wall-clock string
// (fromLocalDateTime, lib/cohortSchedule.ts, reads it), emitted only when
// both halves are valid and "" otherwise, so a caller's "is it filled in"
// check is unchanged. The halves are kept here, so a half-typed time is not
// lost on the way. Read once on mount: every caller mounts it inside a
// dialog that is rendered only while open.
export function DateTimeField({
  id,
  value,
  onChange,
  timeLabel,
  disabled = false,
  optional = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the time box, e.g. "Start time". */
  timeLabel: string;
  disabled?: boolean;
  optional?: boolean;
}) {
  const initial = splitDateTime(value);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [timeTouched, setTimeTouched] = useState(false);

  function update(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    onChange(joinDateTime(nextDate, nextTime));
  }

  const timeValid = parseTimeText(time) !== null;
  const hint =
    date && !timeValid && (timeTouched || time !== "")
      ? "Enter the time as HH:MM, e.g. 19:00."
      : !date && timeValid
        ? "Pick a date as well."
        : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <DateField
          id={id}
          value={date}
          disabled={disabled}
          optional={optional}
          onChange={(next) => update(next, next ? time : "")}
          className="flex-1 min-w-40"
        />
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="HH:MM"
          maxLength={5}
          value={time}
          disabled={disabled}
          aria-label={timeLabel}
          aria-invalid={hint ? true : undefined}
          onChange={(e) => update(date, e.target.value)}
          onBlur={() => {
            setTimeTouched(true);
            const normalised = parseTimeText(time);
            if (normalised && normalised !== time) update(date, normalised);
          }}
          className="w-24 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand aria-invalid:border-destructive-border disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
      {hint && <p className="text-xs text-destructive-text">{hint}</p>}
    </div>
  );
}
