/**
 * Resolved identifiers for the Colloquiz board. One module so the project
 * number and field/option ids exist in exactly one place — every other
 * script under scripts/board/ imports from here rather than holding its
 * own copy.
 *
 * The Status field is the repo's BUILT-IN Projects v2 field, not a custom
 * one: GraphQL refuses to delete a built-in field ("Only custom fields can
 * be deleted"), so its four options were set in place via a raw
 * `gh api graphql` call to `updateProjectV2Field` rather than a
 * delete-and-recreate. Same field id as the project's seeded default;
 * only the option set changed. See docs/decisions/ for the record.
 */

export const OWNER = 'JumpLikeFLEA';
export const REPO = 'colloquiz';

export const PROJECT_NUMBER = 2;
export const PROJECT_ID = 'PVT_kwHOAvj_ps4BkGZJ';

export const STATUS_FIELD_ID = 'PVTSSF_lAHOAvj_ps4BkGZJzhi4OC8';

export const STATUS_OPTIONS = {
  Ready: '1c65783e',
  'In progress': '8bbfa64b',
  Verify: 'a06374af',
  Done: 'b7602d84',
};

// Board columns in workflow order, for validation and printing.
export const STATUS_COLUMNS = Object.keys(STATUS_OPTIONS);

// Applied to every card issue this tooling creates, so scripts can scope
// queries away from the repo's 43 pre-existing, unrelated issues.
export const BOARD_LABEL = 'board';

// Milestone issue numbers, keyed by the backlog milestone key. Resolved
// once at creation time rather than looked up by title on every run.
export const MILESTONE_NUMBERS = {
  M0: 1,
  M1: 2,
  M2: 3,
  M3: 4,
  M4: 5,
};

// `gh issue create/edit --milestone` takes the milestone TITLE, not its
// number, and resolves it against the repo's milestone list itself.
export const MILESTONE_TITLES = {
  M0: 'M0 — Foundations & item engine',
  M1: 'M1 — Content & authoring',
  M2: 'M2 — Public surface',
  M3: 'M3 — Monetisation',
  M4: 'M4 — Progression & polish',
};
