// Static art and lookup tables for the UI. No DOM logic beyond icon hydration.

export const PLAYER_COLORS = ["#c1dd4b", "#f8c845", "#ff8741", "#d84a4c", "#54a3e3", "#5dd8df", "#15aa9a", "#69e153", "#aa7e68", "#db49ab", "#f56e97", "#7851dc"];
export const COLOR_NAMES = { "#c1dd4b": "Lime", "#f8c845": "Gold", "#ff8741": "Orange", "#d84a4c": "Red", "#54a3e3": "Blue", "#5dd8df": "Aqua", "#15aa9a": "Teal", "#69e153": "Green", "#aa7e68": "Brown", "#db49ab": "Magenta", "#f56e97": "Pink", "#7851dc": "Violet" };

// 24x24 stroke icons (feather-style)
const ICONS = {
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2.5 2.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  play: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z" fill="currentColor"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  swap: '<path d="M7 10h14l-4-4M17 14H3l4 4"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/>',
  robot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 14h.01M15 14h.01M2 13v3M22 13v3"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 8.5A6 6 0 1 1 8.5 15.5"/>',
  stack: '<path d="m12 3 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  palm: '<path d="M12 22V11M12 11c-1-4-5-5-8-3 3 0 5 1 8 3zM12 11c1-4 5-5 8-3-3 0-5 1-8 3zM12 11C10 9 10 5 12 3c2 2 2 6 0 8z"/>',
  hammer: '<path d="m14 6 4 4M3 21l9-9M12.5 4.5l3-2 6 6-2 3-7-7z"/>',
  prison: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
  bank: '<path d="M3 10 12 4l9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 21h18"/>',
  home: '<path d="M3 11 12 3l9 8M5 10v11h14V10"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1.4 0 2-1 2-2 0-1.4-1-1.6-1-3a2 2 0 0 1 2-2h2a5 5 0 0 0 5-5c0-4.4-4.5-8-10-8z"/>',
  wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01"/>',
};

export function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

// Fills every [data-icon] element with its icon (keeps any existing text after it).
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(el => {
    if (el.dataset.iconDone) return;
    el.dataset.iconDone = "1";
    el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
  });
}

// ---- Board look ----
export const GROUP_TINT = {
  brown: "#3fae6a", lightblue: "#4a7be0", pink: "#d4505f", orange: "#e6a92d",
  red: "#e5384c", yellow: "#4a6fd8", green: "#c93d55", blue: "#5b78dc",
};
export const GROUP_LABEL = {
  brown: "Brazil", lightblue: "Israel", pink: "Italy", orange: "Germany",
  red: "China", yellow: "France", green: "United Kingdom", blue: "United States",
};
export const COUNTRY_FLAGS = {
  Salvador: "br", Rio: "br", "Tel Aviv": "il", Haifa: "il", Jerusalem: "il",
  Venice: "it", Milan: "it", Rome: "it", Frankfurt: "de", Munich: "de", Berlin: "de",
  Shenzhen: "cn", Beijing: "cn", Shanghai: "cn", Lyon: "fr", Toulouse: "fr", Paris: "fr",
  Liverpool: "gb", Manchester: "gb", London: "gb", "San Francisco": "us", "New York": "us",
};
const DISPLAY = {
  0: "START", 2: "Treasure", 17: "Treasure", 33: "Treasure", 7: "Surprise", 22: "Surprise", 36: "Surprise",
  4: "Earnings Tax", 38: "Premium Tax", 10: "In Prison", 20: "Vacation", 30: "Go to prison",
};
export const displayName = (space) => DISPLAY[space.id] || space.name;

