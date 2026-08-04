// Type-only, so this file stays runtime-dependency-free. The vocabularies live
// in lib/ because the client components need them as VALUES; re-deriving them
// here would give the schema two sources of truth.
import type { FeedbackCategory, FeedbackStatus } from "@/lib/feedback";
import type { ThemePreference } from "@/lib/theme";

export type QuestionType = "multiple_choice"; // code_snippet | free_text deferred to Phase 2

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionSource = "manual" | "ai_generated";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type Visibility = "shared" | "private" | "group" | "course";

export interface QuestionCriticNotes {
  correctness_check: "pass" | "fail" | "unsure";
  ambiguity_check: "pass" | "fail" | "unsure";
  distractor_quality: number;
  notes: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  subject: string;
  tags: string[];
  difficulty: Difficulty;
  question: string;
  options: [string, string, string, string];
  correct_answer: string;
  explanation: string;
  created_at: string;
  source: QuestionSource;
  created_by?: string | null;
  status: ReviewStatus;
  critic_notes?: QuestionCriticNotes | null;
  content_hash?: string | null;
  generation_batch_id?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  visibility?: Visibility;
  group_id?: string | null;
}

/**
 * A question as served to the player: options shuffled, and the empty padding
 * slots of the stored 4-tuple dropped (see lib/options.ts). A true/false
 * question therefore arrives with exactly two options.
 *
 * The `*Html` fields are KaTeX-rendered HTML built SERVER-side (renderToHtml,
 * lib/richText) and index-aligned with `options`. They exist so the client
 * `QuizSession` can show math without importing katex — the raw strings above
 * stay the source of truth for shuffling and `correct_answer` equality; the
 * HTML is render-only and must never become a compared value.
 */
export type PlayableQuestion = Omit<Question, "options"> & {
  options: string[];
  questionHtml: string;
  optionsHtml: string[];
  explanationHtml: string;
};

export interface Quiz {
  id: string;
  title: string;
  tags: string[];
  difficulty_mix: Difficulty | "mixed";
  question_ids: string[];
  created_at: string;
  mode?: QuizMode;
  created_by?: string | null;
  visibility?: Visibility;
  group_id?: string | null;
}

export type GradingType = "auto" | "self" | "ai"; // auto = exact-match; self = user-marked; ai = graded in Phase 2

export type QuizMode = "ordinary" | "exam";

export interface TagResult {
  correct: number;
  total: number;
}

export interface StoredAnswer {
  question_id: string;
  user_answer: string;
}

export interface Result {
  id: string;
  quiz_id: string;
  mode: QuizMode;
  score: number;
  total_questions: number;
  correct: number;
  tag_breakdown: Record<string, TagResult>;
  wrong_question_ids: string[];
  grading_type: GradingType;
  taken_at: string;
  time_taken?: number;
  user_id?: string | null;
  answers?: StoredAnswer[];
  // Questions the user reported and skipped: left out of score/total_questions
  // and NOT in wrong_question_ids. Needed so the review UI can render them as
  // "not scored" rather than treating "not wrong" as correct.
  excluded_question_ids?: string[];
}

export type QuizSessionStatus = "active" | "completed" | "abandoned";

export interface QuizSession {
  id: string;
  user_id: string;
  quiz_id: string;
  status: QuizSessionStatus;
  current_index: number;
  answers: (number | null)[];
  started_at: string;
  last_activity_at: string;
}

export type AssignmentStatus = "assigned" | "completed";

export interface Assignment {
  id: string;
  quiz_id: string;
  tutor_id: string;
  student_id: string;
  status: AssignmentStatus;
  assigned_at: string;
  due_at?: string | null;
  completed_at?: string | null;
  result_id?: string | null;
}

export interface TutorStudent {
  id: string;
  tutor_id: string;
  student_id: string;
  created_at: string;
}

export type GroupRole = "owner" | "member";

export interface Group {
  id: string;
  name: string;
  description?: string | null;
  owner_id: string;
  // Opt-in to team rankings. Stored but unused until that feature ships.
  competes: boolean;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  created_at: string;
}

export type ReportCategory = "wrong_answer" | "unclear" | "typo" | "outdated" | "other";

