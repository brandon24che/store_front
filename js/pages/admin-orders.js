/* ==========================================================================
   Admin orders — realtime WhatsApp pipeline, drawer timeline and quick replies.
   ========================================================================== */

import {
  initStore, watchOrders, createOrder, updateOrder, addOrderNote,
  getProducts, getProduct, priceOf,
} from "../store.js";
import { requireStaff, can } from "../rbac.js";
import { mountAdminShell } from "../ui/nav.js";
import { openSheet, closeSheet, bindSheetTriggers } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { t, getLang, applyTranslations, onLangChange } from "../i18n.js";
import {
  formatFCFA, formatDate, timeAgo, esc, normalizePhone, isValidCameroonPhone, formatPhone,
} from "../format.js";
import {
  customerChatUrl, buildTrackingMessage, buildStaffGreeting, fillTemplate,
} from "../whatsapp.js";
import { QUICK_REPLIES } from "../data/demo.js";
import {
  pageHead, kpi, statusPill, emptyBlock, deniedBlock, itemsSummary,
  orderCounts, todayGmv, stamp, avatar, paymentText, BOARD_STATUSES, ORDER_STATUSES,
} from "../admin/ui.js";

const $ = (selector) => document.querySelector(selector);
const root = () => $("#orders-root");

const state = {
  session: null,
  orders: [],
  query: "",
  tab: "all",
  view: window.matchMedia("(min-width: 1024px)").matches ? "board" : "cards",
};

/* -------------------------------- helpers ------------------------------- */

function filteredOrders() {
  const needle = state.query.trim().toLowerCase();
  return state.orders
    .filter((order) => state.tab === "all" || order.status === state.tab)
    .filter((order) => {
      if (!needle) return true;
      return [order.code, order.customer?.name, order.customer?.phone, order.customer?.city]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    })
    .sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt));
}

function paidBadge(order) {
  return order.paymentStatus === "paid"
    ? `<span class="badge badge--success">${t("admin.orders.paidShort")}</span>`
    : `<span class="badge badge--warning">${t("admin.orders.unpaid")}</span>`;
}

function newThisHour() {
  const since = Date.now() - 3600 * 1000;
  return state.orders.filter((order) => stamp(order.createdAt) >= since).length;
}

/* -------------------------------- markup -------------------------------- */

function orderTile(order) {
  const items = itemsSummary(order, 2);
  return `<button type="button" class="order-tile" data-order="${esc(order.id)}" aria-label="${esc(order.code)}">
    <div class="order-tile__top">
      <span class="order-tile__code">${esc(order.code)}</span>
      ${statusPill(order.status)}
    </div>
    <div class="order-tile__customer">
      ${avatar(order.customer?.name)}
      <div>
        <strong>${esc(order.customer?.name || "—")}</strong>
        <span>${esc(formatPhone(order.customer?.phone || ""))} · ${esc(order.customer?.city || "")}</span>
      </div>
    </div>
    <div class="order-tile__items">
      ${items.map((line) => `<span>${esc(line)}</span>`).join("")}
    </div>
    <div class="order-tile__foot">
      <div>
        <span class="order-tile__total">${formatFCFA(order.total)}</span>
        <span class="order-tile__method">${esc(paymentText(order.paymentMethod))}</span>
      </div>
      <div class="order-tile__badges">
        ${paidBadge(order)}
        <span class="order-tile__time">${timeAgo(order.createdAt)}</span>
      </div>
    </div>
  </button>`;
}

function boardColumn(status, orders) {
  const items = orders.filter((order) => order.status === status);
  return `<section class="admin-col" aria-label="${esc(t(`status.${status}`))}">
    <div class="admin-col__head">
      <span>${esc(t(`admin.orders.tab.${status}`))}</span>
      <span>${items.length}</span>
    </div>
    ${items.length ? items.map(orderTile).join("") : `<p class="admin-col__empty">—</p>`}
  </section>`;
}

