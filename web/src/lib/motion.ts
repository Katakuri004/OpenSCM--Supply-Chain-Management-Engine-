import { useSyncExternalStore } from "react";

type MotionPreference = "system" | "reduce";
const key = "scm-motion-preference";
const eventName = "scm-motion-preference-change";
let sessionPreference: MotionPreference | undefined;

function preference(): MotionPreference {
  if (sessionPreference) return sessionPreference;
  try {
    return localStorage.getItem(key) === "reduce" ? "reduce" : "system";
  } catch {
    return "system";
  }
}
function snapshot() {
  if (typeof window === "undefined") return "system-full";
  return preference() === "reduce"
    ? "reduce"
    : window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "system-reduced"
      : "system-full";
}
function subscribe(change: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", change);
  window.addEventListener("storage", change);
  window.addEventListener(eventName, change);
  return () => {
    media.removeEventListener("change", change);
    window.removeEventListener("storage", change);
    window.removeEventListener(eventName, change);
  };
}
export function useMotion() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system-full");
  return {
    reduced: value !== "system-full",
    preference: (value === "reduce" ? "reduce" : "system") as MotionPreference,
    setPreference(next: MotionPreference) {
      try {
        localStorage.setItem(key, next);
        sessionPreference = undefined;
      } catch {
        // Storage can be disabled; the choice still applies for this browser session.
        sessionPreference = next;
      }
      document.documentElement.dataset.motion = next === "reduce" ? "reduced" : "system";
      window.dispatchEvent(new Event(eventName));
    },
  };
}
