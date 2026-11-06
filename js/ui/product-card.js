/* ==========================================================================
   Product card + quick view, shared by home, catalog, wishlist and related.
   ========================================================================== */

import { productImage } from "./art.js";
import { formatNumber, formatFCFA, esc, discountOf } from "../format.js";
import { t, localized, onLangChange } from "../i18n.js";
import { isWished, toggleWishlist } from "../wishlist.js";
import { addToCart } from "../cart.js";
import { priceOf, compareAtOf, totalStock, getProduct } from "../store.js";
import { toast } from "./toast.js";
import { openSheet, closeSheet } from "./sheet.js";

export function badgeClass(label) {
  const value = String(label).toUpperCase();
  if (value.includes("FREE")) return "badge--ice";
  if (value.startsWith("-") || value.includes("%")) return "badge--red";
  if (value.includes("OPEN") || value.includes("REFURB") || value.includes("FAIRLY")) return "badge--warning";
  if (value.includes("TOP")) return "badge--outline";
  return "badge--primary";
}

export function ratingMarkup(product) {
  return `<div class="p-card__rating">
    <span class="material-symbols-outlined">star</span>
    <span>${Number(product.rating || 0).toFixed(1)}</span>
    <span class="muted">(${formatNumber(product.reviewCount || 0)})</span>
  </div>`;
}

export function productCard(product) {
  const base = location.pathname.includes("/admin/") ? "../" : "";
  const price = priceOf(product);
  const compareAt = compareAtOf(product);
  const soldOut = totalStock(product) <= 0;
  const badges = (product.badges || []).slice(0, 2);

  return `<article class="p-card" data-product-card="${esc(product.id)}">
    <a class="p-card__media" href="${base}product.html?id=${encodeURIComponent(product.id)}" aria-label="${esc(product.name)}">
      <span class="p-card__badges">
        ${badges.map((label) => `<span class="badge ${badgeClass(label)}">${esc(label)}</span>`).join("")}
        ${soldOut ? `<span class="badge badge--outline">${t("common.outOfStock")}</span>` : ""}
      </span>
      ${productImage(product, { alt: product.name, sizes: "(min-width:1024px) 300px, 45vw" })}
    </a>
    <button class="p-card__fav${isWished(product.id) ? " is-active" : ""}" type="button"
      data-wish="${esc(product.id)}" aria-pressed="${isWished(product.id)}" aria-label="${t("nav.wishlist")}">
      <span class="material-symbols-outlined">favorite</span>
    </button>
    <div class="p-card__body">
      ${ratingMarkup(product)}
      <h3 class="p-card__name"><a href="${base}product.html?id=${encodeURIComponent(product.id)}">${esc(product.name)}</a></h3>
      <p class="p-card__sub">${esc(product.shortSpec || "")}</p>
      <div class="p-card__foot">
        <div>
          ${compareAt > price ? `<div class="p-card__price-compare">${formatNumber(compareAt)} FCFA</div>` : ""}
          <div class="p-card__price">${formatNumber(price)} <small>FCFA</small></div>
        </div>
        <button class="p-card__add" type="button" data-add="${esc(product.id)}" aria-label="${t("product.addToCart")}" title="${t("product.addToCart")}"
          ${soldOut ? "disabled" : ""}>
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
    </div>
  </article>`;
}

let bound = false;
let quickViewProduct = null;

function ensureQuickView() {
  let node = document.getElementById("quick-view");
  if (node) return node;
  node = document.createElement("div");
  node.className = "sheet sheet--center";
  node.id = "quick-view";
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = `<div class="sheet__handle"></div>
    <div class="sheet__head">
      <h2 class="sheet__title">${t("catalog.quickView")}</h2>
      <button class="icon-btn icon-btn--sm" type="button" data-sheet-close aria-label="${t("common.close")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="sheet__body" data-quick-body></div>
    <div class="sheet__foot" data-quick-foot></div>`;
  document.body.append(node);
  node.querySelector("[data-sheet-close]").addEventListener("click", () => closeSheet(node));
  return node;
}

