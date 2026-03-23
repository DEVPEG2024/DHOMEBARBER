import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Scissors } from 'lucide-react';
import ServiceCard from '@/components/shared/ServiceCard';

export default function Services() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedServices, setSelectedServices] = useState([]);

  const { data: categories = [] } = useQuery({
    queryKey: ['serviceCategories'],
    queryFn: () => base44.entities.ServiceCategory.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.filter({ is_active: true }, 'sort_order', 100),
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
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-semibold">Catalogue</p>
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
        <motion.div className="space-y-3">
          <AnimatePresence>
            {filtered.map((service, i) => (
              <motion.div
                key={service.id}
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
                  <p className="text-[10px] opacity-70 mt-0.5">{totalPrice}€ au total</p>
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