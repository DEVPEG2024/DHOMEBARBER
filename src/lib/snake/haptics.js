/**
 * Snake du Gang : vibrations (réglage « Vibrations », `prefs.vibrations`, appliqué par l'appelant).
 *
 * `@capacitor/haptics` dans les apps, `navigator.vibrate` sur le web (Android ; iPhone sans
 * vibreur côté web : rien). Toujours dans un try : un refus ne casse jamais le jeu.
 *
 *   vibrate('eat');   // 'eat' (bouchée), 'caught' (bestiole attrapée), 'die' (perdu)
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Motifs du web (ms) : très court pour une bouchée, plus net pour une bestiole, long pour la fin
const WEB = { eat: 12, caught: [25, 40, 25], die: [90, 60, 160] };

function isNative() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

export function vibrate(kind) {
  if (!WEB[kind]) return;
  if (isNative()) {
    let p;
    try {
      if (kind === 'die') p = Haptics.notification({ type: NotificationType.Error });
      else p = Haptics.impact({ style: kind === 'caught' ? ImpactStyle.Medium : ImpactStyle.Light });
    } catch {
      p = null;
    }
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return;
  }
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    // Sans geste sur la page, le navigateur refuse (et l'écrit dans la console) : on ne tente pas
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(WEB[kind]);
  } catch {
    /* vibreur refusé : rien */
  }
}
