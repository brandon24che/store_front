/* ==========================================================================
   Admin inventory — per-condition stock table, hub split and adjustments.
   ========================================================================== */

import {
  initStore, listAllProducts, getCategories, setConditionStock,
  stockFor, totalStock, priceOf, fetchAuditLogs, appendAuditLog,
} from "../store.js";
import { requireStaff, can } from "../rbac.js";
import { mountAdminShell } from "../ui/nav.js";
import { openSheet, closeSheet, bindSheetTriggers } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { t, getLang, onLangChange } from "../i18n.js";
import { formatFCFA, formatNumber, timeAgo, esc } from "../format.js";
import { productImage } from "../ui/art.js";
import { pageHead, kpi, emptyBlock, deniedBlock } from "../admin/ui.js";

const $ = (selector) => document.querySelector(selector);
const root = () => $("#inventory-root");

const CONDITIONS = ["new", "openBox", "refurb"];
const HUBS = [
  { id: "douala", label: "Akwa" },
  { id: "yaounde", label: "Bastos" },
];

const state = {
  session: null,
  products: [],
  query: "",
  condition: "all",
  hub: "all",
  lowOnly: false,
};

/* -------------------------------- helpers ------------------------------- */

function categoryName(id) {
  const category = getCategories().find((entry) => entry.id === id);
  if (!category) return id;
  return category.name[getLang()] || category.name.fr;
}

function canWrite() {
  return Boolean(state.session && can(state.session.role, "inventory.write"));
}

function stockClass(value) {
  return value === 0 ? "stock-pill--out" : value < 5 ? "stock-pill--low" : "stock-pill--ok";
}

function barClass(value) {
  return value === 0 ? "stock-bar--out" : value < 5 ? "stock-bar--low" : "";
}

function levelOf(product, condition) {
  return stockFor(product, condition, state.hub === "all" ? undefined : state.hub);
}

function buildRows() {
  const needle = state.query.trim().toLowerCase();
  const conditions = state.condition === "all" ? CONDITIONS : [state.condition];
  const rows = [];

  for (const product of state.products) {
    if (needle) {
      const haystack = [product.name, product.brand, product.shortSpec, categoryName(product.category)]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) continue;
    }
    for (const condition of conditions) {
      const level = levelOf(product, condition);
      if (state.lowOnly && !(level < 5)) continue;
      rows.push({ product, condition, level, entry: product.conditions?.[condition] || {} });
    }
  }

  return rows.sort((a, b) => a.product.name.localeCompare(b.product.name));
}

/* -------------------------------- markup -------------------------------- */

function shellMarkup() {
  const conditionChips = ["all", ...CONDITIONS].map((key) => `<button type="button" class="chip ${state.condition === key ? "is-active" : ""}" data-condition="${key}">
    ${key === "all" ? t("admin.inventory.allConditions") : t(`condition.${key}`)}
  </button>`).join("");

  const hubChips = [{ id: "all", label: t("admin.inventory.allHubs") }, ...HUBS].map((hub) => `<button type="button" class="chip ${state.hub === hub.id ? "is-active" : ""}" data-hub="${hub.id}">
    ${esc(hub.label)}
  </button>`).join("");

  return `${pageHead({
    eyebrow: t("admin.title"),
    title: t("admin.inventory.title"),
    sub: t("admin.inventory.sub"),
  })}
  <div class="admin-kpis" id="inventory-kpis"></div>
  <section class="admin-panel">
    <div class="admin-toolbar">
      <div class="admin-search">
        <span class="material-symbols-outlined">search</span>
        <input id="inventory-search" type="search" value="${esc(state.query)}" placeholder="${t("admin.inventory.search")}" aria-label="${t("admin.inventory.search")}">
      </div>
      <button type="button" class="chip ${state.lowOnly ? "is-active" : ""}" id="inventory-low" aria-pressed="${state.lowOnly}">
        <span class="material-symbols-outlined">warning</span>${t("admin.inventory.lowOnly")}
      </button>
    </div>
    <div class="admin-filter-chips" role="group" aria-label="${t("admin.inventory.condition")}">${conditionChips}</div>
    <div class="admin-filter-chips" role="group" aria-label="${t("admin.inventory.hub")}">${hubChips}</div>
    <div class="admin-panel__head">
      <h2 class="admin-panel__title"><span class="material-symbols-outlined">warehouse</span>${t("admin.inventory.title")}</h2>
      <span class="admin-panel__count" id="inventory-count"></span>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>${t("admin.inventory.product")}</th>
            <th>${t("admin.inventory.condition")}</th>
            <th>${t("admin.inventory.hubSplit")}</th>
            <th class="num">${t("admin.inventory.level")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="inventory-body"></tbody>
      </table>
    </div>
  </section>
  <section class="admin-panel" style="margin-top:16px">
    <div class="admin-panel__head">
      <h2 class="admin-panel__title"><span class="material-symbols-outlined">history</span>${t("admin.inventory.activity")}</h2>
    </div>
    <div class="audit-list" id="inventory-activity"></div>
  </section>`;
}

