import { describe, expect, it } from "vitest";
import { WRITING_ANSWER_MAX_CHARS } from "../lessons/taskBlocks";
import { createDraftStore, parseDraft, writingDraftKey, type DraftBackend } from "./draftStore";

function memoryBackend(): DraftBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: DraftBackend = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("writing draft store", () => {
  const key = writingDraftKey("/courses/c/l", "b1");

  it("names the key by lesson path and block", () => {
    expect(key).toBe("alliengll.writing.draft.v1:/courses/c/l:b1");
  });

  it("round-trips text with line breaks", () => {
    const backend = memoryBackend();
    createDraftStore(key, backend).write("one\n\ntwo");
    expect(createDraftStore(key, backend).read()).toBe("one\n\ntwo");
  });

  it("removes the entry when the text is emptied", () => {
    const backend = memoryBackend();
    const store = createDraftStore(key, backend);
    store.write("x");
    store.write("");
    expect(backend.data.size).toBe(0);
  });

  it("falls back to memory when the backend throws", () => {
    const store = createDraftStore(key, throwing);
    expect(() => store.write("kept")).not.toThrow();
    expect(store.read()).toBe("kept");
  });

  it("falls back to memory when storage is blocked (null backend)", () => {
    const store = createDraftStore(key, null);
    store.write("kept");
    expect(store.read()).toBe("kept");
  });

  it("keeps memory only when there is no key (the Studio preview)", () => {
    const backend = memoryBackend();
    const store = createDraftStore(null, backend);
    store.write("preview");
    expect(store.read()).toBe("preview");
    expect(backend.data.size).toBe(0);
  });

  it("reads a corrupt value as empty", () => {
    expect(parseDraft("{not json")).toBe("");
    expect(parseDraft('{"v":2,"text":"x"}')).toBe("");
    expect(parseDraft('{"v":1,"text":5}')).toBe("");
    expect(parseDraft("null")).toBe("");
    const backend = memoryBackend();
    backend.data.set(key, "garbage");
    expect(createDraftStore(key, backend).read()).toBe("");
  });

  it("caps the stored text", () => {
    const backend = memoryBackend();
    const store = createDraftStore(key, backend);
    store.write("a".repeat(WRITING_ANSWER_MAX_CHARS + 10));
    expect(store.read()).toHaveLength(WRITING_ANSWER_MAX_CHARS);
  });
});