export function openQuickView(product) {
  quickViewProduct = product;
  const node = ensureQuickView();
  const price = priceOf(product);
  const compareAt = compareAtOf(product);
  const saving = discountOf(price, compareAt);

  node.querySelector("[data-quick-body]").innerHTML = `
    <div class="quick-view">
      <div class="quick-view__stage">${productImage(product, { alt: product.name, eager: true })}</div>
      <div class="quick-view__info">
        <div class="row gap-6 wrap">${(product.badges || []).map((label) => `<span class="badge ${badgeClass(label)}">${esc(label)}</span>`).join("")}</div>
        <h3 class="t-h3">${esc(product.name)}</h3>
        <p class="t-sm secondary">${esc(product.shortSpec || "")}</p>
        ${ratingMarkup(product)}
        <div class="row gap-8" style="align-items:baseline">
          <strong class="t-h2" style="color:var(--primary-ink)">${formatFCFA(price)}</strong>
          ${saving ? `<span class="price-strike">${formatNumber(compareAt)} FCFA</span>` : ""}
        </div>
        <p class="t-sm muted">${esc(localized(product.description) || "")}</p>
        <a class="section-head__link" href="product.html?id=${encodeURIComponent(product.id)}">
          ${t("common.view")} — ${t("product.specs.title")}<span class="material-symbols-outlined">arrow_forward</span>
        </a>
      </div>
    </div>`;

  node.querySelector("[data-quick-foot]").innerHTML = `
    <button class="btn btn--ghost" type="button" data-sheet-close>${t("common.close")}</button>
    <button class="btn" type="button" data-quick-add>
      <span class="material-symbols-outlined">add_shopping_cart</span>${t("product.addToCart")}
    </button>`;

  node.querySelector("[data-quick-add]").addEventListener("click", () => {
    addToCart(product, { condition: "new" });
    toast(`${product.name} — ${t("product.addedToCart")}`, "success");
    closeSheet(node);
  });

  openSheet(node);
}

/** Delegated handlers for every rendered card. */
export function bindProductGrid() {
  if (bound) return;
  bound = true;

  document.addEventListener("click", (event) => {
    const wish = event.target.closest("[data-wish]");
    if (wish) {
      event.preventDefault();
      const active = toggleWishlist(wish.dataset.wish);
      wish.classList.toggle("is-active", active);
      wish.setAttribute("aria-pressed", String(active));
      toast(active ? t("wishlist.added") : t("wishlist.removed"));
      return;
    }

    const add = event.target.closest("[data-add]");
    if (add) {
      event.preventDefault();
      const product = getProduct(add.dataset.add);
      if (!product) return;
      addToCart(product, { condition: "new" });
      add.classList.add("is-added");
      add.querySelector(".material-symbols-outlined").textContent = "check";
      toast(`${product.name} — ${t("product.addedToCart")}`, "success");
      setTimeout(() => {
        add.classList.remove("is-added");
        add.querySelector(".material-symbols-outlined").textContent = "add";
      }, 1600);
    }
  });
}

/** Re-renders wishlist hearts after language or state changes. */
export function refreshWishButtons(scope = document) {
  scope.querySelectorAll("[data-wish]").forEach((button) => {
    const active = isWished(button.dataset.wish);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function skeletonCards(count = 8) {
  return Array.from({ length: count }, () => `<div class="skeleton-card" aria-hidden="true">
    <div class="skeleton skeleton--media"></div>
    <div class="skeleton skeleton--line short"></div>
    <div class="skeleton skeleton--line medium"></div>
    <div class="skeleton skeleton--line short"></div>
    <div style="height:12px"></div>
  </div>`).join("");
}

onLangChange(() => {
  const node = document.getElementById("quick-view");
  if (node && quickViewProduct) {
    node.querySelector("h2").textContent = t("catalog.quickView");
  }
});
