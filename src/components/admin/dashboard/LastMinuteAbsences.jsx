/**
 * Tableau de bord : « Last Minute et absences du mois » (refonte du 1er nov. 2026).
 *
 * - Last Minute du mois (`d.stats.lastMinute`) : ceux de l'équipe et les automatiques, à part.
 *   Un automatique « comblé » = un client a réservé ce créneau, que ce soit grâce au Last Minute ou
 *   non : pas de taux de prise pour eux, il ne voudrait rien dire.
 * - Absences du mois (`d.stats.absences`) : manque à gagner, détail, rang de l'absence du client
 *   (compté sur les deux mois lus, le mois précédent et celui-ci : dit une fois sous la liste).
 * - « N créneaux libres encore à prendre aujourd'hui » : Last Minute libres dont l'heure n'est pas passée.
 * - Annulations par les clients du mois (`d.stats.month.clientCancels`).
 */
import React, { useId, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarClock, Zap, UserX } from 'lucide-react';
import { Section, Pill, GoLink, Row, TONE, TONE_BOX } from '@/components/admin/dashboard/ui';
import { noonOf } from '@/lib/dashboardStats';
import { euro } from '@/lib/euro';
import { staffClientLabel } from '@/lib/guest';

// Absences montrées avant « Voir les N absences »
const ABSENCES_SHOWN = 5;
// Grille de chiffres qui suit la largeur du bloc (2 colonnes sur téléphone, 3 ou 4 au large)
const STATS_GRID = 'grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-3 gap-y-2';

function Stat({ label, value, hint = '', tone = '' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground break-words">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${tone ? TONE[tone] : 'text-foreground'}`}>
        {value}
        {hint && <span className="block text-[11px] font-normal text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}

function SubTitle({ icon: Icon, children }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      {children}
    </h3>
  );
}

/** « mar. 3 nov. », « dim. 1er nov. » */
function shortDate(key) {
  const date = noonOf(key);
  const day = Number(String(key).slice(8, 10));
  return `${format(date, 'EEE', { locale: fr })} ${day === 1 ? '1er' : day} ${format(date, 'MMM', { locale: fr })}`;
}

function LastMinutePart({ d, show, ready }) {
  const { team, auto, freeToday } = d.stats.lastMinute;
  const today = d.stats.clock.today;
  const nothing = ready && team.published === 0 && auto.published === 0;
  // Sans publication de l'équipe, la carte dit « Aucun ce mois-ci » : le taux n'est jamais affiché vide
  const takeRate = team.published > 0 ? `${Math.round((team.taken / team.published) * 100)}\u202f%` : '';

  return (
    <div>
      <SubTitle icon={Zap}>Last Minute</SubTitle>

      {ready && freeToday > 0 && (
        <div className={`mb-2 flex flex-wrap items-center justify-between gap-x-3 rounded-xl border px-3 ${TONE_BOX.orange}`}>
          <span className="py-2 text-xs font-semibold">
            {freeToday} créneau{freeToday > 1 ? 'x' : ''} libre{freeToday > 1 ? 's' : ''} encore à prendre aujourd'hui
          </span>
          {d.access.canAgenda && <GoLink to={`/admin/agenda?view=day&date=${today}`} className="-mr-2">Agenda du jour</GoLink>}
        </div>
      )}

      {nothing ? (
        <p className="text-xs text-muted-foreground">Aucun Last Minute ce mois-ci.</p>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-foreground">Publiés par l'équipe</p>
            {ready && team.published === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun ce mois-ci.</p>
            ) : (
              <dl className={STATS_GRID}>
                <Stat label="Publiés" value={show(team.published)} />
                <Stat label="Pris par un client" value={show(team.taken)} />
                <Stat label="Taux de prise" value={show(takeRate)} />
                <Stat label="CA encaissé" value={show(euro(team.revenue))} />
              </dl>
            )}
          </div>
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="mb-2 text-xs font-semibold text-foreground">
              Automatiques
              <span className="block text-[11px] font-normal text-muted-foreground">Heures libres des 6 prochaines heures, publiées d'office</span>
            </p>
            {ready && auto.published === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun ce mois-ci.</p>
            ) : (
              <>
                <dl className={STATS_GRID}>
                  <Stat label="Publiés" value={show(auto.published)} />
                  <Stat label="Comblés" value={show(auto.taken)} />
                  <Stat label="CA encaissé" value={show(euro(auto.revenue))} />
                </dl>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Comblé : un client a réservé ce créneau, grâce au Last Minute ou de lui-même.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AbsencesPart({ d, show, ready }) {
  const { list, lost } = d.stats.absences;
  const [open, setOpen] = useState(false);
  const listId = useId();
  const shown = open ? list : list.slice(0, ABSENCES_SHOWN);
  const count = list.length;

  return (
    <div>
      <SubTitle icon={UserX}>Absences</SubTitle>
      {ready && count === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune absence ce mois-ci.</p>
      ) : (
        <>
          <Row
            label={ready ? `Manque à gagner sur ${count} absence${count > 1 ? 's' : ''}` : 'Manque à gagner'}
            value={show(euro(lost))}
            tone={ready ? 'red' : ''}
            strong
          />
          {ready && (
            <>
              <ul id={listId} className="mt-1 divide-y divide-border">
                {shown.map((a) => (
                  <li key={a.id} className="flex min-w-0 items-start gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs font-semibold text-foreground">
                        {staffClientLabel({ client_name: a.clientName, guest_name: a.guestName })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {shortDate(a.date)}{a.start ? ` · ${a.start}` : ''} · {a.employeeName}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums text-foreground">{euro(a.amount)}</span>
                      {a.repeat >= 2 && <Pill tone={a.repeat >= 3 ? 'red' : 'amber'}>{a.repeat}e absence</Pill>}
                    </div>
                  </li>
                ))}
              </ul>
              {shown.some((a) => a.repeat >= 2) && (
                <p className="mt-1 text-[11px] text-muted-foreground">Rang de l'absence (« 2e absence ») compté sur les deux derniers mois.</p>
              )}
              {count > ABSENCES_SHOWN && (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => setOpen((v) => !v)}
                  className="inline-flex min-h-11 items-center rounded-xl px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {open ? 'Voir moins' : `Voir les ${count} absences`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function LastMinuteAbsences({ d }) {
  const { loading, failed } = d.state.appointments;
  const ready = !loading && !failed;
  const show = (text) => (failed ? '—' : loading ? '…' : text);
  const monthLabel = format(noonOf(`${d.stats.clock.monthKey}-01`), 'MMMM yyyy', { locale: fr });

  return (
    <Section title="Last Minute et absences du mois" icon={CalendarClock} hint={`Chiffres de ${monthLabel}`}>
      <div className="space-y-5">
        <LastMinutePart d={d} show={show} ready={ready} />
        <div className="border-t border-border pt-4">
          <AbsencesPart d={d} show={show} ready={ready} />
        </div>
        <div className="border-t border-border pt-2">
          <Row label="Annulations par les clients" hint="Déplacements non comptés" value={show(d.stats.month.clientCancels)} />
        </div>
      </div>
    </Section>
  );
}
