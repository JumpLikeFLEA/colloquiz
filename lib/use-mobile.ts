import * as React from "react";

const MOBILE_BREAKPOINT = 768;

// matchMedia is an external store, so it is read through useSyncExternalStore
// rather than mirrored into state from an effect. The server snapshot is
// `false`, matching the previous behaviour where the initial state was
// `undefined` and the hook returned `!!isMobile`.
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
