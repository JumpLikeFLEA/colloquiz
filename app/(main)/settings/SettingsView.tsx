"use client";

const SECTIONS = [
  {
    id: "account",
    title: "Account",
    description: "Display name, avatar, email, and linked sign-in providers.",
  },
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

export function SettingsView() {
  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, appearance, and notifications</p>
      </div>

      {SECTIONS.map((section) => (
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
    </div>
  );
}
