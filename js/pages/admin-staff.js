/* ==========================================================================
   Admin staff — Super Admin provisioning, RBAC directory and audit log.
   ========================================================================== */

import {
  listStaffAccounts, provisionStaffAccount, updateStaffAccount, sendStaffReset,
  fetchAuditLogs, appendAuditLog,
} from "../store.js";
import { requireStaff, ROLES, ROLE_IDS, roleLabel, permissionSummary } from "../rbac.js";
import { mountAdminShell } from "../ui/nav.js";
import { openSheet, closeSheet, bindSheetTriggers } from "../ui/sheet.js";
import { toast } from "../ui/toast.js";
import { t, onLangChange } from "../i18n.js";
import { esc, timeAgo, isValidCameroonPhone, normalizePhone, formatNumber } from "../format.js";
import { pageHead, kpi, emptyBlock, deniedBlock, avatar, stamp } from "../admin/ui.js";

const $ = (selector) => document.querySelector(selector);
const root = () => $("#staff-root");

const state = {
  session: null,
  staff: [],
  logs: [],
  query: "",
  role: "all",
  logLimit: 8,
};

/* -------------------------------- helpers ------------------------------- */

function isSuper() {
  return state.session?.role === "super_admin";
}

function statusTone(status) {
  if (status === "suspended") return "danger";
  if (status === "staged") return "warning";
  return "success";
}

