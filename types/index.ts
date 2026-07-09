export type QuestionType = "multiple_choice"; // code_snippet | free_text deferred to Phase 2

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionSource = "manual" | "ai_generated";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type Visibility = "shared" | "private";

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
}

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
