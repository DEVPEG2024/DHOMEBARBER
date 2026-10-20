/**
 * Accès au gyroscope (événements `deviceorientation`) pour l'inclinaison des cartes FUT.
 *
 * - Android, ordinateurs, navigateurs sans `requestPermission` : aucune autorisation,
 *   l'état est « granted » d'emblée (sans capteur, aucun événement n'arrive, rien ne change).
 *   Chromium récent expose lui aussi `DeviceOrientationEvent.requestPermission` (accordée sans
 *   boîte de dialogue, événements reçus de toute façon) : seul un iPhone / iPad est traité comme
 *   iOS (`isAppleTouchDevice`), sinon la fenêtre « Fais bouger la carte » s'ouvrait sur Chrome
 *   ordinateur et Android (relevé par les tests de bout en bout le 20 oct. 2026).
 * - iOS 13+ (Safari et WKWebView de l'app) : `DeviceOrientationEvent.requestPermission()`
 *   doit être appelé pendant un vrai geste utilisateur, et pour Safari un appui (pointerdown)
 *   n'en est pas un : seuls le relâchement (touchend / pointerup), le clic et une touche comptent.
 *   WebKit ne garde la décision qu'EN MÉMOIRE : à chaque relance de l'app (ou de Safari), aucun
 *   événement n'arrive tant que la demande n'a pas été refaite pendant un geste. D'où
 *   `startMotionPermission`, appelé au démarrage (19 oct. 2026 : jusque-là, l'effet 3D ne
 *   marchait que pendant la session où « Activer » avait été touché) :
 *   · app iPhone (Capacitor) : la WebView accorde d'office, sans boîte de dialogue
 *     (`WebViewDelegationHandler` → `.grant`) ; la demande part donc en silence au premier
 *     toucher, à chaque lancement, et la fenêtre `MotionPrompt` n'a rien à expliquer ;
 *   · Safari / app web installée : la première fois, la fenêtre `MotionPrompt` explique et
 *     « Activer » demande ; une autorisation déjà donnée est redemandée au premier toucher sur
 *     une page de carte (Safari ne remontre sa boîte que s'il a été relancé entre-temps).
 *   Le résultat est mémorisé (`localStorage`) pour que les cartes écoutent dès l'ouverture. Un
 *   refus est mémorisé aussi : la boîte n'est plus réaffichée.
 *
 * Les composants s'abonnent avec `onMotionPermission` et lisent `motionPermissionState()`.
 */
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'dhb-motion-permission';
// Pages où une carte s'incline (carte d'un barber, carte Gang du client)
const CARD_PAGES = /^\/(barber\/|profile$|gang-card)/;

const inNativeShell = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

/** 'unknown' | 'granted' | 'denied' | 'unsupported' */
let state = 'unknown';
let initialized = false;
let inFlight = null;
const listeners = new Set();

/** iPhone, iPad, iPod : tous leurs navigateurs sont WebKit, qui exige et oublie l'autorisation. */
export function isAppleTouchDevice() {
  try {
    if (inNativeShell()) return Capacitor.getPlatform() === 'ios';
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    // iPadOS en mode « site pour ordinateur » : se présente comme un Mac, mais tactile
    return /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  } catch {
    return false;
  }
}

const needsPermission = () =>
  typeof window !== 'undefined'
  && typeof window.DeviceOrientationEvent?.requestPermission === 'function'
  && isAppleTouchDevice();

function readStored() {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function store(value) {
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* stockage indisponible */ }
}
function setState(next) {
  if (next === state) return;
  state = next;
  if (next === 'granted' || next === 'denied') store(next);
  listeners.forEach((cb) => { try { cb(state); } catch { /* écouteur défaillant : on continue */ } });
}

/** Détermine l'état initial sans rien demander (appelé automatiquement). */
export function initMotionState() {
  if (initialized) return state;
  initialized = true;
  if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
    state = 'unsupported';
  } else if (!needsPermission()) {
    state = 'granted';
  } else {
    // iOS : on repart de la décision mémorisée ; « granted » permet d'écouter tout de suite,
    // la demande au premier geste confirmera (elle se résout sans dialogue si déjà accordée)
    const stored = readStored();
    state = stored === 'granted' || stored === 'denied' ? stored : 'unknown';
  }
  return state;
}

export function motionPermissionState() {
  return initMotionState();
}

/** Abonnement aux changements d'état ; renvoie la fonction de désabonnement. */
export function onMotionPermission(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Demande l'autorisation (à appeler pendant un geste utilisateur sur iOS).
 * Résout l'état résultant ; un rejet de la promesse native (appel hors geste) laisse l'état inchangé.
 */
export function requestMotionPermission() {
  initMotionState();
  if (!needsPermission()) return Promise.resolve(state);
  if (inFlight) return inFlight;
  inFlight = window.DeviceOrientationEvent.requestPermission()
    .then((result) => {
      setState(result === 'granted' ? 'granted' : 'denied');
      return state;
    })
    .catch(() => state)
    .finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Vrai quand une autorisation explicite est à demander (iOS, Safari) et pas encore décidée.
 * Faux dans l'app iPhone : la WebView accorde sans rien afficher, `startMotionPermission` s'en charge.
 */
export function motionPermissionPending() {
  return needsPermission() && !inNativeShell() && initMotionState() === 'unknown';
}

const GESTURE_EVENTS = ['touchend', 'pointerup', 'click', 'keydown'];

/**
 * Arme la demande d'autorisation sur le premier geste utilisateur (seulement quand `when()` est
 * vrai, partout sinon). Sans effet hors iOS. Se désarme dès qu'une réponse ferme (accordé /
 * refusé) est obtenue ; un appel rejeté (hors geste) laisse le prochain geste réessayer.
 */
export function armMotionPermissionOnFirstGesture({ when } = {}) {
  initMotionState();
  if (!needsPermission()) return;
  const handler = () => {
    if (when && !when()) return;
    requestMotionPermission().then((result) => {
      if (result === 'granted' || result === 'denied') disarm();
    });
  };
  const disarm = () => GESTURE_EVENTS.forEach((ev) => window.removeEventListener(ev, handler, true));
  GESTURE_EVENTS.forEach((ev) => window.addEventListener(ev, handler, true));
}

let started = false;
/**
 * Au démarrage de l'app (main.jsx) : rétablit l'accès au gyroscope que WebKit a oublié depuis la
 * dernière ouverture. App iPhone : au premier toucher, sans boîte de dialogue. Safari : seulement
 * si l'autorisation avait déjà été donnée, au premier toucher sur une page de carte. Ailleurs, rien.
 */
export function startMotionPermission() {
  if (started) return;
  started = true;
  initMotionState();
  if (!needsPermission()) return;
  // App iPhone : jamais de refus possible (la WebView accorde toujours), même un « denied » resté
  // d'une ancienne version est redemandé
  if (inNativeShell()) {
    armMotionPermissionOnFirstGesture();
    return;
  }
  if (state === 'granted') {
    armMotionPermissionOnFirstGesture({ when: () => CARD_PAGES.test(window.location.pathname) });
  }
}
