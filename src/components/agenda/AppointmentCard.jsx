import React, { useEffect, useState } from 'react';
import { Coffee, Zap, Check, X, UserX, Euro } from 'lucide-react';
import { needsClosing, isCancelledLike, START_HOUR, END_HOUR, STATUS_META, minutesToTime } from './agendaUtils';

const activate = (fn) => ({
  role: 'button',
  tabIndex: 0,
  onClick: (e) => { e.stopPropagation(); fn(); },
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  },
});

// Appui long au doigt = déplacer la carte : pas de bulle « Copier / Rechercher » d'iOS
const NO_CALLOUT = { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' };

function describe(apt) {
  const services = apt.services?.map((s) => s.name).filter(Boolean).join(' + ');
  return [
    `${apt.start_time}${apt.end_time ? ` – ${apt.end_time}` : ''}`,
    apt.client_name,
    services,
    apt.employee_name,
    STATUS_META[apt.status]?.label,
  ].filter(Boolean).join(' · ');
}

/**
 * Carte d'un rendez-vous dans les grilles Jour / Semaine. La hauteur suit la durée ; le contenu
 * se déploie avec la place disponible (heure + client, puis prestations, puis barber).
 */
export function AppointmentCard({ apt, style, color, showBarber = false, dense = false, onSelect, dragProps, ghosted = false }) {
  const height = style.height || 0;
  const cancelled = isCancelledLike(apt);
  const toClose = needsClosing(apt);
  const services = apt.services?.map((s) => s.name).filter(Boolean).join(' + ');
  const accent = apt.status === 'pending' ? '#facc15' : cancelled ? '#f87171' : color;
  const twoLines = height >= (dense ? 40 : 36);
  const threeLines = height >= (dense ? 58 : 52);

  return (
    <div
      data-block
      {...activate(() => onSelect(apt))}
      {...dragProps}
      title={describe(apt)}
      className={`absolute rounded-md overflow-hidden ${dragProps?.onMouseDown ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} transition-[filter,box-shadow,opacity] hover:brightness-110 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${toClose ? 'ring-1 ring-amber-400/80' : ''}`}
      style={{
        ...style,
        ...NO_CALLOUT,
        borderLeft: `3px solid ${accent}`,
        // Teinte posée sur le fond de la carte : opaque, une pause recouverte ne transparaît pas
        background: cancelled
          ? `repeating-linear-gradient(135deg, ${accent}1a, ${accent}1a 4px, transparent 4px, transparent 8px), hsl(var(--card))`
          : `linear-gradient(${color}38, ${color}38), hsl(var(--card))`,
        opacity: ghosted ? 0.3 : cancelled ? 0.55 : 1,
        zIndex: toClose ? 12 : 10,
      }}
    >
      <div className={`h-full ${dense ? 'px-1 py-0.5' : 'px-1.5 py-1'} flex flex-col min-w-0`}>
        <div className="flex items-center gap-1 min-w-0">
          <span className={`${dense ? 'text-[9px]' : 'text-[10px]'} font-bold tabular-nums shrink-0`} style={{ color: accent }}>
            {apt.start_time}
          </span>
          <span className={`${dense ? 'text-[10px]' : 'text-xs'} font-semibold text-foreground truncate ${cancelled ? 'line-through' : ''}`}>
            {apt.client_name || 'Client'}
          </span>
          <span className="ml-auto shrink-0 flex items-center">
            {apt.status === 'completed' && apt.payment_method && <Check className="w-3 h-3 text-primary" />}
            {apt.status === 'cancelled' && <X className="w-3 h-3 text-red-400" />}
            {apt.status === 'no_show' && <UserX className="w-3 h-3 text-red-400" />}
            {toClose && (
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400 text-black flex items-center justify-center" aria-label="À encaisser">
                <Euro className="w-2.5 h-2.5" />
              </span>
            )}
          </span>
        </div>
        {twoLines && services && (
          <p className={`${dense ? 'text-[9px]' : 'text-[10px]'} text-muted-foreground truncate leading-tight mt-0.5`}>{services}</p>
        )}
        {threeLines && (showBarber || toClose) && (
          <p className={`${dense ? 'text-[9px]' : 'text-[10px]'} truncate leading-tight mt-0.5 flex items-center gap-1`}>
            {showBarber && apt.employee_name && (
              <>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-muted-foreground truncate">{apt.employee_name}</span>
              </>
            )}
            {toClose && <span className="text-amber-400 font-semibold shrink-0">À encaisser</span>}
          </p>
        )}
      </div>
    </div>
  );
}

export function BreakCard({ apt, style, onSelect, dragProps, ghosted = false }) {
  return (
    <div
      data-block
      {...activate(() => onSelect(apt))}
      {...dragProps}
      title={`Pause ${apt.start_time} – ${apt.end_time}${apt.employee_name ? ` · ${apt.employee_name}` : ''}`}
      className="absolute rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-slate-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        ...style,
        background: 'repeating-linear-gradient(135deg, rgba(148,163,184,0.16), rgba(148,163,184,0.16) 4px, rgba(148,163,184,0.07) 4px, rgba(148,163,184,0.07) 8px)',
        borderLeft: '3px solid #94a3b8',
        zIndex: 6,
        opacity: ghosted ? 0.3 : 1,
        ...NO_CALLOUT,
      }}
    >
      <div className="px-1.5 py-0.5 flex items-center gap-1 min-w-0">
        <Coffee className="w-3 h-3 text-slate-400 shrink-0" />
        <p className="text-[10px] font-bold text-slate-400 truncate">{apt.start_time} – {apt.end_time}</p>
      </div>
    </div>
  );
}

