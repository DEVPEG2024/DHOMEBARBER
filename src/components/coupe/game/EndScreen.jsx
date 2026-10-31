import React, { useEffect, useRef } from 'react';
import { Ban, Flag, Loader2 } from 'lucide-react';
import { LEVELS } from '@/lib/coupe/engine';
import { COUPE_COLORS as C } from '@/components/coupe/palette';
import BladeRain from './BladeRain';
import { coupePointsLabel, formatDelta, pointsWord, seasonLabel } from './format';

// Match amical : pourquoi le serveur n'a pas compté de points (`end.points.reason`, codes de
// lib/coupePoints.js du serveur)
const REASONS = {
  no_card: 'Match amical : les points comptent quand vous avez tous les deux une carte Gang (au moins une visite au salon).',
  not_eligible: 'Match amical : ce match ne compte pas pour le classement.',
  same_player: 'Match amical : pas de points entre deux comptes « D’Home Barber ».',
  too_short: 'Match trop court pour compter des points (moins de 10 s de jeu)',
  time_limit_draw: 'Match nul : pas de points.',
  cancelled: 'Match annulé : aucun point.',
  no_result: 'Points non comptés pour ce match.',
  db_error: 'Points non comptés : le match n’a pas pu être enregistré.',
};

const DISPLAY = "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif";
const BODY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
// Lisibilité des petits textes posés sur le stade (lignes blanches du terrain dessous)
const TEXT_SHADOW = '0 1px 3px rgba(0, 0, 0, .9), 0 0 14px rgba(0, 0, 0, .55)';

/*
 * Styles de l'écran de fin, thème stade (maquettes « Après-match : victoire » et « Après-match :
 * défaite ») : ici plutôt que dans GameStyles, préfixés « cdg-fin- ». `.cdg-end` (GameStyles) garde
 * la place de l'écran (au-dessus du stade, défilement) ; son fond est retiré : le stade se voit à
 * travers. Le voile et les dégradés couvrent tout l'écran (`position: fixed`), marges et zones sûres
 * comprises, sans défiler avec le texte ; la pluie de lames tombe par-dessus le tout. Animations
 * seulement sans « mouvement réduit ».
 */
