/* ==========================================================================
   Cart & WhatsApp checkout — persists the order, then hands off to WhatsApp.
   ========================================================================== */

import { initStore, getProduct, validatePromo, createOrder, stockFor } from "../store.js";
import { getCustomer } from "../auth.js";
import { mountChrome } from "../ui/nav.js";
import { productImage } from "../ui/art.js";
import { openSheet, closeSheet } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import {
  getCart, getCount, onCartChange, updateQty, removeItem, clearCart, getTotals,
  applyPromo, removePromo, getAddress, setAddress, refreshPrices,
} from "../cart.js";
import { buildOrderMessage, waLink } from "../whatsapp.js";
import { t, applyTranslations, onLangChange } from "../i18n.js";
import { formatFCFA, formatNumber, formatPhone, isValidCameroonPhone, normalizePhone, esc } from "../format.js";
import { BUSINESS } from "../config.js";

const $ = (selector) => document.querySelector(selector);
const itemsLabel = (count) => `${formatNumber(count)} ${t(count === 1 ? "cart.item" : "cart.items")}`;

let completed = false;
let submitting = false;
let lastSuccess = null;

/* ------------------------------- helpers ------------------------------- */

function totalsNow() {
  const cart = getCart();
  const subtotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const promo = cart.promo;
  const discount = !promo
    ? 0
    : promo.type === "percent"
      ? Math.round((subtotal * promo.value) / 100)
      : Math.min(promo.value, subtotal);
  return { ...getTotals(discount), promoCode: promo?.code || null };
}

function addressProblem(address) {
  if (!address || !address.name || address.name.trim().length < 2) return t("cart.validation.name");
  if (!isValidCameroonPhone(address.phone)) return t("cart.validation.phone");
  if (!address.quarter || !address.quarter.trim()) return t("cart.validation.quarter");
  return null;
}

function addressIsComplete() {
  return !addressProblem(getAddress());
}

function setStepper(stage) {
  document.querySelectorAll(".stepper__step").forEach((step) => {
    const index = Number(step.dataset.step);
    step.classList.toggle("is-active", index === stage);
    step.classList.toggle("is-done", index < stage);
    if (index < stage) step.querySelector(".stepper__dot").textContent = "✓";
    else step.querySelector(".stepper__dot").textContent = String(index);
  });
  document.querySelectorAll(".stepper__bar").forEach((bar, index) => {
    bar.classList.toggle("is-done", index < stage - 1);
  });
}

/* -------------------------------- items -------------------------------- */

function lineMarkup(item) {
  const product = getProduct(item.productId);
  const stock = product ? stockFor(product, item.condition) : 0;
  const capped = Math.max(1, Math.min(10, stock));
  const meta = [
    t(`condition.${item.condition}`),
    item.storage,
    item.ram,
    item.color,
  ].filter(Boolean);

  return `<article class="cart-line" data-key="${esc(item.key)}">
    <a class="cart-line__media" href="product.html?id=${encodeURIComponent(item.productId)}" aria-label="${esc(item.name)}">
      ${product ? productImage(product, { alt: item.name, sizes: "96px" }) : ""}
    </a>
    <div class="cart-line__body">
      <span class="cart-line__brand">${esc(item.brand || "")}</span>
      <a class="cart-line__name" href="product.html?id=${encodeURIComponent(item.productId)}">${esc(item.name)}</a>
      <div class="cart-line__meta">${meta.map((value) => `<span>${esc(value)}</span>`).join("")}</div>
      ${product && stock > 0 && stock <= item.qty
        ? `<span class="cart-line__stock">${t("product.onlyLeft", { n: stock })}</span>`
        : ""}
      ${!product ? `<span class="cart-line__stock">${t("product.unavailable")}</span>` : ""}
    </div>
    <div class="cart-line__foot">
      <div class="qty" role="group" aria-label="${t("common.quantity")}">
        <button type="button" data-line-minus aria-label="${t("common.remove")}" ${item.qty <= 1 ? "disabled" : ""}>
          <span class="material-symbols-outlined">remove</span>
        </button>
        <output>${item.qty}</output>
        <button type="button" data-line-plus aria-label="${t("common.add")}" ${item.qty >= capped ? "disabled" : ""}>
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
      <div class="cart-line__price">
        <strong>${formatNumber(item.unitPrice * item.qty)} <small>FCFA</small></strong>
        ${item.qty > 1 ? `<small>${formatNumber(item.unitPrice)} ${t("common.perUnit")}</small>` : ""}
      </div>
    </div>
    <button class="cart-line__remove" type="button" data-line-remove aria-label="${t("common.remove")}">
      <span class="material-symbols-outlined">close</span>
    </button>
  </article>`;
}

