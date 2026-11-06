/* ==========================================================================
   Auth — staff (email/password + custom claims) and optional customers.
   Demo mode mirrors the same shapes locally so guards behave identically.
   ========================================================================== */

import { isFirebaseConfigured } from "./config.js";
import { getFirebase } from "./firebase.js";
import { listStaff } from "./store.js";

const STAFF_KEY = "novatech.staff.session";
const CUSTOMER_KEY = "novatech.customer";
const DEMO_PASSWORD = "NovaTech2026!";
const SESSION_TTL = 8 * 3600 * 1000;

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

/* -------------------------------- staff -------------------------------- */

export async function signInStaff(email, password) {
  const normalized = String(email || "").trim().toLowerCase();

  if (isFirebaseConfigured) {
    const { auth, authMod } = await getFirebase();
    const credential = await authMod.signInWithEmailAndPassword(auth, normalized, password);
    const token = await credential.user.getIdTokenResult(true);
    const role = token.claims.role;
    if (!role) {
      await authMod.signOut(auth);
      throw new Error("no-role");
    }
    const session = {
      uid: credential.user.uid,
      email: credential.user.email,
      name: token.claims.name || credential.user.displayName || normalized,
      role,
      tier: token.claims.tier || 1,
      at: Date.now(),
    };
    localStorage.setItem(STAFF_KEY, JSON.stringify(session));
    return session;
  }

  const member = listStaff().find((item) => item.email.toLowerCase() === normalized);
  if (!member) throw new Error("invalid");
  if (member.status === "suspended") throw new Error("suspended");
  if (password !== DEMO_PASSWORD) throw new Error("invalid");

  const session = {
    uid: member.uid,
    email: member.email,
    name: member.name,
    role: member.role,
    tier: member.tier || 1,
    at: Date.now(),
  };
  localStorage.setItem(STAFF_KEY, JSON.stringify(session));
  return session;
}

export async function getStaffSession() {
  if (isFirebaseConfigured) {
    const { auth } = await getFirebase();
    const user = auth.currentUser;
    if (!user) {
      localStorage.removeItem(STAFF_KEY);
      return null;
    }
    const token = await user.getIdTokenResult(true);
    if (!token.claims.role) {
      localStorage.removeItem(STAFF_KEY);
      return null;
    }
    const session = {
      uid: user.uid,
      email: user.email,
      name: token.claims.name || user.displayName || user.email,
      role: token.claims.role,
      tier: token.claims.tier || 1,
      at: Date.now(),
    };
    localStorage.setItem(STAFF_KEY, JSON.stringify(session));
    return session;
  }

  const stored = readJSON(STAFF_KEY);
  if (stored && Date.now() - stored.at < SESSION_TTL) return stored;
  if (stored) localStorage.removeItem(STAFF_KEY);
  return null;
}

export function clearStaffSession() {
  localStorage.removeItem(STAFF_KEY);
}

/* ------------------------------- customer ------------------------------ */

export async function getCustomer() {
  if (isFirebaseConfigured) {
    const { auth } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return null;
    return { uid: user.uid, email: user.email, name: user.displayName || user.email, phone: "" };
  }
  return readJSON(CUSTOMER_KEY);
}

export async function signInCustomer(email, password) {
  if (password.length < 6) throw new Error("invalid");

  if (isFirebaseConfigured) {
    const { auth, authMod } = await getFirebase();
    const credential = await authMod.signInWithEmailAndPassword(auth, String(email).trim(), password);
    return { uid: credential.user.uid, email: credential.user.email, name: credential.user.displayName || email, phone: "" };
  }

  const existing = readJSON(CUSTOMER_KEY);
  const customer = existing && existing.email === email
    ? existing
    : { uid: `local-${Date.now()}`, email, name: email.split("@")[0], phone: "" };
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  return customer;
}

export async function signUpCustomer({ name, email, password, phone }) {
  if (password.length < 6) throw new Error("weak-password");

  if (isFirebaseConfigured) {
    const { auth, authMod, db, firestoreMod } = await getFirebase();
    const credential = await authMod.createUserWithEmailAndPassword(auth, String(email).trim(), password);
    await authMod.updateProfile(credential.user, { displayName: name });
    await firestoreMod.setDoc(firestoreMod.doc(db, "users", credential.user.uid), {
      name, email, phone, createdAt: firestoreMod.serverTimestamp(),
    });
    return { uid: credential.user.uid, email, name, phone };
  }

  const customer = { uid: `local-${Date.now()}`, email, name, phone };
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  return customer;
}

export async function signInWithGoogle() {
  if (!isFirebaseConfigured) {
    const customer = { uid: "local-google", email: "demo.client@gmail.com", name: "Awa Ngono", phone: "+237699000111" };
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
    return customer;
  }
  const { auth, authMod } = await getFirebase();
  const provider = new authMod.GoogleAuthProvider();
  const credential = await authMod.signInWithPopup(auth, provider);
  return {
    uid: credential.user.uid,
    email: credential.user.email,
    name: credential.user.displayName,
    phone: credential.user.phoneNumber || "",
  };
}

export async function signOutAll() {
  clearStaffSession();
  localStorage.removeItem(CUSTOMER_KEY);
  if (isFirebaseConfigured) {
    const { auth, authMod } = await getFirebase();
    await authMod.signOut(auth);
  }
}

export { DEMO_PASSWORD };
