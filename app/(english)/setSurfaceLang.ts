"use server";

import { cookies } from "next/headers";
import {
  parseSurfaceLang,
  SURFACE_LANG_COOKIE,
  SURFACE_LANG_COOKIE_MAX_AGE,
  type SurfaceLang,
} from "@/lib/alliengll/surfaceLang";

/**
 * Saves the EN/RU toggle's choice (docs/decisions/0080). A Server Action
 * rather than `document.cookie` because setting a cookie here makes Next
 * re-render the current page AND its layouts in the same round trip
 * (node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md,
 * "Cookies"). The course page's server-rendered strings and the root
 * layout's footer both depend on that re-render; a client-only cookie write
 * would leave them in the old language until the next full load.
 *
 * Callable by anyone, like every Server Action: the argument is untrusted,
 * so it goes through `parseSurfaceLang` and can only ever store "ru" or
 * "en". Not HttpOnly: it is a UI preference, not a credential.
 */
export async function setSurfaceLang(lang: SurfaceLang): Promise<void> {
  (await cookies()).set(SURFACE_LANG_COOKIE, parseSurfaceLang(lang), {
    path: "/",
    maxAge: SURFACE_LANG_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}
