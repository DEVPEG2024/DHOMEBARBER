import React from 'react';
import { partnerInitials } from '@/lib/partnersApi';

/** Logo carré arrondi du partenaire, initiales sur fond dégradé à défaut. */
export default function PartnerLogo({ partner, className = 'w-14 h-14', rounded = 'rounded-2xl' }) {
  if (partner?.logo_url) {
    return (
      <div className={`${className} ${rounded} bg-white overflow-hidden shrink-0 border border-white/10`}>
        <img src={partner.logo_url} alt="" className="w-full h-full object-contain" loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`${className} ${rounded} shrink-0 bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/20 flex items-center justify-center`}>
      <span className="font-fut text-xl font-bold text-primary">{partnerInitials(partner?.name)}</span>
    </div>
  );
}
