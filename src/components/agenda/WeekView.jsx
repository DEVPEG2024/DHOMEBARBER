import React, { useRef, useEffect, useState, useCallback } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, X, AlertTriangle, Coffee, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AppointmentDetailModal from './AppointmentDetailModal';

const HOUR_HEIGHT = 72;
const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const SNAP_GRID = 5;
const DRAG_THRESHOLD = 4;

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function snapToGrid(minutes) {
  return Math.round(minutes / SNAP_GRID) * SNAP_GRID;
}

function yToMinutes(clientY, colElement) {
  const scrollContainer = colElement.closest('[data-scroll-container]');
  const scrollRect = scrollContainer.getBoundingClientRect();
  const scrollTop = scrollContainer.scrollTop;
  const relY = clientY - scrollRect.top + scrollTop;
  return snapToGrid(START_HOUR * 60 + (relY / HOUR_HEIGHT) * 60);
}

function clampMinutes(m) {
  return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, m));
}

function computeColumns(apts) {
  const sorted = [...apts].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  const columns = [];
  const aptMeta = {};

  for (const apt of sorted) {
    const start = timeToMinutes(apt.start_time);
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const lastEnd = timeToMinutes(columns[col][columns[col].length - 1].end_time);
      if (start >= lastEnd) {
        columns[col].push(apt);
        aptMeta[apt.id] = { col, totalCols: 1 };
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([apt]);
      aptMeta[apt.id] = { col: columns.length - 1, totalCols: 1 };
    }
  }

  for (const apt of sorted) {
    const start = timeToMinutes(apt.start_time);
    const end = timeToMinutes(apt.end_time);
    let maxCol = aptMeta[apt.id].col;
    for (const other of sorted) {
      if (other.id === apt.id) continue;
      const oStart = timeToMinutes(other.start_time);
      const oEnd = timeToMinutes(other.end_time);
      if (oStart < end && oEnd > start) {
        maxCol = Math.max(maxCol, aptMeta[other.id].col);
      }
    }
    aptMeta[apt.id].totalCols = maxCol + 1;
  }

  return aptMeta;
}

function BreakBlock({ apt, onClick }) {
  const startMin = timeToMinutes(apt.start_time) - START_HOUR * 60;
  const endMin = timeToMinutes(apt.end_time) - START_HOUR * 60;
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 28);

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(apt); }}
      className="absolute rounded-lg overflow-hidden cursor-pointer group transition-all hover:z-30 hover:shadow-xl hover:ring-2 hover:ring-slate-400/40"
      style={{
        top, height,
        background: 'repeating-linear-gradient(135deg, rgba(148,163,184,0.15), rgba(148,163,184,0.15) 4px, rgba(148,163,184,0.08) 4px, rgba(148,163,184,0.08) 8px)',
        borderLeft: '3px solid #94a3b8',
        zIndex: 8,
      }}
    >
      <div className="px-2 py-1 flex items-center gap-1">
        <Coffee className="w-3 h-3 text-slate-400 shrink-0" />
        <p className="text-[10px] font-bold text-slate-400 truncate">{apt.start_time} - {apt.end_time}</p>
      </div>
      {height > 36 && <p className="text-[9px] text-slate-400 px-2">Pause</p>}
    </div>
  );
}

function AppointmentBlock({ apt, empColor, onStatusChange, onClick }) {
  const startMin = timeToMinutes(apt.start_time) - START_HOUR * 60;
  const endMin = timeToMinutes(apt.end_time) - START_HOUR * 60;
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 32);

  const isLight = apt.status === 'cancelled' || apt.status === 'no_show';
  const borderColor = apt.status === 'cancelled' ? '#f87171' : apt.status === 'pending' ? '#facc15' : empColor;

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(apt); }}
      className="absolute rounded-lg overflow-hidden cursor-pointer group transition-all hover:z-30 hover:shadow-xl flex items-center gap-1.5 px-2"
      style={{
        top, height: Math.min(height, 32),
        borderLeft: `3px solid ${borderColor}`,
        background: `${empColor}15`,
        opacity: isLight ? 0.5 : 1,
        zIndex: 10,
        backdropFilter: 'blur(4px)',
      }}
    >
      <span className="text-[9px] font-bold shrink-0" style={{ color: borderColor }}>{apt.start_time}</span>
      <span className="text-[10px] font-semibold text-foreground truncate">{apt.client_name}</span>
    </div>
  );
}

function DragPreview({ startMin, endMin }) {
  const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 16);

  return (
    <div
      className="absolute left-1 right-1 rounded-lg border-2 border-dashed border-slate-400 pointer-events-none"
      style={{ top, height, background: 'rgba(148,163,184,0.15)', zIndex: 30 }}
    >
      <div className="flex items-center gap-1 px-2 py-1">
        <Coffee className="w-3 h-3 text-slate-400" />
        <p className="text-[10px] font-bold text-slate-400">
          {minutesToTime(startMin)} - {minutesToTime(endMin)}
        </p>
      </div>
    </div>
  );
}

