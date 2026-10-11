import { CURATED, favoriteBeaches, isFavorite, recentBeaches, toggleFavorite } from "./beaches.js";
import { loadStations, nearestBeach, searchBeaches } from "./stations.js";

export function initBeachMenu({ button, getBeach, onSelect, enabled }) {
  if (!button || !enabled) {
    button?.setAttribute("aria-disabled", "true");
    button?.removeAttribute("aria-haspopup");
    return { open: () => {}, close: () => {} };
  }

  const dialog = document.createElement("div");
  dialog.id = "beach-menu";
  dialog.className = "beach-menu";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Choose a beach");
  dialog.tabIndex = -1;
  dialog.innerHTML = `
    <div class="beach-menu-list" id="beach-menu-list"></div>
    <input id="beach-search" class="beach-search" type="search" placeholder="Search beaches" autocomplete="off" enterkeyhint="search" />
  `;
  document.body.append(dialog);
  button.setAttribute("aria-controls", "beach-menu");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");

  const list = dialog.querySelector("#beach-menu-list");
  const search = dialog.querySelector("#beach-search");
  let open = false;
  let items = [];
  let active = 0;
  let stations = [];
  let nearNote = "Near me";

  function selectable() {
    const indexes = [];
    items.forEach((item, index) => {
      if (item.type !== "label") indexes.push(index);
    });
    return indexes;
  }

  function move(step) {
    const indexes = selectable();
    if (!indexes.length) return;
    const current = indexes.indexOf(active);
    const next = indexes[(current + step + indexes.length) % indexes.length];
    active = next;
    paint();
    list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }

  function paint() {
    list.innerHTML = "";
    items.forEach((item, index) => {
      if (item.type === "label") {
        const label = document.createElement("p");
        label.className = "beach-label";
        label.textContent = item.text;
        list.append(label);
        return;
      }
      const row = document.createElement("div");
      row.className = `beach-row${index === active ? " is-active" : ""}`;
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "beach-pick";
      pick.setAttribute("role", "option");
      if (item.type === "near") {
        pick.textContent = nearNote;
      } else {
        pick.textContent = item.beach.menu;
        if (item.beach.id === getBeach()?.id) pick.setAttribute("aria-selected", "true");
        const star = document.createElement("button");
        star.type = "button";
        star.className = `beach-star${isFavorite(item.beach.id) ? " is-on" : ""}`;
        star.textContent = isFavorite(item.beach.id) ? "★" : "☆";
        star.setAttribute(
          "aria-label",
          isFavorite(item.beach.id) ? `Remove ${item.beach.menu} from saved` : `Save ${item.beach.menu}`
        );
        star.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleFavorite(item.beach);
          const keep = item.beach.id;
          rebuild();
          const found = items.findIndex((row) => row.beach?.id === keep);
          if (found >= 0) active = found;
          paint();
        });
        row.append(pick, star);
        pick.addEventListener("click", () => choose(item));
        list.append(row);
        return;
      }
      row.append(pick);
      pick.addEventListener("click", () => choose(item));
      list.append(row);
    });
    if (!items.some((item) => item.type === "beach") && search.value.trim()) {
      const empty = document.createElement("p");
      empty.className = "beach-label";
      empty.textContent = stations.length ? "Nothing by that name" : "Beach list is still arriving";
      list.append(empty);
    }
  }

  function rebuild() {
    const query = search.value;
    const favorites = favoriteBeaches();
    const recents = recentBeaches().filter(
      (beach) => !favorites.some((saved) => saved.id === beach.id)
    );
    if (query.trim()) {
      const found = searchBeaches(query, stations);
      items = [{ type: "near" }, ...found.map((beach) => ({ type: "beach", beach }))];
      const firstBeach = items.findIndex((item) => item.type === "beach");
      active = firstBeach >= 0 ? firstBeach : 0;
    } else {
      items = [{ type: "near" }];
      if (favorites.length) {
        items.push({ type: "label", text: "Saved" });
        favorites.forEach((beach) => items.push({ type: "beach", beach }));
      }
      if (recents.length) {
        items.push({ type: "label", text: "Recent" });
        recents.forEach((beach) => items.push({ type: "beach", beach }));
      }
      items.push({ type: "label", text: "Beaches" });
      CURATED.forEach((beach) => items.push({ type: "beach", beach }));
    }
    if (!selectable().includes(active)) active = selectable()[0] ?? 0;
    paint();
  }

  function position() {
    const rect = button.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 16);
    dialog.style.width = `${width}px`;
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 8;
    const height = dialog.offsetHeight || Math.min(window.innerHeight * 0.7, 520);
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }

  function show() {
    open = true;
    nearNote = "Near me";
    search.value = "";
    active = 0;
    dialog.hidden = false;
    button.setAttribute("aria-expanded", "true");
    rebuild();
    position();
    dialog.focus();
    loadStations()
      .then((rows) => {
        stations = rows;
        if (open && search.value.trim()) rebuild();
      })
      .catch(() => {
        stations = [];
      });
  }

  function hide() {
    if (!open) return;
    open = false;
    dialog.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.focus();
  }

  async function locate() {
    if (!navigator.geolocation) {
      nearNote = "Location isn't available";
      paint();
      return;
    }
    nearNote = "Finding the nearest beach…";
    paint();
    let rows = stations;
    try {
      rows = await loadStations();
      stations = rows;
    } catch {
      rows = [];
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const found = nearestBeach(pos.coords.latitude, pos.coords.longitude, rows);
        if (!found) {
          nearNote = "No station nearby";
          paint();
          return;
        }
        onSelect(found.beach);
        hide();
      },
      () => {
        nearNote = "Location is off";
        paint();
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 }
    );
  }

  function choose(item) {
    if (item.type === "near") {
      locate();
      return;
    }
    onSelect(item.beach);
    hide();
  }

  function activate() {
    const item = items[active];
    if (item) choose(item);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (open) hide();
    else show();
  });

  search.addEventListener("input", () => {
    active = 0;
    rebuild();
    position();
  });

  document.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" && !event.target.classList?.contains("beach-star")) {
      event.preventDefault();
      activate();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!open) return;
    if (dialog.contains(event.target) || button.contains(event.target)) return;
    hide();
  });

  window.addEventListener("resize", () => {
    if (open) position();
  });

  return { open: show, close: hide };
}
