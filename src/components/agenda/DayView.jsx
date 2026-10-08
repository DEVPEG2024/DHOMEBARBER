import React, { useRef, useEffect } from 'react';
import { Coffee } from 'lucide-react';
import { AppointmentCard, BreakCard, LastMinuteCard, NowLine, OffHoursShade } from './AppointmentCard';
import useBreakDrag from './useBreakDrag';
import {
  START_HOUR, TOTAL_HOURS, minutesToTime, layoutOverlaps, verticalPlacement,
  workingWindow, isOnLeave, isBreak, isLastMinuteSlot, toDateStr,
} from './agendaUtils';

const HOUR_HEIGHT = 80;
const LABEL_WIDTH = 48; // colonne des heures (w-12)
const MIN_COLUMN = 76; // px par barber avant défilement horizontal
const MIN_CARD = 20; // px = 15 min : deux prestations courtes qui se suivent restent l'une sous l'autre
const MIN_CARD_MINUTES = Math.ceil((MIN_CARD / HOUR_HEIGHT) * 60);

function DragPreview({ startMin, endMin }) {
  const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 16);
  return (
    <div className="absolute left-1 right-1 rounded-md border-2 border-dashed border-slate-400 pointer-events-none"
      style={{ top, height, background: 'rgba(148,163,184,0.15)', zIndex: 30 }}>
      <div className="flex items-center gap-1 px-2 py-1">
        <Coffee className="w-3 h-3 text-slate-400" />
        <p className="text-[10px] font-bold text-slate-400">{minutesToTime(startMin)} – {minutesToTime(endMin)}</p>
      </div>
    </div>
  );
}

