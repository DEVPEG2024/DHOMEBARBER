/*
 * Crochets de l'écran du salon (contrat docs/fonctions/coupe-spectateurs-contrat.md, section 4.2) :
 * écran gardé allumé, rechargement toutes les 6 h, heure du serveur.
 */
import { useEffect, useRef, useState } from 'react';
import { msOf } from './screenFormat';

/** Rechargement de la page toutes les 6 h (nouveau déploiement du site). */
export const RELOAD_MS = 6 * 60 * 60 * 1000;
// Rechargement repoussé tant qu'un match passe en grand ou que le réseau manque, 1 h au plus
const RELOAD_MAX_DELAY_MS = 60 * 60 * 1000;
const RELOAD_CHECK_MS = 60 * 1000;

/**
 * Écran gardé allumé (`navigator.wakeLock`, quand il existe) ; demandé à nouveau au retour visible
 * (le navigateur le rend quand la page est cachée) et au premier toucher (certains navigateurs
 * l'exigent). Refus ou absence : rien (try/catch).
 */
export function useScreenWakeLock() {
  useEffect(() => {
    let lock = null;
    let alive = true;
    let asking = false;
    const request = async () => {
      if (!alive || asking || document.visibilityState !== 'visible') return;
      if (lock && !lock.released) return;
      const api = typeof navigator === 'undefined' ? null : navigator.wakeLock;
      if (!api || typeof api.request !== 'function') return;
      asking = true;
      try {
        const next = await api.request('screen');
        if (alive) lock = next;
        else next.release?.().catch?.(() => {});
      } catch {
        /* refusé (économie d'énergie, page cachée) : on redemandera */
      } finally {
        asking = false;
      }
    };
    request();
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('pointerdown', request, true);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', request, true);
      try { lock?.release?.()?.catch?.(() => {}); } catch { /* déjà rendu */ }
    };
  }, []);
}

/**
 * Recharge la page 6 h après l'ouverture (nouveau déploiement), repoussé tant que `busy()` est vrai
 * (match en grand) ou que le réseau manque, 1 h au plus. `beforeReload()` : appelé juste avant
 * (clé remise dans l'adresse quand l'appareil ne peut pas la ranger).
 */
export function usePeriodicReload({ busy, beforeReload }) {
  const ref = useRef({ busy, beforeReload });
  ref.current = { busy, beforeReload };
  useEffect(() => {
    const openedAt = Date.now();
    const id = setInterval(() => {
      const age = Date.now() - openedAt;
      if (age < RELOAD_MS) return;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const overdue = age >= RELOAD_MS + RELOAD_MAX_DELAY_MS;
      if (!overdue && (offline || ref.current.busy?.())) return;
      try { ref.current.beforeReload?.(); } catch { /* rien à préparer */ }
      window.location.reload();
    }, RELOAD_CHECK_MS);
    return () => clearInterval(id);
  }, []);
}

/** Heure du serveur (ms) d'après `server_now` et l'arrivée de la réponse, relue toutes les `tickMs`. */
export function useServerNow(serverNow, receivedAt, tickMs = 15 * 1000) {
  const server = msOf(serverNow);
  const offset = server != null && receivedAt ? server - receivedAt : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs, offset]);
  return now + offset;
}
