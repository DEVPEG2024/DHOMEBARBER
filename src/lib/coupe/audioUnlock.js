/*
 * Son de La Coupe du Gang débloqué pendant un geste (29 oct. 2026), musique en boucle sans couture
 * (30 oct. 2026).
 *
 * Les navigateurs, iOS surtout, ne laissent partir le son qu'après un geste. Or le coup d'envoi
 * arrive du réseau, sans geste. Bruitages et musique passent donc par un seul contexte audio
 * (WebAudio), partagé par tous les écrans de jeu et relancé au premier geste (clic sur « Jouer »,
 * « Créer un match », « Rejoindre »… dans l'accueil de la Coupe, ou toucher dans l'écran de jeu) :
 * au coup d'envoi, musique et bruitages partent ensemble.
 *
 * Musique : le fichier est décodé une fois puis joué en boucle par le contexte, à l'échantillon près
 * (le lecteur audio du navigateur laissait un trou à chaque tour, et le fichier finissait sur 5 s de
 * silence : « un blanc pendant le match », signalé le 30 oct. 2026). Fondu d'entrée au départ et à la
 * reprise, de sortie à l'arrêt (le gain marche aussi sur iOS, qui ignore `volume` d'un lecteur).
 *
 * Choix « Son : coupé » gardé sur l'appareil (`cdg-sound`) : rien n'est relancé ni chargé.
 */
// Musique de tribune (choisie par le propriétaire le 29 oct. 2026) : boucle de 293 s, mono, niveau
// abaissé dans le fichier (-26 LUFS) pour rester sous les bruitages. Fabriquée par
// docs/prototypes/musique-coupe/boucle_tribune.py : 1 s de marge avant et après la boucle (sa
// dernière seconde, sa première), lue de MUSIC_GUARD_S à MUSIC_GUARD_S + MUSIC_LOOP_S. Un décodeur
// qui décale le début du MP3 de quelques millisecondes décale les deux bornes ensemble.
import TRIBUNE_URL from '@/assets/coupe/tribune.mp3';

const SOUND_KEY = 'cdg-sound';
const MUSIC_GUARD_S = 1;
const MUSIC_LOOP_S = 293;
const MUSIC_RATE = 32000; // fréquence du fichier : décodé à 32 kHz, 38 Mo en mémoire (56 à 48 kHz)
const FADE_IN_S = 1.5;
const FADE_OUT_S = 0.25;
const MAX_LOADS = 3; // réseau coupé ou décodage refusé : nouvel essai au geste suivant, 3 fois au plus

export function readSoundOn() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export function writeSoundOn(on) {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* stockage refusé : choix pour cette visite */ }
}

let ctx = null;
let musicWanted = false; // un match en cours la veut (son allumé, musique permise)
let musicBuffer = null; // fichier décodé, gardé pour les matchs suivants
let musicLoading = null; // chargement en cours
let musicLoads = 0;
let player = null; // lecture en cours : { c, src, gain, t0, from }
let musicPos = 0; // position dans la boucle (s) à la reprise

/** Contexte audio partagé, créé au besoin et relancé (sans geste, iOS peut refuser : au geste suivant). */
export function audioContext() {
  if (ctx && ctx.state === 'closed') ctx = null;
  if (!ctx) {
    const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!Ctx) return null;
    try { ctx = new Ctx(); } catch { return null; }
  }
  // iOS : `interrupted` après un appel ou une alarme, pas seulement `suspended`
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

/** Écran de jeu fermé : le contexte s'arrête (batterie), relancé au prochain geste. */
export function suspendAudio() {
  try { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); } catch { /* déjà arrêté */ }
}

/**
 * iPhone (Safari 16.4 et plus) : catégorie « lecture » d'iOS pendant la musique, comme l'ancien
 * lecteur audio (musique et bruitages s'entendent aussi en mode silencieux) ; « auto » après.
 */
function audioSession(playback) {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.audioSession : null;
    if (s && 'type' in s) s.type = playback ? 'playback' : 'auto';
  } catch { /* API absente */ }
}

