/** GA4 via gtag. Set GA_ID in `.env` (see vite `envPrefix`). No-op when missing. */

const MEASUREMENT_ID = String(import.meta.env.GA_ID ?? '').trim();

const DEBUG_MODE =
  import.meta.env.DEV ||
  /^(1|true|yes)$/i.test(String(import.meta.env.GA_DEBUG ?? '').trim());

let initialized = false;

function canTrack() {
  return initialized && typeof window.gtag === 'function';
}

export function initAnalytics() {
  if (!MEASUREMENT_ID || initialized) return false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: true,
    cookie_flags: 'SameSite=None;Secure',
    ...(DEBUG_MODE ? { debug_mode: true } : {}),
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  initialized = true;
  return true;
}

/** @param {string} name GA4 event name (snake_case) @param {Record<string, string | number | boolean>} [params] */
export function trackEvent(name, params = {}) {
  if (!canTrack()) return;
  if (DEBUG_MODE) console.debug('[GA4]', name, params);
  window.gtag('event', name, params);
}

export function isAnalyticsEnabled() {
  return Boolean(MEASUREMENT_ID);
}
