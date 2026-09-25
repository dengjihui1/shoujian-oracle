const gate = document.querySelector(".entry-gate");
const key = "shoujian:entry-gate:v1";
let seen = false;
try { seen = sessionStorage.getItem(key) === "seen"; } catch { /* private storage may be unavailable */ }

if (gate && !seen && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  gate.hidden = false;
  const enter = gate.querySelector("[data-enter-gate]");
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    try { sessionStorage.setItem(key, "seen"); } catch { /* animation remains usable */ }
    gate.classList.add("opening");
    setTimeout(() => gate.remove(), 1300);
  };
  enter.addEventListener("click", open);
  const onKey = (event) => {
    if (event.key === "Escape") open();
  };
  document.addEventListener("keydown", onKey);
  gate.addEventListener("animationend", () => document.removeEventListener("keydown", onKey), { once: true });
  setTimeout(open, 1700);
} else gate?.remove();
