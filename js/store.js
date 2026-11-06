/* ==========================================================================
   Store — the single data access layer. Every page talks to this module;
   it transparently serves Firestore (when configured) or the demo dataset.
   ========================================================================== */

import { isFirebaseConfigured, APP } from "./config.js";
import { getFirebase } from "./firebase.js";
import * as demo from "./data/demo.js";

const LS = {
  products: "novatech.demo.products",
  orders: "novatech.demo.orders",
  staff: "novatech.demo.staff",
  audit: "novatech.demo.audit",
  counter: "novatech.demo.orderCounter",
};

const CATALOG_TTL = 30 * 60 * 1000;
const state = {
  products: [],
  categories: [],
  brands: [],
  loaded: false,
};

/* ------------------------------- helpers ------------------------------- */

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function splitHubs(stock) {
  return { douala: Math.ceil(stock * 0.6), yaounde: Math.floor(stock * 0.4) };
}

function withHubs(product) {
  if (product.hubs) return product;
  const hubs = {};
  for (const [condition, value] of Object.entries(product.conditions || {})) {
    hubs[condition] = splitHubs(value.stock || 0);
  }
  return { ...product, hubs };
}

function toastOrderChange() {
  window.dispatchEvent(new CustomEvent("demo-orders"));
}

/* ------------------------------- catalog ------------------------------- */

/** Lowest sellable price of a product (new condition by default). */
export function priceOf(product, condition = "new") {
  return product?.conditions?.[condition]?.price ?? product?.conditions?.new?.price ?? 0;
}

export function compareAtOf(product, condition = "new") {
  return product?.conditions?.[condition]?.compareAtPrice ?? 0;
}

export function totalStock(product) {
  return Object.values(product.conditions || {}).reduce((sum, value) => sum + (value.stock || 0), 0);
}

export function stockFor(product, condition = "new", hub) {
  const entry = product?.conditions?.[condition];
  if (!entry) return 0;
  if (!hub) return entry.stock || 0;
  return product.hubs?.[condition]?.[hub] ?? 0;
}

export async function initStore() {
  if (state.loaded) return state;

  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const { collection, getDocs, query, where } = firestoreMod;
    const [productSnap, categorySnap, brandSnap] = await Promise.all([
      getDocs(query(collection(db, "products"), where("isActive", "==", true))),
      getDocs(collection(db, "categories")),
      getDocs(collection(db, "brands")),
    ]);
    state.products = productSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).map(withHubs);
    state.categories = categorySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.order - b.order);
    state.brands = brandSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } else {
    const overrides = readLS(LS.products, null);
    const base = overrides || demo.PRODUCTS;
    state.products = base.map(withHubs).filter((product) => product.isActive !== false);
    state.categories = demo.CATEGORIES;
    state.brands = demo.BRANDS;
    cacheCatalogMeta();
  }

  if (!state.categories.length) state.categories = demo.CATEGORIES;
  if (!state.brands.length) state.brands = demo.BRANDS;
  state.loaded = true;
  return state;
}

/** Brief: cache category and brand lists in sessionStorage. */
function cacheCatalogMeta() {
  try {
    sessionStorage.setItem("novatech.catalogMeta", JSON.stringify({
      at: Date.now(),
      categories: demo.CATEGORIES,
      brands: demo.BRANDS,
    }));
  } catch {
    /* storage may be disabled — the in-memory copy is enough */
  }
}

export function readCachedMeta() {
  try {
    const raw = JSON.parse(sessionStorage.getItem("novatech.catalogMeta") || "null");
    if (raw && Date.now() - raw.at < CATALOG_TTL) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function getProducts() {
  return state.products;
}

/** Admin view — includes inactive products hidden from the storefront. */
export async function listAllProducts() {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const snapshot = await firestoreMod.getDocs(firestoreMod.collection(db, "products"));
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() })).map(withHubs);
  }
  return (readLS(LS.products, null) || demo.PRODUCTS).map((product) => withHubs({ ...product }));
}

export function getCategories() {
  return state.categories;
}

export function getBrands() {
  return state.brands;
}

export function getProduct(id) {
  return state.products.find((product) => product.id === id) || null;
}

export function getCategory(id) {
  return state.categories.find((category) => category.id === id) || null;
}

export function getFeatured() {
  const featured = state.products.filter((product) => product.isFeatured);
  return (featured.length ? featured : state.products).slice(0, 8);
}

