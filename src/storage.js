const DB_NAME = 'easyowl';
const STORE = 'kv';
const CANDLES_KEY = 'candles-v1';
const STATE_KEY = 'easyowl:state:v1';
const NICK_KEY = 'easyowl:nick:v1';
export const DATA_URL = `${import.meta.env.BASE_URL}data/eurusd-5m.json`;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const toCandles = (rows) =>
  rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));

// First run: download once and keep in IndexedDB. Next runs: read locally.
export async function loadCandles(onStatus) {
  try {
    const cached = await idbGet(CANDLES_KEY);
    if (cached?.length) return toCandles(cached);
  } catch { /* fall through to download */ }

  onStatus('Downloading 1 year of EURUSD 5m data (first run only)...');
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error('Could not download market data');
  const rows = await res.json();

  onStatus('Saving data in your browser...');
  try { await idbSet(CANDLES_KEY, rows); } catch { /* still playable without cache */ }
  return toCandles(rows);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function loadNick() {
  try {
    const raw = localStorage.getItem(NICK_KEY);
    return raw ? String(raw).trim() : '';
  } catch {
    return '';
  }
}

export function saveNick(name) {
  try { localStorage.setItem(NICK_KEY, name); } catch { /* ignore */ }
}
