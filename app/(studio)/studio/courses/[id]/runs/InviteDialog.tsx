"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { invitePath, type InviteTier } from "@/lib/runInvites";
import { postJson } from "../postJson";

// COH-003 — create an invite for one run (create_run_invite, 059,
// docs/decisions/0107). The name and contact are the "contact label": only
// editors of the course ever see them. The link is shown ONCE: the database
// keeps only a hash of the token, so it can't be shown again. A lost link
// is revoked and replaced, not recovered.
// The RPC validates everything; the field hints only say what it accepts.

export const TIER_LABELS: Record<InviteTier, string> = {
  basic: "Basic",
  extended: "Extended (calls)",
};

const INPUT_CLASS = "px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none";

export function InviteDialog({
  courseId,
  runId,
  runTitle,
  onClose,
  onCreated,
}: {
  courseId: string;
  runId: string;
  runTitle: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [tier, setTier] = useState<InviteTier>("basic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const data = await postJson(`/api/admin/courses/${courseId}/runs/${runId}/invites`, {
        tier,
        name: name.trim(),
        contact: contact.trim(),
      });
      setLink(`${window.location.origin}${invitePath(data.token)}`);
      // The list behind the dialog refreshes now; the link stays on screen
      // until the editor closes the dialog.
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invite.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link ? "Invite link" : "New invite"}</DialogTitle>
          <DialogDescription>
            {link
              ? `Send this link to ${name.trim()}. It works once, for one account, and expires in 30 days or when the run ends. It can't be shown again, so copy it now.`
              : `For ${runTitle}. The name and contact are for you: only the course's editors see them.`}
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
              className={`flex-1 ${INPUT_CLASS}`}
            />
            <button
              onClick={copy}
              className="cursor-pointer flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="invite-name" className="text-xs font-medium text-foreground">
                Name
              </label>
              <input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="invite-contact" className="text-xs font-medium text-foreground">
                Contact
              </label>
              <input
                id="invite-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="name@example.com or @telegram_username"
                maxLength={254}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">Tier</span>
              <Select value={tier} onValueChange={(v) => setTier(v as InviteTier)}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIER_LABELS) as InviteTier[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIER_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && (
              <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {link ? (
            <button
              onClick={onClose}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={saving || !name.trim() || !contact.trim()}
                className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {saving ? "Creating…" : "Create invite"}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
