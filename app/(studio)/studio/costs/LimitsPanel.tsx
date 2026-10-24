"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { DateField } from "@/app/components/DateField";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { formatDay } from "@/lib/costs/format";
import { LIMIT_NOTE_MAX } from "@/lib/costs/input";
import type { ResourceRow } from "@/lib/costs/resources";
import { LIMIT_UNITS, type LimitUnit, type ResourceLimit } from "@/lib/costs/types";
import { CARD, ERROR_BOX, ICON_BUTTON, INPUT, LABEL, PILL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./costsClasses";

// OPS-032 (docs/decisions/0207) — plan limits the app cannot read, each with
// a measurement (database, Storage) or the admin's last reading and its date.

type Measured = "none" | "db_bytes" | "storage_bytes";

type Draft = {
  id: string | null;
  provider: string;
  metric: string;
  plan: string;
  limitValue: string;
  unit: LimitUnit;
  measured: Measured;
  manualReading: string;
  readOn: string;
  note: string;
};

const MEASURED_LABELS: Record<Measured, string> = {
  none: "No: I enter a reading",
  db_bytes: "Yes: database size",
  storage_bytes: "Yes: Storage size",
};

const amount = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function draftOf(l: ResourceLimit | null): Draft {
  return {
    id: l?.id ?? null,
    provider: l?.provider ?? "",
    metric: l?.metric ?? "",
    plan: l?.plan ?? "",
    limitValue: l?.limitValue === null || l?.limitValue === undefined ? "" : String(l.limitValue),
    unit: l?.unit ?? "GB",
    measured: l?.measured ?? "none",
    manualReading: l?.manualReading === null || l?.manualReading === undefined ? "" : String(l.manualReading),
    readOn: l?.readOn ?? "",
    note: l?.note ?? "",
  };
}

export function LimitsPanel({ rows }: { rows: ResourceRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<ResourceLimit | null>(null);

  async function remove(l: ResourceLimit) {
    try {
      await postJson("/api/studio/costs", { action: "limit-delete", id: l.id });
      toast.success("Limit deleted.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No plan limits yet. Add the ones on your plans, such as Supabase database size, Storage and egress, or Vercel
          bandwidth.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ limit, used, source, fraction, over }) => (
            <li key={limit.id} className={`${CARD} space-y-2`} data-studio="resource-limit">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground break-words min-w-0">
                      {limit.provider} · {limit.metric}
                    </p>
                    {limit.plan && <span className={`${PILL} bg-muted text-muted-foreground`}>{limit.plan}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {used === null ? "Not read" : `${amount(used)} ${limit.unit}`}
                    {limit.limitValue !== null && ` of ${amount(limit.limitValue)} ${limit.unit}`}
                    {source === "measured" && " · measured now"}
                    {source === "manual" && limit.readOn && ` · read on ${formatDay(limit.readOn)}`}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={`Edit ${limit.provider} ${limit.metric}`}
                    onClick={() => setEditing(draftOf(limit))}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={`${ICON_BUTTON} hover:text-destructive-text`}
                    aria-label={`Delete ${limit.provider} ${limit.metric}`}
                    onClick={() => setDeleting(limit)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              {fraction !== null && (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${over ? "bg-destructive" : fraction >= 0.8 ? "bg-warning" : "bg-brand"}`}
                    style={{ width: `${Math.round(fraction * 100)}%` }}
                  />
                </div>
              )}
              {limit.note && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{limit.note}</p>}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => setEditing(draftOf(null))} className={SECONDARY_BUTTON}>
        <Plus className="size-4" aria-hidden />
        Add a limit
      </button>

      {editing && (
        <LimitDialog
          key={editing.id ?? "new"}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting?.provider} · {deleting?.metric}?
            </AlertDialogTitle>
            <AlertDialogDescription>The limit and its reading go. It can&rsquo;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = deleting;
                setDeleting(null);
                if (target) void remove(target);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LimitDialog({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  const measured = d.measured !== "none";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/studio/costs", {
        action: "limit-save",
        id: d.id,
        provider: d.provider,
        metric: d.metric,
        plan: d.plan,
        limitValue: d.limitValue,
        unit: d.unit,
        measured: measured ? d.measured : null,
        manualReading: measured ? null : d.manualReading,
        readOn: measured ? null : d.readOn || null,
        note: d.note,
      });
      toast.success(d.id ? "Limit saved." : "Limit added.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d.id ? "Edit the limit" : "Add a limit"}</DialogTitle>
          <DialogDescription>
            A limit on one of your plans. The app measures database and Storage size itself; for anything else,
            copy the figure from the provider&rsquo;s dashboard now and then.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="limit-provider" className={LABEL}>
              Provider
            </label>
            <input id="limit-provider" value={d.provider} onChange={(e) => set("provider", e.target.value)} maxLength={40} placeholder="Supabase" className={INPUT} />
          </div>
          <div className="space-y-1">
            <label htmlFor="limit-metric" className={LABEL}>
              What is limited
            </label>
            <input id="limit-metric" value={d.metric} onChange={(e) => set("metric", e.target.value)} maxLength={60} placeholder="Egress" className={INPUT} />
          </div>
          <div className="space-y-1">
            <label htmlFor="limit-plan" className={LABEL}>
              Plan (optional)
            </label>
            <input id="limit-plan" value={d.plan} onChange={(e) => set("plan", e.target.value)} maxLength={40} placeholder="Free" className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <label htmlFor="limit-value" className={LABEL}>
                Limit
              </label>
              <input id="limit-value" inputMode="decimal" value={d.limitValue} onChange={(e) => set("limitValue", e.target.value)} className={INPUT} />
            </div>
            <div className="space-y-1 min-w-0">
              <span className={LABEL}>Unit</span>
              <Select value={d.unit} onValueChange={(v) => set("unit", v as LimitUnit)}>
                <SelectTrigger className="w-full" aria-label="Unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMIT_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <span className={LABEL}>Measured by the app?</span>
            <Select value={d.measured} onValueChange={(v) => set("measured", v as Measured)}>
              <SelectTrigger className="w-full" aria-label="Measured by the app">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MEASURED_LABELS) as Measured[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MEASURED_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {measured && <p className="text-xs text-muted-foreground">A measured size is compared in MB or GB.</p>}
          </div>
          {!measured && (
            <>
              <div className="space-y-1">
                <label htmlFor="limit-reading" className={LABEL}>
                  Last reading (optional)
                </label>
                <input
                  id="limit-reading"
                  inputMode="decimal"
                  value={d.manualReading}
                  onChange={(e) => set("manualReading", e.target.value)}
                  className={INPUT}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="limit-read-on" className={LABEL}>
                  Read on
                </label>
                <DateField id="limit-read-on" value={d.readOn} onChange={(v) => set("readOn", v)} optional className="w-full" />
              </div>
            </>
          )}
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="limit-note" className={LABEL}>
              Note (optional)
            </label>
            <textarea id="limit-note" value={d.note} onChange={(e) => set("note", e.target.value)} maxLength={LIMIT_NOTE_MAX} rows={2} className={INPUT} />
          </div>
        </div>

        {error && <div className={ERROR_BOX}>{error}</div>}

        <DialogFooter className="gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="button" disabled={busy || !d.provider.trim() || !d.metric.trim()} onClick={save} className={PRIMARY_BUTTON}>
            {d.id ? "Save" : "Add"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
