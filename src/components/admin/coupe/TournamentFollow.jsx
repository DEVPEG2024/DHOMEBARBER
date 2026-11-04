/**
 * Suivre un tournoi en direct (planche validée le 3 nov. 2026, écran 12) : état, chiffres, matchs
 * qui attendent un joueur (échéance du forfait, « Déclarer forfait »), matchs en jeu, tableau
 * (« Faire rejouer » un match fini), joueurs (« Retirer un joueur »), « Annuler le tournoi »
 * (avec confirmation), lien vers la page publique.
 * Données : `GET /coupe/tournaments/:id` (useTournament : relu toutes les 3 s pendant la présence
 * et le tournoi, onglet visible seulement), actions par les routes admin (tournoisAdminApi.js).
 * L'heure affichée est celle du serveur (`server_now`), en heure de Paris.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Ban, Crown, ExternalLink, Medal, Pencil, Radio, RotateCcw, UserMinus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadError, { isNetworkError, queryFailed } from '@/components/shared/LoadError';
import { adminErrorMessage } from '@/lib/adminErrors';
import {
  TOURNAMENT_CHECKIN_MS, TOURNAMENT_JOIN_MS, invalidateTournaments, serverNowOf, useTournament,
} from '@/lib/coupe/coupeApi';
import { cancelTournament, declareMatchWinner, removeTournamentPlayer, replayMatch } from './tournoisAdminApi';
import TournamentForm from './TournamentForm';
import {
  adminPhase, allMatches, canReplay, currentRound, dateLine, durationMin, isLive, isWaiting, matchTitle, mmss, msOf,
  nameOf, parisClockOf, reasonText, removablePlayers, roundShort, roundsCount, roundsOf,
} from './tournoisAdminFormat';

const GOLD = '#ebc15e';

/** Rendu toutes les secondes tant que `active` (comptes à rebours). */
function useTick(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const h = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [active]);
}

const PHASE_BADGE = {
  registration: { label: 'Inscriptions', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' },
  presence: { label: 'Présence', className: 'border-amber-500/30 bg-amber-500/10 text-amber-500' },
  drawing: { label: 'Tirage…', className: 'border-amber-500/30 bg-amber-500/10 text-amber-500' },
  finished: { label: 'Fini', className: 'border-border bg-secondary text-muted-foreground' },
  cancelled: { label: 'Annulé', className: 'border-red-500/30 bg-red-500/10 text-red-500' },
};

function StatusBadge({ phase, t }) {
  if (phase === 'running') {
    const total = roundsCount(t.size);
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 h-7 px-2.5 rounded-full border border-red-500/40 bg-red-500/15 text-xs font-bold text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />
        {roundShort(currentRound(t), total)}
      </span>
    );
  }
  const b = PHASE_BADGE[phase] || PHASE_BADGE.registration;
  return <span className={`inline-flex shrink-0 items-center h-7 px-2.5 rounded-full border text-xs font-bold ${b.className}`}>{b.label}</span>;
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className="min-w-0 flex flex-col items-center gap-0.5 rounded-xl border border-border bg-card px-1 py-2.5 text-center">
      <b className={`font-display text-xl font-bold leading-none tabular-nums ${tone || 'text-foreground'}`}>{value}</b>
      <span className="text-[11px] leading-tight text-muted-foreground break-words">{label}</span>
      {hint && <span className="text-[10px] leading-tight text-muted-foreground break-words">{hint}</span>}
    </div>
  );
}

