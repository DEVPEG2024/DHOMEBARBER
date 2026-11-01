/**
 * Tableau de bord, bloc « Rendez-vous du jour » (refonte du 1er nov. 2026) : état des RDV du jour,
 * prochain RDV, liste des RDV du jour (pauses comprises), lien vers l'agenda.
 * Les chiffres (CA du jour, comparaison à hier, encaissements) sont dans « Chiffres » (KeyFigures.jsx),
 * en haut de la page : pas ici.
 * Rendez-vous en échec : le bandeau d'erreur est en haut de la page ; ici « — » seulement.
 */
import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Coffee } from 'lucide-react';
import { euro } from '@/lib/euro';
import { staffClientLabel } from '@/lib/guest';
import { Section, Pill, GoLink } from '@/components/admin/dashboard/ui';

// Au-delà, la liste se replie (« Voir toute la liste (N lignes) »)
const LIST_LIMIT = 8;

const STATUS = {
  upcoming: { label: 'À venir', tone: 'blue' },
  in_progress: { label: 'En cours', tone: 'blue' },
  to_close: { label: 'À clôturer', tone: 'amber' },
  paid: { label: 'Payé', tone: 'green' },
  pending: { label: 'En attente', tone: 'muted' },
  no_show: { label: 'Absent', tone: 'red' },
  cancelled: { label: 'Annulé', tone: 'muted' },
};

// 0 n'est jamais accordé au pluriel
const plural = (n, one, many) => (n > 1 ? many : one);

const agendaDay = (date, barberId) =>
  `/admin/agenda?view=day&date=${date}${barberId ? `&barber=${encodeURIComponent(barberId)}` : ''}`;

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** « dans 25 min », « dans 1 h 05 » ; '' si l'heure est passée ou illisible. */
function untilText(start, now) {
  const a = toMinutes(start);
  const b = toMinutes(now);
  if (a == null || b == null || a <= b) return '';
  const m = a - b;
  if (m < 60) return `dans ${m} min`;
  const rest = m % 60;
  return `dans ${Math.floor(m / 60)} h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
}

/** Ligne entière cliquable (lien) ou simple bloc quand le compte n'a pas l'agenda. */
function RowLink({ to, className, children }) {
  if (!to) return <div className={className}>{children}</div>;
  return (
    <Link
      to={to}
      className={`${className} hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}
    >
      {children}
    </Link>
  );
}

function statusLabel(item) {
  const st = STATUS[item.status] || STATUS.upcoming;
  if (item.status === 'paid' && item.paymentLabel) return `Payé · ${item.paymentLabel}`;
  return st.label;
}

// Comme l'agenda et les pushs de l'équipe : « Léo (Camille Dupont) » pour un proche
const clientLabel = (item) => staffClientLabel({ guest_name: item.guestName, client_name: item.clientName });