function bindLineEvents() {
  const list = $("#cart-list");
  if (list.dataset.bound === "true") return;
  list.dataset.bound = "true";

  list.addEventListener("click", (event) => {
    const line = event.target.closest("[data-key]");
    if (!line) return;
    const key = line.dataset.key;
    const item = getCart().items.find((entry) => entry.key === key);
    if (!item) return;

    if (event.target.closest("[data-line-minus]")) {
      updateQty(key, item.qty - 1);
      return;
    }
    if (event.target.closest("[data-line-plus]")) {
      updateQty(key, item.qty + 1);
      return;
    }
    if (event.target.closest("[data-line-remove]")) {
      removeItem(key);
      toast(t("cart.removed"), "success");
    }
  });
}

function renderCart() {
  const cart = getCart();
  const empty = cart.items.length === 0;
  $("#cart-layout").hidden = empty;
  $("#cart-empty").hidden = !empty;
  $("#cart-head-count").textContent = empty ? "" : itemsLabel(getCount() || cart.items.reduce((s, i) => s + i.qty, 0));

  if (empty) {
    $("#cart-list").innerHTML = "";
    $("#cart-summary").innerHTML = "";
    $("#cart-item-count").textContent = "";
    setStepper(1);
    return;
  }

  $("#cart-list").innerHTML = cart.items.map(lineMarkup).join("");
  $("#cart-item-count").textContent = itemsLabel(cart.items.length);

  renderSummary();
  renderPreview();
  setStepper(addressIsComplete() ? 2 : 1);
}

/* ------------------------------- summary ------------------------------- */

function voucherMarkup() {
  const promo = getCart().promo;
  if (promo) {
    const totals = totalsNow();
    return `<div class="voucher-applied">
      <span><strong>${esc(promo.code)}</strong> — ${t("cart.applied")} · −${formatFCFA(totals.discount)}</span>
      <button type="button" data-remove-promo aria-label="${t("common.remove")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>`;
  }
  return `<form class="voucher-row" id="voucher-form">
    <input class="input" id="voucher-input" type="text" autocomplete="off" spellcheck="false"
      data-i18n-placeholder="cart.voucherPlaceholder" placeholder="${t("cart.voucherPlaceholder")}"
      aria-label="${t("cart.voucher")}">
    <button class="btn btn--ghost" type="submit">${t("common.apply")}</button>
  </form>`;
}

function addressMarkup() {
  const address = getAddress();
  if (!addressIsComplete()) {
    return `<div class="address-empty">
      <p>${t("cart.validation.address")}</p>
      <button class="btn btn--ghost btn--sm" type="button" data-edit-address>
        <span class="material-symbols-outlined">add_location_alt</span>${t("cart.address.title")}
      </button>
    </div>`;
  }
  return `<div class="address-card">
    <span class="material-symbols-outlined">location_on</span>
    <div class="address-card__body">
      <div class="address-card__name">${esc(address.name)}</div>
      <div class="address-card__line">${esc([address.quarter, address.city].filter(Boolean).join(", "))}${address.landmark ? ` · ${esc(address.landmark)}` : ""}</div>
      <div class="address-card__phone">${formatPhone(address.phone)}</div>
    </div>
  </div>`;
}

