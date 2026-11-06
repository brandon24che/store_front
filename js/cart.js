/* ==========================================================================
   Cart — localStorage state, promo code, delivery address.
   A cart line snapshots the display fields so the cart renders before the
   catalogue finishes loading; prices are re-synced when a product is found.
   ========================================================================== */

import { BUSINESS } from "./config.js";
import { priceOf, getProduct } from "./store.js";

const KEY = "novatech.cart.v1";
const listeners = new Set();

const emptyState = () => ({ items: [], promo: null, address: null });

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    return raw && Array.isArray(raw.items) ? raw : emptyState();
  } catch {
    return emptyState();
  }
}

let state = read();

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
  window.dispatchEvent(new CustomEvent("cartchange"));
}

export function onCartChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCart() {
  return state;
}

export function itemKey(productId, condition, storage, color, ram) {
  return [productId, condition, storage, color, ram].filter(Boolean).join("|");
}

export function unitPriceFor(product, { condition = "new", storage = "", ram = "" } = {}) {
  let price = priceOf(product, condition);
  const storageTier = (product.variants?.storage || []).find((tier) => tier.label === storage);
  const ramTier = (product.variants?.ram || []).find((tier) => tier.label === ram);
  if (storageTier) price += storageTier.delta || 0;
  if (ramTier) price += ramTier.delta || 0;
  return price;
}

export function addToCart(product, options = {}) {
  const {
    condition = "new",
    storage = product.variants?.storage?.[0]?.label || "",
    color = product.variants?.color?.[0]?.name || "",
    ram = product.variants?.ram?.[0]?.label || "",
    qty = 1,
  } = options;

  const key = itemKey(product.id, condition, storage, color, ram);
  const price = unitPriceFor(product, { condition, storage, ram });
  const existing = state.items.find((item) => item.key === key);

  if (existing) {
    existing.qty += qty;
  } else {
    state.items.push({
      key,
      productId: product.id,
      name: product.name,
      brand: product.brand,
      condition,
      storage,
      color,
      ram,
      qty,
      unitPrice: price,
      art: product.art || null,
      tone: product.tone || null,
      accent: product.accent || null,
      imagePublicId: product.images?.[0]?.publicId || null,
    });
  }
  persist();
  return key;
}

export function updateQty(key, qty) {
  const item = state.items.find((line) => line.key === key);
  if (!item) return;
  item.qty = Math.max(1, Math.min(99, Number(qty) || 1));
  persist();
}

export function removeItem(key) {
  state.items = state.items.filter((item) => item.key !== key);
  persist();
}

export function clearCart() {
  state.items = [];
  state.promo = null;
  persist();
}

export function getCount() {
  return state.items.reduce((sum, item) => sum + item.qty, 0);
}

export function applyPromo(promo) {
  state.promo = { code: promo.code, type: promo.type, value: promo.value };
  persist();
}

export function removePromo() {
  state.promo = null;
  persist();
}

export function getAddress() {
  return state.address || defaultAddress();
}

export function setAddress(address) {
  state.address = {
    ...address,
    city: BUSINESS.cities.includes(address.city) ? address.city : BUSINESS.cities[0],
  };
  persist();
}

export function defaultAddress() {
  return { name: "", phone: "", city: "Douala", quarter: "", landmark: "" };
}

/** Re-syncs snapshot prices with the current catalogue. */
export function refreshPrices() {
  let changed = false;
  for (const item of state.items) {
    const product = getProduct(item.productId);
    if (!product) continue;
    const next = unitPriceFor(product, item);
    if (next !== item.unitPrice) {
      item.unitPrice = next;
      changed = true;
    }
  }
  if (changed) persist();
}

export function getTotals(discount = 0) {
  const subtotal = state.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const cappedDiscount = Math.min(discount, subtotal);
  const shipping = 0; // free in Douala and Yaoundé
  return {
    subtotal,
    discount: cappedDiscount,
    shipping,
    total: subtotal - cappedDiscount + shipping,
    count: getCount(),
  };
}
