"use client";

import type { UserIdentity } from "@supabase/supabase-js";
import type { NotificationEventKey } from "@/lib/notificationPrefs";
import type { ThemePreference } from "@/lib/theme";
import { AccountSection, type AccountProfile } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { DataPrivacySection } from "./DataPrivacySection";
import { NotificationsSection } from "./NotificationsSection";
import { ProvidersSection } from "./ProvidersSection";

export function SettingsView({
  userId,
  email,
  profile,
  identities,
  identityError,
  notificationPrefs,
  themePreference,
}: {
  userId: string;
  email: string;
  profile: AccountProfile;
  identities: UserIdentity[];
  identityError: string | null;
  notificationPrefs: Record<NotificationEventKey, boolean>;
  themePreference: ThemePreference | null;
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, appearance, and notifications</p>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-foreground">Account</h2>
          <p className="text-muted-foreground mt-1 text-sm">Your avatar, name, email, and location.</p>
        </div>
        <AccountSection userId={userId} email={email} profile={profile} />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-foreground">Sign-in methods</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            How you sign in to this account. You always keep at least one.
          </p>
        </div>
        <ProvidersSection identities={identities} loadError={identityError} />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-foreground">Notifications</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose what reaches you, and where. Turning an event off stops it appearing in
            the bell at all — nothing is queued up for later.
          </p>
        </div>
        <NotificationsSection userId={userId} initial={notificationPrefs} />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-foreground">Appearance</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            How the app looks. Changes apply straight away.
          </p>
        </div>
        <AppearanceSection userId={userId} initialPreference={themePreference} />
      </section>

      {/* Data and privacy — last, and set apart. These are rights, not
          preferences, and the destructive half of the section must never read
          as one more row of settings. The rule above and the extra top margin
          are the separation; the delete block will sit below its own
          danger-zone divider inside. */}
      <section className="flex flex-col gap-4 mt-4 pt-8 border-t-2 border-border">
        <div>
          <h2 className="text-foreground">Data and privacy</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Take a copy of your data, or close your account for good.
          </p>
        </div>
        <DataPrivacySection />
      </section>
    </div>
  );
}
