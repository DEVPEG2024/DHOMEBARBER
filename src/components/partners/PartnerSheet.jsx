import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, MapPin, Phone, Globe, Instagram, Ticket, CalendarClock, Info, ChevronDown } from 'lucide-react';
import { hapticFeedback, openExternalUrl } from '@/lib/capacitor';
import {
  partnerCategory, partnerOffers, offerPercent, formatValidUntil,
  safeUrl, instagramUrl, mapsUrl, telUrl,
} from '@/lib/partnersApi';
import PartnerLogo from './PartnerLogo';
import PercentBadge from './PercentBadge';
import GangPass from './GangPass';

function ActionButton({ icon: Icon, label, onClick, href }) {
  const className = 'flex flex-col items-center justify-center gap-1 rounded-2xl bg-secondary/60 border border-border py-3 text-[11px] font-semibold text-foreground active:scale-95 transition-transform';
  if (href) {
    return <a href={href} className={className}><Icon className="w-4 h-4 text-primary" />{label}</a>;
  }
  return <button type="button" onClick={onClick} className={className}><Icon className="w-4 h-4 text-primary" />{label}</button>;
}

/**
 * Fiche d'un partenaire en bottom sheet : couverture, logo, description, offres (pourcentage en
 * grand), conditions, validité, contacts, puis la Carte Gang à présenter sur place.
 * Fermeture par la croix (ou Échap) uniquement, comme toutes les fenêtres de l'app.
 */
export default function PartnerSheet({ partner, user, onClose }) {
  const [showPass, setShowPass] = useState(false);
  const offers = partnerOffers(partner);
  const category = partnerCategory(partner?.category);
  const website = safeUrl(partner?.website);
  const insta = instagramUrl(partner?.instagram);
  const maps = mapsUrl([partner?.address, partner?.city].filter(Boolean).join(', '));
  const tel = telUrl(partner?.phone);
  const validUntil = formatValidUntil(partner?.valid_until);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!partner) return null;

  const actions = [
    maps && { icon: MapPin, label: 'Itinéraire', onClick: () => openExternalUrl(maps) },
    tel && { icon: Phone, label: 'Appeler', href: tel },
    website && { icon: Globe, label: 'Site', onClick: () => openExternalUrl(website) },
    insta && { icon: Instagram, label: 'Instagram', onClick: () => openExternalUrl(insta) },
  ].filter(Boolean);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/65"
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={partner.name}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[60] max-h-[92vh] rounded-t-3xl border-t border-border bg-background flex flex-col overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {/* Couverture (ou dégradé) avec le logo qui déborde */}
          <div className="relative h-40 bg-gradient-to-br from-primary/25 via-[#101010] to-[#0a0a0a]">
            {partner.cover_image_url && (
              <img src={partner.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
            <div className="absolute left-5 -bottom-7">
              <PartnerLogo partner={partner} className="w-16 h-16" rounded="rounded-2xl" />
            </div>
          </div>

          <div className="px-5 pt-10 space-y-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
                {category.emoji} {category.label}{partner.city ? ` · ${partner.city}` : ''}
              </p>
              <h2 className="font-display text-2xl font-bold leading-tight text-foreground mt-1">{partner.name}</h2>
              {partner.tagline && <p className="text-sm text-muted-foreground mt-1">{partner.tagline}</p>}
            </div>

            {/* Offres */}
            {offers.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                  {offers.length > 1 ? 'Les offres du Gang' : "L'offre du Gang"}
                </p>
                {offers.map((offer, i) => {
                  const percent = offerPercent(offer);
                  return (
                    <div key={offer.id || i} className="rounded-2xl bg-card border border-border p-4 flex items-center gap-4">
                      {percent ? (
                        <PercentBadge percent={percent} size="lg" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Ticket className="w-6 h-6 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">{offer.title}</p>
                        {offer.details && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{offer.details}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Carte Gang : ce qu'on montre en caisse */}
            <div>
              <AnimatePresence initial={false} mode="wait">
                {showPass ? (
                  <motion.div key="pass" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <GangPass user={user} partner={partner} />
                    <p className="text-[11px] text-muted-foreground text-center mt-2">
                      Montre cet écran au partenaire au moment de payer.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pulse-cta !block w-full rounded-2xl">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { hapticFeedback(); setShowPass(true); }}
                      className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"
                    >
                      <Ticket className="w-4 h-4" /> Profiter de l'offre
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {(partner.conditions || validUntil) && (
              <div className="rounded-2xl bg-secondary/40 border border-border p-3.5 space-y-1.5 text-xs text-muted-foreground">
                {partner.conditions && (
                  <p className="flex gap-2"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span className="whitespace-pre-line">{partner.conditions}</span></p>
                )}
                {validUntil && (
                  <p className="flex gap-2"><CalendarClock className="w-3.5 h-3.5 shrink-0 mt-0.5" />Valable jusqu'au {validUntil}</p>
                )}
              </div>
            )}

            {partner.description && (
              <Description text={partner.description} />
            )}

            {actions.length > 0 && (
              <div className={`grid gap-2 ${actions.length >= 4 ? 'grid-cols-4' : actions.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {actions.map(a => <ActionButton key={a.label} {...a} />)}
              </div>
            )}

            {partner.address && (
              <p className="text-xs text-muted-foreground flex gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {[partner.address, partner.city].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

function Description({ text }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-1.5">À propos</p>
      <p className={`text-sm text-muted-foreground leading-relaxed whitespace-pre-line ${long && !open ? 'line-clamp-4' : ''}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(o => !o)} className="mt-1 text-xs font-semibold text-primary inline-flex items-center gap-1">
          {open ? 'Moins' : 'Lire la suite'} <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}