const END_CSS = `
.cdg-end.cdg-fin { background: none; }
.cdg-fin-bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; background: rgba(11, 11, 12, .42); }
.cdg-fin[data-tone="defaite"] .cdg-fin-bg { background: rgba(11, 11, 12, .58); }
/* Sans l'image du stade (erreur, chargement) : rien derrière que le dernier dessin du match, couvert */
.cdg-root:not([data-stadium="on"]) .cdg-fin-bg { background: rgba(11, 11, 12, .92); }
.cdg-fin-top { position: absolute; left: 0; right: 0; top: 0; height: calc(env(safe-area-inset-top, 0px) + 120px);
  background: linear-gradient(${C.noir} 45%, rgba(11, 11, 12, 0)); }
.cdg-fin-bottom { position: absolute; left: 0; right: 0; top: 40%; bottom: 0; background: linear-gradient(rgba(11, 11, 12, 0), ${C.noir} 46%); }
/* Pluie de lames de la victoire : par-dessus tout l'écran de fin (sous les dégradés noirs, elle ne
   se voyait que dans la bande du stade et s'arrêtait à mi-écran), jamais cliquable */
.cdg-fin-rain { position: fixed; inset: 0; z-index: 2; overflow: hidden; pointer-events: none; }
.cdg-fin-body { position: relative; z-index: 1; width: 100%; max-width: 420px; min-height: 100%; margin: 0 auto; box-sizing: border-box;
  padding: 14px 8px 12px; display: flex; flex-direction: column; gap: 16px; }
.cdg-fin-eyebrow { margin: 0; text-align: center; font: 600 11px/1.3 ${BODY}; letter-spacing: .16em; text-transform: uppercase;
  color: ${C.grisClair}; text-shadow: ${TEXT_SHADOW}; }
.cdg-fin-head { flex: 1 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 8px 0; text-align: center; }
.cdg-fin-title { margin: 0; max-width: 100%; box-sizing: border-box; font-family: ${DISPLAY}; font-weight: 800; line-height: .86;
  text-transform: uppercase; text-wrap: balance; color: ${C.blanc}; text-shadow: 0 .06em 0 rgba(11, 11, 12, .85); }
.cdg-fin-title[data-size="xxl"] { font-size: min(88px, 23vw); }
.cdg-fin-title[data-size="xl"] { font-size: min(80px, 21vw); }
.cdg-fin-title[data-size="l"] { font-size: min(70px, 18vw); }
.cdg-fin-title[data-size="m"] { font-size: min(58px, 15vw); line-height: .9; }
.cdg-fin-title[data-size="s"] { font-size: min(50px, 13vw); line-height: .92; }
.cdg-fin-title[data-size="xs"] { font-size: min(44px, 11.5vw); line-height: .92; }
.cdg-fin[data-tone="victoire"] .cdg-fin-title { color: ${C.or}; text-shadow: 0 .07em 0 ${C.rouge}; }
.cdg-fin[data-tone="defaite"] .cdg-fin-title { padding: .1em .26em .03em; background: ${C.noir}; border-bottom: 4px solid ${C.rouge}; text-shadow: none; }
.cdg-fin-score { margin: 6px 0 0; display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap; gap: 4px 12px; text-shadow: ${TEXT_SHADOW}; }
.cdg-fin-score > span:first-child { font: 800 46px/1 ${DISPLAY}; font-variant-numeric: tabular-nums; color: ${C.blanc}; }
.cdg-fin-score > span:last-child { font-size: 13px; color: ${C.grisClair}; }
.cdg-fin-note { margin: 0; max-width: 340px; font-size: 13.5px; line-height: 1.45; color: ${C.grisClair}; text-shadow: ${TEXT_SHADOW}; }

.cdg-fin-foot { display: flex; flex-direction: column; gap: 16px; }
.cdg-fin-pts { border-radius: 20px; background: ${C.noir2}; border: 1px solid rgba(255, 255, 255, .14); overflow: hidden; }
.cdg-fin-pts.cdg-fin-gain { border-color: rgba(235, 193, 94, .45); }
.cdg-fin-pts-main { padding: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.cdg-fin-gain .cdg-fin-pts-main { background: linear-gradient(90deg, rgba(235, 193, 94, .16), rgba(235, 193, 94, 0)); }
.cdg-fin-pts-main > span:first-child { display: flex; flex-direction: column; gap: 4px; }
.cdg-fin-delta { font: 800 36px/1 ${DISPLAY}; color: ${C.blanc}; }
.cdg-fin-gain .cdg-fin-delta { color: ${C.or}; }
.cdg-fin-pts-main small { font-size: 12.5px; color: ${C.grisClair}; }
.cdg-fin-total { font: 800 26px/1 ${DISPLAY}; font-variant-numeric: tabular-nums; white-space: nowrap; color: ${C.blanc}; }
.cdg-fin-total > span { color: ${C.gris}; }
.cdg-fin-row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; border-top: 1px solid rgba(255, 255, 255, .08); font-size: 13.5px; }
.cdg-fin-row > span:first-child { color: ${C.gris}; }
.cdg-fin-row > span:last-child { font-weight: 600; color: ${C.blanc}; text-align: right; }
.cdg-fin-row > span.cdg-fin-plus { color: ${C.rougeVif}; }
.cdg-fin-info { margin: 0; padding: 14px 16px; border-radius: 16px; background: ${C.noir2}; border: 1px solid rgba(255, 255, 255, .14);
  font-size: 13.5px; line-height: 1.45; color: ${C.blanc}; }
.cdg-fin-info b { color: ${C.or}; }

.cdg-fin-actions { display: flex; flex-direction: column; gap: 10px; }
.cdg-fin-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cdg-fin-pair.cdg-fin-one { grid-template-columns: minmax(0, 1fr); }
.cdg-fin .cdg-fin-revanche { min-height: 56px; background: ${C.rouge}; border-color: ${C.rouge}; color: ${C.blanc}; font-size: 20px; letter-spacing: .08em; }
.cdg-fin .cdg-fin-revanche small { color: ${C.blanc}; }
.cdg-fin .cdg-fin-revanche:disabled { opacity: 1; background: ${C.noir3}; border-color: rgba(255, 255, 255, .14); color: ${C.gris}; }
.cdg-fin .cdg-fin-revanche:disabled small { color: ${C.grisClair}; }
.cdg-fin .cdg-fin-ghost { min-height: 50px; font-size: 16px; background: transparent; border-color: rgba(255, 255, 255, .4); color: ${C.blanc}; }
.cdg-fin .cdg-fin-ghost:disabled { opacity: .6; }
.cdg-fin-mod { display: flex; justify-content: center; gap: 18px; }
.cdg-fin .cdg-fin-mod .cdg-link { color: ${C.grisClair}; }

@keyframes cdg-fin-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cdg-fin-rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
@keyframes cdg-fin-pop { 0% { opacity: 0; transform: scale(.72); } 60% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: no-preference) {
  .cdg-fin-bg { animation: cdg-fin-fade .45s ease-out both; }
  .cdg-fin-title { animation: cdg-fin-pop .55s cubic-bezier(.2, .9, .3, 1.1) .05s both; }
  .cdg-fin-eyebrow, .cdg-fin-score, .cdg-fin-note { animation: cdg-fin-fade .4s ease-out .2s both; }
  .cdg-fin-foot { animation: cdg-fin-rise .5s cubic-bezier(.2, .8, .2, 1) .12s both; }
}
`;

