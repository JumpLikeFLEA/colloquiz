"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/app/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { cn } from "@/lib/utils";
import { displayDate, formatDateValue, parseDateValue } from "@/lib/dateField";

// A date field drawn by the app instead of the browser's picker: a button in
// the inputs' own look that opens the shared Calendar in a popover. The value
// is the "YYYY-MM-DD" string the native date input used to produce
// (lib/dateField.ts), so callers keep their state as it was. `id` goes on the
// button, so an existing <label htmlFor> still names it.
export function DateField({
  id,
  value,
  onChange,
  disabled = false,
  optional = false,
  placeholder = "Pick a date",
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value) ?? undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 disabled:cursor-not-allowed",
            selected ? "text-foreground" : "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{selected ? displayDate(selected) : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) onChange(formatDateValue(date));
            setOpen(false);
          }}
          autoFocus
        />
        {optional && selected && (
          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
