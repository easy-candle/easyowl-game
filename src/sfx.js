const MUTE_KEY = 'easyowl:muted';

let ctx = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlock() {
  try { ac(); } catch { /* ignore */ }
}

export function isMuted() { return muted; }

export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  if (!muted) unlock();
}

function tone(type, freq, when, dur, vol, slideTo) {
  if (muted) return;
  const audio = ac();
  const t = when ?? audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

export function click() {
  tone('square', 720, undefined, 0.045, 0.05);
}

export function buy() {
  const t = ac().currentTime;
  tone('square', 392, t, 0.09, 0.11, 523);
  tone('square', 523, t + 0.08, 0.09, 0.11, 659);
  tone('square', 659, t + 0.16, 0.16, 0.13, 784);
}

export function sell() {
  const t = ac().currentTime;
  tone('square', 659, t, 0.09, 0.11, 523);
  tone('square', 523, t + 0.08, 0.09, 0.11, 392);
  tone('square', 392, t + 0.16, 0.16, 0.13, 294);
}

export function cash() {
  const t = ac().currentTime;
  tone('triangle', 988, t, 0.08, 0.11, 1318);
  tone('triangle', 1318, t + 0.07, 0.12, 0.11, 1568);
}

export function win() {
  const t = ac().currentTime;
  [523, 659, 784, 1046].forEach((freq, i) => tone('triangle', freq, t + i * 0.07, 0.2, 0.14));
}

export function lose() {
  const t = ac().currentTime;
  tone('sawtooth', 220, t, 0.3, 0.12, 88);
  tone('square', 130, t + 0.04, 0.22, 0.07);
}

export function error() {
  tone('square', 170, undefined, 0.2, 0.09, 110);
}
