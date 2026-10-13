import "./moods-preview.css";
import { allMoods } from "./moods.js";

const grid = document.querySelector("#mood-grid");
const buttons = [...document.querySelectorAll(".sky-controls [data-sky]")];

function currentSky() {
  const q = new URLSearchParams(location.search).get("sky");
  return q === "noon" || q === "dusk" || q === "night" || q === "now" ? q : "now";
}

let sky = currentSky();

function frameSrc(id) {
  const q = new URLSearchParams({ mood: id, sky, embed: "1" });
  return `${import.meta.env.BASE_URL}?${q}`;
}

function syncButtons() {
  buttons.forEach((btn) => {
    const on = btn.dataset.sky === sky;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-on", on);
  });
}

function fitFrames() {
  grid.querySelectorAll(".mood-tile").forEach((tile) => {
    const stage = tile.querySelector(".mood-stage");
    const frame = tile.querySelector("iframe");
    if (!stage || !frame) return;
    frame.style.transform = `scale(${stage.clientWidth / 1280})`;
  });
}

function renderGrid() {
  grid.replaceChildren();
  allMoods().forEach((mood) => {
    const tile = document.createElement("figure");
    tile.className = "mood-tile";
    const stage = document.createElement("div");
    stage.className = "mood-stage";
    const frame = document.createElement("iframe");
    frame.title = mood.name;
    frame.dataset.mood = mood.id;
    frame.src = frameSrc(mood.id);
    frame.loading = "lazy";
    stage.append(frame);
    const cap = document.createElement("figcaption");
    cap.textContent = mood.name;
    tile.append(stage, cap);
    grid.append(tile);
  });
  requestAnimationFrame(fitFrames);
}

function setSky(next) {
  sky = next;
  const url = new URL(location.href);
  url.searchParams.set("sky", sky);
  history.replaceState(null, "", url);
  syncButtons();
  grid.querySelectorAll("iframe").forEach((frame) => {
    const id = frame.dataset.mood;
    try {
      frame.contentWindow?.postMessage({ sky }, "*");
    } catch {
      /* ignore */
    }
    frame.src = frameSrc(id);
  });
}

buttons.forEach((btn) => {
  btn.addEventListener("click", () => setSky(btn.dataset.sky));
});

window.addEventListener("resize", fitFrames);
syncButtons();
renderGrid();
