/* ==========================================================================
   WhatsApp — order message builder, wa.me redirects and staff templates.
   All numbers come from config.js.
   ========================================================================== */

import { BUSINESS } from "./config.js";
import { getLang, t } from "./i18n.js";
import { formatFCFA, formatPhone, waPhone, normalizePhone } from "./format.js";

const PAYMENT_LABEL = {
  mtn_momo: "MTN MoMo",
  orange_money: "Orange Money",
  cash_on_delivery: "Espèces à la livraison",
  bank_wire: "Virement bancaire",
};

/** "iPhone 15 Pro Max (256GB Titane Naturel)" */
function itemLabel(item) {
  const details = [item.storage, item.color].filter(Boolean).join(" ");
  return details ? `${item.name} (${details})` : item.name;
}

/**
 * Builds the exact French order inquiry used by the storefront screen.
 * Falls back to English when the visitor switched the language.
 */
export function buildOrderMessage({ items, totals, address, code }) {
  const lang = getLang();
  const lines = [];
  const deliveryPoint = [address.quarter, address.city].filter(Boolean).join(", ");
  const payment = lang === "fr"
    ? "Paiement prévu via MTN MoMo / Orange Money / Espèces à la livraison."
    : "Planned payment via MTN MoMo / Orange Money / Cash on delivery.";

  if (lang === "fr") {
    lines.push(`Bonjour ${BUSINESS.name},`);
    lines.push("Je souhaite passer commande pour :");
    items.forEach((item) => {
      lines.push(`• ${itemLabel(item)} — Qté: ${item.qty} — ${formatFCFA(item.unitPrice * item.qty)}`);
    });
    if (totals.discount > 0) {
      lines.push(`Code promo : ${totals.promoCode} (−${formatFCFA(totals.discount)})`);
    }
    lines.push("");
    lines.push(`Montant Total de la commande : ${formatFCFA(totals.total)}`);
    lines.push(`Lieu de livraison : ${deliveryPoint}.`);
    if (address.landmark) lines.push(`Point de repère : ${address.landmark}.`);
    lines.push(payment);
    lines.push("Merci de confirmer la disponibilité et le délai de livraison.");
    lines.push(`Réf. commande : ${code}`);
  } else {
    lines.push(`Hello ${BUSINESS.name},`);
    lines.push("I would like to place an order for:");
    items.forEach((item) => {
      lines.push(`• ${itemLabel(item)} — Qty: ${item.qty} — ${formatFCFA(item.unitPrice * item.qty)}`);
    });
    if (totals.discount > 0) {
      lines.push(`Promo code: ${totals.promoCode} (−${formatFCFA(totals.discount)})`);
    }
    lines.push("");
    lines.push(`Order total: ${formatFCFA(totals.total)}`);
    lines.push(`Delivery location: ${deliveryPoint}.`);
    if (address.landmark) lines.push(`Landmark: ${address.landmark}.`);
    lines.push(payment);
    lines.push("Please confirm availability and delivery time.");
    lines.push(`Order ref: ${code}`);
  }

  return lines.join("\n");
}

/** Builds a wa.me link for any number; defaults to the business number. */
export function waLink(text, phone = BUSINESS.whatsappNumber) {
  const number = waPhone(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Opens WhatsApp in the same tab, as required by the checkout flow. */
export function openWhatsApp(text) {
  const url = waLink(text);
  window.location.href = url;
  return url;
}

/** Staff → customer chat URL. */
export function customerChatUrl(phone, text) {
  return waLink(text, phone);
}

/** Message sent by staff to confirm tracking. */
export function buildTrackingMessage(order) {
  const fr = getLang() === "fr";
  const hub = order.courier?.hub || order.customer?.city || "Douala";
  if (fr) {
    return [
      `Bonjour ${order.customer.name},`,
      `Votre commande ${order.code} est en route depuis le hub ${hub}.`,
      order.courier?.eta ? `Arrivée estimée : ${order.courier.eta}.` : "Le livreur vous appelle 30 minutes avant.",
      order.courier?.pin ? `Code de livraison : ${order.courier.pin}.` : "",
      `Montant : ${formatFCFA(order.total)}.`,
      "Merci de confirmer la réception. — NovaTech Cameroun",
    ].filter(Boolean).join("\n");
  }
  return [
    `Hello ${order.customer.name},`,
    `Your order ${order.code} is on its way from the ${hub} hub.`,
    order.courier?.eta ? `Estimated arrival: ${order.courier.eta}.` : "The courier calls 30 minutes ahead.",
    order.courier?.pin ? `Delivery PIN: ${order.courier.pin}.` : "",
    `Amount: ${formatFCFA(order.total)}.`,
    "Please confirm reception. — NovaTech Cameroon",
  ].filter(Boolean).join("\n");
}

/** Initial message a staff member sends when opening a customer chat. */
export function buildStaffGreeting(order) {
  const fr = getLang() === "fr";
  return fr
    ? `Bonjour ${order.customer.name}, ici l'équipe NovaTech Cameroun. Nous traitons votre commande ${order.code}. Comment pouvons-nous vous aider ?`
    : `Hello ${order.customer.name}, this is the NovaTech Cameroon team. We are processing your order ${order.code}. How can we help?`;
}

/** Fills the placeholders inside a quick-reply template. */
export function fillTemplate(template, order) {
  const product = order.items?.[0]?.name || "article";
  const hub = order.courier?.hub || order.customer?.city || "Douala";
  return template
    .replaceAll("{code}", order.code)
    .replaceAll("{hub}", hub)
    .replaceAll("{product}", product);
}

export function paymentLabel(method) {
  return PAYMENT_LABEL[method] || t("payment.cash_on_delivery");
}

export { formatPhone, normalizePhone };
