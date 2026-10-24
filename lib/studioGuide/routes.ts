// TCH-015 — resolves a "Go there" path against the Studio route table. Used by
// the vitest (articles.test.ts) with the routes it reads off app/(studio); kept
// out of the test so the matching rule has one home.

/** A Next route as the files spell it: "/studio/courses/[id]/runs". */
export function matchesRoute(path: string, route: string): boolean {
  const p = path.split("/").filter(Boolean);
  const r = route.split("/").filter(Boolean);
  if (p.length !== r.length) return false;
  return r.every((seg, i) => /^\[.+\]$/.test(seg) || seg === p[i]);
}

export function pathResolves(path: string, routes: string[]): boolean {
  return routes.some((r) => matchesRoute(path, r));
}