const FLAG_ART = {
  br: '<circle fill="#168b4b" cx="18" cy="18" r="18"/><path fill="#f7d447" d="m18 5 14 13-14 13L4 18z"/><circle fill="#2454a4" cx="18" cy="18" r="7"/>',
  il: '<circle fill="#fff" cx="18" cy="18" r="18"/><path stroke="#1768ae" stroke-width="2.5" d="M5 11h26M5 25h26"/><path fill="none" stroke="#1768ae" stroke-width="1.7" d="m18 11 6 10H12z m0 14-6-10h12z"/>',
  it: '<circle fill="#fff" cx="18" cy="18" r="18"/><path fill="#159447" d="M0 0h12v36H0z"/><path fill="#df3d46" d="M24 0h12v36H24z"/>',
  de: '<circle fill="#d9363e" cx="18" cy="18" r="18"/><path fill="#17191d" d="M0 0h36v12H0z"/><path fill="#f4c847" d="M0 24h36v12H0z"/>',
  cn: '<circle fill="#df2636" cx="18" cy="18" r="18"/><path fill="#ffdf4c" d="m10 7 1.1 3.2h3.3l-2.7 2 1 3.2-2.7-2-2.7 2 1-3.2-2.7-2h3.3z m9 1 .5 1.4H21l-1.2.9.5 1.4-1.2-.9-1.2.9.5-1.4-1.2-.9h1.5z m3 4 .5 1.4H24l-1.2.9.5 1.4-1.2-.9-1.2.9.5-1.4-1.2-.9h1.5z m-.5 6 .5 1.4h1.5l-1.2.9.5 1.4-1.2-.9-1.2.9.5-1.4-1.2-.9h1.5z m-3 5 .5 1.4h1.5l-1.2.9.5 1.4-1.2-.9-1.2.9.5-1.4-1.2-.9h1.5z"/>',
  fr: '<circle fill="#fff" cx="18" cy="18" r="18"/><path fill="#2454a4" d="M0 0h12v36H0z"/><path fill="#e33d49" d="M24 0h12v36H24z"/>',
  gb: '<circle fill="#23437c" cx="18" cy="18" r="18"/><path stroke="#fff" stroke-width="8" d="m2 2 32 32M34 2 2 34"/><path stroke="#d83c4a" stroke-width="3" d="m2 2 32 32M34 2 2 34"/><path stroke="#fff" stroke-width="12" d="M18 0v36M0 18h36"/><path stroke="#d83c4a" stroke-width="5" d="M18 0v36M0 18h36"/>',
  us: '<circle fill="#fff" cx="18" cy="18" r="18"/><path stroke="#d73c4b" stroke-width="3" d="M0 5h36M0 11h36M0 17h36M0 23h36M0 29h36M0 35h36"/><path fill="#2454a4" d="M0 0h18v19H0z"/><path fill="#fff" d="m4 3 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m7 0 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m-3.5 6 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m7 0 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m-7 6 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z m-3.5-6 .6 1.4h1.5l-1.2.9.5 1.4-1.4-.8-1.2.8.5-1.4-1.2-.9h1.5z"/>',
};

let flagSeq = 0;
export function flagSvg(code) {
  const id = `fc${++flagSeq}`;
  return `<svg viewBox="0 0 36 36" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="18" cy="18" r="17"/></clipPath></defs><g clip-path="url(#${id})">${FLAG_ART[code]}</g><circle cx="18" cy="18" r="17" fill="none" stroke="#fff" stroke-width="1.6"/></svg>`;
}

export const TILE_ART = {
  chest: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 27h44v27H10z" fill="#d9822b" stroke="#ffd27a" stroke-width="3" stroke-linejoin="round"/><path d="M8 25c0-11 10-18 24-18s24 7 24 18z" fill="#f0a23a" stroke="#ffd27a" stroke-width="3" stroke-linejoin="round"/><path d="M27 30h10v14H27z" fill="#ffe08a" stroke="#8b4c2a" stroke-width="2"/><circle cx="32" cy="37" r="2.4" fill="#8b4c2a"/></svg>',
  question: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 22c0-8 6-13 13-13s13 5 13 12c0 7-6 9-9 12-2 2-2 4-2 7" fill="none" stroke="#ff6fb1" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="35" cy="54" r="5.5" fill="#ff6fb1"/></svg>',
  plane: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 5 6 4 2 18 17 12v6L39 40l-2 16-5 3-5-3-2-16L8 45v-6l17-12 2-18z" fill="currentColor"/></svg>',
  bolt: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M37 4 14 36h15l-3 24 24-35H35z" fill="#ffd34e" stroke="#fff3b0" stroke-width="2" stroke-linejoin="round"/></svg>',
  water: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8c-7 10-15 19-15 29a15 15 0 0 0 30 0c0-10-8-19-15-29z" fill="#8fe0f5" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M24 40c1 5 4 7 9 8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
  receipt: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 6h36v52l-6-4-6 4-6-4-6 4-6-4-6 4z" fill="#f4f1ff" fill-opacity=".92"/><path d="M22 20h20M22 30h20M22 40h12" stroke="#7a6aa8" stroke-width="4" stroke-linecap="round"/></svg>',
  ring: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="40" r="16" fill="none" stroke="#ffe08a" stroke-width="5"/><path d="m22 16 5-8h10l5 8-10 12z" fill="#8fe0f5" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  palm: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="53" rx="24" ry="7" fill="#f2d089"/><path d="M33 52c-1-12 0-22 4-33" stroke="#8a5a2b" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M37 19c-6-7-15-6-21 0 8-3 14-2 21 0zM37 19c3-9 12-11 20-5-8-1-14 1-20 5zM37 19c8 1 14 7 14 15-3-7-8-11-14-15zM37 19c-9 2-13 9-12 17 3-8 7-13 12-17z" fill="#4fcf7a"/></svg>',
  skull: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 54 54 34M54 54 10 34" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M32 6c-13 0-22 9-22 20 0 7 3 12 8 15v7h6v-4h4v4h8v-4h4v4h6v-7c5-3 8-8 8-15C54 15 45 6 32 6z" fill="#fff"/><circle cx="23" cy="27" r="6" fill="#241c3a"/><circle cx="41" cy="27" r="6" fill="#241c3a"/><path d="m32 33-3 6h6z" fill="#241c3a"/></svg>',
  arrow: '<svg viewBox="0 0 64 24" aria-hidden="true"><path d="M2 12h50M42 3l14 9-14 9" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
