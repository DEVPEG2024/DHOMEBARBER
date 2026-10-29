import React, { useLayoutEffect, useRef } from 'react';
import { W, H, GD } from '@/lib/coupe/engine';
import {
  STADIUM_URL, STADIUM_W, STADIUM_H, PITCH_X0, PITCH_Y0, PITCH_K,
  pitchRectIn, pitchPlacement, fullPlacement, cameraTransform, cameraCss,
} from '@/lib/coupe/stadium';

/*
 * Stade de La Coupe du Gang derrière le match (thème stade, docs/fonctions/coupe-du-gang-stade.md,
 * maquettes « StadeAnimation », « StadeAvant », « StadeMatch »).
 *
 * Dans `.cdg-stage`, le calque caméra `.cdg-camera` porte l'image du stade, placée pour que son terrain
 * recouvre exactement celui du dessin (`pitchRectIn`, mêmes calculs que le canvas), et le voile des
 * tribunes (bordures sombres autour du terrain et des filets). L'image déborde du stage : la racine
 * coupe. La caméra est un attribut de la racine `.cdg-root` :
 *  - `data-cam="pitch"` : aucune transformation, le terrain remplit le stage (pendant le match) ;
 *  - `data-cam="full"` (ou absent) : `--cdg-cam-full`, le stade entier centré sur tout l'écran.
 * Seuls l'image et le voile bougent : le canvas reste à sa place (le doigt et les tests mesurent son
 * cadre) ; il est caché tant que la caméra voyage (`data-play` absent, voir createStadiumDirector).
 *
 * `onReady` : image chargée et décodée (le dessin ne pose plus son terrain) ; `onFail` : image
 * illisible (le dessin garde son terrain, la caméra ne sert plus).
 */

// Avant-match décidé une fois par match : dès qu'une image dit `countS` > 3 (4,5 dès `start`, en
// ligne comme hors ligne). Sans durée (serveur sans avant-match), le compte à rebours n'est cru
// qu'après 0,25 s : jamais d'aller-retour de la caméra si la durée arrive juste après le coup d'envoi.
const SETTLE_S = 0.25;
// Zoom avant (transition CSS de GameStyles) : le canvas n'apparaît qu'une fois la caméra posée
const ZOOM_IN_MS = 1000;

/**
 * Applique `fn` sans transition (reprise d'un match, placement recalculé) : les styles sont relus
 * pendant que `data-instant` coupe les transitions, puis l'attribut est retiré sans rien animer.
 */
export function withoutTransition(root, fn) {
  if (!root) { fn(); return; }
  root.setAttribute('data-instant', '');
  try {
    fn();
  } finally {
    void root.offsetWidth; // styles recalculés ici, transitions coupées
    root.removeAttribute('data-instant');
  }
}

/**
 * Pilote de la caméra, appelé par la boucle de l'écran de jeu (aucun état React par image). Il pose
 * sur la racine, seulement quand ils changent :
 *  - `data-cam` : "full" (stade entier) ou "pitch" (terrain) ;
 *  - `data-play="1"` : canvas, barre du haut et réactions visibles (absent pendant que la caméra
 *    voyage) ;
 *  - `data-outro="fin"` : « FIN DU MATCH » sur le terrain, avant le zoom arrière.
 * Avant-match (premier coup d'envoi, `frame.countS > 3`) : stade entier et affiche VS pendant 1 s,
 * zoom 1 s, puis le terrain (à 1 s en mouvement réduit, coupe nette). Après un but, une reprise ou
 * sans `countS` : directement le terrain. `onIntro(on)` : affiche VS à montrer ou à retirer ;
 * `onPlay()` : le terrain vient d'apparaître.
 */
export function createStadiumDirector(root, { reducedMotion = false, onIntro, onPlay } = {}) {
  let reduced = !!reducedMotion;
  let intro = 'pending'; // avant-match de ce match : 'pending' (pas encore lu), 'on', 'off'
  let poster = false;
  let held = false; // fin du match : la caméra suit finish() / pullBack(), plus les images
  // Images lues seulement après le coup d'envoi (`newMatch`) ou une reprise (`resume`) : une image
  // passée avant posait la caméra sur le terrain, puis l'avant-match la ramenait au stade
  let armed = false;
  let pitchAt = -Infinity; // arrivée de la caméra sur le terrain (performance.now)

  const camera = (value, now) => {
    if (!root || root.getAttribute('data-cam') === value) return;
    if (value === 'pitch') pitchAt = now;
    root.setAttribute('data-cam', value);
  };
  const outro = (on) => {
    if (!root || root.hasAttribute('data-outro') === on) return;
    if (on) root.setAttribute('data-outro', 'fin');
    else root.removeAttribute('data-outro');
  };
  const play = (on) => {
    if (!root || root.hasAttribute('data-play') === on) return;
    if (!on) { root.removeAttribute('data-play'); return; }
    root.setAttribute('data-play', '1');
    try { onPlay?.(); } catch { /* écran démonté */ }
  };
  const showPoster = (on) => {
    if (poster === on) return;
    poster = on;
    try { onIntro?.(on); } catch { /* écran démonté */ }
  };

  camera('full', 0);

  return {
    setReducedMotion(on) { reduced = !!on; },
    /** Nouveau match (coup d'envoi, revanche) : l'avant-match se décide sur les premières images. */
    newMatch() {
      intro = 'pending';
      armed = true;
      held = false;
      showPoster(false);
      outro(false);
    },
    /** Match repris (coupure, écran rouvert) : directement sur le terrain, sans transition. */
    resume() {
      intro = 'off';
      armed = true;
      held = false;
      showPoster(false);
      outro(false);
      withoutTransition(root, () => {
        camera('pitch', -Infinity);
        play(true);
      });
    },
    /** Hors match (connexion, salle d'attente, défi, erreur) : stade entier, rien sur le terrain. */
    idle() {
      intro = 'pending';
      armed = false;
      held = false;
      showPoster(false);
      outro(false);
      camera('full', 0);
      play(false);
    },
    /** Une image du match (`frame` du match en ligne ou hors ligne), `now` = performance.now(). */
    frame(f, now) {
      if (!f || held || !armed) return;
      if (intro === 'pending') {
        if (f.phase === 'count' && f.countS > 3) intro = 'on';
        else if (f.phase !== 'count' || f.phaseT >= SETTLE_S) intro = 'off';
      }
      // Avant-match joué une fois : un compte à rebours plus tard (but, retour de l'adversaire après
      // une coupure) reste sur le terrain
      if (intro === 'on' && f.phase !== 'count') intro = 'off';
      const lead = intro === 'on' && f.phase === 'count' && f.countS > 3;
      if (intro === 'pending' || (lead && f.phaseT < 1)) {
        camera('full', now);
        play(false);
        showPoster(lead);
        return;
      }
      showPoster(false);
      camera('pitch', now);
      // Jamais deux terrains l'un sur l'autre : le canvas attend la fin du zoom
      const landed = reduced || now - pitchAt >= ZOOM_IN_MS;
      play(landed && (!lead || f.phaseT >= (reduced ? 1 : 2)));
    },
    /** Fin du match : « FIN DU MATCH » sur le terrain, le canvas reste (l'écran de jeu l'affiche). */
    finish() {
      held = true;
      showPoster(false);
      outro(true);
    },
    /** Puis la caméra recule jusqu'au stade entier et le canvas s'efface. */
    pullBack() {
      held = true;
      showPoster(false);
      outro(false);
      camera('full', 0);
      play(false);
    },
  };
}

