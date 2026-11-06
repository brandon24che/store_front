/* ==========================================================================
   Product detail — gallery, live variant pricing, bundle and WhatsApp CTAs.
   ========================================================================== */

import {
  initStore, getProduct, getCategory, getRelated, getBundle,
  priceOf, compareAtOf, stockFor,
} from "../store.js";
import { mountChrome } from "../ui/nav.js";
import { productImage } from "../ui/art.js";
import { badgeClass, productCard, bindProductGrid, refreshWishButtons } from "../ui/product-card.js";
import { openSheet, closeSheet } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { addToCart, unitPriceFor } from "../cart.js";
import { isWished, toggleWishlist } from "../wishlist.js";
import { t, localized, applyTranslations, onLangChange } from "../i18n.js";
import { formatFCFA, formatNumber, splitFCFA, esc, discountOf } from "../format.js";
import { cldUrl, isCloudinaryConfigured } from "../cloudinary.js";

const $ = (selector) => document.querySelector(selector);

const CONDITIONS = ["new", "openBox", "refurb"];

const state = {
  condition: "new",
  storage: "",
  ram: "",
  color: "",
  qty: 1,
  slide: 0,
};

let product = null;
let views = [];
let has360 = false;

/* ------------------------------- helpers ------------------------------- */

function selectedPrice() {
  return unitPriceFor(product, state);
}

function selectedCompare() {
  const base = compareAtOf(product, state.condition);
  if (!base) return 0;
  const price = priceOf(product, state.condition);
  const extras = selectedPrice() - price;
  return base + extras;
}

function currentStock() {
  return stockFor(product, state.condition);
}

function maxQty() {
  return Math.max(1, Math.min(10, currentStock()));
}

function skuOf(item) {
  return `NT-${String(item.id).replace(/[^a-z0-9]/gi, "").slice(0, 7).toUpperCase()}`;
}

function starsMarkup(rating) {
  const full = Math.round(Number(rating) || 0);
  return Array.from({ length: 5 }, (_, index) =>
    `<span class="material-symbols-outlined" style="${index < full ? "" : "opacity:.28"}">star</span>`).join("");
}

function priceHtml(value) {
  const { amount, unit } = splitFCFA(value);
  return `${amount} <span class="pdp-price__unit">${unit}</span>`;
}

/* ------------------------------- gallery ------------------------------- */

function buildViews(item) {
  const images = item.images || [];
  if (isCloudinaryConfigured && images.length) {
    has360 = images.length > 2;
    return images.map((image, index) => ({
      kind: "image",
      publicId: image.publicId,
      modifier: "",
      alt: `${item.name} — ${index + 1}`,
    }));
  }
  has360 = Boolean(item.spin360);
  return [
    { kind: "art", modifier: "", alt: item.name },
    { kind: "art", modifier: "pdp-slide--zoom", alt: `${item.name} — ${t("product.zoom")}` },
    { kind: "art", modifier: "pdp-slide--angle", alt: `${item.name} — 45°` },
    { kind: "art", modifier: "pdp-slide--pack", alt: `${item.name} — ${t("product.included")}` },
  ];
}

function slideMarkup(view, index, forThumb = false) {
  const className = forThumb ? "pdp-thumb" : `pdp-slide ${view.modifier || ""}`;
  const active = index === 0 ? (forThumb ? " is-active" : " is-active") : "";
  const inner = view.kind === "image"
    ? `<img src="${esc(cldUrl(view.publicId, { w: forThumb ? 200 : 950 }))}"
        alt="${esc(view.alt)}" loading="${index === 0 && !forThumb ? "eager" : "lazy"}" decoding="async">`
    : productImage(product, {
      alt: view.alt,
      eager: index === 0 && !forThumb,
      sizes: forThumb ? "82px" : "(min-width:1024px) 620px, 92vw",
    });
  const extra = forThumb
    ? ` data-thumb="${index}" aria-label="${esc(view.alt)}"`
    : ` data-slide="${index}" tabindex="${index === 0 ? "0" : "-1"}" aria-label="${esc(view.alt)}" aria-hidden="${index === 0 ? "false" : "true"}"`;
  return `<button type="button" class="${className}${active}"${extra}>${inner}</button>`;
}