export function getFlashDeals() {
  return state.products.filter((product) => product.isFlashDeal && (!product.flashEndsAt || product.flashEndsAt > Date.now()));
}

export function getHero() {
  return state.products.find((product) => product.isFeatured && product.category === "smartphones") || state.products[0];
}

export function getRelated(product, limit = 4) {
  return state.products
    .filter((candidate) => candidate.id !== product.id && candidate.category === product.category)
    .slice(0, limit);
}

export function getBundle(product) {
  const accessories = state.products.filter(
    (candidate) => candidate.id !== product.id && candidate.category === "accessories",
  );
  return accessories.slice(0, 2);
}

/* ------------------------------- querying ------------------------------ */

export const SORTS = ["recommended", "priceAsc", "priceDesc", "newest", "topRated", "deals", "pickup"];

/**
 * Filters + sorts in one pass. Kept client-side so a filter change never
 * waits on a network round-trip; Firestore still owns the source data.
 */
export function queryProducts(options = {}) {
  const {
    category = "",
    brands = [],
    conditions = [],
    priceMin = 0,
    priceMax = 0,
    storage = [],
    ram = [],
    hubs = [],
    inStock = false,
    search = "",
    q = "",
    sort = "recommended",
    page = 1,
    pageSize = APP.pageSize,
  } = options;

  const needle = String(search || q).trim().toLowerCase();

  let items = state.products.filter((product) => {
    if (category && product.category !== category) return false;
    if (brands.length && !brands.includes(product.brand)) return false;
    if (inStock && totalStock(product) <= 0) return false;
    if (priceMax && priceOf(product) > priceMax) return false;
    if (priceMin && priceOf(product) < priceMin) return false;

    if (conditions.length) {
      const available = conditions.some((condition) => (product.conditions?.[condition]?.stock || 0) > 0);
      if (!available) return false;
    }
    if (storage.length) {
      const labels = (product.variants?.storage || []).map((tier) => tier.label);
      if (!storage.some((wanted) => labels.includes(wanted))) return false;
    }
    if (ram.length) {
      const labels = (product.variants?.ram || []).map((tier) => tier.label);
      if (!ram.some((wanted) => labels.includes(wanted))) return false;
    }
    if (hubs.length) {
      const available = hubs.some((hub) =>
        Object.values(product.hubs || {}).some((byHub) => (byHub?.[hub] || 0) > 0),
      );
      if (!available) return false;
    }
    if (needle) {
      const haystack = `${product.searchKeywords || ""} ${product.name} ${product.brand} ${product.shortSpec}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  items = sortProducts(items, sort);

  const total = items.length;
  const start = Math.max(0, (page - 1) * pageSize);
  return {
    items: items.slice(start, start + pageSize),
    total,
    hasMore: start + pageSize < total,
    page,
  };
}

export function sortProducts(items, sort) {
  const list = [...items];
  switch (sort) {
    case "priceAsc":
      return list.sort((a, b) => priceOf(a) - priceOf(b));
    case "priceDesc":
      return list.sort((a, b) => priceOf(b) - priceOf(a));
    case "newest":
      return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    case "topRated":
      return list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewCount || 0) - (a.reviewCount || 0));
    case "deals":
      return list.sort((a, b) => {
        const dealA = a.conditions?.new?.compareAtPrice ? a.conditions.new.compareAtPrice - a.conditions.new.price : 0;
        const dealB = b.conditions?.new?.compareAtPrice ? b.conditions.new.compareAtPrice - b.conditions.new.price : 0;
        return dealB - dealA;
      });
    case "pickup":
      return list.sort((a, b) => (b.hubs?.new?.douala || 0) - (a.hubs?.new?.douala || 0));
    default:
      return list.sort((a, b) => {
        const scoreA = (a.isFeatured ? 100 : 0) + (a.isFlashDeal ? 40 : 0) + (a.rating || 0);
        const scoreB = (b.isFeatured ? 100 : 0) + (b.isFlashDeal ? 40 : 0) + (b.rating || 0);
        return scoreB - scoreA;
      });
  }
}

/** Distinct facet values used by the filter drawer. */
export function facets() {
  const storages = new Set();
  const rams = new Set();
  for (const product of state.products) {
    (product.variants?.storage || []).forEach((tier) => storages.add(tier.label));
    (product.variants?.ram || []).forEach((tier) => rams.add(tier.label));
  }
  return {
    brands: [...new Set(state.products.map((product) => product.brand))].sort(),
    storage: [...storages].sort((a, b) => parseInt(a) - parseInt(b)),
    ram: [...rams].sort((a, b) => parseInt(a) - parseInt(b)),
  };
}

/* -------------------------------- promos ------------------------------- */

export async function validatePromo(code, subtotal) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return { ok: false, reason: "empty" };

  let promo = null;
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    try {
      const snap = await firestoreMod.getDoc(firestoreMod.doc(db, "promoCodes", normalized));
      promo = snap.exists() ? snap.data() : null;
    } catch {
      // Rules reject inactive/unknown codes; treat both as invalid.
      return { ok: false, reason: "invalid" };
    }
  } else {
    promo = demo.PROMO_CODES[normalized] || null;
  }

  if (!promo || promo.active === false) return { ok: false, reason: "invalid" };
  if (promo.expiresAt && (promo.expiresAt.toMillis?.() || promo.expiresAt) < Date.now()) {
    return { ok: false, reason: "invalid" };
  }
  if (promo.minOrder && subtotal < promo.minOrder) {
    return { ok: false, reason: "minOrder", minOrder: promo.minOrder };
  }
  const discount = promo.type === "percent"
    ? Math.round((subtotal * promo.value) / 100)
    : Math.min(promo.value, subtotal);
  return { ok: true, promo: { ...promo, code: normalized }, discount };
}

/* -------------------------------- orders ------------------------------- */

function orderCodeFrom(list) {
  const max = list.reduce((best, order) => {
    const n = parseInt(String(order.code || "").replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? Math.max(best, n) : best;
  }, 9030);
  return `${APP.orderPrefix}-${max + 1}`;
}

export function listDemoOrders() {
  const seeded = demo.ORDERS.map((order) => ({ ...order }));
  const stored = readLS(LS.orders, null);
  return stored || seeded;
}

/**
 * Persists an order. Firestore assigns a human WA-#### code inside a
 * transaction so two simultaneous checkouts never collide.
 */
export async function createOrder(payload) {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const { doc, collection, runTransaction, serverTimestamp } = firestoreMod;
    let code = "";
    await runTransaction(db, async (transaction) => {
      const counterRef = doc(db, "counters", "orders");
      const counter = await transaction.get(counterRef);
      const next = (counter.exists() ? counter.data().value : 9000) + 1;
      transaction.set(counterRef, { value: next }, { merge: true });
      code = `${APP.orderPrefix}-${next}`;
    });
    const ref = doc(collection(db, "orders"));
    const order = {
      code,
      customer: payload.customer,
      items: payload.items,
      subtotal: payload.subtotal,
      discount: payload.discount || 0,
      shipping: payload.shipping || 0,
      total: payload.total,
      promoCode: payload.promoCode || null,
      status: "new_inquiry",
      paymentMethod: payload.paymentMethod || "mtn_momo",
      paymentStatus: "pending",
      courier: null,
      assignedTo: null,
      source: payload.source || "web",
      events: [{
        type: "created",
        label: "Commande créée via WhatsApp",
        actor: payload.customer?.name || "Client",
        at: firestoreMod.Timestamp.now(),
      }],
      messages: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await firestoreMod.setDoc(ref, order);
    return { id: ref.id, ...order, createdAt: Date.now() };
  }

  // Demo mode: persist locally so the admin pipeline updates instantly.
  const orders = listDemoOrders();
  const order = {
    id: `demo-${Date.now()}`,
    code: orderCodeFrom(orders),
    ...payload,
    status: "new_inquiry",
    paymentStatus: "pending",
    courier: null,
    assignedTo: null,
    source: payload.source || "web",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [{ at: Date.now(), actor: payload.customer?.name || "Client", type: "created", label: "Commande créée via WhatsApp" }],
    messages: [],
  };
  writeLS(LS.orders, [order, ...orders]);
  toastOrderChange();
  return order;
}

/** Realtime order feed. Returns an unsubscribe function. */
export function watchOrders(callback) {
  if (isFirebaseConfigured) {
    let unsubscribe = () => {};
    getFirebase().then(({ db, firestoreMod }) => {
      const { collection, onSnapshot, orderBy, query } = firestoreMod;
      unsubscribe = onSnapshot(
        query(collection(db, "orders"), orderBy("createdAt", "desc")),
        (snapshot) => {
          const orders = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
          callback(orders);
        },
        (error) => console.error("orders stream", error),
      );
    });
    return () => unsubscribe();
  }

  const emit = () => callback(listDemoOrders());
  emit();
  window.addEventListener("demo-orders", emit);
  window.addEventListener("storage", emit);
  const timer = setInterval(emit, 15000); // keeps relative timestamps honest
  return () => {
    window.removeEventListener("demo-orders", emit);
    window.removeEventListener("storage", emit);
    clearInterval(timer);
  };
}

export async function updateOrder(orderId, patch, event) {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const { doc, updateDoc, serverTimestamp, arrayUnion, Timestamp } = firestoreMod;
    const next = { ...patch, updatedAt: serverTimestamp() };
    if (event) next.events = arrayUnion({ ...event, at: Timestamp.now() });
    await updateDoc(doc(db, "orders", orderId), next);
    return;
  }

  const orders = listDemoOrders();
  const next = orders.map((order) => {
    if (order.id !== orderId) return order;
    return {
      ...order,
      ...patch,
      updatedAt: Date.now(),
      events: event ? [...(order.events || []), { ...event, at: Date.now() }] : order.events || [],
    };
  });
  writeLS(LS.orders, next);
  toastOrderChange();
}

export async function addOrderNote(orderId, text, actor) {
  const note = { type: "note", label: text, actor };
  await updateOrder(orderId, {}, note);
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    await firestoreMod.updateDoc(firestoreMod.doc(db, "orders", orderId), {
      messages: firestoreMod.arrayUnion({
        text,
        actor,
        at: firestoreMod.Timestamp.now(),
      }),
      updatedAt: firestoreMod.serverTimestamp(),
    });
  } else {
    const orders = listDemoOrders();
    writeLS(LS.orders, orders.map((order) =>
      order.id === orderId
        ? { ...order, messages: [...(order.messages || []), { at: Date.now(), actor, text }] }
        : order,
    ));
    toastOrderChange();
  }
}

export async function getOrdersForCustomer(uid, phone) {
  if (isFirebaseConfigured && uid) {
    const { db, firestoreMod } = await getFirebase();
    const { collection, getDocs, query, where } = firestoreMod;
    const snap = await getDocs(query(collection(db, "orders"), where("customer.uid", "==", uid)));
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  const normalized = String(phone || "").replace(/\D/g, "");
  return listDemoOrders().filter((order) => {
    if (uid && order.customer?.uid && order.customer.uid === uid) return true;
    return normalized
      && String(order.customer?.phone || "").replace(/\D/g, "").endsWith(normalized.slice(-9));
  });
}

/* ------------------------------- products ------------------------------ */

export async function saveProduct(product) {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const { doc, collection, setDoc, updateDoc, serverTimestamp } = firestoreMod;
    if (product.id) {
      const { id, ...data } = product;
      await updateDoc(doc(db, "products", id), { ...data, updatedAt: serverTimestamp() });
      state.products = state.products.map((item) => (item.id === id ? { ...item, ...data } : item));
      return id;
    }
    const ref = doc(collection(db, "products"));
    await setDoc(ref, { ...product, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    state.products = [{ ...product, id: ref.id }, ...state.products];
    return ref.id;
  }

  const stored = readLS(LS.products, null) || demo.PRODUCTS;
  let next;
  let id = product.id;
  if (id) {
    next = stored.map((item) => (item.id === id ? { ...item, ...product } : item));
  } else {
    id = `local-${Date.now()}`;
    next = [{ ...product, id, createdAt: Date.now() }, ...stored];
  }
  writeLS(LS.products, next);
  state.products = next.map(withHubs).filter((item) => item.isActive !== false);
  return id;
}

export async function deleteProduct(productId) {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const snapshot = await firestoreMod.getDoc(firestoreMod.doc(db, "products", productId));
    const publicIds = snapshot.exists()
      ? (snapshot.data().images || []).map((image) => image.publicId).filter(Boolean)
      : [];

    await firestoreMod.deleteDoc(firestoreMod.doc(db, "products", productId));

    if (publicIds.length) {
      try {
        const { functions, functionsMod } = await getFirebase();
        const callable = functionsMod.httpsCallable(functions, "deleteCloudinaryImage");
        await Promise.allSettled(publicIds.map((publicId) => callable({ publicId })));
      } catch (error) {
        console.warn("Cloudinary cleanup skipped", error);
      }
    }
  } else {
    const stored = readLS(LS.products, null) || demo.PRODUCTS;
    writeLS(LS.products, stored.filter((item) => item.id !== productId));
  }
  state.products = state.products.filter((item) => item.id !== productId);
}

export async function setProductsActive(ids, isActive) {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    await Promise.all(ids.map((id) => firestoreMod.updateDoc(firestoreMod.doc(db, "products", id), { isActive })));
  } else {
    const stored = readLS(LS.products, null) || demo.PRODUCTS;
    writeLS(LS.products, stored.map((item) => (ids.includes(item.id) ? { ...item, isActive } : item)));
  }
  state.products = state.products
    .map((item) => (ids.includes(item.id) ? { ...item, isActive } : item))
    .filter((item) => item.isActive !== false);
}

/** Updates a single condition stock (inventory page). */
export async function setConditionStock(productId, condition, value) {
  let product = getProduct(productId);
  if (!product && isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const snapshot = await firestoreMod.getDoc(firestoreMod.doc(db, "products", productId));
    product = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  }
  if (!product) {
    product = (readLS(LS.products, null) || demo.PRODUCTS).find((item) => item.id === productId);
  }
  if (!product) return;
  const stock = Math.max(0, Math.round(Number(value) || 0));
  const conditions = {
    ...product.conditions,
    [condition]: { ...product.conditions[condition], stock },
  };
  const hubs = { ...product.hubs, [condition]: splitHubs(stock) };
  const patch = { conditions, hubs };

  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    await firestoreMod.updateDoc(firestoreMod.doc(db, "products", productId), patch);
  } else {
    const stored = readLS(LS.products, null) || demo.PRODUCTS;
    writeLS(LS.products, stored.map((item) => (item.id === productId ? { ...item, ...patch } : item)));
  }
  state.products = state.products.map((item) => (item.id === productId ? { ...item, ...patch } : item));
}

/* -------------------------------- staff -------------------------------- */

export function listStaff() {
  return readLS(LS.staff, demo.STAFF);
}

/** Staff directory — Firestore `staff` collection or the demo store. */
export async function listStaffAccounts() {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const snapshot = await firestoreMod.getDocs(firestoreMod.collection(db, "staff"));
    return snapshot.docs
      .map((document) => ({ uid: document.id, ...document.data() }))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }
  return listStaff();
}

export async function provisionStaffAccount(member) {
  if (isFirebaseConfigured) {
    const { functions, functionsMod } = await getFirebase();
    const callable = functionsMod.httpsCallable(functions, "provisionStaff");
    const result = await callable({
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      status: member.status,
    });
    return { ...member, uid: result.data?.uid || member.email };
  }
  return addStaffMember(member);
}

export async function updateStaffAccount(uid, patch) {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    await firestoreMod.updateDoc(firestoreMod.doc(db, "staff", uid), patch);
    return;
  }
  saveStaffMember({ uid, ...patch });
}

/** Sends the Firebase password-reset email (demo mode simulates success). */
export async function sendStaffReset(email) {
  if (isFirebaseConfigured) {
    const { auth, authMod } = await getFirebase();
    await authMod.sendPasswordResetEmail(auth, email);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

export function saveStaffMember(member) {
  const staff = listStaff();
  writeLS(LS.staff, staff.map((item) => (item.uid === member.uid ? { ...item, ...member } : item)));
}

export function addStaffMember(member) {
  const staff = listStaff();
  const record = {
    uid: `local-${Date.now()}`,
    status: "staged",
    failedLogins: 0,
    lastActiveAt: null,
    tier: 1,
    ...member,
  };
  writeLS(LS.staff, [record, ...staff]);
  return record;
}

export function listAuditLogs() {
  return readLS(LS.audit, demo.AUDIT_LOGS);
}

export async function fetchAuditLogs(limit = 60) {
  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const snapshot = await firestoreMod.getDocs(
      firestoreMod.query(
        firestoreMod.collection(db, "auditLogs"),
        firestoreMod.orderBy("at", "desc"),
        firestoreMod.limit(limit),
      ),
    );
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  }
  return listAuditLogs().slice(0, limit);
}

export async function appendAuditLog(entry) {
  const record = { at: Date.now(), actor: "Système", severity: "info", ...entry };

  if (isFirebaseConfigured) {
    const { db, firestoreMod } = await getFirebase();
    const ref = await firestoreMod.addDoc(firestoreMod.collection(db, "auditLogs"), {
      ...record,
      at: firestoreMod.serverTimestamp(),
    });
    return { id: ref.id, ...record };
  }

  const logs = listAuditLogs();
  const stored = { id: `a-${Date.now()}`, ...record };
  writeLS(LS.audit, [stored, ...logs]);
  return stored;
}