function renderSummary() {
  const totals = totalsNow();
  const promo = getCart().promo;
  const host = $("#cart-summary");

  host.innerHTML = `
    <section class="summary-section">
      <div class="summary-section__head">
        <span class="summary-section__title"><span class="material-symbols-outlined">sell</span>${t("cart.voucher")}</span>
      </div>
      ${voucherMarkup()}
    </section>

    <section class="summary-section">
      <div class="summary-section__head">
        <span class="summary-section__title"><span class="material-symbols-outlined">location_on</span>${t("cart.delivery")}</span>
        ${addressIsComplete() ? `<button class="summary-section__action" type="button" data-edit-address>${t("cart.change")}</button>` : ""}
      </div>
      ${addressMarkup()}
    </section>

    <section class="summary-section">
      <div class="summary-section__head">
        <span class="summary-section__title"><span class="material-symbols-outlined">forum</span>${t("cart.message.title")}</span>
        <span class="badge badge--outline">${t("cart.message.auto")}</span>
      </div>
      <pre class="wa-preview" id="wa-preview"></pre>
      <p class="summary-note" style="margin-top:8px">
        <span class="material-symbols-outlined">info</span><span>${t("cart.message.hint")}</span>
      </p>
    </section>

    <section class="summary-section">
      <div class="summary-section__head">
        <span class="summary-section__title"><span class="material-symbols-outlined">receipt_long</span>${t("cart.calc.title")}</span>
      </div>
      <div class="totals">
        <div class="totals__row"><span>${t("cart.calc.subtotal")}</span><span>${formatFCFA(totals.subtotal)}</span></div>
        ${totals.discount > 0 ? `<div class="totals__row totals__row--discount">
          <span>${t("cart.calc.discount")} ${promo ? `(${esc(promo.code)})` : ""}</span><span>−${formatFCFA(totals.discount)}</span>
        </div>` : ""}
        <div class="totals__row"><span>${t("cart.calc.taxes")}</span><span>${t("cart.calc.taxesIncluded")}</span></div>
        <div class="totals__row totals__row--free"><span>${t("cart.calc.shipping")}</span><span>${t("cart.calc.freeDelivery")}</span></div>
        <div class="totals__total">
          <span>${t("cart.calc.total")}</span>
          <strong>${formatNumber(totals.total)} <small>FCFA</small></strong>
        </div>
      </div>
    </section>

    <div class="summary-checkout">
      <button class="btn btn--whatsapp btn--lg btn--block" type="button" id="checkout">
        <span class="material-symbols-outlined">forum</span>${t("cart.checkout")}
      </button>
      <p class="summary-note">
        <span class="material-symbols-outlined">lock</span>
        <span>${t("product.momo")}</span>
      </p>
      <p class="summary-note">
        <span class="material-symbols-outlined">schedule</span>
        <span>${t("product.express.text")}</span>
      </p>
    </div>

    <div class="cart-trust">
      <span><span class="material-symbols-outlined">verified_user</span>${t("cart.trust.warranty")}</span>
      <span><span class="material-symbols-outlined">phone_iphone</span>${t("cart.trust.momo")}</span>
      <span><span class="material-symbols-outlined">storefront</span>${t("cart.trust.hub")}</span>
    </div>`;

  bindSummary();
  renderPreview();
}

function bindSummary() {
  const host = $("#cart-summary");

  host.querySelector("#voucher-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = host.querySelector("#voucher-input");
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    const { subtotal } = totalsNow();
    const result = await validatePromo(code, subtotal);
    if (!result.ok) {
      if (result.reason === "minOrder") {
        toast(t("cart.voucher.minOrder", { amount: formatFCFA(result.minOrder) }), "error");
      } else {
        toast(t("cart.voucher.invalid"), "error");
      }
      input.classList.add("input--error");
      return;
    }
    applyPromo(result.promo);
    toast(`${result.promo.code} — ${t("cart.applied")}`, "success");
    renderCart();
  });

  host.querySelector("[data-remove-promo]")?.addEventListener("click", () => {
    removePromo();
    toast(t("cart.voucher.removed"));
    renderCart();
  });

  host.querySelectorAll("[data-edit-address]").forEach((button) => {
    button.addEventListener("click", openAddressSheet);
  });

  host.querySelector("#checkout")?.addEventListener("click", checkout);
}