function renderGallery() {
  views = buildViews(product);
  const badges = (product.badges || []).map((label) =>
    `<span class="badge ${badgeClass(label)}">${esc(label)}</span>`).join("");

  return `<section class="pdp__media" aria-label="${t("product.gallery")}">
    <div class="pdp-gallery">
      <div class="pdp-gallery__stage" id="pdp-stage">
        <div class="pdp-gallery__badges">${badges}</div>
        <div class="pdp-gallery__actions">
          <button class="icon-btn${isWished(product.id) ? " is-active" : ""}" type="button" data-pdp-wish
            aria-pressed="${isWished(product.id)}" aria-label="${t("nav.wishlist")}" title="${t("nav.wishlist")}">
            <span class="material-symbols-outlined">favorite</span>
          </button>
          <button class="icon-btn" type="button" data-pdp-share aria-label="${t("common.share")}" title="${t("common.share")}">
            <span class="material-symbols-outlined">ios_share</span>
          </button>
          <button class="icon-btn" type="button" data-pdp-zoom aria-label="${t("product.zoom")}" title="${t("product.zoom")}">
            <span class="material-symbols-outlined">zoom_in</span>
          </button>
        </div>
        ${views.map((view, index) => slideMarkup(view, index)).join("")}
        <div class="pdp-gallery__foot">
          <span class="pdp-gallery__counter">
            <strong id="slide-index">1</strong>&nbsp;/&nbsp;${views.length}
          </span>
          ${has360 ? `<button class="pdp-gallery__360" type="button" data-spin>
            <span class="material-symbols-outlined">360</span>${t("product.view360")}</button>` : ""}
        </div>
      </div>
      <div class="pdp-gallery__thumbs" id="pdp-thumbs" role="group" aria-label="${t("product.gallery")}">
        ${views.map((view, index) => slideMarkup(view, index, true)).join("")}
      </div>
    </div>
  </section>`;
}

function setSlide(index) {
  state.slide = (index + views.length) % views.length;
  document.querySelectorAll("[data-slide]").forEach((slide, position) => {
    const active = position === state.slide;
    slide.classList.toggle("is-active", active);
    slide.setAttribute("aria-hidden", String(!active));
    slide.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-thumb]").forEach((thumb, position) => {
    thumb.classList.toggle("is-active", position === state.slide);
  });
  const counter = $("#slide-index");
  if (counter) counter.textContent = String(state.slide + 1);
}

function playSpin() {
  let ticks = 0;
  const timer = setInterval(() => {
    setSlide(state.slide + 1);
    if (++ticks >= views.length * 2) clearInterval(timer);
  }, 220);
}

function activeSlideMarkup() {
  const view = views[state.slide] || views[0];
  if (view.kind === "image") {
    return `<img src="${esc(cldUrl(view.publicId, { w: 1400 }))}" alt="${esc(view.alt)}">`;
  }
  return productImage(product, { alt: view.alt, eager: true, sizes: "80vw" });
}

/* -------------------------------- info --------------------------------- */

function conditionTile(condition) {
  const entry = product.conditions?.[condition];
  const stock = stockFor(product, condition);
  const price = priceOf(product, condition);
  const unavailable = !entry || stock <= 0;
  return `<button class="condition-tile${state.condition === condition ? " is-active" : ""}" type="button"
      data-condition="${condition}" ${unavailable ? "disabled" : ""} aria-pressed="${state.condition === condition}">
    <span class="condition-tile__stock" aria-hidden="true"></span>
    <span class="condition-tile__name">${t(`condition.${condition}`)}</span>
    <span class="condition-tile__note">${t(`condition.${condition}Note`)}</span>
    <span class="condition-tile__price">${unavailable ? t("product.unavailable") : `${formatNumber(price)} FCFA`}</span>
  </button>`;
}

