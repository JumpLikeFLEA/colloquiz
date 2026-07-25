import { redirect } from "next/navigation";

// Dashboard merged into the Progress route (Stats tab). Kept as a redirect so
// existing links and bookmarks to /dashboard keep working.
export default function DashboardPage() {
  redirect("/progress?tab=stats");
}
