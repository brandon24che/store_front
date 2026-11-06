/* ==========================================================================
   Shared chrome — storefront header, bottom nav, footer, admin shell.
   ========================================================================== */

import { BUSINESS, isFirebaseConfigured } from "../config.js";
import { t, getLang, setLang, applyTranslations } from "../i18n.js";
import { getCount } from "../cart.js";
import { wishlistCount } from "../wishlist.js";
import { getCustomer } from "../auth.js";
import { initials } from "../format.js";
import { roleLabel, can } from "../rbac.js";

const inAdmin = () => location.pathname.includes("/admin/");
const root = () => (inAdmin() ? "../" : "");

function isActive(active, key) {
  return active === key ? "is-active" : "";
}

function langToggle() {
  const lang = getLang();
  return `<div class="lang-toggle" role="group" aria-label="${t("lang.label")}">
    <button type="button" data-lang="fr" aria-pressed="${lang === "fr"}">FR</button>
    <button type="button" data-lang="en" aria-pressed="${lang === "en"}">EN</button>
  </div>`;
}

function header(active) {
  const base = root();
  return `<header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${base}index.html" aria-label="NovaTech">
        <span class="brand-mark"><span class="material-symbols-outlined">bolt</span></span>
        <span>NovaTech</span>
      </a>

      <nav class="primary-nav" aria-label="Principal">
        <a href="${base}index.html" class="${isActive(active, "home")}" ${active === "home" ? 'aria-current="page"' : ""}>${t("nav.home")}</a>
        <a href="${base}catalog.html" class="${isActive(active, "catalog")}" ${active === "catalog" ? 'aria-current="page"' : ""}>${t("nav.catalog")}</a>
        <a href="${base}catalog.html?sort=deals">${t("nav.deals")}</a>
        <a href="https://wa.me/${BUSINESS.whatsappNumber}" target="_blank" rel="noopener">${t("nav.support")}</a>
      </nav>

      <form class="header-search" role="search" data-header-search>
        <span class="material-symbols-outlined">search</span>
        <input type="search" name="q" placeholder="${t("nav.searchPlaceholder")}" aria-label="${t("common.search")}">
      </form>

      <div class="header-actions">
        ${langToggle()}
        <a class="icon-btn mobile-only" href="${base}account.html#orders" aria-label="${t("nav.account")}" title="${t("nav.account")}">
          <span class="material-symbols-outlined">notifications</span>
        </a>
        <a class="icon-btn" href="${base}wishlist.html" aria-label="${t("nav.wishlist")}" title="${t("nav.wishlist")}">
          <span class="material-symbols-outlined">favorite</span>
          <span class="header-count${wishlistCount() ? "" : " hide"}" data-wish-count>${wishlistCount()}</span>
        </a>
        <a class="icon-btn" href="${base}cart.html" aria-label="${t("nav.cart")}" title="${t("nav.cart")}">
          <span class="material-symbols-outlined">shopping_bag</span>
          <span class="header-count${getCount() ? "" : " hide"}" data-cart-count>${getCount()}</span>
        </a>
        <a class="icon-btn" href="${base}account.html" aria-label="${t("nav.account")}" title="${t("nav.account")}" data-account-link>
          <span class="avatar" data-account-avatar>?</span>
        </a>
      </div>
    </div>
  </header>`;
}

function bottomNav(active) {
  const base = root();
  const items = [
    { key: "home", href: "index.html", icon: "home", label: "nav.home" },
    { key: "catalog", href: "catalog.html", icon: "grid_view", label: "nav.catalog" },
    { key: "cart", href: "cart.html", icon: "shopping_bag", label: "nav.cart", badge: true },
    { key: "wishlist", href: "wishlist.html", icon: "favorite", label: "nav.wishlist" },
    { key: "account", href: "account.html", icon: "person", label: "nav.account" },
  ];
  return `<nav class="bottom-nav" aria-label="Navigation mobile">
    <div class="bottom-nav__inner">
      ${items.map((item) => `
        <a href="${base}${item.href}" class="${isActive(active, item.key)}" ${active === item.key ? 'aria-current="page"' : ""}>
          <span class="material-symbols-outlined">${item.icon}</span>
          <span>${t(item.label)}</span>
          ${item.badge ? `<span class="bottom-nav__badge${getCount() ? "" : " hide"}" data-cart-badge>${getCount()}</span>` : ""}
        </a>`).join("")}
    </div>
  </nav>`;
}

