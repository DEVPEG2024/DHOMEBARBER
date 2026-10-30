import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { FEED_KEYS, fetchUnread } from '@/lib/feed/feedApi';

/**
 * « N nouvelles publications » (fil v2) : publications d'autres membres parues depuis la plus
 * récente affichée (`GET /feed/unread?since=`), relu toutes les 60 s quand l'app est au premier
 * plan. Pilule posée en haut de l'écran (aucun décalage du fil quand elle apparaît). Rien en
 * échec ni à zéro.
 *
 * @param {object} props
 * @param {string|null} props.since   `created_at` de la première publication affichée
 * @param {boolean} props.enabled     fil v2, connecté, filtre « Tout »
 * @param {boolean} [props.inAdmin]   sous l'en-tête collant de l'admin (mobile), à côté du menu (ordinateur)
 * @param {() => void} props.onShow   relire le fil, remonter en haut, fil vu
 */
export default function NewPostsButton({ since, enabled, inAdmin = false, onShow }) {
  const reduce = useReducedMotion();
  const { data } = useQuery({
    queryKey: FEED_KEYS.unread(since),
    queryFn: () => fetchUnread(since),
    enabled: !!(enabled && since),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const raw = Math.floor(Number(data?.posts));
  const n = enabled && Number.isFinite(raw) && raw > 0 ? Math.min(raw, 99) : 0;

  return (
    <div
      className={`fixed inset-x-0 z-40 flex justify-center pointer-events-none ${
        inAdmin ? 'top-[calc(env(safe-area-inset-top,0px)+4.25rem)] lg:top-4 lg:pl-[260px]' : 'top-[calc(env(safe-area-inset-top,0px)+0.75rem)]'
      }`}
    >
      <AnimatePresence>
        {n > 0 && (
          <motion.button
            key="new-posts"
            type="button"
            onClick={onShow}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold inline-flex items-center gap-1.5 shadow-lg shadow-black/40"
          >
            <ArrowUp className="w-[15px] h-[15px]" aria-hidden="true" />
            {n} nouvelle{n > 1 ? 's' : ''} publication{n > 1 ? 's' : ''}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
