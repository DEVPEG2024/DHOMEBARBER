import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Scissors } from 'lucide-react';
import MediaGrid from '@/components/feed/MediaGrid';
import { imagesOf } from '@/lib/feed/rules';
import { track } from '@/lib/analytics';

/**
 * Corps d'une publication « Mon look » (fil v2, contrat section 5) : le mot de l'auteur, la ou les
 * photos (badge « Mon look », bandeau prestations + barber), puis le bouton vert « Réserver ce look
 * avec <barber> » quand le serveur l'a rendu réservable (`meta.booking_path`, posé seulement si
 * `bookable` : barber actif et visible, prestations encore au catalogue).
 *
 * Mise en page : aucune marge latérale (PostCard la donne). Le mot de l'auteur (`item.content`) est
 * affiché ici : PostCard ne le répète pas (sinon `showText={false}`).
 *
 * @param {object} props
 * @param {object} props.item            publication (`kind: 'look'`)
 * @param {() => void} [props.onDoubleTap]  double tap sur une photo (❤️)
 * @param {boolean} [props.showText]
 */
export default function LookCard({ item, onDoubleTap, showText = true }) {
  const meta = item?.meta || {};
  const images = imagesOf(item);
  const barber = String(meta.employee_name || '').trim();
  const services = (Array.isArray(meta.service_names) ? meta.service_names : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const href = bookingHref(meta);
  const text = String(item?.content || '').trim();

  const badge = (
    <span className="pointer-events-none absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full bg-black/70 text-[#b6ecd0] text-[11px] font-bold uppercase tracking-[0.08em]">
      <Scissors className="w-3 h-3" aria-hidden="true" />
      Mon look
    </span>
  );

  return (
    <div className="min-w-0">
      {showText && text && (
        <p className="pb-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{text}</p>
      )}
      {images.length > 0 && (
        <div className="relative">
          <MediaGrid images={images} onDoubleTap={onDoubleTap} overlay={badge} rounded="rounded-2xl" />
          {(services.length > 0 || barber) && (
            <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 min-w-0 rounded-xl bg-black/75 px-3 py-2.5">
              {services.length > 0 && (
                <p className="text-[13px] font-bold leading-snug text-white break-words line-clamp-2">{services.join(' + ')}</p>
              )}
              {barber && <p className="mt-0.5 text-[11px] text-white/75 truncate">avec {barber}</p>}
            </div>
          )}
        </div>
      )}
      {href && (
        <Link
          to={href}
          onClick={() => track('feed_look_booking', { services: services.length })}
          className="mt-2.5 flex w-full min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <CalendarCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{barber ? `Réserver ce look avec ${barber}` : 'Réserver ce look'}</span>
        </Link>
      )}
    </div>
  );
}

/** Lien de réservation d'un look : chemin interne `/booking…` seulement, jamais une autre adresse. */
function bookingHref(meta) {
  const path = typeof meta?.booking_path === 'string' ? meta.booking_path : '';
  if (meta?.bookable === false) return null;
  return path === '/booking' || path.startsWith('/booking?') ? path : null;
}
