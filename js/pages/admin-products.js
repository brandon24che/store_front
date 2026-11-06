/* ==========================================================================
   Admin catalog — product table, CRUD drawer and Cloudinary uploader.
   ========================================================================== */

import {
  initStore, listAllProducts, getCategories, getBrands, saveProduct,
  deleteProduct, setProductsActive, priceOf, totalStock,
} from "../store.js";
import { requireStaff, can } from "../rbac.js";
import { mountAdminShell } from "../ui/nav.js";
import { closeSheet, bindSheetTriggers, openSheet } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { t, getLang, applyTranslations, onLangChange } from "../i18n.js";
import { formatFCFA, esc, slugify, formatNumber } from "../format.js";
import { productImage } from "../ui/art.js";
import { isCloudinaryConfigured, uploadImage, cldUrl } from "../cloudinary.js";
import { pageHead, kpi, emptyBlock, deniedBlock } from "../admin/ui.js";

const $ = (selector) => document.querySelector(selector);
const root = () => $("#products-root");

const ART_BY_CATEGORY = {
  smartphones: "phone",
  laptops: "laptop",
  audio: "headphones",
  smartwatches: "watch",
  tablets: "tablet",
  accessories: "charger",
  gaming: "console",
};

const state = {
  session: null,
  products: [],
  query: "",
  category: "all",
  active: "all",
  selected: new Set(),
  editing: null,
};

/* -------------------------------- helpers ------------------------------- */

function categories() {
  return getCategories();
}

function categoryName(id) {
  const category = categories().find((entry) => entry.id === id);
  if (!category) return id;
  return category.name[getLang()] || category.name.fr;
}

function filteredProducts() {
  const needle = state.query.trim().toLowerCase();
  return state.products
    .filter((product) => state.category === "all" || product.category === state.category)
    .filter((product) => {
      if (state.active === "all") return true;
      return state.active === "active" ? product.isActive !== false : product.isActive === false;
    })
    .filter((product) => {
      if (!needle) return true;
      return [product.name, product.brand, product.shortSpec, product.category]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function parseTiers(text) {
  return String(text || "")
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, delta] = part.split(":").map((piece) => piece.trim());
      return { label, delta: Math.max(0, Number(delta) || 0) };
    })
    .filter((tier) => tier.label);
}

function parseColors(text) {
  return String(text || "")
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, hex] = part.split(":").map((piece) => piece.trim());
      return { name, hex: hex || "#94a3b8" };
    })
    .filter((color) => color.name);
}

function parseSpecs(text) {
  const specs = {};
  String(text || "").split("\n").forEach((line) => {
    const index = line.indexOf(":");
    if (index < 0) return;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && value) specs[key] = value;
  });
  return specs;
}

function tiersText(tiers = []) {
  return tiers.map((tier) => `${tier.label}${tier.delta ? `:${tier.delta}` : ""}`).join(", ");
}

function colorsText(colors = []) {
  return colors.map((color) => `${color.name}${color.hex ? `:${color.hex}` : ""}`).join(", ");
}

function specsText(specs = {}) {
  return Object.entries(specs).map(([key, value]) => `${key}: ${value}`).join("\n");
}

/* -------------------------------- markup -------------------------------- */

function rowMarkup(product) {
  const stock = totalStock(product);
  const stockClass = stock === 0 ? "stock-pill--out" : stock < 5 ? "stock-pill--low" : "stock-pill--ok";
  const inStock = product.isActive !== false;
  return `<tr>
    <td>
      <input class="row-check" type="checkbox" data-select="${esc(product.id)}" ${state.selected.has(product.id) ? "checked" : ""} aria-label="${esc(product.name)}">
    </td>
    <td>
      <div class="cell-main">
        <span class="admin-thumb">${productImage(product, { alt: product.name })}</span>
        <div>
          <strong>${esc(product.name)}</strong>
          <span class="cell-sub">${esc(product.shortSpec || "")}</span>
        </div>
      </div>
    </td>
    <td>${esc(product.brand)}</td>
    <td>${esc(categoryName(product.category))}</td>
    <td class="num">
      ${formatFCFA(priceOf(product))}
      ${product.conditions?.new?.compareAtPrice ? `<span class="cell-sub">${formatFCFA(product.conditions.new.compareAtPrice)}</span>` : ""}
    </td>
    <td>
      <span class="stock-pill ${stockClass}">${formatNumber(stock)}</span>
    </td>
    <td>
      <label class="switch" title="${t(inStock ? "admin.products.active" : "admin.products.inactive")}">
        <input type="checkbox" data-active="${esc(product.id)}" ${inStock ? "checked" : ""} aria-label="${esc(product.name)}">
      </label>
    </td>
    <td>
      <div class="admin-row-actions">
        <button class="icon-btn" type="button" data-edit="${esc(product.id)}" aria-label="${t("common.edit")}" title="${t("common.edit")}">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button class="icon-btn" type="button" data-delete="${esc(product.id)}" aria-label="${t("common.delete")}" title="${t("common.delete")}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </td>
  </tr>`;
}

