/* ==========================================================================
   Countdown — flash-deal timers
   ========================================================================== */

const timers = new Map();

function format(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0"));
}

export function startCountdown(node, endsAt) {
  if (!node || !endsAt) return;
  const stop = () => {
    const handle = timers.get(node);
    if (handle) clearInterval(handle);
    timers.delete(node);
  };
  stop();

  const tick = () => {
    const remaining = Number(endsAt) - Date.now();
    if (remaining <= 0) {
      node.textContent = "00:00:00";
      node.closest("[data-flash]")?.classList.add("is-ended");
      stop();
      return;
    }
    const parts = format(remaining);
    node.textContent = parts.join(":");
    node.setAttribute("datetime", `PT${Math.floor(remaining / 1000)}S`);
  };
  tick();
  timers.set(node, setInterval(tick, 1000));
}

/** Scans a subtree for [data-countdown] elements carrying data-ends. */
export function initCountdowns(scope = document) {
  scope.querySelectorAll("[data-countdown]").forEach((node) => {
    const ends = Number(node.dataset.ends);
    if (ends) startCountdown(node, ends);
  });
}
