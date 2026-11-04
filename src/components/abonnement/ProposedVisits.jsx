/**
 * Les 4 RDV proposés (planche 3) : même jour et même heure chaque semaine (`proposeNextSlots`),
 * « Changer » sur chaque ligne. Ligne ambrée quand la proposition s'écarte du jour ou de l'heure
 * voulus, ou quand le serveur a refusé le créneau (`slot_unavailable`, son message) ; sans heure : ligne
 * à choisir, « Continuer » reste inactif (la page le décide).
 */
import React from 'react';
import { formatDuration } from '@/components/services/serviceUtils';
import { dayLabel, dayName } from './visitLabels';

/**
 * Pourquoi cette ligne s'écarte de la proposition de départ.
 * @param {{ date: string, time: string|null, note: null|'time'|'day'|'taken', wantedDate?: string, wantedTime?: string }} line
 */
export function lineNote(line) {
  if (line.note === 'taken') return line.noteText || 'Ce créneau n\'est plus disponible : choisissez-en un autre.';
  if (!line.time) return `Plus de place ${dayName(line.wantedDate || line.date)} : choisissez un autre créneau.`;
  if (line.note === 'time') return `${line.wantedTime} est déjà pris ce jour-là : ${line.time} proposé.`;
  if (line.note === 'day') return `Plus de place ${dayName(line.wantedDate)} : ${dayName(line.date)} proposé.`;
  return null;
}

export default function ProposedVisits({ lines, onChange, issue = null, notice = null }) {
  return (
    <div className="space-y-4">
      {/* Refus du serveur qui ne vise aucune ligne : son message, tel quel */}
      {notice && (
        <p role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] leading-relaxed text-amber-200 break-words">{notice}</p>
      )}

      <p className="text-sm leading-relaxed text-foreground/85">
        Nous avons cherché le même jour et la même heure pour les semaines suivantes. Changez ce que vous voulez.
      </p>

      <ol className="space-y-2.5">
        {lines.map((line, i) => {
          const note = lineNote(line);
          return (
            <li
              key={`${line.date}-${i}`}
              className={`rounded-2xl border pl-3.5 pr-2 py-2 ${note ? 'border-amber-500/55 bg-amber-500/10' : 'border-border bg-card'}`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-[30px] h-[30px] shrink-0 rounded-full text-[13px] font-bold flex items-center justify-center ${
                  line.time ? 'bg-primary text-primary-foreground' : 'border-2 border-amber-500 text-amber-400'
                }`} aria-hidden="true">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-foreground break-words">{dayLabel(line.date)}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {line.time ? `${line.time} · ${line.employee?.name || ''}` : 'Heure à choisir'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(i)}
                  aria-label={`${line.time ? 'Changer' : 'Choisir'} le rendez-vous ${i + 1}`}
                  className="shrink-0 min-h-[44px] px-2.5 text-[13px] font-semibold text-primary hover:text-primary/80"
                >
                  {line.time ? 'Changer' : 'Choisir'}
                </button>
              </div>
              {note && <p className="mt-1 ml-[42px] pb-1 pr-1 text-xs leading-snug text-amber-400">{note}</p>}
            </li>
          );
        })}
      </ol>

      {issue && <p role="alert" className="text-xs leading-relaxed text-amber-400">{issue}</p>}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Vos 4 rendez-vous doivent tenir dans les 5 semaines qui suivent le premier, avec au moins 3 jours d'écart.
      </p>
    </div>
  );
}

/** Durée d'une visite, pour les sous-titres. */
export const perVisit = (plan) => `${formatDuration(plan?.duration)} par visite`;