function shellMarkup() {
  const canWrite = can(state.session.role, "products.write");
  const categoryOptions = categories().map((category) => `<option value="${esc(category.id)}" ${state.category === category.id ? "selected" : ""}>${esc(category.name[getLang()] || category.name.fr)}</option>`).join("");
  const tabs = ["all", "active", "inactive"].map((key) => `<button type="button" class="chip ${state.active === key ? "is-active" : ""}" data-active-filter="${key}">
    ${t(`admin.products.filter.${key}`)}
  </button>`).join("");

  return `${pageHead({
    eyebrow: t("admin.title"),
    title: t("admin.products.title"),
    sub: t("admin.products.sub"),
    actions: canWrite
      ? `<button class="btn btn--primary btn--sm" type="button" id="new-product">
          <span class="material-symbols-outlined">add</span>${t("admin.products.new")}
        </button>`
      : "",
  })}
  <div class="admin-kpis" id="products-kpis"></div>
  <section class="admin-panel">
    <div class="admin-toolbar">
      <div class="admin-search">
        <span class="material-symbols-outlined">search</span>
        <input id="products-search" type="search" value="${esc(state.query)}" placeholder="${t("admin.products.search")}" aria-label="${t("admin.products.search")}">
      </div>
      <select id="products-category" aria-label="${t("admin.products.category")}">
        <option value="all" ${state.category === "all" ? "selected" : ""}>${t("common.all")}</option>
        ${categoryOptions}
      </select>
    </div>
    <div class="admin-filter-chips" role="group" aria-label="${t("admin.products.status")}">${tabs}</div>
    <div class="admin-panel__head">
      <h2 class="admin-panel__title"><span class="material-symbols-outlined">inventory_2</span>${t("admin.products.title")}</h2>
      <span class="admin-panel__count" id="products-count"></span>
    </div>
    <div class="admin-bulk" id="bulk-bar" hidden>
      <span id="bulk-count"></span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn--soft btn--sm" type="button" data-bulk="activate">
          <span class="material-symbols-outlined">visibility</span>${t("admin.products.activate")}
        </button>
        <button class="btn btn--ghost btn--sm" type="button" data-bulk="deactivate">
          <span class="material-symbols-outlined">visibility_off</span>${t("admin.products.deactivate")}
        </button>
      </div>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:36px"><input type="checkbox" id="select-all" aria-label="${t("admin.products.selectAll")}"></th>
            <th>${t("admin.inventory.product")}</th>
            <th>${t("admin.products.brand")}</th>
            <th>${t("admin.products.category")}</th>
            <th class="num">${t("admin.products.price")}</th>
            <th>${t("admin.inventory.level")}</th>
            <th>${t("admin.products.status")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="products-body"></tbody>
      </table>
    </div>
  </section>`;
}

function renderKpis() {
  const host = $("#products-kpis");
  if (!host) return;
  const active = state.products.filter((product) => product.isActive !== false).length;
  const low = state.products.filter((product) => totalStock(product) < 5).length;
  const value = state.products.reduce((sum, product) => sum + priceOf(product) * totalStock(product), 0);
  host.innerHTML = [
    kpi({ icon: "inventory_2", label: t("admin.products.total"), value: state.products.length }),
    kpi({ icon: "visibility", label: t("admin.products.activeCount"), value: active, tone: "success" }),
    kpi({ icon: "warning", label: t("admin.inventory.low"), value: low, tone: "warn" }),
    kpi({ icon: "payments", label: t("admin.products.catalogValue"), value: formatFCFA(value), tone: "teal" }),
  ].join("");
}