export default function WeekView({ currentDate, appointments, employees, onStatusChange, onCreateBreak, onDeleteBreak, onBreakClick, employeeFilter }) {
  const scrollRef = useRef();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const dragStartPos = useRef(null);
  const hasDragged = useRef(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT;
  }, []);

  const getEmpColor = (empId) => employees.find(e => e.id === empId)?.color || '#3fcf8e';

  const handleMouseDown = useCallback((e, dateStr, colElement) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-block]')) return;

    const minutes = clampMinutes(yToMinutes(e.clientY, colElement));

    dragStartPos.current = { x: e.clientX, y: e.clientY };
    hasDragged.current = false;

    const handleMouseMove = (ev) => {
      const dx = ev.clientX - dragStartPos.current.x;
      const dy = ev.clientY - dragStartPos.current.y;

      if (!hasDragged.current && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      hasDragged.current = true;

      const m = clampMinutes(yToMinutes(ev.clientY, colElement));
      setDragging({ startMin: minutes, currentMin: m, dateStr });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const didDrag = hasDragged.current;
      dragStartPos.current = null;
      hasDragged.current = false;

      setDragging(prev => {
        if (prev && didDrag) {
          const s = Math.min(prev.startMin, prev.currentMin);
          const end = Math.max(prev.startMin, prev.currentMin);
          if (end - s >= 10 && onCreateBreak) {
            setTimeout(() => onCreateBreak({
              start_time: minutesToTime(s),
              end_time: minutesToTime(end),
              date: prev.dateStr,
              employee_id: employeeFilter !== 'all' ? employeeFilter : null,
            }), 0);
          }
        }
        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onCreateBreak]);

  return (
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col"
        style={{ height: 'calc(100vh - 200px)' }}>
        {/* Day headers */}
        <div className="flex border-b border-border shrink-0">
          <div className="w-14 shrink-0 border-r border-border/30" />
          {days.map(day => {
            const isToday = isSameDay(day, new Date());
            const count = appointments.filter(a => a.date === format(day, 'yyyy-MM-dd') && a.status !== 'break').length;
            return (
              <div key={day.toISOString()} className={`flex-1 text-center py-3 border-l border-border/30 ${isToday ? 'bg-primary/5' : ''}`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                  {format(day, 'EEE', { locale: fr })}
                </p>
                <p className={`text-xl font-bold leading-snug ${isToday ? 'text-primary' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </p>
                {count > 0 ? (
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold inline-block mt-0.5 ${isToday ? 'bg-primary/25 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                    {count}
                  </span>
                ) : <div className="h-4 mt-0.5" />}
              </div>
            );
          })}
        </div>

        {/* Scrollable grid */}
        <div ref={scrollRef} data-scroll-container className="overflow-y-auto flex-1 overflow-x-hidden">
          <div className="flex" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
            {/* Hour labels */}
            <div className="w-14 shrink-0 relative border-r border-border/20">
              {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                <div key={i} className="absolute w-full" style={{ top: i * HOUR_HEIGHT }}>
                  <span className="text-[10px] text-muted-foreground/60 absolute -top-2.5 right-2 font-mono select-none">
                    {String(START_HOUR + i).padStart(2, '0')}h
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayApts = appointments.filter(a => a.date === dateStr && a.status !== 'break');
              const dayBreaks = appointments.filter(a => a.date === dateStr && a.status === 'break');
              const isToday = isSameDay(day, new Date());
              const aptMeta = computeColumns(dayApts);

              return (
                <div
                  key={dateStr}
                  className={`flex-1 relative border-l border-border/20 select-none cursor-crosshair ${isToday ? 'bg-primary/[0.02]' : ''}`}
                  style={{ minWidth: 0 }}
                  onMouseDown={e => handleMouseDown(e, dateStr, e.currentTarget)}
                >
                  {/* Hour lines + half-hour lines */}
                  {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                    <div key={i} className="absolute w-full border-t border-foreground/20" style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                      <div className="absolute w-full border-t border-foreground/10" style={{ top: HOUR_HEIGHT / 2 }} />
                    </div>
                  ))}

                  {/* Break blocks */}
                  {dayBreaks.map(apt => (
                    <div key={apt.id} data-block className="absolute left-1 right-1" style={{ top: 0, bottom: 0, pointerEvents: 'auto' }}>
                      <BreakBlock apt={apt} onClick={onBreakClick} />
                    </div>
                  ))}

                  {/* Appointment blocks */}
                  {dayApts.map(apt => {
                    const meta = aptMeta[apt.id] || { col: 0, totalCols: 1 };
                    const colWidth = 100 / meta.totalCols;
                    const left = `calc(${meta.col * colWidth}% + 2px)`;
                    const width = `calc(${colWidth}% - 4px)`;
                    const empColor = getEmpColor(apt.employee_id);
                    return (
                      <div key={apt.id} data-block className="absolute" style={{ left, width, top: 0, bottom: 0, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
                          <AppointmentBlock apt={apt} empColor={empColor} onStatusChange={onStatusChange} onClick={setSelected} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Drag preview */}
                  {dragging && dragging.dateStr === dateStr && (() => {
                    const s = Math.min(dragging.startMin, dragging.currentMin);
                    const end = Math.max(dragging.startMin, dragging.currentMin);
                    if (end - s < 5) return null;
                    return <DragPreview startMin={s} endMin={end} />;
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AppointmentDetailModal appointment={selected} onClose={() => setSelected(null)} onUpdate={() => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['agendaAppointments'] });
        queryClient.invalidateQueries({ queryKey: ['adminAppointments'] });
        setSelected(null);
      }} />
    </>
  );
}
