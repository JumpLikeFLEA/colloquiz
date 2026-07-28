"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useStartQuiz } from "@/app/components/StartQuizProvider";

export type MyQuizItem = {
  quizId: string;
  title: string;
  subtitle: string;
  badge: { label: string; className: string } | null;
};

export function MyQuizzesRow({ items }: { items: MyQuizItem[] }) {
  const { startQuiz } = useStartQuiz();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-medium">My Quizzes</h2>
          <p className="text-xs text-muted-foreground">Assigned to you and quizzes you created</p>
        </div>
        <Link href="/my-quizzes" className="text-sm text-brand-text hover:underline shrink-0">
          See all
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item) => (
          <div
            key={`${item.quizId}:${item.subtitle}`}
            className="flex flex-col rounded-2xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex flex-col gap-1 p-4 pb-3 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-foreground line-clamp-2">{item.title}</p>
                {item.badge && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${item.badge.className}`}>
                    {item.badge.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{item.subtitle}</p>
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => startQuiz({ quizId: item.quizId })}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm cursor-pointer"
              >
                <Play size={14} />
                Start Quiz
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
