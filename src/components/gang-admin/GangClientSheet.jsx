/**
 * Admin « Cartes Gang » : fiche d'un client, ouverte depuis la collection
 * (`GET /gang-card/admin/client/:id`). Sa carte en grand (retournable), ses chiffres, son parcours
 * de niveaux daté, ses écussons avec la date de déblocage, ses visites, absences et annulations,
 * ses prochains rendez-vous ; appeler ou relancer ; choisir le niveau de sa carte (un minimum, la
 * carte continue de monter avec les visites). Fenêtre fermée par la croix seulement.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Phone, BellRing, Loader2, Check, Mail, CalendarClock, UserX, XCircle, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import GangCard from '@/components/gang/GangCard';
import { GangBadgeShield } from '@/components/gang/GangBadges';
import { GANG_STAT_KEYS, GANG_STAT_LABELS, gangStatValue, isGangStatLow, GANG_LOW_COLOR, gangPalette } from '@/components/gang/gangTheme';
import {
  useGangAdminClient, nudgeGangClient, gangAdminClientKey, GANG_ADMIN_CARDS_QUERY_KEY, GANG_ADMIN_OVERVIEW_QUERY_KEY,
  removeGangClientFromLeaderboard, allowGangClientInLeaderboard, GANG_LEADERBOARD_QUERY_KEY,
  setGangClientTier, GANG_TIER_ORDER,
} from '@/lib/gangCardApi';
import { hapticFeedback } from '@/lib/capacitor';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { TierPill, clientLabel, plural, daysSince, tierPalette } from './gangAdminUi';

const FADING_MIN_VISITS = 3;
const FADING_DAYS = 35;
const NUDGE_COOLDOWN_DAYS = 7;
const VISITS_SHOWN = 8;

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// Horodatages (created_at) : jour lu à l'heure de Paris, pas en UTC
const instantDayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });
/** « 12 sept. 2026 » depuis AAAA-MM-JJ (lu sans fuseau) */
function dayLabel(iso, withWeekday = false) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))) return '–';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return (withWeekday ? weekdayFmt : dayFmt).format(d);
}
const sinceLabel = (iso) => {
  const t = new Date(iso || '').getTime();
  return Number.isFinite(t) ? instantDayFmt.format(new Date(t)) : null;
};

function Section({ title, aside, children }) {
  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
        {aside && <span className="text-[11px] text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground truncate" title={typeof value === 'string' ? value : undefined}>{value}</p>
    </div>
  );
}

/** « Retirer du classement » (Team of the Season) en deux taps ; message du serveur en cas d'échec */
function RemoveFromLeaderboard({ account, onDone }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async () => {
    if (sending || !account?.id) return;
    if (!confirming) {
      hapticFeedback();
      setConfirming(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirming(false), 4000);
      return;
    }
    clearTimeout(timer.current);
    setConfirming(false);
    setSending(true);
    try {
      await removeGangClientFromLeaderboard(account.id);
      toast.success('Client retiré du classement');
      queryClient.invalidateQueries({ queryKey: GANG_LEADERBOARD_QUERY_KEY });
      onDone?.();
    } catch (err) {
      toast.error(err?.data?.error || (!err?.status ? 'Pas de connexion : rien n’a changé.' : 'Impossible de retirer ce client du classement.'));
    } finally {
      setSending(false);
    }
  };
  return (
    <button type="button" onClick={run} disabled={sending}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold disabled:opacity-60 ${confirming ? 'text-red-300' : 'text-red-400 hover:text-red-300'}`}>
      {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
      {confirming ? 'Confirmer le retrait du classement' : 'Retirer du classement'}
    </button>
  );
}

/** « Autoriser de nouveau » (client retiré du classement par le salon) en deux taps */
function AllowInLeaderboard({ account, onDone }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async () => {
    if (sending || !account?.id) return;
    if (!confirming) {
      hapticFeedback();
      setConfirming(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirming(false), 4000);
      return;
    }
    clearTimeout(timer.current);
    setConfirming(false);
    setSending(true);
    try {
      await allowGangClientInLeaderboard(account.id);
      toast.success('Le client peut de nouveau choisir d’apparaître dans le classement');
      queryClient.invalidateQueries({ queryKey: GANG_LEADERBOARD_QUERY_KEY });
      onDone?.();
    } catch (err) {
      toast.error(err?.data?.error || (!err?.status ? 'Pas de connexion : rien n’a changé.' : 'Impossible d’autoriser ce client.'));
    } finally {
      setSending(false);
    }
  };
  return (
    <button type="button" onClick={run} disabled={sending}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold disabled:opacity-60 ${confirming ? 'text-green-300' : 'text-green-400 hover:text-green-300'}`}>
      {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
      {confirming ? 'Confirmer : autoriser de nouveau' : 'Autoriser de nouveau'}
    </button>
  );
}

