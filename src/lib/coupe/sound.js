/*
 * Sons et vibrations de La Coupe du Gang, repris du prototype (docs/prototypes/coupe-du-gang.html).
 *
 * Bruitages : WebAudio synthétisé, sur le contexte audio partagé de `audioUnlock.js`, débloqué
 * pendant un geste (clic qui ouvre le jeu, toucher dans l'écran de jeu : `unlock()`), exigence des
 * navigateurs et de WKWebView. Musique de tribune : lecteur partagé du même module, voulue à partir
 * du coup d'envoi (`music(true)`) si le serveur la permet (`allowMusic`). Choix « Son : coupé »
 * gardé sur l'appareil.
 * Vibrations : Haptics de Capacitor dans les apps, `navigator.vibrate` sur le web (toujours dans
 * un try : iOS Safari n'a pas de vibreur, un refus ne doit jamais casser le jeu).
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  audioContext, readSoundOn, setMusicWanted, stopMusic, suspendAudio, unlockAudio, writeSoundOn,
} from './audioUnlock';

export function createSound() {
  let noiseBuf = null;
  let enabled = readSoundOn();
  let musicAllowed = false; // permise par le serveur (features.coupeMusic)
  let musicOn = false; // match lancé
  const timers = new Set();
  // Contexte déjà débloqué par le clic qui a ouvert le jeu (ou relancé sans geste quand le
  // navigateur le permet, Chrome après un premier clic sur la page) : bruitages dès le coup d'envoi
  let actx = enabled ? audioContext() : null;

  const applyMusic = () => setMusicWanted(enabled && musicAllowed && musicOn);

  function unlock() {
    if (!enabled) return;
    actx = unlockAudio({ music: musicAllowed }) || actx;
  }

  // Rien tant que le contexte ne tourne pas (sinon les sons attendraient et partiraient en retard)
  const quiet = () => !enabled || !actx || actx.state !== 'running';

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }

  function tone(freq, dur, type, gain, slide) {
    if (quiet()) return;
    try {
      const t = actx.currentTime;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* contexte audio indisponible : silence */ }
  }

  function noise(dur, gain, freq, q, attack) {
    if (quiet()) return;
    try {
      if (!noiseBuf) {
        noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = actx.currentTime;
      const s = actx.createBufferSource();
      const f = actx.createBiquadFilter();
      const g = actx.createGain();
      s.buffer = noiseBuf;
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(actx.destination);
      s.start(t);
      s.stop(t + dur + 0.05);
    } catch { /* contexte audio indisponible : silence */ }
  }

  return {
    unlock,
    isEnabled: () => enabled,
    setEnabled(on) {
      enabled = !!on;
      writeSoundOn(enabled);
      if (enabled) unlock();
      applyMusic();
    },
    /** Musique permise par le serveur (`features.coupeMusic`, COUPE_MUSIC=off la coupe partout). */
    allowMusic(ok) {
      musicAllowed = !!ok;
      applyMusic();
    },
    /** Match lancé (coup d'envoi, reprise) : la musique part avec les bruitages. */
    music(on) {
      musicOn = !!on;
      if (musicOn && enabled) actx = audioContext() || actx;
      applyMusic();
    },
    hit(v) {
      const k = Math.min(1, v / 900);
      tone(140 + k * 260, 0.09, 'triangle', 0.08 + 0.22 * k, 90);
      noise(0.05, 0.05 + 0.1 * k, 2400, 1.2, 0.004);
    },
    wall(v) {
      const k = Math.min(1, v / 900);
      if (k > 0.08) tone(95 + k * 60, 0.07, 'sine', 0.05 + 0.12 * k, 70);
    },
    post() { tone(880, 0.25, 'triangle', 0.12, 620); },
    goal() {
      tone(2650, 0.12, 'sine', 0.09);
      later(() => tone(2950, 0.32, 'sine', 0.09), 130);
      noise(1.8, 0.22, 900, 0.6, 0.25);
    },
    blip() { tone(660, 0.08, 'sine', 0.06); },
    win() { [523, 659, 784, 1046].forEach((f, i) => later(() => tone(f, 0.22, 'triangle', 0.1), i * 110)); },
    lose() { [392, 330, 262].forEach((f, i) => later(() => tone(f, 0.26, 'sine', 0.08), i * 140)); },
    close() {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      musicOn = false;
      // Contexte et lecteur partagés : gardés débloqués pour le prochain match, mais arrêtés
      stopMusic();
      suspendAudio();
      actx = null;
    },
  };
}

// ─── Vibrations ─────────────────────────────────────────────────────

const NATIVE = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

// Motifs du prototype (web) et leur équivalent en impacts natifs (style, délai en ms)
const PATTERNS = {
  light: { web: 8, native: [[ImpactStyle.Light, 0]] },
  medium: { web: 18, native: [[ImpactStyle.Medium, 0]] },
  goal: { web: [40, 50, 90], native: [[ImpactStyle.Heavy, 0], [ImpactStyle.Medium, 140]] },
  win: { web: [30, 60, 30, 60, 120], native: [[ImpactStyle.Medium, 0], [ImpactStyle.Medium, 90], [ImpactStyle.Heavy, 180]] },
};

/** Vibration : 'light' | 'medium' (frappe), 'goal', 'win'. Jamais d'erreur. */
export function buzz(kind) {
  const p = PATTERNS[kind];
  if (!p) return;
  if (NATIVE) {
    p.native.forEach(([style, delay]) => {
      const go = () => { try { Haptics.impact({ style }).catch(() => {}); } catch { /* pas de vibreur */ } };
      if (delay) setTimeout(go, delay); else go();
    });
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p.web);
  } catch { /* pas de vibreur */ }
}
