/**
 * `subscribe` for `useSyncExternalStore` readers of a CSS token that changes
 * with the colour scheme (VIS-004's spark colour, VIS-005's paper canvas).
 * A canvas cannot read a CSS variable, so such a reader resolves the token on
 * `<html>` and has to be told when it changes. Two things can change it: the
 * OS scheme (`prefers-color-scheme`), and the `.dark` class on `<html>` that
 * the layout's inline script toggles. Only the class is observed, so setting
 * other attributes on `<html>` does not notify.
 */
export function subscribeScheme(onChange: () => void): () => void {
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => {
    scheme.removeEventListener("change", onChange);
    observer.disconnect();
  };
}
