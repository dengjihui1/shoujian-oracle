const initialGate = document.querySelector(".entry-gate");
const gateTemplate = initialGate?.cloneNode(true);
const key = "shoujian:entry-gate:v1";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let activeGate = null;
let closeActiveGate = null;

function activeElement() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

function restoreFocus(previous) {
  const host = document.querySelector("shoujian-oracle");
  // The app can replace its shadow DOM while the entrance is open.
  const replacement = previous?.id
    ? host?.shadowRoot?.getElementById(previous.id)
    : previous?.dataset.action
      ? [...(host?.shadowRoot?.querySelectorAll("[data-action]") ?? [])].find((element) => element.dataset.action === previous.dataset.action)
      : null;
  const target = previous?.isConnected && previous !== document.body ? previous : replacement;
  if (target && !target.disabled && !target.closest("[inert]")) target.focus({ preventScroll: true });
  if (activeElement() !== target || !target) host?.focusComposer?.();
}

function showGate(gate = gateTemplate?.cloneNode(true)) {
  if (!gate || reducedMotion.matches) return;
  if (activeGate) {
    activeGate.querySelector("[data-enter-gate]")?.focus();
    return;
  }
  const previousFocus = activeElement();
  activeGate = gate;
  gate.hidden = false;
  gate.classList.remove("opening");
  gate.tabIndex = -1;
  if (!gate.isConnected) document.body.append(gate);
  const enter = gate.querySelector("[data-enter-gate]");
  let skip = gate.querySelector("[data-skip-gate]");
  if (!skip) {
    skip = document.createElement("button");
    skip.type = "button";
    skip.dataset.skipGate = "";
    skip.className = "gate-skip";
    skip.textContent = "跳过开场";
    (gate.querySelector(".gate-words") ?? gate).append(skip);
  }
  const background = [...document.body.children].filter((element) => element !== gate).map((element) => [element, element.inert]);
  for (const [element] of background) element.inert = true;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  let closing = false;
  let timer;
  let visibilityCheck;
  const finish = () => {
    if (activeGate !== gate) return;
    clearTimeout(timer);
    clearInterval(visibilityCheck);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("focusin", onFocus, true);
    gate.removeEventListener("animationend", onAnimationEnd);
    gate.remove();
    for (const [element, wasInert] of background) element.inert = wasInert;
    document.body.style.overflow = previousOverflow;
    activeGate = null;
    closeActiveGate = null;
    restoreFocus(previousFocus);
  };
  const open = (animate) => {
    try { sessionStorage.setItem(key, "seen"); } catch { /* entry works without storage */ }
    if (!animate || reducedMotion.matches) return finish();
    if (closing) return;
    closing = true;
    gate.classList.add("opening");
    timer = setTimeout(finish, 1300);
  };
  const onAnimationEnd = (event) => {
    if (closing && event.target === gate) finish();
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      open(false);
    } else if (event.key === "Tab") {
      const controls = [...gate.querySelectorAll("button:not(:disabled), a[href], [tabindex='0']")].filter((element) => !element.hidden);
      const current = controls.indexOf(document.activeElement);
      const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current + 1) % controls.length;
      event.preventDefault();
      (controls[next] ?? gate).focus();
    }
  };
  const onFocus = (event) => {
    if (!gate.contains(event.target)) (enter ?? gate).focus();
  };
  closeActiveGate = () => open(false);
  enter?.addEventListener("click", () => open(true));
  skip.addEventListener("click", () => open(false));
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("focusin", onFocus, true);
  gate.addEventListener("animationend", onAnimationEnd);
  // WebKit may apply the media-query CSS without delivering its change event.
  // A hidden modal must release inert and focus even when that event is lost.
  visibilityCheck = setInterval(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || getComputedStyle(gate).display === "none") open(false);
  }, 250);
  (enter ?? gate).focus();
}

let seen = false;
try { seen = sessionStorage.getItem(key) === "seen"; } catch { /* private storage may be unavailable */ }
if (initialGate && !seen && !reducedMotion.matches) showGate(initialGate);
else initialGate?.remove();

document.addEventListener("shoujian:replay-entry", () => showGate());
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) closeActiveGate?.();
});
