import React from 'react';
import { COUPE_COLORS as C } from '../palette';

/*
 * Styles de l'écran de jeu de La Coupe du Gang, préfixés « cdg- » : prototype validé
 * (docs/prototypes/coupe-du-gang.html), puis thème stade du 29 oct. 2026 (rouge, noir, blanc et une
 * touche d'or, docs/fonctions/coupe-du-gang-stade.md, maquettes « StadeAnimation », « StadeAvant »,
 * « StadeMatch »). Couleurs tirées de `COUPE_COLORS` (palette.js), aussi en variables CSS sur
 * `.cdg-root` (`--cdg-rouge`, `--cdg-or`…) ; les anciens noms (`--cdg-gold`, `--cdg-muted`,
 * `--cdg-fg`…) restent, aux nouvelles couleurs, pour les autres écrans du jeu. Le jeu reste sombre
 * quel que soit le thème de l'app. Animations et transitions seulement sans « mouvement réduit »,
 * `transform` et `opacity` uniquement.
 *
 * Stade (StadiumStage) : calque caméra `.cdg-camera` (image + voile des tribunes) sous le canvas ;
 * attributs de la racine posés par la boucle : `data-cam` ("full" / "pitch"), `data-play` (terrain
 * dessiné visible), `data-outro` ; par React : `data-stadium` ("loading" / "on" / "off"),
 * `data-dim` (hors match : stade assombri), `data-end="defaite"` (image en gris).
 */

/** Couleur de la palette avec une transparence. */
function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const noir = (a) => alpha(C.noir, a);
const blanc = (a) => alpha(C.blanc, a);
// Petits textes posés sur le stade (tribunes et lignes blanches dessous)
const TEXT_SHADOW = '0 1px 3px rgba(0, 0, 0, .9)';

