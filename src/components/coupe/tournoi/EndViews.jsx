import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Ban, PauseCircle, Trophy } from 'lucide-react';
import { COUPE_COLORS } from '../palette';
import { alpha } from '../hub/theme';
import { num } from '../hub/coupeFormat';
import { BTN_OUTLINE, BTN_RED, CARD, LABEL, TPawn, TournamentShell, coupeLogoUrl } from './ui';
import { dateLine, matchAt, msOf, myMatches, iWon, playerName, roundNames, roundsCount } from './tournoiFormat';

/*
 * Fins d'un tournoi : champion (planche validée le 3 nov. 2026, écran 9 : lames de rasoir d'or, le
 * trophée, « Champion », la finale, le podium), tournoi terminé vu des autres (champion, finale,
 * ta place, podium), tournoi annulé, tournois en pause (drapeau éteint par le serveur).
 */

// Places des lames autour du trophée (maquette) : gauche (px), haut (px), angle
const BLADES = [[30, 60, -30], [320, 90, 40], [40, 200, 70], [342, 180, -60], [14, 330, 15], [350, 350, -15], [150, 24, 55]];

function Blades() {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[400px] max-w-[390px]" aria-hidden="true">
      {BLADES.map(([left, top, angle], i) => {
        const style = { left, top, background: `linear-gradient(90deg, #fff3cf, ${COUPE_COLORS.or})` };
        const cls = 'absolute block h-[7px] w-[22px] rounded-[2px] opacity-85';
        if (reduce) return <span key={i} className={cls} style={{ ...style, transform: `rotate(${angle}deg)` }} />;
        return (
          <motion.span
            key={i}
            className={cls}
            style={style}
            initial={{ y: -80, rotate: angle - 120, opacity: 0 }}
            animate={{ y: 0, rotate: angle, opacity: 0.85 }}
            transition={{ duration: 1.2, delay: 0.1 + i * 0.08, ease: [0.2, 0.7, 0.3, 1] }}
          />
        );
      })}
    </div>
  );
}

/** Podium : 2e à gauche, 1er au centre, 3es (ex æquo) à droite. */
function Podium({ t }) {
  const champion = t.champion || null;
  const second = t.runner_up || null;
  const thirds = Array.isArray(t.thirds) ? t.thirds.filter(Boolean) : [];
  const col = (place, players, height, background, color) => (
    <li className="flex w-[104px] min-w-0 flex-col items-center gap-1.5" aria-label={`${place === 1 ? '1er' : `${place}e`} : ${players.map((p) => playerName(p)).join(' et ') || 'personne'}`}>
      <div className="flex">
        {players.map((p, i) => (
          <TPawn key={p.key_hash || i} player={p} size={place === 1 ? 50 : players.length > 1 ? 34 : 40} ring={place === 1 && p.me ? COUPE_COLORS.or : null} className={i ? '-ml-2' : ''} />
        ))}
      </div>
      <span className={`line-clamp-2 max-w-full text-center text-[13px] leading-tight ${place === 1 ? 'font-bold' : 'font-semibold'}`}>
        {players.map((p) => playerName(p)).join(' · ') || '—'}
      </span>
      <div className="flex w-full items-start justify-center rounded-t-[10px] pt-2 font-fut text-[26px] font-extrabold" style={{ height, background, color }} aria-hidden="true">{place}</div>
    </li>
  );
  return (
    <ol aria-label="Podium" className="flex items-end justify-center gap-2">
      {col(2, second ? [second] : [], 62, 'linear-gradient(180deg,#3a3b40,#1e1f22)', COUPE_COLORS.grisClair)}
      {col(1, champion ? [champion] : [], 90, `linear-gradient(180deg,${COUPE_COLORS.or},#9c7a26)`, COUPE_COLORS.noir)}
      {col(3, thirds, 44, 'linear-gradient(180deg,#2a2b30,#17181b)', COUPE_COLORS.gris)}
    </ol>
  );
}

/** « Finale : Toi 5 – 2 Lucas M. » (champion d'abord). */
function finalLine(t, total) {
  const f = matchAt(t, total, 0);
  if (!f || !Array.isArray(f.p)) return '';
  const w = Number(f.winner) === 1 ? 1 : 0;
  const a = playerName(f.p[w]);
  const b = playerName(f.p[1 - w]);
  if (['forfeit', 'double_forfeit', 'admin'].includes(f.reason)) return `Finale : ${a} contre ${b}, gagnée par forfait`;
  if (!Array.isArray(f.sc)) return `Finale : ${a} contre ${b}`;
  const so = f.reason === 'shootout' && Array.isArray(f.so) ? ` (t.a.b. ${f.so[w]} – ${f.so[1 - w]})` : '';
  return `Finale : ${a} ${f.sc[w]} – ${f.sc[1 - w]} ${b}${so}`;
}

/** Ta place, vue de toi (rien si tu n'as pas joué). */
function myPlace(t, total) {
  if (t.champion?.me) return null;
  if (t.runner_up?.me) return 'Tu termines finaliste';
  if ((t.thirds || []).some((p) => p?.me)) return 'Tu termines 3e';
  const mine = myMatches(t).filter((m) => m.status === 'done');
  const lost = mine.find((m) => !iWon(m));
  if (lost) return `Tu t’arrêtes en ${roundNames(lost.round, total).singular.toLowerCase()}`;
  return null;
}

