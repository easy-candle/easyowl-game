# EasyOwl

Client-side trading simulation game. EURUSD 5m replay, 1% risk, fixed lot, RR 1:1.5.

    npm install
    npm run dev        # local
    npm run build      # dist/ for Vercel

Deploy:

- **GitHub Pages** — push to `main`; Actions builds and publishes `dist/`. In repo **Settings → Pages**, set source to **GitHub Actions**. Custom domain: `https://game.easycandle.app/`. The `github.io/easyowl-game/` URL 404s once a custom domain is set — that is expected.
- **Vercel** — import the repo (framework: Vite). No extra config.

## Real data
public/data/eurusd-5m.json ships with synthetic demo data.
Replace it with real candles: `npm run csv-to-json -- your.csv`
(columns: time,open,high,low,close). If you change the file, bump CANDLES_KEY in src/storage.js
so browsers re-download it.

## Tuning
All rules are in CONFIG at the top of src/game.js.
