import { ShieldAlert } from "lucide-react";
import { getCourseAccess } from "@/lib/courseAccess";
import { VoiceSpikeClient } from "./VoiceSpikeClient";

// VOICE-001 — THROWAWAY. Deleted when the card closes (docs/decisions/0097).
// Gate: admin or any course_editors grant, the same check as admin/courses
// (the partner's phone is in the cross-playback matrix). Not dev-only: the
// spike has to run on a Vercel preview under production headers. No English
// route imports anything from this folder.
export default async function VoiceSpikePage() {
  const { isAdmin, editableCourseIds } = await getCourseAccess();

  if (!isAdmin && editableCourseIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You need admin or delegated-editor access to see this page.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <VoiceSpikeClient />
    </div>
  );
}
