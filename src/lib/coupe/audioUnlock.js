/*
 * Son de La Coupe du Gang débloqué pendant un geste (29 oct. 2026).
 *
 * Les navigateurs, iOS surtout, ne laissent partir les bruitages (WebAudio) et la musique (lecteur
 * audio) qu'après un geste. Or le coup d'envoi arrive du réseau, sans geste : l'un des deux restait
 * muet jusqu'à ce que le joueur coupe puis remette le son. Le contexte audio des bruitages et le
 * lecteur de la musique sont donc partagés par tous les écrans de jeu, et débloqués au premier geste
 * (clic sur « Jouer », « Créer un match », « Rejoindre »… dans l'accueil de la Coupe, ou toucher
 * dans l'écran de jeu) : au coup d'envoi, musique et bruitages partent ensemble.
 *
 * Choix « Son : coupé » gardé sur l'appareil (`cdg-sound`) : rien n'est débloqué ni chargé.
 */
// Musique de tribune (choisie par le propriétaire le 29 oct. 2026) : 5 min en boucle, mono, niveau
// abaissé dans le fichier (-26 LUFS) pour rester sous les bruitages, iOS ignorant `volume`
import TRIBUNE_URL from '@/assets/coupe/tribune.mp3';

const SOUND_KEY = 'cdg-sound';

export function readSoundOn() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export function writeSoundOn(on) {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* stockage refusé : choix pour cette visite */ }
}

let ctx = null;
let music = null;
let musicReady = false; // lecteur débloqué : un `play()` fait pendant un geste a abouti
let musicWanted = false; // un match en cours la veut (son allumé, musique permise)

/** Contexte audio des bruitages, créé au besoin et relancé (sans geste, iOS peut refuser : au geste suivant). */
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

function musicElement() {
  if (!music) {
    music = new Audio(TRIBUNE_URL);
    music.loop = true;
    music.preload = 'auto';
  }
  return music;
}

function playMusic() {
  if (!musicWanted || (typeof document !== 'undefined' && document.hidden)) return;
  try {
    const el = musicElement();
    if (!el.paused) return;
    const p = el.play();
    if (p && typeof p.then === 'function') p.then(() => { musicReady = true; }, () => { /* refusée sans geste : au geste suivant */ });
  } catch { /* lecteur audio indisponible : pas de musique */ }
}

function pauseMusic() {
  try { if (music && !music.paused) music.pause(); } catch { /* déjà arrêtée */ }
}

/** Musique voulue par le match (son allumé et musique permise) : jouée ou mise en pause. */
export function setMusicWanted(on) {
  musicWanted = !!on;
  if (musicWanted) playMusic();
  else pauseMusic();
}

/** Fin de l'écran de jeu : musique arrêtée et rembobinée (le prochain match repart du fondu). */
export function stopMusic() {
  musicWanted = false;
  pauseMusic();
  try { if (music) music.currentTime = 0; } catch { /* pas encore chargée */ }
}

/**
 * À appeler pendant un geste : relance le contexte des bruitages, et débloque une fois le lecteur
 * de la musique (lecture aussitôt arrêtée si aucun match ne la veut : le fichier commence par 2 s
 * de fondu, rien ne s'entend), ou la lance si un match la veut. `music` : musique permise par le
 * serveur (sinon le fichier n'est même pas chargé). Rend le contexte (null : son coupé).
 */
export function unlockAudio({ music: allowed = true } = {}) {
  if (!readSoundOn()) return null;
  const c = audioContext();
  if (!allowed) return c;
  if (musicWanted) {
    playMusic();
    return c;
  }
  if (musicReady) return c;
  try {
    const el = musicElement();
    if (!el.paused) return;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        musicReady = true;
        if (!musicWanted) {
          el.pause();
          el.currentTime = 0;
        }
      }, () => { /* geste refusé (toucher posé sur iOS) : au geste suivant */ });
    }
  } catch { /* lecteur audio indisponible */ }
  return c;
}

// Page cachée (autre app, écran verrouillé) : la musique s'arrête, et reprend au retour si un match
// la veut encore (sans geste, iOS peut attendre le toucher suivant)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseMusic();
    else playMusic();
  });
}
