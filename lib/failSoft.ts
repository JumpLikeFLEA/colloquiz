/**
 * SHELL-037 — a "courtesy" read: if it throws, log it and use `fallback`, so one
 * optional section of a page can fail without taking the page down. Replaces the
 * hand-copied try/catch wrappers /my carried. The label is what the log line
 * names ("/my: my_calendar failed").
 *
 * Only for reads whose absence the page already handles. A read the page cannot
 * render without must throw, not fall back.
 */
export async function failSoft<T, F>(label: string, read: () => Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await read();
  } catch (err) {
    console.error(label, err);
    return fallback;
  }
}
