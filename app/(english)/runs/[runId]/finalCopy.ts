/**
 * The before/after screen's strings (COH-005, docs/decisions/0115). English,
 * no toggle, like the rest of the cohort learner chrome (the invite page,
 * 0107; lesson chrome, 0080 Decision 5). Pending partner review.
 */
export const finalCopy = {
  metaTitle: "Your before and after",
  eyebrow: "Before and after",
  backToCourse: "Back to course",
  intro: "The same task, recorded at the start of the course and at the end.",
  before: "Before",
  after: "After",
  /** A slot's lesson is open and nothing was sent for it. */
  missing: "You haven't sent a recording for this task yet.",
  recordIn: "Record it in",
  /** No readable lesson holds the slot: a later week not open yet, or none authored. */
  unknown: {
    before: "This task isn't open yet.",
    after: "This task opens near the end of the course.",
  },
  /** The 6-month purge (060) removed the take. Never "missing". */
  removed: "This recording was removed after the course ended. You did record it.",
  comment: {
    heading: "Final comment",
    pending: "Your teacher's final comment isn't ready yet. It appears here once it's published.",
  },
  signedOut: {
    title: "Sign in to see your before and after",
    body: "This page shows your own recordings, so you need to be signed in.",
    cta: "Sign in",
  },
};