function renderInfo() {
  const storage = product.variants?.storage || [];
  const ram = product.variants?.ram || [];
  const colors = product.variants?.color || [];

  return `<aside class="pdp__info">
    <div class="pdp-eyebrow">
      <span class="pdp-eyebrow__brand">${esc(product.brand)}</span>
      <span>${t("product.sku")} ${skuOf(product)}</span>
    </div>
    <h1 class="pdp-title">${esc(product.name)}</h1>
    <div class="pdp-rating">
      <span class="stars" aria-hidden="true">${starsMarkup(product.rating)}</span>
      <strong>${Number(product.rating || 0).toFixed(1)}</strong>
      <span>${formatNumber(product.reviewCount || 0)} ${t("product.reviews")}</span>
    </div>

    <div class="pdp-price">
      <span class="pdp-price__now" id="pdp-price-now"></span>
      <span class="pdp-price__was" id="pdp-price-was"></span>
      <span class="pdp-price__save" id="pdp-save"></span>
    </div>
    <p class="pdp-tax" id="pdp-tax">${t("common.vatIncluded")} · ${t("common.free")} — Douala &amp; Yaoundé</p>

    <div class="pdp-block">
      <div class="pdp-block__head">
        <span class="pdp-block__label">${t("product.selectCondition")}</span>
        <button class="pdp-guide-link" type="button" data-open-guide>
          ${t("product.gradingGuide")}<span class="material-symbols-outlined">help</span>
        </button>
      </div>
      <div class="condition-grid">${CONDITIONS.map(conditionTile).join("")}</div>
    </div>

    ${colors.length ? `<div class="pdp-block">
      <div class="pdp-block__head">
        <span class="pdp-block__label">${t("product.color")}</span>
        <span class="pdp-block__value" id="color-name">${esc(state.color)}</span>
      </div>
      <div class="swatches">
        ${colors.map((color) => `<button class="swatch${state.color === color.name ? " is-active" : ""}" type="button"
          style="--swatch:${esc(color.hex)}" data-color="${esc(color.name)}"
          aria-label="${esc(color.name)}" title="${esc(color.name)}" aria-pressed="${state.color === color.name}"></button>`).join("")}
      </div>
    </div>` : ""}

    ${storage.length ? `<div class="pdp-block">
      <div class="pdp-block__head">
        <span class="pdp-block__label">${t("product.storage")}</span>
        <span class="pdp-block__value">${t("product.selected")} : <strong id="storage-name">${esc(state.storage)}</strong></span>
      </div>
      <div class="variant-tiles">
        ${storage.map((tier) => `<button class="variant-tile${state.storage === tier.label ? " is-active" : ""}" type="button"
          data-storage="${esc(tier.label)}" aria-pressed="${state.storage === tier.label}">
          <span class="variant-tile__label">${esc(tier.label)}</span>
          <span class="variant-tile__delta">${tier.delta ? `+ ${formatNumber(tier.delta)} FCFA` : t("product.included")}</span>
        </button>`).join("")}
      </div>
    </div>` : ""}

    ${ram.length ? `<div class="pdp-block">
      <div class="pdp-block__head">
        <span class="pdp-block__label">${t("product.specs.ram")}</span>
        <span class="pdp-block__value">${t("product.selected")} : <strong id="ram-name">${esc(state.ram)}</strong></span>
      </div>
      <div class="variant-tiles">
        ${ram.map((tier) => `<button class="variant-tile${state.ram === tier.label ? " is-active" : ""}" type="button"
          data-ram="${esc(tier.label)}" aria-pressed="${state.ram === tier.label}">
          <span class="variant-tile__label">${esc(tier.label)}</span>
          <span class="variant-tile__delta">${tier.delta ? `+ ${formatNumber(tier.delta)} FCFA` : t("product.included")}</span>
        </button>`).join("")}
      </div>
    </div>` : ""}

    <div class="pdp-block">
      <div class="stock-line">
        <span class="dot" id="stock-dot"></span>
        <span id="stock-text"></span>
      </div>
      <div class="hub-split" id="hub-split"></div>
    </div>

    <div class="pdp-actions">
      <div class="qty" role="group" aria-label="${t("common.quantity")}">
        <button type="button" data-qty-minus aria-label="${t("common.remove")}">
          <span class="material-symbols-outlined">remove</span>
        </button>
        <output id="pdp-qty">${state.qty}</output>
        <button type="button" data-qty-plus aria-label="${t("common.add")}">
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
      <button class="btn btn--lg" type="button" data-add-cart>
        <span class="material-symbols-outlined">add_shopping_cart</span>${t("product.addToCart")}
      </button>
    </div>

    <div class="pdp-buy-secondary">
      <button class="btn btn--whatsapp btn--block btn--lg" type="button" data-buy-now>
        <span class="material-symbols-outlined">forum</span>${t("product.buyNow")}
      </button>
    </div>

    <div class="pdp-payment-note">
      <span class="material-symbols-outlined">shield</span>
      <span><strong>MTN MoMo · Orange Money · ${t("payment.cash_on_delivery")}</strong><br>${t("product.momo")}</span>
    </div>

    <div class="pdp-assurance">
      <div class="pdp-assurance__card">
        <span class="material-symbols-outlined">verified_user</span>
        <div><strong>${t("product.warranty.title")}</strong><span>${t("product.warranty.text")}</span></div>
      </div>
      <div class="pdp-assurance__card">
        <span class="material-symbols-outlined">local_shipping</span>
        <div><strong>${t("product.express.title")}</strong><span>${t("product.express.text")}</span></div>
      </div>
    </div>

    <div class="pdp-description">
      <h2>${t("product.description")}</h2>
      <p>${esc(localized(product.description) || "")}</p>
    </div>
  </aside>`;
}

