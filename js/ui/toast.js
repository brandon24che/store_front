/* ==========================================================================
   Toast notifications
   ========================================================================== */

let stack = null;

function ensureStack() {
  if (stack && document.body.contains(stack)) return stack;
  stack = document.createElement("div");
  stack.className = "toast-stack";
  stack.setAttribute("role", "status");
  stack.setAttribute("aria-live", "polite");
  document.body.append(stack);
  return stack;
}

export function toast(message, type = "default") {
  const host = ensureStack();
  const node = document.createElement("div");
  node.className = `toast${type === "default" ? "" : ` toast--${type}`}`;
  const icon = type === "error" ? "error" : type === "success" ? "check_circle" : "bolt";
  node.innerHTML = `<span class="material-symbols-outlined">${icon}</span><span>${message}</span>`;
  host.append(node);

  const remove = () => {
    node.classList.add("is-leaving");
    setTimeout(() => node.remove(), 240);
  };
  const timer = setTimeout(remove, 3200);
  node.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}
