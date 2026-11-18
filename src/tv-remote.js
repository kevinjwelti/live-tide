/** Remote decisions for the TV app. The website only uses these when ?tv=1 is set. */

export function tvBackAction({ pickerOpen = false, forecastDetail = false, forecastOpen = false } = {}) {
  if (pickerOpen) return "close-picker";
  if (forecastDetail) return "close-detail";
  if (forecastOpen) return "close-forecast";
  return "exit";
}

export function tvShouldWake({ tv = false, awake = false, pickerOpen = false, forecastOpen = false } = {}) {
  return Boolean(tv && !awake && !pickerOpen && !forecastOpen);
}

export function tvClickTarget(element, { trusted = false } = {}) {
  if (trusted || !element) return false;
  const tag = element.tagName;
  if (tag === "BUTTON" || tag === "A") return true;
  if (element.getAttribute?.("role") === "button") return true;
  const className = element.className || "";
  return typeof className === "string" && className.includes("tide-pill");
}
