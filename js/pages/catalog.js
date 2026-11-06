/* ==========================================================================
   Catalog — URL-synced filters, sorting, grid/list view, pagination.
   ========================================================================== */

import { initStore, queryProducts, facets, getCategories, getCategory, getProducts } from "../store.js";
import { mountChrome } from "../ui/nav.js";
import { productCard, bindProductGrid, skeletonCards } from "../ui/product-card.js";
import { openSheet, closeSheet } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { t, localized, applyTranslations, onLangChange } from "../i18n.js";
import { formatNumber, esc } from "../format.js";

const $ = (selector) => document.querySelector(selector);
const PAGE_SIZE = 12;

const SORT_KEYS = ["recommended", "priceAsc", "priceDesc", "newest", "topRated", "deals", "pickup"];

const state = {
  category: "",
  brands: [],
  conditions: [],
  priceMin: 0,
  priceMax: 0,
  storage: [],
  ram: [],
  hubs: [],
  inStock: false,
  q: "",
  sort: "recommended",
  view: "grid",
};

let page = 1;
let pendingSort = "recommended";
let lastFacetCounts = {};

/* ------------------------------ URL state ------------------------------ */

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.category = params.get("category") || "";
  state.brands = params.getAll("brand");
  state.conditions = params.getAll("condition");
  state.priceMin = Number(params.get("min")) || 0;
  state.priceMax = Number(params.get("max")) || 0;
  state.storage = params.getAll("storage");
  state.ram = params.getAll("ram");
  state.hubs = params.getAll("hub");
  state.inStock = params.get("stock") === "1";
  state.q = params.get("q") || "";
  state.sort = SORT_KEYS.includes(params.get("sort")) ? params.get("sort") : "recommended";
  state.view = params.get("view") === "list" ? "list" : "grid";
  pendingSort = state.sort;
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.category) params.set("category", state.category);
  state.brands.forEach((value) => params.append("brand", value));
  state.conditions.forEach((value) => params.append("condition", value));
  if (state.priceMin) params.set("min", String(state.priceMin));
  if (state.priceMax) params.set("max", String(state.priceMax));
  state.storage.forEach((value) => params.append("storage", value));
  state.ram.forEach((value) => params.append("ram", value));
  state.hubs.forEach((value) => params.append("hub", value));
  if (state.inStock) params.set("stock", "1");
  if (state.q) params.set("q", state.q);
  if (state.sort !== "recommended") params.set("sort", state.sort);
  if (state.view !== "grid") params.set("view", state.view);
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
}

/* ------------------------------- helpers ------------------------------- */

function activeCount() {
  return state.brands.length + state.conditions.length + state.storage.length +
    state.ram.length + state.hubs.length + (state.priceMin || state.priceMax ? 1 : 0) +
    (state.inStock ? 1 : 0) + (state.q ? 1 : 0) + (state.category ? 1 : 0);
}

function sortLabel() {
  return t(`catalog.sort.${state.sort}`);
}

function currentTotal() {
  return queryProducts({ ...state, page: 1, pageSize: 9999 }).total;
}

function numberInStock(product) {
  return Object.values(product.conditions || {}).some((condition) => (condition.stock || 0) > 0);
}

/* ------------------------------- heading ------------------------------ */

function renderHead() {
  const category = getCategory(state.category);
  $("#catalog-title").textContent = state.q
    ? `${t("catalog.searchResults")} « ${state.q} »`
    : category ? localized(category.name) : t("catalog.title");
  document.querySelector("[data-breadcrumb]").textContent = category ? localized(category.name) : t("nav.catalog");
  document.title = `${category ? localized(category.name) : t("catalog.title")} — NovaTech`;
  document.querySelector("#result-count").textContent = formatNumber(currentTotal());

  $("#category-rail").innerHTML = `
    <a class="chip${state.category ? "" : " is-active"}" href="catalog.html">${t("common.all")}</a>
    ${getCategories().map((item) => `<a class="chip${state.category === item.id ? " is-active" : ""}"
      href="catalog.html?category=${encodeURIComponent(item.id)}">
      <span class="material-symbols-outlined">${item.icon}</span>${esc(localized(item.name))}</a>`).join("")}`;
}