export function LastMinuteCard({ apt, style, onSelect, dragProps, ghosted = false }) {
  return (
    <div
      data-block
      {...activate(() => onSelect(apt))}
      {...dragProps}
      title={`Last Minute ${apt.start_time} – ${apt.end_time || apt.start_time}`}
      className="absolute rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-orange-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        ...style,
        background: 'repeating-linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.2) 4px, rgba(249,115,22,0.1) 4px, rgba(249,115,22,0.1) 8px)',
        borderLeft: '3px solid #f97316',
        zIndex: 11,
        opacity: ghosted ? 0.3 : 1,
        ...NO_CALLOUT,
      }}
    >
      <div className="px-1.5 py-0.5 flex items-center gap-1 min-w-0">
        <Zap className="w-3 h-3 text-orange-400 shrink-0" />
        <p className="text-[10px] font-bold text-orange-400 truncate">{apt.start_time} Last Minute</p>
      </div>
    </div>
  );
}

/** Ligne rouge de l'heure actuelle (rafraîchie chaque minute). */
export function NowLine({ hourHeight }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < START_HOUR * 60 || minutes > END_HOUR * 60) return null;
  const top = ((minutes - START_HOUR * 60) / 60) * hourHeight;
  return (
    <div className="absolute left-0 right-0 z-[25] pointer-events-none" style={{ top }}>
      <div className="relative h-0.5 bg-red-500">
        <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
      </div>
    </div>
  );
}

/** Hachures grises hors des horaires du barber (journée entière s'il ne travaille pas). */
export function OffHoursShade({ window: win, hourHeight }) {
  if (win === undefined) return null;
  const shade = { background: 'repeating-linear-gradient(135deg, rgba(100,116,139,0.10), rgba(100,116,139,0.10) 6px, transparent 6px, transparent 12px)' };
  const total = (END_HOUR - START_HOUR) * hourHeight;
  if (win === null) {
    return (
      <div className="absolute inset-x-0 top-0 pointer-events-none flex justify-center" style={{ ...shade, height: total }}>
        <span className="mt-16 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-card/80 rounded px-1.5 py-0.5 h-fit">Repos</span>
      </div>
    );
  }
  const toY = (m) => Math.min(Math.max(((m - START_HOUR * 60) / 60) * hourHeight, 0), total);
  return (
    <>
      {win.start > START_HOUR * 60 && (
        <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ ...shade, height: toY(win.start) }} />
      )}
      {win.end < END_HOUR * 60 && (
        <div className="absolute inset-x-0 pointer-events-none" style={{ ...shade, top: toY(win.end), height: total - toY(win.end) }} />
      )}
    </>
  );
}

/** Aperçu de la carte en cours de déplacement, à sa place d'arrivée (n'intercepte pas le pointeur). */
export function DragGhost({ apt, startMin, duration, hourHeight, label }) {
  const top = ((startMin - START_HOUR * 60) / 60) * hourHeight;
  const height = Math.max((duration / 60) * hourHeight, 20);
  return (
    <div
      className="absolute left-0.5 right-0.5 rounded-md border-2 border-dashed border-primary shadow-xl shadow-primary/20 pointer-events-none overflow-hidden"
      style={{ top, height, zIndex: 40, background: 'linear-gradient(hsl(var(--primary) / 0.25), hsl(var(--primary) / 0.25)), hsl(var(--card))' }}
    >
      <div className="px-1.5 py-0.5 min-w-0">
        <p className="text-[10px] font-bold text-primary tabular-nums truncate">
          {minutesToTime(startMin)} – {minutesToTime(startMin + duration)}
        </p>
        {height >= 34 && <p className="text-[10px] font-semibold text-foreground truncate">{apt.client_name || 'Pause'}</p>}
        {label && height >= 48 && <p className="text-[9px] text-muted-foreground truncate">{label}</p>}
      </div>
    </div>
  );
}
