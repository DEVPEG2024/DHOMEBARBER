import React, { useRef, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Coffee } from 'lucide-react';
import { AppointmentCard, BreakCard, LastMinuteCard, NowLine, OffHoursShade } from './AppointmentCard';
import useBreakDrag from './useBreakDrag';
import {
  START_HOUR, TOTAL_HOURS, minutesToTime, layoutOverlaps, verticalPlacement,
  workingWindow, isOnLeave, isBreak, isLastMinuteSlot, toDateStr,
} from './agendaUtils';

const HOUR_HEIGHT = 72;
const MIN_CARD = 18; // px = 15 min (voir DayView)
const MIN_CARD_MINUTES = Math.ceil((MIN_CARD / HOUR_HEIGHT) * 60);

function DragPreview({ startMin, endMin }) {
  const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 16);
  return (
    <div className="absolute left-0.5 right-0.5 rounded-md border-2 border-dashed border-slate-400 pointer-events-none"
      style={{ top, height, background: 'rgba(148,163,184,0.15)', zIndex: 30 }}>
      <div className="flex items-center gap-1 px-1 py-0.5">
        <Coffee className="w-3 h-3 text-slate-400 shrink-0" />
        <p className="text-[9px] font-bold text-slate-400 truncate">{minutesToTime(startMin)} – {minutesToTime(endMin)}</p>
      </div>
    </div>
  );
}

