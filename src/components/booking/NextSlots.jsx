/**
 * « Prochaines disponibilités » (écran Créneau) : les premiers créneaux libres, deux par jour au
 * plus, choisis en un tap (jour, heure et barber d'un coup). Carrousel animé (`SnapCarousel` de
 * l'accueil) : défilement automatique, cartes voisines réduites, reflet qui passe ; en pause dès
 * que le client le touche, hors de l'écran ou avec le mouvement réduit. Rien sans créneau.
 */
import React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Zap } from 'lucide-react';
import SnapCarousel from '@/components/motion/SnapCarousel';

const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Défilement automatique du carrousel (ms). */
const AUTOPLAY_MS = 3200;

export default function NextSlots({ items = [], loading = false, todayKey, tomorrowKey, selectedKey, selectedTime, showBarber = true, onSelect }) {
  if (!loading && items.length === 0) return null;

  const dayLabel = (item) => {
    if (item.key === todayKey) return 'Aujourd\'hui';
    if (item.key === tomorrowKey) return 'Demain';
    return upperFirst(format(item.date, 'EEE d MMM', { locale: fr }));
  };

  return (
    <section aria-labelledby="next-slots-title">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 id="next-slots-title" className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <Zap className="w-4 h-4 text-amber-400 float-soft" aria-hidden="true" />
          Prochaines disponibilités
        </h2>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="live-dot text-primary" aria-hidden="true" />
          en direct
        </span>
      </div>
      {loading ? (
        <div className="flex gap-3 overflow-hidden -mx-4 px-4 py-2" aria-busy="true" aria-label="Recherche des prochaines disponibilités">
          {[0, 1, 2].map(i => <div key={i} aria-hidden="true" className="w-[42%] h-[78px] shrink-0 rounded-[14px] bg-card border border-border animate-pulse" />)}
        </div>
      ) : (
        <SnapCarousel itemWidth="42%" gap={10} autoplay={AUTOPLAY_MS} label="Créneaux proposés">
          {items.map((item, i) => {
            const active = item.key === selectedKey && item.time === selectedTime;
            return (
              <button
                key={`${item.key}-${item.time}`}
                type="button"
                onClick={() => onSelect(item)}
                aria-pressed={active}
                aria-label={`${dayLabel(item)} à ${item.time}${showBarber && item.employee ? ` avec ${item.employee.name}` : ''}`}
                className={`shine-sweep ${i % 3 === 1 ? 'shine-delay-1' : i % 3 === 2 ? 'shine-delay-2' : ''} w-full min-h-[78px] rounded-[14px] border px-3 py-2.5 text-left transition-colors duration-300 ${
                  active ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25' : 'border-border bg-card text-foreground hover:border-primary/40'
                }`}
              >
                <span className={`block text-[11px] truncate ${active ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>{dayLabel(item)}</span>
                <span className="block text-xl font-bold leading-tight tabular-nums mt-0.5">{item.time}</span>
                {showBarber && item.employee && (
                  <span className={`block text-[11px] truncate ${active ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>avec {item.employee.name}</span>
                )}
              </button>
            );
          })}
        </SnapCarousel>
      )}
    </section>
  );
}
