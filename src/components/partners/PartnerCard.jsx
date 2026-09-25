import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, MapPin } from 'lucide-react';
import { bestPercent, partnerCategory, partnerOffers } from '@/lib/partnersApi';
import PartnerLogo from './PartnerLogo';
import PercentBadge from './PercentBadge';

/** Carte d'un partenaire dans la liste : logo, catégorie, accroche, meilleure réduction, nombre d'offres. */
export default function PartnerCard({ partner, onOpen, index = 0, reduceMotion = false }) {
  const category = partnerCategory(partner.category);
  const offers = partnerOffers(partner);
  const best = bestPercent(partner);
  const hasSeveralPercents = offers.filter(o => Number(o.percent) > 0).length > 1;

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(partner)}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      whileTap={{ scale: 0.98 }}
      className="w-full text-left rounded-2xl bg-card border border-border p-3.5 flex items-center gap-3.5 hover:border-primary/30 transition-colors"
    >
      <PartnerLogo partner={partner} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">
          {category.emoji} {category.label}
        </p>
        <p className="text-sm font-bold text-foreground truncate mt-0.5">{partner.name}</p>
        {partner.tagline ? (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{partner.tagline}</p>
        ) : offers[0] ? (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{offers[0].title}</p>
        ) : null}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
          {offers.length > 0 && <span>{offers.length} offre{offers.length > 1 ? 's' : ''}</span>}
          {partner.city && (
            <span className="inline-flex items-center gap-0.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{partner.city}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        {best ? <PercentBadge percent={best} prefix={hasSeveralPercents ? "jusqu'à" : ''} size="sm" /> : null}
        <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
      </div>
    </motion.button>
  );
}
