import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Coffee, Trash2, Repeat, Calendar } from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';

const DAYS_OF_WEEK = [
  { key: 1, label: 'Lun' },
  { key: 2, label: 'Mar' },
  { key: 3, label: 'Mer' },
  { key: 4, label: 'Jeu' },
  { key: 5, label: 'Ven' },
  { key: 6, label: 'Sam' },
  { key: 0, label: 'Dim' },
];

export default function BreakModal({ breakItem, employees, onClose, onDelete, onApplyRecurrence }) {
  const [recurrenceMode, setRecurrenceMode] = useState('none'); // none, daily, weekly, custom
  const [selectedDays, setSelectedDays] = useState(() => {
    if (!breakItem?.date) return [1, 2, 3, 4, 5, 6]; // Lun-Sam par défaut
    const d = new Date(breakItem.date + 'T00:00:00');
    return [d.getDay()];
  });
  const [weeksCount, setWeeksCount] = useState(4);
  const [applying, setApplying] = useState(false);

  if (!breakItem) return null;

  const empName = employees?.find(e => e.id === breakItem.employee_id)?.name || 'Salon';

  const toggleDay = (dayKey) => {
    setSelectedDays(prev =>
      prev.includes(dayKey) ? prev.filter(d => d !== dayKey) : [...prev, dayKey]
    );
  };

  const handleApply = async () => {
    if (!onApplyRecurrence) return;
    setApplying(true);

    const dates = [];
    const baseDate = new Date(breakItem.date + 'T00:00:00');

    if (recurrenceMode === 'daily') {
      // Every day for N weeks
      for (let w = 0; w < weeksCount; w++) {
        for (let d = 0; d < 7; d++) {
          const date = addDays(addWeeks(startOfWeek(baseDate, { weekStartsOn: 1 }), w), d);
          if (date > baseDate) dates.push(format(date, 'yyyy-MM-dd'));
        }
      }
    } else if (recurrenceMode === 'weekly') {
      // Same day of week for N weeks
      for (let w = 1; w <= weeksCount; w++) {
        dates.push(format(addWeeks(baseDate, w), 'yyyy-MM-dd'));
      }
    } else if (recurrenceMode === 'custom') {
      // Selected days for N weeks
      for (let w = 0; w < weeksCount; w++) {
        const weekStart = addWeeks(startOfWeek(baseDate, { weekStartsOn: 1 }), w);
        for (const dayKey of selectedDays) {
          const offset = dayKey === 0 ? 6 : dayKey - 1; // Convert to Monday-based offset
          const date = addDays(weekStart, offset);
          const dateStr = format(date, 'yyyy-MM-dd');
          if (dateStr > breakItem.date) dates.push(dateStr);
        }
      }
    }

    await onApplyRecurrence({
      start_time: breakItem.start_time,
      end_time: breakItem.end_time,
      employee_id: breakItem.employee_id,
      dates,
    });

    setApplying(false);
    onClose();
  };

  return (
    <Dialog open={!!breakItem} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-slate-400" />
            Pause
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Break info */}
          <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">
                {breakItem.date && format(new Date(breakItem.date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}
              </span>
            </div>
            <p className="text-lg font-bold">{breakItem.start_time} - {breakItem.end_time}</p>
            <p className="text-sm text-muted-foreground">{empName}</p>
          </div>

          {/* Recurrence section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Repeat className="w-4 h-4" />
              Récurrence
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'none', label: 'Aucune' },
                { value: 'daily', label: 'Tous les jours' },
                { value: 'weekly', label: 'Chaque semaine' },
                { value: 'custom', label: 'Jours personnalisés' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRecurrenceMode(opt.value)}
                  className={`px-3 py-2 text-xs rounded-lg border transition-all text-center ${
                    recurrenceMode === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Custom days selector */}
            {recurrenceMode === 'custom' && (
              <div className="flex gap-1.5 justify-center">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.key}
                    onClick={() => toggleDay(day.key)}
                    className={`w-10 h-10 rounded-full text-xs font-semibold transition-all ${
                      selectedDays.includes(day.key)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            )}

            {/* Weeks count */}
            {recurrenceMode !== 'none' && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Pendant</span>
                <div className="flex items-center gap-1">
                  {[2, 4, 8, 12].map(w => (
                    <button
                      key={w}
                      onClick={() => setWeeksCount(w)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                        weeksCount === w
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {w} sem
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <button
            onClick={() => { onDelete(breakItem.id); onClose(); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer
          </button>

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-all"
          >
            Fermer
          </button>

          {recurrenceMode !== 'none' && (
            <button
              onClick={handleApply}
              disabled={applying || (recurrenceMode === 'custom' && selectedDays.length === 0)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              <Repeat className="w-3.5 h-3.5" />
              {applying ? 'Application...' : 'Appliquer la récurrence'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
