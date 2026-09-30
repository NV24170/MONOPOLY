import { GROUP_TINT, COUNTRY_FLAGS, displayName, flagSvg, TILE_ART, esc } from "/ui-assets.js";

const $ = (id) => document.getElementById(id);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
export const skipMotion = () => document.hidden || !!(reduceQuery && reduceQuery.matches);

let boardEl = null;
let tokensLayer = null;
let fxLayer = null;
let U = 56; // one board unit in px (board width / 12)
const tokenEls = new Map(); // playerId -> element
const tokenPos = new Map(); // playerId -> { x, y } centre in board px
const moving = new Set(); // tokens currently mid-animation (layout must not touch them)
const resizeListeners = [];

export const unit = () => U;

// ---------- Board geometry ----------
export function sideOf(i) {
  if (i % 10 === 0) return "corner";
  if (i < 10) return "top";
  if (i < 20) return "right";
  if (i < 30) return "bottom";
  return "left";
}

function gridCell(i) {
  if (i === 0) return [1, 1];
  if (i < 10) return [1, i + 1];
  if (i === 10) return [1, 11];
  if (i < 20) return [i - 9, 11];
  if (i === 20) return [11, 11];
  if (i < 30) return [11, 31 - i];
  if (i === 30) return [11, 1];
  return [41 - i, 1];
}

const priceHTML = (amount, cls = "") => `<span class="price ${cls}">${amount}$</span>`;

function faceHTML(space, side) {
  const name = `<span class="name">${esc(displayName(space))}</span>`;
  let price = "";
  let art = "";
  let bld = "";
  switch (space.type) {
    case "property":
      art = `<span class="flag">${flagSvg(COUNTRY_FLAGS[space.name])}</span>`;
      price = priceHTML(space.price);
      bld = '<span class="bld"></span>';
      break;
    case "railroad":
      art = `<span class="art plane">${TILE_ART.plane}</span>`;
      price = priceHTML(space.price);
      break;
    case "utility":
      art = `<span class="art">${space.id === 28 ? TILE_ART.water : TILE_ART.bolt}</span>`;
      price = priceHTML(space.price);
      break;
    case "community_chest":
      art = `<span class="art">${TILE_ART.chest}</span>`;
      break;
    case "chance":
      art = `<span class="art">${TILE_ART.question}</span>`;
      break;
    case "tax":
      art = `<span class="art">${space.id === 38 ? TILE_ART.ring : TILE_ART.receipt}</span>`;
      price = priceHTML(space.amount, "tax");
      break;
    default:
      break;
  }
  // outer edge first (top/left/right faces are rotated in CSS so "top" of the face is the outer edge); bottom is inner-first
  const order = side === "bottom" ? [art, name, bld, price] : [price, bld, name, art];
  return `<div class="face">${order.join("")}</div><div class="owner-glow"></div><div class="mortgage-mark">Mortgaged</div>`;
}

function cornerHTML(space) {
  switch (space.id) {
    case 0:
      return `<div class="face corner-face start"><span class="start-word">START</span><span class="start-arrow">${TILE_ART.arrow}</span></div>`;
    case 10:
      return '<div class="face corner-face jail"><span class="jail-top">Passing by</span><div class="cage"></div><span class="jail-bottom">In Prison</span></div>';
    case 20:
      return `<div class="face corner-face vacation"><span class="art">${TILE_ART.palm}</span><span class="name">Vacation</span><span class="pot" id="vacationPot"></span></div>`;
    default:
      return `<div class="face corner-face gojail"><span class="art">${TILE_ART.skull}</span><span class="name">Go to prison</span></div>`;
  }
}

