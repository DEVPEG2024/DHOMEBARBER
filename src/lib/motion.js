/**
 * Accès au gyroscope (événements `deviceorientation`) pour l'inclinaison des cartes FUT.
 *
 * - Android, ordinateurs, navigateurs sans `requestPermission` : aucune autorisation,
 *   l'état est « granted » d'emblée (sans capteur, aucun événement n'arrive, rien ne change).
 * - iOS 13+ (Safari et WKWebView de l'app) : `DeviceOrientationEvent.requestPermission()`
 *   doit être appelé pendant un vrai geste utilisateur, et pour Safari un appui (pointerdown)
 *   n'en est pas un : seuls le relâchement (touchend / pointerup), le clic et une touche comptent.
 *   On arme donc la demande au niveau de l'application : elle part au premier geste, où qu'il
 *   soit dans l'app, une seule fois, et le résultat est mémorisé (`localStorage`) pour que les
 *   cartes écoutent dès l'ouverture les fois suivantes. Un refus est mémorisé aussi : iOS ne
 *   réaffiche pas la boîte de dialogue, l'appel renvoie « denied » sans rien montrer.
 *
 * Les composants s'abonnent avec `onMotionPermission` et lisent `motionPermissionState()`.
 */

const STORAGE_KEY = 'dhb-motion-permission';

/** 'unknown' | 'granted' | 'denied' | 'unsupported' */
let state = 'unknown';
let initialized = false;
let inFlight = null;
const listeners = new Set();

const needsPermission = () =>
  typeof window !== 'undefined' && typeof window.DeviceOrientationEvent?.requestPermission === 'function';

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

const GESTURE_EVENTS = ['touchend', 'pointerup', 'click', 'keydown'];

/**
 * Arme la demande d'autorisation sur le premier geste utilisateur, n'importe où dans l'app.
 * Sans effet hors iOS. Se désarme dès qu'une réponse ferme (accordé / refusé) est obtenue.
 */
export function armMotionPermissionOnFirstGesture() {
  initMotionState();
  if (!needsPermission()) return;
  const handler = () => {
    requestMotionPermission().then((result) => {
      if (result === 'granted' || result === 'denied') disarm();
    });
  };
  const disarm = () => GESTURE_EVENTS.forEach((ev) => window.removeEventListener(ev, handler, true));
  GESTURE_EVENTS.forEach((ev) => window.addEventListener(ev, handler, true));
}