function renderRows() {
  const rows = filteredProducts();
  const body = $("#products-body");
  if (!body) return;
  body.innerHTML = rows.length
    ? rows.map(rowMarkup).join("")
    : `<tr><td colspan="8">${emptyBlock({ icon: "inventory_2", title: t("admin.products.empty") })}</td></tr>`;

  const count = $("#products-count");
  if (count) count.textContent = `${rows.length} / ${state.products.length}`;

  const bulk = $("#bulk-bar");
  if (bulk) {
    bulk.hidden = state.selected.size === 0;
    const label = $("#bulk-count");
    if (label) label.textContent = t("admin.products.selected", { n: state.selected.size });
  }

  const selectAll = $("#select-all");
  if (selectAll) {
    const visibleIds = rows.map((product) => product.id);
    const selectedVisible = visibleIds.filter((id) => state.selected.has(id)).length;
    selectAll.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  }
}

function renderAll() {
  renderKpis();
  renderRows();
}

/* ------------------------------- product form ---------------------------- */

function imageGridMarkup(images) {
  return images.map((image, index) => `<div class="image-chip">
    <img src="${esc(cldUrl(image.publicId, { w: 120 }) || "")}" alt="">
    ${index === 0 ? `<span class="image-chip__cover">${t("admin.products.cover")}</span>` : ""}
    <button type="button" data-remove-image="${index}" aria-label="${t("common.remove")}">
      <span class="material-symbols-outlined">close</span>
    </button>
  </div>`).join("");
}

function conditionBox(condition, entry) {
  return `<div class="condition-box">
    <div class="condition-box__head">${t(`condition.${condition}`)}<span>${t("admin.products.price")} / ${t("admin.inventory.level")}</span></div>
    <input class="input" name="price_${condition}" type="number" min="0" step="500" value="${Number(entry?.price) || 0}" aria-label="${t(`condition.${condition}`)} ${t("admin.products.price")}">
    <input class="input" name="stock_${condition}" type="number" min="0" step="1" value="${Number(entry?.stock) || 0}" aria-label="${t(`condition.${condition}`)} ${t("admin.inventory.level")}">
  </div>`;
}