function filteredStaff() {
  const needle = state.query.trim().toLowerCase();
  return state.staff
    .filter((member) => state.role === "all" || member.role === state.role)
    .filter((member) => {
      if (!needle) return true;
      return [member.name, member.email, member.phone, roleLabel(member.role)]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
}

function activeNow(member) {
  return member.status === "active" && stamp(member.lastActiveAt) >= Date.now() - 15 * 60000;
}

function roleOptions(selected) {
  return ROLE_IDS.map((role) => `<option value="${role}" ${selected === role ? "selected" : ""}>${esc(roleLabel(role))}</option>`).join("");
}

/* -------------------------------- markup -------------------------------- */

function bannerMarkup() {
  return `<section class="super-banner">
    <span class="super-banner__tag"><span class="material-symbols-outlined">verified_user</span>${t("admin.staff.superBanner")}</span>
    <b>${esc(t("admin.staff.policy"))}</b>
    <p>${esc(t("admin.staff.policyText"))}</p>
    <div class="super-banner__meta">
      <span><span class="material-symbols-outlined">person</span>${esc(t("admin.staff.session", { name: state.session.name }))}</span>
      <span><span class="material-symbols-outlined">lock</span>${t("admin.staff.zeroBypass")}</span>
      <span><span class="material-symbols-outlined">groups</span>${formatNumber(state.staff.length)} ${t("admin.staff.synced")}</span>
    </div>
  </section>`;
}

function provisionMarkup() {
  return `<section class="admin-panel staff-provision">
    <div class="admin-panel__head">
      <h2 class="admin-panel__title"><span class="material-symbols-outlined">person_add</span>${t("admin.staff.provision")}</h2>
      <span class="badge badge--outline">${t("admin.staff.adminOnly")}</span>
    </div>
    <form class="admin-form staff-form" id="staff-form" novalidate>
      <div class="field">
        <label class="field__label" for="sf-name">${t("admin.staff.fullName")}</label>
        <input class="input" id="sf-name" name="name" type="text" autocomplete="off" required>
      </div>
      <div class="field">
        <label class="field__label" for="sf-email">${t("admin.staff.email")}</label>
        <input class="input" id="sf-email" name="email" type="email" autocomplete="off" required>
      </div>
      <div class="field">
        <label class="field__label" for="sf-phone">${t("admin.staff.phone")}</label>
        <input class="input" id="sf-phone" name="phone" type="tel" autocomplete="off" placeholder="+237 6XX XX XX XX">
      </div>
      <div class="field">
        <label class="field__label" for="sf-role">${t("admin.staff.role")}</label>
        <select class="input" id="sf-role" name="role">${roleOptions("order_manager")}</select>
      </div>
      <div class="field">
        <label class="field__label" for="sf-status">${t("admin.staff.status")}</label>
        <select class="input" id="sf-status" name="status">
          <option value="active">${t("admin.staff.active")}</option>
          <option value="staged" selected>${t("admin.staff.staged")}</option>
        </select>
      </div>
      <label class="switch-row">
        <span>${t("admin.staff.autoInvite")}</span>
        <label class="switch"><input type="checkbox" name="notify" checked></label>
      </label>      <div class="admin-login__error" id="staff-error" role="alert" hidden></div>
      <button class="btn btn--primary btn--block" type="submit" id="staff-save">
        <span class="material-symbols-outlined">person_add</span>${t("admin.staff.create")}
      </button>
    </form>
  </section>`;
}

function cardMarkup(member) {
  const summary = permissionSummary(member.role);
  const self = member.uid === state.session.uid;
  const suspended = member.status === "suspended";
  return `<article class="staff-card ${suspended ? "staff-card--suspended" : ""}">
    <div class="staff-card__top">
      ${avatar(member.name || member.email, "avatar")}
      <div>
        <span class="staff-card__name">${esc(member.name || "—")}</span>
        <span class="staff-card__email">${esc(member.email)}</span>
      </div>
    </div>
    <div class="staff-card__meta">
      <span class="badge badge--primary">${esc(roleLabel(member.role))}</span>
      <span class="badge badge--${statusTone(member.status)}">${t(`admin.staff.${member.status === "staged" ? "staged" : member.status}`)}</span>
      <span class="badge badge--outline">Tier ${Number(member.tier) || 1}</span>
      ${(member.hubs || []).map((hub) => `<span class="badge badge--outline">${esc(hub)}</span>`).join("")}
    </div>
    <div class="staff-card__meta">
      <span class="cell-sub">${esc(member.lastActiveAt ? t("admin.staff.lastActive", { time: timeAgo(stamp(member.lastActiveAt)) }) : t("admin.staff.staged"))}</span>
      ${member.failedLogins ? `<span class="badge badge--danger">${t("admin.staff.failedLogins", { n: member.failedLogins })}</span>` : ""}
    </div>
    <div class="staff-card__meta">
      <span class="cell-sub">${t("admin.staff.permissions")}:</span>
      ${summary.slice(0, 3).map((item) => `<span class="badge badge--outline">${esc(item)}</span>`).join("")}
      ${summary.length > 3 ? `<span class="badge badge--outline">+${summary.length - 3}</span>` : ""}
    </div>
    <div class="staff-card__actions">
      <button class="btn btn--ghost btn--sm" type="button" data-role="${esc(member.uid)}" ${self ? "disabled" : ""}>
        <span class="material-symbols-outlined">badge</span>${t("admin.staff.changeRole")}
      </button>
      <button class="btn btn--ghost btn--sm" type="button" data-reset="${esc(member.uid)}">
        <span class="material-symbols-outlined">key</span>${t("admin.staff.resetKey")}
      </button>
      <button class="btn btn--ghost btn--sm" type="button" data-status="${esc(member.uid)}" ${self ? "disabled" : ""}>
        <span class="material-symbols-outlined">${suspended ? "undo" : "block"}</span>${suspended ? t("admin.staff.reinstate") : t("admin.staff.suspend")}
      </button>
    </div>
  </article>`;
}

function directoryMarkup() {
  const roleChips = [{ id: "all", label: t("admin.staff.rolesTabs.all") }, ...ROLE_IDS.map((role) => ({ id: role, label: roleLabel(role) }))]
    .map((chip) => `<button type="button" class="chip ${state.role === chip.id ? "is-active" : ""}" data-role-filter="${chip.id}">${esc(chip.label)}</button>`)
    .join("");

  return `<section class="admin-panel">
    <div class="admin-panel__head">
      <h2 class="admin-panel__title"><span class="material-symbols-outlined">manage_accounts</span>${t("admin.staff.directory")}</h2>
      <span class="admin-panel__count" id="staff-count"></span>
    </div>
    <div class="admin-toolbar">
      <div class="admin-search">
        <span class="material-symbols-outlined">search</span>
        <input id="staff-search" type="search" value="${esc(state.query)}" placeholder="${t("admin.staff.search")}" aria-label="${t("admin.staff.search")}">
      </div>
    </div>
    <div class="admin-filter-chips" role="group" aria-label="${t("admin.staff.role")}">${roleChips}</div>
    <div class="staff-grid" id="staff-grid"></div>
  </section>`;
}

function auditMarkup() {
  return `<section class="admin-panel staff-audit">
    <div class="admin-panel__head">
      <h2 class="admin-panel__title"><span class="material-symbols-outlined">policy</span>${t("admin.staff.audit")}</h2>
      <button class="btn btn--ghost btn--sm" type="button" id="audit-export">
        <span class="material-symbols-outlined">download</span>${t("admin.staff.exportCsv")}
      </button>
    </div>
    <div class="audit-list" id="audit-list"></div>
    <div class="admin-panel__head" style="border-top:1px solid var(--divider);border-bottom:0">
      <span class="admin-panel__count" id="audit-count"></span>
      <button class="btn btn--ghost btn--sm" type="button" id="audit-more">${t("admin.staff.loadOlder")}</button>
    </div>
  </section>`;
}

/* ------------------------------- rendering ------------------------------ */

function renderKpis() {
  const host = $("#staff-kpis");
  if (!host) return;
  const active = state.staff.filter(activeNow).length;
  const suspended = state.staff.filter((member) => member.status === "suspended").length;
  host.innerHTML = [
    kpi({ icon: "groups", label: t("admin.staff.total"), value: state.staff.length, meta: t("admin.staff.acrossHubs") }),
    kpi({ icon: "sensors", label: t("admin.staff.activeNow"), value: active, meta: t("admin.staff.realtime"), tone: "success" }),
    kpi({ icon: "block", label: t("admin.staff.suspended"), value: suspended, meta: t("admin.staff.security"), tone: suspended ? "danger" : "" }),
    kpi({ icon: "shield_person", label: t("admin.staff.roles"), value: ROLE_IDS.length, meta: t("admin.staff.zeroBypass"), tone: "teal" }),
  ].join("");
}

function renderGrid() {
  const host = $("#staff-grid");
  if (!host) return;
  const members = filteredStaff();
  host.innerHTML = members.length
    ? members.map(cardMarkup).join("")
    : emptyBlock({ icon: "manage_accounts", title: t("admin.staff.empty") });

  const count = $("#staff-count");
  if (count) count.textContent = `${members.length} / ${state.staff.length} ${t("admin.staff.synced")}`;
}

function renderAudit() {
  const host = $("#audit-list");
  if (!host) return;
  const rows = state.logs.slice(0, state.logLimit);
  host.innerHTML = rows.length
    ? rows.map((entry) => `<div class="audit-row">
        <span class="audit-dot audit-dot--${esc(entry.severity || "info")}"></span>
        <div class="audit-body">
          <strong>${esc(entry.actor || "—")} · ${esc(entry.action || "")}</strong>
          <p>${esc(entry.target || "")}</p>
          <time>${esc(timeAgo(stamp(entry.at)))}</time>
        </div>
      </div>`).join("")
    : emptyBlock({ icon: "policy", title: t("admin.staff.noEvents") });

  const count = $("#audit-count");
  if (count) count.textContent = `${formatNumber(rows.length)} / ${formatNumber(state.logs.length)}`;
  const more = $("#audit-more");
  if (more) more.hidden = state.logs.length <= state.logLimit;
}

function syncRoleChips() {
  document.querySelectorAll("[data-role-filter]").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.roleFilter === state.role);
  });
}