/* ----------------------------- selection sync --------------------------- */

function syncSelection() {
  const price = selectedPrice();
  const compare = selectedCompare();
  const saving = discountOf(price, compare);
  const stock = currentStock();
  const low = stock > 0 && stock <= 5;

  const now = $("#pdp-price-now");
  if (now) now.innerHTML = priceHtml(price);

  const was = $("#pdp-price-was");
  if (was) {
    was.textContent = compare > price ? formatFCFA(compare) : "";
    was.hidden = !(compare > price);
  }

  const save = $("#pdp-save");
  if (save) {
    save.hidden = !saving;
    save.textContent = saving ? `${t("product.saving")} ${formatNumber(saving.amount)} FCFA · −${saving.percent}%` : "";
  }

  const tax = $("#pdp-tax");
  if (tax) {
    tax.textContent = `${t("common.vatIncluded")} · ${t("common.free")} — Douala & Yaoundé`;
  }

  document.querySelectorAll("[data-condition]").forEach((button) => {
    const active = button.dataset.condition === state.condition;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelectorAll("[data-color]").forEach((button) => {
    const active = button.dataset.color === state.color;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelectorAll("[data-storage]").forEach((button) => {
    const active = button.dataset.storage === state.storage;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelectorAll("[data-ram]").forEach((button) => {
    const active = button.dataset.ram === state.ram;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const colorName = $("#color-name");
  if (colorName) colorName.textContent = state.color || "—";
  const storageName = $("#storage-name");
  if (storageName) storageName.textContent = state.storage || "—";
  const ramName = $("#ram-name");
  if (ramName) ramName.textContent = state.ram || "—";

  const dot = $("#stock-dot");
  const text = $("#stock-text");
  if (dot && text) {
    dot.className = `dot${stock <= 0 ? " dot--out" : low ? " dot--low" : ""}`;
    if (stock <= 0) {
      text.innerHTML = `<strong>${t("common.outOfStock")}</strong> — ${t("product.unavailable")}`;
    } else if (low) {
      text.innerHTML = `<strong>${t("product.onlyLeft", { n: stock })}</strong> · ${t("common.lowStock")}`;
    } else {
      text.innerHTML = `<strong>${stock} ${t("product.stockAt")}</strong> · Douala — Akwa &amp; Yaoundé — Bastos`;
    }
  }

  const hubHost = $("#hub-split");
  if (hubHost) {
    const hubs = product.hubs?.[state.condition] || {};
    hubHost.innerHTML = stock > 0
      ? `<span class="hub-split__item"><span class="material-symbols-outlined">storefront</span>
          Douala — Akwa <strong>${hubs.douala || 0}</strong></span>
         <span class="hub-split__item"><span class="material-symbols-outlined">storefront</span>
          Yaoundé — Bastos <strong>${hubs.yaounde || 0}</strong></span>`
      : "";
  }

  if (state.qty > maxQty()) state.qty = maxQty();
  const qtyOut = $("#pdp-qty");
  if (qtyOut) qtyOut.textContent = String(state.qty);
  document.querySelectorAll("[data-qty-minus]").forEach((button) => { button.disabled = state.qty <= 1 || stock <= 0; });
  document.querySelectorAll("[data-qty-plus]").forEach((button) => { button.disabled = state.qty >= maxQty() || stock <= 0; });

  document.querySelectorAll("[data-add-cart], [data-buy-now], #bar-add").forEach((button) => {
    button.disabled = stock <= 0;
  });

  const barPrice = $("#bar-price");
  if (barPrice) barPrice.textContent = formatFCFA(price);

  const bundleTotal = $("#bundle-total");
  if (bundleTotal) {
    const extras = getBundle(product);
    bundleTotal.textContent = formatFCFA(
      selectedPrice() + extras.reduce((sum, item) => sum + priceOf(item), 0),
    );
  }

  const barWish = document.querySelector("[data-bar-wish]");
  if (barWish) {
    const wished = isWished(product.id);
    barWish.classList.toggle("is-active", wished);
    barWish.setAttribute("aria-pressed", String(wished));
  }
}

/* ------------------------------ other blocks ---------------------------- */

function renderSpecs() {
  const entries = Object.entries(product.specs || {});
  if (!entries.length) {
    $("#specs-host").innerHTML = "";
    return;
  }
  const rows = entries.map(([key, value]) => {
    const label = t(`product.specs.${key}`);
    return `<div class="spec-row">
      <dt>${esc(label === `product.specs.${key}` ? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : label)}</dt>
      <dd>${esc(value)}</dd>
    </div>`;
  }).join("");

  $("#specs-host").innerHTML = `
    <div class="pdp-specs__head">
      <h2>${t("product.specs.title")}</h2>
      <button class="btn btn--ghost btn--sm" type="button" data-datasheet>
        <span class="material-symbols-outlined">picture_as_pdf</span>${t("product.datasheet")}
      </button>
    </div>
    <dl class="pdp-specs__grid">${rows}</dl>`;

  $("#specs-host").querySelector("[data-datasheet]")?.addEventListener("click", () => {
    window.print();
  });
}

function renderBundle() {
  const extras = getBundle(product);
  const host = $("#bundle-host");
  if (!extras.length) {
    host.innerHTML = "";
    return;
  }

  const total = selectedPrice() + extras.reduce((sum, item) => sum + priceOf(item), 0);
  const items = [product, ...extras];

  host.innerHTML = `
    <div class="pdp-bundle">
      <div class="pdp-bundle__head">
        <h2>${t("product.bundle.title")}</h2>
        <span class="badge badge--teal">${t("product.bundle.total", { n: items.length })}</span>
      </div>
      <div class="pdp-bundle__items">
        ${items.map((item, index) => `
          ${index ? `<span class="bundle-plus" aria-hidden="true"><span class="material-symbols-outlined">add</span></span>` : ""}
          <div class="bundle-item">
            <a class="bundle-item__media" href="product.html?id=${encodeURIComponent(item.id)}">
              ${productImage(item, { alt: item.name, sizes: "148px" })}
            </a>
            <a class="bundle-item__name" href="product.html?id=${encodeURIComponent(item.id)}">${esc(item.name)}</a>
            <span class="bundle-item__price">${formatNumber(priceOf(item))} FCFA</span>
          </div>`).join("")}
      </div>
      <div class="pdp-bundle__foot">
        <div class="pdp-bundle__total">
          <span>${t("common.total")}</span>
          <strong id="bundle-total">${formatFCFA(total)}</strong>
          <em>${t("common.free")} · ${t("catalog.delivery24")}</em>
        </div>
        <button class="btn" type="button" data-add-bundle>
          <span class="material-symbols-outlined">add_shopping_cart</span>${t("product.bundle.add")}
        </button>
      </div>
    </div>`;

  host.querySelector("[data-add-bundle]").addEventListener("click", () => {
    addToCart(product, {
      condition: state.condition,
      storage: state.storage,
      ram: state.ram,
      color: state.color,
      qty: state.qty,
    });
    extras.forEach((item) => addToCart(item, { condition: "new" }));
    toast(t("product.addedToCart"), "success");
    refreshWishButtons();
  });
}

function renderRelated() {
  const related = getRelated(product, 4);
  const host = $("#related-host");
  if (!related.length) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `
    <div class="pdp-related__head">
      <h2>${t("product.related")}</h2>
      <a href="catalog.html?category=${encodeURIComponent(product.category)}">
        ${t("common.viewAll")}<span class="material-symbols-outlined">arrow_forward</span>
      </a>
    </div>
    <div class="grid grid--products">${related.map(productCard).join("")}</div>`;
}

/* -------------------------------- render ------------------------------- */

function renderPage() {
  document.title = `${product.name} — NovaTech`;

  const category = getCategory(product.category);
  $("#breadcrumb").innerHTML = `
    <a href="index.html">${t("nav.home")}</a>
    <span class="material-symbols-outlined">chevron_right</span>
    <a href="catalog.html">${t("nav.catalog")}</a>
    ${category ? `<span class="material-symbols-outlined">chevron_right</span>
      <a href="catalog.html?category=${encodeURIComponent(category.id)}">${esc(localized(category.name))}</a>` : ""}
    <span class="material-symbols-outlined">chevron_right</span>
    <span>${esc(product.name)}</span>`;

  const accent = product.accent || "#0062ff";
  $("#pdp-root").innerHTML = `<div class="pdp" style="--pdp-accent:${esc(accent)}">
    ${renderGallery()}
    ${renderInfo()}
  </div>`;

  document.querySelector("#bar-media").innerHTML = productImage(product, { alt: product.name, sizes: "42px" });
  document.querySelector("#bar-name").textContent = product.name;

  renderSpecs();
  renderBundle();
  renderRelated();
  bindProductGrid();
  syncSelection();
  setSlide(state.slide);
  bindPdpEvents();
  observeActions();
}

function bindPdpEvents() {
  const root = $("#pdp-root");

  root.querySelectorAll("[data-thumb]").forEach((thumb) => {
    thumb.addEventListener("click", () => setSlide(Number(thumb.dataset.thumb)));
  });

  root.querySelectorAll("[data-slide]").forEach((slide) => {
    slide.addEventListener("click", () => {
      setSlide(Number(slide.dataset.slide));
      $("#lightbox-stage").innerHTML = activeSlideMarkup();
      $("#lightbox-title").textContent = product.name;
      openSheet($("#lightbox"));
    });
  });

  root.querySelector("[data-spin]")?.addEventListener("click", playSpin);

  root.querySelector("[data-pdp-share]")?.addEventListener("click", async () => {
    const shareData = { title: product.name, text: `${product.name} — ${formatFCFA(selectedPrice())}`, url: location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(location.href);
      toast(t("product.shareCopied"), "success");
    } catch {
      toast(t("product.shareCopied"));
    }
  });

  root.querySelector("[data-pdp-wish]")?.addEventListener("click", (event) => {
    const active = toggleWishlist(product.id);
    event.currentTarget.classList.toggle("is-active", active);
    event.currentTarget.setAttribute("aria-pressed", String(active));
    toast(active ? t("wishlist.added") : t("wishlist.removed"));
  });

  root.querySelector("[data-pdp-zoom]")?.addEventListener("click", () => {
    $("#lightbox-stage").innerHTML = activeSlideMarkup();
    $("#lightbox-title").textContent = product.name;
    openSheet($("#lightbox"));
  });

  root.querySelectorAll("[data-condition]").forEach((button) => {
    button.addEventListener("click", () => {
      state.condition = button.dataset.condition;
      syncSelection();
    });
  });

  root.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      state.color = button.dataset.color;
      syncSelection();
    });
  });

  root.querySelectorAll("[data-storage]").forEach((button) => {
    button.addEventListener("click", () => {
      state.storage = button.dataset.storage;
      syncSelection();
    });
  });

  root.querySelectorAll("[data-ram]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ram = button.dataset.ram;
      syncSelection();
    });
  });

  root.querySelector("[data-qty-minus]")?.addEventListener("click", () => {
    state.qty = Math.max(1, state.qty - 1);
    syncSelection();
  });

  root.querySelector("[data-qty-plus]")?.addEventListener("click", () => {
    state.qty = Math.min(maxQty(), state.qty + 1);
    syncSelection();
  });

  root.querySelector("[data-open-guide]")?.addEventListener("click", () => openSheet($("#guide-sheet")));

  root.querySelector("[data-add-cart]")?.addEventListener("click", () => {
    commitToCart();
    toast(`${product.name} — ${t("product.addedToCart")}`, "success");
  });

  root.querySelector("[data-buy-now]")?.addEventListener("click", () => {
    commitToCart();
    location.href = "cart.html";
  });
}

function commitToCart() {
  addToCart(product, {
    condition: state.condition,
    storage: state.storage,
    ram: state.ram,
    color: state.color,
    qty: state.qty,
  });
  refreshWishButtons();
}

/* ------------------------------- bar wiring ----------------------------- */

let barObserver = null;

function observeActions() {
  const bar = $("#pdp-bar");
  const actions = document.querySelector(".pdp-actions");
  if (!bar || !actions) return;

  barObserver?.disconnect();
  barObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const visible = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      bar.classList.toggle("is-visible", visible);
      bar.setAttribute("aria-hidden", String(!visible));
    });
  }, { threshold: 0.15 });
  barObserver.observe(actions);
}

