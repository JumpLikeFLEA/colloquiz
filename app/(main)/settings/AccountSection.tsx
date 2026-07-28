"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Calendar, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ErrorDialog } from "@/app/components/ErrorDialog";
import {
  AVATAR_ACCEPT,
  AVATAR_BUCKET,
  AVATAR_LIMITS_HINT,
  avatarObjectPath,
  avatarPathFromUrl,
  validateAvatarFile,
} from "@/lib/avatar";
import {
  DISPLAY_NAME_MAX,
  isProfileFormUnchanged,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormValues,
} from "@/lib/profileFields";

export type AccountProfile = {
  full_name: string | null;
  display_name: string | null;
  city: string | null;
  avatar_url: string | null;
  created_at: string;
};

/**
 * The editable identity block.
 *
 * Every write goes straight to Supabase from the browser (profiles is
 * owner-writable under RLS, and the avatars bucket is owner-writable per
 * migration 022), then router.refresh() re-runs the server components — which
 * is how the sidebar picks up a new name or avatar without a full reload.
 */
export function AccountSection({
  userId,
  email,
  profile,
}: {
  userId: string;
  email: string;
  profile: AccountProfile;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const saved: ProfileFormValues = {
    displayName: profile.display_name ?? "",
    fullName: profile.full_name ?? "",
    city: profile.city ?? "",
  };

  const [values, setValues] = useState<ProfileFormValues>(saved);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const unchanged = isProfileFormUnchanged(values, saved);
  const set = (patch: Partial<ProfileFormValues>) => {
    setValues(v => ({ ...v, ...patch }));
    // Clear a field's error as soon as it is touched; re-validated on Save.
    setErrors(e => {
      const next = { ...e };
      for (const key of Object.keys(patch) as (keyof ProfileFormValues)[]) delete next[key];
      return next;
    });
  };

  const initials = (values.displayName || values.fullName || "")
    .split(" ")
    .map(n => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const memberSince = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  async function handleSave() {
    const found = validateProfileForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: values.displayName.trim(),
        full_name: values.fullName.trim() || null,
        city: values.city.trim() || null,
      })
      .eq("id", userId);
    setSaving(false);

    if (error) { setFatalError(error.message); return; }
    toast.success("Profile updated");
    // Re-renders the server tree, so the sidebar's name and avatar update in
    // place. No full reload, and the form keeps its state.
    router.refresh();
  }

  async function handleAvatarPicked(file: File) {
    setAvatarError(null);

    // Checked here so an oversized file never leaves the machine. The bucket
    // enforces the same limits server-side (migration 022) for anything that
    // does not come through this form.
    const reason = validateAvatarFile(file);
    if (reason) { setAvatarError(reason); return; }

    setAvatarBusy(true);
    const supabase = createClient();
    const previousPath = avatarPathFromUrl(profile.avatar_url);
    const path = avatarObjectPath(userId, file.type, crypto.randomUUID());

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setAvatarBusy(false);
      // The bucket's own limits land here too, e.g. if the client check is
      // bypassed or the two ever drift apart.
      setAvatarError(uploadError.message);
      return;
    }

    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const { error: dbError } = await supabase
      .from("profiles")
      .update({ avatar_url: pub.publicUrl })
      .eq("id", userId);

    if (dbError) {
      // The row still points at the old avatar, so drop the object we just
      // uploaded rather than leaving an orphan in the bucket.
      await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      setAvatarBusy(false);
      setFatalError(dbError.message);
      return;
    }

    // Best-effort cleanup of the replaced object. A failure here costs a stray
    // file, not correctness, so it never surfaces as an error.
    if (previousPath) await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);

    setAvatarBusy(false);
    toast.success("Avatar updated");
    router.refresh();
  }

  async function handleAvatarRemove() {
    setAvatarError(null);
    setAvatarBusy(true);
    const supabase = createClient();
    const path = avatarPathFromUrl(profile.avatar_url);

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", userId);
    if (error) {
      setAvatarBusy(false);
      setFatalError(error.message);
      return;
    }
    if (path) await supabase.storage.from(AVATAR_BUCKET).remove([path]);

    setAvatarBusy(false);
    toast.success("Avatar removed");
    router.refresh();
  }

  return (
    <div className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-6">
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand to-brand-accent flex items-center justify-center text-white text-2xl font-medium select-none shrink-0 overflow-hidden">
          {profile.avatar_url
            ? <Image src={profile.avatar_url} alt="" width={80} height={80} className="w-full h-full object-cover" />
            : initials}
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={avatarBusy}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-subtle text-brand-text hover:bg-[#e0e7ff] transition-colors text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {avatarBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {profile.avatar_url ? "Replace" : "Upload"}
            </button>
            {profile.avatar_url && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={avatarBusy}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={15} />
                Remove
              </button>
            )}
          </div>
          {/* The limits are stated BEFORE the picker opens, not after a rejection. */}
          <p className="text-xs text-muted-foreground">{AVATAR_LIMITS_HINT}</p>
          {avatarError && <p className="text-xs text-destructive">{avatarError}</p>}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            // Reset first, so picking the same file twice still fires onChange.
            e.target.value = "";
            if (file) void handleAvatarPicked(file);
          }}
        />
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-4 pt-5 border-t border-border">
        <SettingsField
          id="display-name"
          label="Display name"
          hint={`Shown on leaderboards and to other players. Up to ${DISPLAY_NAME_MAX} characters.`}
          value={values.displayName}
          onChange={v => set({ displayName: v })}
          error={errors.displayName}
          maxLength={DISPLAY_NAME_MAX}
        />
        <SettingsField
          id="full-name"
          label="Name"
          hint="Used on group rosters and quiz attribution. Never shown on leaderboards."
          value={values.fullName}
          onChange={v => set({ fullName: v })}
          error={errors.fullName}
        />
        <SettingsField
          id="city"
          label="City"
          hint="Optional."
          value={values.city}
          onChange={v => set({ city: v })}
          error={errors.city}
        />

        {/* Email — read-only on purpose (see the note). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="account-email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <div className="relative">
            <input
              id="account-email"
              value={email}
              readOnly
              disabled
              className="w-full px-3 py-2 pr-9 rounded-xl border border-border bg-muted text-sm text-muted-foreground cursor-not-allowed"
            />
            <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">
            Changing your email isn’t available yet — it needs a confirmation sent to the
            new address before it can take effect. Contact support if you need it changed.
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
          <Calendar size={13} />
          <span>Member since {memberSince}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || unchanged}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          Save changes
        </button>
        {!unchanged && !saving && (
          <button
            type="button"
            onClick={() => { setValues(saved); setErrors({}); }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Discard
          </button>
        )}
      </div>

      <ErrorDialog
        open={fatalError !== null}
        onClose={() => setFatalError(null)}
        description={fatalError ?? ""}
      />
    </div>
  );
}

function SettingsField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  maxLength,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        className={`w-full px-3 py-2 rounded-xl border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30 ${
          error ? "border-destructive" : "border-border"
        }`}
      />
      <p id={`${id}-hint`} className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
        {error ?? hint}
      </p>
    </div>
  );
}
