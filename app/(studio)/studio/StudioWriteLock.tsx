"use client";

import { createContext, useContext } from "react";
import { UNLOCKED, type WriteLock } from "@/lib/studioWriteLock";

// TCH-008 (docs/decisions/0155). The layout reads the database's answer once
// (studio_can_write, 083) and every Studio client component that writes asks
// this for `disabled` and the reason to show. A component outside the provider
// (the admin preview, a test) is unlocked, which is the only safe default for a
// courtesy: the database refuses the write whatever the button says.
const WriteLockContext = createContext<WriteLock>(UNLOCKED);

export function WriteLockProvider({ lock, children }: { lock: WriteLock; children: React.ReactNode }) {
  return <WriteLockContext.Provider value={lock}>{children}</WriteLockContext.Provider>;
}

export function useWriteLock(): WriteLock {
  return useContext(WriteLockContext);
}

/**
 * Wraps a part of a page whose controls all change data. While the seat is
 * frozen it is a native `<fieldset disabled>`, so every button, input, select
 * and checkbox inside is disabled, and the browser shows the reason as the
 * tooltip. Links inside stay links, so reading and navigating work. When not
 * frozen it renders its children and nothing else, so the page is byte-for-byte
 * what it was before TCH-008.
 *
 * The `[&_:disabled]` classes dim every disabled control inside: many Studio
 * buttons are hand-rolled and carry no disabled style of their own.
 *
 * `min-w-0`: a fieldset's default min-width is min-content, which overflows a
 * 360px screen. Do not wrap a filter row or anything else that only reads.
 */
export function WriteArea({ children, className }: { children: React.ReactNode; className?: string }) {
  const lock = useWriteLock();
  if (!lock.locked) return <>{children}</>;
  return (
    <fieldset disabled title={lock.reason} className={`m-0 min-w-0 border-0 p-0 [&_:disabled]:cursor-not-allowed [&_:disabled]:opacity-50 ${className ?? ""}`}>
      {children}
    </fieldset>
  );
}