function renderPreview() {
  const preview = $("#wa-preview");
  if (!preview) return;
  const cart = getCart();
  const address = getAddress();
  preview.textContent = buildOrderMessage({
    items: cart.items,
    totals: totalsNow(),
    address: { ...address, quarter: address.quarter || "", city: address.city },
    code: "WA-XXXX",
  });
}

/* ------------------------------- address ------------------------------- */

function openAddressSheet() {
  const address = getAddress();
  const form = $("#address-form");
  form.querySelector("#addr-name").value = address.name || "";
  form.querySelector("#addr-phone").value = address.phone ? formatPhone(address.phone) : "";
  form.querySelector("#addr-city").value = address.city || BUSINESS.cities[0];
  form.querySelector("#addr-quarter").value = address.quarter || "";
  form.querySelector("#addr-landmark").value = address.landmark || "";
  $("#address-error").hidden = true;
  form.querySelectorAll(".input").forEach((input) => input.classList.remove("input--error"));
  openSheet($("#address-sheet"));
  setTimeout(() => form.querySelector("#addr-name").focus({ preventScroll: true }), 220);
}

function bindAddressForm() {
  const form = $("#address-form");
  const error = $("#address-error");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const phoneRaw = String(data.get("phone") || "").trim();
    const city = String(data.get("city") || BUSINESS.cities[0]);
    const quarter = String(data.get("quarter") || "").trim();
    const landmark = String(data.get("landmark") || "").trim();

    form.querySelectorAll(".input").forEach((input) => input.classList.remove("input--error"));

    if (name.length < 2) {
      error.textContent = t("cart.validation.name");
      error.hidden = false;
      form.querySelector("#addr-name").classList.add("input--error");
      form.querySelector("#addr-name").focus();
      return;
    }
    if (!isValidCameroonPhone(phoneRaw)) {
      error.textContent = t("cart.validation.phone");
      error.hidden = false;
      form.querySelector("#addr-phone").classList.add("input--error");
      form.querySelector("#addr-phone").focus();
      return;
    }
    if (!quarter) {
      error.textContent = t("cart.validation.quarter");
      error.hidden = false;
      form.querySelector("#addr-quarter").classList.add("input--error");
      form.querySelector("#addr-quarter").focus();
      return;
    }

    setAddress({ name, phone: normalizePhone(phoneRaw), city, quarter, landmark });
    error.hidden = true;
    closeSheet($("#address-sheet"));
    toast(t("common.save"), "success");
    renderCart();
  });

  document.querySelectorAll("[data-sheet-close]").forEach((button) => {
    button.addEventListener("click", () => closeSheet(button.closest(".sheet")));
  });
}

/* ------------------------------- checkout ------------------------------ */

