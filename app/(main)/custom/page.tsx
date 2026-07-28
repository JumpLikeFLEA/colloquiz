"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, GripVertical, CheckCircle2, Circle, Save, Eye, Edit3,
  Tag, HelpCircle, AlignLeft, Globe, Lock
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type QuestionType = "multiple_choice" | "true_false" | "short_answer";

interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  correctAnswer: number | string;
}

interface CustomQuizData {
  title: string;
  description: string;
  subject: string;
  questions: QuizQuestion[];
}

const QUESTION_TYPES: { id: QuestionType; label: string; icon: typeof HelpCircle; desc: string }[] = [
  { id: "multiple_choice", label: "Multiple Choice", icon: CheckCircle2, desc: "4 options, one correct" },
  { id: "true_false", label: "True / False", icon: Circle, desc: "Binary answer" },
  { id: "short_answer", label: "Short Answer", icon: AlignLeft, desc: "Text response" },
];

function generateId() {
  return Math.random().toString(36).slice(2);
}

function createQuestion(type: QuestionType): QuizQuestion {
  if (type === "true_false") {
    return { id: generateId(), type, question: "", options: ["True", "False"], correctAnswer: 0 };
  }
  if (type === "short_answer") {
    return { id: generateId(), type, question: "", options: [], correctAnswer: "" };
  }
  return { id: generateId(), type, question: "", options: ["", "", "", ""], correctAnswer: 0 };
}

