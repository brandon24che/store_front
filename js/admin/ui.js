/* ==========================================================================
   Admin UI helpers — shared status pills, KPI cards, empty and denied states.
   ========================================================================== */

import { t } from "../i18n.js";
import { esc, initials } from "../format.js";

export const STATUS_TONE = {
  new_inquiry: "",
  awaiting_payment: "status-pill--warn",
  confirmed: "status-pill--ice",
  ready_dispatch: "status-pill--teal",
  out_for_delivery: "status-pill--ice",
  completed: "status-pill--success",
  cancelled: "status-pill--danger",
};

export const BOARD_STATUSES = ["new_inquiry", "awaiting_payment", "ready_dispatch", "out_for_delivery"];

export const ORDER_STATUSES = Object.keys(STATUS_TONE);

export function statusPill(status) {
  const tone = STATUS_TONE[status] ?? "status-pill--muted";
  return `<span class="status-pill ${tone}"><span class="dot"></span>${esc(t(`status.${status}`))}</span>`;
}

export function paymentText(method) {
  return t(`payment.${method || "cash_on_delivery"}`);
}

export function stamp(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return Number(value) || 0;
}

export function avatar(name, className = "avatar") {
  return `<span class="${className}">${esc(initials(name))}</span>`;
}

export function pageHead({ eyebrow, title, sub, actions = "" }) {
  return `<div class="admin-head">
    <div>
      <p class="admin-head__eyebrow"><span class="material-symbols-outlined">bolt</span>${esc(eyebrow)}</p>
      <h1>${esc(title)}</h1>
      ${sub ? `<p class="admin-head__sub">${esc(sub)}</p>` : ""}
    </div>
    ${actions ? `<div class="admin-head__actions">${actions}</div>` : ""}
  </div>`;
}

export function kpi({ icon, label, value, meta = "", tone = "" }) {
  return `<article class="kpi ${tone ? `kpi--${tone}` : ""}">
    <div class="kpi__top">
      <span class="kpi__label">${esc(label)}</span>
      <span class="kpi__icon"><span class="material-symbols-outlined">${icon}</span></span>
    </div>
    <strong class="kpi__value">${value}</strong>
    ${meta ? `<span class="kpi__meta">${esc(meta)}</span>` : ""}
  </article>`;
}

export function emptyBlock({ icon = "inbox", title, text = "" }) {
  return `<div class="admin-empty">
    <span class="material-symbols-outlined">${icon}</span>
    <b>${esc(title)}</b>
    ${text ? `<p>${esc(text)}</p>` : ""}
  </div>`;
}

export function deniedBlock(message = t("admin.deniedHint")) {
  return `<div class="admin-denied">
    <span class="admin-denied__icon"><span class="material-symbols-outlined">lock</span></span>
    <b>${esc(t("admin.denied"))}</b>
    <p>${esc(message)}</p>
    <a class="btn btn--ghost btn--sm" href="orders.html">
      <span class="material-symbols-outlined">arrow_back</span>${esc(t("admin.nav.orders"))}
    </a>
  </div>`;
}

export function itemsSummary(order, max = 2) {
  const items = order.items || [];
  const shown = items.slice(0, max).map((item) => `${item.qty > 1 ? `${item.qty} × ` : ""}${item.name}`);
  if (items.length > max) shown.push(`+${items.length - max}`);
  return shown;
}

export function orderCounts(orders) {
  return {
    newChats: orders.filter((order) => order.status === "new_inquiry").length,
    awaiting: orders.filter((order) => order.status === "awaiting_payment").length,
    ready: orders.filter((order) => order.status === "ready_dispatch").length,
    transit: orders.filter((order) => order.status === "out_for_delivery").length,
  };
}

export function todayGmv(orders) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return orders
    .filter((order) => stamp(order.createdAt) >= start.getTime() && order.status !== "cancelled")
    .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
}

export function escapeText(value) {
  return esc(value);
}