/** Relance « Ta carte perd de la fraîcheur » en deux taps (mêmes règles que la liste « À relancer ») */
function NudgeButton({ account, card, upcoming, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const nudgedDays = daysSince(account.nudged_at);
  const recently = nudgedDays != null && nudgedDays < NUDGE_COOLDOWN_DAYS;
  const eligible = (card?.visits || 0) >= FADING_MIN_VISITS && (card?.days_since_last || 0) >= FADING_DAYS && upcoming.length === 0;
  if (!eligible) return null;

  const run = async () => {
    if (sending || recently) return;
    if (!confirming) {
      hapticFeedback();
      setConfirming(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirming(false), 4000);
      return;
    }
    clearTimeout(timer.current);
    setConfirming(false);
    setSending(true);
    try {
      const res = await nudgeGangClient(account.email);
      const devices = Number(res?.devices) || 0;
      if (devices === 0) toast.warning('Ce client n’a pas activé les notifications : appelez-le');
      else if (res?.sent === false) toast.warning('La notification n’a pas pu être livrée sur son téléphone : appelez-le');
      else toast.success(`Relance envoyée sur ${devices} appareil${devices > 1 ? 's' : ''}`);
    } catch (err) {
      toast.error(err?.data?.error || (!err?.status ? 'Pas de connexion : la relance n’est pas partie.' : 'La relance n’a pas pu être envoyée.'));
    } finally {
      setSending(false);
      onDone();
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={sending || recently}
      className={`h-10 px-3.5 inline-flex items-center gap-1.5 rounded-xl text-xs font-semibold whitespace-nowrap disabled:cursor-not-allowed ${
        recently ? 'border border-border text-muted-foreground' : confirming ? 'bg-amber-500 text-black' : 'bg-primary text-primary-foreground disabled:opacity-70'
      }`}
    >
      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : recently ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <BellRing className="w-3.5 h-3.5" aria-hidden="true" />}
      {sending ? 'Envoi…' : recently ? `Relancé il y a ${nudgedDays} j` : confirming ? 'Confirmer la relance ?' : 'Relancer'}
    </button>
  );
}

const tierRank = (key) => GANG_TIER_ORDER.indexOf(key);

/**
 * Niveau de la carte choisi par l'admin (`PUT /gang-card/admin/client/:id/tier`). C'est un minimum :
 * les niveaux déjà atteints par les visites ne se choisissent pas, et la carte continue de monter
 * avec les visites. Un tap prépare le changement, « Confirmer » l'enregistre.
 */
function TierChoice({ account, card, tierAuto, tiers, onDone }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(null); // clé du niveau ou 'auto', en attente de confirmation
  const [sending, setSending] = useState(false);
  const auto = GANG_TIER_ORDER.includes(tierAuto) ? tierAuto : card.tier;
  const current = account.min_tier || 'auto';
  // Le choix ne sert que s'il est au-dessus des visites ; sinon la carte suit déjà les visites
  const active = account.min_tier && tierRank(account.min_tier) > tierRank(auto);
  const labelOf = (key) => tiers.find((t) => t.key === key)?.label || tierPalette(key).label || key;
  const firstName = String(account.full_name || '').trim().split(/\s+/)[0] || 'ce client';

  const pick = (key) => {
    if (sending) return;
    hapticFeedback();
    setPending(key === current ? null : key);
  };
  const confirm = async () => {
    if (sending || !pending || !account?.id) return;
    setSending(true);
    try {
      const res = await setGangClientTier(account.id, pending === 'auto' ? null : pending);
      toast.success(res?.min_tier
        ? `Carte passée en ${res.tier_label || labelOf(res.min_tier)}`
        : `La carte suit de nouveau les visites : ${res?.tier_label || labelOf(auto)}`);
      setPending(null);
      queryClient.invalidateQueries({ queryKey: GANG_LEADERBOARD_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['gangSummaries'] });
      onDone?.();
    } catch (err) {
      toast.error(err?.data?.error || (!err?.status ? 'Pas de connexion : rien n’a changé.' : 'Impossible de changer le niveau de la carte.'));
    } finally {
      setSending(false);
    }
  };

  const chip = (selected) => `inline-flex items-center gap-1.5 h-9 rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
    selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-secondary disabled:text-muted-foreground disabled:opacity-50 disabled:hover:bg-transparent'
  }`;
  const ring = (key) => (pending === key ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-background' : '');

  let help;
  if (active) help = `Niveau choisi par le salon. Ses visites seules lui donnent ${labelOf(auto)} ; la carte continue de monter avec elles.`;
  else if (account.min_tier) help = `Ses visites ont dépassé le niveau choisi (${labelOf(account.min_tier)}) : la carte suit les visites.`;
  else help = 'Un habitué venu avant l’app ? Choisissez un niveau plus haut : c’est un minimum, la carte continue ensuite de monter avec les visites.';

  const raising = pending && pending !== 'auto' && tierRank(pending) > tierRank(card.tier);
  const target = pending === 'auto' ? labelOf(auto) : pending ? labelOf(pending) : '';

  return (
    <Section title="Niveau de la carte" aside={active ? 'Choisi par le salon' : 'Selon les visites'}>
      <div role="radiogroup" aria-label="Niveau de la carte" className="flex flex-wrap gap-1.5">
        <button
          type="button" role="radio" aria-checked={current === 'auto'}
          onClick={() => pick('auto')} disabled={sending || current === 'auto'}
          className={`${chip(current === 'auto')} ${ring('auto')} disabled:opacity-100`}
        >
          Selon les visites · {labelOf(auto)}
        </button>
        {GANG_TIER_ORDER.map((key) => {
          const reached = tierRank(key) <= tierRank(auto);
          const selected = current === key;
          const p = tierPalette(key);
          return (
            <button
              key={key} type="button" role="radio" aria-checked={selected}
              onClick={() => pick(key)} disabled={sending || reached || selected}
              title={reached ? 'Déjà atteint par ses visites' : undefined}
              className={`${chip(selected)} ${ring(key)} ${selected ? 'disabled:opacity-100' : ''}`}
            >
              <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.gem }} aria-hidden="true" />
              {p.short || labelOf(key)}
            </button>
          );
        })}
      </div>
      {pending ? (
        <div className="mt-2.5 rounded-xl border border-amber-400/40 bg-amber-400/5 px-3 py-2.5" role="group" aria-label="Confirmer le niveau">
          <p className="text-sm font-semibold text-foreground">
            {pending === 'auto' ? `Revenir au niveau de ses visites (${target}) ?` : `Passer la carte de ${firstName} en ${target} ?`}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {raising
              ? `Révélation « Tu passes ${target} » à sa prochaine ouverture de l’app.`
              : pending === 'auto' && !active
                ? `La carte reste ${target} : elle suit déjà ses visites.`
                : `Sa carte redescend en ${target}.`}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={confirm} disabled={sending}
              className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-70">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Crown className="w-3.5 h-3.5" aria-hidden="true" />}
              {sending ? 'Enregistrement…' : 'Confirmer'}
            </button>
            <button type="button" onClick={() => setPending(null)} disabled={sending}
              className="h-10 px-3.5 rounded-xl border border-border text-xs font-semibold text-foreground disabled:opacity-60">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-2 leading-snug">{help}</p>
      )}
    </Section>
  );
}

