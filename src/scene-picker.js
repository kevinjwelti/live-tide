import {
  SCENES,
  readSavedScene,
  rememberScene,
  resolveScene,
  sceneAsset,
  sceneById,
  sceneDataset,
  writeSceneSearch,
} from "./scenes.js";

function assetBase() {
  const base = import.meta.env?.BASE_URL || "/live-tide/";
  return base.endsWith("/") ? base : `${base}/`;
}

export function applySceneChoice(id, { remember = false, updateUrl = true } = {}) {
  const choice = sceneById(id)?.id || (id === "real" ? "real" : "lagoon");
  const face = sceneDataset(choice);
  const root = document.documentElement;
  if (face.shore) root.dataset.shore = face.shore;
  else delete root.dataset.shore;
  if (face.scene) root.dataset.scene = face.scene;
  else delete root.dataset.scene;
  root.dataset.sceneChoice = face.sceneChoice;
  if (remember) rememberScene(choice, window.localStorage);
  if (updateUrl) {
    const url = new URL(location.href);
    const params = writeSceneSearch(url.searchParams, choice);
    const search = params.toString();
    history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
  }
  document.dispatchEvent(new CustomEvent("livetide-scene", { detail: { id: choice } }));
  return choice;
}

function paintThumb(holder, scene, base) {
  holder.replaceChildren();
  if (scene.id === "classic") {
    holder.classList.add("is-classic");
    holder.innerHTML = `
      <svg viewBox="0 0 160 90" aria-hidden="true">
        <path d="M0 58 C 24 40, 40 40, 64 58 S 104 76, 128 58 S 152 40, 160 46" fill="none" stroke="#f7f1e6" stroke-width="2.4"/>
      </svg>`;
    return;
  }
  if (scene.sand) {
    holder.classList.add("is-split");
    const water = document.createElement("img");
    water.alt = "";
    water.src = sceneAsset(scene.file, base);
    const sand = document.createElement("img");
    sand.alt = "";
    sand.src = sceneAsset(scene.sand, base);
    holder.append(water, sand);
    return;
  }
  holder.style.backgroundImage = `url("${sceneAsset(scene.file, base)}")`;
}

export function initScenePicker({ button } = {}) {
  const base = assetBase();
  const params = new URLSearchParams(location.search);
  const explicit = params.has("scene") || params.get("shore") === "classic" || params.get("shore") === "real";
  const saved = readSavedScene(window.localStorage);
  const initial = resolveScene({ search: location.search, saved });
  if (!explicit && initial !== "lagoon") applySceneChoice(initial, { updateUrl: true });

  if (!button) return { open: () => {}, close: () => {} };

  const dialog = document.createElement("div");
  dialog.id = "scene-picker";
  dialog.className = "scene-picker";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "false");
  dialog.setAttribute("aria-label", "Scenes");
  dialog.innerHTML = `
    <div class="scene-panel">
      <div class="scene-panel-bar">
        <p class="scene-kicker">Scenes</p>
        <a class="scene-list-link" href="${base}scenes.html">Full list</a>
        <button type="button" class="scene-close">Close</button>
      </div>
      <div class="scene-grid"></div>
    </div>
  `;
  document.body.append(dialog);
  button.setAttribute("aria-controls", "scene-picker");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");

  const grid = dialog.querySelector(".scene-grid");
  const cards = SCENES.map((scene) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "scene-card";
    card.dataset.id = scene.id;
    const thumb = document.createElement("span");
    thumb.className = "scene-thumb";
    paintThumb(thumb, scene, base);
    const title = document.createElement("span");
    title.className = "scene-title";
    title.textContent = scene.title;
    card.append(thumb, title);
    card.addEventListener("click", () => choose(scene.id));
    grid.append(card);
    return card;
  });

  let open = false;

  function currentId() {
    return document.documentElement.dataset.sceneChoice || "lagoon";
  }

  function mark() {
    const id = currentId();
    cards.forEach((card) => {
      const on = card.dataset.id === id;
      card.classList.toggle("is-on", on);
      card.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function show() {
    open = true;
    dialog.hidden = false;
    button.setAttribute("aria-expanded", "true");
    mark();
    const current = cards.find((card) => card.dataset.id === currentId()) || cards[0];
    current?.focus();
    current?.scrollIntoView({ block: "nearest" });
  }

  function hide() {
    open = false;
    dialog.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function choose(id) {
    applySceneChoice(id, { remember: true, updateUrl: true });
    mark();
  }

  function columns() {
    const template = getComputedStyle(grid).gridTemplateColumns;
    const count = template.split(" ").filter(Boolean).length;
    return Math.max(1, count);
  }

  function move(dx, dy) {
    const index = Math.max(0, cards.findIndex((card) => card === document.activeElement));
    const cols = columns();
    const next = dy ? index + dy * cols : index + dx;
    const card = cards[Math.max(0, Math.min(cards.length - 1, next))];
    card?.focus();
    card?.scrollIntoView({ block: "nearest" });
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (open) hide();
    else show();
  });
  dialog.querySelector(".scene-close").addEventListener("click", hide);

  document.addEventListener("mousedown", (event) => {
    if (!open) return;
    if (dialog.contains(event.target) || button.contains(event.target)) return;
    hide();
  });

  document.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      button.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "ArrowLeft") move(-1, 0);
    else if (event.key === "ArrowRight") move(1, 0);
    else if (event.key === "ArrowUp") move(0, -1);
    else move(0, 1);
  });

  document.addEventListener("livetide-scene", mark);
  mark();

  return { open: show, close: hide };
}
