/**
 * Choix d'un rendez-vous d'abonnement : barber (`BarberStrip`, sans « peu importe »), jour (`DayStrip`)
 * et heure (`SlotGroups`), comme l'écran Créneau de la réservation. Sert au premier RDV, à « Changer »
 * d'un RDV proposé et à la reprise d'un RDV (`/abonnement?reprendre=`).
 * Contrôlé par le parent : `value = { employee, date, time }`, `onChange(prochaine valeur)`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { addDays, addMonths, format } from 'date-fns';
import { toast } from 'sonner';
import BarberStrip from '@/components/booking/BarberStrip';
import DayStrip from '@/components/booking/DayStrip';
import SlotGroups from '@/components/booking/SlotGroups';
import LoadError from '@/components/shared/LoadError';
import { dateFromKey, dayOptions, emptyDayMessage, weekKeyOf } from '@/lib/availability';
import { hapticFeedback } from '@/lib/capacitor';
import { isPausedQuery, useParisClock, useSlotData } from './useSlotData';
import { dayLabel } from './visitLabels';

/** Horizon proposé au client, comme à la réservation (mois à partir d'aujourd'hui). */
const MONTHS_AHEAD = 3;
/** Semaines lues dès l'ouverture : le premier jour libre est choisi d'office. */
const PRELOAD_WEEKS = 2;
const EMPTY_LIST = [];

