import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
for (const line of readFileSync("c:/Users/PC/Git/learning_curve/.env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim();
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, service, { auth: { persistSession: false } });
const ts = Date.now(), PW = "Test123456!";
async function mk(key, name) {
  const email = `lc-smoke-${key}-${ts}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error; return { id: data.user.id, email };
}
const T = await mk("t", "Smoke Tutor"), S = await mk("s", "Smoke Student");
await admin.from("profiles").update({ is_author: true }).eq("id", T.id);
const tc = createClient(url, anon, { auth: { persistSession: false } });
await tc.auth.signInWithPassword({ email: T.email, password: PW });
const q = `sq_${ts}`, quiz = `squiz_${ts}`;
await tc.from("questions").insert({ id: q, type: "multiple_choice", subject: "mathematics", tags: ["algebra"], difficulty: "easy", question: "2+2?", options: ["4","3","5","6"], correct_answer: "4", explanation: "math", source: "manual", created_by: T.id, visibility: "private", status: "approved" });
await tc.from("quizzes").insert({ id: quiz, title: "Smoke Quiz", tags: ["algebra"], difficulty_mix: "easy", question_ids: [q], mode: "ordinary", created_by: T.id, visibility: "private" });
const { data: inv } = await tc.from("tutor_invites").insert({ tutor_id: T.id }).select("token").single();
const sc = createClient(url, anon, { auth: { persistSession: false } });
await sc.auth.signInWithPassword({ email: S.email, password: PW });
await sc.rpc("accept_tutor_invite", { p_token: inv.token });
await tc.from("assignments").insert({ quiz_id: quiz, tutor_id: T.id, student_id: S.id });
console.log(JSON.stringify({ tutorEmail: T.email, studentEmail: S.email, tutorId: T.id, studentId: S.id, pw: PW }));