/* ------------------------------- filters ------------------------------ */

function brandCounts() {
  const pool = getProducts().filter((product) => !state.category || product.category === state.category);
  const counts = {};
  pool.forEach((product) => {
    counts[product.brand] = (counts[product.brand] || 0) + 1;
  });
  lastFacetCounts = counts;
  return counts;
}

const PRICE_PRESETS = [
  { min: 0, max: 200000, key: "catalog.under" },
  { min: 200000, max: 500000, key: "catalog.range1" },
  { min: 500000, max: 1000000, key: "catalog.range2" },
  { min: 1000000, max: 0, key: "catalog.over" },
];

function priceOutLabel() {
  if (state.priceMin && state.priceMax) return `${formatNumber(state.priceMin)} – ${formatNumber(state.priceMax)} FCFA`;
  if (state.priceMin) return `≥ ${formatNumber(state.priceMin)} FCFA`;
  if (state.priceMax) return `≤ ${formatNumber(state.priceMax)} FCFA`;
  return t("common.all");
}

function renderFilters() {
  const panel = $("#filters-panel");
  const facet = facets();
  const counts = brandCounts();
  const brands = facet.brands;

  panel.innerHTML = `
    <div class="filters-drawer__head">
      <h2 class="filters-drawer__title">${t("common.filters")}
        <span class="badge badge--primary" id="panel-count" ${activeCount() ? "" : "hidden"}>${activeCount()}</span>
      </h2>
      <button class="icon-btn icon-btn--sm drawer-only" type="button" data-close-filters aria-label="${t("common.close")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="filters-drawer__body">

      <section class="filter-group">
        <div class="filter-group__head">
          <span class="filter-group__title">${t("catalog.price")}</span>
        </div>
        <div class="filter-group__body">
          <div class="filter-price-row">
            <span>${t("catalog.priceMax")}</span>
            <strong id="price-out">${priceOutLabel()}</strong>
          </div>
          <input class="range" type="range" id="price-range" min="0" max="2000000" step="25000"
            value="${state.priceMax || 2000000}" aria-label="${t("catalog.priceMax")}">
          <div class="filter-presets">
            ${PRICE_PRESETS.map((preset, index) => `<button type="button"
              data-preset="${index}"
              class="${state.priceMin === preset.min && state.priceMax === preset.max ? "is-active" : ""}">${t(preset.key)}</button>`).join("")}
          </div>
        </div>
      </section>

      <section class="filter-group">
        <button class="filter-group__head" type="button" data-collapse>
          <span class="filter-group__title">${t("catalog.brand")}</span>
          <span class="filter-group__toggle"><span class="material-symbols-outlined">expand_more</span></span>
        </button>
        <div class="filter-group__body">
          ${brands.map((brand) => `<label class="check">
            <input type="checkbox" data-brand value="${esc(brand)}" ${state.brands.includes(brand) ? "checked" : ""}>
            <span>${esc(brand)}<em>${counts[brand] || 0}</em></span>
          </label>`).join("")}
        </div>
      </section>

      <section class="filter-group">
        <button class="filter-group__head" type="button" data-collapse>
          <span class="filter-group__title">${t("catalog.condition")}</span>
          <span class="filter-group__toggle"><span class="material-symbols-outlined">expand_more</span></span>
        </button>
        <div class="filter-group__body">
          ${["new", "openBox", "refurb"].map((condition) => `<label class="check">
            <input type="checkbox" data-condition value="${condition}" ${state.conditions.includes(condition) ? "checked" : ""}>
            <span>${t(`condition.${condition}`)}</span>
          </label>`).join("")}
        </div>
      </section>

      <section class="filter-group">
        <button class="filter-group__head" type="button" data-collapse>
          <span class="filter-group__title">${t("catalog.availability")}</span>
          <span class="filter-group__toggle"><span class="material-symbols-outlined">expand_more</span></span>
        </button>
        <div class="filter-group__body">
          <label class="check">
            <input type="checkbox" id="filter-stock" ${state.inStock ? "checked" : ""}>
            <span>${t("catalog.stockNow")}</span>
          </label>
          <span class="t-micro muted" style="padding-top:8px">${t("catalog.hub")}</span>
          <div class="filter-chips">
            <button type="button" data-hub="douala" class="${state.hubs.includes("douala") ? "is-active" : ""}">Douala — Akwa</button>
            <button type="button" data-hub="yaounde" class="${state.hubs.includes("yaounde") ? "is-active" : ""}">Yaoundé — Bastos</button>
          </div>
          <div class="filter-note">
            <span class="material-symbols-outlined">local_shipping</span>
            <span>${t("catalog.delivery24")} — ${t("common.free")}</span>
          </div>
        </div>
      </section>

      <section class="filter-group">
        <button class="filter-group__head" type="button" data-collapse>
          <span class="filter-group__title">${t("catalog.storage")}</span>
          <span class="filter-group__toggle"><span class="material-symbols-outlined">expand_more</span></span>
        </button>
        <div class="filter-group__body">
          <div class="filter-chips">
            ${facet.storage.map((value) => `<button type="button" data-storage="${esc(value)}"
              class="${state.storage.includes(value) ? "is-active" : ""}">${esc(value)}</button>`).join("")}
          </div>
        </div>
      </section>

      <section class="filter-group">
        <button class="filter-group__head" type="button" data-collapse>
          <span class="filter-group__title">${t("catalog.ram")}</span>
          <span class="filter-group__toggle"><span class="material-symbols-outlined">expand_more</span></span>
        </button>
        <div class="filter-group__body">
          <div class="filter-chips">
            ${facet.ram.map((value) => `<button type="button" data-ram="${esc(value)}"
              class="${state.ram.includes(value) ? "is-active" : ""}">${esc(value)}</button>`).join("")}
          </div>
        </div>
      </section>

      <div class="filter-note">
        <span class="material-symbols-outlined">verified</span>
        <span>${t("catalog.warrantyNote")}</span>
      </div>
    </div>

    <div class="filters-drawer__foot">
      <button class="btn btn--ghost" type="button" data-reset-filters>${t("catalog.resetAll")}</button>
      <button class="btn" type="button" data-apply-filters>${t("catalog.showResults")} (${formatNumber(currentTotal())})</button>
    </div>`;

  bindFilterPanel();
  updatePanelCounts();
}