function rowMarkup({ product, condition, level, entry }) {
  const total = Number(entry.stock) || 0;
  const hubs = product.hubs?.[condition] || {};
  const width = Math.min(100, Math.round((level / 40) * 100));
  return `<tr class="inventory-row ${level === 0 ? "is-out" : level < 5 ? "is-low" : ""}" data-row="${esc(product.id)}:${condition}">
    <td>
      <div class="cell-main">
        <span class="admin-thumb">${productImage(product, { alt: product.name })}</span>
        <div>
          <strong>${esc(product.name)}</strong>
          <span class="cell-sub">${esc(product.brand)} · ${esc(categoryName(product.category))}</span>
        </div>
      </div>
    </td>
    <td><span class="badge">${t(`condition.${condition}`)}</span></td>
    <td>
      <div class="hub-split">
        ${HUBS.map((hub) => `<span>${hub.label} ${formatNumber(hubs[hub.id] ?? 0)}</span>`).join("")}
      </div>
    </td>
    <td class="num">
      <div class="stock-cell">
        <span class="stock-pill ${stockClass(level)}">${formatNumber(level)}</span>
        <span class="stock-bar ${barClass(level)}"><span style="width:${width}%"></span></span>
        ${state.hub !== "all" && level !== total ? `<span class="cell-sub">${t("admin.inventory.total")} ${formatNumber(total)}</span>` : ""}
      </div>
    </td>
    <td>
      <div class="admin-row-actions">
        ${canWrite()
          ? `<button class="btn btn--soft btn--sm" type="button" data-adjust="${esc(product.id)}" data-condition-key="${condition}">
              <span class="material-symbols-outlined">tune</span>${t("admin.inventory.adjust")}
            </button>`
          : `<span class="cell-sub">${t("admin.common.readOnly")}</span>`}
      </div>
    </td>
  </tr>`;
}

/* ------------------------------- rendering ------------------------------ */

function renderKpis() {
  const host = $("#inventory-kpis");
  if (!host) return;
  const units = state.products.reduce((sum, product) => sum + totalStock(product), 0);
  const out = state.products.filter((product) => totalStock(product) === 0).length;
  const low = state.products.filter((product) => {
    const stock = totalStock(product);
    return stock > 0 && stock < 5;
  }).length;
  const value = state.products.reduce((sum, product) => {
    return sum + CONDITIONS.reduce((sub, condition) => sub + priceOf(product, condition) * (product.conditions?.[condition]?.stock || 0), 0);
  }, 0);

  host.innerHTML = [
    kpi({ icon: "inventory", label: t("admin.inventory.units"), value: formatNumber(units) }),
    kpi({ icon: "warning", label: t("admin.inventory.lowCount"), value: low, tone: "warn" }),
    kpi({ icon: "remove_shopping_cart", label: t("admin.inventory.outCount"), value: out, tone: "danger" }),
    kpi({ icon: "payments", label: t("admin.inventory.value"), value: formatFCFA(value), tone: "teal" }),
  ].join("");
}

