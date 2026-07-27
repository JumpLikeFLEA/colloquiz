"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, MapPin, Edit3 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ErrorDialog } from "@/app/components/ErrorDialog";

// Account renders the identity block below; the other two are still stubs.
const PLACEHOLDER_SECTIONS = [
  {
    id: "appearance",
    title: "Appearance",
    description: "Theme preference.",
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Notification preferences.",
  },
] as const;

type SettingsViewProps = {
  userId: string;
  email: string;
  profile: {
    full_name: string | null;
    display_name: string | null;
    city: string | null;
    created_at: string;
  };
};

export function SettingsView({ userId, email, profile }: SettingsViewProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [formFullName, setFormFullName] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formPublicName, setFormPublicName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const displayName = profile.full_name ?? profile.display_name ?? "";
  const initials = displayName
    .split(" ")
    .map(n => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const memberSince = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  function enterEdit() {
    setFormFullName(profile.full_name ?? profile.display_name ?? "");
    setFormCity(profile.city ?? "");
    // Seed the public name from the real name only as a starting point — it is
    // stored separately so changing one never changes the other.
    setFormPublicName(profile.display_name ?? profile.full_name ?? "");
    setEditing(true);
  }

  async function handleSave() {
    const supabase = createClient();
    // display_name is the only name shown on leaderboards; full_name never
    // leaves the surfaces that already showed it (rosters, attribution).
    const publicName = formPublicName.trim();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: formFullName,
        city: formCity,
        ...(publicName && { display_name: publicName }),
      })
      .eq("id", userId);
    if (error) { setSaveError(error.message); return; }
    router.refresh();
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, appearance, and notifications</p>
      </div>

      {/* Account */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-foreground">Account</h2>
          <p className="text-muted-foreground mt-1 text-sm">Your avatar, name, email, and location.</p>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div className="flex flex-col items-center gap-3 flex-1 max-w-xs mx-auto">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-2xl font-medium select-none">
                  {initials}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-card" title="Online" />
              </div>

              {editing ? (
                <div className="w-full flex flex-col gap-2">
                  <input
                    value={formFullName}
                    onChange={e => setFormFullName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
                  />
                  <p className="text-xs text-muted-foreground text-center py-1.5">{email}</p>
                  <input
                    value={formPublicName}
                    onChange={e => setFormPublicName(e.target.value)}
                    placeholder="Public name"
                    aria-label="Public name, shown on leaderboards"
                    className="w-full px-3 py-1.5 rounded-lg border border-border text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
                  />
                  <p className="text-xs text-muted-foreground text-center leading-snug">
                    Shown on leaderboards
                  </p>
                  <input
                    value={formCity}
                    onChange={e => setFormCity(e.target.value)}
                    placeholder="City"
                    className="w-full px-3 py-1.5 rounded-lg border border-border text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
                  />
                  <button
                    onClick={handleSave}
                    className="w-full py-1.5 rounded-lg bg-[#4f46e5] text-white text-xs font-medium hover:bg-[#4338ca] transition-colors cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-medium text-foreground">{displayName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => editing ? setEditing(false) : enterEdit()}
              aria-label={editing ? "Cancel editing profile" : "Edit profile"}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer shrink-0"
            >
              <Edit3 size={14} className="text-muted-foreground" />
            </button>
          </div>

          {/* Profile info */}
          <div className="flex flex-col gap-2 pt-3 border-t border-border">
            {profile.city && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin size={13} />
                <span>{profile.city}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar size={13} />
              <span>Member since {memberSince}</span>
            </div>
          </div>
        </div>
      </section>

      {PLACEHOLDER_SECTIONS.map((section) => (
        <section key={section.id} className="flex flex-col gap-4">
          <div>
            <h2 className="text-foreground">{section.title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{section.description}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-muted-foreground text-sm">Coming soon.</p>
          </div>
        </section>
      ))}

      <ErrorDialog
        open={saveError !== null}
        onClose={() => setSaveError(null)}
        description={saveError ?? ""}
      />
    </div>
  );
}
