import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";
import { LessonPageClient } from "@/app/(english)/courses/[courseSlug]/[lessonSlug]/LessonPageClient";
import { LinkedLessonPageClient } from "@/app/(english)/courses/[courseSlug]/[lessonSlug]/LinkedLessonPageClient";
import type { AskTeacherConfig } from "@/lib/askTeacher/options";

/**
 * TCH-006 (docs/decisions/0153) — "Ask the teacher" on an exercise and a voice
 * task card. The link exists only in LinkedLessonPageClient, which the lesson
 * page renders only for a signed-in student with a qualifying teacher; the
 * dialog opens on a frozen snapshot and sends it with the message.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const raw = PLAYGROUND_EXAMPLES.find((e) => e.label === "selection — MCQ single")!.raw as Record<string, unknown>;
const exercise = { ...raw, kind: "practice" };
const voice = { id: "v1", kind: "task", type: "voice", prompt: [{ text: "Tell us about your week." }], maxSeconds: 150 };
const document = [voice, exercise];

const TEACHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEACHER_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STUDENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const VERSION = "11111111-1111-4111-8111-111111111111";

function linked(cfg: AskTeacherConfig) {
  return (
    <LinkedLessonPageClient
      header={null}
      backLink={null}
      document={document}
      lessonTitle="Lesson 1"
      attemptId="a1"
      courseSlug="course-a"
      nextLesson={null}
      lessonVersionId={VERSION}
      isSignedIn={false}
      lessonPath="/courses/course-a/lesson-1"
      previousBestPercent={null}
      voiceTasks={{ mode: "practice" }}
      askTeacher={cfg}
    />
  );
}

function config(teachers = [{ id: TEACHER, label: "Anna" }]): AskTeacherConfig {
  return {
    studentId: STUDENT,
    teachers,
    course: { slug: "course-a", title: "Course A" },
    lesson: { id: "les-1", slug: "lesson-1", title: "Lesson 1" },
    versionId: VERSION,
  };
}

// The player also fires funnel events through fetch; only the message post counts.
function messagePosts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/messages");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LessonPlayer — Ask the teacher (TCH-006)", () => {
  it("shows no link in the preview, the demo or the page a visitor who isn't linked gets", async () => {
    const { unmount } = render(<LessonPlayer document={document} attemptId="a1" practiceRenderer={practiceRenderer} />);
    expect(await screen.findByText("Which sentence is correct?")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Ask the teacher" })).toBeNull();
    unmount();

    render(
      <LessonPageClient
        header={null}
        backLink={null}
        document={document}
        lessonTitle="Lesson 1"
        attemptId="a1"
        courseSlug="course-a"
        nextLesson={null}
        lessonVersionId={VERSION}
        isSignedIn={false}
        lessonPath="/courses/course-a/lesson-1"
        previousBestPercent={null}
        voiceTasks={{ mode: "practice" }}
      />,
    );
    expect(await screen.findByText("Which sentence is correct?")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Ask the teacher" })).toBeNull();
  });

  it("puts one link on the exercise card and one on the voice task", async () => {
    render(linked(config()));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Ask the teacher" })).toHaveLength(2));
  });

  it("opens on the exercise, 'Exercise 1' even though a voice task comes first, without the answer key", async () => {
    render(linked(config()));
    await screen.findByText("Which sentence is correct?");
    const links = await screen.findAllByRole("button", { name: "Ask the teacher" });
    fireEvent.click(links[1]); // the exercise card

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Course A · Lesson 1");
    expect(dialog.textContent).toContain("Exercise 1");
    expect(dialog.textContent).toContain("She go to school every day.");
    expect(dialog.textContent).toContain("Anna");
    // Not answered yet: the toggle is disabled and says why.
    const include = screen.getByLabelText("Include my answer") as HTMLInputElement;
    expect(include.disabled).toBe(true);
    expect(screen.getByText("Check your answer first if you want to include it.")).toBeDefined();
  });

  it("after Check, the answer is offered, included by default, and can be left out", async () => {
    render(linked(config()));
    fireEvent.click(await screen.findByRole("radio", { name: "She goes to school every day." }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    const links = await screen.findAllByRole("button", { name: "Ask the teacher" });
    fireEvent.click(links[1]);
    const dialog = await screen.findByRole("dialog");

    const include = screen.getByLabelText("Include my answer") as HTMLInputElement;
    expect(include.disabled).toBe(false);
    expect(include.checked).toBe(true);
    expect(dialog.textContent).toContain("She goes to school every day.");
    fireEvent.click(include);
    expect(dialog.textContent).toContain("Answer not included.");
  });

  it("sends the snapshot with the message and does not refresh the lesson", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    render(linked(config()));
    fireEvent.click(await screen.findByRole("radio", { name: "She goes to school every day." }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "Ask the teacher" }))[1]);

    fireEvent.change(await screen.findByLabelText("Your question"), { target: { value: "Why not the first one?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Sent");
    expect(messagePosts(fetchMock)).toHaveLength(1);
    const body = JSON.parse(messagePosts(fetchMock)[0][1].body);
    expect(body).toMatchObject({ teacherId: TEACHER, studentId: STUDENT });
    expect(body.attachment).toMatchObject({
      kind: "exercise",
      number: 1,
      blockId: "playground-selection",
      versionId: VERSION,
      block: exercise,
      response: { selectedOptionIds: ["b"] },
    });
    expect(screen.getByRole("link", { name: "Open the conversation" }).getAttribute("href")).toBe(`/my/messages/${TEACHER}`);
  });

  it("with two qualifying teachers it asks which, and sends to the one picked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    render(linked(config([{ id: TEACHER, label: "Anna" }, { id: TEACHER_2, label: "Boris" }])));
    fireEvent.click((await screen.findAllByRole("button", { name: "Ask the teacher" }))[1]);
    const boris = await screen.findByRole("radio", { name: "Boris" });
    expect((screen.getByRole("radio", { name: "Anna" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(boris);

    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Help" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Sent");
    expect(JSON.parse(messagePosts(fetchMock)[0][1].body).teacherId).toBe(TEACHER_2);
  });

  it("a voice task is asked about with no answer to include", async () => {
    render(linked(config()));
    fireEvent.click((await screen.findAllByRole("button", { name: "Ask the teacher" }))[0]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Voice task");
    expect(dialog.textContent).toContain("Tell us about your week.");
    expect(screen.queryByLabelText("Include my answer")).toBeNull();
  });

  it("a refusal from the server is shown under the box and nothing is marked sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "You can't ask this teacher about this exercise." }) }));
    render(linked(config()));
    fireEvent.click((await screen.findAllByRole("button", { name: "Ask the teacher" }))[1]);
    fireEvent.change(await screen.findByLabelText("Your question"), { target: { value: "Help" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("You can't ask this teacher about this exercise.");
    expect(screen.queryByText("Sent")).toBeNull();
  });
});