export function buildBoard(BOARD, onTileClick) {
  boardEl = $("board");
  tokensLayer = $("tokensLayer");
  fxLayer = $("fxLayer");
  const stage = $("centerStage");
  BOARD.forEach((space) => {
    const side = sideOf(space.id);
    const el = document.createElement("div");
    el.className = `tile t-${space.type} s-${side}`;
    el.id = `tile-${space.id}`;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", displayName(space));
    const [row, col] = gridCell(space.id);
    el.style.gridRow = String(row);
    el.style.gridColumn = String(col);
    if (space.group) el.style.setProperty("--tint", GROUP_TINT[space.group]);
    el.innerHTML = side === "corner" ? cornerHTML(space) : faceHTML(space, side);
    el.addEventListener("click", () => onTileClick(space.id));
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onTileClick(space.id); }
    });
    boardEl.insertBefore(el, stage);
  });
  const observer = new ResizeObserver(measure);
  observer.observe(boardEl);
  measure();
}

function measure() {
  if (!boardEl) return;
  const width = boardEl.clientWidth || 600;
  U = width / 12.4;
  boardEl.style.setProperty("--u", `${U}px`);
  resizeListeners.forEach((fn) => fn());
}
export const onResize = (fn) => resizeListeners.push(fn);

export function tileCenter(i) {
  const el = $(`tile-${i}`);
  if (!el) return { x: 0, y: 0 };
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
}
export function boardCenter() {
  return { x: boardEl.clientWidth / 2, y: boardEl.clientHeight / 2 };
}

// ---------- Tile state (owner colour, houses, mortgage) ----------
export function syncTile(id, own, ownerColor, override = null) {
  const el = $(`tile-${id}`);
  if (!el) return;
  if (own) {
    el.style.setProperty("--owner", ownerColor || "#fff");
    el.classList.add("owned");
  } else {
    el.classList.remove("owned");
    el.style.removeProperty("--owner");
  }
  el.classList.toggle("mortgaged", !!own?.mortgaged);
  const bld = el.querySelector(".bld");
  if (!bld) return;
  const src = override || own;
  const level = src ? (src.hotel ? 5 : src.houses || 0) : 0;
  const prev = Number(bld.dataset.level || 0);
  if (prev === level && bld.dataset.ready) return;
  bld.dataset.level = String(level);
  bld.dataset.ready = "1";
  bld.innerHTML = level === 5 ? '<i class="hotel"></i>' : '<i class="house"></i>'.repeat(level);
  if (level > prev) {
    const fresh = level === 5 ? [...bld.children] : [...bld.children].slice(prev);
    fresh.forEach((node) => node.classList.add("pop"));
  }
}

export function setVacationPot(amount) {
  const el = $("vacationPot");
  if (el) el.textContent = amount > 0 ? `$${amount}` : "";
}

export function pulseTile(i, color) {
  const el = $(`tile-${i}`);
  if (!el) return;
  el.style.setProperty("--pc", color || "#fff");
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
  setTimeout(() => el.classList.remove("pulse"), 800);
}

export function shakeTile(i) {
  const el = $(`tile-${i}`);
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
  setTimeout(() => el.classList.remove("shake"), 700);
}

// ---------- Tokens ----------
export function ensureToken(player) {
  let el = tokenEls.get(player.id);
  if (!el) {
    el = document.createElement("div");
    el.className = "token enter";
    el.dataset.pid = player.id;
    el.innerHTML = '<i class="tshadow"></i><div class="tbody"><i class="eye"><b></b></i><i class="eye"><b></b></i></div>';
    tokensLayer.appendChild(el);
    tokenEls.set(player.id, el);
    setTimeout(() => el.classList.remove("enter"), 600);
  }
  el.style.setProperty("--c", player.color);
  el.title = player.name;
  return el;
}

export function pruneTokens(keepIds) {
  for (const [id, el] of tokenEls) {
    if (!keepIds.has(id)) { el.remove(); tokenEls.delete(id); tokenPos.delete(id); }
  }
}

export function tokenPoint(pid) {
  return tokenPos.get(pid) || null;
}

