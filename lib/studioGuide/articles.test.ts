import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChecklist, type ChecklistFacts } from "./checklist";
import { canReadArticle, findArticle, GUIDE_ARTICLES, visibleArticles } from "./articles";
import { matchesRoute, pathResolves } from "./routes";

// The real route table: every page.tsx under app/(studio), as a URL path.
function studioRoutes(): string[] {
  const root = join(process.cwd(), "app", "(studio)");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "page.tsx") {
        const rel = relative(root, dir)
          .split(sep)
          .filter((s) => s !== "" && !/^\(.*\)$/.test(s));
        out.push("/" + rel.join("/"));
      }
    }
  };
  walk(root);
  return out;
}

const facts: ChecklistFacts = {
  courses: [],
  hasStudentLink: false,
  linkedStudentCount: 0,
  hasClaimedInvite: false,
  hasHomework: false,
  canImport: false,
  inboxHasItems: false,
};
const draft = {
  id: "c1",
  title: "T",
  status: "draft" as const,
  lessonCount: 0,
  subtitle: null,
  coverImageUrl: null,
  createdAt: "2026-01-01",
};

describe("studio route table", () => {
  const routes = studioRoutes();

  it("is not empty (a check over zero routes proves nothing)", () => {
    expect(routes.length).toBeGreaterThan(10);
    expect(routes).toContain("/studio/courses");
    expect(routes).toContain("/studio/courses/[id]");
  });

  it("matches dynamic segments, and rejects a path that is not a route", () => {
    expect(matchesRoute("/studio/courses/abc", "/studio/courses/[id]")).toBe(true);
    expect(pathResolves("/studio/nowhere", routes)).toBe(false);
  });

  it("every article's Go there path is a real Studio route", () => {
    for (const a of GUIDE_ARTICLES) {
      expect(pathResolves(a.goTo.path, routes), `${a.slug}: ${a.goTo.path}`).toBe(true);
    }
  });

  it("every checklist href is a real Studio route", () => {
    const c = buildChecklist({ ...facts, courses: [draft] });
    if (c.phase === "hidden") throw new Error("expected a checklist");
    for (const s of [...c.core, ...c.extras]) {
      expect(pathResolves(s.href, routes), `${s.id}: ${s.href}`).toBe(true);
    }
  });
});

describe("articles", () => {
  it("slugs are unique and every article is complete", () => {
    expect(new Set(GUIDE_ARTICLES.map((a) => a.slug)).size).toBe(GUIDE_ARTICLES.length);
    for (const a of GUIDE_ARTICLES) {
      expect(a.steps.length, a.slug).toBeGreaterThan(0);
      expect(a.title.trim(), a.slug).not.toBe("");
      expect(a.purpose.trim(), a.slug).not.toBe("");
    }
  });

  it("covers the path articles the card names", () => {
    for (const slug of [
      "your-first-course",
      "create-a-course",
      "import-a-course",
      "lessons-and-exercises",
      "preview",
      "access-levels",
      "cover-and-summary",
      "publish",
      "your-student-link",
      "homework",
      "voice-tasks",
      "reviews-and-ai-feedback",
      "groups",
      "messages-and-telegram",
      "calendar-and-events",
      "course-access",
      "learners-and-stats",
      "cohort-runs",
      "your-seat",
      "authors",
      "catalogue-listing",
      "import-grants",
      "costs",
    ]) {
      expect(findArticle(slug), slug).toBeDefined();
    }
  });

  it("every checklist step names an existing article, with and without the import grant", () => {
    for (const canImport of [false, true]) {
      const c = buildChecklist({ ...facts, canImport, courses: [draft] });
      if (c.phase === "hidden") throw new Error("expected a checklist");
      expect(c.core.length + c.extras.length).toBe(8);
      for (const s of [...c.core, ...c.extras]) expect(findArticle(s.article), s.id).toBeDefined();
    }
  });

  it("**bold** markers are balanced", () => {
    for (const a of GUIDE_ARTICLES) {
      for (const t of [a.purpose, ...a.steps, ...a.tips]) {
        expect((t.match(/\*\*/g) ?? []).length % 2, `${a.slug}: ${t}`).toBe(0);
      }
    }
  });
});

describe("visibility (0206 Decision 8)", () => {
  const plain = { isAdmin: false, canImport: false };
  const adminOnly = ["authors", "catalogue-listing", "import-grants", "costs"];
  it("a plain author misses the import and admin articles; the grant shows import, an admin all", () => {
    const hidden = GUIDE_ARTICLES.filter((a) => !canReadArticle(a, plain)).map((a) => a.slug);
    expect(hidden).toEqual(["import-a-course", ...adminOnly]);
    expect(visibleArticles(plain).length).toBe(GUIDE_ARTICLES.length - 5);
    expect(visibleArticles({ isAdmin: false, canImport: true }).length).toBe(GUIDE_ARTICLES.length - 4);
    expect(visibleArticles({ isAdmin: true, canImport: true }).length).toBe(GUIDE_ARTICLES.length);
  });
  it("an admin article is for admins only", () => {
    const a = { ...GUIDE_ARTICLES[0], audience: "admin" as const };
    expect(canReadArticle(a, plain)).toBe(false);
    expect(canReadArticle(a, { isAdmin: true, canImport: false })).toBe(true);
  });
});
