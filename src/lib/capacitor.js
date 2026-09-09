import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Browser } from '@capacitor/browser';

/**
 * Returns true if running inside a native Capacitor shell (iOS/Android)
 */
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/**
 * Initialize native plugins — call once at app startup
 */
export async function initCapacitor() {
  if (!isNative) return;

  // Status bar
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#1a1a2e' });
    }
  } catch {}

  // Hide splash screen after app is ready
  try {
    await SplashScreen.hide();
  } catch {}

  // Clavier : le champ actif doit rester visible (Apple, review du 9 sept. 2026 sur iPad Air
  // en mode compatibilité iPhone : le clavier recouvrait les champs de connexion).
  // Trois mécanismes complémentaires, aucun ne suffit seul sur tous les appareils :
  //  1. capacitor.config.ts → Keyboard.resize = 'native' : la WKWebView est réduite de la
  //     hauteur du clavier, donc le document a réellement moins de place ;
  //  2. visualViewport : ce qui reste recouvert malgré tout (clavier flottant / détaché de
  //     l'iPad, hauteur mal rapportée) est posé dans --keyboard-overlap, que body.keyboard-open
  //     ajoute en padding-bottom (src/index.css) ;
  //  3. le champ qui reçoit le focus est ramené au centre de la zone visible une fois le
  //     clavier ouvert (keyboardDidShow, et repli 350 ms après le focus si l'événement ne vient pas).
  initKeyboardHandling();

  // Handle back button on Android
  if (platform === 'android') {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  }

  // Handle deep links
  App.addListener('appUrlOpen', (event) => {
    const url = new URL(event.url);
    if (url.pathname) {
      window.location.hash = url.pathname;
    }
  });
}

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';
const isEditable = (el) => !!el && typeof el.matches === 'function' && el.matches(EDITABLE)
  && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type);

/** Ramène le champ actif au centre de la zone visible (une fois le clavier ouvert). */
function revealActiveField() {
  const el = document.activeElement;
  if (!isEditable(el)) return;
  try {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    el.scrollIntoView();
  }
}

/** Partie de la fenêtre recouverte par le clavier, d'après visualViewport (0 si inconnu). */
function keyboardOverlap() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
}

function setKeyboardOpen(open, overlap) {
  const root = document.documentElement;
  root.style.setProperty('--keyboard-overlap', `${open ? overlap : 0}px`);
  document.body.classList.toggle('keyboard-open', open);
}

let keyboardHandlingReady = false;
function initKeyboardHandling() {
  if (keyboardHandlingReady) return;
  keyboardHandlingReady = true;
  let revealTimer = null;
  const scheduleReveal = (delay) => {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = setTimeout(() => { revealTimer = null; revealActiveField(); }, delay);
  };

  // 1. Événements du plugin (iOS et Android). Si la fenêtre n'a pas rétréci entre
  //    keyboardWillShow et keyboardDidShow (iPad en mode compatibilité iPhone : la WKWebView
  //    reste derrière le clavier malgré resize = native), la hauteur du clavier rapportée par
  //    le plugin devient le recouvrement à réserver sous le contenu.
  let heightBeforeKeyboard = null;
  let lastKeyboardHeight = 0;
  try {
    Keyboard.addListener('keyboardWillShow', (info) => {
      heightBeforeKeyboard = window.innerHeight;
      lastKeyboardHeight = Math.round(Number(info && info.keyboardHeight) || 0);
      setKeyboardOpen(true, keyboardOverlap());
    });
    Keyboard.addListener('keyboardDidShow', (info) => {
      const kb = Math.round(Number(info && info.keyboardHeight) || lastKeyboardHeight || 0);
      const resized = heightBeforeKeyboard != null && window.innerHeight < heightBeforeKeyboard - 40;
      setKeyboardOpen(true, Math.max(keyboardOverlap(), resized ? 0 : kb));
      scheduleReveal(80);
      // Deuxième passe après la mise en page du padding (et l'animation du clavier)
      setTimeout(revealActiveField, 450);
    });
    Keyboard.addListener('keyboardWillHide', () => { heightBeforeKeyboard = null; setKeyboardOpen(false, 0); });
    Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false, 0));
  } catch {}

  // 2. Repli visualViewport : recouvrement réel quand le navigateur le rapporte (web mobile).
  //    Ne fait que compléter, jamais refermer : la fermeture vient du plugin ou de la perte de focus
  //    (un événement `scroll` de visualViewport avec recouvrement 0 ne veut pas dire clavier fermé).
  const vv = window.visualViewport;
  if (vv) {
    const onViewport = () => {
      const overlap = keyboardOverlap();
      // Seuil : les barres du navigateur font bouger visualViewport de quelques pixels
      if (!isEditable(document.activeElement) || overlap <= 40) return;
      const current = parseInt(document.documentElement.style.getPropertyValue('--keyboard-overlap'), 10) || 0;
      if (overlap > current) setKeyboardOpen(true, overlap);
    };
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
  }

  // 3. Focus : laisser au clavier le temps d'apparaître, puis révéler le champ
  document.addEventListener('focusin', (e) => {
    if (isEditable(e.target)) scheduleReveal(350);
  });
  document.addEventListener('focusout', () => {
    // Sans champ actif il n'y a plus rien à protéger (le plugin confirme par keyboardWillHide)
    setTimeout(() => { if (!isEditable(document.activeElement)) setKeyboardOpen(false, 0); }, 100);
  });
}

/**
 * Haptic feedback — uses native Capacitor plugin on iOS/Android, falls back to navigator.vibrate
 */
export async function hapticFeedback() {
  if (isNative) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  } else if (navigator.vibrate) {
    navigator.vibrate(50);
  }
}

/**
 * Open external URL — uses native in-app browser on iOS/Android, falls back to window.open
 */
export async function openExternalUrl(url) {
  if (isNative) {
    try {
      await Browser.open({ url });
    } catch {}
  } else {
    window.open(url, '_blank');
  }
}
