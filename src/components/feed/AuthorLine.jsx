import React from 'react';
import { Star } from 'lucide-react';
import { getRoleBadge, initialsOf } from '@/lib/feed/rules';

/** Étoile bleue du salon, à côté du nom de l'auteur (jamais de badge écrit, 26 oct. 2026). */
export function SalonStar({ className = 'w-3.5 h-3.5' }) {
  return (
    <span className="inline-flex shrink-0" title="Compte officiel du salon">
      <Star className={`${className} text-blue-500 fill-blue-500`} aria-hidden="true" />
      <span className="sr-only">Compte officiel du salon</span>
    </span>
  );
}

/** Avatar rond (photo ou initiales) d'un auteur du fil. `size` en pixels. */
export function AuthorAvatar({ name, photoUrl, size = 40 }) {
  return (
    <span
      className="rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold text-muted-foreground" style={{ fontSize: Math.max(10, Math.round(size * 0.34)) }}>{initialsOf(name)}</span>
      )}
    </span>
  );
}

/** Nom de l'auteur + étoile du salon ou badge « Barber ». */
export function AuthorName({ name, role, className = 'text-sm font-semibold text-foreground', starClassName }) {
  const badge = getRoleBadge(role);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
      <span className={`${className} truncate`}>{name || 'Membre du Gang'}</span>
      {badge?.star && <SalonStar className={starClassName || 'w-3.5 h-3.5'} />}
      {badge?.label && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${badge.color}20`, color: badge.color }}>
          {badge.label}
        </span>
      )}
    </span>
  );
}
