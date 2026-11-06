/* ==========================================================================
   Homepage
   ========================================================================== */

import { initStore, getCategories, getHero, getFeatured, getFlashDeals, getBrands, priceOf } from "../store.js";
import { mountChrome } from "../ui/nav.js";
import { productCard, bindProductGrid, skeletonCards } from "../ui/product-card.js";
import { productImage } from "../ui/art.js";
import { initCountdowns } from "../ui/countdown.js";
import { t, localized, applyTranslations, onLangChange } from "../i18n.js";
import { formatNumber, esc } from "../format.js";
import { toast } from "../ui/toast.js";

const $ = (selector) => document.querySelector(selector);

function renderHero() {
  const product = getHero();
  const host = $("#hero");
  if (!product) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `<div class="hero">
    <div class="hero__copy">
      <div class="hero__badges">
        <span class="badge"><span class="dot"></span>${t("home.hero.badge")}</span>
        <span class="hero__eyebrow">${t("home.hero.titanium")}</span>
      </div>
      <h1 class="hero__title">${esc(product.name)}</h1>
      <p class="hero__text">${esc(localized(product.description))}</p>
    </div>
    <div class="hero__stage">
      ${productImage(product, { alt: product.name, sizes: "(min-width:1024px) 640px, 90vw", eager: true })}
    </div>
    <div class="hero__foot">
      <div>
        <span class="hero__price-label">${t("home.hero.from")}</span>
        <div class="hero__price">${formatNumber(priceOf(product))} <small>FCFA</small></div>
      </div>
      <a class="btn btn--lg" href="product.html?id=${encodeURIComponent(product.id)}">
        ${t("home.hero.preorder")}
        <span class="material-symbols-outlined">arrow_forward</span>
      </a>
    </div>
  </div>`;
}

function renderCategories() {
  const host = $("#categories");
  const categories = getCategories();
  host.innerHTML = `<div class="chip-row">
    ${categories.map((category) => `<a class="chip" href="catalog.html?category=${encodeURIComponent(category.id)}">
      <span class="material-symbols-outlined">${category.icon}</span>
      <span>${esc(localized(category.name))}</span>
    </a>`).join("")}
  </div>`;
}

function renderFlash() {
  const host = $("#flash");
  const deals = getFlashDeals();
  if (!deals.length) {
    host.innerHTML = "";
    return;
  }
  const endsAt = Math.min(...deals.map((product) => product.flashEndsAt || Date.now() + 86400000));
  const grid = deals.slice(0, 4).map((product) => productCard(product)).join("");

  host.innerHTML = `<div class="flash" data-flash>
      <span class="flash__icon"><span class="material-symbols-outlined">bolt</span></span>
      <div class="flash__copy">
        <div class="flash__title">
          ${t("home.flash.title")}
          <span class="badge badge--primary">-20% – 35%</span>
        </div>
        <p class="flash__sub">${t("home.flash.sub")}</p>
      </div>
      <div class="flash__timer">
        <span class="material-symbols-outlined">schedule</span>
        <span>${t("home.flash.ends")}</span>
        <time data-countdown data-ends="${endsAt}">--:--:--</time>
      </div>
    </div>
    <div class="grid grid--products" style="margin-top:16px">${grid}</div>`;

  initCountdowns(host);
}

function renderCurated() {
  $("#product-grid").innerHTML = getFeatured().map((product) => productCard(product)).join("");
}

function renderPartners() {
  const brands = getBrands().slice(0, 6);
  $("#partners").innerHTML = `<div class="partners">
    <div class="partners__head">
      <span class="t-micro muted">${t("home.partners.title")}</span>
      <span class="t-micro" style="color:var(--primary-ink)">${t("home.partners.genuine")}</span>
    </div>
    <div class="partners__grid">
      ${brands.map((brand) => `<a class="partner" href="catalog.html?brand=${encodeURIComponent(brand.name)}">
        <span class="partner__mark">${esc(brand.monogram || brand.name)}</span>
        <span class="partner__name">${esc(brand.name)}</span>
      </a>`).join("")}
    </div>
  </div>`;
}

function renderTrust() {
  $("#trust").innerHTML = `<div class="trust" id="trust">
    <div class="trust__item">
      <span class="trust__icon"><span class="material-symbols-outlined">smartphone</span></span>
      <div>
        <div class="trust__title">${t("home.trust.momo.title")}</div>
        <div class="trust__text">${t("home.trust.momo.text")}</div>
      </div>
    </div>
    <div class="trust__item">
      <span class="trust__icon"><span class="material-symbols-outlined">local_shipping</span></span>
      <div>
        <div class="trust__title">${t("home.trust.delivery.title")}</div>
        <div class="trust__text">${t("home.trust.delivery.text")}</div>
      </div>
    </div>
    <div class="trust__item">
      <span class="trust__icon"><span class="material-symbols-outlined">verified_user</span></span>
      <div>
        <div class="trust__title">${t("home.trust.warranty.title")}</div>
        <div class="trust__text">${t("home.trust.warranty.text")}</div>
      </div>
    </div>
  </div>`;
}

function renderAll() {
  renderHero();
  renderCategories();
  renderFlash();
  renderCurated();
  renderPartners();
  renderTrust();
  applyTranslations(document);
}

async function main() {
  $("#product-grid").innerHTML = skeletonCards(8);
  bindProductGrid();
  await initStore();
  renderAll();
  await mountChrome("home");

  document.querySelector("[data-home-search]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q")?.toString().trim();
    location.href = `catalog.html${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  });

  document.querySelector("[data-voice]")?.addEventListener("click", () => {
    toast(t("common.voiceSoon"));
  });

  onLangChange(() => {
    renderAll();
    mountChrome("home");
  });
}

main().catch((error) => {
  console.error(error);
  $("#product-grid").innerHTML = `<div class="empty"><span class="empty__icon"><span class="material-symbols-outlined">cloud_off</span></span>
    <p class="empty__title">Impossible de charger le catalogue</p>
    <p class="empty__text">${esc(error.message)}</p></div>`;
});