function openProductForm(product = null) {
  state.editing = product;
  const images = [...(product?.images || [])];
  const newEntry = product?.conditions?.new;
  const brandOptions = getBrands().map((brand) => `<option value="${esc(brand.name)}"></option>`).join("");
  const categoryOptions = categories().map((category) => `<option value="${esc(category.id)}" ${product?.category === category.id ? "selected" : ""}>${esc(category.name[getLang()] || category.name.fr)}</option>`).join("");

  const sheet = showSheet(`<div class="sheet sheet--drawer" id="product-sheet" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="product-title">
    <div class="sheet__handle"></div>
    <div class="sheet__head">
      <div>
        <p class="admin-head__eyebrow">${t("admin.products.title")}</p>
        <h2 class="sheet__title" id="product-title">${product ? t("admin.products.edit") : t("admin.products.new")}</h2>
      </div>
      <button class="icon-btn" type="button" data-sheet-close aria-label="${t("common.close")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <form class="sheet__body admin-form" id="product-form" novalidate>
      <div class="form-section">
        <p class="form-section__title">${t("admin.products.name")}</p>
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="pf-name">${t("admin.products.name")}</label>
            <input class="input" id="pf-name" name="name" type="text" value="${esc(product?.name || "")}" required>
          </div>
          <div class="form-grid form-grid--2">
            <div class="field">
              <label class="field__label" for="pf-brand">${t("admin.products.brand")}</label>
              <input class="input" id="pf-brand" name="brand" type="text" list="brand-options" value="${esc(product?.brand || "")}" required>
              <datalist id="brand-options">${brandOptions}</datalist>
            </div>
            <div class="field">
              <label class="field__label" for="pf-category">${t("admin.products.category")}</label>
              <select class="input" id="pf-category" name="category" required>${categoryOptions}</select>
            </div>
          </div>
          <div class="field">
            <label class="field__label" for="pf-spec">${t("admin.products.shortSpec")}</label>
            <input class="input" id="pf-spec" name="shortSpec" type="text" value="${esc(product?.shortSpec || "")}">
          </div>
          <div class="field">
            <label class="field__label" for="pf-description">${t("admin.products.description")}</label>
            <textarea class="input" id="pf-description" name="description" rows="3">${esc(product?.description || "")}</textarea>
          </div>
        </div>
      </div>

      <div class="form-section">
        <p class="form-section__title">${t("admin.products.conditions")}</p>
        <div class="condition-grid">
          ${conditionBox("new", product?.conditions?.new)}
          ${conditionBox("openBox", product?.conditions?.openBox)}
          ${conditionBox("refurb", product?.conditions?.refurb)}
        </div>
        <div class="field" style="margin-top:10px">
          <label class="field__label" for="pf-compare">${t("admin.products.compareAt")}</label>
          <input class="input" id="pf-compare" name="compareAt" type="number" min="0" step="500" value="${Number(newEntry?.compareAtPrice) || 0}">
        </div>
      </div>

      <div class="form-section">
        <p class="form-section__title">${t("admin.products.variants")}</p>
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="pf-storage">${t("admin.products.storage")}</label>
            <input class="input" id="pf-storage" name="storage" type="text" placeholder="128GB, 256GB:50000" value="${esc(tiersText(product?.variants?.storage))}">
          </div>
          <div class="field">
            <label class="field__label" for="pf-ram">${t("admin.products.ram")}</label>
            <input class="input" id="pf-ram" name="ram" type="text" placeholder="8GB, 16GB:50000" value="${esc(tiersText(product?.variants?.ram))}">
          </div>
          <div class="field">
            <label class="field__label" for="pf-colors">${t("admin.products.colors")}</label>
            <input class="input" id="pf-colors" name="colors" type="text" placeholder="Noir:#111827, Blanc:#f8fafc" value="${esc(colorsText(product?.variants?.color))}">
          </div>
          <p class="cell-sub">${t("admin.products.variantsHint")}</p>
        </div>
      </div>

      <div class="form-section">
        <p class="form-section__title">${t("admin.products.specs")}</p>
        <div class="field">
          <textarea class="input" name="specs" rows="4" placeholder="Écran: 6.7&#34; OLED&#10;Puce: A17 Pro">${esc(specsText(product?.specs))}</textarea>
          <p class="cell-sub">${t("admin.products.specsHint")}</p>
        </div>
      </div>

      <div class="form-section">
        <p class="form-section__title">${t("admin.products.images")}</p>
        <div class="dropzone" id="product-dropzone" role="button" tabindex="0">
          <span class="material-symbols-outlined">cloud_upload</span>
          <b>${t("admin.products.dropzone")}</b>
          <span>${t("admin.products.imageHint")}</span>
        </div>
        <input type="file" id="product-files" accept="image/jpeg,image/png,image/webp" multiple hidden>
        <div class="upload-progress" id="upload-progress" hidden><span style="width:0%"></span></div>
        <div class="image-grid" id="image-grid">${imageGridMarkup(images)}</div>
        ${isCloudinaryConfigured ? "" : `<p class="cell-sub" style="margin-top:8px">${t("common.demoNotice")}</p>`}
      </div>

      <div class="form-section">
        <p class="form-section__title">${t("admin.products.badges")}</p>
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="pf-badges">${t("admin.products.badges")}</label>
            <input class="input" id="pf-badges" name="badges" type="text" placeholder="NEW, FREE SHIP, -10%" value="${esc((product?.badges || []).join(", "))}">
          </div>
          <div class="switch-row">
            <span>${t("admin.products.flash")}</span>
            <label class="switch"><input type="checkbox" name="flash" ${product?.isFlashDeal ? "checked" : ""} aria-label="${t("admin.products.flash")}"></label>
          </div>
          <div class="field">
            <label class="field__label" for="pf-flash-end">${t("admin.products.flashEnd")}</label>
            <input class="input" id="pf-flash-end" name="flashEnd" type="datetime-local" value="${product?.flashEndsAt ? new Date(product.flashEndsAt).toISOString().slice(0, 16) : ""}">
          </div>
          <div class="switch-row">
            <span>${t("admin.products.active")}</span>
            <label class="switch"><input type="checkbox" name="isActive" ${product?.isActive !== false ? "checked" : ""} aria-label="${t("admin.products.active")}"></label>
          </div>
        </div>
      </div>
    </form>

    <div class="sheet__foot">
      <button class="btn btn--ghost" type="button" data-sheet-close>${t("common.cancel")}</button>
      <button class="btn btn--primary" type="submit" form="product-form" id="product-save">
        <span class="material-symbols-outlined">save</span>${t("common.save")}
      </button>
    </div>
  </div>`);

  if (!sheet) return;

  const grid = sheet.querySelector("#image-grid");
  const dropzone = sheet.querySelector("#product-dropzone");
  const fileInput = sheet.querySelector("#product-files");
  const progress = sheet.querySelector("#upload-progress");
  const progressBar = progress.querySelector("span");

  const renderImages = () => {
    grid.innerHTML = imageGridMarkup(images);
    grid.querySelectorAll("[data-remove-image]").forEach((button) => {
      button.addEventListener("click", () => {
        images.splice(Number(button.dataset.removeImage), 1);
        renderImages();
      });
    });
  };

  const uploadFiles = async (files) => {
    if (!isCloudinaryConfigured) {
      toast(t("common.demoNotice"), "error");
      return;
    }
    progress.hidden = false;
    for (const file of files) {
      try {
        progressBar.style.width = "10%";
        const result = await uploadImage(file, {
          onProgress: (value) => { progressBar.style.width = `${value}%`; },
        });
        images.push({ publicId: result.publicId, alt: "" });
      } catch (error) {
        console.error(error);
        toast(`${t("admin.products.uploadError")} ${error.message || ""}`, "error");
      }
    }
    progressBar.style.width = "100%";
    setTimeout(() => { progress.hidden = true; progressBar.style.width = "0%"; }, 500);
    renderImages();
    if (images.length) toast(t("admin.products.uploaded"), "success");
  };

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-over"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-over");
    uploadFiles([...event.dataTransfer.files]);
  });
  fileInput.addEventListener("change", () => uploadFiles([...fileInput.files]));

  renderImages();

  sheet.querySelector("#product-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const brand = String(data.get("brand") || "").trim();
    const priceNew = Number(data.get("price_new")) || 0;

    if (name.length < 2 || !brand) {
      toast(t("admin.products.needName"), "error");
      return;
    }
    if (priceNew <= 0) {
      toast(t("admin.products.needPrice"), "error");
      return;
    }
    if (isCloudinaryConfigured && !images.length) {
      toast(t("admin.products.needImage"), "error");
      return;
    }

    const category = String(data.get("category") || "smartphones");
    const compareAt = Number(data.get("compareAt")) || 0;
    const openBoxPrice = Number(data.get("price_openBox")) || Math.round((priceNew * 0.92) / 500) * 500;
    const refurbPrice = Number(data.get("price_refurb")) || Math.round((priceNew * 0.82) / 500) * 500;
    const flashEnd = String(data.get("flashEnd") || "");
    const isFlash = data.get("flash") === "on";

    const payload = {
      ...(product?.id ? { id: product.id } : {}),
      name,
      slug: slugify(name),
      brand,
      category,
      art: product?.art || ART_BY_CATEGORY[category] || "phone",
      tone: product?.tone || "graphite",
      accent: product?.accent || "#0062ff",
      shortSpec: String(data.get("shortSpec") || "").trim(),
      description: String(data.get("description") || "").trim(),
      conditions: {
        new: { price: priceNew, compareAtPrice: compareAt > priceNew ? compareAt : 0, stock: Number(data.get("stock_new")) || 0 },
        openBox: { price: openBoxPrice, compareAtPrice: priceNew, stock: Number(data.get("stock_openBox")) || 0 },
        refurb: { price: refurbPrice, compareAtPrice: priceNew, stock: Number(data.get("stock_refurb")) || 0 },
      },
      variants: {
        storage: parseTiers(data.get("storage")),
        ram: parseTiers(data.get("ram")),
        color: parseColors(data.get("colors")),
      },
      specs: parseSpecs(data.get("specs")),
      images,
      badges: String(data.get("badges") || "").split(",").map((badge) => badge.trim()).filter(Boolean),
      tags: product?.tags || [],
      rating: product?.rating ?? 4.7,
      reviewCount: product?.reviewCount ?? 0,
      isFlashDeal: isFlash,
      flashEndsAt: isFlash && flashEnd ? new Date(flashEnd).getTime() : null,
      isFeatured: product?.isFeatured || false,
      isActive: data.get("isActive") === "on",
      createdAt: product?.createdAt || Date.now(),
      searchKeywords: `${name} ${brand} ${category} ${data.get("shortSpec") || ""}`.toLowerCase(),
    };

    const button = sheet.querySelector("#product-save");
    button?.classList.add("is-loading");
    if (button) button.disabled = true;

    try {
      await saveProduct(payload);
      toast(product ? t("admin.products.saved") : t("admin.products.created"), "success");
      closeSheet();
      await loadProducts();
      renderAll();
    } catch (error) {
      console.error(error);
      toast(t("common.retry"), "error");
    } finally {
      button?.classList.remove("is-loading");
      if (button) button.disabled = false;
    }
  });
}