export default function DayView({ date, appointments, employees, employeeFilter, timeOffs = [], onSelect, onBreakClick, onCreateBreak, onFocusBarber }) {
  const scrollRef = useRef();
  const isToday = date === toDateStr(new Date());

  // À l'ouverture : on arrive sur l'heure actuelle (aujourd'hui) ou sur 8 h
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const target = isToday ? Math.max(now.getHours() - 1, START_HOUR) : 8;
    scrollRef.current.scrollTop = (target - START_HOUR) * HOUR_HEIGHT;
  }, []);

  const drag = useBreakDrag({
    hourHeight: HOUR_HEIGHT,
    onCreate: ({ start_time, end_time, column }) => onCreateBreak({ start_time, end_time, employee_id: column, date }),
  });

  const cols = employeeFilter === 'all'
    ? employees
    : employees.filter((e) => String(e.id) === String(employeeFilter));

  // Rendez-vous d'un barber qui n'est plus actif : colonne « Autres » pour ne rien perdre
  const known = new Set(cols.map((e) => String(e.id)));
  const orphans = employeeFilter === 'all' ? appointments.filter((a) => !known.has(String(a.employee_id))) : [];
  const columns = [
    ...cols.map((emp) => ({ key: String(emp.id), emp, apts: appointments.filter((a) => String(a.employee_id) === String(emp.id)) })),
    ...(orphans.length ? [{ key: 'other', emp: { id: 'other', name: 'Autres', color: '#94a3b8' }, apts: orphans }] : []),
  ];
  const multi = columns.length > 1;

  const renderColumn = ({ key, emp, apts }) => {
    const onLeave = emp.id !== 'other' && isOnLeave(timeOffs, emp.id, date);
    const bookings = apts.filter((a) => !isBreak(a) && !isLastMinuteSlot(a));
    const meta = layoutOverlaps(bookings, MIN_CARD_MINUTES);
    const preview = drag.previewFor(key);
    const color = emp.color || '#3fcf8e';

    return (
      <div
        key={key}
        className="flex-1 basis-0 min-w-0 relative border-l border-foreground/15 select-none cursor-crosshair"
        onMouseDown={(e) => emp.id !== 'other' && drag.start(e, key, e.currentTarget)}
        onTouchStart={(e) => emp.id !== 'other' && drag.start(e, key, e.currentTarget)}
      >
        {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
          <div key={i} className="absolute w-full border-t border-foreground/20" style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
            <div className="absolute w-full border-t border-foreground/[0.08]" style={{ top: HOUR_HEIGHT / 2 }} />
          </div>
        ))}

        {!onLeave && emp.id !== 'other' && <OffHoursShade window={workingWindow(emp, date)} hourHeight={HOUR_HEIGHT} />}

        {onLeave && (
          <div className="absolute inset-0 z-[5] pointer-events-none flex justify-center"
            style={{ background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.16), rgba(239,68,68,0.16) 8px, rgba(239,68,68,0.06) 8px, rgba(239,68,68,0.06) 16px)' }}>
            <div className="mt-20 h-fit bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-1.5 text-center">
              <p className="text-red-500 font-bold text-xs">CONGÉ</p>
            </div>
          </div>
        )}

        {apts.filter(isBreak).map((apt) => (
          <BreakCard key={apt.id} apt={apt} onSelect={onBreakClick}
            style={{ ...verticalPlacement(apt.start_time, apt.end_time, HOUR_HEIGHT, 20), left: 2, right: 2 }} />
        ))}

        {apts.filter(isLastMinuteSlot).map((apt) => (
          <LastMinuteCard key={apt.id} apt={apt} onSelect={onSelect}
            style={{ ...verticalPlacement(apt.start_time, apt.end_time, HOUR_HEIGHT, 24), left: 2, right: 2 }} />
        ))}

        {bookings.map((apt) => {
          const { col, cols: n } = meta[apt.id] || { col: 0, cols: 1 };
          const width = 100 / n;
          return (
            <AppointmentCard
              key={apt.id}
              apt={apt}
              color={color}
              dense={multi}
              onSelect={onSelect}
              style={{
                ...verticalPlacement(apt.start_time, apt.end_time, HOUR_HEIGHT, MIN_CARD),
                left: `calc(${col * width}% + 2px)`,
                width: `calc(${width}% - 4px)`,
              }}
            />
          );
        })}

        {isToday && <NowLine hourHeight={HOUR_HEIGHT} />}
        {preview && <DragPreview {...preview} />}
      </div>
    );
  };

  // Même largeur minimale pour l'en-tête et la grille : sur téléphone, cinq barbers défilent
  // horizontalement ensemble, et l'heure reste collée à gauche
  const rowStyle = { minWidth: LABEL_WIDTH + columns.length * MIN_COLUMN };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[calc(100dvh-220px)] min-h-[420px]">
      <div ref={scrollRef} data-scroll-container className="overflow-auto flex-1 overscroll-contain">
        {multi && (
          <div className="flex border-b border-border sticky top-0 z-30 bg-card" style={rowStyle}>
            <div className="w-12 shrink-0 sticky left-0 bg-card z-10" />
            {columns.map(({ key, emp, apts }) => {
              const count = apts.filter((a) => !isBreak(a) && !isLastMinuteSlot(a) && a.status !== 'cancelled').length;
              const clickable = emp.id !== 'other' && !!onFocusBarber;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onFocusBarber(emp.id)}
                  title={clickable ? `Afficher seulement ${emp.name}` : undefined}
                  className="flex-1 basis-0 min-w-0 text-center py-2 border-l border-foreground/15 hover:bg-foreground/5 transition-colors disabled:hover:bg-transparent"
                >
                  <span className="flex items-center justify-center gap-1.5 min-w-0 px-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: emp.color || '#3fcf8e' }} />
                    <span className="text-xs font-semibold truncate">{emp.name}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {emp.id !== 'other' && isOnLeave(timeOffs, emp.id, date)
                      ? <span className="text-red-500 font-semibold">Congé</span>
                      : emp.id !== 'other' && workingWindow(emp, date) === null && count === 0 ? 'Repos' : `${count} rdv`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex" style={{ ...rowStyle, minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
          <div className="w-12 shrink-0 relative sticky left-0 z-20 bg-card">
            {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
              <div key={i} className="absolute w-full" style={{ top: i * HOUR_HEIGHT }}>
                <span className="text-[10px] text-muted-foreground absolute top-0.5 right-1.5 font-mono select-none">
                  {String(START_HOUR + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
          {columns.length > 0 ? columns.map(renderColumn) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Aucun barber actif</div>
          )}
        </div>
      </div>
    </div>
  );
}
