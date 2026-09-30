import { sfx } from "/sfx.js";

export const $ = (id) => document.getElementById(id);

export const S = {
  socket: null,
  BOARD: [],
  state: null,
  myId: null,
  roomId: null,
  busy: false, // true while the animation queue is playing
  pickingAppearance: false,
  hold: new Set(), // tile ids whose visuals wait for their animation event
  visual: new Map(), // playerId -> tile index currently shown on the board
  lastLogId: 0,
};

export const me = () => S.state?.players.find((p) => p.id === S.myId) || null;
export const playerById = (id) => S.state?.players.find((p) => p.id === id) || null;
export const isHost = () => !!S.state && S.state.hostId === S.myId;
export const isMyTurn = () => !!S.state && S.state.currentPlayerId === S.myId;

export function toast(message, kind = "info") {
  const host = $("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  if (kind === "error") sfx.error();
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3700);
  while (host.children.length > 4) host.firstElementChild.remove();
}

// Emit a socket action; failures show up as toasts.
export function act(event, payload = {}, done = null) {
  S.socket.emit(event, payload, (res) => {
    if (res && res.error) toast(res.error, "error");
    if (done) done(res);
  });
}

export function tweenNumber(el, to, ms = 700, prefix = "$") {
  const from = Number(el.dataset.value ?? to);
  el.dataset.value = String(to);
  if (from === to || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = `${prefix}${to.toLocaleString("en-US")}`;
    return;
  }
  const start = performance.now();
  const token = String(start);
  el.dataset.tween = token;
  el.classList.remove("bump-up", "bump-down");
  void el.offsetWidth;
  el.classList.add(to > from ? "bump-up" : "bump-down");
  const frame = (now) => {
    if (el.dataset.tween !== token) return;
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${prefix}${Math.round(from + (to - from) * eased).toLocaleString("en-US")}`;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function sessionId() {
  try {
    let id = sessionStorage.getItem("ccp:session");
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9_-]/g, "");
      sessionStorage.setItem("ccp:session", id);
    }
    return id;
  } catch {
    return "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export function savedName() {
  try { return localStorage.getItem("ccp:name") || ""; } catch { return ""; }
}
export function saveName(name) {
  try { localStorage.setItem("ccp:name", name); } catch { /* ignore */ }
}

export function money(n) { return `$${Number(n).toLocaleString("en-US")}`; }
