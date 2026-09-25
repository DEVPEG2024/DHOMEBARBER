import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PARTNERS_QUERY_KEY, fetchPartners, visiblePartners, bestPercent } from '@/lib/partnersApi';
import PartnerLogo from './PartnerLogo';
import PercentBadge from './PercentBadge';

/**
 * Bloc de l'accueil : rangée défilante des partenaires (logo, nom, meilleure réduction), chaque
 * vignette ouvre la page des bons plans sur ce partenaire. Rend `null` sans partenaire visible,
 * la section est alors masquée par le wrapper `.auto-section` de Home.jsx.
 */
export default function PartnersHomeCard() {
  const { data } = useQuery({ queryKey: PARTNERS_QUERY_KEY, queryFn: fetchPartners, staleTime: 5 * 60 * 1000 });
  const partners = useMemo(() => visiblePartners(data).slice(0, 10), [data]);

  if (partners.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 pt-2 snap-x snap-mandatory scrollbar-hide">
      {partners.map((partner, i) => {
        const best = bestPercent(partner);
        return (
          <Link key={partner.id} to={`/partners?p=${encodeURIComponent(partner.id)}`} className="snap-start shrink-0">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.96 }}
              className="relative glass rounded-2xl p-3 w-[132px] flex flex-col items-center text-center"
            >
              {best && <PercentBadge percent={best} size="sm" className="absolute -top-2 -right-1" />}
              <PartnerLogo partner={partner} className="w-16 h-16" />
              <p className="text-xs font-semibold text-foreground mt-2 line-clamp-1 w-full">{partner.name}</p>
              <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 min-h-[2.5em]">
                {partner.tagline || partner.offers?.[0]?.title || ''}
              </p>
            </motion.div>
          </Link>
        );
      })}
    </div>
  );
}
