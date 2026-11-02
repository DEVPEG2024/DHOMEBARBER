/**
 * Snake du Gang : bips rétro (contrat docs/fonctions/snake-du-gang-contrat.md, sections 0 et 6).
 *
 * Bips carrés courts, synthétisés sur le contexte audio partagé de La Coupe du Gang
 * (`src/lib/coupe/audioUnlock.js`), débloqué pendant le geste qui lance la partie (`unlock()`) :
 * iOS ne laisse partir le son qu'après un geste. Pas de musique.
 *
 *   const sound = createSnakeSound();
 *   sound.unlock();          // dans le geste (5, glisser, touche « Lancer »)
 *   sound.play('eat');       // 'eat' (bouchée), 'spawn' (bestiole), 'caught' (attrapée), 'die' (perdu)
 *
 * Son impossible (navigateur sans WebAudio, contexte refusé ou pas encore débloqué) : silence,
 * jamais d'erreur. Le réglage « Bips du jeu » (`prefs.bips`) est appliqué par l'appelant.
 */
import { audioContext, unlockAudio } from '@/lib/coupe/audioUnlock';

// Notes de chaque bruit : [fréquence (Hz), durée (s), départ (s)]
const SOUNDS = {
  eat: [[880, 0.045, 0]],
  spawn: [[660, 0.05, 0], [990, 0.07, 0.06]],
  caught: [[784, 0.05, 0], [1046, 0.05, 0.06], [1318, 0.09, 0.12]],
  die: [[440, 0.12, 0], [330, 0.12, 0.13], [220, 0.24, 0.26]],
};

const VOLUME = 0.05;

export function createSnakeSound() {
  let unlocked = false;

  /** À appeler pendant un geste : crée ou relance le contexte audio partagé. */
  function unlock() {
    try {
      // `unlockAudio` rend null quand le son de la Coupe est coupé : le Snake a son propre réglage
      const c = unlockAudio({ music: false }) || audioContext();
      if (c) unlocked = true;
    } catch {
      /* WebAudio absent : pas de son */
    }
  }

  function play(name) {
    const notes = SOUNDS[name];
    // Jamais de contexte créé hors d'un geste (le navigateur le refuserait, avec un avertissement)
    if (!notes || !unlocked) return;
    try {
      const c = audioContext();
      if (!c || c.state !== 'running') return;
      const t0 = c.currentTime + 0.005;
      for (const [freq, dur, at] of notes) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t0 + at);
        // Attaque et chute très courtes : pas de clic au début ni à la fin du bip
        gain.gain.setValueAtTime(0, t0 + at);
        gain.gain.linearRampToValueAtTime(VOLUME, t0 + at + 0.004);
        gain.gain.setValueAtTime(VOLUME, t0 + at + dur - 0.01);
        gain.gain.linearRampToValueAtTime(0, t0 + at + dur);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + dur + 0.02);
        osc.onended = () => {
          try { osc.disconnect(); gain.disconnect(); } catch { /* déjà détachés */ }
        };
      }
    } catch {
      /* contexte fermé ou refusé : silence */
    }
  }

  return { unlock, play };
}