/** Image du stade et voile des tribunes, placés au redimensionnement (stage ou écran). */
export default function StadiumStage({ onReady, onFail }) {
  const camRef = useRef(null);
  const picRef = useRef(null);
  const veilRef = useRef(null);
  const cbRef = useRef({ onReady, onFail });
  cbRef.current = { onReady, onFail };
  const aliveRef = useRef(true);

  useLayoutEffect(() => {
    aliveRef.current = true;
    const cam = camRef.current;
    const pic = picRef.current;
    const veil = veilRef.current;
    const stage = cam?.parentElement;
    const root = cam?.closest('.cdg-root');
    if (!cam || !pic || !veil || !stage || !root) return undefined;

    const place = () => {
      const sr = stage.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      if (sr.width < 1 || sr.height < 1 || rr.width < 1 || rr.height < 1) return;
      // Terrain : comme le dessin (vue calculée sur le parent du canvas, le stage)
      const pitch = pitchRectIn(sr.width, sr.height);
      const at = pitchPlacement(pitch);
      // Stade entier : centré sur tout l'écran (la racine), ramené dans le repère du stage
      const whole = fullPlacement(rr.width, rr.height);
      const full = { s: whole.s, x: whole.x + rr.left - sr.left, y: whole.y + rr.top - sr.top };
      const s = at.s;
      const net = GD * PITCH_K; // profondeur des filets dans l'image (px)
      const px = (v) => `${Math.max(0, v).toFixed(2)}px`;
      withoutTransition(root, () => {
        pic.style.left = `${at.x.toFixed(2)}px`;
        pic.style.top = `${at.y.toFixed(2)}px`;
        pic.style.width = px(STADIUM_W * s);
        pic.style.height = px(STADIUM_H * s);
        pic.style.setProperty('--cdg-edge', px(STADIUM_W * s * 0.045));
        // Voile : tout le stade sauf le terrain et ses filets (haut, droite, bas, gauche)
        veil.style.borderWidth = [
          (PITCH_Y0 - net) * s,
          (STADIUM_W - PITCH_X0 - W * PITCH_K) * s,
          (STADIUM_H - PITCH_Y0 - H * PITCH_K - net) * s,
          PITCH_X0 * s,
        ].map(px).join(' ');
        cam.style.setProperty('--cdg-cam-full', cameraCss(cameraTransform(at, full)));
        // Centre du terrain dans l'écran : « FIN DU MATCH » (MatchIntro)
        root.style.setProperty('--cdg-pitch-cy', `${(sr.top - rr.top + pitch.top + pitch.height / 2).toFixed(1)}px`);
      });
    };

    place();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => place());
      ro.observe(stage);
      ro.observe(root);
    } else window.addEventListener('resize', place);
    return () => {
      aliveRef.current = false;
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', place);
    };
  }, []);

  const loaded = (e) => {
    const img = e.currentTarget;
    const ready = () => { if (aliveRef.current) cbRef.current.onReady?.(); };
    // Décodée avant d'être montrée : l'avant-match ne commence pas sur une image vide
    if (typeof img.decode === 'function') img.decode().then(ready, ready);
    else ready();
  };
  const failed = () => { if (aliveRef.current) cbRef.current.onFail?.(); };

  // Le voile de l'écran (`.cdg-dim`, stade assombri hors match) reste hors du calque caméra : un
  // parent transformé changerait le repère de son `position: fixed`
  return (
    <>
      <div className="cdg-camera" ref={camRef} aria-hidden="true">
        <div className="cdg-pic" ref={picRef}>
          <img src={STADIUM_URL} alt="" draggable={false} decoding="async" onLoad={loaded} onError={failed} />
          <div className="cdg-veil" ref={veilRef} />
        </div>
      </div>
      <div className="cdg-dim" aria-hidden="true" />
    </>
  );
}
