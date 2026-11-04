import React from 'react';
import { Check, Loader2, Share2 } from 'lucide-react';
import { COUPE_COLORS } from '../palette';
import { HERO_BUTTON } from '../hub/CoupeShell';
import { num } from '../hub/coupeFormat';
import { BTN_RED, CARD, PlayerLabel, TPawn, TournamentShell } from './ui';
import { RegisterButton, RemovedNote, UnregisterLink, isRemoved, splitPlayers } from './RegistrationView';
import { clockOf, mmss, msOf, playerName } from './tournoiFormat';
import { TOURNAMENT_CHECKIN_MS } from '@/lib/coupe/coupeApi';

/**
 * Les 15 minutes avant le début (planche validée le 3 nov. 2026, écran 3) : compte à rebours en
 * anneau d'or, « Je suis là », les présents (toi en tête) et la liste d'attente. S'inscrire pendant
 * la présence vaut présence. « Me désinscrire » : lien discret, à distance de « Je suis là », avec
 * confirmation. `drawing` : le début est passé, le serveur tire au sort (quelques secondes) :
 * anneau plein et « Tirage en cours… ». `offline` : connexion perdue, compte à rebours figé.
 */
const RING = 2 * Math.PI * 88;

function Countdown({ left, total, drawing, frozen = false }) {
  const ratio = drawing ? 0 : Math.max(0, Math.min(1, total > 0 ? left / total : 0));
  return (
    <div className={`relative h-[196px] w-[196px] ${frozen ? 'opacity-60' : ''}`} role="timer" aria-label={drawing ? 'Tirage en cours' : `Début dans ${mmss(left)}${frozen ? ' (figé, connexion perdue)' : ''}`}>
      <svg width="196" height="196" viewBox="0 0 196 196" aria-hidden="true" className="absolute inset-0">
        <circle cx="98" cy="98" r="88" fill="none" stroke={COUPE_COLORS.noir3} strokeWidth="10" />
        <circle
          cx="98" cy="98" r="88" fill="none" stroke={COUPE_COLORS.or} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={RING} strokeDashoffset={RING * (1 - ratio)} transform="rotate(-90 98 98)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" aria-hidden="true">
        {drawing ? (
          <>
            <Loader2 className="h-8 w-8 text-[color:var(--coupe-or)] motion-safe:animate-spin" />
            <span className="text-[13px] text-[color:var(--coupe-gris)]">Tirage en cours…</span>
          </>
        ) : (
          <>
            <span className="text-[13px] text-[color:var(--coupe-gris)]">Début dans</span>
            <span className="font-fut text-[64px] font-extrabold leading-none tabular-nums">{mmss(left)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function presenceText(t, starts, left) {
  const me = t.me || {};
  const at = clockOf(starts);
  if (isRemoved(t)) return <>Tu suis le tournoi d’ici : le tirage a lieu à <b>{at}</b>.</>;
  if (!me.registered) {
    return left > 0
      ? <>Il reste {left} {left === 1 ? 'place' : 'places'} : inscris-toi, ça vaut présence.</>
      : <>Complet : inscris-toi sur la liste d’attente, ça vaut présence.</>;
  }
  if (me.checked_in) {
    return me.waiting
      ? <>C’est noté : tu passes au tirage de <b>{at}</b> si une place se libère.</>
      : <>C’est noté : tu es dans le tirage de <b>{at}</b>.</>;
  }
  return me.waiting
    ? <>Confirme ta présence avant <b>{at}</b> : tu passes si un inscrit ne confirme pas la sienne.</>
    : <>Confirme ta présence avant <b>{at}</b>. Sans elle, ta place va au premier de la liste d’attente.</>;
}

function Row({ player, mine = false }) {
  return (
    <li className={`flex items-center gap-2.5 px-3 py-2 text-sm ${mine ? 'bg-[color:var(--coupe-rouge-fond)]' : ''}`}>
      <TPawn player={player} size={30} />
      <PlayerLabel player={player} className={mine ? 'font-semibold' : ''} />
      {player.checked_in ? (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[color:var(--coupe-gris-clair)]">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
          Présent
        </span>
      ) : (
        <span className={`ml-auto shrink-0 text-xs font-semibold ${mine ? 'text-[color:var(--coupe-rouge-vif)]' : 'text-[color:var(--coupe-gris)]'}`}>
          Pas encore confirmé
        </span>
      )}
    </li>
  );
}

export default function PresenceView({ t, now, busy, drawing = false, offline = false, onBack, onShare, onRegister, onUnregister, onCheckin }) {
  const size = num(t.size) || 16;
  const me = t.me || {};
  const starts = msOf(t.starts_at);
  const from = msOf(t.checkin_from) ?? starts - TOURNAMENT_CHECKIN_MS;
  const leftMs = Math.max(0, starts - now);
  const { inPlayers, waitingPlayers } = splitPlayers(t);
  const placesLeft = Math.max(0, size - inPlayers.length);
  const present = inPlayers.filter((p) => p.checked_in).length;
  const mine = inPlayers.find((p) => p.me);
  // Toi en tête, puis les présents, puis ceux qui n'ont pas encore confirmé
  const others = inPlayers.filter((p) => !p.me).sort((a, b) => Number(!!b.checked_in) - Number(!!a.checked_in));

  return (
    <TournamentShell
      onBack={onBack}
      offline={offline}
      label={`Aujourd’hui · ${clockOf(now)}`}
      title={t.name}
      action={(
        <button type="button" onClick={onShare} aria-label="Partager le tournoi" className={`${HERO_BUTTON} border border-white/[.18] text-white`}>
          <Share2 className="h-[19px] w-[19px]" aria-hidden="true" />
        </button>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 pt-1">
          <Countdown left={leftMs} total={starts - from} drawing={drawing} frozen={offline} />
          {!drawing && <p className="max-w-[320px] text-center text-[15px]">{presenceText(t, starts, placesLeft)}</p>}
        </div>

        {!drawing && isRemoved(t) && <RemovedNote />}
        {!drawing && !isRemoved(t) && (
          me.registered ? (
            <div className="flex flex-col">
              {me.checked_in ? (
                <p role="status" className={`${BTN_RED} bg-[color:var(--coupe-noir3)] text-[color:var(--coupe-or)] shadow-none`}>
                  <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
                  Présence confirmée
                </p>
              ) : (
                <button type="button" className={BTN_RED} onClick={onCheckin} disabled={!!busy}>
                  {busy === 'checkin'
                    ? <Loader2 className="h-6 w-6 motion-safe:animate-spin" aria-hidden="true" />
                    : <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />}
                  Je suis là
                </button>
              )}
              {/* Lien discret, à distance du gros bouton : jamais une désinscription d'un pouce qui glisse */}
              <UnregisterLink t={t} busy={busy} onUnregister={onUnregister} className="mt-3" />
            </div>
          ) : (
            <RegisterButton t={t} busy={busy} onRegister={onRegister} />
          )
        )}

        <section aria-labelledby="coupe-tournoi-presents" className={`${CARD} overflow-hidden`}>
          <div className="flex items-baseline justify-between px-3 pb-1.5 pt-3">
            <h2 id="coupe-tournoi-presents" className="text-sm font-bold">Présents</h2>
            <span className="text-[13px] text-[color:var(--coupe-gris)]"><b className="text-white">{present}</b> / {size}</span>
          </div>
          <ul aria-label="Inscrits et présence" className="divide-y divide-white/6">
            {mine && <Row player={mine} mine />}
            {others.map((p) => <Row key={p.key_hash} player={p} />)}
          </ul>
          {inPlayers.length === 0 && (
            <p className="px-3 pb-3 text-[13px] text-[color:var(--coupe-gris)]">Personne n’est encore inscrit.</p>
          )}
          {waitingPlayers.length > 0 && (
            <p className="border-t border-white/6 px-3 pb-3 pt-2.5 text-xs text-[color:var(--coupe-gris)]">
              Liste d’attente : <span className="text-white">{waitingPlayers.map((p) => `${playerName(p)}${p.checked_in ? ' (présent)' : ''}`).join(', ')}</span>
            </p>
          )}
        </section>

        <p className="mt-auto text-center text-xs text-[color:var(--coupe-gris)]">
          Garde l’app ouverte : après le tirage, ton match t’attend ici.
        </p>
      </div>
    </TournamentShell>
  );
}
