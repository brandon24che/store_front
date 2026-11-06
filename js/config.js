/* ==========================================================================
   NovaTech — single source of truth for keys and business constants.
   Nothing else in the client may hold a secret or a business number.
   ========================================================================== */

// ---------------------------------------------------------------------------
// Firebase web-app config for the `electronic-store-cfd97` project.
// These values are public identifiers (security is enforced by rules), but
// they must never be swapped for service-account credentials.
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: "AIzaSyAv1pkJLl6aTAGYkfs7il8Sjqs486RmO60",
  authDomain: "electronic-store-cfd97.firebaseapp.com",
  projectId: "electronic-store-cfd97",
  storageBucket: "electronic-store-cfd97.firebasestorage.app",
  messagingSenderId: "511943553099",
  appId: "1:511943553099:web:7aedce33690a96e55cddce",
};

// ---------------------------------------------------------------------------
// Cloudinary — unsigned uploads for admin product images. No API secret here.
// ---------------------------------------------------------------------------
export const cloudinaryConfig = {
  cloudName: "f9rwcdyz",
  uploadPreset: "store_front",
  folder: "novatech/products",
};

// ---------------------------------------------------------------------------
// Business constants (CmF)
// ---------------------------------------------------------------------------
export const BUSINESS = {
  name: "NovaTech Cameroun",
  whatsappNumber: "237699012345", // never hardcode this anywhere else
  email: "bonjour@novatech.cm",
  hubs: [
    { id: "douala", city: "Douala", quarter: "Akwa", label: "Hub Logistique Douala — Akwa", phone: "+237 699 01 23 45" },
    { id: "yaounde", city: "Yaoundé", quarter: "Bastos", label: "Showroom Yaoundé — Bastos", phone: "+237 677 45 67 89" },
  ],
  cities: ["Douala", "Yaoundé"],
  freeDeliveryCities: ["Douala", "Yaoundé"],
  deliveryPromise: "24h",
  paymentMethods: ["mtn_momo", "orange_money", "cash_on_delivery", "bank_wire"],
  conditions: [
    { id: "new", labelKey: "condition.new", noteKey: "condition.newNote" },
    { id: "openBox", labelKey: "condition.openBox", noteKey: "condition.openBoxNote" },
    { id: "refurb", labelKey: "condition.refurb", noteKey: "condition.refurbNote" },
  ],
};

/** True when real Firebase keys have been pasted. */
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("PASTE_");
export const isCloudinaryConfigured = !cloudinaryConfig.cloudName.startsWith("PASTE_");

export const APP = {
  name: "NovaTech",
  currency: "XAF",
  currencyLabel: "FCFA",
  locale: { fr: "fr-CM", en: "en-CM" },
  pageSize: 12,
  lowStockThreshold: 5,
  orderPrefix: "WA",
};