function Card({ label, children, className = '', aside = null }) {
  return (
    <section aria-label={label} className={`rounded-2xl border border-border bg-card p-3.5 flex flex-col gap-2.5 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground truncate">{label}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** « Lucas M. 5 – 2 Dom », le vainqueur en gras. */
function ScoreLine({ m }) {
  const [a, b] = Array.isArray(m.p) ? m.p : [null, null];
  const sc = isLive(m) ? m.live.sc : m.sc;
  const w = m.status === 'done' || m.status === 'bye' ? m.winner : null;
  const name = (p, side) => (
    <span className={`min-w-0 truncate ${w === side ? 'font-bold text-foreground' : 'text-foreground/85'}`}>{nameOf(p, m.status === 'pending' ? 'à déterminer' : 'Exempt')}</span>
  );
  return (
    <p className="flex items-center gap-2 text-sm min-w-0">
      {name(a, 0)}{' '}
      <b className="shrink-0 tabular-nums text-foreground">
        {Array.isArray(sc) ? `${sc[0]} – ${sc[1]}` : <span className="font-normal text-muted-foreground">contre</span>}
      </b>{' '}
      {name(b, 1)}
    </p>
  );
}

function matchState(m, now) {
  if (m.status === 'bye') return 'exempt';
  if (m.status === 'done') return 'fini';
  if (m.status === 'pending') return 'à venir';
  if (isLive(m)) return 'en direct';
  const at = msOf(m.ready_at);
  if (at != null && now < at) return `commence à ${parisClockOf(at)}`;
  return 'en attente';
}

function MatchRow({ t, m, total, now, onForfeit, onReplay, busy }) {
  const title = matchTitle(m.round, m.slot, total);
  const state = matchState(m, now);
  const reason = m.status === 'done' ? reasonText(m) : '';
  const shootout = isLive(m) && Array.isArray(m.live.so) ? `tirs au but ${m.live.so[0]} – ${m.live.so[1]}` : '';
  return (
    <li className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <p className={`text-[11px] font-bold uppercase tracking-[0.06em] truncate ${state === 'en direct' ? 'text-red-500' : state === 'en attente' ? 'text-[#ebc15e]' : 'text-muted-foreground'}`}>
          {title} · {state}
        </p>
        {m.status === 'done' && canReplay(t, m) && (
          <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={busy} onClick={() => onReplay(m)}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Faire rejouer
          </Button>
        )}
        {m.status === 'ready' && (
          <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={busy} onClick={() => onForfeit(m)}>
            Déclarer forfait
          </Button>
        )}
      </div>
      {m.status === 'bye' ? (
        <p className="text-sm text-foreground/85 truncate">{nameOf(m.p?.[m.winner === 1 ? 1 : 0], 'Place vide')} passe d’office</p>
      ) : (
        <ScoreLine m={m} />
      )}
      {(reason || shootout) && <p className="text-[11px] text-muted-foreground">{reason || shootout}</p>}
    </li>
  );
}

/** Carte d'un match qui attend un joueur : qui manque, échéance du forfait. */
function WaitingCard({ m, total, now, onForfeit, busy }) {
  const title = matchTitle(m.round, m.slot, total);
  const present = Array.isArray(m.live?.present) ? m.live.present : [false, false];
  const readyAt = msOf(m.ready_at) ?? now;
  const forfeitAt = msOf(m.forfeit_at) ?? readyAt + TOURNAMENT_JOIN_MS;
  const span = Math.max(1000, forfeitAt - readyAt);
  const elapsed = Math.min(span, Math.max(0, now - readyAt));
  const late = now >= forfeitAt;
  const [a, b] = [nameOf(m.p?.[0]), nameOf(m.p?.[1])];
  let text;
  if (present[0] !== present[1]) {
    const absent = present[0] ? b : a;
    const here = present[0] ? a : b;
    text = (<><b>{absent}</b> n’a pas encore rejoint son match contre <b>{here}</b>. Forfait automatique à {mmss(span)}.</>);
  } else {
    text = (<>Ni <b>{a}</b> ni <b>{b}</b> n’a encore rejoint le match. À {mmss(span)}, le vainqueur est tiré au sort.</>);
  }
  return (
    <section
      aria-label={`${title} en attente`}
      className="rounded-2xl border p-3.5 flex flex-col gap-2.5 min-w-0"
      style={{ borderColor: 'rgba(235,193,94,.55)', background: 'linear-gradient(160deg, rgba(235,193,94,.12), transparent 60%)' }}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
        <span style={{ color: GOLD }}>{title} · en attente</span>
        <span className="text-foreground normal-case tracking-normal tabular-nums">
          {late ? 'Forfait en cours…' : `${mmss(elapsed)} / ${mmss(span)}`}
        </span>
      </div>
      <p className="text-sm leading-snug">{text}</p>
      <Button onClick={() => onForfeit(m)} disabled={busy} className="h-10 bg-[#e01f26] text-white hover:bg-[#c81a20]">
        Déclarer forfait
      </Button>
    </section>
  );
}

const CONFIRM = {
  replay: (m, t) => ({
    title: `Faire rejouer ${matchTitle(m.round, m.slot, roundsCount(t.size)).toLowerCase()} ?`,
    text: `${nameOf(m.p?.[0])} – ${nameOf(m.p?.[1])} : le résultat est effacé et le vainqueur retiré du tour suivant. Les deux joueurs ont de nouveau 2 min pour rejoindre le match.`,
    confirm: 'Faire rejouer',
    danger: false,
  }),
  remove: (p, t) => ({
    title: `Retirer ${nameOf(p)} du tournoi ?`,
    text: t.status === 'open'
      ? 'Il perd sa place. Si la liste d’attente n’est pas vide, le premier qui y attend la prend.'
      : 'Il perd son match en cours (ou le prochain) par forfait et quitte le tournoi. C’est définitif.',
    confirm: 'Retirer',
    danger: true,
  }),
  cancel: (_x, t) => ({
    title: `Annuler « ${t.name} » ?`,
    text: 'Les inscrits sont prévenus. Le tournoi ne pourra pas reprendre : c’est définitif.',
    confirm: 'Annuler le tournoi',
    cancelLabel: 'Garder le tournoi',
    danger: true,
  }),
};

export default function TournamentFollow({ id, onBack }) {
  const queryClient = useQueryClient();
  const query = useTournament(id);
  const { data: t, error, refetch, isFetching, dataUpdatedAt } = query;
  const [confirm, setConfirm] = useState(null); // { kind, match?, player? }
  const [forfeit, setForfeit] = useState(null); // match
  const [playersOpen, setPlayersOpen] = useState(false);
  const [editing, setEditing] = useState(null); // instantané du tournoi à modifier

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  const status = t?.status;
  useTick(status === 'running' || status === 'open');
  const now = serverNowOf(t, dataUpdatedAt);

  const action = useMutation({
    mutationFn: ({ kind, match, player, side }) => {
      if (kind === 'winner') return declareMatchWinner(id, match.id, side);
      if (kind === 'replay') return replayMatch(id, match.id);
      if (kind === 'remove') return removeTournamentPlayer(id, player.key_hash);
      return cancelTournament(id);
    },
    onSuccess: (_res, v) => {
      if (v.kind === 'winner') toast.success(`${nameOf(v.match.p?.[v.side])} passe au tour suivant`);
      else if (v.kind === 'replay') toast.success('Match à rejouer : les joueurs ont 2 min pour le rejoindre');
      else if (v.kind === 'remove') toast.success(`${nameOf(v.player)} est retiré du tournoi`);
      else toast.success('Tournoi annulé');
      setConfirm(null);
      setForfeit(null);
      invalidateTournaments(queryClient);
    },
    onError: (err) => {
      toast.error(adminErrorMessage(err, 'Action impossible. Réessayez.'));
      // Le tableau a peut-être bougé (match lancé, forfait automatique) : relu tout de suite
      if (!isNetworkError(err)) invalidateTournaments(queryClient);
    },
  });
  const busy = action.isPending;

  const back = (
    <button
      type="button"
      onClick={onBack}
      aria-label="Retour aux tournois"
      className="w-10 h-10 shrink-0 rounded-full border border-border bg-card flex items-center justify-center text-foreground hover:bg-secondary"
    >
      <ArrowLeft className="w-5 h-5" aria-hidden="true" />
    </button>
  );

  if (!t) {
    const missing = error?.status === 404;
    return (
      <div className="min-w-0 max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          {back}
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: GOLD }}>Admin · tournoi</p>
        </div>
        {missing ? (
          <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-foreground">
              {error?.data?.code === 'disabled'
                ? 'Les tournois sont coupés (variable Heroku COUPE_TOURNOIS=off).'
                : (error?.message || 'Tournoi introuvable')}
            </p>
          </div>
        ) : queryFailed(query) ? (
          <LoadError what="le tournoi" error={error} onRetry={refetch} retrying={isFetching} />
        ) : (
          <div className="space-y-3" aria-busy="true">
            <div className="h-16 rounded-2xl border border-border bg-card animate-pulse" />
            <div className="h-40 rounded-2xl border border-border bg-card animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  const phase = adminPhase(t, now);
  const total = roundsCount(t.size);
  const rounds = roundsOf(t);
  const matches = allMatches(t);
  const players = Array.isArray(t.players) ? t.players.filter(Boolean) : [];
  const registered = players.filter((p) => !p.waiting);
  const waitingList = players.filter((p) => p.waiting);
  const presentCount = players.filter((p) => p.checked_in).length;
  const live = matches.filter(isLive);
  const waiting = matches.filter((m) => isWaiting(m, now));
  const played = matches.filter((m) => m.status === 'done').length;
  const starts = msOf(t.starts_at);
  const open = phase === 'registration' || phase === 'presence';
  const canCancel = t.status === 'open' || t.status === 'running';
  const stale = (query.isError || query.fetchStatus === 'paused') && !!t;
  const removable = removablePlayers(t);
  const confirmDef = confirm ? CONFIRM[confirm.kind](confirm.match || confirm.player, t) : null;

  // Fin estimée : début + durée annoncée, ou plus tard si le tournoi a pris du retard (~10 min par tour restant)
  const roundsLeft = rounds.filter((r) => !r.matches.every((m) => m.status === 'done' || m.status === 'bye')).length;
  const endGuess = starts == null ? null : Math.max(starts + durationMin(t.size) * 60000, now + roundsLeft * 10 * 60000);

  let stats;
  if (phase === 'running') {
    stats = [
      { label: 'joueurs', value: players.filter((p) => p.seed != null).length || registered.length },
      { label: 'matchs joués', value: played },
      { label: 'en direct', value: live.length, tone: 'text-red-500' },
      { label: endGuess ? `fin ~${parisClockOf(endGuess)}` : 'heure', value: parisClockOf(now) },
    ];
  } else if (phase === 'finished') {
    stats = [
      { label: 'joueurs', value: players.filter((p) => p.seed != null).length || registered.length },
      { label: 'matchs joués', value: played },
      { label: 'début', value: parisClockOf(starts) },
      { label: 'fin', value: parisClockOf(msOf(t.finished_at)) || '—' },
    ];
  } else {
    stats = [
      { label: 'inscrits', value: `${registered.length}/${t.size}` },
      { label: 'en attente', value: waitingList.length },
      { label: 'présents', value: presentCount },
      { label: 'début', value: parisClockOf(starts) || '—', hint: starts == null ? null : `présence ${parisClockOf(starts - TOURNAMENT_CHECKIN_MS)}` },
    ];
  }

  return (
    <div className="min-w-0 max-w-2xl space-y-3.5">
      <div className="flex items-center gap-3 min-w-0">
        {back}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: GOLD }}>Admin · tournoi</p>
          <h1 className="font-display text-xl font-bold leading-tight truncate">{t.name}</h1>
        </div>
        <StatusBadge phase={phase} t={t} />
      </div>
      <p className="text-xs text-muted-foreground -mt-1.5">
        {dateLine(t.starts_at)} · {t.size} joueurs · élimination directe · ~{durationMin(t.size)} min
      </p>

      {stale && (
        <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
          {isNetworkError(error) || query.fetchStatus === 'paused'
            ? 'Pas de connexion : les chiffres ne sont plus à jour.'
            : 'Le serveur ne répond pas : les chiffres ne sont plus à jour.'}
          {' '}Dernière lecture à {parisClockOf(dataUpdatedAt)}.
        </p>
      )}

      {phase !== 'cancelled' && (
        <div className="grid grid-cols-4 gap-2" aria-label="Chiffres du tournoi" role="group">
          {stats.map((s) => <Stat key={s.label} {...s} />)}
        </div>
      )}

      {phase === 'cancelled' && (
        <div role="status" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
          <p className="font-semibold text-foreground">Tournoi annulé</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.cancel_reason === 'not_enough'
              ? 'Moins de 4 joueurs présents à l’heure du début : annulé par le serveur.'
              : 'Annulé par le salon. Les inscrits ont été prévenus.'}
          </p>
        </div>
      )}

      {(open || phase === 'drawing') && (
        <div className="flex flex-wrap gap-2">
          {open && (
            <Button variant="outline" size="sm" onClick={() => setEditing({ ...t })} disabled={busy}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Modifier le nom ou l’heure
            </Button>
          )}
          {phase === 'drawing' && (
            <p className="text-sm text-muted-foreground">Le serveur tire au sort le tableau, quelques secondes…</p>
          )}
        </div>
      )}

      {/* Matchs qui attendent un joueur : le forfait se décide ici */}
      {phase === 'running' && waiting.map((m) => (
        <WaitingCard key={m.id} m={m} total={total} now={now} busy={busy} onForfeit={setForfeit} />
      ))}

      {phase === 'running' && (
        <Card
          label="En direct"
          aside={(
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-500">
              <Radio className="w-3.5 h-3.5" aria-hidden="true" /> {live.length} {live.length === 1 ? 'match' : 'matchs'}
            </span>
          )}
        >
          {live.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun match en jeu pour le moment.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {live.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm min-w-0">
                  <span className="min-w-0 truncate">{nameOf(m.p?.[0])} – {nameOf(m.p?.[1])}</span>
                  <b className="shrink-0 tabular-nums">
                    {m.live.sc?.[0] ?? 0} – {m.live.sc?.[1] ?? 0}
                    {Array.isArray(m.live.so) ? ` (t.a.b. ${m.live.so[0]} – ${m.live.so[1]})` : ''}
                  </b>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Un match coupé par le serveur se relance tout seul, sans rien faire.</p>
        </Card>
      )}

      {phase === 'finished' && (
        <Card label="Podium">
          <ul className="flex flex-col gap-1.5 text-sm">
            <li className="flex items-center gap-2 min-w-0">
              <Crown className="w-4 h-4 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
              <span className="text-muted-foreground shrink-0">Champion</span>{' '}
              <b className="min-w-0 truncate">{nameOf(t.champion, '—')}</b>
            </li>
            <li className="flex items-center gap-2 min-w-0">
              <Medal className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground shrink-0">Finaliste</span>{' '}
              <b className="min-w-0 truncate">{nameOf(t.runner_up, '—')}</b>
            </li>
            {Array.isArray(t.thirds) && t.thirds.length > 0 && (
              <li className="flex items-center gap-2 min-w-0">
                <Medal className="w-4 h-4 shrink-0 text-amber-700" aria-hidden="true" />
                <span className="text-muted-foreground shrink-0">3es ex æquo</span>{' '}
                <b className="min-w-0 truncate">{t.thirds.map((p) => nameOf(p)).join(', ')}</b>
              </li>
            )}
          </ul>
        </Card>
      )}

      {(phase === 'running' || phase === 'finished') && rounds.length > 0 && (
        <Card label="Tableau">
          <div className="flex flex-col gap-3">
            {rounds.map((r) => (
              <div key={r.round} className="flex flex-col gap-1.5 min-w-0">
                <h3 className="text-xs font-semibold text-foreground">{r.label || roundShort(r.round, total)}</h3>
                <ul className="flex flex-col gap-1.5">
                  {r.matches.map((m) => (
                    <MatchRow
                      key={m.id}
                      t={t}
                      m={m}
                      total={total}
                      now={now}
                      busy={busy}
                      onForfeit={setForfeit}
                      onReplay={(match) => setConfirm({ kind: 'replay', match })}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {phase !== 'finished' && (
        <Card
          label="Joueurs"
          aside={<span className="text-[11px] font-semibold text-muted-foreground">Liste d’attente : {waitingList.length}</span>}
        >
          {(open || phase === 'drawing' || phase === 'cancelled') && (
            players.length === 0 ? (
              <p className="text-sm text-muted-foreground">Personne n’est encore inscrit.</p>
            ) : (
              <ol className="flex flex-col gap-1 text-sm">
                {players.map((p, i) => (
                  <li key={p.key_hash || i} className="flex items-center gap-2 min-w-0">
                    <span className="w-5 shrink-0 text-[11px] tabular-nums text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 truncate">{nameOf(p)}</span>
                    {p.waiting && <span className="shrink-0 text-[11px] text-amber-500">en attente</span>}
                    {p.checked_in && <span className="shrink-0 text-[11px] text-emerald-500">présent</span>}
                  </li>
                ))}
              </ol>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => setPlayersOpen(true)} disabled={busy || removable.length === 0}>
                <UserMinus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Retirer un joueur
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to={`/coupe/tournoi/${encodeURIComponent(t.id)}`}>
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Voir la page du tournoi
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {phase === 'finished' && (
        <Button asChild variant="outline" size="sm">
          <Link to={`/coupe/tournoi/${encodeURIComponent(t.id)}`}>
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Voir la page du tournoi
          </Link>
        </Button>
      )}

      {canCancel && (
        <Button
          variant="outline"
          onClick={() => setConfirm({ kind: 'cancel' })}
          disabled={busy}
          className="w-full h-11 border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500"
        >
          <Ban className="w-4 h-4 mr-1.5" aria-hidden="true" /> Annuler le tournoi
        </Button>
      )}

      {/* Joueurs que l'on peut retirer */}
      <Dialog open={playersOpen} onOpenChange={(o) => { if (!o) setPlayersOpen(false); }}>
        <DialogContent className="bg-card border-border max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle>Retirer un joueur</DialogTitle>
            <DialogDescription>
              {t.status === 'open'
                ? 'Avant le tirage : il perd sa place, le premier de la liste d’attente la prend.'
                : 'Joueurs encore dans le tableau : celui que vous retirez perd son match par forfait.'}
            </DialogDescription>
          </DialogHeader>
          {removable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun joueur à retirer.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {removable.map((p) => (
                <li key={p.key_hash} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2 min-w-0">
                  <span className="min-w-0 flex-1 truncate text-sm">{nameOf(p)}</span>
                  {p.waiting && <span className="shrink-0 text-[11px] text-amber-500">en attente</span>}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-500"
                    aria-label={`Retirer ${nameOf(p)}`}
                    onClick={() => { setPlayersOpen(false); setConfirm({ kind: 'remove', player: p }); }}
                  >
                    <X className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Forfait déclaré : choisir le joueur qui passe */}
      <AlertDialog open={!!forfeit} onOpenChange={(o) => { if (!o && !busy) setForfeit(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {forfeit ? `Déclarer forfait · ${matchTitle(forfeit.round, forfeit.slot, total)}` : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choisissez le joueur qui passe au tour suivant. L’autre est éliminé et la salle du match se ferme.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {forfeit && (
            <div className="flex flex-col gap-2">
              {[0, 1].map((side) => {
                const here = !!forfeit.live?.present?.[side];
                return (
                  <Button
                    key={side}
                    disabled={busy || !forfeit.p?.[side]}
                    onClick={() => action.mutate({ kind: 'winner', match: forfeit, side })}
                    className={here ? 'bg-[#e01f26] text-white hover:bg-[#c81a20]' : ''}
                    variant={here ? 'default' : 'outline'}
                  >
                    {nameOf(forfeit.p?.[side])} passe{here ? ' (dans la salle)' : ''}
                  </Button>
                );
              })}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Retour</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation : faire rejouer, retirer un joueur, annuler le tournoi */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o && !busy) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDef?.title || ''}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDef?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{confirmDef?.cancelLabel || 'Retour'}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); if (confirm) action.mutate(confirm); }}
              className={confirmDef?.danger ? 'bg-red-600 hover:bg-red-700' : undefined}
            >
              {busy ? 'Enregistrement…' : confirmDef?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TournamentForm open={!!editing} tournament={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