/** Place au classement : « 6e », avec le suffixe en exposant. */
function Place({ rank }) {
  return <>{rank}<sup>{rank === 1 ? 're' : 'e'}</sup></>;
}

function PlaceRow({ points }) {
  const { rank, rankBefore } = points;
  if (!rank) return <span>Hors classement</span>;
  if (rankBefore && rankBefore !== rank) {
    return (
      <span role="img" aria-label={`${rankBefore}e place avant le match, ${rank}e après`}>
        <Place rank={rankBefore} /> → <Place rank={rank} />
      </span>
    );
  }
  return <span><Place rank={rank} /> place</span>;
}

function PointsCard({ points, opponent, draw, reason }) {
  if (draw) return <p className="cdg-fin-info" role="status">{REASONS.time_limit_draw}</p>;
  // Fin envoyée sans les points (le serveur ne les a pas confirmés à temps) : ils arrivent ensuite
  if (!points) {
    if (reason === 'too_short') return <p className="cdg-fin-info" role="status">{REASONS.too_short}</p>;
    return <p className="cdg-fin-info" role="status">Points pas encore confirmés : regarde ton classement dans un instant.</p>;
  }
  if (!points.ranked) {
    const why = REASONS[points.reason] || REASONS[reason] || 'Match amical : pas de points pour ce match.';
    return <p className="cdg-fin-info" role="status">{why}</p>;
  }
  const before = points.total == null ? null : points.total - points.delta;
  // Bord et gain en or quand le match rapporte (victoire) ; en blanc sinon
  const gain = Number(points.delta) > 0;
  return (
    <div className={`cdg-fin-pts${gain ? ' cdg-fin-gain' : ''}`}>
      <div className="cdg-fin-pts-main">
        <span>
          <span className="cdg-fin-delta">{formatDelta(points.delta)}</span>
          <small>{coupePointsLabel(points.delta)}</small>
        </span>
        {points.total != null && (
          <span className="cdg-fin-total" role="img" aria-label={`${before} points avant, ${points.total} après`}>
            <span>{before}</span> → {points.total}
          </span>
        )}
      </div>
      <div className="cdg-fin-row">
        <span>{seasonLabel()}</span>
        <PlaceRow points={points} />
      </div>
      <div className="cdg-fin-row">
        <span>{opponent}</span>
        {/* Ce que gagne l'adversaire, en rouge ; ce qu'il perd, en blanc */}
        <span className={Number(points.oppDelta) > 0 ? 'cdg-fin-plus' : undefined}>
          {formatDelta(points.oppDelta)} {pointsWord(points.oppDelta)}
        </span>
      </div>
    </div>
  );
}

