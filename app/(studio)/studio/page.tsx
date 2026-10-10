import { redirect } from "next/navigation";

// Studio's home is the "Needs attention" inbox (AUTH-012, docs/decisions/0109
// Decision 5). Until it lands, /studio opens on the course list.
export default function StudioHome() {
  redirect("/studio/courses");
}
