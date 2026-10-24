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
import { formatDay, formatUsd } from "@/lib/costs/format";
import { NOTE_MAX, REFERENCE_MAX, VENDOR_MAX } from "@/lib/costs/input";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, PROVIDER_LABELS, type Expense, type ExpenseCategory } from "@/lib/costs/types";
import type { UsageProvider } from "@/lib/costs/usageEvent";
import { CARD, ERROR_BOX, ICON_BUTTON, INPUT, LABEL, PILL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./costsClasses";

// OPS-032 (docs/decisions/0207) — the month's bills and credit top-ups, with
// add, edit and delete. Whether a write is allowed is the RPCs' call (105);
// this relays the route's message.

type Draft = {
  id: string | null;
  incurredOn: string;
  vendor: string;
  category: ExpenseCategory;
  kind: Expense["kind"];
  creditProvider: UsageProvider;
  amountUsd: string;
  periodStart: string;
  periodEnd: string;
  reference: string;
  note: string;
};

function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function draftOf(e: Expense | null, defaultDay: string | null): Draft {
  if (!e) {
    return {
      id: null,
      incurredOn: defaultDay ?? todayValue(),
      vendor: "",
      category: "hosting",
      kind: "bill",
      creditProvider: "anthropic",
      amountUsd: "",
      periodStart: "",
      periodEnd: "",
      reference: "",
      note: "",
    };
  }
  return {
    id: e.id,
    incurredOn: e.incurredOn,
    vendor: e.vendor,
    category: e.category,
    kind: e.kind,
    creditProvider: e.creditProvider ?? "anthropic",
    amountUsd: e.amountUsd.toFixed(2),
    periodStart: e.periodStart ?? "",
    periodEnd: e.periodEnd ?? "",
    reference: e.reference ?? "",
    note: e.note ?? "",
  };
}

export function ExpensesPanel({ expenses, defaultDay }: { expenses: Expense[]; defaultDay: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  async function remove(e: Expense) {
    try {
      await postJson("/api/studio/costs", { action: "expense-delete", id: e.id });
      toast.success("Expense deleted.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditing(draftOf(null, defaultDay))} className={SECONDARY_BUTTON}>
        <Plus className="size-4" aria-hidden />
        Add an expense
      </button>

      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No bills or top-ups entered for this month.
        </p>
      ) : (
        <ul className={`${CARD} divide-y divide-border p-0`}>
          {expenses.map((e) => (
            <li key={e.id} className="flex items-start gap-2 px-4 py-3" data-studio="expense">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground break-words min-w-0">{e.vendor}</p>
                  <span className={`${PILL} bg-muted text-muted-foreground`}>{CATEGORY_LABELS[e.category]}</span>
                  {e.kind === "credit_topup" && e.creditProvider && (
                    <span className={`${PILL} bg-brand-subtle text-brand-text`}>Top-up · {PROVIDER_LABELS[e.creditProvider]}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDay(e.incurredOn)}
                  {e.periodStart && e.periodEnd && ` · for ${formatDay(e.periodStart)} to ${formatDay(e.periodEnd)}`}
                </p>
                {e.reference && <p className="text-xs text-muted-foreground break-all">Ref. {e.reference}</p>}
                {e.note && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{e.note}</p>}
              </div>
              <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums pt-0.5">{formatUsd(e.amountUsd)}</span>
              <div className="flex shrink-0">
                <button type="button" className={ICON_BUTTON} aria-label={`Edit ${e.vendor}`} onClick={() => setEditing(draftOf(e, defaultDay))}>
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${ICON_BUTTON} hover:text-destructive-text`}
                  aria-label={`Delete ${e.vendor}`}
                  onClick={() => setDeleting(e)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ExpenseDialog
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
            <AlertDialogTitle>Delete {deleting?.vendor}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${formatUsd(deleting.amountUsd)} on ${formatDay(deleting.incurredOn)}. `}
              It leaves the totals and the sponsor report. It can&rsquo;t be undone; add it again if needed.
            </AlertDialogDescription>
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

function ExpenseDialog({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/studio/costs", {
        action: "expense-save",
        id: d.id,
        incurredOn: d.incurredOn,
        vendor: d.vendor,
        category: d.category,
        kind: d.kind,
        creditProvider: d.kind === "credit_topup" ? d.creditProvider : null,
        amountUsd: d.amountUsd,
        periodStart: d.periodStart || null,
        periodEnd: d.periodEnd || null,
        reference: d.reference,
        note: d.note,
      });
      toast.success(d.id ? "Expense saved." : "Expense added.");
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
          <DialogTitle>{d.id ? "Edit the expense" : "Add an expense"}</DialogTitle>
          <DialogDescription>
            A bill or a credit top-up, in USD, as on the invoice. Paid in another currency: enter the USD amount and
            the original in the note.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="expense-day" className={LABEL}>
              Date paid
            </label>
            <DateField id="expense-day" value={d.incurredOn} onChange={(v) => set("incurredOn", v)} className="w-full" />
          </div>
          <div className="space-y-1">
            <label htmlFor="expense-amount" className={LABEL}>
              Amount (USD)
            </label>
            <input
              id="expense-amount"
              inputMode="decimal"
              value={d.amountUsd}
              onChange={(e) => set("amountUsd", e.target.value)}
              placeholder="20.00"
              className={INPUT}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="expense-vendor" className={LABEL}>
              Vendor
            </label>
            <input
              id="expense-vendor"
              value={d.vendor}
              onChange={(e) => set("vendor", e.target.value)}
              maxLength={VENDOR_MAX}
              placeholder="Vercel, Supabase, Anthropic…"
              className={INPUT}
            />
          </div>
          <div className="space-y-1">
            <span className={LABEL}>Category</span>
            <Select value={d.category} onValueChange={(v) => set("category", v as ExpenseCategory)}>
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className={LABEL}>Kind</span>
            <Select value={d.kind} onValueChange={(v) => set("kind", v as Expense["kind"])}>
              <SelectTrigger className="w-full" aria-label="Kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bill">Bill</SelectItem>
                <SelectItem value="credit_topup">Credit top-up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {d.kind === "credit_topup" && (
            <div className="space-y-1 sm:col-span-2">
              <span className={LABEL}>Credit for</span>
              <Select value={d.creditProvider} onValueChange={(v) => set("creditProvider", v as UsageProvider)}>
                <SelectTrigger className="w-full" aria-label="Credit for">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">{PROVIDER_LABELS.anthropic}</SelectItem>
                  <SelectItem value="assemblyai">{PROVIDER_LABELS.assemblyai}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The credit left is estimated from this and the app&rsquo;s usage.</p>
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="expense-from" className={LABEL}>
              Covers from (optional)
            </label>
            <DateField id="expense-from" value={d.periodStart} onChange={(v) => set("periodStart", v)} optional className="w-full" />
          </div>
          <div className="space-y-1">
            <label htmlFor="expense-to" className={LABEL}>
              Covers to (optional)
            </label>
            <DateField id="expense-to" value={d.periodEnd} onChange={(v) => set("periodEnd", v)} optional className="w-full" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="expense-ref" className={LABEL}>
              Invoice number or link (optional)
            </label>
            <input
              id="expense-ref"
              value={d.reference}
              onChange={(e) => set("reference", e.target.value)}
              maxLength={REFERENCE_MAX}
              className={INPUT}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="expense-note" className={LABEL}>
              Note (optional)
            </label>
            <textarea
              id="expense-note"
              value={d.note}
              onChange={(e) => set("note", e.target.value)}
              maxLength={NOTE_MAX}
              rows={2}
              className={INPUT}
            />
            <p className="text-xs text-muted-foreground">Shown in the sponsor report.</p>
          </div>
        </div>

        {error && <div className={ERROR_BOX}>{error}</div>}

        <DialogFooter className="gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="button" disabled={busy || !d.vendor.trim() || !d.amountUsd.trim()} onClick={save} className={PRIMARY_BUTTON}>
            {d.id ? "Save" : "Add"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
