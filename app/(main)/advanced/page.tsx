import { getSubjects, getSubjectStats } from "@/lib/questions";
import AdvancedForm from "./AdvancedForm";
import type { SubjectCardData } from "@/app/components/SubjectGrid";

export default async function AdvancedPage() {
  const subjects = getSubjects();
  const stats = await getSubjectStats();

  const subjectCards: SubjectCardData[] = subjects
    .map((subject) => {
      const { count, difficulties } = stats[subject.id] ?? { count: 0, difficulties: [] };
      return {
        id: subject.id,
        name: subject.name,
        icon: subject.icon,
        color: subject.color,
        questionCount: count,
        difficulties,
      };
    })
    .filter((card) => card.questionCount > 0);

  const subtopicsBySubject = Object.fromEntries(
    subjects.map((s) => [s.id, s.subtopics ?? []]),
  );

  return <AdvancedForm subjects={subjectCards} subtopicsBySubject={subtopicsBySubject} />;
}
