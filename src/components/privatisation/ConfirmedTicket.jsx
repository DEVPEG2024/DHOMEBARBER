/**
 * Billet d'une privatisation confirmée à venir (`view.kind === 'confirmed'`), en tête de la page :
 * « C'est calé », compte à rebours, barbers qui attendent le groupe, perforation, date / horaires /
 * occasion / groupe, adresse, puis Ajouter au calendrier, Itinéraire et Appeler.
 * Barbers montrés : seulement ceux qui travaillent ce jour-là (horaires du jour, pas de congé
 * approuvé) ; personne ce jour-là (dimanche…) : ni portraits ni phrase.
 * Calendrier : en natif, Google Agenda directement (le .ics ne s'ouvre pas de façon fiable dans la
 * WebView) ; sur le web, choix Google Agenda ou Apple / Outlook, comme Mes rendez-vous.
 */
import React, { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, MapPin, Navigation, Phone } from 'lucide-react';
import { api } from '@/api/apiClient';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { openCalendar } from '@/lib/calendarLinks';
import { hapticFeedback, isNative, openExternalUrl } from '@/lib/capacitor';
import { isOnLeave, workingHoursOf } from '@/lib/slots';
import { queryFailed } from '@/components/shared/LoadError';
import { usePublicBarbers, useSalonPhone } from './usePrivatisation';
import {
  countdown, dateOfKey, eventTypeLabel, formatEventDate, MAPS_URL, privatisationCalendarEvent,
  requestAnchorId, SALON_ADDRESS_LINE, slotOf,
} from './privatisationUtils';

const CALENDAR_TARGETS = [
  { kind: 'google', label: 'Google Agenda' },
  { kind: 'ics', label: 'Apple / Outlook' },
];

/** Prénoms lisibles : « Dom », « Dom et Kevin », « Dom, Kevin et Romain ». */
function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/**
 * Congés des barbers : même requête et même cache que la réservation (`Booking.jsx`, clé
 * `['timeOffs']`, mêmes lignes) ; un client n'y reçoit que les congés approuvés.
 */
function useTimeOffs() {
  return useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
  });
}