export default function CustomPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([createQuestion("multiple_choice")]);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const addQuestion = (type: QuestionType) => {
    const newQ = createQuestion(type);
    setQuestions(prev => [...prev, newQ]);
    setActiveQuestion(questions.length);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length === 1) return;
    setQuestions(prev => prev.filter((_, i) => i !== idx));
    setActiveQuestion(Math.max(0, idx - 1));
  };

  const updateQuestion = (idx: number, updates: Partial<QuizQuestion>) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...updates } : q));
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const options = [...q.options];
      options[optIdx] = value;
      return { ...q, options };
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("custom_quizzes").insert({
        title: title.trim(),
        description: description.trim() || null,
        subject: subject.trim() || null,
        questions,
        is_public: isPublic,
      });
      if (error) throw new Error(error.message);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const isValid = title.trim() && questions.length > 0 && questions.every(q => q.question.trim());

  const q = questions[activeQuestion];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-foreground">Create Custom Quiz</h1>
          <p className="text-muted-foreground mt-1">Build your own quiz with custom questions and answers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(m => m === "edit" ? "preview" : "edit")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border hover:bg-accent transition-colors text-sm cursor-pointer"
          >
            {mode === "edit" ? <Eye size={15} /> : <Edit3 size={15} />}
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
            {saved ? "Saved!" : saving ? "Saving…" : "Save Quiz"}
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <PreviewMode quiz={{ title, description, subject, questions }} onEdit={() => setMode("edit")} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Left Panel */}
          <div className="flex flex-col gap-4">
            {/* Quiz Details */}
            <div className="p-4 rounded-2xl border border-border bg-card flex flex-col gap-3">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Quiz Details</p>
              <div className="flex flex-col gap-2">
                <label className="text-sm text-foreground">Title *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Algebra Fundamentals"
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm text-foreground">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description..."
                  rows={2}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all resize-none"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-1.5 text-sm text-foreground">
                  <Tag size={13} /> Subject
                </label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Mathematics"
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsPublic(p => !p)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all cursor-pointer ${
                  isPublic
                    ? "border-brand/40 bg-brand-subtle text-brand-text"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {isPublic ? <Globe size={13} /> : <Lock size={13} />}
                {isPublic ? "Public — anyone can find it" : "Private — only you"}
              </button>
              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}
            </div>

            {/* Questions List */}
            <div className="p-4 rounded-2xl border border-border bg-card flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Questions</p>
                <span className="text-xs text-muted-foreground">{questions.length}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                {questions.map((q, i) => (
                  <div
                    key={q.id}
                    onClick={() => setActiveQuestion(i)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === "Enter" && setActiveQuestion(i)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all cursor-pointer group ${
                      activeQuestion === i
                        ? "bg-brand-subtle text-brand-text"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <GripVertical size={14} className="text-muted-foreground shrink-0" />
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-current/10 text-xs shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm truncate flex-1">
                      {q.question || "Untitled question"}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); removeQuestion(i); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-all cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add question */}
              <div className="border-t border-border pt-3 flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground mb-1">Add question</p>
                {QUESTION_TYPES.map(qt => (
                  <button
                    key={qt.id}
                    onClick={() => addQuestion(qt.id)}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent transition-colors text-sm text-foreground cursor-pointer"
                  >
                    <Plus size={13} className="text-brand-text" />
                    <qt.icon size={13} className="text-muted-foreground" />
                    {qt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Question Editor */}
          <div className="p-6 rounded-2xl border border-border bg-card flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-subtle text-brand-text text-sm font-medium">
                  {activeQuestion + 1}
                </span>
                <span className="text-sm text-muted-foreground">
                  {QUESTION_TYPES.find(t => t.id === q.type)?.label}
                </span>
              </div>
              <div className="flex gap-1.5">
                {QUESTION_TYPES.map(qt => (
                  <button
                    key={qt.id}
                    onClick={() => updateQuestion(activeQuestion, createQuestion(qt.id))}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                      q.type === qt.id
                        ? "bg-brand text-white"
                        : "border border-border hover:bg-accent text-foreground"
                    }`}
                  >
                    {qt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Question text */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Question *</label>
              <textarea
                value={q.question}
                onChange={e => updateQuestion(activeQuestion, { question: e.target.value })}
                placeholder="Enter your question here..."
                rows={3}
                className="px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all resize-none"
              />
            </div>

            {/* Options */}
            {q.type === "multiple_choice" && (
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-foreground">Answer Options</label>
                <p className="text-xs text-muted-foreground -mt-2">Click the circle to mark the correct answer</p>
                {q.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <button
                      onClick={() => updateQuestion(activeQuestion, { correctAnswer: i })}
                      className={`flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0 transition-all cursor-pointer ${
                        q.correctAnswer === i
                          ? "border-brand bg-brand"
                          : "border-muted-foreground/40 hover:border-brand"
                      }`}
                    >
                      {q.correctAnswer === i && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </button>
                    <input
                      value={opt}
                      onChange={e => updateOption(activeQuestion, i, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      className={`flex-1 px-3 py-2 rounded-xl border text-sm transition-all focus:outline-none placeholder:text-muted-foreground ${
                        q.correctAnswer === i
                          ? "border-brand/40 bg-brand-subtle text-brand-text focus:ring-2 focus:ring-brand/20"
                          : "border-border bg-background text-foreground focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      }`}
                    />
                  </div>
                ))}
              </div>
            )}

            {q.type === "true_false" && (
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-foreground">Correct Answer</label>
                <div className="flex gap-3">
                  {["True", "False"].map((opt, i) => (
                    <button
                      key={opt}
                      onClick={() => updateQuestion(activeQuestion, { correctAnswer: i })}
                      className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all cursor-pointer ${
                        q.correctAnswer === i
                          ? i === 0
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-red-400 bg-red-50 text-red-600"
                          : "border-border hover:border-muted-foreground/40 text-foreground"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {q.type === "short_answer" && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">Expected Answer</label>
                <input
                  value={typeof q.correctAnswer === "string" ? q.correctAnswer : ""}
                  onChange={e => updateQuestion(activeQuestion, { correctAnswer: e.target.value })}
                  placeholder="Enter the expected answer..."
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                />
                <p className="text-xs text-muted-foreground">Answers will be compared case-insensitively</p>
              </div>
            )}

            {/* Question nav */}
            <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
              <button
                onClick={() => setActiveQuestion(i => Math.max(0, i - 1))}
                disabled={activeQuestion === 0}
                className="px-3 py-1.5 rounded-lg border border-border hover:bg-accent text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                ← Previous
              </button>
              <span className="text-xs text-muted-foreground">
                {activeQuestion + 1} / {questions.length}
              </span>
              <button
                onClick={() => setActiveQuestion(i => Math.min(questions.length - 1, i + 1))}
                disabled={activeQuestion === questions.length - 1}
                className="px-3 py-1.5 rounded-lg border border-border hover:bg-accent text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewMode({ quiz, onEdit }: { quiz: CustomQuizData; onEdit: () => void }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | string>>({});

  const q = quiz.questions[currentQ];
  if (!q) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <HelpCircle size={40} className="opacity-30" />
        <p>No questions added yet.</p>
        <button onClick={onEdit} className="text-brand-text hover:underline text-sm cursor-pointer">
          Go back to editor
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div className="p-5 rounded-2xl border border-border bg-accent/30">
        <p className="font-medium text-foreground">{quiz.title || "Untitled Quiz"}</p>
        {quiz.description && <p className="text-sm text-muted-foreground mt-1">{quiz.description}</p>}
      </div>

      <div className="flex gap-1.5">
        {quiz.questions.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-all ${
              i < currentQ ? "bg-brand" : i === currentQ ? "bg-brand/50" : "bg-border"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="p-6 rounded-2xl border border-border bg-card flex flex-col gap-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-subtle text-brand-text text-sm font-medium shrink-0">
              {currentQ + 1}
            </span>
            <p className="text-foreground leading-relaxed">{q.question || "No question text"}</p>
          </div>

          {q.type === "multiple_choice" && (
            <div className="flex flex-col gap-2">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setAnswers(a => ({ ...a, [currentQ]: i }))}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm text-left transition-all cursor-pointer ${
                    answers[currentQ] === i
                      ? "border-brand bg-brand-subtle text-brand-text"
                      : "border-border hover:border-brand/40 hover:bg-accent text-foreground"
                  }`}
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full border border-current text-xs font-medium">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt || `Option ${String.fromCharCode(65 + i)}`}
                </button>
              ))}
            </div>
          )}

          {q.type === "true_false" && (
            <div className="flex gap-3">
              {["True", "False"].map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => setAnswers(a => ({ ...a, [currentQ]: i }))}
                  className={`flex-1 py-3.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                    answers[currentQ] === i
                      ? "border-brand bg-brand-subtle text-brand-text"
                      : "border-border hover:border-brand/40 text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.type === "short_answer" && (
            <input
              value={typeof answers[currentQ] === "string" ? answers[currentQ] as string : ""}
              onChange={e => setAnswers(a => ({ ...a, [currentQ]: e.target.value }))}
              placeholder="Type your answer..."
              className="px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all text-sm"
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentQ(i => Math.max(0, i - 1))}
          disabled={currentQ === 0}
          className="px-4 py-2 rounded-xl border border-border hover:bg-accent text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          ← Previous
        </button>
        <button
          onClick={() => setCurrentQ(i => Math.min(quiz.questions.length - 1, i + 1))}
          disabled={currentQ === quiz.questions.length - 1}
          className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
