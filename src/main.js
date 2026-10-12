import './style.css';
import { createChart, CrosshairMode, LineStyle, ColorType } from 'lightweight-charts';
import { loadCandles, loadState, saveState, loadNick, saveNick } from './storage.js';
import { CONFIG, newState, openPosition, checkExit, pnlAt, riskAmount, tpDistance } from './game.js';
import * as sfx from './sfx.js';
import { initAnalytics, trackEvent } from './analytics.js';

initAnalytics();

const $ = (id) => document.getElementById(id);
const money = (n, sign = false) => {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : sign && n > 0 ? '+' : '') + '$' + s;
};

const WIN_QUIPS = ['HOO-RAY!', 'OWL YEAH!', 'WISE MOVE!', 'KA-CHING!', 'NICE HOOT!'];
const LOSE_QUIPS = ['OUCH!', 'WHOOPS!', 'HOOT NO!', 'YIKES!', 'OH NO!'];
const RIGHT_OFFSET = 8;

let candles = [];
let state = newState();
let timer = null;
let lines = { entry: null, sl: null, tp: null };

const chart = createChart($('chart'), {
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#e8c8ff',
    fontFamily: 'Fredoka, Trebuchet MS, sans-serif',
    fontSize: 11,
  },
  grid: {
    vertLines: { visible: false },
    horzLines: { color: 'rgba(255, 210, 120, 0.07)', style: LineStyle.SparseDotted },
  },
  crosshair: {
    mode: CrosshairMode.Magnet,
    vertLine: { color: 'rgba(255, 210, 74, 0.45)', style: LineStyle.SparseDotted, width: 1, labelBackgroundColor: '#5b2db3' },
    horzLine: { color: 'rgba(255, 138, 60, 0.55)', style: LineStyle.SparseDotted, width: 1, labelBackgroundColor: '#ff8a3c' },
  },
  rightPriceScale: {
    borderVisible: false,
    scaleMargins: { top: 0.12, bottom: 0.12 },
    entireTextOnly: true,
  },
  timeScale: {
    borderVisible: false,
    timeVisible: true,
    secondsVisible: false,
    barSpacing: CONFIG.barSpacing,
    rightOffset: RIGHT_OFFSET,
    shiftVisibleRangeOnNewBar: false,
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: false },
  watermark: {
    visible: true,
    text: 'easyowl',
    fontFamily: 'Luckiest Guy, cursive',
    fontSize: 54,
    color: 'rgba(255, 210, 74, 0.08)',
    horzAlign: 'center',
    vertAlign: 'center',
  },
});

const series = chart.addCandlestickSeries({
  upColor: '#ffd24a',
  downColor: '#ff6b9d',
  borderUpColor: '#fff4d2',
  borderDownColor: '#ffd0e0',
  wickUpColor: '#ffe38a',
  wickDownColor: '#ff9ab8',
  lastValueVisible: false,
  priceLineVisible: false,
  priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
  autoscaleInfoProvider: () => {
    const view = priceView || targetPriceRange();
    if (!view) return null;
    return { priceRange: { minValue: view.min, maxValue: view.max } };
  },
});

const current = () => candles[state.index - 1];
let candleRaf = 0;
let priceView = null;

const lerp = (a, b, t) => a + (b - a) * t;

function targetPriceRange(visual) {
  const c = visual || current();
  if (!c) return null;
  const pad = tpDistance() * 1.02;
  let min = c.close - pad;
  let max = c.close + pad;
  const recent = candles.slice(Math.max(0, state.index - 18), state.index);
  for (const bar of recent) {
    min = Math.min(min, bar.low);
    max = Math.max(max, bar.high);
  }
  if (visual) {
    min = Math.min(min, visual.low);
    max = Math.max(max, visual.high);
  }
  if (state.position) {
    min = Math.min(min, state.position.sl, state.position.tp);
    max = Math.max(max, state.position.sl, state.position.tp);
  }
  const extra = (max - min) * 0.1;
  return { min: min - extra, max: max + extra };
}

function snapPriceView(visual) {
  priceView = targetPriceRange(visual);
}

function neededBars() {
  const width = Math.max(280, ($('chart').clientWidth || 360) - 58);
  return Math.ceil(width / CONFIG.barSpacing) + 6;
}

