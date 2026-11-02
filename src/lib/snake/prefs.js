/**
 * Snake du Gang : réglages de l'appareil (niveau, bips, vibrations), gardés dans le navigateur.
 * Le choix du classement, lui, est sur le serveur (`PATCH /snake/settings`).
 *
 *   const [prefs, setPrefs] = useSnakePrefs();   // { level, bips, vibrations }
 *   setPrefs({ level: 7 });
 *
 * Lecture et écriture jamais bloquantes (navigation privée, stockage refusé : valeurs par défaut).
 * Les écrans ouverts se suivent : un changement dans « Vitesse et options » est vu par le menu.
 */
import { useCallback, useEffect, useState } from 'react';
import { LEVEL_DEFAULT, isLevel } from './engine';

const STORAGE_KEY = 'dhb-snake-prefs';
const EVENT = 'dhb:snake-prefs';
export const DEFAULT_PREFS = Object.freeze({ level: LEVEL_DEFAULT, bips: true, vibrations: true });

function clean(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    level: isLevel(p.level) ? p.level : DEFAULT_PREFS.level,
    bips: typeof p.bips === 'boolean' ? p.bips : DEFAULT_PREFS.bips,
    vibrations: typeof p.vibrations === 'boolean' ? p.vibrations : DEFAULT_PREFS.vibrations,
  };
}

export function readSnakePrefs() {
  try {
    return clean(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Enregistre `patch` (champs inconnus ou invalides ignorés) et prévient les écrans ouverts. */
export function writeSnakePrefs(patch) {
  const next = clean({ ...readSnakePrefs(), ...(patch || {}) });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* stockage refusé : le réglage vaut pour cette visite seulement */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    /* navigateur sans CustomEvent : rien à prévenir */
  }
  return next;
}

export function useSnakePrefs() {
  const [prefs, setPrefsState] = useState(readSnakePrefs);
  useEffect(() => {
    const onChange = (e) => setPrefsState(e && e.detail ? clean(e.detail) : readSnakePrefs());
    const onStorage = (e) => { if (e.key === STORAGE_KEY) setPrefsState(readSnakePrefs()); };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const setPrefs = useCallback((patch) => setPrefsState(writeSnakePrefs(patch)), []);
  return [prefs, setPrefs];
}
