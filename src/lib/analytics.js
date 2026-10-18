/**
 * Mesure d'audience interne (Admin → Trafic) : rien n'est envoyé à un service tiers.
 *
 * - Appareil : identifiant aléatoire gardé sur l'appareil (`dhb-vid`), jamais l'email.
 * - Session : ouverte au lancement, ou au retour après 30 min en arrière-plan ; plateforme
 *   (iOS, Android, site, app installée), type d'appareil, page d'entrée, provenance
 *   (notification, lien `?src=`, site d'où l'on vient).
 * - Temps de présence : secondes passées app au premier plan (le chrono s'arrête en arrière-plan).
 * - Pages : chemin sans identifiant ni paramètre (`/barber/:id`), compté à l'arrivée ; le temps
 *   passé part par tranches (`time`) au départ de la page ou à la mise en arrière-plan.
 * - Actions clés (`track`) et publications du fil vues (`trackPostView`).
 * Envoi par lots toutes les 15 s et à la mise en arrière-plan (`fetch` keepalive), compte lu par
 * le serveur sur le jeton. Jamais bloquant : une mesure perdue est perdue.
 * Le client peut refuser dans Paramètres (`dhb-analytics-optout`).
 */
import { API_BASE, getToken } from '@/api/apiClient';
import { isNative, platform as capPlatform } from '@/lib/capacitor';

const VISITOR_KEY = 'dhb-vid';
const OPTOUT_KEY = 'dhb-analytics-optout';
const SESSION_GAP_MS = 30 * 60 * 1000;
const FLUSH_MS = 15 * 1000;
const MAX_QUEUE = 200;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let started = false;
let visitorId = null;
let session = null; // { id, platform, device, app_version, entry_path, source }
let queue = [];
let postViews = new Set();
let sentPostViews = new Set();
let activeMs = 0; // temps au premier plan pas encore envoyé
let visibleSince = null;
let hiddenAt = null;
let page = null; // { name, visibleMs, since }
let pendingSource = null;
let sessionStartedAt = 0;

const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* stockage indisponible */ } },
};

function uuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* repli ci-dessous */ }
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Le client a-t-il refusé la mesure d'audience (Paramètres) ? */
export function isAnalyticsOptedOut() {
  return safeStorage.get(OPTOUT_KEY) === '1';
}

/** Refus ou accord (Paramètres) : le refus vide aussi ce qui attendait d'être envoyé. */
export function setAnalyticsOptOut(optOut) {
  if (optOut) {
    safeStorage.set(OPTOUT_KEY, '1');
    queue = [];
    postViews = new Set();
    activeMs = 0;
  } else {
    safeStorage.remove(OPTOUT_KEY);
    if (started) newSession(currentPath());
  }
}

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
const currentPath = () => (typeof window !== 'undefined' ? window.location.pathname : '/');

/** `/barber/26b9…` → `/barber/:id` ; paramètres et ancre retirés ; 120 caractères au plus. */
export function normalizePath(path) {
  const clean = String(path || '/').split(/[?#]/)[0] || '/';
  const parts = clean.split('/').map((seg) => (UUID_SEGMENT.test(seg) || /^\d+$/.test(seg) ? ':id' : seg.replace(/[^A-Za-z0-9_\-.:]/g, '')));
  const out = parts.join('/').replace(/\/{2,}/g, '/');
  return (out.length > 1 ? out.replace(/\/$/, '') : '/').slice(0, 120) || '/';
}

function platformName() {
  if (isNative) return capPlatform === 'ios' || capPlatform === 'android' ? capPlatform : 'web';
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone) return 'pwa';
  } catch { /* navigateur ancien */ }
  return 'web';
}

function deviceName() {
  try {
    const ua = navigator.userAgent || '';
    const touch = (navigator.maxTouchPoints || 0) > 0;
    const short = Math.min(window.screen?.width || 0, window.screen?.height || 0);
    if (/iPad|Tablet/i.test(ua) || (touch && short >= 600 && !/Mobile/i.test(ua))) return 'tablet';
    if (/Mobi|Android|iPhone/i.test(ua) || (touch && short < 600)) return 'mobile';
    return 'desktop';
  } catch {
    return null;
  }
}

/** Provenance de la session : notification touchée, lien `?src=` / `utm_source`, site d'origine. */
function sourceOf() {
  // Notification touchée juste avant l'ouverture de la session (10 s au plus)
  if (pendingSource && Date.now() - pendingSource.at < 10000) return pendingSource.source;
  try {
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src') || params.get('utm_source');
    if (src && /^[A-Za-z0-9_.\-]{1,40}$/.test(src)) return `lien:${src}`;
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.host && ref.host !== window.location.host) return `site:${ref.host.replace(/^www\./, '').slice(0, 50)}`;
  } catch { /* adresse illisible */ }
  return 'direct';
}