function place(el, pid, cx, cy, scale, animate) {
  const size = U * 0.54 * scale;
  el.classList.remove("moving");
  el.classList.toggle("notrans", !animate);
  el.style.setProperty("--ts", `${size}px`);
  el.style.transform = `translate(${cx - size / 2}px, ${cy - size / 2}px)`;
  tokenPos.set(pid, { x: cx, y: cy });
  if (!animate) requestAnimationFrame(() => el.classList.remove("notrans"));
}

// players: [{id, inJail, bankrupt}], positions: Map(playerId -> tile index)
export function layoutTokens(players, positions, animate = true, hideIds = null) {
  const groups = new Map();
  for (const p of players) {
    const el = tokenEls.get(p.id);
    if (!el) continue;
    el.classList.toggle("gone", !!p.bankrupt);
    if (p.bankrupt || (hideIds && hideIds.has(p.id)) || moving.has(p.id)) continue;
    const pos = positions.get(p.id) ?? 0;
    const key = pos === 10 ? (p.inJail ? "10j" : "10v") : String(pos);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const [key, list] of groups) {
    const pos = parseInt(key, 10);
    const c = tileCenter(pos);
    const n = list.length;
    const scale = n <= 2 ? 1 : n <= 4 ? 0.82 : 0.68;
    const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    list.forEach((p, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      let dx = (col - (cols - 1) / 2) * U * 0.46 * scale * 1.05;
      let dy = (row - (rows - 1) / 2) * U * 0.46 * scale * 1.05;
      if (key === "10j") dy += U * 0.14;
      if (key === "10v") { dx -= U * 0.3; dy -= U * 0.34; }
      place(tokenEls.get(p.id), p.id, c.x + dx, c.y + dy, scale, animate);
    });
  }
}

function arc(el, body, from, to, dur, lift, easing) {
  const size = U * 0.54;
  el.classList.add("moving");
  el.style.setProperty("--ts", `${size}px`);
  const move = el.animate(
    [
      { transform: `translate(${from.x - size / 2}px, ${from.y - size / 2}px)` },
      { transform: `translate(${to.x - size / 2}px, ${to.y - size / 2}px)` },
    ],
    { duration: dur, easing, fill: "forwards" },
  );
  body.animate(
    [
      { transform: "translateY(0) scale(1,1)" },
      { transform: `translateY(${-lift}px) scale(.94,1.1)`, offset: 0.5 },
      { transform: "translateY(0) scale(1.16,.82)", offset: 0.92 },
      { transform: "translateY(0) scale(1,1)" },
    ],
    { duration: dur, easing: "ease-out" },
  );
  const shadow = el.querySelector(".tshadow");
  shadow?.animate(
    [{ transform: "scale(1)", opacity: 0.5 }, { transform: "scale(.55)", opacity: 0.2, offset: 0.5 }, { transform: "scale(1)", opacity: 0.5 }],
    { duration: dur },
  );
  return move;
}

async function finishMove(el, pid, move, to) {
  await move.finished.catch(() => {});
  const size = U * 0.54;
  el.style.transform = `translate(${to.x - size / 2}px, ${to.y - size / 2}px)`;
  move.cancel();
  tokenPos.set(pid, { x: to.x, y: to.y });
}

export async function hop(pid, tileIdx, dur = 220) {
  const el = tokenEls.get(pid);
  if (!el) return;
  moving.add(pid);
  const from = tokenPos.get(pid) || tileCenter(tileIdx);
  const to = tileCenter(tileIdx);
  el.style.zIndex = "30";
  const move = arc(el, el.querySelector(".tbody"), from, to, dur, U * 0.42, "cubic-bezier(.4,0,.6,1)");
  await finishMove(el, pid, move, to);
}

export async function fly(pid, tileIdx, dur = 760) {
  const el = tokenEls.get(pid);
  if (!el) return;
  moving.add(pid);
  const from = tokenPos.get(pid) || tileCenter(tileIdx);
  const to = tileCenter(tileIdx);
  el.style.zIndex = "30";
  const move = arc(el, el.querySelector(".tbody"), from, to, dur, U * 1.5, "cubic-bezier(.45,.05,.4,1)");
  await finishMove(el, pid, move, to);
}

