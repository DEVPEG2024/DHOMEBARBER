import React, { useRef } from 'react';
import { format, addDays, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, CalendarDays, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseDateParam, toDateStr } from './agendaUtils';

const VIEWS = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

function titleFor(view, date) {
  if (view === 'day') return format(date, 'EEEE d MMMM yyyy', { locale: fr });
  if (view === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    return `${format(start, sameMonth ? 'd' : 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`;
  }
  return format(date, 'MMMM yyyy', { locale: fr });
}

/**
 * Navigation de l'agenda : précédent / suivant, titre qui ouvre un sélecteur de date
 * (sauter directement à n'importe quel jour), Aujourd'hui, Jour / Semaine / Mois, export CSV.
 */
export default function AgendaToolbar({ view, onViewChange, currentDate, onDateChange, onStep, onExport, loading }) {
  const pickerRef = useRef(null);
  const isCurrent = toDateStr(currentDate) === toDateStr(new Date());

  const openPicker = () => {
    const input = pickerRef.current;
    if (!input) return;
    try { input.showPicker(); } catch { input.focus(); input.click(); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="hidden lg:block mr-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">Planning</p>
        <h1 className="font-display text-xl font-bold leading-tight">Agenda</h1>
      </div>

      <div className="flex items-center gap-0.5 bg-card border border-border rounded-xl px-1 py-1 w-full sm:w-auto order-1">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onStep(-1)} aria-label="Période précédente">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <button
          type="button"
          onClick={openPicker}
          className="relative flex-1 sm:flex-none sm:min-w-[210px] flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold capitalize hover:bg-foreground/5 transition-colors"
          title="Choisir une date"
        >
          <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">{titleFor(view, currentDate)}</span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" aria-label="Chargement" />}
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            value={toDateStr(currentDate)}
            onChange={(e) => {
              const d = parseDateParam(e.target.value);
              if (d) onDateChange(d);
            }}
            className="absolute inset-0 opacity-0 pointer-events-none"
          />
        </button>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onStep(1)} aria-label="Période suivante">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 order-2 flex-1 sm:flex-none">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs border-border"
          disabled={isCurrent}
          onClick={() => onDateChange(new Date())}
        >
          Aujourd'hui
        </Button>
        <div className="flex bg-secondary rounded-lg p-0.5 flex-1 sm:flex-none">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => onViewChange(v.value)}
              className={`flex-1 sm:flex-none px-3 py-1 text-xs rounded-md transition-all ${view === v.value ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="h-8 border-border gap-1.5 px-2.5" onClick={onExport} aria-label="Exporter en CSV">
          <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CSV</span>
        </Button>
      </div>
    </div>
  );
}
