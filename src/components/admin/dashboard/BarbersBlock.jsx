/**
 * Tableau de bord : « Barbers » (refonte du 1er nov. 2026).
 *
 * Une carte par barber, aujourd'hui ou ce mois (`d.stats.barbers`, déjà triés par CA) : CA encaissé
 * hors pourboire et hors part carte cadeau (rappelée à côté), RDV encaissés, panier moyen, produits,
 * pourboires, absences de ses clients, RDV à clôturer, part du CA des rendez-vous de la période.
 * Lien « Agenda » seulement pour un barber actif (une fiche désactivée menait à un agenda vide).
 * Liste des barbers illisible : note « Impossible de charger la liste des barbers » + Réessayer
 * (jamais « Aucun barber actif »), les cartes des barbers qui ont des RDV restent affichées.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { Section, Money, Pill, GoLink, Note, InlineError, TONE } from '@/components/admin/dashboard/ui';
import { euro } from '@/lib/euro';

const PERIODS = [
  { key: 'today', label: "Aujourd'hui", scope: 'du jour' },
  { key: 'month', label: 'Ce mois', scope: 'du mois' },
];

function Stat({ label, value, tone = '' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground break-words">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${tone ? TONE[tone] : 'text-foreground'}`}>{value}</dd>
    </div>
  );
}

/** Pourboires par moyen, une ligne chacun (« moyen non noté » seulement s'il y en a). */
function Tips({ m }) {
  const line = (label, amount) => (
    <span className="block">
      <span className="text-xs font-normal text-muted-foreground">{label} </span>
      {euro(amount)}
    </span>
  );
  return (
    <>
      {line('CB', m.tipsCB)}
      {line('Espèces', m.tipsCash)}
      {m.tipsOther > 0 && line('Non noté', m.tipsOther)}
    </>
  );
}

function Dot({ color }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />;
}

function AgendaLink({ to, name }) {
  return (
    <GoLink to={to} className="-my-2 -mr-2 shrink-0">
      Agenda<span className="sr-only"> de {name}</span>
    </GoLink>
  );
}

/** Barber sans RDV encaissé sur la période (données lues) : ligne grisée. */
function EmptyBarber({ b, agendaTo }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-border bg-secondary/20 px-3 py-2">
      <span className="flex min-w-0 max-w-full items-center gap-2">
        <Dot color={b.color} />
        <span className="min-w-0 break-words text-sm font-semibold text-muted-foreground">{b.name}</span>
      </span>
      <span className="text-xs text-muted-foreground">Aucun RDV encaissé</span>
      {b.toClose > 0 && <Pill tone="amber">{b.toClose} à clôturer</Pill>}
      {b.noShows > 0 && <Pill tone="red">{b.noShows} absence{b.noShows > 1 ? 's' : ''}</Pill>}
      {agendaTo && <span className="ml-auto"><AgendaLink to={agendaTo} name={b.name} /></span>}
    </li>
  );
}

function BarberCard({ b, total, scope, show, loading, failed, agendaTo }) {
  const m = b.money;
  const ready = !loading && !failed;
  const share = ready && total > 0 ? Math.max(0, Math.min(1, m.revenue / total)) : 0;
  return (
    <li className="min-w-0 rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Dot color={b.color} />
          <span className="min-w-0 break-words text-sm font-semibold text-foreground">{b.name}</span>
        </span>
        <AgendaLink to={agendaTo} name={b.name} />
      </div>

      <p className="mt-1 text-lg font-bold leading-tight text-foreground">
        <span className="sr-only">CA : </span>
        <Money value={m.revenue} loading={loading} failed={failed} />
      </p>
      {ready && m.gift > 0 && (
        <p className="text-[11px] text-muted-foreground tabular-nums">+ {euro(m.gift)} carte cadeau</p>
      )}

      {ready && total > 0 && (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <motion.div
              className="h-full w-full origin-left"
              style={{ background: b.color }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: share }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{Math.round(share * 100)}{'\u202f'}% du CA RDV {scope}</p>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <Stat label="RDV encaissés" value={show(m.count)} />
        <Stat label="Panier moyen" value={show(euro(m.avg))} />
        <Stat label="Produits vendus" value={show(euro(m.products))} />
        <Stat label="Pourboires" value={ready ? <Tips m={m} /> : show('')} />
        <Stat label="Absences" value={show(b.noShows)} tone={ready && b.noShows > 0 ? 'red' : ''} />
        <Stat label="À clôturer" value={show(b.toClose)} tone={ready && b.toClose > 0 ? 'amber' : ''} />
      </dl>
    </li>
  );
}

export default function BarbersBlock({ d }) {
  const [period, setPeriod] = useState('month');
  const current = PERIODS.find((p) => p.key === period) || PERIODS[1];
  const list = d.stats.barbers[period] || [];
  const { loading, failed } = d.state.appointments;
  const ready = !loading && !failed;
  const show = (text) => (failed ? '—' : loading ? '…' : text);
  // Total de la période : somme des cartes (RDV sans barber compris), pour la part de chacun
  const total = list.reduce((s, b) => s + (Number(b.money.revenue) || 0), 0);
  const today = d.stats.clock.today;
  // Barber actif seulement : une fiche désactivée (ou des RDV sans barber) n'a pas d'agenda utile
  const agendaOf = (b) => (d.access.canAgenda && b.active && b.id
    ? `/admin/agenda?view=day&date=${today}&barber=${encodeURIComponent(b.id)}`
    : null);
  const emp = d.state.employees || {};

  return (
    <Section title="Barbers" icon={Users} hint="CA encaissé, hors pourboires et hors part carte cadeau">
      <div role="group" aria-label="Période" className="mb-3 grid grid-cols-2 gap-0.5 rounded-xl border border-border bg-secondary/40 p-0.5 sm:inline-grid">
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => setPeriod(p.key)}
              className={`min-h-11 rounded-lg px-4 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Liste des barbers illisible : les barbers sans RDV manquent, jamais « Aucun barber actif » */}
      {/* RDV aussi illisibles (coupure) : le bandeau de la page suffit, son « Réessayer » relit tout */}
      {emp.failed && !d.state.appointments.failed && (
        <InlineError what="la liste des barbers" onRetry={emp.retry} className={list.length ? 'mb-3' : ''} />
      )}

      {list.length === 0 ? (
        emp.failed ? null : loading || emp.loading
          ? <p className="text-xs text-muted-foreground">…</p>
          : <Note tone="muted">Aucun barber actif.</Note>
      ) : (
        <>
          {/* Barbers sans RDV encaissé : lignes courtes à part (dans la grille, elles s'étiraient à la
              hauteur des cartes voisines) */}
          {list.some((b) => !(ready && b.money.count === 0)) && (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.filter((b) => !(ready && b.money.count === 0)).map((b) => (
                <BarberCard
                  key={b.id || 'sans-barber'}
                  b={b}
                  total={total}
                  scope={current.scope}
                  show={show}
                  loading={loading}
                  failed={failed}
                  agendaTo={agendaOf(b)}
                />
              ))}
            </ul>
          )}
          {ready && list.some((b) => b.money.count === 0) && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 first:mt-0">
              {list.filter((b) => b.money.count === 0).map((b) => (
                <EmptyBarber key={b.id || 'sans-barber'} b={b} agendaTo={agendaOf(b)} />
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