function bindFilterPanel() {
  const panel = $("#filters-panel");

  panel.querySelectorAll("[data-brand]").forEach((input) => {
    input.addEventListener("change", () => toggleList(state.brands, input.value, input.checked));
  });

  panel.querySelectorAll("[data-condition]").forEach((input) => {
    input.addEventListener("change", () => toggleList(state.conditions, input.value, input.checked));
  });

  panel.querySelector("#filter-stock")?.addEventListener("change", (event) => {
    state.inStock = event.target.checked;
    applyState();
  });

  panel.querySelectorAll("[data-hub]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleList(state.hubs, button.dataset.hub, !state.hubs.includes(button.dataset.hub));
      button.classList.toggle("is-active");
      applyState();
    });
  });

  panel.querySelectorAll("[data-storage]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleList(state.storage, button.dataset.storage, !state.storage.includes(button.dataset.storage));
      button.classList.toggle("is-active");
      applyState();
    });
  });

  panel.querySelectorAll("[data-ram]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleList(state.ram, button.dataset.ram, !state.ram.includes(button.dataset.ram));
      button.classList.toggle("is-active");
      applyState();
    });
  });

  panel.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = PRICE_PRESETS[Number(button.dataset.preset)];
      const isActive = state.priceMin === preset.min && state.priceMax === preset.max;
      state.priceMin = isActive ? 0 : preset.min;
      state.priceMax = isActive ? 0 : preset.max;
      panel.querySelectorAll("[data-preset]").forEach((node) => node.classList.remove("is-active"));
      if (!isActive) button.classList.add("is-active");
      const range = panel.querySelector("#price-range");
      range.value = state.priceMax || 2000000;
      panel.querySelector("#price-out").textContent = priceOutLabel();
      applyState();
    });
  });

  const range = panel.querySelector("#price-range");
  range?.addEventListener("input", () => {
    const value = Number(range.value);
    panel.querySelector("#price-out").textContent = value >= 2000000
      ? t("common.all")
      : `${formatNumber(value)} FCFA`;
  });
  range?.addEventListener("change", () => {
    const value = Number(range.value);
    state.priceMin = 0;
    state.priceMax = value >= 2000000 ? 0 : value;
    panel.querySelectorAll("[data-preset]").forEach((node) => node.classList.remove("is-active"));
    applyState();
  });

  panel.querySelectorAll("[data-collapse]").forEach((head) => {
    head.addEventListener("click", () => head.closest(".filter-group")?.classList.toggle("is-collapsed"));
  });

  panel.querySelector("[data-reset-filters]")?.addEventListener("click", resetFilters);
  panel.querySelector("[data-apply-filters]")?.addEventListener("click", () => {
    closeFilters();
    toast(`${formatNumber(currentTotal())} ${t("catalog.products")}`);
  });
  panel.querySelector("[data-close-filters]")?.addEventListener("click", closeFilters);
  document.querySelector(".filter-scrim")?.addEventListener("click", closeFilters);
}

