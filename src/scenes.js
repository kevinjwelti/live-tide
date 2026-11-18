/** Named shores. An explicit ?scene= or ?shore=classic|real beats the saved choice. */

export const SCENE_KEY = "live-tide-scene";

export const SCENES = [
  { id: "lagoon", title: "Lagoon (default)", file: "shore/scene/lagoon.jpg" },
  { id: "tropic", title: "Tropic Shore", file: "shore/tropic-water.jpg", sand: "shore/tropic-sand.jpg" },
  { id: "blacksand", title: "Black Sand", file: "shore/scene/blacksand.jpg" },
  { id: "reef", title: "Reef", file: "shore/scene/reef.jpg" },
  { id: "reef2", title: "Colorful Reef I", file: "shore/scene/reef2.jpg" },
  { id: "reef3", title: "Colorful Reef II", file: "shore/scene/reef3.jpg" },
  { id: "reef4", title: "Colorful Reef III", file: "shore/scene/reef4.jpg" },
  { id: "tidepool", title: "Tide Pool", file: "shore/scene/tidepool.jpg" },
  { id: "tidepool2", title: "Starfish Pool", file: "shore/scene/tidepool2.jpg" },
  { id: "tidepool3", title: "Anemone Pool", file: "shore/scene/tidepool3.jpg" },
  { id: "tidepool4", title: "Mirror Pool", file: "shore/scene/tidepool4.jpg" },
  { id: "classic", title: "Classic", file: "" },
];

const PHOTO = new Set(SCENES.filter((scene) => scene.file && scene.id !== "tropic").map((scene) => scene.id));

export function sceneById(id) {
  return SCENES.find((scene) => scene.id === id) || null;
}

export function readSavedScene(storage) {
  try {
    const id = storage?.getItem(SCENE_KEY) || "";
    return sceneById(id) ? id : "";
  } catch {
    return "";
  }
}

export function rememberScene(id, storage) {
  if (!sceneById(id)) return;
  try {
    storage?.setItem(SCENE_KEY, id);
  } catch {
    /* private mode */
  }
}

/**
 * Explicit ?scene= wins, including an unknown value (that falls back to the lagoon,
 * not to whatever was saved). ?shore=classic and ?shore=real win when no scene is set.
 */
export function resolveScene({ search = "", saved = "" } = {}) {
  const params = new URLSearchParams(String(search).replace(/^\?/, ""));
  if (params.has("scene")) {
    const value = params.get("scene") || "";
    if (value === "classic") return "classic";
    if (sceneById(value)) return value;
    return "lagoon";
  }
  const shore = params.get("shore");
  if (shore === "classic") return "classic";
  if (shore === "real") return "real";
  if (saved && sceneById(saved)) return saved;
  return "lagoon";
}

export function sceneDataset(id) {
  if (id === "classic") return { shore: "", scene: "", sceneChoice: "classic" };
  if (id === "real") return { shore: "real", scene: "", sceneChoice: "real" };
  if (id === "tropic") return { shore: "tropic", scene: "", sceneChoice: "tropic" };
  if (PHOTO.has(id)) return { shore: "tropic", scene: id, sceneChoice: id };
  return { shore: "tropic", scene: "lagoon", sceneChoice: "lagoon" };
}

/** Canonical query for a scene. Classic stays ?shore=classic. Other shores use ?scene=. */
export function writeSceneSearch(params, id) {
  const next = new URLSearchParams(params);
  if (id === "classic") {
    next.delete("scene");
    next.set("shore", "classic");
    return next;
  }
  if (id === "real") {
    next.delete("scene");
    next.set("shore", "real");
    return next;
  }
  if (next.get("shore") === "classic" || next.get("shore") === "real") next.delete("shore");
  next.set("scene", sceneById(id) ? id : "lagoon");
  return next;
}

export function sceneHref(id, base = "/live-tide/") {
  const root = base.endsWith("/") ? base : `${base}/`;
  const params = writeSceneSearch(new URLSearchParams(), id);
  return `${root}?${params.toString()}`;
}

export function sceneAsset(file, base = "/live-tide/") {
  if (!file) return "";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}${file}`;
}