// Callback et promesse : les anciens Safari (webkitAudioContext) n'ont que le callback
function decodeWith(dec, data) {
  return new Promise((resolve, reject) => {
    try {
      const p = dec.decodeAudioData(data, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    } catch (err) { reject(err); }
  });
}

function decodeMusic(data) {
  let off = null;
  try {
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (Off) off = new Off(1, 1, MUSIC_RATE);
  } catch { off = null; }
  const main = () => {
    const c = audioContext();
    return c ? decodeWith(c, data) : Promise.reject(new Error('audio indisponible'));
  };
  // Le décodage détache les octets : une copie pour le second essai (contexte de lecture)
  return off ? decodeWith(off, data.slice(0)).catch(main) : main();
}

function loadMusic() {
  if (musicBuffer || musicLoading || musicLoads >= MAX_LOADS || typeof fetch !== 'function') return;
  musicLoads += 1;
  musicLoading = fetch(TRIBUNE_URL)
    .then((r) => {
      // App iPhone : Capacitor sert ses fichiers audio sans statut HTTP (statut 0, octets complets).
      // `ok` y est faux alors que le fichier est là : pas de musique au match du build 18 (30 oct. 2026)
      if (!r.ok && r.status !== 0) throw new Error(`musique ${r.status}`);
      return r.arrayBuffer();
    })
    .then(decodeMusic)
    .then((buf) => {
      musicLoading = null;
      if (!buf || buf.duration < MUSIC_GUARD_S * 2 + MUSIC_LOOP_S - 0.5) throw new Error('musique incomplète');
      musicBuffer = buf;
      playMusic();
    })
    .catch(() => { musicLoading = null; /* au geste suivant */ });
}

function playMusic() {
  if (!musicWanted || (typeof document !== 'undefined' && document.hidden)) return;
  if (!musicBuffer) { loadMusic(); return; }
  const c = audioContext();
  if (!c) return;
  if (player && player.c === c) return;
  player = null;
  try {
    const gain = c.createGain();
    const src = c.createBufferSource();
    src.buffer = musicBuffer;
    src.loop = true;
    src.loopStart = MUSIC_GUARD_S;
    src.loopEnd = MUSIC_GUARD_S + MUSIC_LOOP_S;
    src.connect(gain);
    gain.connect(c.destination);
    // Contexte encore suspendu (iOS sans geste) : l'horloge attend, le fondu part à la relance
    const t = c.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE_IN_S);
    audioSession(true);
    src.start(t, MUSIC_GUARD_S + musicPos);
    player = { c, src, gain, t0: t, from: musicPos };
  } catch { player = null; /* contexte audio indisponible : pas de musique */ }
}

/** Musique arrêtée : en fondu court (son coupé, page cachée), d'un coup à la fermeture du jeu. */
function pauseMusic(fade = true) {
  if (!player) return;
  const { c, src, gain, t0, from } = player;
  player = null;
  try {
    const t = c.currentTime;
    musicPos = (from + Math.max(0, t - t0)) % MUSIC_LOOP_S;
    if (!fade || c.state !== 'running') {
      src.stop();
      src.disconnect();
      return;
    }
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + FADE_OUT_S);
    src.stop(t + FADE_OUT_S + 0.05);
  } catch { try { src.stop(); } catch { /* déjà arrêtée */ } }
}

/** Musique voulue par le match (son allumé et musique permise) : jouée ou mise en pause. */
export function setMusicWanted(on) {
  musicWanted = !!on;
  if (musicWanted) playMusic();
  else pauseMusic();
}

/** Fin de l'écran de jeu : musique arrêtée et rembobinée (le prochain match repart du début). */
export function stopMusic() {
  musicWanted = false;
  pauseMusic(false);
  musicPos = 0;
  audioSession(false);
}

/**
 * À appeler pendant un geste : relance le contexte, et charge la musique pour qu'elle soit prête au
 * coup d'envoi (ou la lance si un match la veut). `music` : musique permise par le serveur (sinon
 * le fichier n'est même pas chargé). Rend le contexte (null : son coupé).
 */
export function unlockAudio({ music: allowed = true } = {}) {
  if (!readSoundOn()) return null;
  const c = audioContext();
  if (!allowed) return c;
  if (musicWanted) playMusic();
  else loadMusic();
  return c;
}

// Page cachée (autre app, écran verrouillé) : la musique s'arrête, et reprend au retour si un match
// la veut encore, en fondu (sans geste, iOS peut attendre le toucher suivant). Arrêt d'un coup :
// iOS suspend le contexte en arrière-plan, un fondu en cours finirait par-dessus la reprise
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseMusic(false);
    else playMusic();
  });
}
