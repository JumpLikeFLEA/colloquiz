// TCH-015 (docs/decisions/0206 Decisions 7, 8, 14) — the Studio Guide as typed
// data. One list: the checklist links into it, the sidebar entry lists it, and
// the vitest (articles.test.ts) checks that every "Go there" path is a real
// app/(studio) route and every checklist step names an article here.
//
// Standing rule (CLAUDE.md): a change to a Studio flow updates its article in
// the same commit. A button's exact label is written in **bold**; GuideText
// renders that as <strong> and nothing else.

/** Who may read an article (0206 Decision 8): "importer" needs
 * can_import_course(), "admin" is for admins only. */
export type GuideAudience = "all" | "importer" | "admin";

export type GuideArticle = {
  slug: string;
  title: string;
  /** One line: what this is for. */
  purpose: string;
  steps: string[];
  tips: string[];
  /** The Studio page the steps start from. A static path: the vitest resolves it. */
  goTo: { label: string; path: string };
  audience: GuideAudience;
};

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    slug: "your-first-course",
    title: "Your first course",
    purpose: "The shortest way from a new seat to a course your students can open.",
    steps: [
      "Create a course. See **Create a course**.",
      "Add a lesson and put some theory and an exercise in it. See **Lessons and exercises**.",
      "Add a cover picture and a short summary. A course cannot be published without them. See **Cover and summary**.",
      "Look at the lesson the way a learner does. See **Preview**.",
      "Publish the lesson, then the course. See **Publish**.",
      "Share it: make your student link and send it to your students. See **Your student link**.",
    ],
    tips: [
      "A course you publish is not in the public catalogue. It opens by its link, so nobody sees it until you share it.",
      "The **Get started** list on the Inbox ticks these steps for you as you go.",
    ],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "create-a-course",
    title: "Create a course",
    purpose: "Make an empty course you can fill with lessons.",
    steps: [
      "Open **Courses** in the menu.",
      "Press **New course**.",
      "Type a title. The slug (the last part of the course's web address) fills in from the title. You can change it before you create the course.",
      "Create the course. It opens in the editor as a draft.",
    ],
    tips: [
      "A draft is visible only to you. Nothing you do on a draft reaches a learner.",
      "No two courses can share a slug. If yours is taken, add a word to it.",
    ],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "import-a-course",
    title: "Import a course from a file",
    purpose: "Turn a PDF, DOCX, Markdown or text file into a draft course.",
    steps: [
      "Open **Imports** in the menu and press **Import from file**.",
      "Choose the file, type a title and pick the level.",
      "Press **Start import** and wait. You can leave the page; the import keeps going.",
      "When it is done, press **Open course**. Read the notes under **Review before you publish**: they list what the import changed or was unsure about.",
    ],
    tips: [
      "The file is sent to Anthropic to draft the course. The form says so before you start.",
      "The result is always a draft. Nothing is published until you publish it.",
    ],
    goTo: { label: "Import from file", path: "/studio/imports/new" },
    audience: "importer",
  },
  {
    slug: "lessons-and-exercises",
    title: "Lessons and exercises",
    purpose: "Add lessons to a course and fill them with theory and exercises.",
    steps: [
      "Open the course and press **Add lesson**. Type a title and press **Add lesson** again.",
      "Open the lesson. Use **Add block** to add theory (text, images, tables, video) or an exercise.",
      "Exercises are under the **Exercise** heading of that menu: multiple choice, true / false, put in order, match pairs, fill the gaps and more. A new exercise starts empty, and every message tells you what is missing.",
      "For a long lesson, group the blocks into chapters with **Add chapter**.",
      "Press **Save**. A saved lesson is a draft until you publish it (see **Publish**).",
    ],
    tips: [
      "Write an explanation for each wrong answer. Learners see it when they check their answer.",
      "A lesson is about 10 to 15 minutes. A course is 3 to 8 lessons.",
    ],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "preview",
    title: "Preview",
    purpose: "See a lesson exactly as a learner sees it before you publish it.",
    steps: [
      "Open the lesson in the editor and press **Save**.",
      "Press **Preview**. It appears once the lesson has a saved version.",
      "Go through the lesson as a learner would. Nothing you answer in a preview is saved.",
    ],
    tips: ["Check it at a phone's width too. Most learners arrive from a phone."],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "access-levels",
    title: "Access levels",
    purpose: "Choose who may open each lesson.",
    steps: [
      "Open the course. Each lesson row has a menu next to its title.",
      "Pick **Open to anyone** for lessons a visitor can play without an account, **Sign-in required** for lessons that need a free account, or **Purchase required** for lessons that need access you have granted.",
      "A course needs at least one lesson that is open to anyone before it can be published. The editor tells you if you try to remove the last one.",
    ],
    tips: [
      "The default is fine for a first course. You do not have to change anything here.",
      "Use the eye icon on a row to see what a visitor sees on a lesson that is not open to them.",
    ],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "cover-and-summary",
    title: "Cover and summary",
    purpose: "The picture and the one-line description on the course's card.",
    steps: [
      "Open the course and find **Course details**.",
      "Type the catalogue summary: one short sentence about what a learner gets.",
      "Choose a cover image. You can crop it before it uploads.",
      "Press **Save**. The **Catalogue card preview** below shows how the card looks.",
    ],
    tips: ["Both are required to publish. If **Publish** refuses, check these first."],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "publish",
    title: "Publish",
    purpose: "Make the course open to the people you share it with.",
    steps: [
      "Publish each lesson learners should see: open it, press **Preview**, then **Publish this version**. Learners only ever see a published lesson.",
      "Check that the course has a cover, a summary and a lesson that is open to anyone.",
      "Open the course and press **Publish** at the top right.",
      "To take it down later, press **Unpublish**. People who already have access keep it.",
    ],
    tips: [
      "A published course of yours is unlisted: it opens by its link and is not in the public catalogue unless an admin lists it.",
      "If you change a lesson after publishing it, its label says **Unpublished changes**. Learners keep seeing the old version until you publish the new one.",
    ],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "your-student-link",
    title: "Your student link",
    purpose: "One link you send to a student so they appear in your list.",
    steps: [
      "Open **Learners** in the menu.",
      "In **Your student link**, press **Create link**.",
      "Copy the link and send it to your student. It is shown once; if you lose it, press **Rotate link** for a new one (the old one stops working).",
      "When the student opens it and presses **Join**, they appear under your linked students.",
    ],
    tips: [
      "The student sees what you will be able to see before they join.",
      "You can remove a linked student at any time from the same page.",
    ],
    goTo: { label: "Open Learners", path: "/studio/learners" },
    audience: "all",
  },
  {
    slug: "homework",
    title: "Homework",
    purpose: "Give students a lesson or a whole course to do, with an optional due date.",
    steps: [
      "Open **Homework** in the menu and press **Assign homework**.",
      "Choose the course and what to assign: one lesson or **The whole course**.",
      "Pick a due date if you want one, add a note, and tick who it is for: groups or single students.",
      "Press **Assign**. Students see it on their **My courses** page and on the lesson.",
    ],
    tips: [
      "A due date is information only. Nothing locks when it passes.",
      "The list shows who has finished. Open **Students** on an assignment to see each person.",
    ],
    goTo: { label: "Open Homework", path: "/studio/homework" },
    audience: "all",
  },
];

/** Whether the reader may see an article (0206 Decision 8). */
export function canReadArticle(a: GuideArticle, who: { isAdmin: boolean; canImport: boolean }): boolean {
  if (a.audience === "all") return true;
  if (a.audience === "admin") return who.isAdmin;
  return who.canImport;
}

export function visibleArticles(who: { isAdmin: boolean; canImport: boolean }): GuideArticle[] {
  return GUIDE_ARTICLES.filter((a) => canReadArticle(a, who));
}

export function findArticle(slug: string): GuideArticle | undefined {
  return GUIDE_ARTICLES.find((a) => a.slug === slug);
}
