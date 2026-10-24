"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { formatMonth } from "@/lib/costs/format";
import { CARD, LABEL, PRIMARY_BUTTON } from "./costsClasses";

// OPS-033 (docs/decisions/0207 Decision 8) — the sponsor report: a PDF of the
// expenses and the usage estimate for a run of months. The link is a plain
// download; /api/studio/costs/report is admin-only and checks the period.

export function SponsorReportCard({ months, defaultMonth }: { months: string[]; defaultMonth: string }) {
  const [from, setFrom] = useState(defaultMonth);
  const [to, setTo] = useState(defaultMonth);
  const reversed = from > to;

  return (
    <section className={`${CARD} space-y-3`}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Sponsor report</h2>
        <p className="text-sm text-muted-foreground">
          A PDF with what was paid by month and category, every expense with its reference, and the usage estimate
          with how it is calculated. It has no learner data.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MonthSelect label="From" value={from} months={months} onChange={setFrom} />
        <MonthSelect label="To" value={to} months={months} onChange={setTo} />
      </div>
      {reversed && <p className="text-xs text-destructive-text">&ldquo;From&rdquo; must not be after &ldquo;To&rdquo;.</p>}
      <a
        href={reversed ? undefined : `/api/studio/costs/report?from=${from}&to=${to}`}
        aria-disabled={reversed}
        className={`${PRIMARY_BUTTON} min-h-11 ${reversed ? "opacity-50 pointer-events-none" : ""}`}
      >
        <FileDown className="size-4" aria-hidden />
        Download PDF
      </a>
    </section>
  );
}

function MonthSelect({ label, value, months, onChange }: { label: string; value: string; months: string[]; onChange: (m: string) => void }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className={LABEL}>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full min-h-11" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m}>
              {formatMonth(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