function footer() {
  const base = root();
  return `<footer class="site-footer">
    <div class="container">
      <div class="site-footer__grid">
        <div>
          <a class="brand" href="${base}index.html">
            <span class="brand-mark"><span class="material-symbols-outlined">bolt</span></span>
            <span>NovaTech</span>
          </a>
          <p class="site-footer__about">${t("footer.about")}</p>
          <p class="site-footer__about" style="margin-top:12px">
            <span class="dot dot--live" style="display:inline-block;margin-right:6px"></span>
            ${isFirebaseConfigured ? "Firebase live" : t("common.demoMode")}
          </p>
        </div>
        <div>
          <h3>${t("footer.shop")}</h3>
          <ul>
            <li><a href="${base}catalog.html?category=smartphones">${t("nav.catalog")} — Smartphones</a></li>
            <li><a href="${base}catalog.html?category=laptops">Laptops</a></li>
            <li><a href="${base}catalog.html?category=audio">${getLang() === "fr" ? "Audio & Écouteurs" : "Audio & Earbuds"}</a></li>
            <li><a href="${base}catalog.html?sort=deals">${t("nav.deals")}</a></li>
          </ul>
        </div>
        <div>
          <h3>${t("footer.company")}</h3>
          <ul>
            <li><a href="${base}index.html#partners">${t("home.partners.title")}</a></li>
            <li><a href="${base}index.html#trust">${t("home.trust.title")}</a></li>
            <li><a href="${base}admin/login.html">${t("admin.nav.staff")}</a></li>
            <li><a href="${base}account.html">${t("nav.account")}</a></li>
          </ul>
        </div>
        <div>
          <h3>${t("footer.support")}</h3>
          <ul>
            <li><a href="https://wa.me/${BUSINESS.whatsappNumber}" target="_blank" rel="noopener">${t("footer.contact")}</a></li>
            <li><a href="${base}catalog.html">${t("footer.delivery")}</a></li>
            <li><a href="${base}catalog.html">${t("footer.warranty")}</a></li>
            <li>${t("footer.hours")}</li>
          </ul>
        </div>
      </div>
      <div class="site-footer__bottom">
        <span>© ${new Date().getFullYear()} ${BUSINESS.name}. ${t("footer.rights")}</span>
        <div class="site-footer__pay">
          <span>MTN MoMo</span><span>Orange Money</span><span>${t("payment.cash_on_delivery")}</span><span>${t("payment.bank_wire")}</span>
        </div>
      </div>
    </div>
  </footer>`;
}

function syncBadges() {
  const count = getCount();
  document.querySelectorAll("[data-cart-count], [data-cart-badge]").forEach((node) => {
    node.textContent = count;
    node.classList.toggle("hide", count === 0);
  });
  const wished = wishlistCount();
  document.querySelectorAll("[data-wish-count]").forEach((node) => {
    node.textContent = wished;
    node.classList.toggle("hide", wished === 0);
  });
}

function updateAccountAvatar(customer) {
  document.querySelectorAll("[data-account-avatar]").forEach((node) => {
    if (customer?.name) {
      node.textContent = initials(customer.name);
      node.title = customer.name;
    } else {
      node.innerHTML = '<span class="material-symbols-outlined">person</span>';
      node.title = t("nav.account");
    }
  });
}

