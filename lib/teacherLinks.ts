// TCH-001 — a learner links to a teacher (migration 076, docs/decisions/0148).
// Pure: the shapes 076's functions return, the mapping from their raw rows,
// and the statement a learner sees before linking. Every rule (who is a
// teacher, whether a token resolves, who may end a link) is decided in SQL;
// this module only renames fields. The reads live in
// lib/teacherLinksServer.ts so a Client Component can import these types
// without pulling in the server Supabase client.

/** A join token's shape (076: 32 lowercase hex chars, 128 bits, the 059 shape). */
export const JOIN_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** The join page's path for a token. */
export function joinPath(token: string): string {
  return `/join/${token}`;
}

/** What the join page shows for a token (`teacher_join_preview`, 076). */
export type TeacherJoinPreview =
  | { state: "not_found" }
  | { state: "ok" | "self" | "already_linked"; teacherName: string };

const JOIN_STATES = new Set(["ok", "self", "already_linked"]);

/** Maps the RPC's JSON. Anything it doesn't recognise reads as not_found, so
 * the page never renders a Join button for a state it can't name. */
export function parseTeacherJoinPreview(raw: unknown): TeacherJoinPreview {
  if (!raw || typeof raw !== "object") return { state: "not_found" };
  const r = raw as Record<string, unknown>;
  if (typeof r.state !== "string" || !JOIN_STATES.has(r.state)) return { state: "not_found" };
  if (typeof r.teacher_name !== "string" || r.teacher_name.trim() === "") return { state: "not_found" };
  return { state: r.state as "ok" | "self" | "already_linked", teacherName: r.teacher_name };
}

/** One of the caller's active teachers (`my_teachers`, 076). */
export type MyTeacher = { linkId: string; teacherName: string; linkedAt: string };
export type MyTeacherRow = { link_id: string; teacher_name: string; linked_at: string };
export function toMyTeacher(row: MyTeacherRow): MyTeacher {
  return { linkId: row.link_id, teacherName: row.teacher_name, linkedAt: row.linked_at };
}

/** One of a teacher's active students (`teacher_linked_students`, 076). */
export type LinkedStudent = {
  linkId: string;
  userId: string;
  /** Email, else @telegram username, else "" (learner_contact_label, 073). */
  label: string;
  source: "join_link" | "run_invite";
  linkedAt: string;
};
export type LinkedStudentRow = {
  link_id: string;
  user_id: string;
  contact_label: string | null;
  source: string;
  linked_at: string;
};
export function toLinkedStudent(row: LinkedStudentRow): LinkedStudent {
  return {
    linkId: row.link_id,
    userId: row.user_id,
    label: row.contact_label ?? "",
    source: row.source === "run_invite" ? "run_invite" : "join_link",
    linkedAt: row.linked_at,
  };
}

/** The teacher's join-link state in Studio (`my_teacher_join_link_state`). */
export type JoinLinkState = { exists: boolean; rotatedAt: string | null };
export function parseJoinLinkState(raw: unknown): JoinLinkState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return { exists: r.exists === true, rotatedAt: typeof r.rotated_at === "string" ? r.rotated_at : null };
}

/**
 * What a linked teacher sees, shown BEFORE the learner confirms
 * (docs/decisions/0141 Decision 6; privacy-policy.md 1.5 section 5, "Teachers
 * you link to"). One list, two languages; the bullets mirror the policy's, so
 * a change to one is a change to both. `{teacher}` is replaced with the name.
 *
 * New copy, pending owner/partner review.
 */
export type LinkStatement = { lead: string; sees: readonly string[]; cannot: string; leave: string };

export const linkStatement: Record<"en" | "ru", LinkStatement> = {
  en: {
    lead: "If you link, {teacher} will be able to:",
    sees: [
      "see each of your attempts, the answer you gave to each exercise and your score, in their own courses and in the lessons or courses they assign you",
      "write to you in one conversation that only the two of you can read",
      "put you in private groups (their own labels, which you aren’t shown) and assign you homework",
    ],
    cannot: "They can’t see your answers in other courses, your quiz results or anything else in your account.",
    leave: "You can leave at any time in My courses. Then they can no longer see your answers or scores.",
  },
  ru: {
    lead: "Если вы подключитесь, {teacher} сможет:",
    sees: [
      "видеть каждую вашу попытку, ваш ответ на каждое задание и результат — в своих курсах и в уроках или курсах, которые задаст вам",
      "писать вам в одной переписке, которую видите только вы двое",
      "добавлять вас в личные группы (это его пометки, вам они не показываются) и задавать домашние задания",
    ],
    cannot: "Ответы в других курсах, результаты квизов и остальное в вашем аккаунте преподаватель не видит.",
    leave: "Отключиться можно в любой момент в разделе «Мои курсы». После этого преподаватель больше не видит ваши ответы и результаты.",
  },
};

/** The statement's lead line for a teacher's name. */
export function statementLead(lang: "en" | "ru", teacherName: string): string {
  return linkStatement[lang].lead.replace("{teacher}", teacherName);
}
