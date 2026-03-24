import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Clock, Phone, Star, ArrowRight, Scissors } from 'lucide-react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import SectionHeader from '@/components/shared/SectionHeader';
import StarRating from '@/components/shared/StarRating';

const IS_MOBILE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function useParallaxTilt() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);

  const springConfig = { stiffness: 120, damping: 18, mass: 0.8 };
  const sx = useSpring(x, springConfig);
  const sy = useSpring(y, springConfig);
  const srx = useSpring(rotateX, springConfig);
  const sry = useSpring(rotateY, springConfig);

  useEffect(() => {
    if (IS_MOBILE) return;

    const handleMouse = (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const nx = ((e.clientX - cx) / cx) * 15;
      const ny = ((e.clientY - cy) / cy) * 15;
      x.set(nx);
      y.set(ny);
      rotateY.set(nx * 0.5);
      rotateX.set(-ny * 0.5);
    };

    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, [x, y, rotateX, rotateY]);

  return { x: sx, y: sy, rotateX: srx, rotateY: sry };
}

const LOGO_URL = '/logo.png';

export default function Home() {
  const tilt = useParallaxTilt();
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
        <div className="relative flex flex-col items-center justify-center px-5 pt-10 pb-8">
          {/* Logo with pulse + green glow */}
          <div className="relative mb-2">
            {/* Green glow pulse behind logo */}
            <motion.div
              className="absolute inset-0 rounded-full"
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0.3, 0.7, 0.3],
                scale: [0.8, 1.05, 0.8],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                background: 'radial-gradient(circle, rgba(34,197,94,0.4) 0%, rgba(34,197,94,0.15) 40%, transparent 70%)',
                filter: 'blur(30px)',
              }}
            />
            {/* Second glow layer for depth */}
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                opacity: [0.2, 0.5, 0.2],
                scale: [0.9, 1.15, 0.9],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.3,
              }}
              style={{
                background: 'radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 60%)',
                filter: 'blur(50px)',
              }}
            />
            {/* Logo */}
            <motion.img
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{
                opacity: 1,
                scale: [1, 1.03, 1],
              }}
              transition={{
                opacity: { duration: 0.6 },
                scale: {
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                },
              }}
              src={LOGO_URL}
              alt="D'Home Barber"
              className="relative w-72 h-72 object-contain drop-shadow-2xl"
              style={IS_MOBILE ? {} : {
                x: tilt.x,
                y: tilt.y,
                rotateX: tilt.rotateX,
                rotateY: tilt.rotateY,
                perspective: 800,
              }}
            />
          </div>
          <p className="text-sm font-light tracking-[0.3em] uppercase text-white/70 mb-4">Premium BarberShop</p>

          <div className="flex items-center gap-3 mb-5">
            <Link to="/reviews" className="flex items-center gap-1.5 backdrop-blur-xl bg-white/10 border border-white/15 rounded-full px-3 py-1.5 active:scale-95 transition-transform">
              <Star className="w-3.5 h-3.5 text-primary fill-primary" />
              <span className="text-white font-bold text-sm">{avgRating}</span>
              <span className="text-white/50 text-xs">({reviews.length})</span>
            </Link>
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

          {/* Social Media */}
          <div className="flex items-center gap-3 mt-4">
            <motion.a
              href="https://www.instagram.com/dhomebarber"
              target="_blank"
              rel="noopener noreferrer"
              whileTap={{ scale: 0.9 }}
              className="w-11 h-11 rounded-xl backdrop-blur-xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </motion.a>
            <motion.a
              href="https://www.tiktok.com/@dhomebarber"
              target="_blank"
              rel="noopener noreferrer"
              whileTap={{ scale: 0.9 }}
              className="w-11 h-11 rounded-xl backdrop-blur-xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13.2a8.16 8.16 0 005.58 2.17V11.9a4.83 4.83 0 01-3.77-1.87V6.69h3.77z"/>
              </svg>
            </motion.a>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">
        {/* Quick Info */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-2">
          {[
            { icon: Clock, label: 'Mar - Sam', sub: '9h - 20h', href: null },
            { icon: Phone, label: 'Appeler', sub: '06 66 08 36 05', href: 'tel:0666083605' },
            { icon: MapPin, label: 'Itinéraire', sub: 'Douvaine', href: 'https://maps.google.com/?q=3+Rue+du+Bois+Arquet+74140+Douvaine' },
          ].map(({ icon: Icon, label, sub, href }) => {
            const content = (
              <>
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
              </>
            );
            return href ? (
              <motion.a
                key={label}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                whileTap={{ scale: 0.93 }}
                className="glass rounded-2xl p-3 text-center cursor-pointer active:bg-white/10 transition-colors"
              >
                {content}
              </motion.a>
            ) : (
              <div key={label} className="glass rounded-2xl p-3 text-center">
                {content}
              </div>
            );
          })}
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
          <div className="grid grid-cols-5 gap-2">
            {employees.map((emp, i) => (
              <Link key={emp.id} to={`/barber/${emp.id}`}>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.07 }}
                  whileTap={{ scale: 0.93 }}
                  className="text-center cursor-pointer">
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
              </Link>
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
