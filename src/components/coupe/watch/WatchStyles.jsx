import React from 'react';
import { COUPE_COLORS as C } from '../palette';

/*
 * Styles de la vue spectateur de La Coupe du Gang (WatchStage), préfixés « cdgw- », en plus de ceux
 * de l'écran de jeu (GameStyles : stade, canvas, bandeaux). Planche validée, écrans 13 (téléphone)
 * et 14 (écran du salon) ; décisions A4 et A12 du 4 nov. 2026 (échelle de l'écran, bulles espacées).
 * Animations en transform et opacité seulement, coupées par « réduire les animations » (la bulle
 * d'une réaction reste alors posée, sans bouger, le temps de sa vie).
 */
function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const RED_PAWN = `radial-gradient(circle at 35% 30%, #ff5a60, ${C.rouge} 55%, ${C.rougeSombre})`;
const WHITE_PAWN = 'radial-gradient(circle at 35% 30%, #fff, #eceef0 55%, #b9bbc0)';

export const WATCH_CSS = `
.cdgw-root { position: relative; isolation: isolate; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.cdgw-root .cdg-stage { flex: 1 1 auto; min-height: 0; overflow: hidden; }

/* Bande des scores : le joueur du haut (blanc) à gauche, celui du bas (rouge) à droite, comme la planche ;
   la ligne sous le score prend toute la largeur (les noms gardent leur place, deux lignes au plus) */
.cdgw-band { position: relative; z-index: 18; flex: none; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas: "a s b" "l l l"; align-items: center; column-gap: 10px; row-gap: 2px; padding: 8px 16px; background: ${C.noir2};
  border-top: 1px solid ${alpha(C.blanc, 0.06)}; border-bottom: 1px solid ${alpha(C.blanc, 0.06)}; }
.cdgw-side { grid-area: a; min-width: 0; display: flex; align-items: center; gap: 8px; }
.cdgw-side.cdgw-right { grid-area: b; justify-content: flex-end; }
.cdgw-name { min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: break-word;
  font: 600 14px/1.15 var(--cdg-body); color: ${C.blanc}; }
.cdgw-right .cdgw-name { text-align: right; }
.cdgw-score { grid-area: s; justify-self: center; font: 800 28px/1 var(--cdg-display); letter-spacing: .03em; font-variant-numeric: tabular-nums;
  color: ${C.blanc}; white-space: nowrap; }
.cdgw-line { grid-area: l; justify-self: center; max-width: 100%; min-height: 1.2em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font: 500 11px/1.2 var(--cdg-body); color: ${C.grisClair}; font-variant-numeric: tabular-nums; }
.cdgw-line[data-tone="or"] { color: ${C.or}; font-weight: 700; }
.cdgw-pawn { flex: none; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font: 800 11px/1 var(--cdg-display); letter-spacing: .02em; }
.cdgw-pawn[data-side="0"] { background: ${RED_PAWN}; color: ${C.blanc}; box-shadow: 0 0 0 2px ${C.blanc}, 0 4px 10px rgba(0, 0, 0, .55); }
.cdgw-pawn[data-side="1"] { background: ${WHITE_PAWN}; color: ${C.noir}; box-shadow: 0 4px 10px rgba(0, 0, 0, .55); }
.cdgw-warn { flex: none; display: flex; gap: 2px; }
.cdgw-warn i { display: block; width: 6px; height: 6px; border-radius: 50%; background: ${C.or}; }

/* Réactions des spectateurs : petites bulles sur les bords du terrain, jamais au centre ; trois rangées
   par côté espacées de 40 px (32 px au moins entre deux rangées, décision A12 du 4 nov. 2026) */
.cdgw-bubbles { position: absolute; inset: 0; z-index: 14; pointer-events: none; overflow: hidden; --cdgw-lane: 40px; }
.cdgw-bubble { position: absolute; bottom: 30%; max-width: 40%; padding: 6px 11px; border-radius: 999px; box-sizing: border-box;
  background: ${alpha(C.noir, 0.88)}; border: 1px solid ${alpha(C.blanc, 0.22)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font: 700 13px/1.1 var(--cdg-body); color: ${C.blanc}; }
.cdgw-bubble[data-at="left"] { left: 8px; }
.cdgw-bubble[data-at="right"] { right: 8px; }
.cdgw-bubble[data-lane="1"] { bottom: calc(30% + var(--cdgw-lane)); }
.cdgw-bubble[data-lane="2"] { bottom: calc(30% + var(--cdgw-lane) * 2); }
.cdgw-bubble[data-mine] { border-color: ${alpha(C.rougeVif, 0.7)}; }

/* Pastille « Reconnexion… », « Connexion perdue, on réessaie… » en haut du terrain */
.cdgw-chip { position: absolute; z-index: 16; left: 50%; top: calc(var(--cdg-pitch-top, 6px) + 8px); transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px; max-width: calc(100% - 24px); box-sizing: border-box; padding: 6px 11px; border-radius: 999px;
  pointer-events: none; background: ${alpha(C.noir, 0.9)}; border: 1px solid ${alpha(C.blanc, 0.22)}; font: 600 12.5px/1.15 var(--cdg-body);
  color: ${C.blanc}; white-space: nowrap; }
.cdgw-chip svg { flex: none; width: 14px; height: 14px; }

/* Écran du salon : en grand, muet, sans bouton. Tailles de la planche à l'échelle 1 (scène de
   1280 × 720), multipliées par l'échelle de l'écran (--cdgw-k, prop scale de WatchStage) : le bloc
   est dessiné hors de la mise à l'échelle de la scène (décision A4) ; textes à 16 px de scène au moins */
.cdgw-root[data-variant="screen"] .cdgw-band { padding: calc(12px * var(--cdgw-k, 1)) calc(18px * var(--cdgw-k, 1));
  column-gap: calc(14px * var(--cdgw-k, 1)); row-gap: calc(4px * var(--cdgw-k, 1));
  border-radius: calc(16px * var(--cdgw-k, 1)) calc(16px * var(--cdgw-k, 1)) 0 0; border: 1px solid ${alpha(C.blanc, 0.1)}; border-bottom-color: ${alpha(C.blanc, 0.06)}; }
.cdgw-root[data-variant="screen"] .cdgw-side { gap: calc(8px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-name { font-size: calc(16px * var(--cdgw-k, 1)); font-weight: 700; }
.cdgw-root[data-variant="screen"] .cdgw-score { font-size: calc(34px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-line { font-size: calc(16px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-pawn { width: calc(30px * var(--cdgw-k, 1)); height: calc(30px * var(--cdgw-k, 1)); font-size: calc(12.5px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-pawn[data-side="0"] { box-shadow: 0 0 0 calc(2px * var(--cdgw-k, 1)) ${C.blanc}, 0 4px 10px rgba(0, 0, 0, .55); }
.cdgw-root[data-variant="screen"] .cdgw-warn { gap: calc(3px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-warn i { width: calc(8px * var(--cdgw-k, 1)); height: calc(8px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdg-stage { border: 1px solid ${alpha(C.blanc, 0.1)}; border-top: 0;
  border-radius: 0 0 calc(16px * var(--cdgw-k, 1)) calc(16px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdg-banner { gap: calc(6px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdg-banner strong { font-size: min(calc(64px * var(--cdgw-k, 1)), calc(var(--cdg-pitch-w, 360px) * .14)); }
.cdgw-root[data-variant="screen"] .cdg-banner span { font-size: calc(17px * var(--cdgw-k, 1)); padding: calc(5px * var(--cdgw-k, 1)) calc(11px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdg-float { max-width: calc(100% - 48px * var(--cdgw-k, 1)); padding: calc(14px * var(--cdgw-k, 1)) calc(18px * var(--cdgw-k, 1));
  border-radius: calc(18px * var(--cdgw-k, 1)); gap: calc(6px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdg-float strong { font-size: calc(26px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdg-float span { font-size: calc(16px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-chip { top: calc(var(--cdg-pitch-top, 6px) + 10px * var(--cdgw-k, 1)); gap: calc(8px * var(--cdgw-k, 1));
  padding: calc(8px * var(--cdgw-k, 1)) calc(14px * var(--cdgw-k, 1)); font-size: calc(16px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-chip svg { width: calc(18px * var(--cdgw-k, 1)); height: calc(18px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-bubbles { --cdgw-lane: calc(56px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-bubble { font-size: calc(18px * var(--cdgw-k, 1)); padding: calc(8px * var(--cdgw-k, 1)) calc(14px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-bubble[data-at="left"] { left: calc(12px * var(--cdgw-k, 1)); }
.cdgw-root[data-variant="screen"] .cdgw-bubble[data-at="right"] { right: calc(12px * var(--cdgw-k, 1)); }

@media (prefers-reduced-motion: no-preference) {
  .cdgw-bubble { animation: cdgw-rise 1.5s ease-out both; }
  .cdgw-score[data-pop] { animation: cdgw-pop .5s cubic-bezier(.2, .9, .3, 1.2) both; }
}
/* Montée courte : une bulle ne passe jamais sur la rangée du dessus */
@keyframes cdgw-rise { 0% { opacity: 0; transform: translateY(10px) scale(.9); } 15% { opacity: 1; transform: translateY(0) scale(1); }
  75% { opacity: 1; transform: translateY(-8px); } 100% { opacity: 0; transform: translateY(-12px); } }
@keyframes cdgw-pop { 0% { transform: scale(1.35); } 100% { transform: none; } }
`;

export default function WatchStyles() {
  return <style>{WATCH_CSS}</style>;
}
