import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Handshake, Search, X, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { hapticFeedback } from '@/lib/capacitor';
import {
  PARTNERS_QUERY_KEY, PARTNER_CATEGORIES, fetchPartners, visiblePartners, partnerOffers, bestPercent,
} from '@/lib/partnersApi';
import PartnerCard from '@/components/partners/PartnerCard';
import PartnerSheet from '@/components/partners/PartnerSheet';
import PartnerLogo from '@/components/partners/PartnerLogo';
import PercentBadge from '@/components/partners/PercentBadge';

const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Partenaire mis en avant : grande carte en tête de page. */
function FeaturedPartner({ partner, onOpen }) {
  const best = bestPercent(partner);
  const offer = partnerOffers(partner)[0];
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={() => onOpen(partner)}
      className="relative w-full overflow-hidden rounded-3xl text-left border border-primary/25 shrink-0 snap-start"
      style={{ minHeight: 168 }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#16301f] via-[#101010] to-[#0a0a0a]" />
      {partner.cover_image_url && (
        <img src={partner.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-55" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="relative h-full flex flex-col justify-end p-5 gap-3" style={{ minHeight: 168 }}>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 border border-primary/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="w-3 h-3" /> Coup de cœur
          </span>
          {best && <PercentBadge percent={best} size="md" />}
        </div>
        <div className="flex items-center gap-3">
          <PartnerLogo partner={partner} className="w-12 h-12" rounded="rounded-xl" />
          <div className="min-w-0">
            <p className="font-fut text-2xl font-extrabold uppercase leading-none text-white truncate">{partner.name}</p>
            <p className="text-xs text-white/70 line-clamp-1 mt-1">{partner.tagline || offer?.title || ''}</p>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export default function Partners() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({ queryKey: PARTNERS_QUERY_KEY, queryFn: fetchPartners, staleTime: 5 * 60 * 1000 });
  const partners = useMemo(() => visiblePartners(data), [data]);

  // Fiche ouverte = paramètre d'URL `p` (lien depuis l'accueil, bouton retour du téléphone)
  const openId = searchParams.get('p');
  const openPartner = useMemo(() => partners.find(p => String(p.id) === String(openId)) || null, [partners, openId]);
  const open = (partner) => {
    hapticFeedback();
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('p', partner.id); return next; });
  };
  const close = () => setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('p'); return next; }, { replace: true });

  // Bloque le défilement de la page derrière la fiche
  useEffect(() => {
    if (!openPartner) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [openPartner]);

  const categories = useMemo(() => {
    const used = new Set(partners.map(p => p.category || 'other'));
    return PARTNER_CATEGORIES.filter(c => used.has(c.value));
  }, [partners]);

  const featured = useMemo(() => partners.filter(p => p.is_featured), [partners]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return partners.filter(p => {
      if (category !== 'all' && (p.category || 'other') !== category) return false;
      if (!q) return true;
      const haystack = normalize([p.name, p.tagline, p.city, p.description, ...partnerOffers(p).map(o => `${o.title} ${o.details || ''}`)].join(' '));
      return haystack.includes(q);
    });
  }, [partners, category, query]);

  const filtering = category !== 'all' || query.trim();

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        {/* En-tête */}
        <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Partenaires</p>
          <h1 className="font-fut text-4xl font-extrabold uppercase leading-none text-foreground">Les bons plans du Gang</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Les adresses de nos partenaires, avec des remises réservées aux clients du salon. Choisis un partenaire puis montre ta Carte Gang sur place.
          </p>
        </motion.div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />)}
          </div>
        ) : partners.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
            <Handshake className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">Les premiers bons plans arrivent</p>
            <p className="text-xs text-muted-foreground mt-1">Le salon prépare ses partenariats. Repasse bientôt !</p>
          </div>
        ) : (
          <>
            {featured.length > 0 && !filtering && (
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 mb-6">
                {featured.map(p => (
                  <div key={p.id} className={featured.length > 1 ? 'w-[85%] shrink-0' : 'w-full'}>
                    <FeaturedPartner partner={p} onOpen={open} />
                  </div>
                ))}
              </div>
            )}

            {/* Recherche + catégories */}
            <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-3 bg-background/85 backdrop-blur-xl space-y-2.5">
              {partners.length > 4 && (
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Resto, sport, vidange…"
                    className="w-full h-11 rounded-xl bg-card border border-border pl-9 pr-9 text-sm outline-none focus:border-primary/50"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery('')} aria-label="Effacer"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              {categories.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                  {[{ value: 'all', label: 'Tout', emoji: '🔥' }, ...categories].map(c => {
                    const active = category === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => { hapticFeedback(); setCategory(c.value); }}
                        className={`relative shrink-0 h-9 px-3.5 rounded-full text-xs font-semibold border transition-colors ${
                          active ? 'text-primary-foreground border-primary' : 'text-muted-foreground border-border bg-card'
                        }`}
                      >
                        {active && (
                          <motion.span layoutId="partner-chip" className="absolute inset-0 rounded-full bg-primary"
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                        )}
                        <span className="relative">{c.emoji} {c.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2.5 mt-1">
              {filtered.map((p, i) => (
                <PartnerCard key={p.id} partner={p} onOpen={open} index={i} reduceMotion={reduceMotion} />
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-10">Aucun partenaire ne correspond.</p>
              )}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {openPartner && <PartnerSheet key={openPartner.id} partner={openPartner} user={user} onClose={close} />}
      </AnimatePresence>
    </div>
  );
}