/** Fin d'un match hors ligne en règlement v2 (`reason` du match) : une ligne sous le score, ou rien. */
function offlineNote(result) {
  if (result?.draw) return 'But en or sans but en 2 minutes : match nul.';
  if (result?.reason === 'golden_goal') return 'Égalité au bout des 5 minutes : le premier but a tout décidé.';
  if (result?.reason === 'time_limit') return 'Temps écoulé : 5 minutes de jeu, celui qui mène gagne.';
  return null;
}

/**
 * Titre et textes de la fin, d'après le résultat (en ligne, contre le salon, à deux).
 * `tone` : 'victoire' (titre en or, pluie de lames), 'defaite' (titre blanc sur bande noire
 * soulignée de rouge, stade en gris) ou 'neutre' (match nul ou annulé, titre blanc).
 */
export function endTexts({ mode, level, opponent, result }) {
  const online = mode === 'online';
  const out = { eyebrow: '', title: '', win: false, tone: 'defaite', who: '', note: null, info: null };
  if (online) {
    out.eyebrow = `En ligne · contre ${opponent}`;
    out.who = `Toi contre ${opponent}`;
    if (result?.cancelled) {
      out.title = 'Match annulé';
      out.note = 'Moins de 20 s de jeu avant l’abandon : le match ne compte pas.';
    } else if (result?.draw) {
      out.title = 'Match nul';
      out.note = 'Temps écoulé : 5 minutes de jeu sans vainqueur.';
    } else if (result?.reason === 'golden_goal' && !result?.forfeit) {
      // Règlement v2 : égalité au bout des 5 minutes, le premier but a gagné (points normaux)
      out.win = !!result?.won;
      out.title = out.win ? 'Victoire au but en or' : 'Défaite au but en or';
      out.note = 'Égalité au bout des 5 minutes : le premier but a tout décidé.';
    } else if (result?.reason === 'time_limit' && !result?.forfeit) {
      // 5 minutes de jeu effectif : celui qui mène gagne
      out.win = !!result?.won;
      out.title = out.win ? 'Victoire au temps' : 'Défaite au temps';
      out.note = 'Temps écoulé : 5 minutes de jeu, celui qui mène gagne.';
    } else {
      out.win = !!result?.won;
      out.title = out.win ? 'Victoire' : 'Défaite';
      if (result?.abandoned) out.note = 'Tu as abandonné : défaite par forfait.';
      else if (result?.forfeit) out.note = out.win ? `${opponent} a quitté le match : victoire par forfait.` : 'Défaite par forfait.';
    }
  } else if (mode === 'local') {
    out.eyebrow = 'À deux sur ce téléphone';
    out.who = 'Bas contre haut';
    // Règlement v2 : but en or sans but au bout de 2 minutes = match nul
    out.win = !result?.draw;
    out.title = result?.draw ? 'Match nul' : result?.winner === 1 ? 'Haut gagne' : 'Bas gagne';
    out.note = offlineNote(result);
    out.info = 'Match amical sur un téléphone : pas de points.';
  } else {
    const L = LEVELS[level] || LEVELS.barber;
    out.eyebrow = `Contre le salon · ${L.name}`;
    out.who = `Toi contre ${L.name}`;
    out.win = result?.winner === 0;
    if (result?.draw) out.title = 'Match nul';
    else if (result?.reason === 'golden_goal') out.title = out.win ? 'Victoire au but en or' : 'Défaite au but en or';
    else out.title = out.win ? 'Victoire' : 'Défaite';
    out.note = offlineNote(result);
    out.info = out.win
      ? <>Entraînement, pas de points. En ligne, cette victoire te rapporterait <b>+3 Points de Coupe</b>.</>
      : <>Entraînement, pas de points. En ligne, une défaite retire <b>1 Point de Coupe</b>, jamais sous 0.</>;
  }
  if (out.win) out.tone = 'victoire';
  else if (result?.draw || (online && result?.cancelled)) out.tone = 'neutre';
  return out;
}

/**
 * Taille du titre d'après sa longueur : « Victoire » en très grand, « Victoire au temps » plus petit,
 * « Défaite au temps » encore un peu plus (la bande noire le borde) pour tenir sur une ligne.
 */
