/* ==========================================================================
   Account — customer sign-in, profile and live WhatsApp order history.
   ========================================================================== */

import { initStore, getProduct, getOrdersForCustomer, totalStock } from "../store.js";
import { mountChrome } from "../ui/nav.js";
import { toast } from "../ui/toast.js";
import {
  getCustomer, signInCustomer, signUpCustomer, signInWithGoogle, signOutAll,
} from "../auth.js";
import { addToCart } from "../cart.js";
import { waLink } from "../whatsapp.js";
import { t, applyTranslations, onLangChange } from "../i18n.js";
import {
  formatFCFA, formatDate, timeAgo, initials, esc,
  formatPhone, normalizePhone, isValidCameroonPhone,
} from "../format.js";

const $ = (selector) => document.querySelector(selector);
const host = () => $("#account-root");

const state = {
  customer: null,
  orders: [],
  loading: false,
  mode: "signin",
  error: "",
};

const STATUS_TONE = {
  new_inquiry: "",
  awaiting_payment: "status-pill--warn",
  confirmed: "status-pill--ice",
  ready_dispatch: "status-pill--teal",
  out_for_delivery: "status-pill--ice",
  completed: "status-pill--success",
  cancelled: "status-pill--danger",
};

const GOOGLE_MARK = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.2 4.5-4.1 6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z"/>
</svg>`;

/* -------------------------------- helpers ------------------------------- */

function stamp(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return Number(value) || 0;
}

function memberSince(customer) {
  const match = /^local-(\d+)$/.exec(customer?.uid || "");
  return match ? Number(match[1]) : 0;
}

function statusPill(status) {
  const tone = STATUS_TONE[status] ?? "status-pill--muted";
  return `<span class="status-pill ${tone}"><span class="dot"></span>${t(`status.${status}`)}</span>`;
}

function ordersLabel(count = state.orders.length) {
  return count === 1 ? t("account.ordersCountOne") : t("account.ordersCount", { n: count });
}

function authMessage(error) {
  const code = String(error?.code || error?.message || "");
  if (code.includes("email-already-in-use")) return t("account.emailExists");
  if (code.includes("weak-password")) return t("account.weakPassword");
  if (code.includes("invalid-email")) return t("account.emailInvalid");
  if (code.includes("network")) return t("account.networkError");
  return t("account.error");
}

/* --------------------------------- auth --------------------------------- */

function renderAuth() {
  const signup = state.mode === "signup";
  return `<div class="auth-wrap">
    <div class="auth-card">
      <p class="t-eyebrow">NovaTech Cameroun</p>
      <h1>${t("account.title")}</h1>
      <p>${t("account.sub")}</p>

      <div class="auth-tabs" role="group" aria-label="${t("account.title")}">
        <button type="button" data-auth-tab="signin" class="${signup ? "" : "is-active"}" aria-pressed="${!signup}">${t("account.signIn")}</button>
        <button type="button" data-auth-tab="signup" class="${signup ? "is-active" : ""}" aria-pressed="${signup}">${t("account.signUp")}</button>
      </div>

      <form class="auth-form" id="auth-form" novalidate>
        ${signup ? `
          <div class="field">
            <label class="field__label" for="auth-name">${t("account.name")}</label>
            <input class="input" id="auth-name" name="name" type="text" autocomplete="name" required>
          </div>
          <div class="field">
            <label class="field__label" for="auth-phone">${t("account.phone")} <em>${t("common.optional")}</em></label>
            <input class="input" id="auth-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="6XX XX XX XX">
          </div>` : ""}
        <div class="field">
          <label class="field__label" for="auth-email">${t("account.email")}</label>
          <input class="input" id="auth-email" name="email" type="email" autocomplete="email" inputmode="email" required>
        </div>
        <div class="field">
          <label class="field__label" for="auth-password">${t("account.password")}</label>
          <input class="input" id="auth-password" name="password" type="password" minlength="6" autocomplete="${signup ? "new-password" : "current-password"}" required>
        </div>

        <div class="auth-error" id="auth-error" role="alert" ${state.error ? "" : "hidden"}>${esc(state.error)}</div>

        <button class="btn btn--primary btn--block" type="submit" id="auth-submit">
          <span>${signup ? t("account.create") : t("account.signIn")}</span>
          <span class="material-symbols-outlined">arrow_forward</span>
        </button>
      </form>

      <div class="auth-divider">${t("account.or")}</div>
      <button class="auth-alt" type="button" id="google-auth">
        ${GOOGLE_MARK}<span>${t("account.signInWithGoogle")}</span>
      </button>

      <p class="auth-note">${t("account.guestNote")}</p>
      <a class="auth-staff-link" href="admin/login.html">
        <span class="material-symbols-outlined">shield_person</span>${t("account.adminLink")}
      </a>
    </div>
  </div>`;
}

/* ------------------------------- account -------------------------------- */

function profileCard(customer) {
  const since = memberSince(customer);
  return `<aside>
    <div class="profile-card">
      <div class="profile-card__top">
        <span class="profile-card__avatar">${esc(initials(customer.name))}</span>
        <div>
          <p class="profile-card__name">${esc(customer.name || "Client NovaTech")}</p>
          <p class="profile-card__email">${esc(customer.email || "")}</p>
        </div>
      </div>

      <dl class="profile-card__rows">
        <div class="profile-row">
          <dt><span class="material-symbols-outlined">call</span>${t("account.phone")}</dt>
          <dd>${customer.phone ? esc(formatPhone(customer.phone)) : "—"}</dd>
        </div>
        <div class="profile-row">
          <dt><span class="material-symbols-outlined">receipt_long</span>${t("account.orders")}</dt>
          <dd>${ordersLabel()}</dd>
        </div>
        ${since ? `<div class="profile-row">
          <dt><span class="material-symbols-outlined">calendar_month</span>${t("account.memberSince")}</dt>
          <dd>${formatDate(since, { month: "long" })}</dd>
        </div>` : ""}
      </dl>

      <p class="profile-note">${t("account.whatsappNote")}</p>

      <div class="profile-card__actions">
        <button class="btn btn--ghost btn--sm btn--block" type="button" id="sign-out">
          <span class="material-symbols-outlined">logout</span>${t("account.signOut")}
        </button>
        <a class="profile-card__staff" href="admin/login.html">
          <span class="material-symbols-outlined">shield_person</span>${t("account.adminLink")}
        </a>
      </div>
    </div>
  </aside>`;
}

function orderItem(item) {
  const meta = [
    t(`condition.${item.condition || "new"}`),
    item.storage,
    item.ram,
    item.color,
  ].filter(Boolean).join(" · ");
  const line = (item.unitPrice || 0) * (item.qty || 1);
  return `<div class="order-card__item">
    <span>${item.qty > 1 ? `${item.qty} × ` : ""}${esc(item.name)}${meta ? ` <small>${esc(meta)}</small>` : ""}</span>
    <span>${formatFCFA(line)}</span>
  </div>`;
}

function orderCard(order) {
  const status = order.status || "new_inquiry";
  const items = order.items || [];
  return `<article class="order-card">
    <div class="order-card__top">
      <span class="order-card__code">${esc(order.code || "—")} ${statusPill(status)}</span>
      <span class="order-card__date">${t("account.orderDate")} ${formatDate(order.createdAt)}</span>
    </div>

    <div class="order-card__items">${items.map(orderItem).join("")}</div>

    <div class="order-card__timeline">
      <span class="material-symbols-outlined">schedule</span>
      <span>${t("account.updated")}</span>
      <time>${timeAgo(order.updatedAt || order.createdAt)}</time>
    </div>

    <div class="order-card__foot">
      <div class="order-card__total">
        <span>${t("common.total")}</span>
        <strong>${formatFCFA(order.total)}</strong>
      </div>
      <div class="order-card__actions">
        <a class="btn btn--ghost btn--sm" href="${waLink(t("account.order.askStatus", { code: order.code || "" }))}" target="_blank" rel="noopener">
          <span class="material-symbols-outlined">forum</span>${t("account.askStatus")}
        </a>
        <button class="btn btn--primary btn--sm" type="button" data-reorder="${esc(order.id)}">
          <span class="material-symbols-outlined">refresh</span>${t("account.reorder")}
        </button>
      </div>
    </div>
  </article>`;
}

function ordersBody() {
  if (state.loading) {
    return `<div class="order-list" aria-hidden="true">
      ${Array.from({ length: 2 }, () => `<div class="order-card">
        <div class="skeleton skeleton--line short"></div>
        <div class="skeleton skeleton--line medium" style="margin-top:14px"></div>
        <div class="skeleton skeleton--line" style="height:34px;margin-top:14px"></div>
      </div>`).join("")}
    </div>`;
  }

  const orders = [...state.orders].sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt));
  if (!orders.length) {
    return `<div class="orders-empty">
      <span class="material-symbols-outlined">inventory_2</span>
      <p>${t("account.noOrders")}</p>
      <a class="btn btn--primary btn--sm" href="catalog.html">${t("nav.catalog")}</a>
    </div>`;
  }

  return `<div class="order-list">${orders.map(orderCard).join("")}</div>`;
}

function renderAccount() {
  const customer = state.customer;
  const first = String(customer.name || "").split(/\s+/).filter(Boolean)[0] || customer.email || "";
  return `<header class="account-head">
    <p class="t-eyebrow">${t("account.profileTitle")}</p>
    <h1>${t("account.welcome")}, ${esc(first)}</h1>
  </header>

  <div class="account-layout">
    ${profileCard(customer)}
    <section class="orders-panel" id="orders">
      <div class="orders-panel__head">
        <h2><span class="material-symbols-outlined">local_shipping</span>${t("account.orders")}</h2>
        <span>${ordersLabel()}</span>
      </div>
      ${ordersBody()}
    </section>
  </div>`;
}

/* ------------------------------- rendering ------------------------------ */

function render() {
  const root = host();
  if (!root) return;
  root.innerHTML = state.customer ? renderAccount() : renderAuth();
  applyTranslations(root);
  bind();
  if (state.customer && location.hash === "#orders") {
    requestAnimationFrame(() => $("#orders")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

function showAuthError(message) {
  state.error = message || "";
  const box = $("#auth-error");
  if (!box) return;
  box.textContent = state.error;
  box.hidden = !state.error;
  if (state.error) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* -------------------------------- actions ------------------------------- */

async function loadOrders() {
  if (!state.customer) return;
  try {
    state.orders = await getOrdersForCustomer(state.customer.uid, state.customer.phone);
  } catch (error) {
    console.error("orders", error);
    state.orders = [];
  }
}

async function signedIn(customer) {
  state.customer = customer;
  state.error = "";
  state.loading = true;
  render();
  await mountChrome("account");
  await loadOrders();
  state.loading = false;
  render();
  toast(t("account.signedIn"), "success");
}

async function submitAuth(form) {
  const data = new FormData(form);
  const signup = state.mode === "signup";
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  const name = String(data.get("name") || "").trim();
  const rawPhone = String(data.get("phone") || "").trim();

  if (!email) return showAuthError(t("account.emailRequired"));
  if (password.length < 6) return showAuthError(t("account.weakPassword"));
  if (signup && name.length < 2) return showAuthError(t("account.nameRequired"));
  if (signup && rawPhone && !isValidCameroonPhone(rawPhone)) return showAuthError(t("account.phoneInvalid"));

  showAuthError("");
  const submit = $("#auth-submit");
  submit?.classList.add("is-loading");
  if (submit) submit.disabled = true;

  try {
    const customer = signup
      ? await signUpCustomer({ name, email, password, phone: rawPhone ? normalizePhone(rawPhone) : "" })
      : await signInCustomer(email, password);
    await signedIn(customer);
  } catch (error) {
    console.error(error);
    showAuthError(authMessage(error));
  } finally {
    submit?.classList.remove("is-loading");
    if (submit) submit.disabled = false;
  }
}

async function handleGoogle() {
  showAuthError("");
  const button = $("#google-auth");
  button?.classList.add("is-loading");
  if (button) button.disabled = true;

  try {
    const customer = await signInWithGoogle();
    await signedIn(customer);
  } catch (error) {
    console.error(error);
    showAuthError(authMessage(error));
  } finally {
    button?.classList.remove("is-loading");
    if (button) button.disabled = false;
  }
}

async function handleSignOut() {
  await signOutAll();
  state.customer = null;
  state.orders = [];
  state.mode = "signin";
  state.error = "";
  await mountChrome("account");
  render();
  toast(t("account.signedOut"));
}

function reorder(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;

  let added = 0;
  (order.items || []).forEach((item) => {
    const product = getProduct(item.productId);
    if (!product || totalStock(product) <= 0) return;
    const options = { condition: item.condition || "new", qty: item.qty || 1 };
    if (item.storage) options.storage = item.storage;
    if (item.ram) options.ram = item.ram;
    if (item.color) options.color = item.color;
    addToCart(product, options);
    added += 1;
  });

  if (!added) {
    toast(t("product.unavailable"), "error");
    return;
  }

  toast(t("account.reorderAdded"), "success");
  setTimeout(() => { location.href = "cart.html"; }, 450);
}

/* --------------------------------- binding ------------------------------ */

function bind() {
  const root = host();

  root.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.mode === button.dataset.authTab) return;
      state.mode = button.dataset.authTab;
      state.error = "";
      render();
      root.querySelector("#auth-form input")?.focus();
    });
  });

  root.querySelector("#auth-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth(event.currentTarget);
  });

  root.querySelector("#google-auth")?.addEventListener("click", handleGoogle);
  root.querySelector("#sign-out")?.addEventListener("click", handleSignOut);

  root.querySelectorAll("[data-reorder]").forEach((button) => {
    button.addEventListener("click", () => reorder(button.dataset.reorder));
  });
}

/* ---------------------------------- main -------------------------------- */

async function main() {
  await initStore();
  await mountChrome("account");

  state.customer = await getCustomer();
  if (state.customer) {
    state.loading = true;
    render();
    await loadOrders();
    state.loading = false;
  }
  render();

  onLangChange(async () => {
    await mountChrome("account");
    render();
  });

  window.addEventListener("hashchange", () => {
    if (location.hash === "#orders") $("#orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

main().catch((error) => {
  console.error(error);
  const root = host();
  if (!root) return;
  root.innerHTML = `<div class="empty">
    <span class="empty__icon"><span class="material-symbols-outlined">cloud_off</span></span>
    <p class="empty__title">${t("common.retry")}</p>
    <a class="btn btn--primary" href="account.html">${t("common.retry")}</a>
  </div>`;
});
