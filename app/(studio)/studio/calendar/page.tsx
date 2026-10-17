import { notFound } from "next/navigation";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { getCalendarPageData } from "@/lib/calendar/calendarServer";
import { CalendarView } from "@/app/components/calendar/CalendarView";
import { TimeZoneSync } from "@/app/components/calendar/TimeZoneSync";

// /studio/calendar — the dates of the courses the teacher edits and of their
// groups (COH-015, docs/decisions/0159). Which dates come back is decided in
// SQL: my_calendar('teacher') (085) returns every run of a course the caller
// can edit, their own assignments and the events they can manage, and nothing
// of another teacher's. Studio's chrome is English.

export const metadata = { title: "Calendar" };

export default async function StudioCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();

  const { month } = await searchParams;
  const data = await getCalendarPageData("teacher", typeof month === "string" ? month : undefined);

  return (
    <div id="calendar" className="mx-auto max-w-5xl space-y-6">
      <TimeZoneSync />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Run starts and ends, when each week opens, calls, homework due dates and the events you added, across the
          courses you edit and your groups. Add or change them where they live: the course&apos;s runs page and the
          group page.
        </p>
      </div>
      <CalendarView {...data} lang="en" basePath="/studio/calendar" />
    </div>
  );
}
