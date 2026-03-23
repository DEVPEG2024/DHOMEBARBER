import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, isSameDay, isSameMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

const statusDot = {
  pending: 'bg-yellow-400',
  confirmed: 'bg-green-400',
  completed: 'bg-primary',
  cancelled: 'bg-red-400 opacity-50',
  no_show: 'bg-red-600',
};

export default function MonthView({ currentDate, appointments, employees, onDayClick }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });

  const days = [];
  let d = gridStart;
  while (d <= monthEnd || days.length % 7 !== 0) {
    days.push(d);
    d = addDays(d, 1);
    if (days.length > 42) break;
  }

  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const getEmpColor = (empId) => employees.find(e => e.id === empId)?.color;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {dayNames.map(n => (
          <div key={n} className="text-center py-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{n}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayApts = appointments.filter(a => a.date === dateStr);
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, currentDate);

          return (
            <div
              key={idx}
              onClick={() => onDayClick && onDayClick(day)}
              className={`min-h-[90px] p-1.5 border-t border-r border-border cursor-pointer hover:bg-white/3 transition-colors ${!inMonth ? 'opacity-30' : ''} ${isToday ? 'bg-primary/5' : ''}`}
            >
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayApts.slice(0, 3).map(apt => (
                  <div
                    key={apt.id}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 ${statusDot[apt.status] ? '' : ''}`}
                    style={{ background: (getEmpColor(apt.employee_id) || '#3fcf8e') + '22' }}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[apt.status] || 'bg-primary'}`} />
                    <span className="text-[9px] text-foreground truncate">{apt.start_time} {apt.client_name}</span>
                  </div>
                ))}
                {dayApts.length > 3 && (
                  <p className="text-[9px] text-muted-foreground pl-1">+{dayApts.length - 3} autres</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}