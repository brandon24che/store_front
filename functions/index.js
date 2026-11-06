/* ==========================================================================
   NovaTech Cloud Functions
   • provisionStaff        — Super Admin only; creates the Auth user, sets the
                             role claim and the staff document. No public
                             registration path exists.
   • deleteCloudinaryImage — removes a product image through the Cloudinary
                             Admin API. The API secret stays server-side.
   ========================================================================== */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const CLOUDINARY_CLOUD = defineSecret("CLOUDINARY_CLOUD_NAME");
const CLOUDINARY_KEY = defineSecret("CLOUDINARY_API_KEY");
const CLOUDINARY_SECRET = defineSecret("CLOUDINARY_API_SECRET");

const ROLE_TIERS = {
  super_admin: 4,
  store_admin: 1,
  inventory_manager: 2,
  order_manager: 2,
  support_agent: 1,
  delivery_manager: 1,
};

const PRODUCT_WRITERS = ["super_admin", "store_admin", "inventory_manager"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ------------------------------ provisioning ---------------------------- */

exports.provisionStaff = onCall({ region: "us-central1", maxInstances: 10 }, async (request) => {
  const caller = request.auth;
  if (!caller || caller.token.role !== "super_admin") {
    throw new HttpsError("permission-denied", "Only a Super Admin can provision staff accounts.");
  }

  const data = request.data || {};
  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const phone = String(data.phone || "").replace(/\D/g, "");
  const role = String(data.role || "");
  const status = data.status === "active" ? "active" : "staged";

  if (name.length < 2 || name.length > 80) {
    throw new HttpsError("invalid-argument", "A staff name is required.");
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email is required.");
  }
  if (!(role in ROLE_TIERS)) {
    throw new HttpsError("invalid-argument", "Unknown role.");
  }

  let user;
  try {
    user = await admin.auth().createUser({
      email,
      displayName: name,
      phoneNumber: phone.length >= 9 ? `+${phone}` : undefined,
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account already uses this email.");
    }
    logger.error("provisionStaff createUser", error);
    throw new HttpsError("internal", "Could not create the staff account.");
  }

  try {
    await admin.auth().setCustomUserClaims(user.uid, {
      role,
      tier: ROLE_TIERS[role],
      name,
    });

    await admin.firestore().doc(`staff/${user.uid}`).set({
      name,
      email,
      phone: phone || "",
      role,
      tier: ROLE_TIERS[role],
      status,
      failedLogins: 0,
      lastActiveAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: caller.uid,
    });

    const activationLink = await admin.auth().generatePasswordResetLink(email);

    return {
      uid: user.uid,
      email,
      role,
      status,
      activationLink,
    };
  } catch (error) {
    // Never leave an orphan Auth user without a staff profile.
    await admin.auth().deleteUser(user.uid).catch(() => {});
    logger.error("provisionStaff setup", error);
    throw new HttpsError("internal", "Could not finish provisioning the account.");
  }
});

/* ---------------------------- Cloudinary cleanup ------------------------ */

exports.deleteCloudinaryImage = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
    secrets: [CLOUDINARY_CLOUD, CLOUDINARY_KEY, CLOUDINARY_SECRET],
  },
  async (request) => {
    const caller = request.auth;
    if (!caller || !PRODUCT_WRITERS.includes(caller.token.role)) {
      throw new HttpsError("permission-denied", "Your role cannot delete catalog images.");
    }

    const publicId = String(request.data?.publicId || "");
    if (!publicId || publicId.length > 300 || publicId.includes("..")) {
      throw new HttpsError("invalid-argument", "A valid Cloudinary public id is required.");
    }
    if (!/^novatech\/[\w\-/.]+$/.test(publicId)) {
      throw new HttpsError("invalid-argument", "This asset is outside the NovaTech folder.");
    }

    const cloudName = CLOUDINARY_CLOUD.value();
    const credentials = Buffer.from(`${CLOUDINARY_KEY.value()}:${CLOUDINARY_SECRET.value()}`).toString("base64");
    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?public_ids[]=${encodeURIComponent(publicId)}`;

    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Cloudinary delete failed", { status: response.status, body });
      throw new HttpsError("internal", "Cloudinary rejected the deletion.");
    }

    const result = await response.json();
    return { publicId, result: result.deleted?.[publicId] || "not_found" };
  },
);