/* -------------------------------- actions ------------------------------- */

async function refreshData() {
  const [staff, logs] = await Promise.all([listStaffAccounts(), fetchAuditLogs(100)]);
  state.staff = staff;
  state.logs = logs;
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

function openRoleSheet(uid) {
  const member = state.staff.find((entry) => entry.uid === uid);
  if (!member || member.uid === state.session.uid) {
    toast(t("admin.staff.cannotSelf"), "error");
    return;
  }

  const sheet = showSheet(`<div class="sheet sheet--center" id="role-sheet" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="role-title">
    <div class="sheet__handle"></div>
    <div class="sheet__head">
      <div>
        <p class="admin-head__eyebrow">${t("admin.staff.title")}</p>
        <h2 class="sheet__title" id="role-title">${t("admin.staff.changeRole")}</h2>
      </div>
      <button class="icon-btn" type="button" data-sheet-close aria-label="${t("common.close")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="sheet__body">
      <p class="cell-sub" style="margin-bottom:10px">${esc(member.name)} · ${esc(member.email)}</p>
      <div class="staff-role" id="role-options">
        ${ROLE_IDS.map((role) => `<label>
          <input type="radio" name="role" value="${role}" ${member.role === role ? "checked" : ""}>
          <span><b>${esc(roleLabel(role))}</b><br><small>${esc(permissionSummary(role).slice(0, 2).join(" · "))}</small></span>
        </label>`).join("")}
      </div>
    </div>
    <div class="sheet__foot">
      <button class="btn btn--ghost" type="button" data-sheet-close>${t("common.cancel")}</button>
      <button class="btn btn--primary" type="button" id="role-save">
        <span class="material-symbols-outlined">check</span>${t("common.save")}
      </button>
    </div>
  </div>`);

  sheet?.querySelector("#role-save")?.addEventListener("click", async () => {
    const selected = sheet.querySelector('input[name="role"]:checked')?.value;
    if (!selected) return;
    const button = sheet.querySelector("#role-save");
    button?.classList.add("is-loading");
    if (button) button.disabled = true;
    try {
      await updateStaffAccount(member.uid, { role: selected, tier: ROLES[selected]?.tier || 1 });
      await appendAuditLog({
        actor: state.session.name,
        action: "Role updated",
        target: `${member.name}: ${roleLabel(member.role)} → ${roleLabel(selected)}`,
        severity: "info",
        kind: "staff",
      });
      await refreshData();
      closeSheet();
      renderKpis();
      renderGrid();
      renderAudit();
      toast(t("admin.staff.roleUpdated"), "success");
    } catch (error) {
      console.error(error);
      toast(t("common.retry"), "error");
    } finally {
      button?.classList.remove("is-loading");
      if (button) button.disabled = false;
    }
  });
}

async function resetKey(uid) {
  const member = state.staff.find((entry) => entry.uid === uid);
  if (!member) return;
  try {
    await sendStaffReset(member.email);
    await appendAuditLog({
      actor: state.session.name,
      action: "Password reset requested",
      target: `${member.name} (${member.email})`,
      severity: "warning",
      kind: "staff",
    });
    state.logs = await fetchAuditLogs(100);
    renderAudit();
    toast(t("admin.staff.resetSent"), "success");
  } catch (error) {
    console.error(error);
    toast(t("common.retry"), "error");
  }
}

async function toggleStatus(uid) {
  const member = state.staff.find((entry) => entry.uid === uid);
  if (!member) return;
  if (member.uid === state.session.uid) {
    toast(t("admin.staff.cannotSelf"), "error");
    return;
  }
  const suspend = member.status !== "suspended";
  if (suspend && !window.confirm(t("admin.staff.confirmSuspend"))) return;

  try {
    await updateStaffAccount(member.uid, { status: suspend ? "suspended" : "active" });
    await appendAuditLog({
      actor: state.session.name,
      action: suspend ? "Account suspended" : "Account reinstated",
      target: `${member.name} (${roleLabel(member.role)})`,
      severity: suspend ? "warning" : "success",
      kind: "staff",
    });
    await refreshData();
    renderKpis();
    renderGrid();
    renderAudit();
    toast(t("admin.staff.updated"), "success");
  } catch (error) {
    console.error(error);
    toast(t("common.retry"), "error");
  }
}

function exportCsv() {
  const header = ["id", "date", "actor", "action", "target", "severity"];
  const lines = state.logs.map((entry) => [
    entry.id || "",
    stamp(entry.at) ? new Date(stamp(entry.at)).toISOString() : "",
    entry.actor || "",
    entry.action || "",
    entry.target || "",
    entry.severity || "info",
  ]);
  const csv = [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `novatech-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------------- binding ------------------------------- */

function bindShell() {
  $("#staff-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderGrid();
  });

  document.querySelectorAll("[data-role-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.role = chip.dataset.roleFilter;
      syncRoleChips();
      renderGrid();
    });
  });

  $("#audit-more")?.addEventListener("click", () => {
    state.logLimit += 8;
    renderAudit();
  });

  $("#audit-export")?.addEventListener("click", exportCsv);

  $("#staff-grid")?.addEventListener("click", (event) => {
    const roleButton = event.target.closest("[data-role]");
    if (roleButton && !roleButton.disabled) return openRoleSheet(roleButton.dataset.role);
    const resetButton = event.target.closest("[data-reset]");
    if (resetButton) return resetKey(resetButton.dataset.reset);
    const statusButton = event.target.closest("[data-status]");
    if (statusButton && !statusButton.disabled) return toggleStatus(statusButton.dataset.status);
    return undefined;
  });

  $("#staff-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const error = $("#staff-error");
    const fail = (message) => {
      error.textContent = message;
      error.hidden = false;
    };

    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim().toLowerCase();
    const rawPhone = String(data.get("phone") || "").trim();
    const role = String(data.get("role") || "");
    const status = String(data.get("status") || "staged");

    if (name.length < 2) return fail(t("account.nameRequired"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(t("account.emailInvalid"));
    if (state.staff.some((member) => String(member.email).toLowerCase() === email)) return fail(t("admin.staff.emailTaken"));
    if (rawPhone && !isValidCameroonPhone(rawPhone)) return fail(t("account.phoneInvalid"));
    if (!ROLE_IDS.includes(role)) return fail(t("admin.staff.selectRole"));

    error.hidden = true;
    const button = $("#staff-save");
    button?.classList.add("is-loading");
    if (button) button.disabled = true;

    try {
      const member = await provisionStaffAccount({
        name,
        email,
        phone: rawPhone ? normalizePhone(rawPhone) : "",
        role,
        status,
      });
      let invited = false;
      if (data.get("notify")) {
        try {
          await sendStaffReset(email);
          invited = true;
        } catch (error) {
          console.warn("Activation email not sent", error);
        }
      }
      await appendAuditLog({
        actor: state.session.name,
        action: "Staff account provisioned",
        target: `${name} (${roleLabel(role)})${invited ? " — activation email sent" : ""}`,
        severity: "success",
        kind: "staff",
      });
      await refreshData();
      form.reset();
      $("#sf-role").value = "order_manager";
      $("#sf-status").value = "staged";
      renderKpis();
      renderGrid();
      renderAudit();
      toast(`${t("admin.staff.created")} · ${member.email}`, "success");
    } catch (error) {
      console.error(error);
      fail(t("common.retry"));
    } finally {
      button?.classList.remove("is-loading");
      if (button) button.disabled = false;
    }
  });
}

function renderShell() {
  root().innerHTML = `${pageHead({
    eyebrow: t("admin.title"),
    title: t("admin.staff.title"),
    sub: t("admin.staff.policyText"),
  })}
  ${bannerMarkup()}
  <div class="admin-kpis" id="staff-kpis"></div>
  <div class="staff-layout">
    ${provisionMarkup()}
    ${directoryMarkup()}
  </div>
  ${auditMarkup()}`;

  bindShell();
  renderKpis();
  renderGrid();
  renderAudit();
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const guard = await requireStaff("staff.write");
  if (!guard) return;

  const session = guard.denied ? guard.session : guard;
  state.session = session;
  mountAdminShell({ active: "staff", session });

  if (guard.denied || session.role !== "super_admin") {
    root().innerHTML = deniedBlock(t("admin.staff.noAccess"));
    return;
  }

  await refreshData();
  renderShell();

  onLangChange(() => {
    mountAdminShell({ active: "staff", session });
    renderShell();
  });
}

main().catch((error) => {
  console.error(error);
  const host = root();
  if (host) host.innerHTML = emptyBlock({ icon: "cloud_off", title: t("common.retry") });
});
