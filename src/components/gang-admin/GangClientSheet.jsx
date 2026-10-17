/**
 * Admin « Cartes Gang » : fiche d'un client, ouverte depuis la collection
 * (`GET /gang-card/admin/client/:id`). Sa carte en grand (retournable), ses chiffres, son parcours
 * de niveaux daté, ses écussons avec la date de déblocage, ses visites, absences et annulations,
 * ses prochains rendez-vous ; appeler ou relancer. Fenêtre fermée par la croix seulement.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Phone, BellRing, Loader2, Check, Mail, CalendarClock, UserX, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import GangCard from '@/components/gang/GangCard';
import { GangBadgeShield } from '@/components/gang/GangBadges';
import { GANG_STAT_KEYS, GANG_STAT_LABELS, gangStatValue, isGangStatLow, GANG_LOW_COLOR, gangPalette } from '@/components/gang/gangTheme';
import {
  useGangAdminClient, nudgeGangClient, gangAdminClientKey, GANG_ADMIN_CARDS_QUERY_KEY, GANG_ADMIN_OVERVIEW_QUERY_KEY,
} from '@/lib/gangCardApi';
import { hapticFeedback } from '@/lib/capacitor';
import LoadError from '@/components/shared/LoadError';
import { TierPill, clientLabel, plural, daysSince } from './gangAdminUi';

const FADING_MIN_VISITS = 3;
const FADING_DAYS = 35;
const NUDGE_COOLDOWN_DAYS = 7;
const VISITS_SHOWN = 8;

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** « 12 sept. 2026 » depuis AAAA-MM-JJ (lu sans fuseau) */
function dayLabel(iso, withWeekday = false) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))) return '–';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return (withWeekday ? weekdayFmt : dayFmt).format(d);
}
const sinceLabel = (iso) => {
  const t = new Date(iso || '').getTime();
  return Number.isFinite(t) ? dayFmt.format(new Date(t)) : null;
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
      if (devices === 0) toast.warning('Ce client n’a pas activé les notifications : appelle-le');
      else if (res?.sent === false) toast.warning('La notification n’a pas pu être livrée sur son téléphone : appelle-le');
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
          <p className="text-[11px] text-muted-foreground">Touche la carte pour voir le verso</p>
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
          </p>
        </div>
      </div>

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
            const reached = !!t.reached_on;
            const current = card?.tier === t.key;
            return (
              <li
                key={t.key}
                className={`shrink-0 min-w-[104px] rounded-xl border px-3 py-2 ${current ? 'border-primary bg-primary/5' : 'border-border'} ${reached ? '' : 'opacity-55'}`}
              >
                <TierPill tier={t.key} label={t.label} />
                <p className="text-[11px] font-semibold text-foreground mt-1.5">{reached ? dayLabel(t.reached_on) : 'Pas encore'}</p>
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
  const { data, isPending, isError, error, refetch, isFetching } = useGangAdminClient(id, { enabled: open });
  const cardSize = useSheetCardSize();
  const title = clientLabel(entry || {});

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
            {entry?.card?.tier && <TierPill tier={entry.card.tier} label={entry.card.tier_label} />}
          </DialogTitle>
          <DialogDescription className="truncate">
            {entry?.card?.serial ? `Carte n° ${String(entry.card.serial).padStart(4, '0')} · ` : ''}
            {entry?.email || ''}
          </DialogDescription>
        </DialogHeader>

        {/* Pendant le chargement : la carte déjà connue (collection), puis la fiche complète */}
        {isPending && entry && (
          <div className="flex flex-col items-center gap-3 py-2 min-w-0">
            <GangCard card={entry.card} size={cardSize} flippable={false} interactive={false} arrival={false} />
            <div className="h-24 w-full rounded-xl bg-secondary/60 animate-pulse" />
          </div>
        )}
        {!isPending && isError && !data && (
          <LoadError what="la fiche du client" error={error} onRetry={refetch} retrying={isFetching} />
        )}
        {data && <SheetBody data={data} cardSize={cardSize} onNudged={onNudged} />}
      </DialogContent>
    </Dialog>
  );
}