function bindBar() {
  document.querySelector("#bar-add")?.addEventListener("click", () => {
    if (!product) return;
    commitToCart();
    toast(`${product.name} — ${t("product.addedToCart")}`, "success");
  });

  document.querySelector("[data-bar-wish]")?.addEventListener("click", (event) => {
    if (!product) return;
    const active = toggleWishlist(product.id);
    event.currentTarget.classList.toggle("is-active", active);
    event.currentTarget.setAttribute("aria-pressed", String(active));
    document.querySelector("[data-pdp-wish]")?.classList.toggle("is-active", active);
    toast(active ? t("wishlist.added") : t("wishlist.removed"));
  });

  document.body.classList.add("has-pdp-bar");
}

/* --------------------------------- main -------------------------------- */

function emptyState() {
  document.title = `${t("catalog.empty.title")} — NovaTech`;
  $("#pdp-root").innerHTML = `<div class="empty" style="padding:64px 16px">
    <span class="empty__icon"><span class="material-symbols-outlined">search_off</span></span>
    <p class="empty__title">${t("catalog.empty.title")}</p>
    <p class="empty__text">${t("catalog.empty.text")}</p>
    <a class="btn" href="catalog.html">${t("cart.browse")}</a>
  </div>`;
  $("#specs-host").innerHTML = "";
  $("#bundle-host").innerHTML = "";
  $("#related-host").innerHTML = "";
  $("#pdp-bar").remove();
}