/** Un RDV de la liste : heures, liseré du barber, client, prestations, barber, statut, montant. */
function ApptRow({ item, to }) {
  const st = STATUS[item.status] || STATUS.upcoming;
  const cancelled = item.status === 'cancelled';
  return (
    <RowLink to={to} className={`flex min-h-11 items-stretch gap-2.5 rounded-xl px-2 py-2 ${cancelled ? 'opacity-60' : ''}`}>
      <span aria-hidden="true" className="w-1 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
      <span className="w-10 shrink-0 tabular-nums">
        <span className="block text-sm font-semibold text-foreground">{item.start || '—'}</span>
        {item.end && (
          <span className="block text-[11px] text-muted-foreground">
            <span className="sr-only">à </span>{item.end}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground break-words">{clientLabel(item)}</span>
        {item.services && <span className="block text-xs text-muted-foreground break-words">{item.services}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs text-muted-foreground break-words">{item.employeeName}</span>
          <Pill tone={st.tone}>{statusLabel(item)}</Pill>
          {cancelled ? (
            <s className="ml-auto text-sm font-semibold tabular-nums text-muted-foreground">{euro(item.amount)}</s>
          ) : (
            <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">{euro(item.amount)}</span>
          )}
        </span>
      </span>
      {to && <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden="true" />}
    </RowLink>
  );
}

/** Pause : ligne discrète, sans lien. */
function BreakRow({ item }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
      <Coffee className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words tabular-nums">
        Pause {item.start}{item.end ? `–${item.end}` : ''} · {item.employeeName}
      </span>
    </div>
  );
}

/** « 12 RDV · 5 encaissés · 1 à clôturer (25 €) · 6 à venir (180 €) · 1 absent · 1 annulé » */
function statusParts(t) {
  const parts = [`${t.active} RDV`];
  const paid = t.money?.count || 0;
  if (paid) parts.push(`${paid} ${plural(paid, 'encaissé', 'encaissés')}`);
  if (t.toClose.count) parts.push(`${t.toClose.count} à clôturer (${euro(t.toClose.amount)})`);
  if (t.upcoming.count) parts.push(`${t.upcoming.count} à venir (${euro(t.upcoming.amount)})`);
  if (t.pending) parts.push(`${t.pending} en attente`);
  if (t.noShow) parts.push(`${t.noShow} ${plural(t.noShow, 'absent', 'absents')}`);
  if (t.cancelled) parts.push(`${t.cancelled} ${plural(t.cancelled, 'annulé', 'annulés')}`);
  return parts;
}

export default function TodayBlock({ d }) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const { access, stats, state } = d;
  const today = stats.clock.today;
  const appt = state.appointments;
  const apptReady = !appt.loading && !appt.failed;

  const list = stats.todayList || [];
  const rdvCount = list.filter((i) => i.kind === 'rdv').length;
  const shown = expanded || list.length <= LIST_LIMIT ? list : list.slice(0, LIST_LIMIT);
  const next = apptReady ? stats.next : null;
  const nextTo = next && access.canAgenda ? agendaDay(today, next.employeeId) : null;
  const nextWhen = next ? (next.status === 'in_progress' ? 'En cours' : untilText(next.start, stats.clock.hhmm)) : '';

  return (
    <Section title="Rendez-vous du jour" icon={CalendarDays}>
      {/* État des RDV du jour */}
      <div>
        {appt.loading ? (
          <p className="text-xs text-muted-foreground">…</p>
        ) : appt.failed ? (
          <p className="text-xs text-muted-foreground">Rendez-vous du jour : —</p>
        ) : rdvCount > 0 ? (
          <p className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {statusParts(stats.today).map((part, i) => (
              <span key={part} className={`whitespace-nowrap ${i === 0 ? 'font-semibold text-foreground' : ''}`}>
                {i > 0 && <span aria-hidden="true">· </span>}
                {part}
              </span>
            ))}
          </p>
        ) : null}

        {/* Prochain RDV (ou celui en cours) */}
        {next && (
          <RowLink
            to={nextTo}
            className="mt-3 flex min-h-11 items-stretch gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
          >
            <span aria-hidden="true" className="w-1 shrink-0 rounded-full" style={{ backgroundColor: next.color }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-primary">
                {next.status === 'in_progress' ? 'En cours' : 'Prochain'}
                <span className="tabular-nums"> · {next.start}{next.end ? `–${next.end}` : ''}</span>
                {nextWhen && next.status !== 'in_progress' && <span className="normal-case tracking-normal"> · {nextWhen}</span>}
              </span>
              <span className="mt-0.5 block text-sm font-semibold text-foreground break-words">{clientLabel(next)}</span>
              <span className="block text-xs text-muted-foreground break-words">
                {next.services ? `${next.services} · ` : ''}{next.employeeName}
              </span>
            </span>
            {nextTo && <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden="true" />}
          </RowLink>
        )}

        {/* Liste du jour */}
        {appt.loading ? (
          <div className="mt-3 space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-11 rounded-xl bg-secondary/60 motion-safe:animate-pulse" />)}
          </div>
        ) : appt.failed ? null : rdvCount === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Aucun rendez-vous aujourd&apos;hui</p>
        ) : (
          <ul id={listId} aria-label="Rendez-vous du jour" className="-mx-2 mt-3 divide-y divide-border/60">
            {shown.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                {item.kind === 'break'
                  ? <BreakRow item={item} />
                  : <ApptRow item={item} to={access.canAgenda ? agendaDay(today, item.employeeId) : null} />}
              </li>
            ))}
          </ul>
        )}

        {apptReady && (list.length > LIST_LIMIT || access.canAgenda) && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {list.length > LIST_LIMIT && rdvCount > 0 ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex min-h-11 items-center rounded-xl px-2 text-xs font-semibold text-foreground hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {/* Nombre de lignes de la liste (annulés et pauses compris) : jamais un second compte des RDV */}
                {expanded ? 'Réduire' : `Voir toute la liste (${list.length} lignes)`}
              </button>
            ) : <span />}
            <GoLink to={access.canAgenda ? agendaDay(today) : null}>Ouvrir l&apos;agenda</GoLink>
          </div>
        )}
      </div>
    </Section>
  );
}
