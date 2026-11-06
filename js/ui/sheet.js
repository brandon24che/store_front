/* ==========================================================================
   Sheets & modals — accessible scrim, focus restore, ESC and scroll lock.
   ========================================================================== */

let scrim = null;
let openEl = null;
let lastFocus = null;

function ensureScrim() {
  if (scrim && document.body.contains(scrim)) return scrim;
  scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.addEventListener("click", closeSheet);
  document.body.append(scrim);
  return scrim;
}

function focusables(root) {
  return [...root.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((node) => !node.disabled && node.offsetParent !== null);
}

function onKeydown(event) {
  if (!openEl) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSheet();
    return;
  }
  if (event.key !== "Tab") return;
  const items = focusables(openEl);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openSheet(target) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return;
  if (openEl && openEl !== el) closeSheet();

  lastFocus = document.activeElement;
  openEl = el;
  ensureScrim().classList.add("is-open");
  el.classList.add("is-open");
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
  document.addEventListener("keydown", onKeydown);

  const heading = el.querySelector("h2, h3, .sheet__title");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    requestAnimationFrame(() => heading.focus({ preventScroll: true }));
  }
}

export function closeSheet(target) {
  const el = target ? (typeof target === "string" ? document.getElementById(target) : target) : openEl;
  if (!el) return;
  el.classList.remove("is-open");
  el.setAttribute("aria-hidden", "true");
  openEl = null;
  ensureScrim().classList.remove("is-open");
  document.body.classList.remove("no-scroll");
  document.removeEventListener("keydown", onKeydown);
  if (lastFocus?.focus) lastFocus.focus({ preventScroll: true });
}

export function isOpen(target) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  return Boolean(el?.classList.contains("is-open"));
}

/** Wires every [data-sheet-open] / [data-sheet-close] pair in a scope. */
export function bindSheetTriggers(scope = document) {
  scope.querySelectorAll("[data-sheet-open]").forEach((trigger) => {
    trigger.addEventListener("click", () => openSheet(trigger.dataset.sheetOpen));
  });
  scope.querySelectorAll("[data-sheet-close]").forEach((trigger) => {
    trigger.addEventListener("click", () => closeSheet());
  });
}
