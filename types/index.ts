export type QuestionType = "multiple_choice"; // code_snippet | free_text deferred to Phase 2

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionSource = "manual" | "ai_generated";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type Visibility = "shared" | "private" | "group";

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
 */
export type PlayableQuestion = Omit<Question, "options"> & { options: string[] };

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
  color: string;
  bg: string;
  tags: string[]; // which tags in questions.json belong to this subject
  subtopics?: string[]; // display labels for the advanced quiz wizard
}

export type SchemaVersion = {
  version: number;
  updated_at: string;
};
