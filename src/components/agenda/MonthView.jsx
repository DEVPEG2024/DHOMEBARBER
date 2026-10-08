import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth } from 'date-fns';
import { Euro } from 'lucide-react';
import { isBreak, isCancelledLike, needsClosing, toDateStr } from './agendaUtils';

const statusDot = {
  pending: 'bg-yellow-400',
  confirmed: 'bg-green-400',
  completed: 'bg-primary',
  cancelled: 'bg-red-400 opacity-50',
  no_show: 'bg-red-600',
  last_minute: 'bg-orange-400',
};

const MAX_LINES = 3;

export default function MonthView({ currentDate, appointments, employees, onDayClick, onSelect }) {
  const gridStart = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const colorOf = (empId) => employees.find((e) => String(e.id) === String(empId))?.color || '#94a3b8';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {dayNames.map((n) => (
          <div key={n} className="text-center py-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{n}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dateStr = toDateStr(day);
          const dayApts = appointments.filter((a) => a.date === dateStr && !isBreak(a));
          const active = dayApts.filter((a) => !isCancelledLike(a)).length;
          const toClose = dayApts.filter((a) => needsClosing(a)).length;
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, currentDate);

          return (
            <div
              key={dateStr}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(day)}
              onKeyDown={(e) => { if (e.key === 'Enter') onDayClick(day); }}
              title="Ouvrir la journée"
              className={`min-h-[76px] sm:min-h-[96px] p-1 border-t border-r border-border cursor-pointer hover:bg-foreground/[0.04] transition-colors min-w-0 ${!inMonth ? 'opacity-35' : ''} ${isToday ? 'bg-primary/5' : ''}`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </span>
                <span className="flex items-center gap-0.5">
                  {toClose > 0 && (
                    <span className="w-3.5 h-3.5 rounded-full bg-amber-400 text-black flex items-center justify-center" title={`${toClose} à encaisser`}>
                      <Euro className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {active > 0 && <span className="text-[9px] font-semibold text-muted-foreground sm:hidden">{active}</span>}
                </span>
              </div>
              {/* Sur téléphone, le nombre suffit ; à partir de la tablette, les premiers rendez-vous s'ouvrent d'un tap */}
              <div className="space-y-0.5 hidden sm:block">
                {dayApts.slice(0, MAX_LINES).map((apt) => (
                  <button
                    key={apt.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelect(apt); }}
                    className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left hover:brightness-125"
                    style={{ background: `${colorOf(apt.employee_id)}26` }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[apt.status] || 'bg-primary'}`} />
                    <span className={`text-[10px] text-foreground truncate ${isCancelledLike(apt) ? 'line-through opacity-60' : ''}`}>
                      {apt.start_time} {apt.client_name}
                    </span>
                  </button>
                ))}
                {dayApts.length > MAX_LINES && (
                  <p className="text-[10px] text-muted-foreground pl-1">+{dayApts.length - MAX_LINES} autres</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