export function FinishedView({ t, onBack, onShowBoard, onOpenPalmares }) {
  const size = num(t.size) || 16;
  const total = roundsCount(size);
  const champion = !!t.champion?.me;
  const place = myPlace(t, total);
  return (
    <TournamentShell onBack={onBack}>
      <div className="relative flex flex-1 flex-col items-center">
        {champion && <Blades />}
        <img
          src={coupeLogoUrl}
          alt={champion ? 'Trophée de la Coupe du Gang' : ''}
          aria-hidden={champion ? undefined : 'true'}
          decoding="async"
          className={`relative object-contain ${champion ? 'h-[190px] w-[190px]' : 'h-[130px] w-[130px]'}`}
          style={{ filter: `drop-shadow(0 0 30px ${alpha(COUPE_COLORS.or, 0.45)})` }}
        />
        <span className={`${LABEL} relative mt-1.5 text-center`}>{t.name}</span>
        {champion ? (
          <>
            <h1 className="relative mt-2 font-fut text-[clamp(48px,18vw,72px)] font-extrabold uppercase leading-none tracking-[0.03em] text-[color:var(--coupe-or)]" style={{ textShadow: `0 4px 0 ${COUPE_COLORS.rougeSombre}` }}>
              Champion
            </h1>
            <p className="relative mt-2 text-base font-semibold">Tu remportes le tournoi</p>
          </>
        ) : (
          <>
            <h1 className="relative mt-2 text-center font-fut text-[clamp(34px,11vw,44px)] font-extrabold uppercase leading-none tracking-[0.03em]">Tournoi terminé</h1>
            {t.champion && (
              <p className="relative mt-2 text-center text-base font-semibold text-[color:var(--coupe-or)]">
                {playerName(t.champion)} remporte le tournoi
              </p>
            )}
          </>
        )}
        <p className="relative mt-0.5 text-center text-sm text-[color:var(--coupe-gris)]">{finalLine(t, total)}</p>
        {place && <p className="relative mt-3 rounded-full border border-white/20 px-3 py-1 text-[13px] font-semibold">{place}</p>}

        <div className="relative mt-5 w-full">
          <Podium t={t} />
        </div>

        {champion && (
          <div className="relative mt-4 flex flex-wrap justify-center gap-2">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--coupe-or-bord)] bg-black/70 px-2.5 text-xs font-bold text-[color:var(--coupe-or)]">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              Trophée dans ton palmarès
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-white/20 bg-black/70 px-2.5 text-xs font-bold">Annoncé dans le fil</span>
          </div>
        )}

        <div className="relative mt-auto flex w-full flex-col gap-2.5 pt-6">
          {champion && onOpenPalmares && (
            <button type="button" className={BTN_RED} onClick={onOpenPalmares}>Voir mon palmarès</button>
          )}
          <button type="button" className={BTN_OUTLINE} onClick={onShowBoard}>Voir le tableau</button>
        </div>
      </div>
    </TournamentShell>
  );
}

export function CancelledView({ t, onBack, onHome }) {
  const why = t.cancel_reason === 'not_enough'
    ? 'Moins de 4 joueurs ont confirmé leur présence : le tournoi n’a pas eu lieu.'
    : 'Le salon a annulé ce tournoi.';
  return (
    <TournamentShell onBack={onBack} label={t.name}>
      <div className="flex flex-1 flex-col items-center gap-3 pt-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[color:var(--coupe-rouge-trait)] bg-[color:var(--coupe-rouge-voile)]">
          <Ban className="h-6 w-6 text-[color:var(--coupe-rouge-vif)]" aria-hidden="true" />
        </span>
        <h1 className="font-fut text-[40px] font-extrabold uppercase leading-none tracking-[0.03em]">Tournoi annulé</h1>
        <p className="text-sm font-semibold">{dateLine(msOf(t.starts_at))}</p>
        <p className="max-w-xs text-[13px] leading-snug text-[color:var(--coupe-gris)]">{why}</p>
        <div className="mt-auto w-full pt-6">
          <button type="button" className={BTN_OUTLINE} onClick={onHome}>Retour à la Coupe</button>
        </div>
      </div>
    </TournamentShell>
  );
}

/** Tournois éteints par le serveur (`COUPE_TOURNOIS=off`) ou tournoi introuvable. */
export function NoticeView({ onBack, onHome, kind = 'closed' }) {
  const closed = kind === 'closed';
  return (
    <TournamentShell onBack={onBack}>
      <div role="alert" className={`${CARD} mt-6 flex flex-col items-center gap-3 px-5 py-8 text-center`}>
        <PauseCircle className="h-8 w-8 text-[color:var(--coupe-rouge-vif)]" aria-hidden="true" />
        <h1 className="font-fut text-2xl font-extrabold uppercase leading-none tracking-[0.03em]">
          {closed ? 'Les tournois font une pause' : 'Tournoi introuvable'}
        </h1>
        <p className="max-w-xs text-[13px] leading-snug text-[color:var(--coupe-gris)]">
          {closed ? 'Le salon a mis les tournois en pause pour le moment. Reviens un peu plus tard.' : 'Ce tournoi n’existe plus. Les prochains sont sur l’accueil de la Coupe.'}
        </p>
        <button type="button" className={`${BTN_OUTLINE} mt-1 w-auto px-5`} onClick={onHome}>Retour à la Coupe</button>
      </div>
    </TournamentShell>
  );
}
