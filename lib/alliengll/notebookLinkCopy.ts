/**
 * PROG-015 (docs/decisions/0242) — the lesson's two ways into the notebook: under a finished AI
 * feedback, and on the course-complete card. English, like the rest of the lesson chrome
 * (docs/decisions/0080 Decision 5). Its own module so it ships only in those two lazy chunks
 * (VoiceAnalysisPanel, CourseAwareCompletion), never in a lesson's first load.
 */
export const notebookLinkCopy = {
  afterFeedback: "The phrases you used and the fix are saved in your notebook.",
  afterCourse: "The phrases you said in this course are saved in your notebook.",
  open: "Open notebook",
} as const;