function ensureHistory() {
  const need = Math.min(candles.length, Math.max(CONFIG.initialCandles, neededBars()));
  if (state.index < need) state.index = need;
}

function fillTimeScale() {
  const ts = chart.timeScale();
  ts.applyOptions({ barSpacing: CONFIG.barSpacing, rightOffset: RIGHT_OFFSET, shiftVisibleRangeOnNewBar: false });
  const visible = neededBars();
  const from = Math.max(0, state.index - visible);
  const last = Math.max(0, state.index - 1);
  ts.setVisibleLogicalRange({ from: from - 0.15, to: last + RIGHT_OFFSET });
}

function placeLiveCandle(gap) {
  chart.timeScale().scrollToPosition(gap, false);
}

function popLiveGlow() {
  const glow = $('liveGlow');
  glow.classList.remove('pop');
  void glow.offsetWidth;
  glow.classList.add('pop');
  glow.addEventListener('animationend', () => glow.classList.remove('pop'), { once: true });
}

function updateLiveGlow(visual) {
  const c = visual || current();
  const glow = $('liveGlow');
  if (!c || !glow) return;
  const x = chart.timeScale().timeToCoordinate(c.time);
  const y = series.priceToCoordinate(c.close);
  if (x == null || y == null) {
    glow.style.opacity = '0';
    return;
  }
  const up = c.close >= c.open;
  glow.classList.toggle('up', up);
  glow.classList.toggle('down', !up);
  glow.style.left = `${x}px`;
  glow.style.top = `${y}px`;
  glow.style.opacity = '';
}

function animateCandle(target) {
  cancelAnimationFrame(candleRaf);
  const prev = candles[state.index - 2];
  const fromClose = prev ? prev.close : target.open;
  series.update({ time: target.time, open: target.open, high: target.open, low: target.open, close: fromClose });
  // New bars eat one slot of right margin. Put that slot back from a fixed
  // offset so a tick that ends early cannot shrink the gap over time.
  placeLiveCandle(RIGHT_OFFSET - 1);

  const startPrice = priceView || targetPriceRange({ ...target, close: fromClose, high: fromClose, low: fromClose });
  const endPrice = targetPriceRange(target) || startPrice;

  const t0 = performance.now();
  const dur = CONFIG.tickMs;
  const run = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const grow = 1 - (1 - Math.min(1, t / 0.5)) ** 3;
    const close = fromClose + (target.close - fromClose) * grow;
    const high = Math.max(target.open, close, target.open + (target.high - target.open) * grow);
    const low = Math.min(target.open, close, target.open + (target.low - target.open) * grow);
    const visual = grow >= 1 ? target : { time: target.time, open: target.open, high, low, close };
    const dest = targetPriceRange(visual) || endPrice;
    if (startPrice && dest) {
      priceView = { min: lerp(startPrice.min, dest.min, t), max: lerp(startPrice.max, dest.max, t) };
    }
    series.update(visual);
    placeLiveCandle((RIGHT_OFFSET - 1) + t);
    updateLiveGlow(visual);
    if (t < 1) candleRaf = requestAnimationFrame(run);
    else {
      series.update(target);
      placeLiveCandle(RIGHT_OFFSET);
      snapPriceView(target);
      updateLiveGlow(target);
    }
  };
  popLiveGlow();
  candleRaf = requestAnimationFrame(run);
}

function clearLines() {
  for (const k of Object.keys(lines)) {
    if (lines[k]) series.removePriceLine(lines[k]);
    lines[k] = null;
  }
}

function drawLines() {
  clearLines();
  const p = state.position;
  if (!p) return;
  const risk = riskAmount();
  lines.sl = series.createPriceLine({
    price: p.sl, color: '#ff4d7a', lineWidth: 2, lineStyle: LineStyle.LargeDashed,
    axisLabelVisible: true, title: `SL  ${money(-risk)}`,
  });
  lines.tp = series.createPriceLine({
    price: p.tp, color: '#3ee08f', lineWidth: 2, lineStyle: LineStyle.LargeDashed,
    axisLabelVisible: true, title: `TP  ${money(risk * CONFIG.rr, true)}`,
  });
  lines.entry = series.createPriceLine({
    price: p.entry, color: '#ffd24a', lineWidth: 2, lineStyle: LineStyle.SparseDotted,
    axisLabelVisible: true, title: '',
  });
  updateEntryHandle();
}