export type ReportStatus = "open" | "resolved";

export type ReportResolution = "edited" | "removed" | "dismissed";

export interface QuestionReport {
  id: string;
  question_id: string;
  user_id: string;
  category: ReportCategory;
  comment?: string | null;
  reported_answer?: string | null;
  status: ReportStatus;
  resolution?: ReportResolution | null;
  admin_note?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface ReportedQuestionGroup {
  question: Question;
  reports: QuestionReport[];
}

// A row of the feedback table (migration 026). Only an admin can ever read one
// — there is no owner SELECT policy — so this type describes the future admin
// triage view, not anything the author of the feedback sees. The metadata
// fields are all nullable because they are captured, never asked for.
export interface Feedback {
  id: string;
  user_id: string;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  route?: string | null;
  user_agent?: string | null;
  viewport_width?: number | null;
  viewport_height?: number | null;
  theme?: ThemePreference | null;
  app_version?: string | null;
  created_at: string;
}

// The notification kinds the notification center knows how to render. Written
// by DB triggers (013) and the resolve_question_reports() RPC (010). Kept as a
// closed union for exhaustive rendering; the `(string & {})` fallback keeps an
// unknown/legacy `type` from breaking the type — the UI renders it generically.
export type NotificationType =
  | "report_resolved"
  | "invite_accepted"
  | "assignment_created"
  | "assignment_completed"
  | "achievement_unlocked"
  | "question_reviewed"
  | "group_member_joined"
  | "group_question_pending"
  | "quiz_shared";

// Named AppNotification to avoid clashing with the DOM `Notification` global.
export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType | (string & {});
  payload: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

export type QuizSize = 5 | 10 | 20;

export interface QuizFilter {
  tags: string[];
  difficulty: Difficulty | "mixed";
  size: QuizSize;
  mode: QuizMode;
  subject?: string;
  subtopics?: string[];
}

export interface Subject {
  id: string;
  name: string;
  icon: string; // lucide-react icon name
  // Identity hue. The chip surface is DERIVED from it at render (see
  // lib/categoricalColor.ts) — there is deliberately no stored background.
  color: string;
  tags: string[]; // which tags in questions.json belong to this subject
  subtopics?: string[]; // display labels for the advanced quiz wizard
}

export type SchemaVersion = {
  version: number;
  updated_at: string;
};

// ── Course stage play ───────────────────────────────────────
// Payloads the practice/check API routes return to their client players. Options
// are shuffled AND KaTeX-rendered server-side (same reasoning as PlayableQuestion):
// `html` is render-only, `raw` stays the value compared for correctness. The
// client never sees a shuffle seed — the server orders once and returns raw+html
// index-aligned.

/** One answer option, shuffled and pre-rendered server-side. */
export type ServedOption = {
  raw: string;
  html: string;
};

/**
 * A practice item. Ships `correctAnswer` + `explanationHtml` for immediate local
 * feedback exactly like the quiz engine (draw_practice_item returns them by
 * design); the seen-record is still written by the server-truth
 * record_practice_answer POST, never from client correctness.
 */
export type CoursePracticeItem = {
  id: string;
  questionHtml: string;
  options: ServedOption[];
  correctAnswer: string;
  explanationHtml: string;
  difficulty: Difficulty;
};

/**
 * A knowledge-check item. Deliberately carries NO correct answer — the check is
 * graded server-side by submit_stage_check. `isReview` marks a spaced-repetition
 * item drawn from an earlier completed stage (labelled, and scored separately).
 */
export type CourseCheckItem = {
  id: string;
  questionHtml: string;
  options: ServedOption[];
  difficulty: Difficulty;
  isReview: boolean;
};

/** Per-item grading from submit_stage_check. */
export type CourseCheckResultItem = {
  questionId: string;
  isReview: boolean;
  correct: boolean;
  correctAnswer: string;
  given: string | null;
};

/** The full graded result of a knowledge check. Score is over NEW items only. */
export type CourseCheckResult = {
  score: number;
  passed: boolean;
  newCorrect: number;
  newTotal: number;
  reviewCorrect: number;
  reviewTotal: number;
  results: CourseCheckResultItem[];
};