function tableRow(order) {
  return `<tr>
    <td>
      <strong>${esc(order.code)}</strong>
      <span class="cell-sub">${timeAgo(order.createdAt)}</span>
    </td>
    <td>
      <strong>${esc(order.customer?.name || "—")}</strong>
      <span class="cell-sub">${esc(formatPhone(order.customer?.phone || ""))}</span>
    </td>
    <td class="num">${formatFCFA(order.total)}</td>
    <td>${esc(paymentText(order.paymentMethod))}</td>
    <td>${paidBadge(order)}</td>
    <td>${statusPill(order.status)}</td>
    <td>${formatDate(order.createdAt)}</td>
    <td>
      <div class="admin-row-actions">
        <button class="icon-btn" type="button" data-order="${esc(order.id)}" aria-label="${t("admin.orders.detail")}" title="${t("admin.orders.detail")}">
          <span class="material-symbols-outlined">open_in_new</span>
        </button>
      </div>
    </td>
  </tr>`;
}

/* -------------------------------- drawer -------------------------------- */

function drawerActions(order) {
  const role = state.session.role;
  const buttons = [];
  const canStock = can(role, "orders.confirmStock") || can(role, "orders.update");
  const active = ["new_inquiry", "awaiting_payment"].includes(order.status);

  if (canStock && active) {
    buttons.push(`<button class="btn btn--soft btn--sm" type="button" data-action="confirm-stock">
      <span class="material-symbols-outlined">inventory</span>${t("admin.orders.confirmStock")}
    </button>`);
  }
  if (can(role, "orders.recordPayment") && order.paymentStatus !== "paid") {
    buttons.push(`<button class="btn btn--soft btn--sm" type="button" data-action="record-payment">
      <span class="material-symbols-outlined">payments</span>${t("admin.orders.recordWire")}
    </button>`);
  }
  if (can(role, "orders.dispatch") && order.status === "confirmed") {
    buttons.push(`<button class="btn btn--soft btn--sm" type="button" data-action="dispatch">
      <span class="material-symbols-outlined">local_shipping</span>${t("status.ready_dispatch")}
    </button>`);
  }
  if (can(role, "orders.dispatch") && order.status === "ready_dispatch") {
    buttons.push(`<button class="btn btn--soft btn--sm" type="button" data-action="track">
      <span class="material-symbols-outlined">send</span>${t("admin.orders.sendTracking")}
    </button>`);
  }
  if ((can(role, "orders.deliver") || can(role, "orders.update")) && order.status === "out_for_delivery") {
    buttons.push(`<button class="btn btn--soft btn--sm" type="button" data-action="complete">
      <span class="material-symbols-outlined">task_alt</span>${t("admin.orders.complete")}
    </button>`);
  }

  if (!buttons.length) return "";
  return `<div class="drawer-actions">${buttons.join("")}</div>`;
}

function canEditStatus(order) {
  const role = state.session.role;
  if (can(role, "orders.update")) return true;
  if (can(role, "orders.dispatch") && ["confirmed", "ready_dispatch", "out_for_delivery"].includes(order.status)) return true;
  if (can(role, "orders.deliver") && order.status === "out_for_delivery") return true;
  return false;
}

