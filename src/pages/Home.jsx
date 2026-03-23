import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Clock, Phone, Star, ArrowRight, Scissors } from 'lucide-react';
import { motion } from 'framer-motion';
import SectionHeader from '@/components/shared/SectionHeader';
import StarRating from '@/components/shared/StarRating';

const LOGO_URL = '/logo.png';

export default function Home() {
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => base44.entities.Review.filter({ is_visible: true }, '-created_date', 5),
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '5.0';

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-background z-10" />
        <img
          src="https://images.unsplash.com/photo-1585747860019-8008f990f30f?w=800&q=80"
          alt="Barbershop"
          className="absolute inset-0 w-full h-full object-cover scale-105"
        />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent z-10" />

        <div className="relative z-20 flex flex-col items-center justify-center px-5 pt-10 pb-8">
          {/* Logo grand */}
          <motion.img
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            src={LOGO_URL}
            alt="D'Home Barber"
            className="w-72 h-72 object-contain drop-shadow-2xl mb-2"
          />
          <p className="text-sm font-light tracking-[0.3em] uppercase text-white/70 mb-4">Premium BarberShop</p>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center gap-1.5 backdrop-blur-xl bg-white/10 border border-white/15 rounded-full px-3 py-1.5">
              <Star className="w-3.5 h-3.5 text-primary fill-primary" />
              <span className="text-white font-bold text-sm">{avgRating}</span>
              <span className="text-white/50 text-xs">({reviews.length})</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/60 text-xs">
              <MapPin className="w-3.5 h-3.5" />
              Douvaine
            </div>
          </div>

          <Link to="/booking">
            <motion.button whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-7 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-2xl shadow-primary/30 hover:bg-primary/90 transition-all">
              <Scissors className="w-4 h-4" />
              Réserver maintenant
            </motion.button>
          </Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">
        {/* Quick Info */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-2">
          {[
            { icon: Clock, label: 'Mar - Sam', sub: '9h - 20h' },
            { icon: Phone, label: 'Appeler', sub: '06 66 08 36 05' },
            { icon: MapPin, label: 'Itinéraire', sub: 'Douvaine' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="glass rounded-2xl p-3 text-center">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs font-semibold text-foreground">{label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </motion.div>

        {/* Services Preview */}
        <div>
          <SectionHeader title="Nos Prestations" subtitle="Services" linkTo="/services" />
          <div className="space-y-2.5">
            {services.slice(0, 4).map((service, i) => (
              <motion.div key={service.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="glass rounded-2xl px-4 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{service.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{service.duration} min</p>
                </div>
                <span className="text-sm font-bold text-primary">{service.price}€</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Team Preview */}
        <div>
          <SectionHeader title="Notre Équipe" subtitle="Les Barbers" />
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
            {employees.map((emp, i) => (
              <motion.div key={emp.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.07 }}
                className="flex-shrink-0 w-24 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden glass border-white/10 mb-2">
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt={emp.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
                      {emp.name?.charAt(0)}
                    </div>
                  )}
                </div>
                <p className="text-xs font-semibold text-foreground">{emp.name}</p>
                <p className="text-[11px] text-muted-foreground">{emp.title || 'Barber'}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Reviews */}
        {reviews.length > 0 && (
          <div>
            <SectionHeader title="Avis Clients" subtitle="Témoignages" />
            <div className="space-y-2.5">
              {reviews.slice(0, 3).map((review, i) => (
                <motion.div key={review.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{review.client_name || 'Client'}</p>
                      <StarRating rating={review.rating} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(review.created_date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{review.comment}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="glass-strong rounded-3xl p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <div className="relative">
            <img src={LOGO_URL} alt="D'Home Barber" className="w-16 h-16 object-contain mx-auto mb-3 opacity-80" />
            <h3 className="font-display text-lg font-bold text-foreground">Prêt pour un nouveau look ?</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Réservez votre créneau en quelques clics</p>
            <Link to="/booking">
              <motion.button whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-7 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all">
                Réserver
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
