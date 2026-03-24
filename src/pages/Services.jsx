import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Scissors } from 'lucide-react';
import ServiceCard from '@/components/shared/ServiceCard';

function GlassCard({ children }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const x1 = useTransform(scrollYProgress, [0, 0.5, 1], [-40, 30, -40]);
  const x2 = useTransform(scrollYProgress, [0, 0.5, 1], [30, -25, 30]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.7, 1.2, 0.7]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, 0.9, 1, 0.9, 0]);
  const rotate = useTransform(scrollYProgress, [0, 0.5, 1], [-3, 2, -3]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0, 0.4, 0.4, 0]);

  return (
    <div ref={ref} className="relative py-1">
      <motion.div
        className="absolute -bottom-4 inset-x-2 h-20 rounded-3xl pointer-events-none"
        style={{
          x: x1, scale, opacity, rotate,
          background: 'radial-gradient(ellipse at 40% 50%, rgba(34,197,94,0.5) 0%, rgba(16,185,129,0.3) 35%, rgba(5,150,105,0.15) 60%, transparent 80%)',
          filter: 'blur(20px)',
        }}
      />
      <motion.div
        className="absolute -bottom-3 inset-x-8 h-14 rounded-3xl pointer-events-none"
        style={{
          x: x2, scale, opacity,
          background: 'radial-gradient(ellipse at 60% 50%, rgba(52,211,153,0.45) 0%, rgba(16,185,129,0.25) 40%, transparent 75%)',
          filter: 'blur(14px)',
        }}
      />
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          opacity: glowOpacity,
          boxShadow: '0 0 20px 2px rgba(34,197,94,0.15), inset 0 0 20px 0 rgba(34,197,94,0.03)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default function Services() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedServices, setSelectedServices] = useState([]);

  const { data: categories = [] } = useQuery({
    queryKey: ['serviceCategories'],
    queryFn: async () => {
      try {
        return await api.entities.ServiceCategory.filter({ is_active: true }, 'sort_order', 50);
      } catch {
        return [];
      }
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });

  const filtered = activeCategory === 'all'
    ? services
    : services.filter(s => s.category_id === activeCategory);

  const toggleService = (service) => {
    setSelectedServices(prev =>
      prev.find(s => s.id === service.id)
        ? prev.filter(s => s.id !== service.id)
        : [...prev, service]
    );
  };

  const totalPrice = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-32 -left-20 w-64 h-64 bg-accent/6 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-32">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-lg bg-primary/15 flex items-center justify-center">
              <Scissors className="w-3 h-3 text-primary" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold">Catalogue</p>
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Nos Prestations</h1>
          <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
        </motion.div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 mb-6 scrollbar-hide">
          {['all', ...categories.map(c => c.id)].map((id, i) => {
            const label = id === 'all' ? 'Tout' : categories.find(c => c.id === id)?.name;
            const isActive = activeCategory === id;
            return (
              <motion.button
                key={id}
                onClick={() => setActiveCategory(id)}
                whileTap={{ scale: 0.95 }}
                className={`flex-shrink-0 px-5 py-2 rounded-full text-xs font-semibold transition-all duration-300 border ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary/50 shadow-lg shadow-primary/20'
                    : 'bg-white/5 border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10'
                }`}
              >
                {label}
              </motion.button>
            );
          })}
        </div>

        {/* Services List */}
        <motion.div className="space-y-4">
          <AnimatePresence>
            {filtered.map((service, i) => (
              <GlassCard key={service.id}>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <ServiceCard
                    service={service}
                    selected={!!selectedServices.find(s => s.id === service.id)}
                    onClick={toggleService}
                  />
                </motion.div>
              </GlassCard>
            ))}
          </AnimatePresence>
        </motion.div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
              <Scissors className="w-6 h-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground">Aucune prestation dans cette catégorie</p>
          </div>
        )}
      </div>

      {/* Floating CTA */}
      <AnimatePresence>
        {selectedServices.length > 0 && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto z-40"
          >
            <Link to={`/booking?services=${selectedServices.map(s => s.id).join(',')}`}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="w-full h-[60px] rounded-2xl bg-primary text-primary-foreground shadow-2xl shadow-primary/30 flex items-center justify-between px-5"
              >
                <div className="text-left">
                  <p className="text-xs font-bold">{selectedServices.length} prestation{selectedServices.length > 1 ? 's' : ''} · {totalDuration} min</p>
                  <p className="text-[11px] opacity-70 mt-0.5">{totalPrice}€ au total</p>
                </div>
                <div className="flex items-center gap-2 font-semibold text-sm">
                  Réserver
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </motion.button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}