/*
 * Sons et vibrations de La Coupe du Gang, repris du prototype (docs/prototypes/coupe-du-gang.html).
 *
 * Bruitages : WebAudio synthétisé, sur le contexte audio partagé de `audioUnlock.js`, débloqué
 * pendant un geste (clic qui ouvre le jeu, toucher dans l'écran de jeu : `unlock()`), exigence des
 * navigateurs et de WKWebView. Musique de tribune : jouée en boucle par le même contexte (module
 * `audioUnlock.js`), voulue à partir du coup d'envoi (`music(true)`) si le serveur la permet
 * (`allowMusic`). Choix « Son : coupé » gardé sur l'appareil.
 * Vibrations : Haptics de Capacitor dans les apps, `navigator.vibrate` sur le web (toujours dans
 * un try : iOS Safari n'a pas de vibreur, un refus ne doit jamais casser le jeu).
 *
 * Règlement v2 (31 oct. 2026, docs/fonctions/coupe-du-gang-regles-v2-contrat.md, section 7), tout
 * synthétisé comme les autres bruitages et programmé sur l'horloge audio (aucun minuteur) :
 *  - `fx(nom)` : 'fire' (allumage), 'charge' (ballon électrique), 'douse' (vapeur, feu ou charge
 *    perdus), 'short' (court-circuit et bond), 'bolt' (coup de tonnerre), 'whistle' (faute), 'warn'
 *    (avertissement), 'penalty', 'save' (arrêt), 'gold' (but en or), 'goal2' (but à 2, joué en
 *    plus de `goal()`, qui ne se rejoue pas) ;
 *  - `event(sorte)` à l'annonce d'un événement, un bruit court par sorte : 'foam' (aérosol), 'gel'
 *    (glissé), 'storm' (grondement), 'goals' (mécanisme), 'water' (arroseur), 'smoke' (fumigène).
 * Coupés avec le son du jeu ; un nom inconnu ou un contexte audio absent : silence, jamais d'erreur.
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

  // Note : `slide` = fréquence d'arrivée (glissé), `at` = départ en secondes (horloge audio)
  function tone(freq, dur, type, gain, slide, at = 0) {
    if (quiet()) return;
    try {
      const t = actx.currentTime + at;
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

  // Bruit filtré : `type` du filtre (passe-bande par défaut), fréquence qui glisse vers `to`,
  // départ `at` secondes plus tard (horloge audio)
  function noise(dur, gain, freq, q, attack, at = 0, type = 'bandpass', to = 0) {
    if (quiet()) return;
    try {
      if (!noiseBuf) {
        noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = actx.currentTime + at;
      const s = actx.createBufferSource();
      const f = actx.createBiquadFilter();
      const g = actx.createGain();
      s.buffer = noiseBuf;
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (to > 0) f.frequency.exponentialRampToValueAtTime(to, t + dur);
      f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(actx.destination);
      // Point de départ au hasard dans le bruit : deux bruits proches ne sonnent pas pareil
      s.start(t, Math.random() * Math.max(0, 1.9 - dur));
      s.stop(t + dur + 0.05);
    } catch { /* contexte audio indisponible : silence */ }
  }

  // Sifflet d'arbitre : sinus vers 2,9 kHz roulé par une modulation rapide (la bille du sifflet)
  function whistle(dur, at, gain) {
    if (quiet()) return;
    try {
      const t = actx.currentTime + at;
      const o = actx.createOscillator();
      const lfo = actx.createOscillator();
      const depth = actx.createGain();
      const g = actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(2900, t);
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(32, t);
      depth.gain.setValueAtTime(150, t);
      lfo.connect(depth).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
      g.gain.setValueAtTime(gain, t + Math.max(0.02, dur - 0.05));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.02);
      lfo.stop(t + dur + 0.02);
    } catch { /* contexte audio indisponible : silence */ }
  }

  function goalSound() {
    tone(2650, 0.12, 'sine', 0.09);
    later(() => tone(2950, 0.32, 'sine', 0.09), 130);
    noise(1.8, 0.22, 900, 0.6, 0.25);
  }

  // Bruitages du règlement v2 (un par nom ; inconnu : rien)
  const FX = {
    fire() {
      // Souffle qui s'embrase, coup sourd, crépitements
      noise(0.5, 0.2, 500, 0.7, 0.02, 0, 'lowpass', 3200);
      tone(90, 0.18, 'sine', 0.18, 50);
      for (let i = 0; i < 5; i++) noise(0.03, 0.06, 4200, 2, 0.002, 0.08 + i * 0.07 + Math.random() * 0.03, 'highpass');
    },
    charge() {
      // Montée électrique et bourdonnement
      tone(140, 0.28, 'sawtooth', 0.05, 1600);
      tone(60, 0.3, 'square', 0.035);
      noise(0.25, 0.08, 5000, 1, 0.005, 0.02, 'highpass');
    },
    douse() {
      // Sifflement de vapeur
      noise(0.7, 0.16, 3500, 0.5, 0.02, 0, 'highpass', 6500);
      tone(220, 0.12, 'sine', 0.05, 120);
    },
    short() {
      // Trois grésillements, puis le bond
      for (let i = 0; i < 3; i++) tone(220, 0.05, 'sawtooth', 0.07, 0, i * 0.07);
      noise(0.22, 0.1, 5200, 1, 0.003, 0, 'highpass');
      tone(300, 0.25, 'sine', 0.08, 720, 0.14);
    },
    bolt() {
      // Claquement de la foudre puis grondement
      noise(0.35, 0.35, 6000, 0.4, 0.004, 0, 'lowpass', 300);
      noise(1.6, 0.25, 140, 0.5, 0.12, 0.08, 'lowpass');
    },
    whistle() {
      // Faute : « tuit, tuuuit »
      whistle(0.12, 0, 0.1);
      whistle(0.32, 0.17, 0.1);
    },
    warn() {
      tone(880, 0.1, 'square', 0.045);
      tone(660, 0.16, 'square', 0.045, 0, 0.12);
    },
    penalty() {
      // Long coup de sifflet et coup de grosse caisse
      whistle(0.6, 0, 0.11);
      tone(70, 0.4, 'sine', 0.22, 45, 0.02);
      noise(0.3, 0.1, 200, 1, 0.005, 0.02, 'lowpass');
    },
    save() {
      // Ballon repoussé et « ooh » de la tribune
      tone(160, 0.14, 'triangle', 0.22, 60);
      noise(0.08, 0.12, 900, 1, 0.003);
      noise(0.9, 0.12, 520, 1.2, 0.18, 0.05, 'bandpass', 380);
    },
    gold() {
      // Arpège brillant sur un gong
      [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.5, 'triangle', 0.07, 0, i * 0.08));
      tone(220, 1.6, 'sine', 0.08);
      tone(330, 1.4, 'sine', 0.05);
    },
    goal2() {
      // But à 2 : joué en plus de `goal()` (l'écran de jeu appelle les deux) : une décharge et deux
      // notes de plus, sans rejouer le but
      tone(140, 0.25, 'sawtooth', 0.05, 1800, 0.05);
      tone(1760, 0.18, 'triangle', 0.08, 0, 0.42);
      tone(2349, 0.36, 'triangle', 0.08, 0, 0.56);
    },
  };

  // Annonce d'un événement : un bruit court par sorte
  const EVENT = {
    foam() {
      // Aérosol de mousse à raser, quelques bulles
      noise(0.75, 0.14, 4200, 0.6, 0.04, 0, 'highpass');
      tone(700, 0.06, 'sine', 0.04, 1100, 0.25);
      tone(900, 0.06, 'sine', 0.04, 1300, 0.38);
      tone(620, 0.06, 'sine', 0.04, 1000, 0.5);
    },
    gel() {
      // Glissé visqueux
      tone(260, 0.32, 'sine', 0.09, 820);
      noise(0.18, 0.08, 1300, 3, 0.01, 0.05, 'bandpass', 600);
    },
    storm() {
      // Grondement lointain et vent
      noise(1.4, 0.2, 110, 0.6, 0.35, 0, 'lowpass');
      noise(1.2, 0.05, 800, 0.4, 0.4, 0, 'bandpass', 400);
    },
    goals() {
      // Cliquets d'un mécanisme et moteur grave
      for (let i = 0; i < 6; i++) noise(0.025, 0.1, 2500, 3, 0.002, i * 0.07);
      tone(80, 0.5, 'sawtooth', 0.04, 60);
    },
    water() {
      // Arroseur à turbine : « tch, tch, tch » et chuintement
      for (let i = 0; i < 8; i++) noise(0.04, 0.09, 5000, 1, 0.003, i * 0.075, 'highpass');
      noise(0.8, 0.04, 6000, 0.5, 0.1, 0, 'highpass');
    },
    smoke() {
      // Fumigène qui s'allume : petit claquement et grésillement
      tone(320, 0.12, 'triangle', 0.08, 110);
      noise(0.9, 0.12, 1800, 0.8, 0.12, 0.05, 'bandpass', 900);
    },
  };

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
    goal: goalSound,
    /** Règlement v2 : bruitage court par nom ('fire', 'charge', 'douse', 'short', 'bolt', 'whistle', 'warn', 'penalty', 'save', 'gold', 'goal2'). */
    fx(name) {
      if (quiet() || !Object.prototype.hasOwnProperty.call(FX, name)) return;
      try { FX[name](); } catch { /* silence */ }
    },
    /** Règlement v2 : annonce d'un événement ('foam', 'gel', 'storm', 'goals', 'water', 'smoke'). */
    event(kind) {
      if (quiet() || !Object.prototype.hasOwnProperty.call(EVENT, kind)) return;
      try { EVENT[kind](); } catch { /* silence */ }
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