function updateEntryHandle() {
  const p = state.position;
  if (!p || !lines.entry) return;
  const pnl = pnlAt(p, current().close);
  lines.entry.applyOptions({
    color: pnl >= 0 ? '#3ee08f' : '#ff4d7a',
    title: `${p.side === 'buy' ? 'BUY' : 'SELL'}  ${money(pnl, true)}`,
  });
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function spawnPnlFx(pnl, reason) {
  const layer = $('fx');
  const el = document.createElement('div');
  const win = pnl >= 0;
  el.className = `pnl-pop ${win ? 'win' : 'lose'}`;
  const headline = reason === 'TP' ? 'TP HIT!' : reason === 'SL' ? 'SL HIT!' : pick(win ? WIN_QUIPS : LOSE_QUIPS);
  el.innerHTML = `<span class="quip">${headline}</span><b>${money(pnl, true)}</b>`;
  const marks = win ? ['✦', '★', '$', '✦'] : ['•', '×', '•', '×'];
  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('i');
    spark.className = 'spark';
    spark.textContent = marks[i % marks.length];
    const angle = (Math.PI * 2 * i) / 8;
    spark.style.setProperty('--dx', `${Math.cos(angle) * (70 + Math.random() * 50)}px`);
    spark.style.setProperty('--dy', `${Math.sin(angle) * (50 + Math.random() * 40) - 30}px`);
    spark.style.animationDelay = `${i * 0.03}s`;
    el.appendChild(spark);
  }
  layer.appendChild(el);
  const arena = $('arena');
  arena.classList.remove('flash-win', 'flash-lose');
  void arena.offsetWidth;
  arena.classList.add(win ? 'flash-win' : 'flash-lose');
  setTimeout(() => arena.classList.remove('flash-win', 'flash-lose'), 450);
  el.addEventListener('animationend', (e) => {
    if (e.target === el) el.remove();
  });
}

function flashBalance(delta) {
  const el = $('balance');
  el.classList.remove('bump-up', 'bump-down');
  void el.offsetWidth;
  el.classList.add(delta >= 0 ? 'bump-up' : 'bump-down');
}

function setPlaying(on) {
  $('iconPause').classList.toggle('hidden', !on);
  $('iconPlay').classList.toggle('hidden', on);
  $('btnPlay').setAttribute('aria-label', on ? 'Pause' : 'Play');
  $('btnPlay').title = on ? 'Pause' : 'Play';
}

function setMuteUi() {
  const off = sfx.isMuted();
  $('iconSound').classList.toggle('hidden', off);
  $('iconMuted').classList.toggle('hidden', !off);
  $('btnMute').setAttribute('aria-label', off ? 'Unmute' : 'Mute');
  $('btnMute').title = off ? 'Unmute' : 'Mute';
}

function playCloseSound(pnl, reason) {
  if (reason === 'TP') sfx.win();
  else if (reason === 'SL') sfx.lose();
  else if (pnl >= 0) { sfx.cash(); sfx.win(); }
  else { sfx.cash(); sfx.lose(); }
}

