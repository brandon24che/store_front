#!/usr/bin/env node
/* ==========================================================================
   NovaTech — Firestore seed.

   Upserts the demo catalog (categories, brands, products, promo codes), the
   staff directory, the order counter and the Super Admin Auth account using
   deterministic document ids, so re-running is safe.

   Usage
     GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run seed
     npm run seed:orders        # also imports the demo order pipeline
     npm run seed -- --dry-run  # print what would be written

   Against the emulator:
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run seed
   ========================================================================== */

import admin from "firebase-admin";
import { CATEGORIES, BRANDS, PRODUCTS, PROMO_CODES, STAFF, AUDIT_LOGS, ORDERS } from "../js/data/demo.js";

const args = process.argv.slice(2);
const withOrders = args.includes("--with-demo-orders");
const dryRun = args.includes("--dry-run");
const projectArg = args.find((arg) => arg.startsWith("--project="))?.split("=")[1];
const projectId = projectArg || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || "demo-novatech";

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!usingEmulator && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "\nMissing credentials.\n" +
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file, or run the\n" +
    "Firestore/Auth emulators and set FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST.\n",
  );
  process.exit(1);
}

admin.initializeApp(
  usingEmulator
    ? { projectId }
    : { credential: admin.credential.applicationDefault(), projectId },
);

const db = admin.firestore();
const { Timestamp } = admin.firestore;

const stamp = (millis) => Timestamp.fromMillis(Number(millis) || Date.now());
const strip = ({ id, uid, ...rest }) => rest;

function withHubs(product) {
  const hubs = {};
  for (const [condition, value] of Object.entries(product.conditions || {})) {
    const stock = Number(value?.stock) || 0;
    hubs[condition] = { douala: Math.ceil(stock * 0.6), yaounde: Math.floor(stock * 0.4) };
  }
  return { ...product, hubs };
}

async function writeDocs(collectionName, docs) {
  if (dryRun) return docs.length;

  let batch = db.batch();
  let pending = 0;
  let total = 0;

  for (const { id, data } of docs) {
    batch.set(db.collection(collectionName).doc(id), data);
    pending += 1;
    total += 1;
    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending) await batch.commit();
  return total;
}

function orderPayload(order) {
  return {
    ...strip(order),
    createdAt: stamp(order.createdAt),
    updatedAt: stamp(order.updatedAt),
    events: (order.events || []).map((event) => ({ ...event, at: stamp(event.at) })),
    messages: (order.messages || []).map((message) => ({ ...message, at: stamp(message.at) })),
  };
}

async function seedSuperAdmin() {
  const adminMember = STAFF[0];
  const targetUid = String(process.env.SEED_ADMIN_UID || "").trim();
  const email = (process.env.SEED_ADMIN_EMAIL || adminMember.email).trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "NovaTech2026!";

  if (dryRun) {
    return { uid: targetUid || "dry-run-admin", email, member: adminMember };
  }

  let user = null;
  let created = false;

  if (targetUid) {
    user = await admin.auth().getUser(targetUid).catch(() => null);
    if (!user) throw new Error(`SEED_ADMIN_UID ${targetUid} was not found in Firebase Auth.`);
  } else {
    user = await admin.auth().getUserByEmail(email).catch(() => null);
    if (!user) {
      user = await admin.auth().createUser({
        email,
        password,
        displayName: adminMember.name,
        emailVerified: true,
      });
      created = true;
    }
  }

  const name = user.displayName || adminMember.name;

  await admin.auth().setCustomUserClaims(user.uid, {
    role: "super_admin",
    tier: 4,
    name,
  });

  return { uid: user.uid, email: user.email || email, member: { ...adminMember, name }, created, password };
}

async function main() {
  const superAdmin = await seedSuperAdmin();

  const counts = {};
  counts.categories = await writeDocs("categories", CATEGORIES.map((category) => ({ id: category.id, data: strip(category) })));
  counts.brands = await writeDocs("brands", BRANDS.map((brand) => ({ id: brand.id, data: strip(brand) })));
  counts.products = await writeDocs("products", PRODUCTS.map((product) => ({ id: product.id, data: strip(withHubs(product)) })));
  counts.promoCodes = await writeDocs("promoCodes", Object.values(PROMO_CODES).map((promo) => ({ id: promo.code, data: promo })));

  const directory = [
    ...STAFF.slice(1).map((member) => ({ id: member.uid, data: strip(member) })),
    {
      id: superAdmin.uid,
      data: {
        ...strip(superAdmin.member),
        email: superAdmin.email,
        status: "active",
        failedLogins: 0,
        lastActiveAt: Date.now(),
      },
    },
  ];
  counts.staff = await writeDocs("staff", directory);

  counts.auditLogs = await writeDocs("auditLogs", [
    ...AUDIT_LOGS.map((entry) => ({
      id: entry.id,
      data: { ...strip(entry), at: stamp(entry.at) },
    })),
    {
      id: "seed-bootstrap",
      data: {
        actor: "System",
        action: "Database seeded",
        target: `Catalog ${PRODUCTS.length} products · ${STAFF.length} staff profiles${withOrders ? " · demo orders" : ""}`,
        severity: "success",
        kind: "system",
        at: Timestamp.now(),
      },
    },
  ]);

  let maxCode = 9000;
  if (withOrders) {
    counts.orders = await writeDocs("orders", ORDERS.map((order) => ({ id: order.id, data: orderPayload(order) })));
    maxCode = Math.max(maxCode, ...ORDERS.map((order) => Number(String(order.code).split("-")[1]) || 0));
  }

  if (!dryRun) {
    await db.doc("counters/orders").set({ value: maxCode }, { merge: true });
  }

  console.log(`\n${dryRun ? "DRY RUN — nothing written" : "Seed complete"} (${usingEmulator ? "emulator" : projectId})`);
  console.log(`  categories  ${counts.categories}`);
  console.log(`  brands      ${counts.brands}`);
  console.log(`  products    ${counts.products}`);
  console.log(`  promoCodes  ${counts.promoCodes}`);
  console.log(`  staff       ${counts.staff}`);
  console.log(`  auditLogs   ${counts.auditLogs}`);
  console.log(`  orders      ${counts.orders || 0}${withOrders ? "" : " (use --with-demo-orders)"}`);
  console.log(`  counter     ${maxCode}`);
  console.log(`\nSuper Admin  ${superAdmin.email}${superAdmin.created ? " (created)" : ""}`);
  if (!dryRun && !usingEmulator && superAdmin.created) {
    console.log(`Password     ${superAdmin.password}`);
    console.log("\nChange this password after the first sign-in.\n");
  } else if (!usingEmulator) {
    console.log("Password     unchanged (existing Auth user)\n");
  }
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message || error);
  process.exit(1);
});
