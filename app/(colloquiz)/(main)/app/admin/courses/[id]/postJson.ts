// The course editor's fetch wrapper: JSON in, JSON out, and the route's
// `error` message thrown so a caller can toast it. Moved out of
// CourseDetailView.tsx unchanged when AUTH-010's sections needed it too.
export async function postJson(url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}