export default function ConfirmedTicket({ event, view, clock }) {
  const reduce = useReducedMotion();
  const { barbers } = usePublicBarbers();
  const timeOffsQuery = useTimeOffs();
  const phone = useSalonPhone();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const menuId = useId();

  const anchor = requestAnchorId(event?.id);
  const cd = countdown(view.key, clock);
  const slot = slotOf(event?.time_slot) || slotOf('full_day');
  const guests = Number(event?.guest_count) || 0;

  // Barbers qui travaillent ce jour-là : horaires du jour (`working_hours`) et pas de congé
  // approuvé. On attend les congés (pas de portrait qui apparaît puis disparaît) ; s'ils ne se
  // chargent pas (échec, hors connexion), seul le filtre des horaires s'applique.
  const timeOffs = Array.isArray(timeOffsQuery.data) ? timeOffsQuery.data : null;
  const leavesFailed = !timeOffs && queryFailed(timeOffsQuery);
  const team = useMemo(() => {
    if (!timeOffs && !leavesFailed) return [];
    const day = dateOfKey(view.key);
    return (barbers || [])
      .filter(b => b?.photo_url && firstName(b.name))
      .filter(b => workingHoursOf(b, day) && !(timeOffs && isOnLeave(b, view.key, timeOffs)))
      .slice(0, 3);
  }, [barbers, timeOffs, leavesFailed, view.key]);
  const names = joinNames(team.map(b => firstName(b.name)));
  const longCountdown = String(cd.big).length > 5;

  const addToCalendar = (kind) => {
    hapticFeedback();
    openCalendar(kind, privatisationCalendarEvent(event));
    setCalendarOpen(false);
  };
  const onCalendar = () => {
    if (isNative) { addToCalendar('google'); return; }
    hapticFeedback();
    setCalendarOpen(open => !open);
  };

  const fields = [
    { label: 'Date', value: formatEventDate(view.key, 'medium') },
    { label: 'Horaires', value: slot?.hours || '' },
    { label: 'Occasion', value: eventTypeLabel(event?.event_type) },
    { label: 'Groupe', value: guests > 0 ? `${guests} personne${guests > 1 ? 's' : ''}` : '—' },
  ];

  const secondary = 'flex h-[46px] items-center justify-center gap-1.5 rounded-[14px] border border-border px-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary';

  return (
    <motion.section
      id={anchor}
      aria-labelledby={`${anchor}-title`}
      className="scroll-mt-24"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
        <span className="live-dot" aria-hidden="true" />
        C'est calé
      </p>

      <article className="relative rounded-3xl border border-primary/35 bg-card">
        {/* Partie haute du billet */}
        <div className="relative overflow-hidden rounded-t-3xl px-[18px] pb-5 pt-[18px]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-60 w-60 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Privatisation confirmée</p>
              <h2 id={`${anchor}-title`} className="mt-1.5 font-display text-[28px] font-bold leading-[1.1] text-foreground">
                Le salon<br />est à vous
              </h2>
            </div>
            <div className="shrink-0 rounded-[18px] border border-primary/35 bg-primary/15 px-3.5 py-2.5 text-center">
              <p className={`font-fut font-extrabold leading-none text-foreground ${longCountdown ? 'text-[28px]' : 'text-[40px]'}`}>
                {cd.big}
              </p>
              <p className="mt-1 text-[11px] text-foreground/75">{cd.small}</p>
            </div>
          </div>

          {team.length > 0 && (
            <div className="relative mt-4 flex items-center gap-2.5">
              <div className="flex shrink-0" aria-hidden="true">
                {team.map((b, i) => (
                  <motion.span
                    key={b.id}
                    className={`block w-[34px] overflow-hidden rounded-lg border-2 border-card ${i > 0 ? '-ml-2' : ''}`}
                    style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }}
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: 0.15 + i * 0.08, ease: 'easeOut' }}
                  >
                    <img src={b.photo_url} alt="" loading="lazy" className="block h-full w-full object-cover" />
                  </motion.span>
                ))}
              </div>
              <p className="min-w-0 break-words text-[13px] leading-snug text-foreground/80">
                {names}
                <br />
                <span className="text-muted-foreground">{team.length > 1 ? 'vous attendent' : 'vous attend'}</span>
              </p>
            </div>
          )}
        </div>

        {/* Perforation : ligne pointillée et deux encoches découpées dans le billet */}
        <div aria-hidden="true" className="relative h-[22px]">
          <span className="absolute -left-3 top-0 h-[22px] w-[22px] rounded-full border-r border-primary/35 bg-background" />
          <span className="absolute -right-3 top-0 h-[22px] w-[22px] rounded-full border-l border-primary/35 bg-background" />
          <span className="absolute left-5 right-5 top-[10px] border-t-2 border-dashed border-border" />
        </div>

        {/* Partie basse : informations et actions */}
        <div className="px-[18px] pb-[18px] pt-1.5">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3.5">
            {fields.map(f => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 break-words font-fut text-[22px] font-bold leading-[1.05] text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3.5 flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <MapPin className="mt-0.5 h-[15px] w-[15px] shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 break-words">{SALON_ADDRESS_LINE}</span>
          </p>

          <motion.button
            type="button"
            whileTap={reduce ? undefined : { scale: 0.97 }}
            onClick={onCalendar}
            aria-expanded={isNative ? undefined : calendarOpen}
            aria-controls={!isNative && calendarOpen ? menuId : undefined}
            className="mt-4 flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground"
          >
            <CalendarPlus className="h-[17px] w-[17px]" aria-hidden="true" />
            Ajouter au calendrier
          </motion.button>

          {!isNative && (
            <AnimatePresence initial={false}>
              {calendarOpen && (
                <motion.div
                  key="calendar-menu"
                  id={menuId}
                  initial={{ opacity: 0, y: reduce ? 0 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduce ? 0 : -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="mt-2 grid grid-cols-2 gap-2"
                >
                  {CALENDAR_TARGETS.map(({ kind, label }) => (
                    <motion.button
                      key={kind}
                      type="button"
                      whileTap={reduce ? undefined : { scale: 0.96 }}
                      onClick={() => addToCalendar(kind)}
                      className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary px-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70"
                    >
                      <CalendarPlus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                      {label}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <div className="mt-2 grid grid-cols-2 gap-2">
            {isNative ? (
              <button type="button" onClick={() => openExternalUrl(MAPS_URL)} className={secondary}>
                <Navigation className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                Itinéraire
              </button>
            ) : (
              <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className={secondary}>
                <Navigation className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                Itinéraire
              </a>
            )}
            <a href={phone.href} aria-label={`Appeler le salon au ${phone.display}`} className={secondary}>
              <Phone className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
              Appeler
            </a>
          </div>
        </div>
      </article>
    </motion.section>
  );
}