async function checkout() {
  if (submitting) return;
  const cart = getCart();
  if (!cart.items.length) {
    toast(t("cart.validation.empty"), "error");
    return;
  }

  const address = getAddress();
  const problem = addressProblem(address);
  if (problem) {
    toast(t("cart.validation.address"), "error");
    openAddressSheet();
    return;
  }

  const outOfStock = cart.items.find((item) => {
    const product = getProduct(item.productId);
    return !product || stockFor(product, item.condition) < item.qty;
  });
  if (outOfStock) {
    toast(t("product.onlyLeft", { n: stockFor(getProduct(outOfStock.productId), outOfStock.condition) }), "error");
    return;
  }

  const totals = totalsNow();
  const button = $("#checkout");
  submitting = true;
  button?.classList.add("is-loading");
  if (button) button.disabled = true;

  const waWindow = window.open("", "_blank");
  const buyer = await getCustomer();

  try {
    const order = await createOrder({
      customer: {
        uid: buyer?.uid || null,
        name: address.name.trim(),
        phone: normalizePhone(address.phone),
        city: address.city,
        quarter: address.quarter.trim(),
        landmark: address.landmark || "",
      },
      items: cart.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        brand: item.brand,
        condition: item.condition,
        storage: item.storage,
        ram: item.ram,
        color: item.color,
        qty: item.qty,
        unitPrice: item.unitPrice,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: 0,
      total: totals.total,
      promoCode: totals.promoCode,
      paymentMethod: "mtn_momo",
    });

    const message = buildOrderMessage({
      items: cart.items,
      totals,
      address,
      code: order.code,
    });

    completed = true;
    clearCart();
    renderSuccess(order, message);

    if (waWindow && !waWindow.closed) {
      waWindow.location.href = waLink(message);
    }
  } catch (error) {
    console.error(error);
    if (waWindow && !waWindow.closed) waWindow.close();
    toast(t("cart.order.savingError"), "error");
    submitting = false;
    if (button) {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }
}

function renderSuccess(order, message) {
  lastSuccess = { order, message };
  const address = order.customer || getAddress();
  $("#cart-view").hidden = true;
  $("#cart-head-count").textContent = "";
  $("#cart-layout").hidden = true;
  setStepper(3);

  const host = $("#cart-success");
  host.hidden = false;
  host.innerHTML = `<div class="cart-success">
    <div class="cart-success__icon"><span class="material-symbols-outlined">check_circle</span></div>
    <p class="t-eyebrow">${t("cart.order.created")}</p>
    <h1>${t("cart.order.confirmTitle")}</h1>
    <p>${t("cart.order.confirmText", { code: order.code })}</p>

    <div class="cart-success__ref">
      <span>${t("cart.order.reference")}</span>
      <strong>${esc(order.code)}</strong>
    </div>

    <div class="cart-success__rows">
      <div><span>${t("cart.calc.total")}</span><strong>${formatFCFA(order.total)}</strong></div>
      <div><span>${t("cart.delivery")}</span><strong>${esc([address.quarter, address.city].filter(Boolean).join(", "))}</strong></div>
      <div><span>${t("cart.address.phone")}</span><strong>${formatPhone(address.phone)}</strong></div>
    </div>

    <div class="cart-success__actions">
      <a class="btn btn--whatsapp btn--lg btn--block" href="${waLink(message)}" target="_blank" rel="noopener">
        <span class="material-symbols-outlined">forum</span>${t("cart.order.fallback")}
      </a>
      <a class="btn btn--ghost btn--block" href="account.html#orders">
        <span class="material-symbols-outlined">package_2</span>${t("cart.order.seeOrders")}
      </a>
    </div>
    <a class="cart-success__continue" href="catalog.html">${t("cart.order.continue")} →</a>
  </div>`;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* --------------------------------- main -------------------------------- */

async function main() {
  const cart = getCart();
  if (cart.items.length) {
    $("#cart-layout").hidden = false;
    $("#cart-list").innerHTML = Array.from({ length: Math.min(cart.items.length, 3) }, () => `<div class="skeleton skeleton--line" style="height:96px;margin:12px 18px"></div>`).join("");
  }

  await initStore();
  await mountChrome("cart");
  applyTranslations(document);

  refreshPrices();
  bindLineEvents();
  bindAddressForm();

  if (!getAddress().name) {
    // Prefill from the signed-in customer when available.
    try {
      const { getCustomer } = await import("../auth.js");
      const customer = getCustomer();
      if (customer?.name) {
        setAddress({
          name: customer.name,
          phone: customer.phone || "",
          city: customer.city || BUSINESS.cities[0],
          quarter: customer.quarter || "",
          landmark: customer.landmark || "",
        });
      }
    } catch { /* demo mode without a customer */ }
  }

  renderCart();
  setStepper(completed ? 3 : addressIsComplete() ? 2 : 1);

  onCartChange(() => {
    if (completed) return;
    renderCart();
  });

  $("#cart-clear")?.addEventListener("click", () => {
    if (!window.confirm(`${t("cart.clearCart")} ?`)) return;
    clearCart();
    toast(t("cart.cleared"));
  });

  onLangChange(() => {
    mountChrome("cart");
    applyTranslations(document);
    if (completed && lastSuccess) renderSuccess(lastSuccess.order, lastSuccess.message);
    else if (!completed) renderCart();
  });
}

main().catch((error) => {
  console.error(error);
  $("#cart-view").innerHTML = `<div class="cart-empty">
    <span class="material-symbols-outlined">cloud_off</span>
    <h2>${esc(error.message)}</h2>
    <a class="btn" href="cart.html">${t("common.retry")}</a>
  </div>`;
});
