#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  SCENES,
  resolveScene,
  sceneDataset,
  sceneHref,
  writeSceneSearch,
} from "../src/scenes.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(resolveScene({ search: "", saved: "" }) === "lagoon", "plain page is the lagoon");
assert(resolveScene({ search: "?beach=manhattan", saved: "reef" }) === "reef", "a saved scene reopens");
assert(resolveScene({ search: "?scene=tropic", saved: "reef" }) === "tropic", "an explicit scene wins");
assert(resolveScene({ search: "?scene=lagoon", saved: "blacksand" }) === "lagoon", "explicit lagoon wins");
assert(resolveScene({ search: "?scene=nope", saved: "reef" }) === "lagoon", "an unknown scene does not use the saved one");
assert(resolveScene({ search: "?shore=classic", saved: "reef" }) === "classic", "classic shore wins");
assert(resolveScene({ search: "?shore=real", saved: "lagoon" }) === "real", "real shore still resolves");
assert(resolveScene({ search: "?scene=classic", saved: "reef" }) === "classic", "scene=classic is the drawn chart");

const classic = writeSceneSearch(new URLSearchParams("beach=manhattan&scene=reef"), "classic");
assert(classic.get("shore") === "classic" && !classic.has("scene") && classic.get("beach") === "manhattan", "classic keeps the beach and drops scene");
const reef = writeSceneSearch(new URLSearchParams("shore=classic&beach=manhattan"), "reef2");
assert(reef.get("scene") === "reef2" && reef.get("shore") !== "classic", "a photo scene leaves classic");
const lagoon = writeSceneSearch(new URLSearchParams("sky=noon"), "lagoon");
assert(lagoon.get("scene") === "lagoon" && lagoon.get("sky") === "noon", "lagoon is an explicit scene");

assert(sceneDataset("tropic").scene === "" && sceneDataset("tropic").shore === "tropic", "tropic is the soft shore, not a photo plate");
assert(sceneDataset("lagoon").scene === "lagoon", "lagoon paints the lagoon plate");
assert(sceneDataset("classic").shore === "" && sceneDataset("classic").scene === "", "classic clears the photo shore");

assert(sceneHref("classic", "/live-tide/").includes("shore=classic"), "classic link");
assert(sceneHref("tidepool3", "/live-tide/") === "/live-tide/?scene=tidepool3", "anemone pool link");

const titles = Object.fromEntries(SCENES.map((scene) => [scene.id, scene.title]));
assert(titles.lagoon === "Lagoon (default)", "lagoon title");
assert(titles.tropic === "Tropic Shore", "tropic title");
assert(titles.blacksand === "Black Sand", "black sand title");
assert(titles.reef2 === "Colorful Reef I", "reef 2 title");
assert(titles.reef3 === "Colorful Reef II", "reef 3 title");
assert(titles.reef4 === "Colorful Reef III", "reef 4 title");
assert(titles.tidepool2 === "Starfish Pool", "starfish title");
assert(titles.tidepool3 === "Anemone Pool", "anemone title");
assert(titles.tidepool4 === "Mirror Pool", "mirror pool title");
assert(titles.classic === "Classic", "classic title");

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert(html.includes("live-tide-scene"), "the first paint reads the saved scene");
for (const scene of SCENES) {
  if (scene.id === "classic" || scene.id === "tropic") continue;
  assert(html.includes(scene.id), `index knows ${scene.id}`);
}

console.log("scene picker tests passed");