export function releaseToken(pid) {
  moving.delete(pid);
  const el = tokenEls.get(pid);
  if (el) el.style.zIndex = "";
}

export function thud(pid) {
  const el = tokenEls.get(pid);
  const body = el?.querySelector(".tbody");
  body?.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }],
    { duration: 420 },
  );
}

export async function vanish(pid) {
  const el = tokenEls.get(pid);
  if (!el) return;
  const a = el.animate([{ opacity: 1, filter: "none" }, { opacity: 0, filter: "grayscale(1) blur(4px)" }], { duration: 700, fill: "forwards" });
  await a.finished.catch(() => {});
  a.cancel();
  el.classList.add("gone");
}

// ---------- Effects ----------
export function floatText(x, y, text, kind = "gain") {
  if (!fxLayer) return;
  const el = document.createElement("div");
  el.className = `float ${kind}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

export function splash(text, color = "#fff", sub = "") {
  if (!fxLayer) return;
  const el = document.createElement("div");
  el.className = "splash";
  el.style.setProperty("--c", color);
  el.innerHTML = `<strong>${esc(text)}</strong>${sub ? `<span>${esc(sub)}</span>` : ""}`;
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

export async function coinFlight(from, to, count = 7, onLand = null) {
  if (!fxLayer) return;
  const jobs = [];
  for (let i = 0; i < count; i++) {
    const coin = document.createElement("i");
    coin.className = "coin";
    fxLayer.appendChild(coin);
    const mid = {
      x: (from.x + to.x) / 2 + (Math.random() - 0.5) * U * 0.9,
      y: Math.min(from.y, to.y) - U * (0.7 + Math.random() * 0.8),
    };
    const anim = coin.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${mid.x}px, ${mid.y}px) scale(1) rotate(180deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(.75) rotate(360deg)`, opacity: 1, offset: 0.92 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(.3) rotate(360deg)`, opacity: 0 },
      ],
      { duration: 950, delay: i * 75, easing: "ease-in-out", fill: "both" },
    );
    jobs.push(anim.finished.then(() => { coin.remove(); if (onLand) onLand(i); }).catch(() => coin.remove()));
  }
  await Promise.all(jobs);
}

// ---- Confetti (full-screen canvas) ----
const particles = [];
let confettiRaf = 0;
export function confetti(clientX, clientY, count = 40, colors = ["#7851dc", "#f8c845", "#54a3e3", "#f56e97", "#69e153", "#ff8741"], spread = 1) {
  const canvas = $("confetti");
  if (!canvas || skipMotion()) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (3 + Math.random() * 7) * spread;
    particles.push({
      x: clientX, y: clientY,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4,
      size: 5 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length], life: 0, max: 70 + Math.random() * 50,
    });
  }
  if (!confettiRaf) confettiRaf = requestAnimationFrame(stepConfetti);
}

function stepConfetti() {
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life++;
    p.vy += 0.28;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    if (p.life > p.max || p.y > canvas.height + 20) { particles.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = Math.min(1, (p.max - p.life) / 25);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
    ctx.restore();
  }
  if (particles.length) confettiRaf = requestAnimationFrame(stepConfetti);
  else { confettiRaf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

export function clientCenterOfTile(i) {
  const el = $(`tile-${i}`);
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---------- Googly eyes follow the pointer ----------
let eyeRaf = 0;
let pointer = { x: 0, y: 0 };
function updateEyes() {
  eyeRaf = 0;
  document.querySelectorAll(".eye").forEach((eye) => {
    const pupil = eye.firstElementChild;
    if (!pupil) return;
    const r = eye.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = pointer.x - cx;
    const dy = pointer.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, dist / 90) * r.width * 0.2;
    pupil.style.transform = `translate(${(dx / dist) * reach}px, ${(dy / dist) * reach}px)`;
  });
}
export function trackEyes() {
  window.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!eyeRaf) eyeRaf = requestAnimationFrame(updateEyes);
  }, { passive: true });
}
