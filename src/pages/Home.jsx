import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Clock, Phone, Star, ArrowRight, Scissors, ShoppingBag, Newspaper, Sparkles } from 'lucide-react';
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

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export default function Home() {
  const tilt = useParallaxTilt();
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api.entities.Review.filter({ is_visible: true }, '-created_date', 5),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.filter({ is_active: true }, 'name', 50),
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['latestPost'],
    queryFn: () => api.entities.Post.list('-created_at', 1),
  });

  const latestPost = posts[0] || null;

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '5.0';

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Decorative background shapes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-20 w-48 h-48 rounded-full bg-primary/8 blur-3xl" />
        </div>

        <div className="relative flex flex-col items-center justify-center px-5 pt-10 pb-6">
          {/* Logo with pulse + green glow */}
          <div className="relative mb-2">
            <motion.div
              className="absolute inset-0 rounded-full"
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0.3, 0.7, 0.3],
                scale: [0.8, 1.05, 0.8],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                background: 'radial-gradient(circle, rgba(34,197,94,0.4) 0%, rgba(34,197,94,0.15) 40%, transparent 70%)',
                filter: 'blur(30px)',
              }}
            />
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                opacity: [0.2, 0.5, 0.2],
                scale: [0.9, 1.15, 0.9],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              style={{
                background: 'radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 60%)',
                filter: 'blur(50px)',
              }}
            />
            <motion.img
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: [1, 1.03, 1] }}
              transition={{
                opacity: { duration: 0.6 },
                scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
              }}
              src={LOGO_URL}
              alt="D'Home Barber"
              className="relative w-64 h-64 object-contain drop-shadow-2xl"
              style={IS_MOBILE ? {} : {
                x: tilt.x,
                y: tilt.y,
                rotateX: tilt.rotateX,
                rotateY: tilt.rotateY,
                perspective: 800,
              }}
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm font-light tracking-[0.3em] uppercase text-white/70 mb-3"
          >
            Premium BarberShop
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-3 mb-5"
          >
            <Link to="/reviews" className="flex items-center gap-1.5 backdrop-blur-xl bg-white/10 border border-white/15 rounded-full px-3 py-1.5 active:scale-95 transition-transform">
              <Star className="w-3.5 h-3.5 text-primary fill-primary" />
              <span className="text-white font-bold text-sm">{avgRating}</span>
              <span className="text-white/50 text-xs">({reviews.length})</span>
            </Link>
            <div className="flex items-center gap-1.5 text-white/60 text-xs">
              <MapPin className="w-3.5 h-3.5" />
              Douvaine
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
          >
            <Link to="/booking">
              <motion.button whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-7 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-2xl shadow-primary/30 hover:bg-primary/90 transition-all">
                <Scissors className="w-4 h-4" />
                Réserver maintenant
              </motion.button>
            </Link>
          </motion.div>

          {/* Social Media */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center gap-3 mt-4"
          >
            <motion.a
              href="https://www.instagram.com/dhomebarber_74"
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
          </motion.div>
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-lg mx-auto px-5 py-6 space-y-8"
      >
        {/* Quick Info - Vert / Blanc / Rouge */}
        <motion.div variants={itemVariants} className="grid grid-cols-3 gap-2">
          {[
            { icon: Clock, label: 'Mar - Sam', sub: '9h - 20h', href: null, iconColor: 'text-green-500', bgColor: 'bg-green-500/15', borderColor: 'border-green-500/20' },
            { icon: Phone, label: 'Appeler', sub: '06 66 08 36 05', href: 'tel:0666083605', iconColor: 'text-white', bgColor: 'bg-white/15', borderColor: 'border-white/20' },
            { icon: MapPin, label: 'Itinéraire', sub: 'Douvaine', href: 'https://maps.google.com/?q=3+Rue+du+Bois+Arquet+74140+Douvaine', iconColor: 'text-red-500', bgColor: 'bg-red-500/15', borderColor: 'border-red-500/20' },
          ].map(({ icon: Icon, label, sub, href, iconColor, bgColor, borderColor }) => {
            const content = (
              <>
                <div className={`w-10 h-10 rounded-2xl ${bgColor} flex items-center justify-center mx-auto mb-2 border ${borderColor}`}>
                  <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
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

        {/* Team / Barbers - Auto-scrolling marquee */}
        <motion.div variants={itemVariants}>
          <SectionHeader title="Le Gang" subtitle="Les Barbers" />
          {employees.length > 0 && (
            <div className="overflow-hidden -mx-5">
              <motion.div
                className="flex gap-3 px-5 w-max"
                animate={{ x: ['0%', '-50%'] }}
                transition={{
                  x: {
                    duration: employees.length * 4,
                    repeat: Infinity,
                    ease: 'linear',
                  },
                }}
              >
                {/* Double the list for seamless loop */}
                {[...employees, ...employees].map((emp, i) => (
                  <Link key={`${emp.id}-${i}`} to={`/barber/${emp.id}`} className="shrink-0">
                    <motion.div
                      whileTap={{ scale: 0.95 }}
                      className="relative w-28 cursor-pointer group"
                    >
                      <div className="w-28 h-32 rounded-2xl overflow-hidden glass border border-white/10 mb-2 relative">
                        {emp.photo_url ? (
                          <img src={emp.photo_url} alt={emp.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground bg-gradient-to-br from-primary/10 to-primary/5">
                            {emp.name?.charAt(0)}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-xs font-bold text-white drop-shadow-lg">{emp.name}</p>
                          <p className="text-[10px] text-white/70">{emp.title || 'Barber'}</p>
                        </div>
                      </div>
                    </motion.div>
                  </Link>
                ))}
              </motion.div>
            </div>
          )}
        </motion.div>

        {/* News Gang - Now right after barbers */}
        {latestPost && (
          <motion.div variants={itemVariants}>
            <SectionHeader title="News Gang" subtitle="Dernière actu" linkTo="/feed" />
            <Link to="/feed">
              <motion.div
                whileTap={{ scale: 0.98 }}
                className="glass rounded-2xl overflow-hidden cursor-pointer group relative"
              >
                {latestPost.image_url && (
                  <div className="w-full aspect-[16/9] relative">
                    <img src={latestPost.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 bg-primary/90 backdrop-blur-sm text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                          <Sparkles className="w-3 h-3" />
                          NEW
                        </span>
                        <span className="text-[11px] text-white/70">
                          {latestPost.created_at ? new Date(latestPost.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-white font-medium leading-relaxed line-clamp-2 drop-shadow-lg">{latestPost.content}</p>
                      <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-2">
                        Voir le feed <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                )}
                {!latestPost.image_url && (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 bg-primary/90 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <Sparkles className="w-3 h-3" />
                        NEW
                      </span>
                      <Newspaper className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] text-muted-foreground">
                        {latestPost.created_at ? new Date(latestPost.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''}
                      </span>
                      {latestPost.author_name && (
                        <span className="text-[11px] font-medium text-foreground/70">· {latestPost.author_name}</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed line-clamp-3">{latestPost.content}</p>
                    <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-3">
                      Voir le feed <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                )}
              </motion.div>
            </Link>
          </motion.div>
        )}

        {/* Services / Prestations - Redesigned */}
        <motion.div variants={itemVariants}>
          <SectionHeader title="Nos Prestations" subtitle="Services" linkTo="/services" />
          <div className="grid grid-cols-2 gap-2.5">
            {services.slice(0, 4).map((service, i) => (
              <Link key={service.id} to="/booking">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileTap={{ scale: 0.97 }}
                  className="glass rounded-2xl p-4 relative overflow-hidden cursor-pointer group h-full"
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-3xl" />
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <Scissors className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">{service.name}</p>
                  <p className="text-[11px] text-muted-foreground mb-2">{service.duration} min</p>
                  <p className="text-base font-bold text-primary">{service.price}€</p>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Shop / Produits */}
        {products.length > 0 && (
          <motion.div variants={itemVariants}>
            <SectionHeader title="Notre Boutique" subtitle="Shop" linkTo="/shop" />
            <div className="grid grid-cols-2 gap-2.5">
              {products.slice(0, 4).map((product, i) => (
                <Link key={product.id} to="/shop">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileTap={{ scale: 0.97 }}
                    className="glass rounded-2xl overflow-hidden cursor-pointer group"
                  >
                    {product.image_url ? (
                      <div className="w-full aspect-square bg-white rounded-t-2xl overflow-hidden">
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" />
                      </div>
                    ) : (
                      <div className="w-full aspect-square bg-white rounded-t-2xl flex items-center justify-center">
                        <ShoppingBag className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-xs font-semibold text-foreground truncate">{product.name}</p>
                      {product.brand && <p className="text-[11px] text-muted-foreground truncate">{product.brand}</p>}
                      <p className="text-sm font-bold text-primary mt-1">{product.price}€</p>
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* Reviews / Avis - Redesigned */}
        {reviews.length > 0 && (
          <motion.div variants={itemVariants}>
            <SectionHeader title="Avis Clients" subtitle="Témoignages" linkTo="/reviews" />
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-hide">
              {reviews.slice(0, 5).map((review, i) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="glass rounded-2xl p-4 snap-start shrink-0 w-[280px]"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-bold text-primary border border-primary/20">
                        {(review.client_name || 'C').charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{review.client_name || 'Client'}</p>
                        <StarRating rating={review.rating} />
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(review.created_date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{review.comment}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div variants={itemVariants}>
          <div className="glass-strong rounded-3xl p-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
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
        </motion.div>

        <div className="h-4" />
      </motion.div>
    </div>
  );
}
