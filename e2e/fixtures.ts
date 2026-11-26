/**
 * Fixture accounts the phone-engine specs sign in as (OPS-045). Each is made by
 * scripts/seed-local-fixtures.ts on the local stack only (docs/decisions/0245).
 */

export const FIXTURES = {
  /** The learner-home fixture: an attempt, an extended enrolment with a call, published feedback. */
  prog002: "prog002-learner@example.com",
  /** The before/after fixture learner: analysed takes and a notebook with a row in every tab. */
  prog007: "prog007-learner@example.com",
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** Where auth.setup.ts writes a fixture's storage state. */
export function storageStatePath(name: FixtureName): string {
  return `e2e/.auth/${name}.json`;
}
