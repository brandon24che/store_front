/* ==========================================================================
   Wishlist — local list of product ids. Merged into Firestore on sign-in
   when a customer is authenticated.
   ========================================================================== */

const KEY = "novatech.wishlist.v1";

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let ids = read();

function persist() {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent("wishlistchange"));
}

export function getWishlist() {
  return [...ids];
}

export function isWished(productId) {
  return ids.includes(productId);
}

export function toggleWishlist(productId) {
  const active = ids.includes(productId);
  ids = active ? ids.filter((id) => id !== productId) : [...ids, productId];
  persist();
  return !active;
}

export function removeWish(productId) {
  ids = ids.filter((id) => id !== productId);
  persist();
}

export function wishlistCount() {
  return ids.length;
}