/** Mounts header, footer, bottom nav and keeps counters in sync. */
export async function mountChrome(active) {
  const headerSlot = document.getElementById("app-header");
  const navSlot = document.getElementById("app-nav");
  const footerSlot = document.getElementById("app-footer");
  if (headerSlot) headerSlot.innerHTML = header(active);
  if (navSlot) navSlot.innerHTML = bottomNav(active);
  if (footerSlot) footerSlot.innerHTML = footer();

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  });

  document.querySelectorAll("[data-header-search]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const q = new FormData(form).get("q")?.toString().trim();
      location.href = `${root()}catalog.html${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    });
  });

  syncBadges();
  window.addEventListener("cartchange", syncBadges);
  window.addEventListener("wishlistchange", syncBadges);

  const customer = await getCustomer();
  updateAccountAvatar(customer);
}

/* -------------------------------- admin -------------------------------- */

const ADMIN_LINKS = [
  { key: "orders", href: "orders.html", icon: "forum", label: "admin.nav.orders", permission: "orders.read" },
  { key: "products", href: "products.html", icon: "inventory_2", label: "admin.nav.products", permission: "products.read" },
  { key: "inventory", href: "inventory.html", icon: "warehouse", label: "admin.nav.inventory", permission: "inventory.read" },
  { key: "staff", href: "staff.html", icon: "manage_accounts", label: "admin.nav.staff", permission: "staff.write" },
];

export function mountAdminShell({ active, session, title = "" }) {
  const slot = document.getElementById("app-header");
  const navSlot = document.getElementById("app-nav");
  if (!slot) return;

  const allowed = ADMIN_LINKS.filter((link) => can(session.role, link.permission));

  slot.innerHTML = `<header class="admin-topbar">
    <div class="admin-topbar__inner">
      <a class="brand" href="../index.html">
        <span class="brand-mark"><span class="material-symbols-outlined">bolt</span></span>
        <span>NovaTech</span>
      </a>
      <span class="admin-topbar__tag">${t("admin.title")}</span>
      <div class="admin-topbar__actions">
        <a class="btn btn--ghost btn--sm" href="../index.html">
          <span class="material-symbols-outlined">storefront</span><span class="admin-hide-sm">${t("admin.backToStore")}</span>
        </a>
        <div class="admin-user">
          <span class="avatar">${initials(session.name)}</span>
          <span class="admin-user__meta">
            <strong>${session.name}</strong>
            <span>${roleLabel(session.role)}</span>
          </span>
        </div>
      </div>
    </div>
  </header>`;

  if (navSlot) {
    navSlot.innerHTML = `<nav class="admin-bottomnav" aria-label="Admin">
      ${allowed.map((link) => `<a href="${link.href}" class="${active === link.key ? "is-active" : ""}">
        <span class="material-symbols-outlined">${link.icon}</span><span>${t(link.label)}</span>
      </a>`).join("")}
      <a href="#" data-admin-logout><span class="material-symbols-outlined">logout</span><span>${t("admin.logout")}</span></a>
    </nav>`;
  }

  const sidebarSlot = document.getElementById("admin-sidebar");
  if (sidebarSlot) {
    sidebarSlot.innerHTML = `<aside class="admin-sidebar">
      <a class="brand" href="../index.html">
        <span class="brand-mark"><span class="material-symbols-outlined">bolt</span></span>
        <span>NovaTech</span>
      </a>
      <p class="admin-sidebar__eyebrow">${t("admin.title")}</p>
      <nav class="admin-sidebar__nav">
        ${allowed.map((link) => `<a href="${link.href}" class="${active === link.key ? "is-active" : ""}">
          <span class="material-symbols-outlined">${link.icon}</span><span>${t(link.label)}</span>
        </a>`).join("")}
      </nav>
      <div class="admin-sidebar__foot">
        ${isFirebaseConfigured ? "" : `<p class="admin-demo"><span class="dot dot--live"></span>${t("common.demoMode")}</p>`}
        <a class="admin-sidebar__link" href="../index.html"><span class="material-symbols-outlined">storefront</span>${t("admin.backToStore")}</a>
        <div class="admin-sidebar__user">
          <span class="avatar avatar--lg">${initials(session.name)}</span>
          <div><strong>${session.name}</strong><span>${roleLabel(session.role)}</span></div>
        </div>
        <button class="btn btn--ghost btn--sm btn--block" data-admin-logout>
          <span class="material-symbols-outlined">logout</span>${t("admin.logout")}
        </button>
      </div>
    </aside>`;
  }

  document.querySelectorAll("[data-admin-logout]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const { signOutAll } = await import("../auth.js");
      await signOutAll();
      location.href = "login.html";
    });
  });

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  });
}

export { syncBadges };
