import React from 'react';
import { Check, X } from 'lucide-react';
import { COUPE_COLORS } from '../palette';
import { alpha } from '../hub/theme';
import { num } from '../hub/coupeFormat';
import { BTN_OUTLINE, CARD, LABEL, LiveDot, TournamentShell } from './ui';
import {
  iWon, isPlayable, matchAt, matchTitle, mmss, msOf, myMatches, mySide, playerName, resultShort, roundNames,
  roundsCount, sideText,
} from './tournoiFormat';

/**
 * Après ton match (planche validée le 3 nov. 2026, écran 8) : « Qualifié ! » (ou « Éliminé »), le
 * résultat vu de toi, ton parcours tour par tour et, qualifié, ton prochain adversaire à venir
 * (le match qui te le donne, en direct). « Voir le tableau » ouvre le tableau en direct ; dès que ton
 * match suivant est jouable, la page repasse d'elle-même sur le tableau et « Jouer mon match ».
 * Exempt : « Qualifié d'office » ; adversaire déjà connu (pendant le tirage) : l'heure de ton match,
 * jamais « dès qu'ils auront fini ».
 */
const isForfeit = (m) => ['forfeit', 'double_forfeit', 'admin'].includes(m?.reason);

/** Phrase du résultat, vue de toi. */
export function resultLine(m) {
  const side = mySide(m);
  const opp = side >= 0 ? m.p?.[1 - side] : null;
  const name = playerName(opp);
  const won = iWon(m);
  if (m.status === 'bye') return 'Tu passes ce tour d’office';
  if (m.reason === 'forfeit') return won ? `${name} n’a pas rejoint le match : tu passes` : 'Tu n’as pas rejoint ton match à temps';
  if (m.reason === 'double_forfeit') return won ? 'Personne n’a rejoint le match : le tirage au sort t’a choisi' : `Personne n’a rejoint le match : le tirage au sort a choisi ${name}`;
  if (m.reason === 'admin') return won ? 'Le salon te déclare vainqueur' : `Le salon a déclaré ${name} vainqueur`;
  if (m.reason === 'shootout') return won ? `Tu bats ${name} aux tirs au but` : `${name} te bat aux tirs au but`;
  return won ? `Tu bats ${name}` : `${name} te bat`;
}

/** Score vu de toi : « 3 – 3 après le but en or · tirs au but 2 – 1 », « 4 – 3 au but en or ». */
export function scoreLine(m) {
  if (m.status === 'bye' || isForfeit(m) || !Array.isArray(m.sc)) return '';
  const side = Math.max(0, mySide(m));
  const sc = `${m.sc[side]} – ${m.sc[1 - side]}`;
  if (m.reason === 'shootout' && Array.isArray(m.so)) return `${sc} après le but en or · tirs au but ${m.so[side]} – ${m.so[1 - side]}`;
  if (m.reason === 'golden_goal') return `${sc} au but en or`;
  return sc;
}

function Marker({ kind, round, total }) {
  if (kind === 'won') {
    return <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full" style={{ background: COUPE_COLORS.or, color: COUPE_COLORS.noir }}><Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" /></span>;
  }
  if (kind === 'lost') {
    return <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 border-[color:var(--coupe-rouge)] text-[color:var(--coupe-rouge-vif)]"><X className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" /></span>;
  }
  if (kind === 'next') {
    const short = { 0: 'F', 1: '½', 2: '¼', 3: '⅛' }[total - round] || String(round);
    return <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 border-[color:var(--coupe-rouge)] font-fut text-[13px] font-extrabold text-[color:var(--coupe-rouge-vif)]" aria-hidden="true">{short}</span>;
  }
  return <span className="block h-[26px] w-[26px] shrink-0 rounded-full border-[1.5px] border-dashed border-white/25" aria-hidden="true" />;
}

