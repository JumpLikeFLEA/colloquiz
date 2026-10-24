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
  // TCH-016 (0206 Decision 13): the articles for every other feature.
  {
    slug: "voice-tasks",
    title: "Voice tasks",
    purpose: "Ask learners to record themselves speaking, inside a lesson.",
    steps: [
      "Open the lesson in the editor, press **Add block** and choose **Voice task** (below the exercises).",
      "Type the prompt: what the learner should say.",
      "Set the length limit. If this task is the second recording of a pair, use **Before / after comparison** to say which one it is.",
      "Optionally fill **Expressions to listen for (optional)**: one expression per line. Learners see them as chips to try to use, and the AI feedback marks the ones they said.",
      "Press **Save**, then publish the lesson (see **Publish**).",
    ],
    tips: [
      "A voice task is never scored and does not count toward the lesson's exercises.",
      "Setting a task to After fills its expressions from the Before task, once. A list you wrote yourself is never overwritten.",
      "A visitor without an account can practise, but the recording stays on their device and is not sent.",
    ],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "reviews-and-ai-feedback",
    title: "Reviews and AI feedback",
    purpose: "Answer cohort recordings in writing, and see or hide the AI feedback learners get.",
    steps: [
      "Open **Reviews** in the menu. Use the Course, Run, Week and Status filters to find a recording.",
      "Listen to the take, write your feedback in the box (the **Bold** button or Ctrl/⌘+B makes text bold), and check **What the learner sees**.",
      "Press **Publish**. Use **Save draft** to keep it private until you are ready.",
      "To read the AI feedback on any recording of your courses, open **AI feedback** in the menu and choose a take.",
      "If an analysis is wrong, open it and press **Hide this analysis**. The learner then sees that the feedback was withdrawn and can send the recording again.",
    ],
    tips: [
      "Once feedback is published the learner can no longer replace that recording.",
      "AI feedback is shown to the learner at once and is never a score. On a cohort course it sits beside your written feedback.",
      "A hidden analysis stays in the list, marked Withdrawn, so you can see what was hidden. Hiding cannot be undone.",
      "Final comments for a whole run are in the **Final comments** section of Reviews.",
    ],
    goTo: { label: "Open Reviews", path: "/studio/reviews" },
    audience: "all",
  },
  {
    slug: "groups",
    title: "Groups",
    purpose: "Put linked students into named groups so you can filter and assign to them together.",
    steps: [
      "Open **Learners** and press **Groups**.",
      "Type a name and press **Create group**.",
      "Open the group. Under **Add students**, tick the students and press **Add to group**.",
      "Back on **Learners**, use the **Group** filter to narrow the list to one group.",
    ],
    tips: [
      "Only students linked to you can be in a group (see **Your student link**).",
      "Students never see a group's name in the app. It appears only in their own data export.",
      "Assign homework to a whole group from the group's page, or add an event for just that group.",
      "**Delete group** also removes the group's events. It does not remove the students.",
    ],
    goTo: { label: "Open Groups", path: "/studio/learners/groups" },
    audience: "all",
  },
  {
    slug: "messages-and-telegram",
    title: "Messages and Telegram",
    purpose: "Talk to a linked student in the app, and get a Telegram ping when they write.",
    steps: [
      "Open **Messages** in the menu. Conversations with a student's unanswered question come first.",
      "Open a conversation, write your reply and send it. To start one, choose a student under the list's **Linked students you haven't written to** heading.",
      "If a question needs no reply, press **No reply needed**. The conversation leaves your unanswered list and returns if the student writes again.",
      "To get Telegram pings, press **Get messages in Telegram** at the top of the Messages page and follow the link. **Turn off** stops them.",
    ],
    tips: [
      "Students can start a conversation with **Ask the teacher** under an exercise; their answer can come attached.",
      "A conversation closes when the student link ends. You can still read it.",
      "Telegram only tells you something arrived. Reply in the app.",
    ],
    goTo: { label: "Open Messages", path: "/studio/messages" },
    audience: "all",
  },
  {
    slug: "calendar-and-events",
    title: "Calendar and events",
    purpose: "See every call, event, start and due date in one month view, and add your own events.",
    steps: [
      "Open **Calendar** in the menu. Use the arrows and **Today** to move between months.",
      "To add an event for a cohort run, open the course's runs page (see **Cohort runs, calls and invites**) and press **Add event** in that run's Events section.",
      "To add an event for a group, open the group (see **Groups**) and press **Add event**.",
      "Fill in the title and the start; the end and a link are optional.",
      "To put the calendar in your phone's or computer's calendar app, press **Create link** under **Subscribe in your calendar** and paste the address into it.",
    ],
    tips: [
      "Times show in your own time zone.",
      "The subscription address is shown once. **Replace link** gives a new one and stops the old one working everywhere.",
      "An event for a run is seen by both tiers. An event for a group is seen only by that group's students, without the group's name.",
    ],
    goTo: { label: "Open Calendar", path: "/studio/calendar" },
    audience: "all",
  },
  {
    slug: "course-access",
    title: "Course access",
    purpose: "Open a self-paced paid course for a linked student who paid you outside the app.",
    steps: [
      "Open **Learners** and then the student's page. The student must be linked to you.",
      "Find **Course access**. It lists your self-paced courses.",
      "Press **Open access** on the course. The row then says **Access opened**.",
      "To take it back, press **Close access** and confirm.",
    ],
    tips: [
      "The same grants are listed on the course's own page under **Granted access**.",
      "If a student already has the course through a purchase or from an admin, there is no button: you cannot change what you did not give.",
      "Cohort courses do not use this. They use runs and invites.",
    ],
    goTo: { label: "Open Learners", path: "/studio/learners" },
    audience: "all",
  },
  {
    slug: "learners-and-stats",
    title: "Learners and stats",
    purpose: "See who is in your courses, how far they got, and how each exercise is going.",
    steps: [
      "Open **Learners**. Filter by Course and Run to see people, with lessons opened and completed and recordings sent.",
      "Open a learner's name for their page: lessons, recordings and feedback. For a linked student it also shows **Answers** with their scores.",
      "For a whole course, open it and press **Stats**: how many learners opened and completed each lesson, and the average for each exercise.",
    ],
    tips: [
      "Scores are shown only for students linked to you. Other learners show no scores.",
      "An exercise's average appears from 5 learners and counts each learner's first try. It restarts when you edit the exercise.",
      "You see only learners of the courses you edit.",
    ],
    goTo: { label: "Open Learners", path: "/studio/learners" },
    audience: "all",
  },
  {
    slug: "cohort-runs",
    title: "Cohort runs, calls and invites",
    purpose: "Run a course for a group on a common start date, with lessons opening week by week.",
    steps: [
      "Open the course and, under **Format**, choose Cohort. Give each lesson a week.",
      "Press **Runs and calls**, then **New run**. Give it a title and a start date.",
      "In the run, press **Add call** for each live call. **Repeat weekly** makes it a series.",
      "Under Invites, press **New invite**: type the learner's name and contact and choose Basic or Extended. Copy the link (it is shown once) and send it.",
      "To move a claimed learner between tiers, press **Change tier**. To end someone's access, press **Revoke**.",
    ],
    tips: [
      "A run's start cannot be changed once it has begun, and a published lesson's week cannot be moved later while a run is in progress.",
      "Extended learners see the run's calls. Basic learners do not.",
      "Add **How to join (link)** to the course so visitors know where to get access.",
      "An unclaimed invite can be deleted. A claimed one can only be revoked.",
    ],
    goTo: { label: "Open your courses", path: "/studio/courses" },
    audience: "all",
  },
  {
    slug: "your-seat",
    title: "Your seat and what a lapse does",
    purpose: "What your author seat allows, and what stays open if it ends.",
    steps: [
      "Your seat lets you create courses, edit them and use every Studio page.",
      "If the seat ends, a banner tells you at the top of every Studio page. Studio becomes read-only: buttons that change things are disabled.",
      "Ask the admin to extend the seat. Writing works again as soon as they do.",
    ],
    tips: [
      "Nothing is lost. Published courses stay up and students keep their access.",
      "You can still read and reply to messages and write feedback on recordings while the seat has ended.",
      "Your own data export includes the seat notes an admin keeps about you.",
    ],
    goTo: { label: "Open Studio", path: "/studio" },
    audience: "all",
  },
  {
    slug: "authors",
    title: "Authors: seats",
    purpose: "Give a teacher a seat, extend it, freeze it and mark the house seat.",
    steps: [
      "Open **Authors** in the menu. Under **Add a teacher**, type the email of an existing account, an optional public name and an optional **Through** date.",
      "Press **Add seat**. Copy the welcome message that appears and send it to the teacher yourself.",
      "To lengthen a seat, press **Extend**: pick a date, or use the +1, +3 and +12 month buttons to fill it, then press **Set date**.",
      "To stop a seat now, press **Freeze now** and confirm.",
      "Use **Mark as house seat** for the partner's own seat, or **Make a regular seat** to undo it.",
    ],
    tips: [
      "The teacher needs an account first. An unknown email is refused.",
      "A seat that ends within 7 days shows in the warning colour; an ended one in red.",
      "The notes field is private to admins, and is included in the teacher's data export.",
    ],
    goTo: { label: "Open Authors", path: "/studio/authors" },
    audience: "admin",
  },
  {
    slug: "catalogue-listing",
    title: "Catalogue listing",
    purpose: "Choose which published courses appear in the public catalogue.",
    steps: [
      "Open **Authors** and scroll to **Catalogue**, or open a course and find its **Catalogue** card.",
      "Switch a published course on to list it. Switch it off to take it out.",
    ],
    tips: [
      "A teacher's published course is not listed until you list it. It still opens by its link.",
      "A draft cannot be listed: the switch is disabled.",
      "Listed courses show **By <name>** on the course page, unless it is a house course.",
    ],
    goTo: { label: "Open Authors", path: "/studio/authors" },
    audience: "admin",
  },
  {
    slug: "import-grants",
    title: "Import grants",
    purpose: "Let a teacher import a course from a file.",
    steps: [
      "Open **Authors**. Each seat has a **Course import** switch.",
      "Switch it on for a seat. The teacher then sees **Imports** in the menu and **Import from file** on the Courses page.",
      "Switch it off to remove the ability.",
    ],
    tips: [
      "A teacher is limited to 3 imports in 24 hours.",
      "The switch shows the stored setting. If the seat has lapsed, the card says so: the import works again when the seat is extended.",
      "An imported file is sent to Anthropic to draft the course. The import form says so.",
    ],
    goTo: { label: "Open Authors", path: "/studio/authors" },
    audience: "admin",
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
