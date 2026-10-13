/**
 * Helpers d'affichage du panneau « Activité clients » : couleurs par ton, jour à l'heure de Paris,
 * libellés de groupes (« Aujourd'hui », « Hier », « lundi 13 octobre »), montants en euros.
 */

export const TONE_CLASSES = {
  green: { dot: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', text: 'text-emerald-400' },
  amber: { dot: 'bg-amber-500/15 text-amber-400 ring-amber-500/30', text: 'text-amber-400' },
  red: { dot: 'bg-red-500/15 text-red-400 ring-red-500/30', text: 'text-red-400' },
  blue: { dot: 'bg-sky-500/15 text-sky-400 ring-sky-500/30', text: 'text-sky-400' },
  violet: { dot: 'bg-violet-500/15 text-violet-400 ring-violet-500/30', text: 'text-violet-400' },
  gray: { dot: 'bg-muted text-muted-foreground ring-border', text: 'text-muted-foreground' },
};

export const toneClasses = (tone) => TONE_CLASSES[tone] || TONE_CLASSES.gray;

const PARIS = 'Europe/Paris';
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'long', day: 'numeric', month: 'long' });
const euroFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

/** Jour calendaire (YYYY-MM-DD) d'un instant, à l'heure de Paris. Null si la date est illisible. */
export function parisDayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return dayKeyFormatter.format(d);
}

/** Jour de Paris décalé de `offset` jours par rapport à aujourd'hui. */
export function parisDayKeyOffset(offset = 0) {
  return parisDayKey(new Date(Date.now() + offset * 86400000));
}

export function dayGroupLabel(key) {
  if (!key) return 'Date inconnue';
  if (key === parisDayKeyOffset(0)) return "Aujourd'hui";
  if (key === parisDayKeyOffset(-1)) return 'Hier';
  // Midi UTC tombe toujours sur le même jour à Paris.
  const label = dayLabelFormatter.format(new Date(`${key}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Regroupe des événements déjà triés (récent → ancien) par jour de Paris, ordre conservé. */
export function groupByDay(events) {
  const groups = [];
  let current = null;
  for (const ev of events) {
    const key = parisDayKey(ev.at);
    if (!current || current.key !== key) {
      current = { key, label: dayGroupLabel(key), events: [] };
      groups.push(current);
    }
    current.events.push(ev);
  }
  return groups;
}

export function formatEuro(amount) {
  const n = Number(amount);
  return Number.isFinite(n) ? euroFormatter.format(n) : '';
}

export function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
