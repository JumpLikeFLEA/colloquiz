import { getSubjects, getSubjectStats } from "@/lib/questions";
import BuildForm from "./BuildForm";
import type { SubjectCardData } from "@/app/components/SubjectGrid";

export default async function BuildPage() {
  const subjects = getSubjects();
  // Per-subject counts/difficulties come from a DB-side GROUP BY (migration
  // 008) — cap-safe and cached, unlike scanning the full questions table.
  const stats = await getSubjectStats();

  const subjectCards: SubjectCardData[] = subjects.map((s) => {
    const stat = stats[s.id] ?? { count: 0, difficulties: [] };
    return {
      id: s.id,
      name: s.name,
      icon: s.icon,
      color: s.color,
      questionCount: stat.count,
      difficulties: stat.difficulties,
    };
  });

  const subtopicsBySubject = Object.fromEntries(
    subjects.map((s) => [s.id, s.subtopics ?? []]),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Build a Quiz</h1>
        <p className="mt-1 text-muted-foreground">
          Pick a subject, narrow by subtopic, then configure difficulty and length.
        </p>
      </div>
      <BuildForm subjects={subjectCards} subtopicsBySubject={subtopicsBySubject} />
    </div>
  );
}
