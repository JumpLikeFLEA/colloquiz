"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Home, Pencil, Plus, Snowflake } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  expiryFromDateInput,
  extendedDate,
  SEAT_NAME_MAX_LENGTH,
  SEAT_NOTES_MAX_LENGTH,
  seatState,
  type SeatRow,
  type SeatState,
} from "@/lib/authorSeats";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";

// TCH-007 (docs/decisions/0154) — the admin's seat list: one card per seat,
// an add form, and edit / extend / freeze / house-seat actions. Composed from
// the student-link panel's and groups page's classes and tokens; no new
// colours. Whether a seat is active, and every refusal, is decided in SQL
// (082); this shows `is_active` and relays the message.

const PRIMARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const SECONDARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const INPUT = "w-full min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground";
const PILL = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

const STATE_PILL: Record<SeatState["tone"], string> = {
  open: "bg-brand-subtle text-brand-text",
  active: "bg-brand-subtle text-brand-text",
  soon: "bg-warning-subtle text-warning",
  lapsed: "bg-destructive-subtle text-destructive-text",
};

const NOTES_HINT = "Private to admins. Included in the teacher's data export if they ask for it.";

export function SeatsManager({ seats }: { seats: SeatRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SeatRow | null>(null);
  const [extending, setExtending] = useState<SeatRow | null>(null);
  const [freezing, setFreezing] = useState<SeatRow | null>(null);

  async function act(body: Record<string, unknown>, done: string) {
    try {
      await postJson("/api/studio/authors", body);
      toast.success(done);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the seat.");
      return false;
    }
  }

  return (
    <div className="space-y-6">
      <AddSeatForm onAdded={() => router.refresh()} />

      {seats.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No seats yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {seats.map((seat) => (
            <SeatCard
              key={seat.userId}
              seat={seat}
              onEdit={() => setEditing(seat)}
              onExtend={() => setExtending(seat)}
              onFreeze={() => setFreezing(seat)}
              onToggleHouse={() =>
                act(
                  { action: "kind", userId: seat.userId, kind: seat.kind === "house" ? "teacher" : "house" },
                  seat.kind === "house" ? "Now a regular seat." : "Marked as the house seat.",
                )
              }
            />
          ))}
        </ul>
      )}

      {editing && (
        <EditDialog
          key={editing.userId}
          seat={editing}
          onClose={() => setEditing(null)}
          onSave={async (publicName, notes) => {
            const ok = await act({ action: "update", userId: editing.userId, publicName, notes }, "Seat saved.");
            if (ok) setEditing(null);
          }}
        />
      )}
      {extending && (
        <ExtendDialog
          key={extending.userId}
          seat={extending}
          onClose={() => setExtending(null)}
          onSave={async (expiresAt) => {
            const ok = await act(
              { action: "expiry", userId: extending.userId, expiresAt },
              expiresAt ? "Seat extended." : "Seat is now open-ended.",
            );
            if (ok) setExtending(null);
          }}
        />
      )}
      <AlertDialog open={freezing !== null} onOpenChange={(open) => !open && setFreezing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Freeze the seat of {freezing?.publicName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The seat ends now. They can no longer create courses; anything they already published stays playable and
              nobody loses access they have. You can extend the seat again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = freezing;
                setFreezing(null);
                if (target) void act({ action: "freeze", userId: target.userId }, "Seat frozen.");
              }}
            >
              Freeze now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SeatCard({
  seat,
  onEdit,
  onExtend,
  onFreeze,
  onToggleHouse,
}: {
  seat: SeatRow;
  onEdit: () => void;
  onExtend: () => void;
  onFreeze: () => void;
  onToggleHouse: () => void;
}) {
  const state = seatState(seat);
  return (
    <li className="rounded-2xl border border-border bg-card px-4 py-3 space-y-3" data-studio="author-seat">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground break-words min-w-0">{seat.publicName}</h2>
          <span
            className={`${PILL} ${seat.kind === "house" ? "bg-brand-subtle text-brand-text" : "bg-muted text-muted-foreground"}`}
          >
            {seat.kind === "house" ? "House" : "Teacher"}
          </span>
          <span className={`${PILL} ${STATE_PILL[state.tone]}`}>{state.label}</span>
        </div>
        <p className="text-sm text-muted-foreground break-all">{seat.contact || "No email on record"}</p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{seat.isActive ? "Expires" : "Lapsed"}</dt>
          <dd className="text-foreground">
            {seat.expiresAt ? <LocalTime iso={seat.expiresAt} dateOnly /> : "No expiry"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Courses</dt>
          <dd className="text-foreground">{seat.courses}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Linked students</dt>
          <dd className="text-foreground">{seat.linkedStudents}</dd>
        </div>
      </dl>

      {seat.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{seat.notes}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={SECONDARY_BUTTON}>
          <Pencil className="size-4" aria-hidden />
          Edit
        </button>
        <button type="button" onClick={onExtend} className={SECONDARY_BUTTON}>
          <CalendarPlus className="size-4" aria-hidden />
          Extend
        </button>
        {seat.isActive && (
          <button type="button" onClick={onFreeze} className={SECONDARY_BUTTON}>
            <Snowflake className="size-4" aria-hidden />
            Freeze now
          </button>
        )}
        <button type="button" onClick={onToggleHouse} className={SECONDARY_BUTTON}>
          <Home className="size-4" aria-hidden />
          {seat.kind === "house" ? "Make a regular seat" : "Mark as house seat"}
        </button>
      </div>
    </li>
  );
}

function AddSeatForm({ onAdded }: { onAdded: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [until, setUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const expiresAt = until ? expiryFromDateInput(until) : null;
    if (until && !expiresAt) {
      toast.error("That is not a valid date.");
      return;
    }
    setBusy(true);
    try {
      await postJson("/api/studio/authors", { action: "add", email, publicName: name, expiresAt, notes });
      toast.success("Seat added.");
      setEmail("");
      setName("");
      setUntil("");
      setNotes("");
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the seat.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card px-4 py-3 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Add a teacher</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="seat-email" className="text-xs text-muted-foreground">
            Their account&apos;s email
          </label>
          <input
            id="seat-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="seat-name" className="text-xs text-muted-foreground">
            Public name (optional)
          </label>
          <input
            id="seat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={SEAT_NAME_MAX_LENGTH}
            placeholder="Defaults to their public handle"
            className={INPUT}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="seat-until" className="text-xs text-muted-foreground">
            Through (optional, blank = no expiry)
          </label>
          <input id="seat-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={INPUT} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="seat-notes" className="text-xs text-muted-foreground">
            Notes (optional)
          </label>
          <textarea
            id="seat-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={SEAT_NOTES_MAX_LENGTH}
            rows={2}
            className={INPUT}
          />
          <p className="text-xs text-muted-foreground">{NOTES_HINT}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !email.trim()} className={PRIMARY_BUTTON}>
          <Plus className="size-4" aria-hidden />
          Add seat
        </button>
        <p className="text-xs text-muted-foreground min-w-0">
          The teacher needs an account first. Add an external teacher only once the teacher terms (OPS-025) are decided.
        </p>
      </div>
    </form>
  );
}

function EditDialog({
  seat,
  onClose,
  onSave,
}: {
  seat: SeatRow;
  onClose: () => void;
  onSave: (publicName: string, notes: string) => Promise<void>;
}) {
  const [name, setName] = useState(seat.publicName);
  const [notes, setNotes] = useState(seat.notes ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit seat</DialogTitle>
          <DialogDescription className="break-all">{seat.contact}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="edit-seat-name" className="text-xs text-muted-foreground">
              Public name
            </label>
            <input
              id="edit-seat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={SEAT_NAME_MAX_LENGTH}
              className={INPUT}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-seat-notes" className="text-xs text-muted-foreground">
              Notes
            </label>
            <textarea
              id="edit-seat-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={SEAT_NOTES_MAX_LENGTH}
              rows={4}
              className={INPUT}
            />
            <p className="text-xs text-muted-foreground">{NOTES_HINT}</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              await onSave(name, notes);
              setBusy(false);
            }}
            className={PRIMARY_BUTTON}
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EXTEND_PRESETS: { label: string; months: number }[] = [
  { label: "+1 month", months: 1 },
  { label: "+3 months", months: 3 },
  { label: "+12 months", months: 12 },
];

function ExtendDialog({
  seat,
  onClose,
  onSave,
}: {
  seat: SeatRow;
  onClose: () => void;
  onSave: (expiresAt: string | null) => Promise<void>;
}) {
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const expiresAt = until ? expiryFromDateInput(until) : null;

  async function save(value: string | null) {
    setBusy(true);
    await onSave(value);
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extend the seat of {seat.publicName}</DialogTitle>
          <DialogDescription>
            {seat.expiresAt ? (
              <>
                {seat.isActive ? "Currently through " : "Lapsed on "}
                <LocalTime iso={seat.expiresAt} dateOnly />.
              </>
            ) : (
              "Currently open-ended."
            )}{" "}
            The buttons fill in a date; you still confirm it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {EXTEND_PRESETS.map((p) => (
              <button
                key={p.months}
                type="button"
                onClick={() => setUntil(extendedDate(seat, p.months, new Date()))}
                className={SECONDARY_BUTTON}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <label htmlFor="extend-until" className="text-xs text-muted-foreground">
              Through
            </label>
            <input id="extend-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={INPUT} />
            {until && !expiresAt && <p className="text-xs text-destructive-text">That is not a valid date.</p>}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <button type="button" disabled={busy} onClick={() => save(null)} className={SECONDARY_BUTTON}>
            No expiry
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="button" disabled={busy || !expiresAt} onClick={() => save(expiresAt)} className={PRIMARY_BUTTON}>
              Set date
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
