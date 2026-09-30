// Tiny synthesized sound effects. Everything is generated with WebAudio, so there
// are no audio files to download. Sound is on by default and persisted in localStorage.

let ctx = null;
let master = null;
let enabled = true;
try { enabled = localStorage.getItem("ccp:sound") !== "off"; } catch { /* storage unavailable */ }

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq = 440, to = null, dur = 0.12, type = "sine", gain = 0.5, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise({ dur = 0.2, gain = 0.4, freq = 1800, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  src.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = freq;
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(master);
  src.start(t0);
}

export const sfx = {
  get enabled() { return enabled; },
  setEnabled(value) {
    enabled = !!value;
    try { localStorage.setItem("ccp:sound", enabled ? "on" : "off"); } catch { /* ignore */ }
    if (enabled) this.click();
  },
  unlock() { ensure(); },
  click() { tone({ freq: 620, to: 880, dur: 0.06, type: "triangle", gain: 0.25 }); },
  hop(step = 0) { tone({ freq: 300 + (step % 6) * 22, to: 200, dur: 0.09, type: "triangle", gain: 0.35 }); },
  dice() {
    for (let i = 0; i < 7; i++) noise({ dur: 0.07, gain: 0.35, freq: 900 + Math.random() * 1800, delay: i * 0.1 });
    tone({ freq: 140, to: 90, dur: 0.14, type: "sine", gain: 0.4, delay: 0.72 });
  },
  coin() { tone({ freq: 988, dur: 0.07, type: "square", gain: 0.16 }); tone({ freq: 1319, dur: 0.16, type: "square", gain: 0.16, delay: 0.07 }); },
  gain() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.14, type: "triangle", gain: 0.3, delay: i * 0.06 })); },
  loss() { [523, 440, 349].forEach((f, i) => tone({ freq: f, dur: 0.16, type: "triangle", gain: 0.3, delay: i * 0.08 })); },
  card() { noise({ dur: 0.22, gain: 0.25, freq: 3000 }); tone({ freq: 520, to: 1040, dur: 0.22, type: "sine", gain: 0.2, delay: 0.1 }); },
  buy() { [392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.2, type: "triangle", gain: 0.32, delay: i * 0.07 })); tone({ freq: 784, dur: 0.35, type: "sine", gain: 0.25, delay: 0.24 }); },
  build() { tone({ freq: 180, to: 120, dur: 0.1, type: "square", gain: 0.25 }); tone({ freq: 260, to: 180, dur: 0.1, type: "square", gain: 0.22, delay: 0.1 }); },
  jail() { tone({ freq: 110, to: 55, dur: 0.5, type: "sawtooth", gain: 0.4 }); noise({ dur: 0.3, gain: 0.3, freq: 300, delay: 0.05 }); },
  turn() { tone({ freq: 784, dur: 0.12, type: "sine", gain: 0.3 }); tone({ freq: 1175, dur: 0.22, type: "sine", gain: 0.3, delay: 0.1 }); },
  bankrupt() { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.28, type: "sawtooth", gain: 0.25, delay: i * 0.15 })); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.34, delay: i * 0.11 })); },
  error() { tone({ freq: 160, dur: 0.18, type: "square", gain: 0.2 }); },
  message() { tone({ freq: 880, dur: 0.07, type: "sine", gain: 0.18 }); },
};
