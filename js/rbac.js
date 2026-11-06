/* ==========================================================================
   RBAC — role → permission matrix shared by the UI and used by every admin
   route guard. Firestore rules enforce the same capabilities server-side.
   ========================================================================== */

import { getStaffSession } from "./auth.js";

export const ROLES = {
  super_admin: {
    label: "Super Admin",
    tier: 4,
    permissions: ["*"],
  },
  store_admin: {
    label: "Store Admin",
    tier: 1,
    permissions: [
      "orders.read", "orders.update", "orders.dispatch",
      "products.read", "products.write",
      "inventory.read", "inventory.write",
    ],
  },
  inventory_manager: {
    label: "Inventory Manager",
    tier: 2,
    permissions: ["orders.read", "orders.confirmStock", "products.read", "products.write", "inventory.read", "inventory.write"],
  },
  order_manager: {
    label: "Order Manager",
    tier: 2,
    permissions: ["orders.read", "orders.update", "orders.confirmStock", "orders.recordPayment", "orders.dispatch"],
  },
  support_agent: {
    label: "Support Agent",
    tier: 1,
    permissions: ["orders.read", "orders.note", "orders.chat"],
  },
  delivery_manager: {
    label: "Delivery Manager",
    tier: 1,
    permissions: ["orders.read", "orders.dispatch", "orders.deliver"],
  },
};

export const ROLE_IDS = Object.keys(ROLES);

export function permissionsOf(role) {
  return ROLES[role]?.permissions || [];
}

export function can(role, permission) {
  const permissions = permissionsOf(role);
  return permissions.includes("*") || permissions.includes(permission);
}

/** Human summary used on the staff directory cards. */
export function permissionSummary(role) {
  const labels = {
    "orders.read": "Orders: Read",
    "orders.update": "Orders: Write",
    "orders.confirmStock": "Stock: Confirm",
    "orders.recordPayment": "Wire: Verify",
    "orders.dispatch": "Dispatch: Send",
    "orders.deliver": "Delivery: Complete",
    "orders.note": "Notes: Write",
    "orders.chat": "Chat: Reply",
    "products.read": "Catalog: Read",
    "products.write": "Catalog & Pricing: Write",
    "inventory.read": "Inventory: Read",
    "inventory.write": "Inventory: Write",
  };
  if (can(role, "*")) return ["Full system access", "Staff provisioning", "Audit log"];
  return permissionsOf(role).map((permission) => labels[permission] || permission);
}

export async function requireStaff(required = "orders.read") {
  const session = await getStaffSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
    location.replace(`login.html?next=${next}`);
    return null;
  }
  if (!can(session.role, required)) {
    return { denied: true, session };
  }
  return session;
}

export function roleLabel(role) {
  return ROLES[role]?.label || role;
}