function newSession(path) {
  session = {
    id: uuid(),
    platform: platformName(),
    device: deviceName(),
    app_version: session?.app_version || (isNative ? null : 'web'),
    entry_path: normalizePath(path),
    source: sourceOf(),
  };
  pendingSource = null;
  sessionStartedAt = Date.now();
  sentPostViews = new Set();
  page = null;
  enterPage(path);
}

function push(event) {
  if (isAnalyticsOptedOut() || !session) return;
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
}

// Temps de présence et temps passé sur la page en cours : comptés seulement au premier plan
function settleVisible(now = Date.now()) {
  if (visibleSince == null) return;
  const delta = Math.max(0, now - visibleSince);
  activeMs += delta;
  if (page) page.visibleMs += delta;
  visibleSince = now;
}

function leavePage() {
  if (!page) return;
  settleVisible();
  if (page.visibleMs >= 1000) push({ type: 'time', name: page.name, duration_ms: Math.round(page.visibleMs) });
  page.visibleMs = 0;
}

function enterPage(path) {
  const name = normalizePath(path);
  if (page && page.name === name) return;
  leavePage();
  page = { name, visibleMs: 0 };
  push({ type: 'page', name });
}

async function flush({ keepalive = false } = {}) {
  if (isAnalyticsOptedOut() || !session) return;
  if (isVisible()) settleVisible();
  const seconds = Math.floor(activeMs / 1000);
  const views = [...postViews].slice(0, 30);
  if (!queue.length && !views.length && seconds < 1) return;
  const events = queue.slice(0, 50);
  const activeSeconds = Math.min(seconds, 120);
  const body = {
    session: { ...session, visitor_id: visitorId },
    active_seconds: activeSeconds,
    events,
    post_views: views,
  };
  // Retirés avant l'envoi : un nouveau lot ne renvoie jamais les mêmes événements
  queue = queue.slice(events.length);
  activeMs -= activeSeconds * 1000;
  views.forEach((id) => { postViews.delete(id); sentPostViews.add(id); });
  try {
    const token = getToken();
    await fetch(`${API_BASE}/analytics/collect`, {
      method: 'POST',
      keepalive,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch { /* hors ligne : mesure perdue */ }
  if (queue.length >= 50) flush({ keepalive });
}

function onVisibility() {
  if (isAnalyticsOptedOut()) return;
  const now = Date.now();
  if (!isVisible()) {
    settleVisible(now);
    visibleSince = null;
    hiddenAt = now;
    leavePage();
    flush({ keepalive: true });
    return;
  }
  // Retour au premier plan : nouvelle session après 30 min, sinon la page reprend son chrono
  if (hiddenAt && now - hiddenAt > SESSION_GAP_MS) newSession(currentPath());
  hiddenAt = null;
  visibleSince = now;
}

/** À appeler une fois (App.jsx). */
export function initAnalytics() {
  if (started || typeof window === 'undefined') return;
  started = true;
  visitorId = safeStorage.get(VISITOR_KEY);
  if (!visitorId || !UUID_SEGMENT.test(visitorId)) {
    visitorId = uuid();
    safeStorage.set(VISITOR_KEY, visitorId);
  }
  visibleSince = isVisible() ? Date.now() : null;
  if (!isAnalyticsOptedOut()) newSession(currentPath());
  if (isNative) {
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => { if (session && info?.version) session.app_version = String(info.version).slice(0, 20); })
      .catch(() => {});
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => { leavePage(); flush({ keepalive: true }); });
  window.setInterval(() => { if (isVisible()) flush(); }, FLUSH_MS);
}

/** Changement de page (routeur). */
export function trackPage(path) {
  if (!started || isAnalyticsOptedOut()) return;
  if (!session) { newSession(path); return; }
  enterPage(path);
}

/** Action clé : `track('booking_done', { services: 2 })` (nom en minuscules, 8 propriétés au plus). */
export function track(name, props) {
  if (!started || isAnalyticsOptedOut()) return;
  push({ type: 'action', name, props: props || undefined });
}

/** Publication du fil vue (une fois par session et par publication). */
export function trackPostView(postId) {
  if (!started || isAnalyticsOptedOut() || !postId) return;
  const id = String(postId);
  if (sentPostViews.has(id) || !UUID_SEGMENT.test(id)) return;
  postViews.add(id);
}

/**
 * Notification touchée (`noteSource('push')`) : comptée comme action, et provenance de la session
 * si elle vient de s'ouvrir (l'app relancée ou revenue après 30 min), ou de celle qui s'ouvre
 * dans les 10 s (la notification est parfois signalée avant le retour au premier plan).
 */
export function noteSource(source) {
  if (!/^[a-z_]{1,20}$/.test(String(source || ''))) return;
  track(`${source}_open`);
  if (session && Date.now() - sessionStartedAt < 5000) session.source = source;
  else pendingSource = { source, at: Date.now() };
}