function showSheet(markup) {
  const overlays = $("#admin-overlays");
  overlays.innerHTML = markup;
  const el = overlays.querySelector(".sheet");
  if (!el) return null;
  bindSheetTriggers(el);
  openSheet(el);
  return el;
}

/* -------------------------------- actions -------------------------------- */

async function loadProducts() {
  state.products = await listAllProducts();
}

async function toggleActive(productId, isActive) {
  await setProductsActive([productId], isActive);
  state.selected.delete(productId);
  await loadProducts();
  renderAll();
  toast(t("admin.staff.updated"), "success");
}

async function bulkToggle(isActive) {
  if (!state.selected.size) return;
  await setProductsActive([...state.selected], isActive);
  state.selected.clear();
  await loadProducts();
  renderAll();
  toast(t("admin.staff.updated"), "success");
}

async function removeProduct(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;
  if (!window.confirm(t("admin.products.deleteConfirm"))) return;
  await deleteProduct(productId);
  state.selected.delete(productId);
  await loadProducts();
  renderAll();
  toast(t("admin.products.deleted"), "success");
}

/* -------------------------------- binding -------------------------------- */

function bindShell() {
  const host = root();

  host.querySelector("#products-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderRows();
  });

  host.querySelector("#products-category")?.addEventListener("change", (event) => {
    state.category = event.target.value;
    renderRows();
  });

  host.querySelectorAll("[data-active-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.active = button.dataset.activeFilter;
      host.querySelectorAll("[data-active-filter]").forEach((entry) => {
        entry.classList.toggle("is-active", entry === button);
      });
      renderRows();
    });
  });

  host.querySelector("#new-product")?.addEventListener("click", () => openProductForm());

  host.querySelector("#select-all")?.addEventListener("change", (event) => {
    const rows = filteredProducts();
    if (event.target.checked) rows.forEach((product) => state.selected.add(product.id));
    else rows.forEach((product) => state.selected.delete(product.id));
    renderRows();
  });

  host.querySelector("#products-body")?.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select]");
    if (checkbox) {
      if (checkbox.checked) state.selected.add(checkbox.dataset.select);
      else state.selected.delete(checkbox.dataset.select);
      renderRows();
    }
  });

  host.addEventListener("change", (event) => {
    const toggle = event.target.closest("[data-active]");
    if (toggle) toggleActive(toggle.dataset.active, toggle.checked);
  });

  host.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    if (edit) {
      const product = state.products.find((entry) => entry.id === edit.dataset.edit);
      if (product) openProductForm(product);
      return;
    }
    const remove = event.target.closest("[data-delete]");
    if (remove) removeProduct(remove.dataset.delete);
  });

  host.querySelectorAll("[data-bulk]").forEach((button) => {
    button.addEventListener("click", () => bulkToggle(button.dataset.bulk === "activate"));
  });
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const guard = await requireStaff("products.read");
  if (!guard) return;
  const session = guard.denied ? guard.session : guard;

  state.session = session;
  await initStore();
  mountAdminShell({ active: "products", session });

  if (guard.denied) {
    root().innerHTML = deniedBlock();
    return;
  }

  await loadProducts();
  root().innerHTML = shellMarkup();
  applyTranslations(root());
  bindShell();
  renderAll();

  onLangChange(() => {
    mountAdminShell({ active: "products", session });
    root().innerHTML = shellMarkup();
    applyTranslations(root());
    bindShell();
    renderAll();
  });
}

main().catch((error) => {
  console.error(error);
  const host = root();
  if (host) host.innerHTML = emptyBlock({ icon: "cloud_off", title: t("common.retry") });
});
