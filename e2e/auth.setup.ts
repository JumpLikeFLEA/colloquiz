/**
 * One storage state per fixture, made fresh each run through the real login
 * form (OPS-045; docs/decisions/0245 Decision 3). A missing fixture fails here,
 * at once, with the form's own message, before any phone spec runs.
 */

import { test as setup } from "@playwright/test";
import { signInThroughForm } from "../scripts/fixtureSignIn";
import { SEED_HINT } from "../scripts/localServer";
import { FIXTURES, storageStatePath, type FixtureName } from "./fixtures";

for (const name of Object.keys(FIXTURES) as FixtureName[]) {
  setup(`sign in ${name}`, async ({ page, baseURL }) => {
    await signInThroughForm(
      page,
      baseURL ?? "",
      FIXTURES[name],
      `is missing on the server at ${baseURL} (or has another password than the seed's). ` +
        `To run the phone specs: ${SEED_HINT}, then run \`npm run e2e\``,
    );
    await page.context().storageState({ path: storageStatePath(name) });
  });
}