function titleSize(title, tone) {
  const n = String(title || '').length;
  if (n > 12) return tone === 'defaite' ? 'xs' : 's';
  if (n > 10) return 'm';
  if (n > 8) return 'l';
  return tone === 'defaite' ? 'xl' : 'xxl';
}

/**
 * Fin du match, par-dessus le stade entier (maquettes « Après-match : victoire / défaite ») :
 * Victoire / Défaite / Match nul, score, points (+3 / −1, total, place avant → après),
 * « Revanche », « Partager en story », « Retour » ; en ligne, Signaler et Bloquer l'adversaire.
 * Victoire : pluie de lames de rasoir.
 */
export default function EndScreen({
  mode, level, opponent, result, rematchNote, canRematch, onRematch, onExit,
  canModerate, onReport, onBlock, blocked, reported, onShare, sharing = false,
}) {
  const rematchRef = useRef(null);
  useEffect(() => {
    rematchRef.current?.focus?.({ preventScroll: true });
  }, []);
  const online = mode === 'online';
  const [a, b] = result?.score || [0, 0];
  const { eyebrow, title, tone, who, note, info } = endTexts({ mode, level, opponent, result });

  return (
    // Fond transparent : le stade (écran de jeu) se voit à travers le voile
    <section className="cdg-end cdg-fin" data-tone={tone} aria-labelledby="cdg-end-title" style={{ background: 'transparent' }}>
      <style>{END_CSS}</style>
      <div className="cdg-fin-bg" aria-hidden="true">
        <span className="cdg-fin-top" />
        <span className="cdg-fin-bottom" />
      </div>
      <div className="cdg-fin-body">
        <p className="cdg-fin-eyebrow">{eyebrow}</p>
        <div className="cdg-fin-head">
          <h2 className="cdg-fin-title" data-size={titleSize(title, tone)} id="cdg-end-title">{title}</h2>
          <p className="cdg-fin-score"><span>{a} – {b}</span><span>{who}</span></p>
          {note && <p className="cdg-fin-note">{note}</p>}
        </div>
        <div className="cdg-fin-foot">
          {online && !result?.cancelled && (
            <PointsCard points={result?.points} opponent={opponent} draw={!!result?.draw} reason={result?.reason} />
          )}
          {info && <p className="cdg-fin-info">{info}</p>}
          <div className="cdg-fin-actions">
            <button ref={rematchRef} type="button" className="cdg-btn cdg-primary cdg-fin-revanche" onClick={onRematch} disabled={!canRematch}>
              Revanche
              {rematchNote && <small>{rematchNote}</small>}
            </button>
            <div className={`cdg-fin-pair${onShare ? '' : ' cdg-fin-one'}`}>
              {onShare && (
                <button
                  type="button"
                  className="cdg-btn cdg-ghost cdg-btn-sm cdg-fin-ghost"
                  onClick={onShare}
                  disabled={sharing}
                  aria-busy={sharing}
                >
                  {/* Sans icône au repos (maquette) : le texte tient sur une ligne ; la roue pendant la préparation */}
                  <span className="cdg-inline">
                    {sharing && <Loader2 className="h-4 w-4 cdg-spin" aria-hidden="true" />}
                    Partager en story
                  </span>
                </button>
              )}
              <button type="button" className="cdg-btn cdg-ghost cdg-btn-sm cdg-fin-ghost" onClick={onExit}>Retour</button>
            </div>
            {online && canModerate && (
              <div className="cdg-fin-mod">
                <button type="button" className="cdg-link" onClick={onReport} disabled={reported}>
                  <Flag className="h-4 w-4" aria-hidden="true" />{reported ? 'Signalé' : 'Signaler'}
                </button>
                <button type="button" className="cdg-link" onClick={onBlock} disabled={blocked}>
                  <Ban className="h-4 w-4" aria-hidden="true" />{blocked ? 'Bloqué' : 'Bloquer'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {tone === 'victoire' && (
        <div className="cdg-fin-rain" aria-hidden="true">
          <BladeRain />
        </div>
      )}
    </section>
  );
}
