import React from 'react';
import { queryFailed } from '@/components/shared/LoadError';
import { BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import CoupeLoadError from '../CoupeLoadError';
import { Hint } from './PlayModes';

/**
 * Onglet « Barbers » de « Contre qui ? » (accueil repensé, planche validée le 29 oct. 2026 au soir) :
 * une ligne par barber, comme l'onglet Joueurs : portrait (jamais rond), prénom, état, « Défier ».
 * États d'après `GET /coupe/barbers` (relu toutes les 30 s sur l'accueil) : « Dispo » ; « En
 * rendez-vous » (`busy` : un RDV client en cours ou qui commence dans les 10 min) ; « Pas dispo »
 * (« Dispo » décoché, ou `reachable` faux : il ne recevrait pas le défi). Un barber ne se voit pas
 * dans la liste (on ne se défie pas soi-même).
 */
// Portrait d'un barber pas dispo : grisé, changement net (jamais de transition de filtre)
const PHOTO_OFF = { filter: 'grayscale(.8)', opacity: 0.55 };

export function barberStatus(barber) {
  if (barber.available) return { label: 'Dispo', on: true };
  if (barber.reachable !== false && barber.busy) return { label: 'En rendez-vous', button: 'Occupé', on: false };
  return { label: 'Pas dispo', button: 'Pas dispo', on: false };
}

/** Bouton « Défier » rouge, ou grisé avec la raison (lignes des barbers et des joueurs). */
export function ChallengeButton({ name, on, offLabel = 'Pas dispo', offReason, onClick }) {
  if (on) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Défier ${name}`}
        className="min-h-[44px] shrink-0 rounded-xl bg-[color:var(--coupe-rouge)] px-[18px] font-fut text-base font-extrabold uppercase leading-none tracking-[0.06em] text-white transition-transform motion-safe:active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Défier
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled
      aria-label={`Défier ${name} : ${(offReason || offLabel).toLowerCase()}`}
      className="min-h-[44px] shrink-0 rounded-xl border border-white/15 bg-transparent px-3.5 font-fut text-[15px] font-bold uppercase leading-none tracking-[0.06em] text-[color:var(--coupe-gris)]"
    >
      {offLabel}
    </button>
  );
}

/** Pastille et texte de l'état (« Dispo » en blanc, le reste en gris). */
export function StatusLine({ on, label }) {
  return (
    <span className={`mt-1.5 flex items-center gap-1.5 text-xs leading-none ${on ? 'text-white' : 'text-[color:var(--coupe-gris)]'}`}>
      <span
        className={`h-[7px] w-[7px] shrink-0 rounded-full ${on ? 'bg-white shadow-[0_0_0_3px_rgba(255,255,255,.2)]' : 'bg-[color:var(--coupe-gris-sombre)]'}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Barbers à défier (après le filtre de sa propre fiche) : la même liste sert au compteur de l'onglet. */
export function barbersOf(query, excludeEmployeeId = null) {
  return Array.isArray(query.data)
    ? query.data.filter((b) => b && b.employee_id != null && (excludeEmployeeId == null || String(b.employee_id) !== String(excludeEmployeeId)))
    : [];
}

function BarberRow({ barber, onChallenge }) {
  const name = String(barber.name || 'Barber');
  const status = barberStatus(barber);
  return (
    <li className="flex items-center gap-3 border-b border-white/8 px-3.5 py-2.5 last:border-b-0">
      <span className="block h-[57px] w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: BARBER_PHOTO_BG }} aria-hidden="true">
        {barber.photo_url ? (
          <img src={barber.photo_url} alt="" loading="lazy" decoding="async" className="block h-full w-full object-cover" style={status.on ? undefined : PHOTO_OFF} />
        ) : (
          <span className={`flex h-full w-full items-center justify-center font-fut text-xl font-bold ${status.on ? 'text-white' : 'text-[color:var(--coupe-gris-sombre)]'}`}>
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate font-fut text-xl font-bold uppercase leading-none ${status.on ? 'text-white' : 'text-[color:var(--coupe-gris-clair)]'}`}>{name}</span>
        <StatusLine on={status.on} label={status.label} />
      </span>
      <ChallengeButton name={name} on={status.on} offLabel={status.button} offReason={status.label} onClick={() => onChallenge(barber)} />
    </li>
  );
}

export default function BarberChallenge({ query, excludeEmployeeId = null, onChallenge }) {
  const list = barbersOf(query, excludeEmployeeId);

  if (queryFailed(query)) {
    return <CoupeLoadError compact what="les barbers" error={query.error} onRetry={query.refetch} retrying={query.isFetching} />;
  }
  if (query.isPending) {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 ${i < 2 ? 'border-b border-white/8' : ''}`}>
            <span className="h-[57px] w-10 rounded-lg bg-white/6 motion-safe:animate-pulse" />
            <span className="h-4 flex-1 rounded bg-white/6 motion-safe:animate-pulse" />
            <span className="h-11 w-20 rounded-xl bg-white/6 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] px-4 py-4 text-center text-[13px] text-[color:var(--coupe-gris)]">
        Aucun barber ne joue pour l’instant.
      </p>
    );
  }
  return (
    <>
      <ul className="overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)]">
        {list.map((b) => <BarberRow key={b.employee_id} barber={b} onChallenge={onChallenge} />)}
      </ul>
      <Hint>Le barber reçoit une notification et a 2 minutes pour accepter.</Hint>
    </>
  );
}
