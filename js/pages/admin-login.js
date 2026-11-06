/* ==========================================================================
   Admin sign-in — staff only, zero self-registration.
   ========================================================================== */

import { signInStaff, getStaffSession } from "../auth.js";
import { t, applyTranslations, setLang, getLang, onLangChange } from "../i18n.js";

const $ = (selector) => document.querySelector(selector);

function safeNext() {
  const next = new URLSearchParams(location.search).get("next");
  return next && /^[a-z-]+\.html(\?.*)?$/.test(next) ? next : "orders.html";
}

function showError(message) {
  const box = $("#login-error");
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}

function errorMessage(error) {
  const code = String(error?.code || error?.message || "");
  if (code === "suspended") return t("admin.login.suspended");
  if (code === "no-role") return t("admin.login.noRole");
  if (code.includes("too-many-requests")) return t("admin.login.throttled");
  if (code.includes("network")) return t("account.networkError");
  return t("admin.login.error");
}

async function submit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email") || "").trim();
  const password = String(new FormData(form).get("password") || "");

  if (!email || !password) {
    showError(t("admin.login.error"));
    return;
  }

  showError("");
  const button = $("#login-submit");
  button?.classList.add("is-loading");
  if (button) button.disabled = true;

  try {
    await signInStaff(email, password);
    location.replace(safeNext());
  } catch (error) {
    console.error(error);
    showError(errorMessage(error));
  } finally {
    button?.classList.remove("is-loading");
    if (button) button.disabled = false;
  }
}

function syncLangButtons() {
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === getLang()));
  });
}

async function main() {
  if (await getStaffSession()) {
    location.replace(safeNext());
    return;
  }

  applyTranslations(document);
  syncLangButtons();
  $("#staff-login")?.addEventListener("submit", submit);

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  });

  onLangChange(() => {
    applyTranslations(document);
    syncLangButtons();
    if (!$("#login-error")?.hidden) showError(t("admin.login.error"));
  });
}

main().catch(console.error);
