// Which build is running — stamped onto every feedback submission so a report
// can be tied to the code it was written against.
//
// SOURCED FROM THE VERCEL COMMIT SHA, but NOT from `NEXT_PUBLIC_VERCEL_GIT_
// COMMIT_SHA` directly. Vercel only populates the `NEXT_PUBLIC_VERCEL_*`
// aliases when the project's "Automatically expose System Environment
// Variables" setting is on, and that is a dashboard toggle nothing in this
// repo controls — a silent flip would leave the column empty with no build
// failure to notice it. `VERCEL_GIT_COMMIT_SHA` (unprefixed) is always present
// in the build environment instead, so next.config.ts reads that one and
// inlines it as NEXT_PUBLIC_APP_VERSION via the `env` key. That works whether
// or not the toggle is on.
//
// THE VALUE MUST BE REFERENCED AS A FULL LITERAL. `process.env` entries from
// the next.config `env` key are substituted textually at build time, so
// `const { NEXT_PUBLIC_APP_VERSION } = process.env` yields undefined. Read it
// exactly as written below and nowhere else.

const RAW = process.env.NEXT_PUBLIC_APP_VERSION;

/**
 * "dev" locally, where there is no commit SHA and nothing to correlate a
 * report against anyway. Never empty and never undefined: an absent version is
 * indistinguishable from a broken capture, whereas "dev" says what happened.
 */
export const APP_VERSION: string = RAW && RAW.length > 0 ? RAW : "dev";

/** The first 7 characters, for display next to a report in an admin view. */
export function shortAppVersion(version: string = APP_VERSION): string {
  return /^[0-9a-f]{40}$/i.test(version) ? version.slice(0, 7) : version;
}