function toggleList(list, value, add) {
  const index = list.indexOf(value);
  if (add && index === -1) list.push(value);
  if (!add && index > -1) list.splice(index, 1);
  applyState();
}

function updatePanelCounts() {
  const total = formatNumber(currentTotal());
  const count = activeCount();
  const badge = $("#panel-count");
  if (badge) {
    badge.textContent = count;
    badge.hidden = count === 0;
  }
  const footer = document.querySelector("[data-apply-filters]");
  if (footer) footer.textContent = `${t("catalog.showResults")} (${total})`;
  const topBadge = $("#filters-count");
  topBadge.textContent = count;
  topBadge.hidden = count === 0;
}

function resetFilters() {
  state.brands = [];
  state.conditions = [];
  state.storage = [];
  state.ram = [];
  state.hubs = [];
  state.priceMin = 0;
  state.priceMax = 0;
  state.inStock = false;
  state.q = "";
  $("#catalog-search").value = "";
  page = 1;
  writeUrl();
  renderFilters();
  renderActiveChips();
  renderHead();
  updateResults();
}

function closeFilters() {
  closeSheet($("#filters-panel"));
}

/* ---------------------------- active chips ---------------------------- */

function chip(label, key, value) {
  return `<span class="filter-chip">${esc(label)}
    <button type="button" data-remove-key="${key}" data-remove-value="${esc(value ?? "")}" aria-label="${t("common.remove")}">
      <span class="material-symbols-outlined">close</span>
    </button>
  </span>`;
}

function renderActiveChips() {
  const host = $("#active-filters");
  const chips = [];

  if (state.category) {
    const category = getCategory(state.category);
    chips.push(chip(localized(category?.name) || state.category, "category", state.category));
  }
  if (state.q) chips.push(chip(`« ${state.q} »`, "q", state.q));
  state.brands.forEach((brand) => chips.push(chip(brand, "brand", brand)));
  state.conditions.forEach((condition) => chips.push(chip(t(`condition.${condition}`), "condition", condition)));
  state.storage.forEach((value) => chips.push(chip(value, "storage", value)));
  state.ram.forEach((value) => chips.push(chip(value, "ram", value)));
  state.hubs.forEach((hub) => chips.push(chip(hub === "douala" ? "Douala — Akwa" : "Yaoundé — Bastos", "hub", hub)));
  if (state.priceMin || state.priceMax) chips.push(chip(priceOutLabel(), "price", `${state.priceMin}-${state.priceMax}`));
  if (state.inStock) chips.push(chip(t("catalog.stockNow"), "stock", "1"));

  host.innerHTML = chips.length
    ? `${chips.join("")}<button class="catalog-active__reset" type="button" data-reset-filters>${t("catalog.resetAll")}</button>`
    : "";

  host.querySelectorAll("[data-remove-key]").forEach((button) => {
    button.addEventListener("click", () => {
      removeFilter(button.dataset.removeKey, button.dataset.removeValue);
    });
  });
  host.querySelector("[data-reset-filters]")?.addEventListener("click", resetFilters);
}