/** Ton parcours : chaque tour, joué (adversaire, score), à venir ou pas atteint. */
export function Journey({ t, total }) {
  const mine = myMatches(t);
  const nextId = t.me?.match?.id;
  const rows = Array.from({ length: total }, (_, i) => i + 1).map((round) => {
    const m = mine.find((x) => x.round === round);
    const names = roundNames(round, total);
    if (m && m.status === 'bye') return { round, kind: 'won', name: names.singular, detail: 'Qualifié d’office' };
    if (m && m.status === 'done') {
      const won = iWon(m);
      const side = mySide(m);
      const opp = playerName(m.p?.[1 - side]);
      return { round, kind: won ? 'won' : 'lost', name: names.singular, detail: `${opp} · ${resultShort(m) || (won ? 'gagné' : 'perdu')}` };
    }
    if (m && m.id === nextId) return { round, kind: 'next', name: names.singular, detail: m.status === 'ready' ? 'Maintenant' : 'Bientôt' };
    return { round, kind: 'todo', name: names.singular, detail: '' };
  });
  return (
    <section aria-labelledby="coupe-tournoi-parcours" className={`${CARD} overflow-hidden`}>
      <h2 id="coupe-tournoi-parcours" className="px-3 pb-1 pt-3 text-[13px] font-bold">Ton parcours</h2>
      <ol className="divide-y divide-white/6">
        {rows.map((r) => (
          <li key={r.round} className={`flex items-center gap-3 px-3 py-2.5 ${r.kind === 'next' ? 'bg-[color:var(--coupe-rouge-fond)]' : ''}`}>
            <Marker kind={r.kind} round={r.round} total={total} />
            <span className={`flex-1 ${r.kind === 'next' ? 'font-bold' : r.kind === 'todo' ? 'text-[color:var(--coupe-gris)]' : ''}`}>{r.name}</span>
            {r.detail && (
              <span className={`text-[13px] ${r.kind === 'next' ? 'font-semibold text-[color:var(--coupe-rouge-vif)]' : 'text-[color:var(--coupe-gris)]'}`}>{r.detail}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Ce qu'il reste à attendre avant ton prochain match. */
function waitText(m, opp, feeder, now) {
  if (opp) {
    // Adversaire connu (pendant le tirage, ou il a fini avant toi) : l'heure de ton match
    const at = msOf(m.ready_at);
    if (m.status === 'ready' && at != null && !isPlayable(m, now)) {
      return <>Ton match commence ici dans <span className="whitespace-nowrap tabular-nums font-semibold text-white">{mmss(at - now)}</span>. Reste dans l’app.</>;
    }
    return 'Ton match est prêt ici. Reste dans l’app.';
  }
  if (feeder?.p?.[0] && feeder?.p?.[1]) return 'Ton match sera prêt ici dès qu’ils auront fini. Reste dans l’app.';
  return 'Ton match sera prêt ici dès que ton adversaire sera connu. Reste dans l’app.';
}

/** Ton prochain match : l'adversaire, ou le match qui te le donne, en direct. */
function NextUp({ t, total, now }) {
  const m = t.me?.match;
  if (!m || typeof m !== 'object') return null;
  const side = mySide(m) >= 0 ? mySide(m) : Number(m.side) || 0;
  const feeder = matchAt(t, m.round - 1, m.slot * 2 + (1 - side));
  const opp = m.p?.[1 - side];
  const live = !opp && feeder?.live?.playing ? feeder.live.sc : null;
  const names = roundNames(m.round, total);
  return (
    <section
      aria-labelledby="coupe-tournoi-prochain"
      className="flex flex-col gap-2 rounded-2xl border p-3.5"
      style={{ borderColor: 'rgba(255,61,68,.45)', background: `linear-gradient(160deg, ${alpha(COUPE_COLORS.rouge, 0.14)}, ${COUPE_COLORS.noir2} 60%)` }}
    >
      <h2 id="coupe-tournoi-prochain" className="text-sm font-bold">
        {names.mine} contre {opp ? playerName(opp) : sideText(t, m, 1 - side, total)}
      </h2>
      {live && feeder && (
        <p className="flex items-center justify-between gap-2 text-[15px] font-semibold">
          <span className="truncate">{playerName(feeder.p?.[0])} – {playerName(feeder.p?.[1])}</span>
          <span className="shrink-0 text-xs font-bold"><LiveDot>{num(live[0])} – {num(live[1])}</LiveDot></span>
        </p>
      )}
      <p className="text-[13px] text-[color:var(--coupe-gris)]">{waitText(m, opp, feeder, now)}</p>
    </section>
  );
}

export default function ResultView({ t, match, now, offline = false, onBack, onShowBoard }) {
  const size = num(t.size) || 16;
  const total = roundsCount(size);
  const won = iWon(match);
  const line = resultLine(match);
  const score = scoreLine(match);
  return (
    <TournamentShell onBack={onBack} offline={offline}>
      <div className="flex flex-1 flex-col gap-[18px] pt-4">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className={LABEL}>{t.name} · {matchTitle(match.round, match.slot, total).toLowerCase()}</span>
          <h1 className={`font-fut text-[clamp(44px,15vw,60px)] font-extrabold uppercase leading-none tracking-[0.03em] ${won ? '' : 'text-[color:var(--coupe-gris-clair)]'}`}>
            {won ? 'Qualifié !' : 'Éliminé'}
          </h1>
          <p className="text-base font-semibold">{line}</p>
          {score && <p className="text-sm text-[color:var(--coupe-gris)]">{score}</p>}
        </div>

        <Journey t={t} total={total} />

        {won ? <NextUp t={t} total={total} now={now} /> : (
          <p className={`${CARD} px-3.5 py-3 text-[13px] leading-snug text-[color:var(--coupe-gris-clair)]`}>
            Merci d’avoir joué ! Tu suis la suite ici, scores en direct, jusqu’à la remise du trophée.
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2.5">
          <button type="button" className={BTN_OUTLINE} onClick={onShowBoard}>Voir le tableau</button>
        </div>
      </div>
    </TournamentShell>
  );
}
