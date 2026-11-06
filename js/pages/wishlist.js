/* ==========================================================================
   Wishlist page — renders saved products and bulk cart actions.
   ========================================================================== */

import { initStore, getProduct, totalStock } from "../store.js";
import { mountChrome } from "../ui/nav.js";
import { productCard, bindProductGrid } from "../ui/product-card.js";
import { getWishlist, removeWish } from "../wishlist.js";
import { addToCart } from "../cart.js";
import { toast } from "../ui/toast.js";
import { t, applyTranslations, onLangChange } from "../i18n.js";

const $ = (selector) => document.querySelector(selector);

function savedProducts() {
  return getWishlist().map(getProduct).filter(Boolean);
}

function render() {
  const products = savedProducts();
  const grid = $("#wishlist-grid");
  const empty = $("#wishlist-empty");
  const actions = $("#wishlist-actions");

  $("#wishlist-count").textContent = String(products.length);
  empty.hidden = products.length !== 0;
  actions.hidden = products.length === 0;

  if (!products.length) {
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = products.map(productCard).join("");
}

async function main() {
  $("#wishlist-grid").innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton-card" aria-hidden="true">
    <div class="skeleton skeleton--media"></div>
    <div class="skeleton skeleton--line short"></div>
    <div class="skeleton skeleton--line medium"></div>
  </div>`).join("");

  await initStore();
  await mountChrome("wishlist");
  applyTranslations(document);
  bindProductGrid();
  render();

  $("#wishlist-add-all")?.addEventListener("click", () => {
    let added = 0;
    savedProducts().forEach((product) => {
      if (totalStock(product) <= 0) return;
      addToCart(product, { condition: "new" });
      added += 1;
    });
    if (!added) {
      toast(t("common.outOfStock"), "error");
      return;
    }
    toast(`${added} ${t(added === 1 ? "cart.item" : "cart.items")} — ${t("product.addedToCart")}`, "success");
  });

  $("#wishlist-clear")?.addEventListener("click", () => {
    getWishlist().forEach((id) => removeWish(id));
    toast(t("wishlist.removed"));
  });

  window.addEventListener("wishlistchange", render);

  onLangChange(() => {
    mountChrome("wishlist");
    applyTranslations(document);
    render();
  });
}

main().catch((error) => {
  console.error(error);
  $("#wishlist-grid").innerHTML = `<div class="empty" style="grid-column:1/-1">
    <span class="empty__icon"><span class="material-symbols-outlined">cloud_off</span></span>
    <p class="empty__title">${t("common.retry")}</p>
  </div>`;
});
