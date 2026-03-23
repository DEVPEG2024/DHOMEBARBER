import React, { useRef, useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Check, X, AlertTriangle, Coffee, Trash2 } from 'lucide-react';
import { getServiceColor } from '@/utils/serviceColors';
import { useQueryClient } from '@tanstack/react-query';
import AppointmentDetailModal from './AppointmentDetailModal';

const HOUR_HEIGHT = 64;
const START_HOUR = 7;
const END_HOUR = 21;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const SNAP_GRID = 5; // snap every 5 minutes for better precision
const DRAG_THRESHOLD = 4; // pixels before starting drag

const statusStyle = {
  pending: { border: '#facc15', bg: 'rgba(234,179,8,0.18)' },
  confirmed: { border: '#4ade80', bg: 'rgba(74,222,128,0.18)' },
  completed: { border: '#3fcf8e', bg: 'rgba(63,207,142,0.20)' },
  cancelled: { border: '#f87171', bg: 'rgba(248,113,113,0.15)', opacity: 0.6 },
  no_show: { border: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  break: { border: '#94a3b8', bg: 'rgba(148,163,184,0.25)' },
};

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
  // colElement is inside the scroll container, so its getBoundingClientRect
  // already reflects scroll position. We need the position relative to the
  // top of the grid (the full scrollable area), not the viewport.
  const scrollContainer = colElement.closest('[data-scroll-container]');
  const scrollRect = scrollContainer.getBoundingClientRect();
  const scrollTop = scrollContainer.scrollTop;
  // clientY relative to the visible top of the scroll container + scrollTop
  // gives us the position in the full grid
  const relY = clientY - scrollRect.top + scrollTop;
  return snapToGrid(START_HOUR * 60 + (relY / HOUR_HEIGHT) * 60);
}

function clampMinutes(m) {
  return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, m));
}

function BreakBlock({ apt, onClick }) {
  const startMin = timeToMinutes(apt.start_time) - START_HOUR * 60;
  const endMin = timeToMinutes(apt.end_time) - START_HOUR * 60;
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 28);

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(apt); }}
      className="absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden cursor-pointer group transition-all hover:z-20 hover:shadow-lg hover:ring-2 hover:ring-slate-400/40"
      style={{
        top, height,
        background: 'repeating-linear-gradient(135deg, rgba(148,163,184,0.15), rgba(148,163,184,0.15) 4px, rgba(148,163,184,0.08) 4px, rgba(148,163,184,0.08) 8px)',
        borderLeft: '4px solid #94a3b8',
        zIndex: 8,
      }}
    >
      <div className="flex items-center gap-1">
        <Coffee className="w-3 h-3 text-slate-400" />
        <p className="text-[10px] font-bold text-slate-400">{apt.start_time} - {apt.end_time}</p>
      </div>
      {height > 32 && <p className="text-[10px] text-slate-400 font-medium">Pause</p>}
    </div>
  );
}

function AppointmentBlock({ apt, onStatusChange, employeeColor, onClick }) {
  const startMin = timeToMinutes(apt.start_time) - START_HOUR * 60;
  const endMin = timeToMinutes(apt.end_time) - START_HOUR * 60;
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 36);
  const style = statusStyle[apt.status] || statusStyle.confirmed;

  const accentColor = apt.services?.[0]?.service_id
    ? getServiceColor(apt.services[0].service_id)
    : (employeeColor || '#3fcf8e');

  // Non clôturé = confirmé sans paiement
  const needsClose = apt.status === 'confirmed' && !apt.payment_method;

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(apt); }}
      className={`absolute left-1 right-1 rounded-lg overflow-hidden cursor-pointer group transition-all hover:z-20 hover:shadow-lg hover:brightness-110 flex items-center gap-2 px-2.5 ${needsClose ? 'ring-2 ring-yellow-400/60 animate-pulse' : ''}`}
      style={{
        top, height: Math.min(height, 36),
        background: style.bg,
        borderLeft: `4px solid ${accentColor}`,
        opacity: style.opacity || 1,
        zIndex: needsClose ? 15 : 10,
      }}
    >
      <span className="text-[10px] font-bold shrink-0" style={{ color: accentColor }}>{apt.start_time}</span>
      <span className="text-xs font-semibold text-foreground truncate">{apt.client_name}</span>
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

