import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { COUPE_COLORS } from '../palette';
import { alpha } from '../hub/theme';
import { num } from '../hub/coupeFormat';
import { BTN_OUTLINE, CARD, LABEL, LivePill, PlayerLabel, TPawn, TournamentShell } from './ui';
import { clockOf, msOf, pawnText, playerName, roundNames, roundsCount, roundsOf } from './tournoiFormat';
import { TOURNAMENT_DRAW_SHOW_MS } from '@/lib/coupe/coupeApi';

/**
 * Tirage au sort en direct (planche validée le 3 nov. 2026, écran 4), les 30 s qui suivent
 * `drawn_at` (`DRAW_SHOW_MS`, le temps que le serveur laisse avant les premiers matchs) : les
 * boules dans la coupe, le match qu'on vient de tirer en grand, puis la liste « Déjà tirés » qui se
 * remplit, réglée sur l'heure du serveur (arrivé en retard, on voit où en est le tirage).
 * « Réduire les animations » : la liste entière tout de suite, sans boules qui bougent.
 * « Voir le tableau » passe l'animation. Exempt : « Qualifié d'office » (jamais « VS Exempt »),
 * deux places libres : « pas de match ».
 */
const BALL = `radial-gradient(circle at 35% 30%, #fff, #e6e7ea 55%, #a6a8ad)`;
const BALL_GOLD = `radial-gradient(circle at 35% 30%, #fff3cf, ${COUPE_COLORS.or} 55%, #9c7a26)`;
// Places des boules dans la coupe : centre (px, depuis le milieu) et haut d'une boule de 34 px,
// toutes à l'intérieur de la coupe (demi-disque de ~110 px sous le bord), remplie par le fond.
// Chaque joueur garde sa place pendant tout le tirage (les autres ne bougent pas quand une boule sort).
const SPOTS = [
  [0, 87], [-30, 87], [30, 87],
  [-15, 59], [15, 59], [-45, 59], [45, 59], [-75, 59], [75, 59],
  [0, 29], [-30, 29], [30, 29], [-60, 29], [60, 29], [-90, 29], [90, 29],
];

/** Boules des joueurs encore dans la coupe : `players` (tous ceux du tirage, ordre fixe), `out` (déjà tirés). */
function Bowl({ players, out }) {
  return (
    <div className="relative mx-auto h-[128px] w-full max-w-[300px] shrink-0" aria-hidden="true">
      <div
        className="absolute left-1/2 top-[18px] h-[110px] w-[230px] -translate-x-1/2 rounded-b-[115px] border border-t-0 border-white/[.18]"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.10))' }}
      />
      <div className="absolute left-1/2 top-[18px] h-2 w-[250px] -translate-x-1/2 rounded-lg bg-white/[.16]" />
      {players.slice(0, SPOTS.length).map((p, i) => {
        if (out.has(p.key_hash)) return null;
        const [x, y] = SPOTS[i];
        return (
          <motion.span
            key={p.key_hash}
            data-boule={p.key_hash}
            className="absolute flex h-[34px] w-[34px] items-center justify-center rounded-full font-fut text-xs font-extrabold"
            style={{
              left: `calc(50% + ${x - 17}px)`,
              top: y,
              background: p.role === 'salon' ? BALL_GOLD : BALL,
              boxShadow: '0 3px 8px rgba(0,0,0,.5)',
              color: COUPE_COLORS.noir,
            }}
            animate={{ y: [0, -5, 2, 0], rotate: [0, -8, 6, 0] }}
            transition={{ duration: 1.1 + (i % 4) * 0.2, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.12 }}
          >
            {pawnText(p)}
          </motion.span>
        );
      })}
    </div>
  );
}

function Duel({ match, label }) {
  const side = (p) => (
    <div className="flex w-[110px] flex-col items-center gap-1.5">
      {p ? <TPawn player={p} size={56} ring={p.me ? COUPE_COLORS.blanc : null} /> : <TPawn empty size={56} />}
      <span className="max-w-full truncate text-center font-bold">{playerName(p)}</span>
    </div>
  );
  const a = match?.p?.[0] || null;
  const b = match?.p?.[1] || null;
  let body;
  if (!match) body = <p className="py-6 text-sm text-[color:var(--coupe-gris)]">Les boules tournent…</p>;
  else if (!a && !b) body = <p className="py-6 text-sm text-[color:var(--coupe-gris)]">Deux places libres : pas de match.</p>;
  else if (!a || !b) {
    // Exempt : jamais « VS Exempt », le joueur passe ce tour d'office
    body = (
      <div className="flex items-center gap-[18px]">
        {side(a || b)}
        <span className="max-w-[120px] font-fut text-[22px] font-extrabold uppercase leading-none text-[color:var(--coupe-or)]">Qualifié d’office</span>
      </div>
    );
  } else {
    body = (
      <div className="flex items-center gap-[18px]">
        {side(a)}
        <span className="font-fut text-[26px] font-extrabold text-[color:var(--coupe-or)]">VS</span>
        {side(b)}
      </div>
    );
  }
  return (
    <section
      aria-label="Tirage en cours"
      aria-live="polite"
      className="flex flex-col items-center gap-3 rounded-[18px] border px-4 py-3.5"
      style={{ background: `linear-gradient(160deg, ${alpha(COUPE_COLORS.or, 0.16)}, ${COUPE_COLORS.noir2} 55%)`, borderColor: COUPE_COLORS.orBord }}
    >
      <span className={`${LABEL} text-[color:var(--coupe-gris-clair)]`}>{label}</span>
      {body}
    </section>
  );
}

