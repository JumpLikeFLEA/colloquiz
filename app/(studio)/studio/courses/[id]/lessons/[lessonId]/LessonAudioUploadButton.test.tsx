import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonAudioUploadButton, LessonAudioUploadProvider } from "./LessonAudioUploadButton";

afterEach(() => {
  cleanup();
});

function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("LessonAudioUploadButton", () => {
  it("states the limits before a file is picked", () => {
    render(<LessonAudioUploadButton onUploaded={vi.fn()} />);
    expect(screen.getByText("MP3 or M4A, up to 5 MB")).toBeDefined();
    expect((document.querySelector('input[type="file"]') as HTMLInputElement).accept).toContain(".mp3");
  });

  it("refuses a WAV without calling the upload", async () => {
    const upload = vi.fn();
    const onUploaded = vi.fn();
    render(
      <LessonAudioUploadProvider value={upload}>
        <LessonAudioUploadButton onUploaded={onUploaded} />
      </LessonAudioUploadProvider>,
    );
    pickFile(new File(["x"], "clip.wav", { type: "audio/wav" }));
    await waitFor(() => expect(screen.getByText(/must be MP3 or M4A/)).toBeDefined());
    expect(upload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("uploads an MP3 through the provided upload and passes the URL on", async () => {
    const upload = vi.fn().mockResolvedValue({ url: "https://cdn/lesson-images/c1/new.mp3" });
    const onUploaded = vi.fn();
    render(
      <LessonAudioUploadProvider value={upload}>
        <LessonAudioUploadButton onUploaded={onUploaded} />
      </LessonAudioUploadProvider>,
    );
    const file = new File(["x"], "Lesson 1.mp3", { type: "audio/mpeg" });
    pickFile(file);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("https://cdn/lesson-images/c1/new.mp3"));
    expect(upload).toHaveBeenCalledWith(file);
  });

  it("shows the upload's error and keeps the block unchanged", async () => {
    const upload = vi.fn().mockResolvedValue({ error: "mime type audio/mpeg is not supported" });
    const onUploaded = vi.fn();
    render(
      <LessonAudioUploadProvider value={upload}>
        <LessonAudioUploadButton onUploaded={onUploaded} />
      </LessonAudioUploadProvider>,
    );
    pickFile(new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    await waitFor(() => expect(screen.getByText("mime type audio/mpeg is not supported")).toBeDefined());
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("refuses when no editor provides an upload", async () => {
    const onUploaded = vi.fn();
    render(<LessonAudioUploadButton onUploaded={onUploaded} />);
    pickFile(new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    await waitFor(() => expect(screen.getByText("Uploading audio isn't available here.")).toBeDefined());
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
