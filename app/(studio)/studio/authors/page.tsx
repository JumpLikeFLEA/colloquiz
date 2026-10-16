import { notFound } from "next/navigation";
import { getCourseAccess } from "@/lib/courseAccess";
import { getAuthorSeats } from "@/lib/authorSeatsServer";
import { SeatsManager } from "./SeatsManager";

// /studio/authors — author seats (TCH-007, docs/decisions/0141 Decision 18,
// 0154). Admin only: anyone else, a teacher included, gets Studio's own 404,
// the same as every other page that is not theirs. The page gate is
// getCourseAccess(); the data boundary is author_seats_list() (082), which
// raises for a non-admin caller.

export const metadata = { title: "Authors" };

export default async function AuthorsPage() {
  const access = await getCourseAccess();
  if (!access.isAdmin) notFound();

  const seats = await getAuthorSeats();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Authors</h1>
        <p className="text-sm text-muted-foreground">
          A seat lets a teacher create and run their own courses. Seats are paid for outside the app; here you add one,
          set when it ends and freeze it. A frozen or lapsed seat cannot create new courses.
        </p>
      </div>
      <SeatsManager seats={seats} />
    </div>
  );
}
