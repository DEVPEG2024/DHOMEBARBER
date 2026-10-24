/**
 * « Pour qui ? » de la confirmation (réservation pour un proche sans compte, 24 oct. 2026) : moi,
 * un proche déjà venu avec ce compte (raccourci), ou un nouveau proche dont on tape le prénom.
 * Le rendez-vous reste sur le compte du client (rappels, annulation) : le bloc le rappelle.
 *
 * `value` : `{ kind: 'me' }`, `{ kind: 'guest', name }` (proche connu), `{ kind: 'new', name }`
 * (prénom en cours de saisie) ou `null` (pas encore choisi : prestation enfant, rendez-vous suivant).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { GUEST_NAME_MAX, guestNameError, samePerson } from '@/lib/guest';
import { hapticFeedback } from '@/lib/capacitor';

function Chip({ active, onClick, children, label }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={() => { hapticFeedback(); onClick(); }}
      className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-sm font-semibold transition-colors duration-300 max-w-full ${
        active
          ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/25'
          : 'bg-background/40 border-border text-foreground hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}

export default function GuestPicker({ value, known = [], onChange, required = false, prompt = '' }) {
  const inputRef = useRef(null);
  const [touched, setTouched] = useState(false);
  const adding = value?.kind === 'new';
  // Nouveau proche : le champ prend la main (clavier ouvert), l'erreur n'apparaît qu'après la saisie
  useEffect(() => {
    if (adding) {
      setTouched(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [adding]);
  const error = adding && touched ? guestNameError(value.name) : null;
  const missing = required && !value;

  return (
    <section aria-labelledby="guest-picker-title"
      className={`rounded-2xl border bg-card p-3.5 ${missing ? 'border-amber-500/40' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-[18px] h-[18px] text-primary shrink-0" aria-hidden="true" />
        <h2 id="guest-picker-title" className="text-[15px] font-semibold text-foreground">Pour qui ?</h2>
      </div>
      {prompt && (
        <p className={`text-xs leading-relaxed mb-1 ${missing ? 'text-amber-600 dark:text-amber-300' : 'text-muted-foreground'}`}>{prompt}</p>
      )}
      <div role="group" aria-labelledby="guest-picker-title" className="mt-2 flex flex-wrap gap-2">
        <Chip active={value?.kind === 'me'} onClick={() => onChange({ kind: 'me' })}>Moi</Chip>
        {known.map((name) => (
          <Chip key={name} active={value?.kind === 'guest' && samePerson(value.name, name)}
            onClick={() => onChange({ kind: 'guest', name })}>
            <span className="truncate">{name}</span>
          </Chip>
        ))}
        <Chip active={adding} onClick={() => { if (!adding) onChange({ kind: 'new', name: '' }); }}
          label="Ajouter un proche">
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" /> Un proche
        </Chip>
      </div>
      {adding && (
        <div className="mt-3">
          <label htmlFor="guest-name" className="block text-xs font-semibold text-foreground mb-1.5">Prénom de votre proche</label>
          <input
            ref={inputRef}
            id="guest-name"
            type="text"
            value={value.name}
            onChange={(e) => onChange({ kind: 'new', name: e.target.value.slice(0, GUEST_NAME_MAX) })}
            onBlur={() => setTouched(true)}
            maxLength={GUEST_NAME_MAX}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            placeholder="Ex. Léo"
            aria-invalid={!!error}
            aria-describedby={error ? 'guest-name-error' : undefined}
            className="w-full h-12 px-3.5 rounded-xl border border-border bg-background/40 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60"
          />
          {error && <p id="guest-name-error" role="alert" className="mt-1.5 text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
      )}
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Le rendez-vous reste sur votre compte : rappels, déplacement et annulation passent par vous.
      </p>
    </section>
  );
}