export const GAME_CSS = `
.cdg-root { --cdg-display: 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif; --cdg-body: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --cdg-rouge: ${C.rouge}; --cdg-rouge-vif: ${C.rougeVif}; --cdg-rouge-sombre: ${C.rougeSombre};
  --cdg-noir: ${C.noir}; --cdg-noir2: ${C.noir2}; --cdg-noir3: ${C.noir3};
  --cdg-blanc: ${C.blanc}; --cdg-blanc-casse: ${C.blancCasse}; --cdg-gris-clair: ${C.grisClair}; --cdg-gris: ${C.gris}; --cdg-gris-sombre: ${C.grisSombre};
  --cdg-or: ${C.or}; --cdg-or-bord: ${C.orBord}; --cdg-etoile: ${C.etoile};
  --cdg-gold: ${C.or}; --cdg-rival: ${C.blancCasse}; --cdg-muted: ${C.gris}; --cdg-fg: ${C.blanc}; --cdg-turf: ${C.rouge}; --cdg-warn: ${C.rougeVif};
  font-family: var(--cdg-body); color: var(--cdg-fg); background: var(--cdg-noir); color-scheme: dark;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.cdg-root button { -webkit-tap-highlight-color: transparent; }
.cdg-root button:focus-visible, .cdg-root input:focus-visible, .cdg-root textarea:focus-visible { outline: 2px solid var(--cdg-or); outline-offset: 2px; }

/* Barre du haut : sans fond, les tribunes passent dessous ; au-dessus du calque caméra */
.cdg-hud { position: relative; z-index: 18; display: flex; align-items: center; gap: 8px; height: 56px; flex: none; }
.cdg-hud-label { flex: 1; min-width: 0; margin: 0; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font: 700 15px/1.1 var(--cdg-display); letter-spacing: .12em; text-transform: uppercase; color: var(--cdg-gris-clair); text-shadow: ${TEXT_SHADOW}; }
/* Petit écran (320 px) : « À deux sur ce téléphone », « Contre le salon · Apprenti » en entier */
@media (max-width: 359px) { .cdg-hud-label { font-size: 13px; letter-spacing: .05em; } }
.cdg-icon { width: 44px; height: 44px; flex: none; border-radius: 12px; border: 1px solid ${blanc(0.2)};
  background: ${noir(0.72)}; color: var(--cdg-blanc); display: grid; place-items: center; cursor: pointer; padding: 0; }
.cdg-ping { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 58px; flex: none;
  font: 600 12px/1 var(--cdg-body); font-variant-numeric: tabular-nums; color: var(--cdg-gris-clair); text-shadow: ${TEXT_SHADOW}; }
.cdg-ping.cdg-mid { color: var(--cdg-or); }
.cdg-ping.cdg-bad { color: var(--cdg-rouge-vif); }
.cdg-diag { position: absolute; left: 50%; bottom: -2px; transform: translateX(-50%); margin: 0; white-space: nowrap;
  font: 600 10.5px/1 var(--cdg-body); color: var(--cdg-gris-clair); text-shadow: ${TEXT_SHADOW}; font-variant-numeric: tabular-nums; pointer-events: none; }

.cdg-stage { position: relative; min-height: 0; flex: 1; }
.cdg-canvas { position: absolute; inset: 0; z-index: 2; display: block; width: 100%; height: 100%; touch-action: none; }

/* Stade (StadiumStage) : l'image est LE terrain du match ; la caméra ne déplace qu'elle et le voile */
/* Sans will-change : Chrome garderait l'image rendue à l'échelle du stade entier, floue sur le terrain */
.cdg-camera { position: absolute; inset: 0; z-index: 0; pointer-events: none; transform-origin: 0 0; transform: var(--cdg-cam-full, none); }
.cdg-root[data-cam="pitch"] .cdg-camera { transform: none; }
.cdg-root:not([data-stadium="on"]) .cdg-camera { visibility: hidden; }
.cdg-pic { position: absolute; left: 0; top: 0; }
.cdg-pic img { display: block; width: 100%; height: 100%; -webkit-user-drag: none; }
.cdg-pic::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 var(--cdg-edge, 24px) calc(var(--cdg-edge, 24px) / 2) var(--cdg-noir); }
.cdg-root[data-end="defaite"] .cdg-pic img { filter: grayscale(.85); }
/* Voile des tribunes : bordures sombres autour du terrain et de ses filets (largeurs posées par StadiumStage) */
.cdg-veil { position: absolute; inset: 0; z-index: 1; box-sizing: border-box; border: 0 solid ${noir(0.6)}; opacity: 0; }
.cdg-root[data-cam="pitch"] .cdg-veil { opacity: 1; }
/* Hors match : le stade assombri derrière les panneaux (l'écran de fin a son propre voile) */
.cdg-dim { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: var(--cdg-noir); opacity: 0; }
.cdg-root[data-stadium="on"][data-dim] .cdg-dim { opacity: .5; }
/* Caméra en voyage (stade entier, zoom) : terrain dessiné, barre du haut et réactions effacés, et
   hors d'atteinte du clavier et des lecteurs d'écran (visibility, après le fondu). Image du stade
   encore en chargement : canvas caché aussi (sinon l'ancien terrain dessiné, en gros plan, puis le
   stade entier d'un coup) ; il revient avec son terrain dessiné si l'image n'est pas là au coup
   d'envoi, et reste seulement quand l'image a échoué */
.cdg-root:not([data-stadium="off"]):not([data-play]) .cdg-canvas { opacity: 0; }
.cdg-root:not([data-play]) .cdg-hud,
.cdg-root:not([data-play]) .cdg-v2,
.cdg-root:not([data-play]) .cdg-banner-zone,
.cdg-root:not([data-play]) .cdg-reacts { opacity: 0; visibility: hidden; pointer-events: none; }

/* Règlement v2 (RulesHud, planche « Écran de match » du 31 oct. 2026) : sous la barre du haut, les
   buts de chacun en pastilles (rouge : toi, blanc : l'adversaire), ses avertissements (or), au
   milieu l'événement, le penalty et son compte, le but en or ; dessous la jauge du prochain
   événement (remplie par la boucle, transform seul). Montée seulement en règlement v2 */
/* Hauteur fixe, quoi qu'affiche la bande (jeu, événement, penalty, but en or) : 22 + 5 + 14 + 6 =
   47 px. Sinon le stage change de taille et le terrain saute (contre-expertise du 31 oct. 2026 :
   38,8 px en jeu, 40,8 pendant un événement, 46,8 au penalty) */
.cdg-v2 { position: relative; z-index: 18; flex: none; display: flex; flex-direction: column; gap: 5px; height: 47px; box-sizing: border-box;
  padding: 0 4px 6px; overflow: hidden; text-shadow: ${TEXT_SHADOW}; }
/* Trois colonnes : toi, le milieu (qui cède la place, texte coupé), l'adversaire */
.cdg-v2-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; flex: none; }
.cdg-v2-row.cdg-v2-top { height: 22px; }
.cdg-v2-row.cdg-v2-low { height: 14px; }
.cdg-v2-mid { min-width: 0; display: flex; justify-content: center; }
.cdg-v2-side { min-width: 0; display: flex; align-items: center; gap: 7px; }
.cdg-v2-name { flex: none; max-width: 104px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font: 800 16px/1.05 var(--cdg-display); letter-spacing: .06em; text-transform: uppercase; color: var(--cdg-blanc); }
.cdg-v2-name.cdg-me { color: var(--cdg-rouge-vif); }
.cdg-v2-pips { flex: none; display: flex; gap: 3px; }
.cdg-v2-pip { display: block; width: 11px; height: 11px; border-radius: 50%; box-sizing: border-box; border: 2px solid var(--cdg-gris-sombre); background: ${noir(0.55)}; }
.cdg-v2-pip.cdg-on.cdg-me { background: var(--cdg-rouge); border-color: var(--cdg-rouge); }
.cdg-v2-pip.cdg-on.cdg-rival { background: var(--cdg-blanc-casse); border-color: var(--cdg-blanc-casse); }
.cdg-v2-warn { flex: none; display: flex; align-items: center; gap: 3px; font: 600 10.5px/1 var(--cdg-body); color: var(--cdg-gris-clair); }
.cdg-v2-warn > span { margin-right: 2px; }
.cdg-v2-dot { display: block; width: 9px; height: 9px; border-radius: 50%; box-sizing: border-box; border: 1.5px solid var(--cdg-or); background: ${noir(0.55)}; }
.cdg-v2-dot.cdg-on { background: var(--cdg-or); }
.cdg-v2-chip { min-width: 0; max-width: 100%; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px; overflow: hidden;
  border-radius: 999px; background: ${noir(0.86)}; border: 1px solid ${blanc(0.2)}; text-shadow: none;
  font: 800 14px/1 var(--cdg-display); letter-spacing: .08em; text-transform: uppercase; color: var(--cdg-blanc); }
.cdg-v2-chip > span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cdg-v2-chip b { flex: none; font-size: 19px; line-height: 20px; font-weight: 800; color: var(--cdg-or); font-variant-numeric: tabular-nums; }
.cdg-v2-chip.cdg-v2-gold b { font-size: 16px; }
.cdg-v2-chip.cdg-v2-pen, .cdg-v2-chip.cdg-v2-gold { border-color: ${alpha(C.or, 0.6)}; color: var(--cdg-or); }
/* Deuxième rangée : toutes les lignes sur 14 px (libellé d'un événement en 13 px compris) */
.cdg-v2-line { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: center;
  font: 600 11.5px/14px var(--cdg-body); color: var(--cdg-blanc); }
/* La jauge cède la place aux avertissements : son libellé se coupe (« ORAGE + ARRO… » à 320 px) */
.cdg-v2-gauge { min-width: 0; height: 14px; overflow: hidden; display: flex; align-items: center; gap: 8px; visibility: hidden;
  font: 600 11px/14px var(--cdg-body); color: var(--cdg-gris-clair); }
.cdg-v2-gauge[data-on] { visibility: visible; }
.cdg-v2-gauge-label { flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cdg-v2-gauge[data-live] .cdg-v2-gauge-label { font: 800 13px/14px var(--cdg-display); letter-spacing: .08em; text-transform: uppercase; color: var(--cdg-or); }
.cdg-v2-bar { flex: 1 0 24px; height: 6px; border-radius: 3px; overflow: hidden; background: ${blanc(0.16)}; }
.cdg-v2-fill { display: block; height: 100%; background: var(--cdg-or); transform-origin: left center; transform: scaleX(0); }
/* Petit écran (320 px) : pastilles et noms plus petits, le nom de l'adversaire coupé plus tôt */
@media (max-width: 359px) {
  .cdg-v2-row { gap: 6px; }
  .cdg-v2-side { gap: 5px; }
  .cdg-v2-name { max-width: 64px; font-size: 14px; letter-spacing: .03em; }
  .cdg-v2-pips { gap: 2px; }
  .cdg-v2-pip { width: 8px; height: 8px; border-width: 1.5px; }
  .cdg-v2-chip { padding: 0 7px; font-size: 13px; letter-spacing: .05em; }
  .cdg-v2-gauge { gap: 6px; }
  .cdg-v2-gauge-label { font-size: 10px; }
  .cdg-v2-gauge[data-live] .cdg-v2-gauge-label { font-size: 12px; letter-spacing: .04em; }
}

/* Bandeaux du règlement v2 (RulesBanner) : un à la fois sur le terrain, jamais dans le canvas.
   Milieu du terrain par défaut ; au-dessus de la bannière « BUT ! » du dessin pour un but ou le
   but en or ; loin du point de penalty et du tireur pour une faute (--cdg-pitch-top et
   --cdg-pitch-h : terrain dans le stage, posés par StadiumStage). Jamais sur le cadre du score,
   au bord droit du terrain (36 px de chaque côté laissés libres) */
.cdg-banner-zone { position: absolute; inset: 0; z-index: 13; pointer-events: none; overflow: hidden; }
.cdg-banner { position: absolute; left: 50%; top: calc(var(--cdg-pitch-top, 6px) + var(--cdg-pitch-h, 600px) * .45);
  width: max-content; max-width: min(calc(100% - 24px), calc(var(--cdg-pitch-w, 360px) - 72px)); box-sizing: border-box; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.cdg-banner[data-pos="high"] { top: calc(var(--cdg-pitch-top, 6px) + var(--cdg-pitch-h, 600px) * .26); }
.cdg-banner[data-pos="low"] { top: calc(var(--cdg-pitch-top, 6px) + var(--cdg-pitch-h, 600px) * .74); }
.cdg-banner strong { max-width: 100%; font: 800 min(46px, calc(var(--cdg-pitch-w, 360px) * .125))/.92 var(--cdg-display); letter-spacing: .03em; text-transform: uppercase;
  text-wrap: balance; color: var(--cdg-blanc); text-shadow: 0 .07em 0 ${alpha(C.rougeSombre, 0.95)}, 0 0 18px ${noir(0.6)}; }
.cdg-banner span { max-width: 100%; box-sizing: border-box; padding: 5px 11px; border-radius: 999px; background: ${noir(0.86)};
  font: 600 13.5px/1.3 var(--cdg-body); color: var(--cdg-blanc); }
.cdg-banner span.cdg-banner-sub2 { color: var(--cdg-or); font-weight: 700; }
.cdg-banner[data-kind="foul"] strong, .cdg-banner[data-kind="warn"] strong,
.cdg-banner[data-kind="penalty"] strong, .cdg-banner[data-kind="gold"] strong { color: var(--cdg-or); }
.cdg-banner[data-kind="elec"] strong { color: ${C.elecClair}; text-shadow: 0 .07em 0 rgba(10, 40, 90, .95), 0 0 22px ${alpha(C.elec, 0.6)}; }
.cdg-banner[data-kind="fire"] strong { color: ${C.feuClair}; text-shadow: 0 .07em 0 ${alpha(C.rougeSombre, 0.95)}, 0 0 22px ${alpha(C.feu, 0.55)}; }

.cdg-reacts { position: relative; z-index: 18; flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0 4px; }
.cdg-reacts-row { display: flex; gap: 12px; }
.cdg-react { width: 52px; height: 52px; border-radius: 50%; border: 1px solid ${blanc(0.2)}; background: ${noir(0.7)};
  font-size: 22px; line-height: 1; display: grid; place-items: center; cursor: pointer; padding: 0; }
.cdg-react:disabled { opacity: .45; cursor: default; }
.cdg-reacts small { font-size: 11.5px; color: var(--cdg-gris); text-shadow: ${TEXT_SHADOW}; }

.cdg-clock { position: absolute; z-index: 15; left: 10px; top: 8px; display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  border-radius: 999px; pointer-events: none; background: ${noir(0.86)}; border: 1px solid ${blanc(0.28)};
  font: 700 15px/1 var(--cdg-display); letter-spacing: .06em; color: var(--cdg-blanc); font-variant-numeric: tabular-nums; }
.cdg-clock svg { color: var(--cdg-gris-clair); }
.cdg-clock.cdg-urgent { color: var(--cdg-rouge-vif); border-color: ${alpha(C.rougeVif, 0.6)}; }
.cdg-clock.cdg-urgent svg { color: var(--cdg-rouge-vif); }
/* Astuce du début : juste dans le terrain, sous le nom de l'adversaire (--cdg-pitch-top, StadiumStage) */
.cdg-hint { position: absolute; z-index: 30; left: 50%; top: calc(var(--cdg-pitch-top, 6px) + 6px); transform: translateX(-50%); width: max-content; max-width: calc(100% - 24px);
  box-sizing: border-box; padding: 10px 14px; border-radius: 999px; pointer-events: none; text-align: center;
  background: ${noir(0.92)}; border: 1px solid ${blanc(0.22)}; font: 600 13px/1.3 var(--cdg-body); color: var(--cdg-blanc); }
/* Astuce posée en bas du terrain (penalty tiré vers la cage du haut : rien ne cache le gardien) */
.cdg-hint[data-pos="bottom"] { top: calc(var(--cdg-pitch-top, 6px) + var(--cdg-pitch-h, 600px) - 6px); transform: translate(-50%, -100%); }
.cdg-bubble { position: absolute; z-index: 14; pointer-events: none; }
.cdg-bubble.cdg-mine { left: 18px; bottom: 18px; font-size: 34px; line-height: 1; }
.cdg-bubble.cdg-theirs { right: 30px; top: 14px; padding: 6px 10px; border-radius: 999px; background: ${noir(0.86)};
  border: 1px solid ${blanc(0.28)}; font: 600 12px/1 var(--cdg-body); display: flex; align-items: center; gap: 6px; }
.cdg-bubble.cdg-theirs b { color: var(--cdg-blanc); font-weight: 600; }
.cdg-bubble.cdg-theirs span { font-size: 16px; line-height: 1; }

.cdg-float { position: absolute; z-index: 16; left: 50%; top: 50%; transform: translate(-50%, -50%); width: max-content; max-width: calc(100% - 112px);
  box-sizing: border-box; padding: 14px 18px; border-radius: 18px; text-align: center; background: ${noir(0.92)};
  border: 1px solid ${blanc(0.16)}; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.cdg-float strong { font: 800 22px/1.05 var(--cdg-display); letter-spacing: .04em; text-transform: uppercase; }
.cdg-float span { font-size: 13px; color: var(--cdg-gris); }
.cdg-pending { display: none; }
.cdg-root[data-phase="over"] .cdg-pending { display: flex; }

.cdg-overlay { position: absolute; inset: 0; bottom: var(--keyboard-overlap, 0px); z-index: 20; display: flex; align-items: center; justify-content: center;
  padding: 12px 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; background: ${noir(0.45)}; }
.cdg-overlay.cdg-soft { background: ${noir(0.3)}; }
.cdg-overlay.cdg-top { z-index: 40; background: ${noir(0.72)}; }
.cdg-panel { position: relative; width: 100%; max-width: 372px; margin: auto; box-sizing: border-box; background: var(--cdg-noir2);
  border: 1px solid ${blanc(0.12)}; border-radius: 24px; padding: 22px 20px 16px; display: flex; flex-direction: column;
  gap: 16px; box-shadow: 0 30px 80px rgba(0, 0, 0, .55); }
.cdg-panel:focus { outline: none; }
.cdg-eyebrow { margin: 0; padding-right: 48px; font: 600 11px/1.2 var(--cdg-body); letter-spacing: .14em; text-transform: uppercase; color: var(--cdg-gris); }
.cdg-title { margin: 0; font: 800 clamp(48px, 15vw, 66px)/.84 var(--cdg-display); text-transform: uppercase; }
.cdg-title span { color: var(--cdg-or); }
.cdg-lead { margin: 0; color: var(--cdg-gris); font-size: 14px; line-height: 1.5; }
.cdg-label { margin: 0; font: 700 14px/1 var(--cdg-display); letter-spacing: .12em; text-transform: uppercase; }
.cdg-btn { min-height: 52px; border-radius: 14px; border: 1px solid transparent; padding: 8px 14px; cursor: pointer;
  font: 800 19px/1.1 var(--cdg-display); letter-spacing: .06em; text-transform: uppercase;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
.cdg-btn:disabled { opacity: .5; cursor: default; }
.cdg-btn.cdg-btn-17 { font-size: 17px; padding-left: 10px; padding-right: 10px; white-space: nowrap; }
.cdg-btn.cdg-btn-sm { min-height: 50px; font-size: 16px; padding-left: 8px; padding-right: 8px; text-align: center; }
.cdg-root a.cdg-btn { text-decoration: none; }
.cdg-story-img { display: block; max-width: 100%; max-height: 52vh; margin: 0 auto; border-radius: 16px; object-fit: contain;
  -webkit-touch-callout: default; -webkit-user-select: auto; user-select: auto; }
.cdg-btn .cdg-inline { display: inline-flex; align-items: center; gap: 8px; }
.cdg-primary { background: var(--cdg-rouge); color: var(--cdg-blanc); }
.cdg-ghost { background: transparent; color: var(--cdg-blanc); border-color: ${blanc(0.3)}; }
.cdg-danger { background: var(--cdg-rouge-sombre); color: var(--cdg-blanc); }
.cdg-btn small { font: 500 12px/1.2 var(--cdg-body); letter-spacing: 0; text-transform: none; color: var(--cdg-gris-clair); }
.cdg-primary small { color: var(--cdg-blanc); }
.cdg-input { flex: 1; min-width: 0; min-height: 52px; box-sizing: border-box; border-radius: 14px; border: 1px solid ${blanc(0.22)};
  background: ${blanc(0.05)}; color: var(--cdg-blanc); padding: 0 12px; text-align: center;
  font: 800 26px/1 var(--cdg-display); letter-spacing: .3em; font-variant-numeric: tabular-nums;
  -webkit-user-select: text; user-select: text; }
.cdg-input::placeholder { font: 500 14px/1 var(--cdg-body); letter-spacing: 0; color: var(--cdg-gris); }
.cdg-input:focus { outline: none; border-color: var(--cdg-or); }
.cdg-textarea { width: 100%; box-sizing: border-box; min-height: 84px; resize: none; border-radius: 14px; border: 1px solid ${blanc(0.22)};
  background: ${blanc(0.05)}; color: var(--cdg-blanc); padding: 10px 12px; font: 400 16px/1.4 var(--cdg-body);
  -webkit-user-select: text; user-select: text; }
.cdg-textarea:focus { outline: none; border-color: var(--cdg-or); }
.cdg-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px;
  border-radius: 14px; background: ${blanc(0.05)}; border: 1px solid ${blanc(0.1)}; }
.cdg-seg button { min-height: 42px; border: 0; border-radius: 10px; background: transparent; color: var(--cdg-gris);
  font: 700 16px/1 var(--cdg-display); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
.cdg-seg button[aria-checked="true"] { background: var(--cdg-blanc); color: var(--cdg-noir); }
.cdg-rules { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; font-size: 13px; line-height: 1.4; color: var(--cdg-gris); }
.cdg-rules li { display: flex; gap: 9px; align-items: baseline; }
.cdg-rules li::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--cdg-rouge); transform: translateY(-1px); }
.cdg-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 10px;
  border-top: 1px solid ${blanc(0.1)}; padding-top: 4px; font-size: 11.5px; line-height: 1.4; color: var(--cdg-gris); }
.cdg-link { background: none; border: 0; color: var(--cdg-blanc); font: 600 12.5px var(--cdg-body); padding: 0 4px; min-height: 44px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px; }
.cdg-link:disabled { opacity: .5; cursor: default; }
.cdg-message { margin: 0; font: 800 34px/1 var(--cdg-display); text-transform: uppercase; text-wrap: balance; }
.cdg-message.cdg-sm { font-size: 28px; }
.cdg-panel .cdg-message { padding-right: 40px; }
.cdg-code { margin: 0; text-align: center; font: 800 104px/.9 var(--cdg-display); letter-spacing: .12em; color: var(--cdg-blanc); font-variant-numeric: tabular-nums; }
.cdg-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cdg-row.cdg-single { grid-template-columns: minmax(0, 1fr); }
.cdg-wait { margin: 0; display: flex; align-items: center; justify-content: center; gap: 10px; font: 700 17px/1.2 var(--cdg-display); letter-spacing: .08em; text-transform: uppercase; text-align: center; }
.cdg-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--cdg-rouge); flex: none; }
.cdg-close { position: absolute; z-index: 1; top: 10px; right: 10px; width: 44px; height: 44px; border-radius: 12px;
  border: 1px solid ${blanc(0.2)}; background: ${noir(0.72)}; color: var(--cdg-blanc); display: grid; place-items: center; cursor: pointer; padding: 0; }
.cdg-small { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--cdg-gris); text-align: center; }
.cdg-alert { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4;
  background: ${alpha(C.rouge, 0.12)}; border: 1px solid ${alpha(C.rougeVif, 0.45)}; color: var(--cdg-blanc); }
.cdg-choices { margin: 0; padding: 0; border: 0; display: grid; gap: 8px; }
.cdg-choice { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 14px; border-radius: 14px; cursor: pointer;
  border: 1px solid ${blanc(0.14)}; background: ${blanc(0.03)}; font-size: 15px; }
.cdg-choice:has(input:checked) { border-color: var(--cdg-rouge-vif); background: ${alpha(C.rouge, 0.12)}; }
.cdg-choice input { width: 18px; height: 18px; margin: 0; accent-color: ${C.rouge}; }

/* Pion d'un joueur (même dessin que sur le terrain) : anneau rouge ou blanc posé par Pawn */
.cdg-pawn { position: relative; flex: none; border-radius: 50%; box-sizing: border-box; box-shadow: 3px 6px 0 rgba(0, 0, 0, .3); }
.cdg-pawn-in { width: 100%; height: 100%; border-radius: 50%; display: grid; place-items: center; color: var(--cdg-blanc);
  background: radial-gradient(circle at 35% 30%, #34353a, var(--cdg-noir2)); font-family: var(--cdg-display); font-weight: 800; }
.cdg-pawn-mark { position: absolute; display: grid; place-items: center; border-radius: 50%; background: ${noir(0.9)}; }

/* Avant-match (MatchIntro) : bandeau et affiche des deux joueurs sur le stade entier */
.cdg-intro { position: absolute; inset: 0; z-index: 12; pointer-events: none; display: flex; align-items: center; justify-content: center;
  padding: 0 max(24px, env(safe-area-inset-right, 0px)) 0 max(24px, env(safe-area-inset-left, 0px)); }
.cdg-intro-band { position: absolute; left: 0; right: 0; top: 0; padding: calc(env(safe-area-inset-top, 0px) + 18px) 16px 34px;
  display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center; text-shadow: ${TEXT_SHADOW};
  background: linear-gradient(${noir(0.92)}, ${noir(0.7)} 55%, ${noir(0)}); }
.cdg-intro-title { margin: 0; font: 800 16px/1 var(--cdg-display); letter-spacing: .3em; text-transform: uppercase; }
.cdg-intro-title span { color: var(--cdg-or); }
.cdg-intro-mode { margin: 0; display: flex; align-items: center; gap: 8px; font: 600 11px/1 var(--cdg-body); letter-spacing: .14em;
  text-transform: uppercase; color: var(--cdg-gris-clair); }
.cdg-intro-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--cdg-rouge); }
.cdg-vs { width: 100%; max-width: 330px; box-sizing: border-box; padding: 18px 14px 16px; border-radius: 20px; background: ${noir(0.84)};
  border: 1px solid ${blanc(0.16)}; display: flex; flex-direction: column; gap: 14px; }
.cdg-vs-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.cdg-vs-side { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.cdg-vs-name { max-width: 100%; min-height: 2.1em; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow-wrap: break-word; text-align: center; font: 800 20px/1.05 var(--cdg-display); letter-spacing: .06em; text-transform: uppercase; }
.cdg-vs-mark { flex: none; width: 56px; height: 56px; margin: 0 4px; display: grid; place-items: center; transform: rotate(45deg);
  background: var(--cdg-rouge); box-shadow: 0 0 0 4px ${alpha(C.rouge, 0.25)}; }
.cdg-vs-mark span { transform: rotate(-45deg); font: 800 26px/1 var(--cdg-display); }
.cdg-vs-rules { margin: 0; text-align: center; font-size: 12.5px; line-height: 1.4; color: var(--cdg-gris-clair); }
.cdg-vs-rules b { color: var(--cdg-or); font-weight: 600; }
/* Fin du match (MatchIntro) : « FIN DU MATCH » au centre du terrain, avant le zoom arrière */
.cdg-outro { position: absolute; left: 0; right: 0; top: var(--cdg-pitch-cy, 50%); z-index: 12; pointer-events: none;
  transform: translateY(-50%); display: flex; justify-content: center; }
.cdg-outro span { padding: 10px 18px; background: var(--cdg-noir); border: 1px solid ${blanc(0.3)};
  font: 800 30px/1 var(--cdg-display); letter-spacing: .14em; text-transform: uppercase; }

/* Défi reçu : transparent sur le stade (assombri hors match) ; voilé quand il passe sur l'écran de fin */
.cdg-screen { position: absolute; inset: 0; z-index: 25; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;
  background: ${noir(0.72)}; display: flex; flex-direction: column; padding: 8px 0 12px; }
.cdg-root[data-dim] .cdg-screen { background: transparent; }
.cdg-root:not([data-stadium="on"])[data-dim] .cdg-screen { background: ${noir(0.62)}; }
.cdg-defi { position: relative; width: 100%; max-width: 420px; margin: auto; box-sizing: border-box; border-radius: 26px; background: var(--cdg-noir2);
  border: 1px solid ${blanc(0.1)}; padding: 18px 20px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, .5); }
.cdg-defi .cdg-eyebrow { margin-top: 8px; padding: 0 44px; text-align: center; }
.cdg-chip { margin-top: -6px; padding: 5px 10px; border-radius: 999px; background: ${blanc(0.1)}; color: var(--cdg-blanc);
  font: 700 12px/1 var(--cdg-display); letter-spacing: .1em; text-transform: uppercase; }
.cdg-defi-title { margin: 0; text-align: center; font: 800 40px/.95 var(--cdg-display); text-transform: uppercase; text-wrap: balance; }
.cdg-countdown { display: flex; align-items: center; gap: 12px; }
.cdg-countdown span { font-size: 13px; line-height: 1.4; color: var(--cdg-gris); }
.cdg-ring { width: 56px; height: 56px; flex: none; border-radius: 50%; display: grid; place-items: center; }
.cdg-ring b { width: 46px; height: 46px; border-radius: 50%; background: var(--cdg-noir2); display: grid; place-items: center;
  font: 800 17px/1 var(--cdg-display); font-variant-numeric: tabular-nums; }
.cdg-stakes { width: 100%; border-radius: 16px; background: ${blanc(0.04)}; border: 1px solid ${blanc(0.08)}; }
.cdg-stakes > div { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; font-size: 13.5px; }
.cdg-stakes > div + div, .cdg-stakes > p { border-top: 1px solid ${blanc(0.06)}; }
.cdg-stakes > div span:first-child { color: var(--cdg-gris); }
.cdg-stakes b { font: 800 18px/1 var(--cdg-display); }
.cdg-stakes > p { margin: 0; padding: 12px 14px; font-size: 12.5px; line-height: 1.45; color: var(--cdg-gris); }
@media (max-height: 640px) {
  .cdg-defi { gap: 10px; padding: 12px 16px 14px; }
  .cdg-defi-title { font-size: 32px; }
  .cdg-ring { width: 46px; height: 46px; }
  .cdg-ring b { width: 38px; height: 38px; font-size: 15px; }
  .cdg-stakes > div, .cdg-stakes > p { padding-top: 8px; padding-bottom: 8px; }
}

/* Fin du match : la place de l'écran de fin, par-dessus le stade (EndScreen pose son voile, ses
   dégradés et ses textes ; aucun transform, filter ou contain ici : son voile est en position fixed) */
.cdg-end { position: absolute; inset: 0; z-index: 22; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;
  background: none; display: flex; }
/* Titre du panneau « Pause » */
.cdg-result { margin: 0; font: 800 84px/.86 var(--cdg-display); text-transform: uppercase; }

/* Téléphone en paysage */
.cdg-rotate { position: absolute; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 16px; text-align: center; background: var(--cdg-noir); }
.cdg-rotate strong { font: 800 30px/1 var(--cdg-display); letter-spacing: .04em; text-transform: uppercase; }
.cdg-rotate span { font-size: 14px; color: var(--cdg-gris); }

@keyframes cdg-rise { from { transform: translateY(14px) scale(.98); opacity: .5; } to { transform: none; opacity: 1; } }
@keyframes cdg-float-up { 0% { transform: translateY(10px) scale(.6); opacity: 0; } 15% { transform: translateY(0) scale(1.1); opacity: 1; }
  80% { opacity: 1; } 100% { transform: translateY(-40px) scale(1); opacity: 0; } }
@keyframes cdg-pulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
@keyframes cdg-spin { to { transform: rotate(360deg); } }
@keyframes cdg-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes cdg-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes cdg-vs-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes cdg-vs-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-12px); } }
@keyframes cdg-banner-in { 0% { opacity: 0; transform: scale(.55); } 60% { opacity: 1; transform: scale(1.08); } 100% { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: no-preference) {
  .cdg-panel, .cdg-defi { animation: cdg-rise .35s cubic-bezier(.2, .9, .3, 1.15); }
  .cdg-bubble { animation: cdg-float-up 1.6s ease-out forwards; }
  .cdg-dot { animation: cdg-pulse 1.4s ease-in-out infinite; }
  .cdg-spin { animation: cdg-spin 1s linear infinite; }
  /* Caméra : 1 s vers le terrain, 1,1 s vers le stade entier ; le voile des tribunes la suit */
  .cdg-camera { transition: transform 1.1s cubic-bezier(.65, 0, .35, 1); }
  .cdg-root[data-cam="pitch"] .cdg-camera { transition-duration: 1s; }
  .cdg-veil { transition: opacity .9s ease-in-out; }
  .cdg-dim { transition: opacity .4s ease; }
  /* Canvas : fondu seulement quand il apparaît (fin du zoom). Caché d'un coup (image du stade prête,
     début du zoom arrière) : en fondu, joueurs, ballon et score restaient 0,2 s posés sur le stade
     entier, deux terrains à l'écran */
  .cdg-root[data-play] .cdg-canvas { transition: opacity .2s ease; }
  .cdg-hud, .cdg-v2, .cdg-reacts { transition: opacity .2s ease, visibility 0s; }
  .cdg-root:not([data-play]) .cdg-hud,
  .cdg-root:not([data-play]) .cdg-v2,
  .cdg-root:not([data-play]) .cdg-reacts { transition: opacity .2s ease, visibility 0s .2s; }
  /* Bandeau : il saute, puis s'efface juste avant d'être retiré (--cdg-banner-out) */
  .cdg-banner strong { animation: cdg-banner-in .32s cubic-bezier(.2, .9, .3, 1.1) both; }
  .cdg-banner span { animation: cdg-fade-in .25s ease-out .08s both; }
  .cdg-banner { animation: cdg-fade-out .28s ease-in var(--cdg-banner-out, 1120ms) both; }
  .cdg-intro .cdg-intro-band { animation: cdg-fade-in .3s ease-out both; }
  .cdg-intro .cdg-vs { animation: cdg-vs-in .45s cubic-bezier(.2, .8, .2, 1) both; }
  .cdg-intro.cdg-out .cdg-intro-band { animation: cdg-fade-out .3s ease-in both; }
  .cdg-intro.cdg-out .cdg-vs { animation: cdg-vs-out .35s ease-in both; }
  .cdg-outro span { animation: cdg-fade-in .22s ease-out both; }
  .cdg-outro.cdg-out span { animation: cdg-fade-out .35s ease-in both; }
}
@media (prefers-reduced-motion: reduce) {
  .cdg-intro.cdg-out, .cdg-outro.cdg-out { display: none; }
}
/* Changement sans transition (reprise d'un match, placement recalculé) : withoutTransition() */
.cdg-root[data-instant] .cdg-camera, .cdg-root[data-instant] .cdg-veil, .cdg-root[data-instant] .cdg-canvas,
.cdg-root[data-instant] .cdg-hud, .cdg-root[data-instant] .cdg-v2, .cdg-root[data-instant] .cdg-reacts { transition: none !important; }
`;

export default function GameStyles() {
  return <style>{GAME_CSS}</style>;
}