export default function SlotPicker({ duration, value, onChange, usualId = null, maxKey = null, holdTime = false, notice = null }) {
  const reduceMotion = useReducedMotion();
  const { todayKey, nowTick } = useParisClock();
  const { employee, date, time } = value;

  // Horizon : jours d'aujourd'hui (compris) à `horizonKey` (exclu), jamais au-delà de `maxKey`
  // (coupes valables jusqu'à cette date, reprise d'un RDV)
  const horizonKey = useMemo(() => {
    const months = format(addMonths(dateFromKey(todayKey), MONTHS_AHEAD), 'yyyy-MM-dd');
    if (!maxKey) return months;
    const limit = format(addDays(dateFromKey(maxKey), 1), 'yyyy-MM-dd');
    return limit < months ? limit : months;
  }, [todayKey, maxKey]);
  const horizonDays = useMemo(() => {
    const out = [];
    for (let d = dateFromKey(todayKey); format(d, 'yyyy-MM-dd') < horizonKey; d = addDays(d, 1)) {
      out.push({ date: d, key: format(d, 'yyyy-MM-dd') });
    }
    return out;
  }, [todayKey, horizonKey]);

  // Semaines lues : les deux premières, celles à l'écran dans la bande (et la suivante d'avance),
  // celle du jour choisi. Mêmes clés que la réservation : changer de barber ne recharge rien.
  const [visibleRange, setVisibleRange] = useState(null);
  const onVisibleRange = useCallback((range) => setVisibleRange(range), []);
  const firstWeekKey = useMemo(() => weekKeyOf(dateFromKey(todayKey)), [todayKey]);
  const selectedWeekKey = date ? weekKeyOf(dateFromKey(date)) : null;
  const weekKeys = useMemo(() => {
    const keys = [];
    for (let i = 0; i < PRELOAD_WEEKS; i += 1) keys.push(format(addDays(dateFromKey(firstWeekKey), 7 * i), 'yyyy-MM-dd'));
    if (visibleRange) {
      const last = weekKeyOf(dateFromKey(visibleRange.lastKey));
      for (let k = weekKeyOf(dateFromKey(visibleRange.firstKey)); k <= last; k = format(addDays(dateFromKey(k), 7), 'yyyy-MM-dd')) {
        if (!keys.includes(k)) keys.push(k);
      }
      const after = format(addDays(dateFromKey(last), 7), 'yyyy-MM-dd');
      if (!keys.includes(after) && after < horizonKey) keys.push(after);
    }
    if (selectedWeekKey && !keys.includes(selectedWeekKey)) keys.push(selectedWeekKey);
    return keys;
  }, [firstWeekKey, visibleRange, selectedWeekKey, horizonKey]);

  const data = useSlotData(weekKeys);
  const { employees, employeesQuery, timeOffs, blockingByDate, privatesByDate, weekState, stamp } = data;
  const employeesPaused = isPausedQuery(employeesQuery);
  // Barber lu dans la liste à jour : horaires et jours de repos changés par le salon sont repris
  const liveEmployee = useMemo(
    () => (employee ? employees.find(e => String(e.id) === String(employee.id)) || employee : null),
    [employee, employees],
  );

  const optionsForDay = (d, key) => dayOptions({
    date: d,
    employee: liveEmployee,
    rows: blockingByDate.get(key) || EMPTY_LIST,
    timeOffs,
    totalDuration: duration,
    shortestDuration: duration,
    privateEvents: privatesByDate.get(key) || EMPTY_LIST,
  });

  // Places de chaque jour de la bande, pour les semaines chargées ; les autres attendent
  const weekStates = weekKeys.map(weekState);
  const stripDays = useMemo(() => horizonDays.map(({ date: d, key }) => {
    const i = weekKeys.indexOf(weekKeyOf(d));
    const state = i >= 0 ? weekStates[i] : 'loading';
    if (state === 'failed') return { date: d, key, status: 'unknown' };
    if (!liveEmployee || state !== 'ready') return { date: d, key, status: 'loading' };
    const { options, reason } = optionsForDay(d, key);
    return options.length > 0 ? { date: d, key, status: 'open', count: options.length } : { date: d, key, status: 'empty', reason };
  }), [horizonDays, weekKeys.join(','), weekStates.join(','), stamp, liveEmployee, duration, nowTick]);

  const dayState = selectedWeekKey ? weekState(selectedWeekKey) : null;
  const dayReady = dayState === 'ready' && !!liveEmployee;
  const dayFailed = dayState === 'failed' ? data.failedQuery(selectedWeekKey) : null;
  const { options: slotOptions, reason: emptyReason } = useMemo(() => {
    if (!date || !dayReady) return { options: EMPTY_LIST, reason: null };
    return optionsForDay(dateFromKey(date), date);
  }, [date, dayReady, stamp, liveEmployee, duration, nowTick]);

  // Écran sans jour choisi : le premier jour qui a de la place est choisi d'office, ses heures
  // s'affichent tout de suite (comme à la réservation)
  const firstOpenKey = stripDays.find(d => d.status === 'open')?.key || null;
  const preloadReady = weekKeys.slice(0, PRELOAD_WEEKS).every(k => weekState(k) === 'ready');
  useEffect(() => {
    if (date || !liveEmployee || !preloadReady || !firstOpenKey) return;
    onChange({ employee, date: firstOpenKey, time: null });
  }, [date, liveEmployee, preloadReady, firstOpenKey]);

  // Jour changé pendant la réservation : une date désormais passée est retirée
  useEffect(() => {
    if (date && date < todayKey) onChange({ employee, date: null, time: null });
  }, [todayKey]);

  // Heure choisie devenue impossible (créneau pris entre-temps, relu) : retirée, avec un mot.
  // `holdTime` : réponse perdue, les créneaux relus contiendraient son propre rendez-vous
  useEffect(() => {
    if (holdTime || !time || !date || !dayReady || slotOptions.some(o => o.time === time)) return;
    onChange({ employee, date, time: null });
    toast.info(`${time} n'est plus disponible : choisissez une autre heure.`);
  }, [holdTime, time, date, dayReady, slotOptions]);

  const chooseBarber = (emp) => {
    hapticFeedback();
    if (String(employee?.id) === String(emp.id)) return;
    onChange({ employee: emp, date, time: null });
  };

  const chooseDay = (day) => {
    hapticFeedback();
    // Les heures s'affichent sous la bande de jours : sur un téléphone elles tomberaient sous la barre
    // du bas. La bande remonte en haut de l'écran, heures dessous (comme à la réservation).
    requestAnimationFrame(() => {
      const el = document.getElementById('day-strip');
      if (el && el.getBoundingClientRect().top > 24) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    if (date === day.key) return;
    onChange({ employee, date: day.key, time: null });
  };

  const chooseSlot = (option) => {
    hapticFeedback();
    onChange({ employee, date, time: option.time });
  };

  const emptyMessage = dayReady && date && slotOptions.length === 0
    ? emptyDayMessage(emptyReason, {
      barberName: liveEmployee?.name, date: dateFromKey(date), totalDuration: duration, serviceCount: 1, canChangeBarber: true,
    })
    : null;
  const noPlaceSoon = !date && !!liveEmployee && preloadReady && !firstOpenKey;

  return (
    <div className="space-y-6">
      <section aria-labelledby="abo-barber-title">
        <h2 id="abo-barber-title" className="text-[15px] font-semibold text-foreground mb-1">Votre barber</h2>
        <BarberStrip
          employees={employees}
          showAny={false}
          selectedId={employee?.id}
          usualId={usualId}
          loading={employeesQuery.isPending && !employeesPaused}
          onSelect={chooseBarber}
        />
        {((employeesQuery.isError && !employeesQuery.data) || employeesPaused) && (
          <LoadError what="les barbers" error={employeesQuery.error} onRetry={employeesQuery.refetch}
            retrying={employeesQuery.isFetching} compact className="mt-3" />
        )}
      </section>

      {notice}

      {/* Aucun barber encore choisi (premier abonnement, pas de dernière visite) */}
      {!employee && !employeesQuery.isPending && employees.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">Choisissez votre barber pour voir ses créneaux.</p>
      )}

      {liveEmployee && (
        <DayStrip days={stripDays} selectedKey={date} onSelect={chooseDay} onVisibleRange={onVisibleRange} />
      )}

      {noPlaceSoon && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{liveEmployee.name} n'a plus de place dans les deux prochaines semaines.</p>
          <p className="mt-2 text-xs text-muted-foreground/80">Choisissez un autre barber, ou faites glisser les jours ci-dessus pour voir les semaines suivantes.</p>
        </div>
      )}

      {liveEmployee && date && (
        // Hauteur minimale : avec peu d'heures la page serait trop courte pour remonter la bande de jours
        <section aria-labelledby="abo-day-title" className="min-h-[60vh]">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h2 id="abo-day-title" className="text-[15px] font-semibold text-foreground">{dayLabel(date)}</h2>
            {dayReady && slotOptions.length > 0 && (
              <span className="text-xs text-muted-foreground text-right">
                {slotOptions.length} créneau{slotOptions.length > 1 ? 'x' : ''} avec {liveEmployee.name}
              </span>
            )}
          </div>
          {dayState === 'loading' ? (
            <div className="grid grid-cols-4 gap-2" aria-busy="true" aria-label="Chargement des créneaux">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-[52px] rounded-xl bg-card border border-border animate-pulse" />
              ))}
            </div>
          ) : dayFailed ? (
            <LoadError what="les créneaux" error={dayFailed.error} onRetry={() => data.retry([selectedWeekKey])} retrying={data.retrying} compact />
          ) : slotOptions.length > 0 ? (
            <SlotGroups options={slotOptions} selectedTime={time} onSelect={chooseSlot} />
          ) : emptyMessage && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage.title}</p>
              <p className="mt-2 text-xs text-muted-foreground/80">{emptyMessage.hint}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