function updateUI() {
  const c = current();
  const p = state.position;
  const open = p ? pnlAt(p, c.close) : 0;

  $('balance').textContent = money(state.balance);
  const live = $('livePnl');
  live.classList.toggle('hidden', !p);
  live.classList.toggle('pos', open >= 0);
  live.classList.toggle('neg', open < 0);
  $('openPnl').textContent = money(open, true);
  $('openPnl').className = open >= 0 ? 'pos' : 'neg';

  $('priceNow').textContent = c.close.toFixed(5);
  $('timeNow').textContent = new Date(c.time * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  $('tradeActions').classList.toggle('hidden', !!p);
  $('btnClose').classList.toggle('hidden', !p);
  $('btnBuy').disabled = !!p;
  $('btnSell').disabled = !!p;
  $('btnClose').disabled = !p;
  $('closePnl').textContent = p ? money(open, true) : '';
  $('closePnl').className = open >= 0 ? 'pos' : 'neg';

  setPlaying(!!timer);
  updateEntryHandle();
  updateLiveGlow();
}

function renderRules() {
  $('rulePill').textContent = `1% risk  ·  1:${CONFIG.rr}  ·  SL locked`;
}

function persist() { saveState(state); }

function closePosition(price, reason) {
  const p = state.position;
  if (!p) return;
  const dir = p.side === 'buy' ? 1 : -1;
  const pnl = dir * (price - p.entry) * p.units;
  state.balance = Math.max(0, +(state.balance + pnl).toFixed(2));
  state.trades.unshift({ side: p.side, entry: p.entry, exit: price, pnl: +pnl.toFixed(2), reason, time: current().time });
  state.trades = state.trades.slice(0, 500);
  state.position = null;
  clearLines();
  spawnPnlFx(pnl, reason);
  flashBalance(pnl);
  playCloseSound(pnl, reason);
  trackEvent('trade_close', {
    exit_reason: reason,
    side: p.side,
    pnl: +pnl.toFixed(2),
    balance: state.balance,
    trade_count: state.trades.length,
    candle_index: state.index,
  });
  checkBalance();
}

function checkBalance() {
  if (state.balance < CONFIG.minBalance) {
    pause();
    if (!$('resetDialog').open) {
      trackEvent('nest_empty', {
        balance: state.balance,
        trade_count: state.trades.length,
        candle_index: state.index,
      });
      $('resetDialog').showModal();
    }
  }
}

function step() {
  if (state.index >= candles.length) {
    pause();
    trackEvent('demo_complete', {
      balance: state.balance,
      trade_count: state.trades.length,
    });
    const pop = document.createElement('div');
    pop.className = 'pnl-pop win';
    pop.innerHTML = '<span class="quip">THE END!</span><b>Restart?</b>';
    $('fx').appendChild(pop);
    pop.addEventListener('animationend', (e) => { if (e.target === pop) pop.remove(); });
    return;
  }
  const c = candles[state.index];
  state.index++;
  animateCandle(c);
  if (state.position) {
    const exit = checkExit(state.position, c);
    if (exit) closePosition(exit.price, exit.reason);
  }
  persist();
  updateUI();
}

const FUNNY_NICKS = [
  'HootLord', 'NestEgg', 'PipOwl', 'BrokeOwl', 'Owlbert',
  'CandleKid', 'Slippy', 'ZoomHoot', 'RiskRick', 'BagHold',
  'MoonHoot', 'DipDip', 'FOMOHoot', 'Hootzilla', 'GoldBeak',
  'TinyLot', 'YoloHoot', 'BearSnack', 'WhooWhoo', 'Feather',
  'NoStop', 'Owlnado', 'PipPip', 'WiseGuy', 'ChartGob',
];

let lastNickBase = '';

function suggestNick() {
  let base = FUNNY_NICKS[Math.floor(Math.random() * FUNNY_NICKS.length)];
  if (FUNNY_NICKS.length > 1) {
    while (base === lastNickBase) {
      base = FUNNY_NICKS[Math.floor(Math.random() * FUNNY_NICKS.length)];
    }
  }
  lastNickBase = base;
  const digits = String(Math.floor(Math.random() * 900) + 100);
  return `${base}${digits}`;
}

function fillSuggestedNick() {
  $('nickInput').value = suggestNick();
  $('nickInput').select();
}

function applyNick(name) {
  const nick = String(name || '').trim();
  const tag = $('nickTag');
  tag.textContent = nick;
  tag.classList.toggle('hidden', !nick);
}

function submitNick() {
  const nick = $('nickInput').value.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!nick) {
    $('nickInput').focus();
    $('nickInput').placeholder = 'Need a name, hoot!';
    sfx.error();
    return;
  }
  saveNick(nick);
  applyNick(nick);
  trackEvent('nickname_set', { nickname_length: nick.length });
  sfx.win();
  $('nickDialog').close();
  play();
}

function play() {
  if (timer || $('resetDialog').open || $('restartDialog').open || $('nickDialog').open) return;
  timer = setInterval(step, CONFIG.tickMs);
  trackEvent('session_play', { candle_index: state.index, balance: state.balance });
  updateUI();
}
function pause() {
  if (timer) {
    trackEvent('session_pause', { candle_index: state.index, balance: state.balance });
  }
  clearInterval(timer);
  timer = null;
  if (candles.length) updateUI();
}