function SheetBody({ data, cardSize, onNudged }) {
  const { account, card, tiers = [], badges = [], visits = [], missed = [], upcoming = [] } = data;
  const [allVisits, setAllVisits] = useState(false);
  const p = card ? gangPalette(card) : {};
  const phone = String(account.phone || '').replace(/[^\d+]/g, '');
  const since = sinceLabel(account.created_at);
  const nextTier = card?.next;
  const unlocked = badges.filter((b) => b.unlocked).length;
  const shownVisits = allVisits ? visits : visits.slice(0, VISITS_SHOWN);

  return (
    <div className="space-y-6 min-w-0">
      {/* Carte + chiffres clés */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-5 items-start">
        <div className="flex flex-col items-center gap-2 justify-self-center">
          {card && <GangCard card={card} size={cardSize} flippable interactive />}
          <p className="text-[11px] text-muted-foreground">Touchez la carte pour voir le verso</p>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Fact label="Visites" value={card ? `${card.visits}` : '0'} />
            <Fact label="Dernière visite" value={card?.last_visit ? dayLabel(card.last_visit) : '–'} />
            <Fact label="Barber favori" value={card?.barber || '–'} />
            <Fact label="Prestation favorite" value={card?.favorite || '–'} />
            <Fact label="Absences" value={`${data.absences || 0}`} />
            <Fact label="Annulations" value={`${data.client_cancels || 0}`} />
          </div>
          {upcoming.length > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary"><CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Prochain rendez-vous</p>
              {upcoming.map((u) => (
                <p key={`${u.date}-${u.start_time}`} className="text-sm text-foreground mt-0.5 truncate">
                  {dayLabel(u.date, true)} · {u.start_time}{u.barber ? ` · ${u.barber}` : ''}{u.services?.length ? ` · ${u.services.join(', ')}` : ''}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {phone && (
              <a href={`tel:${phone}`} className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary text-xs font-semibold text-foreground">
                <Phone className="w-3.5 h-3.5" aria-hidden="true" /> Appeler
              </a>
            )}
            <a href={`mailto:${account.email}`} className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-border text-xs font-semibold text-foreground min-w-0">
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">Email</span>
            </a>
            <NudgeButton account={account} card={card} upcoming={upcoming} onDone={onNudged} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {account.email}{account.phone ? ` · ${account.phone}` : ''}{since ? ` · inscrit le ${since}` : ''}
            {account.leaderboard_opt_in ? ' · dans le classement' : ''}
            {account.leaderboard_banned_at
              ? ` · retiré du classement par le salon le ${new Date(account.leaderboard_banned_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
          {account.leaderboard_banned_at
            ? <AllowInLeaderboard account={account} onDone={onNudged} />
            : account.leaderboard_opt_in && <RemoveFromLeaderboard account={account} onDone={onNudged} />}
        </div>
      </div>

      {/* Niveau choisi par l'admin (serveur du 21 oct. 2026 et après : `account.min_tier` présent) */}
      {card && 'min_tier' in account && (
        <TierChoice account={account} card={card} tierAuto={data.tier_auto} tiers={tiers} onDone={onNudged} />
      )}

      {/* Stats détaillées */}
      {card && (
        <Section title="Stats">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {GANG_STAT_KEYS.map((k) => {
              const v = gangStatValue(card, k);
              const low = isGangStatLow(k, v);
              return (
                <div key={k} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{GANG_STAT_LABELS[k].name}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: low ? GANG_LOW_COLOR : undefined }}>{v ?? '–'}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <i className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(99, v || 0)) / 0.99}%`, background: low ? GANG_LOW_COLOR : p.accent || 'hsl(var(--primary))' }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{GANG_STAT_LABELS[k].description}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Parcours des niveaux */}
      <Section title="Parcours" aside={nextTier ? `${nextTier.label} dans ${nextTier.visits_needed} ${plural(nextTier.visits_needed, 'visite', 'visites')}` : 'Niveau maximum'}>
        <ol className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tiers.map((t) => {
            const current = card?.tier === t.key;
            // Niveau posé par le salon au-dessus des visites : pas de date, mais bien atteint
            const bySalon = current && !t.reached_on && !!account.min_tier;
            const reached = !!t.reached_on || bySalon;
            return (
              <li
                key={t.key}
                className={`shrink-0 min-w-[104px] rounded-xl border px-3 py-2 ${current ? 'border-primary bg-primary/5' : 'border-border'} ${reached ? '' : 'opacity-55'}`}
              >
                <TierPill tier={t.key} label={t.label} />
                <p className="text-[11px] font-semibold text-foreground mt-1.5">{bySalon ? 'Choisi par le salon' : reached ? dayLabel(t.reached_on) : 'Pas encore'}</p>
                <p className="text-[10px] text-muted-foreground">{t.key === 'icone' ? '3 ans et 18 visites' : `${t.min} ${plural(t.min, 'visite', 'visites')}`}</p>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* Écussons datés */}
      <Section title="Écussons" aside={`${unlocked} / ${badges.length}`}>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {badges.map((b) => {
            const prog = b.progress && Number(b.progress.target) > 0 ? b.progress : null;
            return (
              <li key={b.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2 min-w-0 ${b.unlocked ? 'border-border bg-card' : 'border-dashed border-border'}`}>
                <GangBadgeShield emoji={b.emoji} accent={p.accent} locked={!b.unlocked} width={30} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${b.unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{b.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {b.unlocked
                      ? (b.unlocked_on ? `Débloqué le ${dayLabel(b.unlocked_on)}` : 'Débloqué')
                      : prog ? `${Math.min(prog.current, prog.target)} / ${prog.target} · ${b.description}` : b.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Historique des visites */}
      <Section title="Visites" aside={visits.length ? `${visits.length} ${plural(visits.length, 'jour', 'jours')} au salon` : null}>
        {visits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune visite terminée pour l’instant.</p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {shownVisits.map((v) => (
                <li key={`${v.date}-${v.start_time}`} className="flex items-baseline gap-3 px-3 py-2 min-w-0">
                  <span className="text-xs font-semibold text-foreground tabular-nums shrink-0 w-[118px]">{dayLabel(v.date, true)}</span>
                  <span className="text-xs text-muted-foreground min-w-0 truncate">
                    {v.start_time}{v.barber ? ` · ${v.barber}` : ''}{v.services?.length ? ` · ${v.services.join(', ')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {visits.length > VISITS_SHOWN && (
              <button type="button" onClick={() => setAllVisits((x) => !x)} className="mt-2 text-xs font-semibold text-primary">
                {allVisits ? 'Afficher moins' : `Voir les ${visits.length} visites`}
              </button>
            )}
          </>
        )}
      </Section>

      {missed.length > 0 && (
        <Section title="Absences et annulations">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {missed.map((m) => (
              <li key={`${m.date}-${m.start_time}-${m.status}`} className="flex items-center gap-2.5 px-3 py-2 min-w-0">
                {m.status === 'no_show'
                  ? <UserX className="w-3.5 h-3.5 text-red-400 shrink-0" aria-hidden="true" />
                  : <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />}
                <span className="text-xs font-semibold text-foreground shrink-0">{m.status === 'no_show' ? 'Absent' : 'Annulé'}</span>
                <span className="text-xs text-muted-foreground min-w-0 truncate">
                  {dayLabel(m.date, true)} · {m.start_time}{m.barber ? ` · ${m.barber}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-1.5">Les rendez-vous déplacés par le client n’y figurent pas.</p>
        </Section>
      )}
    </div>
  );
}

/** Taille de la grande carte : la largeur de la fenêtre, 0,62 au plus (ornements compris). */
function useSheetCardSize() {
  const compute = () => (typeof window === 'undefined' ? 0.6 : Math.max(0.5, Math.min(0.62, (Math.min(window.innerWidth, 640) - 120) / 300)));
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export default function GangClientSheet({ entry, onClose }) {
  const queryClient = useQueryClient();
  const open = !!entry;
  const id = entry?.user_id;
  const clientQuery = useGangAdminClient(id, { enabled: open });
  const { data, isPending, error, refetch, isFetching } = clientQuery;
  // Requête en pause hors connexion : « Pas de connexion » plutôt qu'un bloc qui clignote sans fin
  const failed = queryFailed(clientQuery);
  const cardSize = useSheetCardSize();
  const title = clientLabel(entry || {});
  // Carte de la fiche dès qu'elle est chargée (à jour après un changement de niveau), sinon celle de la collection
  const headCard = data?.card || entry?.card;

  const onNudged = () => {
    queryClient.invalidateQueries({ queryKey: gangAdminClientKey(id) });
    queryClient.invalidateQueries({ queryKey: GANG_ADMIN_CARDS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: GANG_ADMIN_OVERVIEW_QUERY_KEY });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-24px)] max-h-[92dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 grid-cols-[minmax(0,1fr)]">
        <DialogHeader className="text-left pr-8 min-w-0">
          <DialogTitle className="flex items-center gap-2 min-w-0">
            <span className="truncate">{title}</span>
            {headCard?.tier && <TierPill tier={headCard.tier} label={headCard.tier_label} />}
          </DialogTitle>
          <DialogDescription className="truncate">
            {headCard?.serial ? `Carte n° ${String(headCard.serial).padStart(4, '0')} · ` : ''}
            {entry?.email || ''}
          </DialogDescription>
        </DialogHeader>

        {/* Pendant le chargement : la carte déjà connue (collection), puis la fiche complète */}
        {isPending && entry && !failed && (
          <div className="flex flex-col items-center gap-3 py-2 min-w-0">
            <GangCard card={entry.card} size={cardSize} flippable={false} interactive={false} arrival={false} />
            <div className="h-24 w-full rounded-xl bg-secondary/60 animate-pulse" />
          </div>
        )}
        {failed && (
          <LoadError what="la fiche du client" error={error} onRetry={refetch} retrying={isFetching} />
        )}
        {data && <SheetBody data={data} cardSize={cardSize} onNudged={onNudged} />}
      </DialogContent>
    </Dialog>
  );
}
