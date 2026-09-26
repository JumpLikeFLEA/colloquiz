import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonImageUploadButton } from "./LessonImageUploadButton";

afterEach(() => {
  cleanup();
});

function pickFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe("LessonImageUploadButton", () => {
  it("rejects a disallowed file type client-side without calling onUpload", async () => {
    const onUpload = vi.fn();
    const onUploaded = vi.fn();
    render(<LessonImageUploadButton currentUrl={undefined} onUploaded={onUploaded} onUpload={onUpload} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    pickFile(input, file);

    await waitFor(() => expect(screen.getByText(/must be PNG, JPEG or WebP/)).toBeDefined());
    expect(onUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("calls onUpload with the file and previous url, then onUploaded with the result on success", async () => {
    const onUpload = vi.fn().mockResolvedValue({ url: "https://cdn/lesson-images/course-1/new.png" });
    const onUploaded = vi.fn();
    render(
      <LessonImageUploadButton
        currentUrl="https://cdn/lesson-images/course-1/old.png"
        onUploaded={onUploaded}
        onUpload={onUpload}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "diagram.png", { type: "image/png" });
    pickFile(input, file);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("https://cdn/lesson-images/course-1/new.png"));
    expect(onUpload).toHaveBeenCalledWith(file, "https://cdn/lesson-images/course-1/old.png");
  });

  it("shows the error onUpload returns, without calling onUploaded", async () => {
    const onUpload = vi.fn().mockResolvedValue({ error: "That file is 6 MB. The limit is 5 MB." });
    const onUploaded = vi.fn();
    render(<LessonImageUploadButton currentUrl={undefined} onUploaded={onUploaded} onUpload={onUpload} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "big.png", { type: "image/png" });
    pickFile(input, file);

    await waitFor(() => expect(screen.getByText("That file is 6 MB. The limit is 5 MB.")).toBeDefined());
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
