export const CONFIG = {
  startBalance: 1000,
  leverage: 100,
  riskPct: 0.01,       // 1% of the starting balance risked per trade
  lotUnits: 10000,     // fixed size: 0.1 lot = 10,000 EUR
  rr: 1.5,             // take profit = 1.5 x risk
  minBalance: 50,
  initialCandles: 80,
  barSpacing: 12,
  tickMs: 1000,
};

export const slDistance = () => riskAmount() / CONFIG.lotUnits;
export const tpDistance = () => slDistance() * CONFIG.rr;

const round5 = (x) => Math.round(x * 1e5) / 1e5;

export const riskAmount = () => CONFIG.startBalance * CONFIG.riskPct;

export function newState() {
  return { balance: CONFIG.startBalance, index: CONFIG.initialCandles, position: null, trades: [] };
}

export function pnlAt(position, price) {
  const dir = position.side === 'buy' ? 1 : -1;
  return dir * (price - position.entry) * position.units;
}

export function openPosition(side, price, balance, time) {
  const units = CONFIG.lotUnits;
  const margin = (units * price) / CONFIG.leverage;
  if (margin > balance) return { error: 'Not enough margin' };

  const slDist = riskAmount() / units;
  const tpDist = slDist * CONFIG.rr;
  const dir = side === 'buy' ? 1 : -1;
  return {
    position: {
      side,
      units,
      entry: price,
      sl: round5(price - dir * slDist),
      tp: round5(price + dir * tpDist),
      time,
    },
  };
}

// If SL and TP are both inside one candle we assume SL came first (pessimistic).
export function checkExit(position, candle) {
  const buy = position.side === 'buy';
  const slHit = buy ? candle.low <= position.sl : candle.high >= position.sl;
  const tpHit = buy ? candle.high >= position.tp : candle.low <= position.tp;
  if (slHit) return { price: position.sl, reason: 'SL' };
  if (tpHit) return { price: position.tp, reason: 'TP' };
  return null;
}