/** Une ligne de la liste « Déjà tirés » : le match, un joueur qualifié d'office, ou aucun match. */
function DrawnRow({ m, isSeed }) {
  const a = m.p?.[0] || null;
  const b = m.p?.[1] || null;
  const seedMark = (p) => isSeed(p) && <span className="shrink-0 text-[11px] font-bold text-[color:var(--coupe-or)]" title="Tête de série">TS</span>;
  if (!a && !b) return <span className="text-[color:var(--coupe-gris)]">Deux places libres : pas de match</span>;
  if (!a || !b) {
    const p = a || b;
    return (
      <>
        <PlayerLabel player={p} className={p.me ? 'font-bold' : ''} />
        {seedMark(p)}
        <span className="ml-auto shrink-0 text-xs font-semibold text-[color:var(--coupe-or)]">Qualifié d’office</span>
      </>
    );
  }
  return (
    <>
      <PlayerLabel player={a} className={a.me ? 'font-bold' : ''} />
      {seedMark(a)}
      <span className="shrink-0 text-[11px] font-bold text-[color:var(--coupe-gris-sombre)]">VS</span>
      <PlayerLabel player={b} className={b.me ? 'font-bold' : ''} />
      {seedMark(b)}
    </>
  );
}

export default function DrawView({ t, now, offline = false, onBack, onSkip }) {
  const reduce = useReducedMotion();
  const size = num(t.size) || 16;
  const total = roundsCount(size);
  const seeds = Math.max(2, size / 4);
  const first = roundsOf(t)[0];
  const matches = first?.matches || [];
  const drawn = msOf(t.drawn_at) ?? now;
  const step = TOURNAMENT_DRAW_SHOW_MS / (matches.length + 1);
  const shown = reduce ? matches.length : Math.max(0, Math.min(matches.length, Math.floor((now - drawn) / step)));
  const current = shown > 0 ? matches[shown - 1] : null;
  const revealedKeys = new Set(matches.slice(0, shown).flatMap((m) => (m.p || []).filter(Boolean).map((p) => p.key_hash)));
  // Joueurs du tirage, dans l'ordre fixe de la liste du serveur : chacun garde sa boule et sa place
  const drawnPlayers = (Array.isArray(t.players) ? t.players : []).filter((p) => p && p.seed != null);
  // Numéro au tirage : dans la liste des joueurs (les joueurs d'un match n'en portent pas)
  const seedOf = new Map((Array.isArray(t.players) ? t.players : []).filter(Boolean).map((p) => [p.key_hash, p.seed]));
  const isSeed = (p) => {
    const seed = p ? seedOf.get(p.key_hash) ?? p.seed : null;
    return seed != null && Number(seed) <= seeds;
  };

  return (
    <TournamentShell onBack={onBack} label={t.name} offline={offline} action={offline ? null : <LivePill>En direct · {clockOf(drawn)}</LivePill>}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-fut text-[40px] font-extrabold uppercase leading-none tracking-[0.03em]">Tirage au sort</h1>
          <p className="text-[13px] text-[color:var(--coupe-gris)]">
            Les {seeds} têtes de série (meilleurs Points de Coupe) sont séparées : elles ne se croisent pas avant {seeds === 2 ? 'la finale' : 'les demies'}.
          </p>
        </div>

        {!reduce && <Bowl players={drawnPlayers} out={revealedKeys} />}

        {!reduce && (
          <Duel
            match={current}
            label={current ? `${roundNames(current.round, total).singular} · match ${current.slot + 1}` : 'Tirage'}
          />
        )}

        <section aria-labelledby="coupe-tournoi-tires" className={`${CARD} overflow-hidden`}>
          <h2 id="coupe-tournoi-tires" className="px-3 pb-1.5 pt-2.5 text-[13px] font-bold">{reduce ? 'Le tirage' : 'Déjà tirés'}</h2>
          <ol aria-label="Matchs du premier tour" className="divide-y divide-white/6">
            {matches.map((m, i) => {
              const visible = i < shown;
              const mine = visible && (m.p || []).some((p) => p?.me);
              return (
                <li key={m.id || i} className={`flex items-center gap-2 px-3 py-[7px] text-[13px] ${mine ? 'bg-[color:var(--coupe-rouge-fond)]' : ''}`}>
                  <span className={`w-5 shrink-0 font-fut font-bold ${mine ? 'text-[color:var(--coupe-rouge-vif)]' : 'text-[color:var(--coupe-gris)]'}`}>{i + 1}</span>
                  {visible ? <DrawnRow m={m} isSeed={isSeed} /> : <span className="text-[color:var(--coupe-gris)]">…</span>}
                </li>
              );
            })}
          </ol>
        </section>

        <button type="button" className={BTN_OUTLINE} onClick={onSkip}>Voir le tableau</button>
      </div>
    </TournamentShell>
  );
}
