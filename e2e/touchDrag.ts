/**
 * A touch drag the phone specs can drive (OPS-045, docs/decisions/0247 "Touch drag").
 * Press, hold past the lesson player's TouchSensor delay (200 ms,
 * app/components/lesson-player/practice/useLessonPlayerSensors.ts), move in steps,
 * release, and report which dnd-kit sensor captured the press.
 *
 * Which sensor: dnd-kit marks the native event that activated a sensor with
 * `event.dndKit.capturedBy` (the sensor class; node_modules/@dnd-kit/core core.esm.js,
 * `nativeEvent.dndKit = { capturedBy: sensor.sensor }`). The production build
 * minifies class names, so the sensor is named by its activator's event name
 * (onPointerDown → PointerSensor, onTouchStart → TouchSensor, onMouseDown →
 * MouseSensor, onKeyDown → KeyboardSensor).
 */

import type { Page } from "@playwright/test";

export type DragReport = {
  /** How the touches were produced. */
  method: "cdp-touch" | "unavailable";
  /** Each event dnd-kit captured, as "<event type> → <sensor>". */
  captured: string[];
  note?: string;
};

const SENSOR_BY_ACTIVATOR: Record<string, string> = {
  onPointerDown: "PointerSensor",
  onTouchStart: "TouchSensor",
  onMouseDown: "MouseSensor",
  onKeyDown: "KeyboardSensor",
};

/** Records, on window (after React's root listener), which sensor captured each press. */
async function watchCaptures(page: Page): Promise<void> {
  await page.evaluate((names) => {
    const w = window as unknown as { __dndCaptured: string[] };
    w.__dndCaptured = [];
    for (const type of ["pointerdown", "touchstart", "mousedown", "keydown"]) {
      window.addEventListener(type, (e) => {
        const by = (e as Event & { dndKit?: { capturedBy?: { activators?: { eventName: string }[] } } }).dndKit
          ?.capturedBy;
        if (by) {
          const ev = by.activators?.[0]?.eventName ?? "?";
          w.__dndCaptured.push(`${type} → ${names[ev] ?? ev}`);
        }
      });
    }
  }, SENSOR_BY_ACTIVATOR);
}

async function readCaptures(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __dndCaptured: string[] }).__dndCaptured);
}

/** Drags with one finger from (x, y) to (x, y + dy) in page CSS pixels, holding `holdMs` first. */
export async function touchDrag(
  page: Page,
  browserName: string,
  from: { x: number; y: number },
  dy: number,
  holdMs = 300,
  steps = 10,
): Promise<DragReport> {
  await watchCaptures(page);
  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const point = (y: number) => [{ x: from.x, y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.y) });
    await page.waitForTimeout(holdMs);
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(from.y + (dy * i) / steps) });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    return { method: "cdp-touch", captured: await readCaptures(page) };
  }

  // WebKit: not drivable (OPS-045, 0247). Playwright has no touch-move API
  // (page.touchscreen only taps), and the one honest try, synthetic TouchEvents,
  // fails at `new Touch(...)`: "TypeError: Illegal constructor" in WebKit 26.6.
  return {
    method: "unavailable",
    captured: [],
    note: "touch drag: not drivable in WebKit (no touch-move API; new Touch() is an illegal constructor)",
  };
}