function drawerMarkup(order) {
  const items = (order.items || []).map((item) => `<div class="drawer-item">
    <span>${esc(item.name)}
      <small>${esc([t(`condition.${item.condition || "new"}`), item.storage, item.color].filter(Boolean).join(" · "))} × ${item.qty}</small>
    </span>
    <span>${formatFCFA((item.unitPrice || 0) * (item.qty || 1))}</span>
  </div>`).join("");

  const events = (order.events || []).slice().sort((a, b) => stamp(a.at) - stamp(b.at));
  const timeline = events.length
    ? events.map((event) => `<div class="timeline__item">
        <span class="timeline__label">${esc(event.label)}</span>
        <span class="timeline__meta">${esc(event.actor || "")} · ${timeAgo(event.at)}</span>
      </div>`).join("")
    : `<p class="cell-sub">—</p>`;

  const messages = (order.messages || []).slice().sort((a, b) => stamp(a.at) - stamp(b.at));
  const thread = messages.length
    ? messages.map((message) => `<div class="chat-bubble ${/client/i.test(message.actor || "") ? "" : "chat-bubble--staff"}">
        ${esc(message.text)}
        <span class="chat-bubble__meta">${esc(message.actor || "")} · ${timeAgo(message.at)}</span>
      </div>`).join("")
    : `<p class="cell-sub">${t("admin.orders.context")} —</p>`;

  const lang = getLang();
  const replies = QUICK_REPLIES.map((reply, index) => `<button type="button" class="quick-reply" data-reply="${index}">
    <span>${esc(reply[lang] || reply.fr)}</span>
    <span class="material-symbols-outlined">content_copy</span>
  </button>`).join("");

  const chatUrl = customerChatUrl(order.customer?.phone || "", buildStaffGreeting(order));
  const statusChoices = ORDER_STATUSES.map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${t(`status.${status}`)}</option>`).join("");
  const courier = order.courier
    ? `<div class="drawer-info" style="margin-top:8px">
        <div><dt>${t("admin.orders.courierName")}</dt><dd>${esc(order.courier.name || "—")}</dd></div>
        <div><dt>${t("admin.orders.eta")}</dt><dd>${esc(order.courier.eta || order.courier.hub || "—")}</dd></div>
        <div><dt>${t("admin.orders.pin")}</dt><dd>${esc(order.courier.pin || "—")}</dd></div>
        <div><dt>${t("admin.orders.inTransit")}</dt><dd>${order.courier.progress != null ? `${order.courier.progress}%` : "—"}</dd></div>
      </div>`
    : "";

  return `<div class="sheet sheet--drawer admin-drawer" id="order-drawer" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="drawer-title">
    <div class="sheet__handle"></div>
    <div class="sheet__head">
      <div>
        <p class="admin-head__eyebrow">${t("admin.orders.detail")}</p>
        <h2 class="sheet__title" id="drawer-title">${esc(order.code)}</h2>
      </div>
      <button class="icon-btn" type="button" data-sheet-close aria-label="${t("common.close")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="sheet__body">
      <div class="drawer-customer">
        ${avatar(order.customer?.name, "avatar avatar--lg")}
        <div>
          <strong>${esc(order.customer?.name || "—")}</strong>
          <span>${esc(formatPhone(order.customer?.phone || ""))} · ${esc(order.customer?.city || "")}</span>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
        ${statusPill(order.status)}
        ${paidBadge(order)}
        <span class="badge badge--outline">${esc(paymentText(order.paymentMethod))}</span>
      </div>

      ${drawerActions(order)}

      <div class="drawer-section">
        <p class="drawer-section__title"><span class="material-symbols-outlined">shopping_bag</span>${t("admin.orders.items")}</p>
        <div class="drawer-items">${items}</div>
        <div class="drawer-totals">
          <div><span>${t("common.total")}</span><span>${formatFCFA(order.subtotal ?? order.total)}</span></div>
          ${order.discount ? `<div><span>${t("cart.voucher")} ${esc(order.promoCode || "")}</span><span>−${formatFCFA(order.discount)}</span></div>` : ""}
          <div><span>${t("footer.delivery")}</span><span>${t("common.free")}</span></div>
          <div class="total"><span>${t("admin.orders.total")}</span><span>${formatFCFA(order.total)}</span></div>
        </div>
      </div>

      <div class="drawer-section">
        <p class="drawer-section__title"><span class="material-symbols-outlined">pin_drop</span>${t("admin.orders.address")}</p>
        <div class="drawer-info">
          <div><dt>${t("cart.address.city")}</dt><dd>${esc(order.customer?.city || "—")}</dd></div>
          <div><dt>${t("cart.address.quarter")}</dt><dd>${esc(order.customer?.quarter || "—")}</dd></div>
          <div style="grid-column:1/-1"><dt>${t("cart.address.landmark")}</dt><dd>${esc(order.customer?.landmark || "—")}</dd></div>
        </div>
        ${courier}
      </div>

      <div class="drawer-section">
        <p class="drawer-section__title"><span class="material-symbols-outlined">timeline</span>${t("admin.orders.timeline")}</p>
        <div class="timeline">${timeline}</div>
      </div>

      <div class="drawer-section">
        <p class="drawer-section__title"><span class="material-symbols-outlined">forum</span>${t("admin.orders.context")}</p>
        <div class="chat-thread">${thread}</div>
      </div>

      <div class="drawer-section">
        <p class="drawer-section__title"><span class="material-symbols-outlined">bolt</span>${t("admin.orders.quickReplies")}</p>
        <div class="quick-replies">${replies}</div>
      </div>

      <div class="drawer-section">
        <p class="drawer-section__title"><span class="material-symbols-outlined">notes</span>${t("admin.orders.notes")}</p>
        <form class="note-form" id="note-form">
          <textarea class="input" name="note" rows="2" maxlength="500" placeholder="${t("admin.orders.notePlaceholder")}" required></textarea>
          <button class="btn btn--ghost btn--sm" type="submit">
            <span class="material-symbols-outlined">add</span>${t("admin.orders.addNote")}
          </button>
        </form>
      </div>

      <div class="drawer-section">
        <p class="drawer-section__title"><span class="material-symbols-outlined">tune</span>${t("admin.orders.updateStatus")}</p>
        ${canEditStatus(order)
          ? `<select class="status-select" id="order-status" aria-label="${t("admin.orders.updateStatus")}">${statusChoices}</select>`
          : `<p class="cell-sub">${t("admin.orders.permission")}</p>`}
      </div>
    </div>

    <div class="sheet__foot">
      <a class="btn btn--whatsapp" href="${chatUrl}" target="_blank" rel="noopener">
        <span class="material-symbols-outlined">forum</span>${t("admin.orders.chat", { name: order.customer?.name || "" })}
      </a>
    </div>
  </div>`;
}

function showSheet(markup) {
  const overlays = $("#admin-overlays");
  overlays.innerHTML = markup;
  const el = overlays.querySelector(".sheet");
  if (!el) return null;
  bindSheetTriggers(el);
  openSheet(el);
  return el;
}

function openDrawer(orderOrId) {
  const order = typeof orderOrId === "string"
    ? state.orders.find((entry) => entry.id === orderOrId)
    : orderOrId;
  if (!order) return;

  showSheet(drawerMarkup(order));
  bindDrawer(order);
}

async function refreshDrawer(orderId) {
  const fresh = state.orders.find((entry) => entry.id === orderId);
  if (fresh) openDrawer(fresh);
}

function bindDrawer(order) {
  const drawer = $("#order-drawer");
  if (!drawer) return;

  drawer.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action, order));
  });

  drawer.querySelectorAll("[data-reply]").forEach((button) => {
    button.addEventListener("click", async () => {
      const reply = QUICK_REPLIES[Number(button.dataset.reply)];
      if (!reply) return;
      const text = fillTemplate(reply.text[getLang()] || reply.text.fr, order);
      try {
        await navigator.clipboard.writeText(text);
        toast(t("admin.orders.templateCopied"), "success");
      } catch {
        toast(t("common.copy"), "error");
      }
      window.open(customerChatUrl(order.customer?.phone || "", text), "_blank", "noopener");
    });
  });

  drawer.querySelector("#note-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const field = event.currentTarget.querySelector("[name=note]");
    const text = field.value.trim();
    if (!text) return;
    await addOrderNote(order.id, text, state.session.name);
    toast(t("admin.orders.noteSaved"), "success");
    refreshDrawer(order.id);
  });

  drawer.querySelector("#order-status")?.addEventListener("change", async (event) => {
    const status = event.target.value;
    try {
      await updateOrder(order.id, { status }, {
        type: "status",
        label: t(`status.${status}`),
        actor: state.session.name,
      });
      toast(t("admin.orders.statusUpdated"), "success");
      refreshDrawer(order.id);
    } catch (error) {
      console.error(error);
      toast(t("admin.orders.permission"), "error");
    }
  });
}

async function runAction(action, order) {
  const actor = state.session.name;
  try {
    if (action === "confirm-stock") {
      await updateOrder(order.id, { status: "confirmed" }, {
        type: "stock", label: t("admin.orders.confirmStockOk"), actor,
      });
      toast(t("admin.orders.confirmStockOk"), "success");
    }

    if (action === "record-payment") {
      openPaymentSheet(order);
      return;
    }

    if (action === "dispatch") {
      await updateOrder(order.id, { status: "ready_dispatch" }, {
        type: "status", label: t("status.ready_dispatch"), actor,
      });
      toast(t("admin.orders.statusUpdated"), "success");
    }

    if (action === "track") {
      window.open(customerChatUrl(order.customer?.phone || "", buildTrackingMessage(order)), "_blank", "noopener");
      await updateOrder(order.id, { status: "out_for_delivery" }, {
        type: "status", label: t("status.out_for_delivery"), actor,
      });
      toast(t("admin.orders.sendTracking"), "success");
    }

    if (action === "complete") {
      await updateOrder(order.id, { status: "completed" }, {
        type: "status", label: t("admin.orders.deliveryComplete"), actor,
      });
      toast(t("admin.orders.deliveryComplete"), "success");
    }

    const fresh = state.orders.find((entry) => entry.id === order.id);
    openDrawer(fresh || order);
  } catch (error) {
    console.error(error);
    toast(t("admin.orders.permission"), "error");
  }
}

/* ----------------------------- payment sheet ---------------------------- */

function openPaymentSheet(order) {
  const sheet = showSheet(`<div class="sheet sheet--center" id="payment-sheet" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="payment-title">
    <div class="sheet__handle"></div>
    <div class="sheet__head">
      <div>
        <p class="admin-head__eyebrow">${esc(order.code)}</p>
        <h2 class="sheet__title" id="payment-title">${t("admin.orders.recordTitle")}</h2>
      </div>
      <button class="icon-btn" type="button" data-sheet-close aria-label="${t("common.close")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <form class="sheet__body admin-form" id="payment-form">
      <div class="field">
        <label class="field__label" for="payment-amount">${t("admin.orders.recordAmount")}</label>
        <input class="input" id="payment-amount" name="amount" type="number" min="0" step="500" value="${Number(order.total) || 0}" required>
      </div>
      <div class="field">
        <label class="field__label" for="payment-ref">${t("admin.orders.recordRef")}</label>
        <input class="input" id="payment-ref" name="reference" type="text" placeholder="MOMO-2026-0000" required>
      </div>
      <div class="field">
        <label class="field__label" for="payment-method">${t("admin.orders.method")}</label>
        <select class="input" id="payment-method" name="method">
          <option value="mtn_momo" ${order.paymentMethod === "mtn_momo" ? "selected" : ""}>${t("payment.mtn_momo")}</option>
          <option value="orange_money" ${order.paymentMethod === "orange_money" ? "selected" : ""}>${t("payment.orange_money")}</option>
          <option value="bank_wire" ${order.paymentMethod === "bank_wire" ? "selected" : ""}>${t("payment.bank_wire")}</option>
          <option value="cash_on_delivery" ${order.paymentMethod === "cash_on_delivery" ? "selected" : ""}>${t("payment.cash_on_delivery")}</option>
        </select>
      </div>
      <p class="cell-sub">${t("admin.orders.proofHint")}</p>
    </form>
    <div class="sheet__foot">
      <button class="btn btn--ghost" type="button" data-sheet-close>${t("common.cancel")}</button>
      <button class="btn btn--primary" type="submit" form="payment-form" id="payment-save">
        <span class="material-symbols-outlined">check</span>${t("admin.orders.savePayment")}
      </button>
    </div>
  </div>`);

  sheet?.querySelector("#payment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reference = String(data.get("reference") || "").trim();
    if (!reference) return;
    const button = $("#payment-save");
    button?.classList.add("is-loading");
    if (button) button.disabled = true;
    try {
      await updateOrder(order.id, { paymentStatus: "paid", paymentMethod: String(data.get("method")) }, {
        type: "payment",
        label: `${t("admin.orders.wireRecorded")} · ${reference}`,
        actor: state.session.name,
      });
      closeSheet();
      toast(t("admin.orders.paymentRecorded"), "success");
      openDrawer({ ...order, paymentStatus: "paid", paymentMethod: String(data.get("method")) });
    } catch (error) {
      console.error(error);
      toast(t("admin.orders.permission"), "error");
    } finally {
      button?.classList.remove("is-loading");
      if (button) button.disabled = false;
    }
  });
}

/* ----------------------------- manual order ----------------------------- */

function openManualSheet() {
  const products = getProducts().filter((product) => product.isActive !== false);
  const options = products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((product) => `<option value="${esc(product.id)}">${esc(product.name)} — ${formatFCFA(priceOf(product))}</option>`)
    .join("");

  const sheet = showSheet(`<div class="sheet sheet--center" id="manual-sheet" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="manual-title">
    <div class="sheet__handle"></div>
    <div class="sheet__head">
      <div>
        <p class="admin-head__eyebrow">WhatsApp</p>
        <h2 class="sheet__title" id="manual-title">${t("admin.orders.newOrder")}</h2>
      </div>
      <button class="icon-btn" type="button" data-sheet-close aria-label="${t("common.close")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <form class="sheet__body admin-form" id="manual-form">
      <p class="cell-sub" style="margin-top:-4px">${t("admin.orders.manualSub")}</p>
      <div class="form-grid form-grid--2">
        <div class="field span-2">
          <label class="field__label" for="manual-name">${t("admin.orders.customerName")}</label>
          <input class="input" id="manual-name" name="name" type="text" autocomplete="name" required>
        </div>
        <div class="field span-2">
          <label class="field__label" for="manual-phone">${t("admin.orders.whatsapp")}</label>
          <input class="input" id="manual-phone" name="phone" type="tel" inputmode="tel" placeholder="+237 6XX XX XX XX" required>
        </div>
        <div class="field">
          <label class="field__label" for="manual-city">${t("cart.address.city")}</label>
          <select class="input" id="manual-city" name="city">
            <option value="Douala">Douala — Akwa</option>
            <option value="Yaoundé">Yaoundé — Bastos</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="manual-quarter">${t("cart.address.quarter")}</label>
          <input class="input" id="manual-quarter" name="quarter" type="text" required>
        </div>
        <div class="field span-2">
          <label class="field__label" for="manual-landmark">${t("cart.address.landmark")}</label>
          <input class="input" id="manual-landmark" name="landmark" type="text" placeholder="${t("cart.address.landmarkHint")}">
        </div>
        <div class="field span-2">
          <label class="field__label" for="manual-product">${t("admin.orders.product")}</label>
          <select class="input" id="manual-product" name="product" required>${options}</select>
        </div>
        <div class="field">
          <label class="field__label" for="manual-qty">${t("common.quantity")}</label>
          <input class="input" id="manual-qty" name="qty" type="number" min="1" max="9" value="1" required>
        </div>
        <div class="field">
          <label class="field__label" for="manual-method">${t("admin.orders.method")}</label>
          <select class="input" id="manual-method" name="method">
            <option value="mtn_momo">${t("payment.mtn_momo")}</option>
            <option value="orange_money">${t("payment.orange_money")}</option>
            <option value="cash_on_delivery">${t("payment.cash_on_delivery")}</option>
            <option value="bank_wire">${t("payment.bank_wire")}</option>
          </select>
        </div>
        <div class="field span-2">
          <label class="field__label" for="manual-memo">${t("admin.orders.memo")}</label>
          <textarea class="input" id="manual-memo" name="memo" rows="2"></textarea>
        </div>
      </div>
      <div class="admin-login__error" id="manual-error" role="alert" hidden></div>
    </form>
    <div class="sheet__foot">
      <button class="btn btn--ghost" type="button" data-sheet-close>${t("common.cancel")}</button>
      <button class="btn btn--primary" type="submit" form="manual-form" id="manual-save">
        <span class="material-symbols-outlined">chat</span>${t("admin.orders.generate")}
      </button>
    </div>
  </div>`);

  sheet?.querySelector("#manual-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const errorBox = $("#manual-error");
    const fail = (message) => {
      errorBox.textContent = message;
      errorBox.hidden = false;
    };

    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const product = getProduct(String(data.get("product") || ""));
    const qty = Math.max(1, Math.min(9, Number(data.get("qty")) || 1));
    const quarter = String(data.get("quarter") || "").trim();

    if (name.length < 2) return fail(t("account.nameRequired"));
    if (!isValidCameroonPhone(phone)) return fail(t("account.phoneInvalid"));
    if (!quarter) return fail(t("cart.validation.quarter"));
    if (!product) return fail(t("product.unavailable"));

    errorBox.hidden = true;
    const button = $("#manual-save");
    button?.classList.add("is-loading");
    if (button) button.disabled = true;

    try {
      const unitPrice = priceOf(product, "new");
      const subtotal = unitPrice * qty;
      const order = await createOrder({
        customer: {
          uid: null,
          name,
          phone: normalizePhone(phone),
          city: String(data.get("city") || "Douala"),
          quarter,
          landmark: String(data.get("landmark") || "").trim(),
        },
        items: [{
          productId: product.id,
          name: product.name,
          brand: product.brand,
          condition: "new",
          qty,
          unitPrice,
        }],
        subtotal,
        discount: 0,
        shipping: 0,
        total: subtotal,
        promoCode: null,
        paymentMethod: String(data.get("method") || "mtn_momo"),
        source: "admin",
      });

      const memo = String(data.get("memo") || "").trim();
      if (memo) await addOrderNote(order.id, memo, state.session.name);

      closeSheet();
      toast(`${t("admin.orders.created")} · ${order.code}`, "success");
      openDrawer(order);
    } catch (error) {
      console.error(error);
      fail(t("admin.login.error"));
    } finally {
      button?.classList.remove("is-loading");
      if (button) button.disabled = false;
    }
  });
}

/* ------------------------------- binding -------------------------------- */

function renderKpis() {
  const host = $("#orders-kpis");
  if (!host) return;
  const counts = orderCounts(state.orders);
  host.innerHTML = [
    kpi({
      icon: "forum",
      label: t("admin.orders.newChats"),
      value: counts.newChats,
      meta: t("admin.orders.thisHour", { n: newThisHour() }),
    }),
    kpi({
      icon: "hourglass_top",
      label: t("admin.orders.awaiting"),
      value: counts.awaiting,
      meta: `MTN MoMo · Orange Money`,
      tone: "warn",
    }),
    kpi({
      icon: "local_shipping",
      label: t("admin.orders.ready"),
      value: counts.ready,
      meta: `${counts.transit} ${t("admin.orders.inTransit").toLowerCase()}`,
      tone: "teal",
    }),
    kpi({
      icon: "payments",
      label: t("admin.orders.gmv"),
      value: formatFCFA(todayGmv(state.orders)),
      meta: t("admin.gatewaySub"),
      tone: "success",
    }),
  ].join("");
}

function renderResults() {
  const orders = filteredOrders();
  const cards = $("#orders-cards");
  const board = $("#orders-board");
  const tbody = $("#orders-table-body");
  const count = $("#orders-count");

  if (cards) {
    cards.innerHTML = orders.length
      ? orders.map(orderTile).join("")
      : emptyBlock({ icon: "forum", title: t("admin.orders.empty.title"), text: t("admin.orders.empty.text") });
  }
  if (board) {
    board.innerHTML = BOARD_STATUSES.map((status) => boardColumn(status, orders)).join("");
  }
  if (tbody) {
    tbody.innerHTML = orders.length
      ? orders.map(tableRow).join("")
      : `<tr><td colspan="8">${emptyBlock({ icon: "forum", title: t("admin.orders.empty.title") })}</td></tr>`;
  }
  if (count) count.textContent = t("account.ordersCount", { n: orders.length });
}

function applyView() {
  const board = $("#orders-board");
  const table = $("#orders-table-panel");
  if (board) board.hidden = state.view === "table";
  if (table) table.hidden = state.view !== "table";
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });
}

function syncTabs() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.tab);
  });
}

function panelMarkup() {
  const tabs = ["all", ...ORDER_STATUSES].map((status) => `<button type="button" class="chip ${state.tab === status ? "is-active" : ""}" data-tab="${status}">
    ${status === "all" ? t("admin.orders.tab.all") : t(`admin.orders.tab.${status}`)}
  </button>`).join("");

  return `<section class="admin-panel">
    <div class="admin-toolbar">
      <div class="admin-search">
        <span class="material-symbols-outlined">search</span>
        <input id="orders-search" type="search" value="${esc(state.query)}" placeholder="${t("admin.orders.search")}" aria-label="${t("admin.orders.search")}">
      </div>
      <div class="segmented admin-view-switch" role="group" aria-label="${t("admin.orders.title")}">
        <button type="button" data-view="board" class="${state.view === "board" ? "is-active" : ""}" aria-pressed="${state.view === "board"}">
          <span class="material-symbols-outlined">view_kanban</span>${t("admin.orders.kanban")}
        </button>
        <button type="button" data-view="table" class="${state.view === "table" ? "is-active" : ""}" aria-pressed="${state.view === "table"}">
          <span class="material-symbols-outlined">table_rows</span>${t("admin.orders.table")}
        </button>
      </div>
    </div>
    <div class="admin-filter-chips" role="group" aria-label="${t("admin.orders.filter")}">
      ${tabs}
    </div>
    <div class="admin-panel__head">
      <h2 class="admin-panel__title"><span class="material-symbols-outlined">forum</span>${t("admin.orders.title")}</h2>
      <span class="admin-panel__count" id="orders-count"></span>
    </div>
    <div id="orders-results">
      <div class="admin-order-grid" id="orders-cards"></div>
      <div class="admin-board" id="orders-board"></div>
      <div id="orders-table-panel" hidden>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>${t("admin.orders.code")}</th>
                <th>${t("admin.orders.customer")}</th>
                <th class="num">${t("common.total")}</th>
                <th>${t("admin.orders.payment")}</th>
                <th>${t("admin.orders.paymentStatus")}</th>
                <th>${t("admin.orders.status")}</th>
                <th>${t("admin.orders.date")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="orders-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  </section>`;
}

function renderShell() {
  const host = root();
  if (!host) return;

  const manualButton = can(state.session.role, "orders.update")
    ? `<button class="btn btn--primary btn--sm" type="button" id="manual-order">
        <span class="material-symbols-outlined">add</span>${t("admin.orders.manual")}
      </button>`
    : "";

  host.innerHTML = `
    ${pageHead({
      eyebrow: t("admin.title"),
      title: t("admin.orders.title"),
      sub: t("admin.orders.sub"),
      actions: `<span class="admin-live"><span class="dot dot--live"></span>${t("admin.orders.live")}</span>
        <button class="btn btn--ghost btn--sm" type="button" id="orders-refresh">
          <span class="material-symbols-outlined">refresh</span>${t("admin.orders.refresh")}
        </button>
        ${manualButton}`,
    })}
    <div class="admin-gateway">
      <span class="admin-gateway__icon"><span class="material-symbols-outlined">hub</span></span>
      <div>
        <b>${t("admin.gateway")}</b>
        <span>${t("admin.gatewaySub")}</span>
      </div>
      <span class="admin-gateway__spacer"></span>
      <span class="badge badge--success">${t("admin.orders.live")}</span>
    </div>
    <div class="admin-kpis" id="orders-kpis"></div>
    ${panelMarkup()}
  `;

  applyTranslations(host);
  bindShell();
  renderKpis();
  renderResults();
  applyView();
}

function bindShell() {
  const host = root();

  host.querySelector("#orders-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderResults();
  });

  host.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      syncTabs();
      renderResults();
    });
  });

  host.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      applyView();
    });
  });

  host.querySelector("#manual-order")?.addEventListener("click", openManualSheet);
  host.querySelector("#orders-refresh")?.addEventListener("click", () => renderResults());

  host.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-order]");
    if (!trigger) return;
    openDrawer(trigger.dataset.order);
  });
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const guard = await requireStaff("orders.read");
  if (!guard) return;
  const session = guard.denied ? guard.session : guard;

  state.session = session;
  await initStore();
  mountAdminShell({ active: "orders", session });

  if (guard.denied) {
    root().innerHTML = deniedBlock();
    return;
  }

  renderShell();

  const stop = watchOrders((orders) => {
    state.orders = orders;
    renderKpis();
    renderResults();
  });

  onLangChange(() => {
    mountAdminShell({ active: "orders", session });
    renderShell();
  });

  window.addEventListener("beforeunload", () => stop());
}

main().catch((error) => {
  console.error(error);
  const host = root();
  if (host) host.innerHTML = emptyBlock({ icon: "cloud_off", title: t("common.retry") });
});
