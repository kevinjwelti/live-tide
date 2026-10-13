/**
 * Display-only TV mode (?kiosk). Wake lock, midnight reload, burn-in nudge.
 * The beach clock is whatever setPlace() last selected.
 */
import { startOfNextZonedDay, zonedParts } from "./time.js";

export const KIOSK_UPTIME_MS = 24 * 60 * 60 * 1000;
/** Reload this many seconds after local midnight, not on the exact tick. */
export const KIOSK_MIDNIGHT_GRACE_SEC = 20;
export const KIOSK_BURN_MS = 3 * 60 * 1000;
export const KIOSK_BURN_PX = 6;
export const KIOSK_RETRY_START_MS = 15_000;
export const KIOSK_RETRY_MAX_MS = 5 * 60 * 1000;

export function isKiosk() {
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).has("kiosk");
}

export function shouldKioskReload({ uptimeMs, dateChanged, secondsIntoLocalDay }) {
  if (uptimeMs > KIOSK_UPTIME_MS) return true;
  if (dateChanged && secondsIntoLocalDay >= KIOSK_MIDNIGHT_GRACE_SEC) return true;
  return false;
}

export function localDayKey(date) {
  const p = zonedParts(date);
  const month = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${p.year}-${month}-${day}`;
}

export function secondsIntoLocalDay(date) {
  const p = zonedParts(date);
  return p.hour * 3600 + p.minute * 60 + p.second;
}

export function kioskReloadDue(now, bootMs) {
  const boot = new Date(bootMs);
  return shouldKioskReload({
    uptimeMs: now.getTime() - bootMs,
    dateChanged: localDayKey(now) !== localDayKey(boot),
    secondsIntoLocalDay: secondsIntoLocalDay(now),
  });
}

/** Integer pixel shift inside ±KIOSK_BURN_PX so type stays sharp at rest. */
export function randomBurnShift(rng = Math.random) {
  const axis = () => Math.max(-KIOSK_BURN_PX, Math.min(KIOSK_BURN_PX, Math.round(rng() * 12 - 6)));
  return { x: axis(), y: axis() };
}

export function nextRetryDelay(current, max = KIOSK_RETRY_MAX_MS) {
  const grown = Math.round(current * 1.8);
  return Math.min(max, Math.max(KIOSK_RETRY_START_MS, grown));
}

export const KIOSK_QUIET_AFTER_MS = 60_000;
export const KIOSK_WAKE_EVERY_MS = 5 * 60 * 1000;
export const KIOSK_WAKE_FOR_MS = 8_000;

/** True when kiosk type should rest at a whisper. */
export function kioskTextQuiet(
  elapsedMs,
  {
    idleMs = KIOSK_QUIET_AFTER_MS,
    everyMs = KIOSK_WAKE_EVERY_MS,
    wakeMs = KIOSK_WAKE_FOR_MS,
  } = {}
) {
  if (elapsedMs < idleMs) return false;
  const into = (elapsedMs - idleMs) % everyMs;
  return into < everyMs - wakeMs;
}

function startQuietFade(bootMs) {
  const root = document.documentElement;
  const apply = () => {
    root.dataset.kioskQuiet = kioskTextQuiet(Date.now() - bootMs) ? "1" : "0";
  };
  apply();
  window.setInterval(apply, 1000);
}

function applyBurnShift() {
  const shift = randomBurnShift();
  const root = document.documentElement;
  root.style.setProperty("--burn-x", `${shift.x}px`);
  root.style.setProperty("--burn-y", `${shift.y}px`);
}

function startBurnIn() {
  window.setInterval(applyBurnShift, KIOSK_BURN_MS);
}

function startWake() {
  const video = document.querySelector("#kiosk-wake");
  const play = () => {
    if (!video) return;
    video.muted = true;
    const pending = video.play();
    if (pending?.catch) pending.catch(() => {});
  };

  let sentinel = null;
  const acquire = async () => {
    play();
    if (!navigator.wakeLock?.request || sentinel) return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => {
        sentinel = null;
      });
    } catch (error) {
      sentinel = null;
      console.warn(error);
    }
  };

  acquire();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") acquire();
  });
  window.setInterval(() => {
    if (video?.paused) play();
  }, 60_000);
}

function startDailyReload(bootMs) {
  const reloadIfDue = () => {
    if (!kioskReloadDue(new Date(), bootMs)) return false;
    location.reload();
    return true;
  };

  const armMidnight = () => {
    const target = startOfNextZonedDay(new Date()).getTime() + KIOSK_MIDNIGHT_GRACE_SEC * 1000;
    const delay = Math.max(1000, target - Date.now());
    window.setTimeout(() => {
      if (!reloadIfDue()) armMidnight();
    }, delay);
  };

  armMidnight();
  window.setInterval(reloadIfDue, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reloadIfDue();
  });
}

function lockScroll() {
  const block = (event) => {
    if (event.cancelable) event.preventDefault();
  };
  document.addEventListener("wheel", block, { passive: false });
  document.addEventListener("touchmove", block, { passive: false });
}

export function initKiosk(bootMs = Date.now()) {
  if (!isKiosk()) return;
  document.documentElement.dataset.kiosk = "1";
  lockScroll();
  startWake();
  startBurnIn();
  startDailyReload(bootMs);
  startQuietFade(bootMs);
}
