"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { ErrorDialog } from "@/app/components/ErrorDialog";
import type { Difficulty, QuizMode } from "@/types";

// The body `/api/quiz` accepts when creating an ad-hoc quiz definition.
export type StartQuizFilter = {
  subject?: string;
  tags?: string[];
  difficulty: Difficulty | "mixed";
  size: number;
  mode: QuizMode;
};

// Either play an existing quiz (assigned / authored) or create one from a filter.
export type StartQuizArg = { quizId: string } | { filter: StartQuizFilter };

type StartQuizContextValue = {
  /** Enforces the one-active-quiz rule, then navigates to the quiz. */
  startQuiz: (arg: StartQuizArg) => Promise<void>;
  /** True while a start request is in flight (create + gate check). */
  starting: boolean;
};

const StartQuizContext = createContext<StartQuizContextValue | null>(null);

export function useStartQuiz(): StartQuizContextValue {
  const ctx = useContext(StartQuizContext);
  if (!ctx) throw new Error("useStartQuiz must be used within <StartQuizProvider>");
  return ctx;
}

export function StartQuizProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server reports a conflicting active quiz — opens the confirm dialog.
  const [conflictQuizId, setConflictQuizId] = useState<string | null>(null);

  const resolveQuizId = useCallback(async (arg: StartQuizArg): Promise<string | null> => {
    if ("quizId" in arg) return arg.quizId;
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(arg.filter),
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !data.id) {
      setError(data.error ?? "Could not start quiz.");
      return null;
    }
    return data.id;
  }, []);

  // Try to open a session for quizId. On a conflict (a different active quiz),
  // stash the quizId and open the confirm dialog instead of navigating.
  const openSession = useCallback(
    async (quizId: string, replace: boolean): Promise<void> => {
      const res = await fetch("/api/quiz/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, replace }),
      });
      if (res.status === 409) {
        setConflictQuizId(quizId);
        return;
      }
      if (!res.ok) {
        setError("Could not start quiz. Please try again.");
        return;
      }
      router.push(`/quiz/${quizId}`);
    },
    [router],
  );

  const startQuiz = useCallback(
    async (arg: StartQuizArg): Promise<void> => {
      setStarting(true);
      setError(null);
      try {
        const quizId = await resolveQuizId(arg);
        if (!quizId) return;
        await openSession(quizId, false);
      } catch {
        setError("Could not start quiz. Check your connection and try again.");
      } finally {
        setStarting(false);
      }
    },
    [resolveQuizId, openSession],
  );

  const confirmReplace = useCallback(async () => {
    const quizId = conflictQuizId;
    setConflictQuizId(null);
    if (!quizId) return;
    setStarting(true);
    try {
      await openSession(quizId, true);
    } catch {
      setError("Could not start quiz. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }, [conflictQuizId, openSession]);

  return (
    <StartQuizContext.Provider value={{ startQuiz, starting }}>
      {children}

      <AlertDialog
        open={conflictQuizId !== null}
        onOpenChange={(open) => {
          if (!open) setConflictQuizId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You already have an active quiz</AlertDialogTitle>
            <AlertDialogDescription>
              Starting a new quiz will discard your current one and its progress. Do you
              want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep current quiz</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReplace}
              className="rounded-xl bg-brand text-white hover:bg-brand-hover"
            >
              Discard &amp; start new
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ErrorDialog
        open={error !== null}
        onClose={() => setError(null)}
        description={error ?? ""}
      />
    </StartQuizContext.Provider>
  );
}