function removeFilter(key, value) {
  switch (key) {
    case "category":
      state.category = "";
      break;
    case "q":
      state.q = "";
      $("#catalog-search").value = "";
      break;
    case "brand":
      state.brands = state.brands.filter((item) => item !== value);
      break;
    case "condition":
      state.conditions = state.conditions.filter((item) => item !== value);
      break;
    case "storage":
      state.storage = state.storage.filter((item) => item !== value);
      break;
    case "ram":
      state.ram = state.ram.filter((item) => item !== value);
      break;
    case "hub":
      state.hubs = state.hubs.filter((item) => item !== value);
      break;
    case "price":
      state.priceMin = 0;
      state.priceMax = 0;
      break;
    case "stock":
      state.inStock = false;
      break;
    default:
      break;
  }
  page = 1;
  writeUrl();
  renderFilters();
  renderActiveChips();
  renderHead();
  updateResults();
}

/* ------------------------------- results ------------------------------ */

function updateResults({ append = false } = {}) {
  const results = queryProducts({ ...state, page, pageSize: PAGE_SIZE });
  const host = $("#results");

  if (!append) {
    host.innerHTML = results.items.length
      ? results.items.map(productCard).join("")
      : `<div class="empty" style="grid-column:1/-1">
          <span class="empty__icon"><span class="material-symbols-outlined">search_off</span></span>
          <p class="empty__title">${t("catalog.empty.title")}</p>
          <p class="empty__text">${t("catalog.empty.text")}</p>
          <button class="btn" type="button" data-reset-filters>${t("catalog.resetAll")}</button>
        </div>`;
    host.querySelector("[data-reset-filters]")?.addEventListener("click", resetFilters);
  } else {
    host.insertAdjacentHTML("beforeend", results.items.map(productCard).join(""));
  }

  host.classList.toggle("products-list", state.view === "list");
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });

  $("#result-count").textContent = formatNumber(results.total);
  $("#load-more-wrap").innerHTML = results.hasMore
    ? `<button class="btn btn--ghost" type="button" id="load-more">
        <span class="material-symbols-outlined">expand_more</span>${t("common.loadMore")}</button>`
    : "";
  document.querySelector("#load-more")?.addEventListener("click", () => {
    page += 1;
    updateResults({ append: true });
  });

  $("#sort-label").textContent = sortLabel();
  updatePanelCounts();
}

function applyState({ rebuild = false } = {}) {
  page = 1;
  writeUrl();
  renderActiveChips();
  renderHead();
  if (rebuild) renderFilters();
  updateResults();
}

/* -------------------------------- sort -------------------------------- */

function renderSortList() {
  const host = $("#sort-list");
  host.innerHTML = SORT_KEYS.map((key) => `<button class="sort-option${pendingSort === key ? " is-active" : ""}"
      type="button" role="radio" aria-checked="${pendingSort === key}" data-sort="${key}">
      <span class="material-symbols-outlined">${sortIcon(key)}</span>
      <span>${t(`catalog.sort.${key}`)}</span>
      <span class="material-symbols-outlined sort-option__check">check</span>
    </button>`).join("");

  host.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      pendingSort = button.dataset.sort;
      renderSortList();
    });
  });
}

function sortIcon(key) {
  return {
    recommended: "auto_awesome",
    priceAsc: "arrow_upward",
    priceDesc: "arrow_downward",
    newest: "new_releases",
    topRated: "star",
    deals: "local_offer",
    pickup: "storefront",
  }[key] || "sort";
}

/* ------------------------------ quick spec ---------------------------- */

