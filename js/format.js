/* ==========================================================================
   Formatting helpers — the only place prices, dates and phones are formatted.
   ========================================================================== */

import { APP } from "./config.js";
import { getLang } from "./i18n.js";

/** 780000 → "780 000 FCFA" */
export function formatFCFA(value) {
  const n = Math.round(Number(value) || 0);
  return `${formatNumber(n)} ${APP.currencyLabel}`;
}

/** 780000 → "780 000" */
export function formatNumber(value) {
  return (Math.round(Number(value) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Drops the suffix so prices can be laid out with a smaller unit. */
export function splitFCFA(value) {
  return { amount: formatNumber(value), unit: APP.currencyLabel };
}

export function formatDate(ts, opts = {}) {
  if (!ts) return "—";
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(APP.locale[getLang()] || "fr-CM", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(date);
}

export function formatTime(ts) {
  if (!ts) return "—";
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  return new Intl.DateTimeFormat(APP.locale[getLang()] || "fr-CM", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** "il y a 12 min" / "12 min ago" */
export function timeAgo(ts) {
  if (!ts) return "—";
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  const fr = getLang() === "fr";
  if (mins < 1) return fr ? "à l'instant" : "just now";
  if (mins < 60) return fr ? `il y a ${mins} min` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return fr ? `il y a ${hours} h` : `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return fr ? `il y a ${days} j` : `${days} d ago`;
  return formatDate(date);
}

/** Savings amount + percentage for a compare-at price. */
export function discountOf(price, compareAt) {
  if (!compareAt || compareAt <= price) return null;
  const amount = compareAt - price;
  return { amount, percent: Math.round((amount / compareAt) * 100) };
}

export function plural(count, one, many) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

/** Normalises a Cameroonian mobile number to 237XXXXXXXXX. */
export function normalizePhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length === 12) return digits;
  if (digits.length === 9 && digits.startsWith("6")) return `237${digits}`;
  return null;
}

export function isValidCameroonPhone(input) {
  return Boolean(normalizePhone(input));
}

/** +237 6XX XX XX XX */
export function formatPhone(input) {
  const normalized = normalizePhone(input);
  if (!normalized) return String(input || "");
  const local = normalized.slice(3);
  return `+237 ${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

/** Removes the +237 prefix for wa.me links. */
export function waPhone(input) {
  return normalizePhone(input) || String(input || "").replace(/\D/g, "");
}

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