export default function WeekView({ currentDate, appointments, employees, employeeFilter, timeOffs = [], onSelect, onBreakClick, onCreateBreak, onDayClick }) {
  const scrollRef = useRef();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const single = employeeFilter !== 'all' ? employees.find((e) => String(e.id) === String(employeeFilter)) : null;

  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const thisWeek = days.some((d) => isSameDay(d, now));
    const target = thisWeek ? Math.max(now.getHours() - 1, START_HOUR) : 8;
    scrollRef.current.scrollTop = (target - START_HOUR) * HOUR_HEIGHT;
  }, []);

  const drag = useBreakDrag({
    hourHeight: HOUR_HEIGHT,
    onCreate: ({ start_time, end_time, column }) => onCreateBreak({
      start_time, end_time, date: column, employee_id: single ? single.id : null,
    }),
  });

  const colorOf = (empId) => employees.find((e) => String(e.id) === String(empId))?.color || '#94a3b8';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[calc(100dvh-220px)] min-h-[420px]">
      {/* En-têtes des jours : un tap ouvre la journée */}
      <div className="flex border-b border-border shrink-0 overflow-hidden [scrollbar-gutter:stable]">
        <div className="w-10 sm:w-12 shrink-0" />
        {days.map((day) => {
          const dateStr = toDateStr(day);
          const isToday = isSameDay(day, new Date());
          const count = appointments.filter((a) => a.date === dateStr && !isBreak(a) && !isLastMinuteSlot(a) && a.status !== 'cancelled').length;
          const onLeave = single && isOnLeave(timeOffs, single.id, dateStr);
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onDayClick(day)}
              title={`Ouvrir le ${format(day, 'EEEE d MMMM', { locale: fr })}`}
              className={`flex-1 basis-0 min-w-0 text-center py-2 border-l border-foreground/15 transition-colors hover:bg-foreground/5 ${onLeave ? 'bg-red-500/10' : isToday ? 'bg-primary/5' : ''}`}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                {format(day, 'EEE', { locale: fr }).replace('.', '')}
              </p>
              <p className={`text-base sm:text-xl font-bold leading-tight ${onLeave ? 'text-red-500' : isToday ? 'text-primary' : 'text-foreground'}`}>
                {format(day, 'd')}
              </p>
              {onLeave ? (
                <span className="text-[9px] px-1.5 rounded-full font-bold bg-red-500/20 text-red-500">Congé</span>
              ) : (
                <span className={`text-[9px] px-1.5 rounded-full font-semibold ${count ? (isToday ? 'bg-primary/25 text-primary' : 'bg-secondary text-muted-foreground') : 'text-transparent'}`}>
                  {count || 0}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} data-scroll-container className="overflow-y-auto overflow-x-hidden flex-1 overscroll-contain [scrollbar-gutter:stable]">
        <div className="flex" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
          <div className="w-10 sm:w-12 shrink-0 relative">
            {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
              <div key={i} className="absolute w-full" style={{ top: i * HOUR_HEIGHT }}>
                <span className="text-[10px] text-muted-foreground/70 absolute top-0.5 right-1 font-mono select-none">
                  {String(START_HOUR + i).padStart(2, '0')}h
                </span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dateStr = toDateStr(day);
            const isToday = isSameDay(day, new Date());
            const dayApts = appointments.filter((a) => a.date === dateStr);
            const bookings = dayApts.filter((a) => !isBreak(a) && !isLastMinuteSlot(a));
            const meta = layoutOverlaps(bookings, MIN_CARD_MINUTES);
            const onLeaveEmps = employees.filter((emp) => isOnLeave(timeOffs, emp.id, dateStr));
            const singleOnLeave = single && onLeaveEmps.some((e) => String(e.id) === String(single.id));
            const preview = drag.previewFor(dateStr);

            return (
              <div
                key={dateStr}
                className={`flex-1 basis-0 min-w-0 relative border-l border-foreground/15 select-none cursor-crosshair ${isToday ? 'bg-primary/[0.03]' : ''}`}
                onMouseDown={(e) => drag.start(e, dateStr, e.currentTarget)}
                onTouchStart={(e) => drag.start(e, dateStr, e.currentTarget)}
              >
                {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                  <div key={i} className="absolute w-full border-t border-foreground/20" style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                    <div className="absolute w-full border-t border-foreground/[0.08]" style={{ top: HOUR_HEIGHT / 2 }} />
                  </div>
                ))}

                {single && !singleOnLeave && <OffHoursShade window={workingWindow(single, dateStr)} hourHeight={HOUR_HEIGHT} />}

                {singleOnLeave && (
                  <div className="absolute inset-0 z-[5] pointer-events-none"
                    style={{ background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.16), rgba(239,68,68,0.16) 8px, rgba(239,68,68,0.06) 8px, rgba(239,68,68,0.06) 16px)' }} />
                )}

                {!single && onLeaveEmps.length > 0 && (
                  <div className="absolute top-0.5 left-0.5 right-0.5 z-[26] pointer-events-none flex flex-col gap-0.5">
                    {onLeaveEmps.map((emp) => (
                      <span key={emp.id} className="text-[8px] sm:text-[9px] bg-red-500/20 text-red-500 border border-red-500/30 rounded px-1 font-semibold truncate">
                        {emp.name} congé
                      </span>
                    ))}
                  </div>
                )}

                {dayApts.filter(isBreak).map((apt) => (
                  <BreakCard key={apt.id} apt={apt} onSelect={onBreakClick}
                    style={{ ...verticalPlacement(apt.start_time, apt.end_time, HOUR_HEIGHT, 18), left: 1, right: 1 }} />
                ))}

                {dayApts.filter(isLastMinuteSlot).map((apt) => (
                  <LastMinuteCard key={apt.id} apt={apt} onSelect={onSelect}
                    style={{ ...verticalPlacement(apt.start_time, apt.end_time, HOUR_HEIGHT, 20), left: 1, right: 1 }} />
                ))}

                {bookings.map((apt) => {
                  const { col, cols } = meta[apt.id] || { col: 0, cols: 1 };
                  const width = 100 / cols;
                  return (
                    <AppointmentCard
                      key={apt.id}
                      apt={apt}
                      color={colorOf(apt.employee_id)}
                      showBarber={!single}
                      dense
                      onSelect={onSelect}
                      style={{
                        ...verticalPlacement(apt.start_time, apt.end_time, HOUR_HEIGHT, MIN_CARD),
                        left: `calc(${col * width}% + 1px)`,
                        width: `calc(${width}% - 2px)`,
                      }}
                    />
                  );
                })}

                {isToday && <NowLine hourHeight={HOUR_HEIGHT} />}
                {preview && <DragPreview {...preview} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