function renderQuickSpec() {
  const facet = facets();
  $("#quick-spec").innerHTML = `<div class="quick-spec">
    <div class="quick-spec__head">
      <span class="quick-spec__title">
        <span class="material-symbols-outlined">tune</span>${t("catalog.quickSpec")}
      </span>
      <span class="t-micro muted">${t("catalog.quickSpecNote")}</span>
    </div>
    <div class="quick-spec__body">
      <div class="quick-spec__row">
        <span class="quick-spec__label">${t("catalog.storageCapacity")}</span>
        <div class="filter-chips">
          ${facet.storage.map((value) => `<button type="button" data-quick-storage="${esc(value)}"
            class="${state.storage.includes(value) ? "is-active" : ""}">${esc(value)}</button>`).join("")}
        </div>
      </div>
      <div class="quick-spec__row">
        <span class="quick-spec__label">${t("catalog.systemMemory")}</span>
        <div class="filter-chips">
          ${facet.ram.map((value) => `<button type="button" data-quick-ram="${esc(value)}"
            class="${state.ram.includes(value) ? "is-active" : ""}">${esc(value)}</button>`).join("")}
        </div>
      </div>
    </div>
    <div class="quick-spec__foot">
      <p>${t("catalog.showingSpecs")}</p>
      <button class="btn btn--sm" type="button" id="quick-apply">${t("catalog.applySpecs")}</button>
    </div>
  </div>`;

  const spec = $("#quick-spec");
  spec.querySelectorAll("[data-quick-storage]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.quickStorage;
      const index = state.storage.indexOf(value);
      if (index > -1) state.storage.splice(index, 1);
      else state.storage.push(value);
      applyState({ rebuild: true });
      renderQuickSpec();
    });
  });
  spec.querySelectorAll("[data-quick-ram]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.quickRam;
      const index = state.ram.indexOf(value);
      if (index > -1) state.ram.splice(index, 1);
      else state.ram.push(value);
      applyState({ rebuild: true });
      renderQuickSpec();
    });
  });
  spec.querySelector("#quick-apply")?.addEventListener("click", () => {
    renderActiveChips();
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* -------------------------------- wiring ------------------------------ */

function renderView() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      writeUrl();
      updateResults();
    });
  });
}

function openFilters() {
  openSheet($("#filters-panel"));
}

function bindSearch() {
  const input = $("#catalog-search");
  input.value = state.q;
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = input.value.trim();
      page = 1;
      writeUrl();
      renderHead();
      renderActiveChips();
      updateResults();
    }, 300);
  });
}

async function main() {
  readUrl();
  $("#results").innerHTML = skeletonCards(6);
  bindProductGrid();
  await initStore();
  await mountChrome("catalog");
  applyTranslations(document);

  renderHead();
  renderFilters();
  renderActiveChips();
  renderQuickSpec();
  renderSortList();
  renderView();
  bindSearch();
  updateResults();

  document.querySelector("[data-open-filters]")?.addEventListener("click", openFilters);
  document.querySelector("[data-open-sort]")?.addEventListener("click", () => {
    pendingSort = state.sort;
    renderSortList();
    openSheet($("#sort-sheet"));
  });
  document.querySelector("#sort-reset")?.addEventListener("click", () => {
    pendingSort = "recommended";
    renderSortList();
  });
  document.querySelector("#sort-apply")?.addEventListener("click", () => {
    state.sort = pendingSort;
    writeUrl();
    renderSortList();
    renderHead();
    renderActiveChips();
    updateResults();
    closeSheet($("#sort-sheet"));
  });
  document.querySelector("#sort-sheet [data-sheet-close]")?.addEventListener("click", () => closeSheet($("#sort-sheet")));

  window.addEventListener("popstate", () => {
    readUrl();
    page = 1;
    renderHead();
    renderFilters();
    renderActiveChips();
    renderQuickSpec();
    updateResults();
  });

  onLangChange(() => {
    applyTranslations(document);
    renderHead();
    renderFilters();
    renderActiveChips();
    renderQuickSpec();
    renderSortList();
    updateResults();
    mountChrome("catalog");
  });
}

main().catch((error) => {
  console.error(error);
  $("#results").innerHTML = `<div class="empty" style="grid-column:1/-1">
    <span class="empty__icon"><span class="material-symbols-outlined">cloud_off</span></span>
    <p class="empty__title">${esc(error.message)}</p>
    <button class="btn" onclick="location.reload()">${t("common.retry")}</button>
  </div>`;
});
