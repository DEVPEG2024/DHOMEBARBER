import React from 'react';
import { queryFailed } from '@/components/shared/LoadError';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import CoupeLoadError from '../CoupeLoadError';

/**
 * « Défier un barber » (maquette « Accueil de la Coupe ») : portraits des barbers (jamais ronds),
 * « Dispo » / « Occupé » / « Pas dispo » d'après `GET /coupe/barbers`, relu toutes les 30 s sur
 * l'accueil de la Coupe (`useCoupeBarbers({ poll: true })`). `busy` = un rendez-vous client en
 * cours ou qui commence dans les 10 min ; `reachable` faux = le barber ne recevrait pas le défi
 * (notifications pas activées sur son téléphone) : « Pas dispo ». Un barber ne se voit pas dans la
 * liste (on ne se défie pas soi-même).
 * Thème stade : « Dispo » en blanc (point blanc cerclé), « Défier » rouge ; pas dispo : photo grisée.
 */
// Photo d'un barber pas dispo (maquette) : changement net, jamais de transition de filtre
const PHOTO_OFF = { filter: 'grayscale(.8)', opacity: 0.55 };

function statusOf(barber) {
  if (barber.available) return { label: 'Dispo', on: true };
  if (barber.reachable === false) return { label: 'Pas dispo', on: false };
  if (barber.busy) return { label: 'Occupé', on: false };
  return { label: 'Pas dispo', on: false };
}

function BarberTile({ barber, onChallenge }) {
  const name = String(barber.name || 'Barber');
  const { label, on } = statusOf(barber);
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <span
        className="block w-full overflow-hidden rounded-[14px]"
        style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }}
        aria-hidden="true"
      >
        {barber.photo_url ? (
          <img
            src={barber.photo_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="block h-full w-full object-cover"
            style={on ? undefined : PHOTO_OFF}
          />
        ) : (
          <span className={`flex h-full w-full items-center justify-center font-fut text-4xl font-bold ${on ? 'text-white' : 'text-[color:var(--coupe-gris-sombre)]'}`}>
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      {/* Nom et état : l'état passe sous le nom quand la colonne est étroite (320 px) ; les
          boutons restent alignés en bas de la rangée (`mt-auto`) */}
      <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
        <span className="min-w-0 truncate font-fut text-lg font-bold leading-none">{name}</span>
        <span className={`flex shrink-0 items-center gap-[5px] text-[11px] leading-none ${on ? 'text-white' : 'text-[color:var(--coupe-gris)]'}`}>
          <span
            className={`h-[7px] w-[7px] rounded-full ${on ? 'bg-white shadow-[0_0_0_3px_rgba(255,255,255,.2)]' : 'bg-[color:var(--coupe-gris-sombre)]'}`}
            aria-hidden="true"
          />
          {label}
        </span>
      </div>
      {on ? (
        <button
          type="button"
          onClick={() => onChallenge(barber)}
          aria-label={`Défier ${name}`}
          className="mt-auto min-h-[44px] rounded-xl bg-[color:var(--coupe-rouge)] font-fut text-[15px] font-extrabold uppercase leading-none tracking-[0.06em] text-white transition-transform motion-safe:active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Défier
        </button>
      ) : (
        <button
          type="button"
          disabled
          aria-label={`Défier ${name} : ${label.toLowerCase()}`}
          className="mt-auto min-h-[44px] rounded-xl border border-white/15 bg-transparent font-fut text-sm font-bold uppercase leading-none tracking-[0.06em] text-[color:var(--coupe-gris)]"
        >
          Pas dispo
        </button>
      )}
    </li>
  );
}

export default function BarberChallenge({ query, excludeEmployeeId = null, eligible = true, onChallenge }) {
  const failed = queryFailed(query);
  const list = Array.isArray(query.data)
    ? query.data.filter((b) => b && b.employee_id != null && (excludeEmployeeId == null || String(b.employee_id) !== String(excludeEmployeeId)))
    : [];

  return (
    <section aria-labelledby="coupe-barbers-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="coupe-barbers-title" className="font-fut text-xl font-extrabold uppercase leading-none tracking-[0.04em]">
          Défier un barber
        </h2>
        <span className="text-xs text-[color:var(--coupe-gris)]">{eligible ? 'En ligne · points en jeu' : 'En ligne · amical'}</span>
      </div>

      {failed ? (
        <CoupeLoadError compact what="les barbers" error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
      ) : query.isPending ? (
        <div className="grid grid-cols-3 gap-2.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <span className="block w-full rounded-[14px] bg-white/6 motion-safe:animate-pulse" style={{ aspectRatio: BARBER_PHOTO_ASPECT }} />
              <span className="h-4 w-2/3 rounded bg-white/6 motion-safe:animate-pulse" />
              <span className="h-11 rounded-xl bg-white/6 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] px-4 py-4 text-center text-[13px] text-[color:var(--coupe-gris)]">
          Aucun barber ne joue pour l’instant.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2.5">
          {list.map((b) => <BarberTile key={b.employee_id} barber={b} onChallenge={onChallenge} />)}
        </ul>
      )}
    </section>
  );
}