function renderRows() {
  const body = $("#inventory-body");
  if (!body) return;
  const rows = buildRows();
  body.innerHTML = rows.length
    ? rows.map(rowMarkup).join("")
    : `<tr><td colspan="5">${emptyBlock({ icon: "warehouse", title: t("admin.inventory.empty") })}</td></tr>`;

  const count = $("#inventory-count");
  if (count) count.textContent = `${rows.length} / ${state.products.length * CONDITIONS.length} ${t("admin.inventory.rows")}`;
}

async function renderActivity() {
  const host = $("#inventory-activity");
  if (!host) return;
  const logs = (await fetchAuditLogs(40)).filter((entry) => entry.kind === "inventory").slice(0, 8);
  host.innerHTML = logs.length
    ? logs.map((entry) => `<div class="audit-row">
        <span class="audit-dot audit-dot--${esc(entry.severity || "info")}"></span>
        <div class="audit-body">
          <strong>${esc(entry.actor)} · ${esc(entry.action)}</strong>
          <p>${esc(entry.target)}</p>
          <time>${esc(timeAgo(entry.at))}</time>
        </div>
      </div>`).join("")
    : emptyBlock({ icon: "history", title: t("admin.inventory.activityEmpty") });
}

function renderAll() {
  renderKpis();
  renderRows();
  renderActivity().catch((error) => console.error(error));
}

/* ------------------------------- adjustment ----------------------------- */

function showSheet(markup) {
  const overlays = $("#admin-overlays");
  overlays.innerHTML = markup;
  const el = overlays.querySelector(".sheet");
  if (!el) return null;
  bindSheetTriggers(el);
  openSheet(el);
  return el;
}

function splitPreview(value) {
  return {
    douala: Math.ceil(value * 0.6),
    yaounde: Math.floor(value * 0.4),
  };
}

