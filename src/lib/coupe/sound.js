/*
 * Sons et vibrations de La Coupe du Gang, repris du prototype (docs/prototypes/coupe-du-gang.html).
 *
 * Sons : WebAudio synthétisé (aucun fichier), contexte audio créé au premier geste (`unlock()`,
 * exigence des navigateurs et de WKWebView). Choix « Son : coupé » gardé sur l'appareil.
 * Vibrations : Haptics de Capacitor dans les apps, `navigator.vibrate` sur le web (toujours dans
 * un try : iOS Safari n'a pas de vibreur, un refus ne doit jamais casser le jeu).
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
// Musique de tribune (choisie par le propriétaire le 29 oct. 2026) : 5 min en boucle, mono, niveau
// abaissé dans le fichier (-26 LUFS) pour rester sous les bruitages, iOS ignorant `volume`
import TRIBUNE_URL from '@/assets/coupe/tribune.mp3';

const SOUND_KEY = 'cdg-sound';

function readSoundOn() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

function writeSoundOn(on) {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* stockage refusé : choix pour cette visite */ }
}

export function createSound() {
  let actx = null;
  let noiseBuf = null;
  let enabled = readSoundOn();
  const timers = new Set();
  // Musique : voulue par `music(true)` (match lancé) ; un navigateur qui refuse la lecture sans
  // geste la lance au toucher suivant (`unlock()`, appelé à chaque toucher du jeu). Coupée avec le
  // son du jeu, quand la page passe en arrière-plan et à la fermeture de l'écran.
  let musicEl = null;
  let musicWanted = false;

  function musicPlay() {
    if (!musicWanted || !enabled || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      if (!musicEl) {
        musicEl = new Audio(TRIBUNE_URL);
        musicEl.loop = true;
        musicEl.preload = 'auto';
      }
      if (!musicEl.paused) return;
      const p = musicEl.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* refusée sans geste : au toucher suivant */ });
    } catch { /* lecteur audio indisponible : pas de musique */ }
  }

  function musicPause() {
    try { if (musicEl && !musicEl.paused) musicEl.pause(); } catch { /* déjà arrêtée */ }
  }

  const onVisibility = () => { if (document.hidden) musicPause(); else musicPlay(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  function unlock() {
    if (!enabled) return;
    try {
      if (!actx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        actx = new Ctx();
      }
      // iOS : `interrupted` après un appel ou une alarme, pas seulement `suspended`
      if (actx.state !== 'running') actx.resume().catch(() => {});
    } catch {
      actx = null;
    }
    musicPlay();
  }

  const quiet = () => !enabled || !actx || actx.state === 'closed';

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
      else musicPause();
    },
    /** Musique de tribune voulue (match lancé, musique permise par le serveur) ou non. */
    music(on) {
      musicWanted = !!on;
      if (musicWanted) musicPlay();
      else musicPause();
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
      musicWanted = false;
      musicPause();
      if (musicEl) {
        try { musicEl.removeAttribute('src'); musicEl.load(); } catch { /* déjà libérée */ }
        musicEl = null;
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      try { actx?.close?.().catch?.(() => {}); } catch { /* déjà fermé */ }
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
