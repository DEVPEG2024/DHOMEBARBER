import React from 'react';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AgendaToolbar({ view, setView, currentDate, setCurrentDate, onExport }) {
  const navigate = (dir) => {
    if (view === 'day') setCurrentDate(d => dir > 0 ? addDays(d, 1) : subDays(d, 1));
    else if (view === 'week') setCurrentDate(d => dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1));
    else setCurrentDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1));
  };

  const getTitle = () => {
    if (view === 'day') return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
    if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = addDays(start, 6);
      return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`;
    }
    return format(currentDate, 'MMMM yyyy', { locale: fr });
  };

  return (
    <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium hidden sm:block">Planning</p>
        <h1 className="font-display text-xl font-bold hidden sm:block">Agenda</h1>
      </div>

      <div className="flex items-center gap-1 bg-card border border-border rounded-xl px-3 py-1.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold px-2 min-w-[180px] text-center capitalize">{getTitle()}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setCurrentDate(new Date())}>
          Aujourd'hui
        </Button>
        <div className="flex bg-secondary rounded-lg p-0.5">
          {['day', 'week', 'month'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${view === v ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="border-border gap-1.5" onClick={onExport}>
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </div>
    </div>
  );
}