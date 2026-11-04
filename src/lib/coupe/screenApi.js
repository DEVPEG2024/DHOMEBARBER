/**
 * Écran du salon de La Coupe du Gang (contrat docs/fonctions/coupe-spectateurs-contrat.md, sections
 * 2 et 4.2) : clé d'écran et lecture de `GET /coupe/screen`.
 *
 * - Clé : donnée par l'admin dans le lien `https://dhomebarber.fr/ecran#cle=<clé>`, rangée sur
 *   l'appareil (`SCREEN_KEY_STORAGE`, try/catch : navigation privée, stockage bloqué) puis retirée
 *   de l'adresse par la page. Jamais envoyée ailleurs qu'en en-tête `X-Screen-Key`.
 * - Lecture par `fetch` direct, **jamais par `apiClient`** : l'écran n'a pas de compte, et un 401 /
 *   403 passé par `apiClient` déclencherait la déconnexion de l'app (`dhb:unauthorized`). Toutes
 *   les 15 s, toutes les 5 s quand un tournoi est en cours ou va commencer (`tournament` non nul).
 * - 403 (`screen_revoked`) : écran coupé par le salon, clé oubliée, plus aucune lecture.
 *   404 (`disabled` : COUPE_SPECTATEURS=off, ou serveur d'avant l'écran) : écran fermé, relu chaque
 *   minute (il revient seul). Panne réseau ou 5xx : dernières données gardées, `offline` vrai.
 *   429 : on attend la lecture suivante, sans rien changer à l'écran.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/api/apiClient';
import { SCREEN_KEY_STORAGE } from './watch';

export const SCREEN_POLL_MS = 15 * 1000;
export const SCREEN_TOURNAMENT_POLL_MS = 5 * 1000;
export const SCREEN_CLOSED_POLL_MS = 60 * 1000;
export const SCREEN_TIMEOUT_MS = 10 * 1000;

// 24 octets aléatoires en base64url (32 caractères) côté serveur ; bornes larges, alphabet strict
const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

export const isScreenKey = (v) => typeof v === 'string' && KEY_RE.test(v);

/** Clé du lien (`#cle=<clé>`), ou null (absente ou mal formée). */
export function keyFromHash(hash) {
  const m = /(?:^#|[#&])cle=([^&]*)/.exec(String(hash || ''));
  if (!m) return null;
  let value;
  try { value = decodeURIComponent(m[1]).trim(); } catch { return null; }
  return isScreenKey(value) ? value : null;
}

/** L'adresse porte-t-elle une clé (même mal formée) ? Elle est retirée dans tous les cas. */
export const hashHasKey = (hash) => /(?:^#|[#&])cle=/.test(String(hash || ''));

export function readStoredScreenKey() {
  try {
    const v = localStorage.getItem(SCREEN_KEY_STORAGE);
    return isScreenKey(v) ? v : null;
  } catch {
    return null;
  }
}

/** Range la clé ; vrai si elle est bien relue (faux : stockage indisponible, clé gardée en mémoire). */
export function storeScreenKey(key) {
  try {
    localStorage.setItem(SCREEN_KEY_STORAGE, key);
    return localStorage.getItem(SCREEN_KEY_STORAGE) === key;
  } catch {
    return false;
  }
}

export function forgetScreenKey() {
  try { localStorage.removeItem(SCREEN_KEY_STORAGE); } catch { /* stockage indisponible */ }
}

/**
 * Une lecture de `GET /coupe/screen`. Ne rejette jamais :
 * `{ kind: 'ok', data }` | `{ kind: 'revoked' }` | `{ kind: 'closed', code }` | `{ kind: 'busy' }`
 * | `{ kind: 'offline' }` (réseau, délai dépassé, 5xx, réponse illisible).
 */
export async function fetchScreen(key, { timeoutMs = SCREEN_TIMEOUT_MS } = {}) {
  const ctrl = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  let data = null;
  try {
    res = await fetch(apiUrl('/coupe/screen'), {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Screen-Key': key },
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl?.signal,
    });
    data = await res.json().catch((err) => {
      if (err?.name === 'AbortError') throw err;
      return null;
    });
  } catch {
    return { kind: 'offline' };
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.ok) return data && typeof data === 'object' ? { kind: 'ok', data } : { kind: 'offline' };
  if (res.status === 403) return { kind: 'revoked' };
  if (res.status === 404) return { kind: 'closed', code: data?.code || null };
  if (res.status === 429) return { kind: 'busy' };
  return { kind: 'offline' };
}

/** Prochaine lecture après une réponse (`tournament` non nul : 5 s). */
export const screenPollMs = (data) => (data?.tournament ? SCREEN_TOURNAMENT_POLL_MS : SCREEN_POLL_MS);

/**
 * Données de l'écran, relues seules. `key` null : rien n'est lu (`status: 'nokey'`).
 * Rend `{ status, data, receivedAt, offline, closedCode, refresh }` :
 *  - `status` : 'nokey' | 'loading' | 'ready' (données affichables) | 'offline' (aucune donnée,
 *    réseau absent) | 'closed' (404) | 'revoked' (403) ;
 *  - `offline` : la dernière lecture a échoué alors que des données sont affichées (bandeau) ;
 *  - `receivedAt` : heure de l'écran à l'arrivée de `data` (avec `data.server_now` : heure du serveur).
 * `onRevoked()` : appelé une fois quand le serveur dit que l'écran est coupé.
 * `refresh()` : relecture tout de suite (ou juste après celle en cours) ; la socket de l'écran
 * coupée la demande, la clé n'est oubliée que sur le 403 de cette lecture (décision A1).
 */
export function useScreenFeed(key, { onRevoked } = {}) {
  const [state, setState] = useState(() => ({
    status: key ? 'loading' : 'nokey', data: null, receivedAt: 0, offline: false, closedCode: null,
  }));
  const revokedRef = useRef(onRevoked);
  revokedRef.current = onRevoked;
  const kickRef = useRef(() => {});

  useEffect(() => {
    if (!key) {
      setState({ status: 'nokey', data: null, receivedAt: 0, offline: false, closedCode: null });
      return undefined;
    }
    let alive = true;
    let timer = null;
    let running = false;
    // Relecture demandée pendant une lecture (socket de l'écran coupée) : refaite juste après
    let again = false;
    let lastData = null;

    const schedule = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(run, again ? 0 : ms);
      again = false;
    };

    async function run() {
      if (!alive || running) return;
      running = true;
      const r = await fetchScreen(key);
      running = false;
      if (!alive) return;
      if (r.kind === 'ok') {
        lastData = r.data;
        setState({ status: 'ready', data: r.data, receivedAt: Date.now(), offline: false, closedCode: null });
        schedule(screenPollMs(r.data));
        return;
      }
      if (r.kind === 'revoked') {
        clearTimeout(timer);
        setState({ status: 'revoked', data: null, receivedAt: 0, offline: false, closedCode: null });
        revokedRef.current?.();
        return;
      }
      if (r.kind === 'closed') {
        lastData = null;
        setState({ status: 'closed', data: null, receivedAt: 0, offline: false, closedCode: r.code });
        schedule(SCREEN_CLOSED_POLL_MS);
        return;
      }
      if (r.kind === 'busy') {
        schedule(SCREEN_POLL_MS);
        return;
      }
      // Réseau : on garde ce qui est affiché, avec le bandeau ; rien d'affiché → écran d'attente
      setState((s) => (s.data ? { ...s, offline: true } : { ...s, status: 'offline', offline: true }));
      schedule(screenPollMs(lastData));
    }

    kickRef.current = () => {
      if (!alive) return;
      if (running) again = true;
      else schedule(0);
    };
    setState((s) => (s.status === 'nokey' ? { ...s, status: 'loading' } : s));
    run();

    // Retour du réseau, écran rallumé : relu tout de suite
    const onOnline = () => kickRef.current();
    const onVisible = () => { if (document.visibilityState === 'visible') kickRef.current(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key]);

  const refresh = useCallback(() => kickRef.current(), []);
  return { ...state, refresh };
}