export default function DayView({ appointments, employees, employeeFilter, onStatusChange, date, onCreateBreak, onDeleteBreak, onBreakClick }) {
  const scrollRef = useRef();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const dragStartPos = useRef(null);
  const hasDragged = useRef(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT;
  }, []);

  const filtered = employeeFilter === 'all'
    ? appointments
    : appointments.filter(a => a.employee_id === employeeFilter);

  const cols = employeeFilter === 'all'
    ? employees.filter(e => appointments.some(a => a.employee_id === e.id) || e.is_active)
    : employees.filter(e => e.id === employeeFilter);

  const showCols = cols.length > 1;

  const handleMouseDown = useCallback((e, colEmpId, colElement) => {
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
      setDragging({ startMin: minutes, currentMin: m, colEmpId });
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
              employee_id: prev.colEmpId,
            }), 0);
          }
        }
        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onCreateBreak]);

  const renderDragPreview = (colEmpId) => {
    if (!dragging || dragging.colEmpId !== colEmpId) return null;
    const s = Math.min(dragging.startMin, dragging.currentMin);
    const e = Math.max(dragging.startMin, dragging.currentMin);
    if (e - s < 5) return null;
    return <DragPreview startMin={s} endMin={e} />;
  };

  const renderColumn = (empId, empColor, columnApts) => (
    <>
      {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
        <div key={i} className="absolute w-full border-t border-foreground/20" style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
          {/* Half-hour line */}
          <div className="absolute w-full border-t border-foreground/10" style={{ top: HOUR_HEIGHT / 2 }} />
        </div>
      ))}

      {columnApts.map(apt =>
        apt.status === 'break' ? (
          <div key={apt.id} data-block>
            <BreakBlock apt={apt} onClick={onBreakClick} />
          </div>
        ) : (
          <div key={apt.id} data-block>
            <AppointmentBlock apt={apt} onStatusChange={onStatusChange} employeeColor={empColor} onClick={setSelected} />
          </div>
        )
      )}

      {renderDragPreview(empId)}
    </>
  );

  return (
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
        {showCols && (
          <div className="flex border-b border-border">
            <div className="w-14 shrink-0" />
            {cols.map(emp => (
              <div key={emp.id} className="flex-1 text-center py-2 border-l border-foreground/15">
                <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ background: emp.color || '#3fcf8e' }} />
                <p className="text-xs font-semibold">{emp.name}</p>
              </div>
            ))}
          </div>
        )}

        <div ref={scrollRef} data-scroll-container className="overflow-y-auto flex-1">
          <div className="flex" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
            <div className="w-14 shrink-0 relative">
              {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                <div key={i} className="absolute w-full" style={{ top: i * HOUR_HEIGHT }}>
                  <span className="text-[10px] text-muted-foreground absolute -top-2 right-2">
                    {String(START_HOUR + i).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {showCols ? cols.map(emp => (
              <div
                key={emp.id}
                className="flex-1 relative border-l border-foreground/15 select-none cursor-crosshair"
                onMouseDown={e => handleMouseDown(e, emp.id, e.currentTarget)}
              >
                {renderColumn(emp.id, emp.color, appointments.filter(a => a.employee_id === emp.id))}
              </div>
            )) : (
              <div
                className="flex-1 relative border-l border-foreground/15 select-none cursor-crosshair"
                onMouseDown={e => handleMouseDown(e, employeeFilter, e.currentTarget)}
              >
                {renderColumn(employeeFilter, cols[0]?.color, filtered)}
              </div>
            )}
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
