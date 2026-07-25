import { redirect } from "next/navigation";

// Achievements merged into the Progress route (Achievements tab). Kept as a
// redirect so existing links and bookmarks to /achievements keep working.
export default function AchievementsPage() {
  redirect("/progress?tab=achievements");
}