function hydrateSelection() {
  state.condition = "new";
  state.storage = product.variants?.storage?.[0]?.label || "";
  state.ram = product.variants?.ram?.[0]?.label || "";
  state.color = product.variants?.color?.[0]?.name || "";
  state.qty = 1;
  state.slide = 0;
}

async function main() {
  $("#pdp-root").innerHTML = `<div class="pdp">
    <div class="skeleton" style="aspect-ratio:1/1;border-radius:16px"></div>
    <div style="display:grid;gap:12px;align-content:start">
      <div class="skeleton skeleton--line short"></div>
      <div class="skeleton skeleton--line medium" style="height:28px"></div>
      <div class="skeleton skeleton--line short"></div>
      <div class="skeleton skeleton--line medium"></div>
      <div class="skeleton skeleton--line short"></div>
    </div>
  </div>`;

  await initStore();
  await mountChrome("catalog");
  applyTranslations(document);

  const id = new URLSearchParams(location.search).get("id");
  product = id ? getProduct(id) : null;

  if (!product) {
    emptyState();
    return;
  }

  hydrateSelection();
  renderPage();
  bindBar();
  applyTranslations(document);
  refreshWishButtons();

  document.querySelectorAll("[data-sheet-close]").forEach((button) => {
    button.addEventListener("click", () => closeSheet(button.closest(".sheet")));
  });

  const lightbox = $("#lightbox");
  lightbox.querySelector(".sheet__body")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeSheet(lightbox);
  });

  onLangChange(() => {
    mountChrome("catalog");
    applyTranslations(document);
    renderPage();
    applyTranslations(document);
    refreshWishButtons();
  });
}

main().catch((error) => {
  console.error(error);
  $("#pdp-root").innerHTML = `<div class="empty" style="padding:64px 16px">
    <span class="empty__icon"><span class="material-symbols-outlined">cloud_off</span></span>
    <p class="empty__title">${esc(error.message)}</p>
    <a class="btn" href="catalog.html">${t("cart.browse")}</a>
  </div>`;
});
