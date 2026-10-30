import React, { useRef } from 'react';
import { Check } from 'lucide-react';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { initialsOf } from '@/lib/feed/rules';

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** « Samedi 24 octobre » (l'année si ce n'est pas celle d'aujourd'hui), heure de Paris. */
export function visitDateLabel(date) {
  const day = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  // Midi UTC : le même jour à Paris quelle que soit l'heure d'été
  const d = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return '';
  const thisYear = new Intl.DateTimeFormat('fr-FR', { year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date());
  const opts = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' };
  if (day.slice(0, 4) !== thisYear) opts.year = 'numeric';
  return capitalize(d.toLocaleDateString('fr-FR', opts));
}

/** Prestations d'une visite : « Dégradé américain + Barbe » (repli « Ta visite »). */
export function visitTitle(visit) {
  const names = (Array.isArray(visit?.service_names) ? visit.service_names : []).map((s) => String(s || '').trim()).filter(Boolean);
  return names.length ? names.join(' + ') : 'Ta visite';
}

/** Photo d'un barber en portrait 1748 × 2480 (jamais ronde ni carrée), initiales sinon. */
export function BarberThumb({ url, name, width = 36 }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border"
      style={{ width, aspectRatio: BARBER_PHOTO_ASPECT, backgroundColor: BARBER_PHOTO_BG }}
    >
      {url
        ? <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        : <span className="text-[11px] font-bold text-muted-foreground">{initialsOf(name)}</span>}
    </span>
  );
}

/** Contenu d'une ligne : photo du barber, prestations, « Samedi 24 octobre · avec Kevin ». */
export function VisitRow({ visit }) {
  const date = visitDateLabel(visit?.date);
  const barber = String(visit?.employee_name || '').trim();
  const sub = [date, barber ? `avec ${barber}` : ''].filter(Boolean).join(' · ');
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <BarberThumb url={visit?.employee_photo_url} name={barber} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-snug text-foreground break-words">{visitTitle(visit)}</span>
        {sub && <span className="mt-0.5 block text-xs text-muted-foreground break-words">{sub}</span>}
      </span>
    </span>
  );
}

/**
 * Choix d'une visite pour un look ou un avant / après (`GET /feed/visits`, la plus récente
 * d'abord) : groupe de boutons radio, flèches du clavier pour passer de l'une à l'autre.
 *
 * @param {object} props
 * @param {Array<object>} props.visits     `{ id, date, start_time, employee_name, employee_photo_url, service_names }`
 * @param {string|null} props.value        id de la visite choisie
 * @param {(id: string|null) => void} props.onChange
 * @param {boolean} [props.allowNone]      ajoute « Sans visite » (avant / après : visite facultative)
 * @param {string} [props.label]           nom du groupe (lecteurs d'écran)
 */
export default function VisitPicker({ visits, value, onChange, allowNone = false, label = 'Choisis ta visite' }) {
  const groupRef = useRef(null);
  const list = Array.isArray(visits) ? visits : [];
  const options = [...(allowNone ? [{ id: null }] : []), ...list];
  const selected = value == null ? null : String(value);
  const isSelected = (o) => (o.id == null ? selected == null : String(o.id) === selected);
  // Un seul arrêt de tabulation : la visite choisie, sinon la première
  const tabStop = Math.max(0, options.findIndex(isSelected));

  const onKeyDown = (e) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys) || !options.length) return;
    e.preventDefault();
    const current = options.findIndex(isSelected);
    const next = options[(Math.max(0, current) + keys[e.key] + options.length) % options.length];
    onChange?.(next.id == null ? null : String(next.id));
    const buttons = groupRef.current?.querySelectorAll('[role="radio"]');
    buttons?.[options.indexOf(next)]?.focus();
  };

  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-col gap-2">
      {options.map((v, i) => {
        const id = v.id == null ? null : String(v.id);
        const checked = id === selected;
        return (
          <button
            key={id || 'none'}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange?.(id)}
            className={`flex w-full min-w-0 items-center gap-3 rounded-2xl border p-3 transition-colors ${
              checked ? 'border-primary/60 bg-primary/10' : 'border-border bg-secondary/40 hover:border-primary/40'
            }`}
          >
            {id == null
              ? <span className="min-w-0 flex-1 text-left text-sm font-semibold text-foreground">Sans visite</span>
              : <VisitRow visit={v} />}
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}
            >
              {checked && <Check className="h-3 w-3" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