function openAdjust(productId, condition) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product || !canWrite()) return;

  const initial = Number(product.conditions?.[condition]?.stock) || 0;
  const sheet = showSheet(`<div class="sheet sheet--center" id="stock-sheet" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="stock-title">
    <div class="sheet__handle"></div>
    <div class="sheet__head">
      <div>
        <p class="admin-head__eyebrow">${t("admin.inventory.title")}</p>
        <h2 class="sheet__title" id="stock-title">${t("admin.inventory.adjustTitle")}</h2>
      </div>
      <button class="icon-btn" type="button" data-sheet-close aria-label="${t("common.close")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="sheet__body">
      <div class="stock-adjust__product">
        <span class="admin-thumb">${productImage(product, { alt: product.name })}</span>
        <div>
          <strong>${esc(product.name)}</strong>
          <span>${esc(product.shortSpec || product.brand)}</span>
        </div>
      </div>
      <div class="segmented" id="stock-conditions" role="group" aria-label="${t("admin.inventory.condition")}">
        ${CONDITIONS.map((key) => `<button type="button" data-cond="${key}" class="${key === condition ? "is-active" : ""}">
          ${t(`condition.${key}`)}
        </button>`).join("")}
      </div>
      <form class="admin-form" id="stock-form" novalidate>
        <div class="field">
          <label class="field__label" for="stock-qty">${t("admin.inventory.delta")}</label>
          <input class="input" id="stock-qty" name="qty" type="number" min="0" step="1" inputmode="numeric" value="${initial}" required>
          <p class="cell-sub">${t("admin.inventory.newQtyHint")}</p>
        </div>
        <div class="stock-adjust__preview">
          <div><span>${t("admin.inventory.preview")}</span></div>
          ${HUBS.map((hub) => `<div><span>${hub.label}</span><b data-preview="${hub.id}">0</b></div>`).join("")}
        </div>
      </form>
    </div>
    <div class="sheet__foot">
      <button class="btn btn--ghost" type="button" data-sheet-close>${t("common.cancel")}</button>
      <button class="btn btn--primary" type="submit" form="stock-form">
        <span class="material-symbols-outlined">check</span>${t("common.save")}
      </button>
    </div>
  </div>`);

  if (!sheet) return;

  let activeCondition = condition;

  const syncPreview = () => {
    const value = Math.max(0, Math.round(Number(sheet.querySelector("#stock-qty")?.value) || 0));
    const split = splitPreview(value);
    HUBS.forEach((hub) => {
      const node = sheet.querySelector(`[data-preview="${hub.id}"]`);
      if (node) node.textContent = formatNumber(split[hub.id]);
    });
  };

  sheet.querySelectorAll("[data-cond]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCondition = button.dataset.cond;
      sheet.querySelectorAll("[data-cond]").forEach((item) => item.classList.toggle("is-active", item === button));
      const input = sheet.querySelector("#stock-qty");
      if (input) input.value = Number(product.conditions?.[activeCondition]?.stock) || 0;
      syncPreview();
    });
  });

  sheet.querySelector("#stock-qty")?.addEventListener("input", syncPreview);
  syncPreview();

  sheet.querySelector("#stock-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = sheet.querySelector("#stock-qty");
    const value = Number(input?.value);
    if (!Number.isFinite(value) || value < 0) {
      toast(t("admin.inventory.needQty"), "error");
      return;
    }

    const before = Number(product.conditions?.[activeCondition]?.stock) || 0;
    const button = sheet.querySelector('[type="submit"][form="stock-form"]');
    button?.classList.add("is-loading");
    if (button) button.disabled = true;

    try {
      await setConditionStock(product.id, activeCondition, value);
      await appendAuditLog({
        actor: state.session.name,
        action: "Stock adjusted",
        target: `${product.name} · ${t(`condition.${activeCondition}`)}: ${before} → ${Math.round(value)}`,
        severity: value === 0 ? "warning" : "info",
        kind: "inventory",
      });
      state.products = await listAllProducts();
      closeSheet();
      renderAll();
      toast(t("admin.inventory.updated"), "success");
    } catch (error) {
      console.error(error);
      toast(t("common.retry"), "error");
    } finally {
      button?.classList.remove("is-loading");
      if (button) button.disabled = false;
    }
  });
}

/* -------------------------------- binding ------------------------------- */

function syncChips() {
  document.querySelectorAll("[data-condition]").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.condition === state.condition);
  });
  document.querySelectorAll("[data-hub]").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.hub === state.hub);
  });
  const low = $("#inventory-low");
  if (low) {
    low.classList.toggle("is-active", state.lowOnly);
    low.setAttribute("aria-pressed", String(state.lowOnly));
  }
}

function bindShell() {
  $("#inventory-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderRows();
  });

  $("#inventory-low")?.addEventListener("click", () => {
    state.lowOnly = !state.lowOnly;
    syncChips();
    renderRows();
  });

  document.querySelectorAll("[data-condition]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.condition = chip.dataset.condition;
      syncChips();
      renderRows();
    });
  });

  document.querySelectorAll("[data-hub]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.hub = chip.dataset.hub;
      syncChips();
      renderAll();
    });
  });

  $("#inventory-body")?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-adjust]");
    if (!trigger) return;
    openAdjust(trigger.dataset.adjust, trigger.dataset.conditionKey);
  });
}

function renderShell() {
  root().innerHTML = shellMarkup();
  bindShell();
  renderAll();
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const guard = await requireStaff("inventory.read");
  if (!guard) return;
  const session = guard.denied ? guard.session : guard;

  state.session = session;
  await initStore();
  mountAdminShell({ active: "inventory", session });

  if (guard.denied) {
    root().innerHTML = deniedBlock();
    return;
  }

  state.products = await listAllProducts();
  renderShell();

  onLangChange(() => {
    mountAdminShell({ active: "inventory", session });
    renderShell();
  });
}

main().catch((error) => {
  console.error(error);
  const host = root();
  if (host) host.innerHTML = emptyBlock({ icon: "cloud_off", title: t("common.retry") });
});
