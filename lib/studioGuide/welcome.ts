// TCH-015 (docs/decisions/0206 Decision 12). The message the admin sends a
// teacher after adding their seat. The app sends no email, so the admin sends
// this through their own channel; the text lives here so it can be tested.

export function welcomeMessage(opts: { name: string; siteUrl: string; expiresOn: string | null }): string {
  const name = opts.name.trim();
  const origin = opts.siteUrl.replace(/\/+$/, "");
  const lines = [
    name ? `Hi ${name},` : "Hi,",
    "",
    "Your teacher seat is ready.",
    "",
    `1. Sign in at ${origin}/login with the account you gave me.`,
    "2. You land in Studio, where you build your courses.",
    "3. Start with the Get started list on the first page, and read the Guide in the menu.",
    "",
    "The first goal is one course that is published and shared with your students. The Guide has the steps.",
  ];
  if (opts.expiresOn) lines.push("", `Your seat runs through ${opts.expiresOn}.`);
  return lines.join("\n");
}