function trade(side) {
  if (state.position) return;
  const res = openPosition(side, current().close, state.balance, current().time);
  if (res.error) {
    trackEvent('trade_open_failed', { side, balance: state.balance, error: res.error });
    sfx.error();
    spawnPnlFx(-1, 'ERR');
    const pop = $('fx').lastElementChild;
    if (pop) {
      pop.className = 'pnl-pop lose';
      pop.querySelector('.quip').textContent = 'NOPE!';
      pop.querySelector('b').textContent = res.error;
    }
    return;
  }
  side === 'buy' ? sfx.buy() : sfx.sell();
  state.position = res.position;
  trackEvent('trade_open', {
    side,
    entry_price: res.position.entry,
    balance: state.balance,
    candle_index: state.index,
  });
  drawLines();
  persist();
  updateUI();
  updateLiveGlow();
}

function renderAll() {
  clearLines();
  ensureHistory();
  snapPriceView();
  series.setData(candles.slice(0, state.index));
  fillTimeScale();
  drawLines();
  updateUI();
  requestAnimationFrame(() => {
    fillTimeScale();
    snapPriceView();
    series.priceScale().applyOptions({ autoScale: true });
    updateLiveGlow();
  });
}

function resetAccount() {
  state.balance = CONFIG.startBalance;
  state.position = null;
  clearLines();
  persist();
  updateUI();
}

$('btnBuy').onclick = () => trade('buy');
$('btnSell').onclick = () => trade('sell');
$('btnClose').onclick = () => { closePosition(current().close, 'MANUAL'); persist(); updateUI(); };
$('btnPlay').onclick = () => { sfx.click(); timer ? pause() : play(); };
$('btnMute').onclick = () => {
  sfx.setMuted(!sfx.isMuted());
  trackEvent('sound_toggle', { muted: sfx.isMuted() });
  if (!sfx.isMuted()) sfx.click();
  setMuteUi();
};
$('btnReset').onclick = () => {
  $('resetDialog').close();
  trackEvent('nest_refill', { trade_count: state.trades.length, candle_index: state.index });
  sfx.win();
  resetAccount();
  play();
};
$('btnNick').onclick = () => submitNick();
$('btnShuffle').onclick = () => { sfx.click(); fillSuggestedNick(); trackEvent('nickname_shuffle'); };
$('nickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitNick(); });
$('nickDialog').addEventListener('cancel', (e) => e.preventDefault());
$('resetDialog').addEventListener('cancel', (e) => e.preventDefault());
$('btnRestart').onclick = () => {
  pause();
  trackEvent('run_restart_prompt', { balance: state.balance, trade_count: state.trades.length });
  $('restartDialog').showModal();
};
$('btnRestartNo').onclick = () => {
  $('restartDialog').close();
  trackEvent('run_restart_cancel');
  play();
};
$('btnRestartYes').onclick = () => {
  $('restartDialog').close();
  trackEvent('run_restart_confirm', { balance: state.balance, trade_count: state.trades.length });
  pause();
  state = newState();
  persist();
  renderAll();
  play();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    trackEvent('tab_hidden', { candle_index: state.index });
    pause();
  }
});
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
chart.timeScale().subscribeVisibleLogicalRangeChange(() => updateLiveGlow());
window.addEventListener('resize', () => {
  fillTimeScale();
  updateLiveGlow();
});

(async function init() {
  renderRules();
  setMuteUi();
  try {
    candles = await loadCandles((t) => ($('loaderText').textContent = t));
  } catch {
    $('loaderText').textContent = 'Could not load the candles. Refresh and try again!';
    return;
  }
  const saved = loadState();
  if (saved && saved.index >= 1 && saved.index <= candles.length) state = saved;
  $('loader').classList.add('hidden');
  renderAll();
  trackEvent('game_ready', {
    candle_count: candles.length,
    resumed: Boolean(saved && saved.index >= 1 && saved.index <= candles.length),
    candle_index: state.index,
    balance: state.balance,
  });
  const nick = loadNick();
  applyNick(nick);
  if (!nick) {
    pause();
    fillSuggestedNick();
    $('nickDialog').showModal();
    requestAnimationFrame(() => $('nickInput').select());
  } else if (state.balance < CONFIG.minBalance) checkBalance();
  else play();
})();
