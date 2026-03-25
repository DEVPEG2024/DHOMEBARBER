import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Clock, Phone, Star, ArrowRight, Scissors, ShoppingBag, Newspaper, Sparkles, Gift, GripVertical, Pencil, Check, X } from 'lucide-react';
import { motion, useMotionValue, useSpring, Reorder } from 'framer-motion';
import SectionHeader from '@/components/shared/SectionHeader';
import StarRating from '@/components/shared/StarRating';
import { useAuth } from '@/lib/AuthContext';

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

function BarberMarquee({ employees }) {
  const scrollRef = useRef(null);
  const autoScrollRef = useRef(null);
  const touchActiveRef = useRef(false);
  const resumeTimerRef = useRef(null);

  const startAutoScroll = useCallback(() => {
    if (autoScrollRef.current) return;
    autoScrollRef.current = setInterval(() => {
      const el = scrollRef.current;
      if (!el || touchActiveRef.current) return;
      el.scrollLeft += 1;
      // Loop back seamlessly when reaching halfway (duplicate content)
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half) {
        el.scrollLeft -= half;
      }
    }, 20);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoScroll();
    return () => {
      stopAutoScroll();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [startAutoScroll, stopAutoScroll]);

  const handleTouchStart = () => {
    touchActiveRef.current = true;
    stopAutoScroll();
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  };

  const handleTouchEnd = () => {
    touchActiveRef.current = false;
    resumeTimerRef.current = setTimeout(() => {
      startAutoScroll();
    }, 2000);
  };

  const doubled = [...employees, ...employees];

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 px-5 -mx-5 overflow-x-auto scrollbar-hide"
      style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
    >
      {doubled.map((emp, i) => (
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
    </div>
  );
}

const DEFAULT_SECTION_ORDER = ['quick-info', 'barbers', 'news', 'services', 'shop', 'reviews', 'gift-card', 'cta'];

const SECTION_LABELS = {
  'quick-info': 'Infos rapides',
  'barbers': 'Le Gang',
  'news': 'News Gang',
  'services': 'Prestations',
  'shop': 'Boutique',
  'reviews': 'Avis Clients',
  'gift-card': 'Carte Cadeau',
  'cta': 'Réservation',
};

export default function Home() {
  const [showHours, setShowHours] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sectionOrder, setSectionOrder] = useState(DEFAULT_SECTION_ORDER);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tilt = useParallaxTilt();
  const isAdmin = user?.role === 'admin';

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

  const { data: settingsData = [] } = useQuery({
    queryKey: ['salonSettings'],
    queryFn: () => api.entities.SalonSettings.list(),
  });

  const latestPost = posts[0] || null;
  const settings = settingsData[0] || null;

  // Load saved section order from settings
  useEffect(() => {
    if (settings?.homepage_order && Array.isArray(settings.homepage_order) && settings.homepage_order.length > 0) {
      // Merge: saved order first, then any new sections not in saved order
      const saved = settings.homepage_order.filter(id => DEFAULT_SECTION_ORDER.includes(id));
      const missing = DEFAULT_SECTION_ORDER.filter(id => !saved.includes(id));
      setSectionOrder([...saved, ...missing]);
    }
  }, [settings]);

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '5.0';

  // Build opening hours data from salon settings
  const openingHours = useMemo(() => {
    const oh = settings?.opening_hours;
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const fmt = (t) => { const [h, m] = t.split(':'); return m === '00' ? `${parseInt(h)}h` : `${parseInt(h)}h${m}`; };
    if (!oh) return dayLabels.map(l => ({ day: l, hours: '-', closed: true }));
    return dayNames.map((d, i) => {
      const info = oh[d];
      if (!info || info.closed) return { day: dayLabels[i], hours: 'Fermé', closed: true };
      return { day: dayLabels[i], hours: `${fmt(info.open)} - ${fmt(info.close)}`, closed: false };
    });
  }, [settings]);

  const openDaysLabel = useMemo(() => {
    const open = openingHours.filter(d => !d.closed);
    if (open.length === 0) return 'Fermé';
    return `Du ${open[0].day} au ${open[open.length - 1].day}`;
  }, [openingHours]);

  // Save section order to salon_settings
  const saveOrder = useCallback(async (newOrder) => {
    if (!settings?.id) return;
    setSaving(true);
    try {
      await api.entities.SalonSettings.update(settings.id, { homepage_order: newOrder });
      queryClient.invalidateQueries({ queryKey: ['salonSettings'] });
    } catch (err) {
      console.error('Save order error:', err);
    } finally {
      setSaving(false);
    }
  }, [settings, queryClient]);

  // Section renderers
  const renderSection = (id) => {
    switch (id) {
      case 'quick-info':
        return (
          <div className="grid grid-cols-3 gap-2">
            <motion.div whileTap={editMode ? {} : { scale: 0.93 }} onClick={editMode ? undefined : () => setShowHours(true)}
              className="glass rounded-2xl p-3 text-center cursor-pointer active:bg-white/10 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-green-500/15 flex items-center justify-center mx-auto mb-2 border border-green-500/20">
                <Clock className="w-4.5 h-4.5 text-green-500" />
              </div>
              <p className="text-xs font-semibold text-foreground">Horaires</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{openDaysLabel}</p>
            </motion.div>
            <motion.a href={editMode ? undefined : "tel:0666083605"} whileTap={editMode ? {} : { scale: 0.93 }} className="glass rounded-2xl p-3 text-center cursor-pointer active:bg-white/10 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-2 border border-white/20">
                <Phone className="w-4.5 h-4.5 text-white" />
              </div>
              <p className="text-xs font-semibold text-foreground">Appeler</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">06 66 08 36 05</p>
            </motion.a>
            <motion.a href={editMode ? undefined : "https://maps.google.com/?q=3+Rue+du+Bois+Arquet+74140+Douvaine"} target="_blank" rel="noopener noreferrer" whileTap={editMode ? {} : { scale: 0.93 }} className="glass rounded-2xl p-3 text-center cursor-pointer active:bg-white/10 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-2 border border-red-500/20">
                <MapPin className="w-4.5 h-4.5 text-red-500" />
              </div>
              <p className="text-xs font-semibold text-foreground">Itinéraire</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Douvaine</p>
            </motion.a>
          </div>
        );

      case 'barbers':
        return (
          <div>
            <SectionHeader title="Le Gang" subtitle="Les Barbers" />
            {employees.length > 0 && <BarberMarquee employees={employees} />}
          </div>
        );

      case 'news':
        if (!latestPost) return null;
        return (
          <div>
            <SectionHeader title="News Gang" subtitle="Dernière actu" linkTo="/feed" />
            <Link to="/feed">
              <motion.div whileTap={{ scale: 0.98 }} className="glass rounded-2xl overflow-hidden cursor-pointer group relative">
                {latestPost.image_url && (
                  <div className="w-full aspect-[16/9] relative">
                    <img src={latestPost.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 bg-primary/90 backdrop-blur-sm text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                          <Sparkles className="w-3 h-3" /> NEW
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
                        <Sparkles className="w-3 h-3" /> NEW
                      </span>
                      <Newspaper className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] text-muted-foreground">
                        {latestPost.created_at ? new Date(latestPost.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''}
                      </span>
                      {latestPost.author_name && <span className="text-[11px] font-medium text-foreground/70">· {latestPost.author_name}</span>}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed line-clamp-3">{latestPost.content}</p>
                    <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-3">
                      Voir le feed <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                )}
              </motion.div>
            </Link>
          </div>
        );

      case 'services':
        return (
          <div>
            <SectionHeader title="Nos Prestations" subtitle="Services" linkTo="/services" />
            <div className="grid grid-cols-2 gap-2.5">
              {services.slice(0, 4).map((service, i) => (
                <Link key={service.id} to="/booking">
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    whileTap={{ scale: 0.97 }} className="glass rounded-2xl p-4 relative overflow-hidden cursor-pointer group h-full">
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
          </div>
        );

      case 'shop':
        if (products.length === 0) return null;
        return (
          <div>
            <SectionHeader title="Notre Boutique" subtitle="Shop" linkTo="/shop" />
            <div className="grid grid-cols-2 gap-2.5">
              {products.slice(0, 4).map((product, i) => (
                <Link key={product.id} to="/shop">
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    whileTap={{ scale: 0.97 }} className="glass rounded-2xl overflow-hidden cursor-pointer group">
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
          </div>
        );

      case 'reviews':
        if (reviews.length === 0) return null;
        return (
          <div>
            <SectionHeader title="Avis Clients" subtitle="Témoignages" linkTo="/reviews" />
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-hide">
              {reviews.slice(0, 5).map((review, i) => (
                <motion.div key={review.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  className="glass rounded-2xl p-4 snap-start shrink-0 w-[280px]">
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
                  {review.comment && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{review.comment}</p>}
                </motion.div>
              ))}
            </div>
          </div>
        );

      case 'gift-card':
        return (
          <Link to="/gift-cards">
            <motion.div whileTap={{ scale: 0.98 }} className="relative overflow-hidden rounded-3xl cursor-pointer group" style={{ aspectRatio: '2.2/1' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]" />
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full group-hover:from-primary/30 transition-all duration-500" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-primary/10 to-transparent rounded-tr-full" />
              <div className="absolute inset-[1px] rounded-3xl border border-white/10" />
              <div className="relative h-full flex items-center justify-between p-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="w-4 h-4 text-primary" />
                    <p className="text-[10px] tracking-[0.3em] uppercase text-white/50 font-medium">Carte Cadeau</p>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">Offrez une expérience</h3>
                  <p className="text-xs text-white/50">Carte premium valable 1 an</p>
                  <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-3 group-hover:gap-2 transition-all">
                    Créer une carte <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
                <img src={LOGO_URL} alt="" className="w-16 h-16 object-contain opacity-30 group-hover:opacity-50 transition-opacity" />
              </div>
            </motion.div>
          </Link>
        );

      case 'cta':
        return (
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
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-20 w-48 h-48 rounded-full bg-primary/8 blur-3xl" />
        </div>

        <div className="relative flex flex-col items-center justify-center px-5 pt-10 pb-6">
          <div className="relative mb-2">
            <motion.div className="absolute inset-0 rounded-full" initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.8, 1.05, 0.8] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.4) 0%, rgba(34,197,94,0.15) 40%, transparent 70%)', filter: 'blur(30px)' }} />
            <motion.div className="absolute inset-0 rounded-full"
              animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.9, 1.15, 0.9] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 60%)', filter: 'blur(50px)' }} />
            <motion.img
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: [1, 1.03, 1] }}
              transition={{ opacity: { duration: 0.6 }, scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
              src={LOGO_URL} alt="D'Home Barber"
              className="relative w-64 h-64 object-contain drop-shadow-2xl"
              style={IS_MOBILE ? {} : { x: tilt.x, y: tilt.y, rotateX: tilt.rotateX, rotateY: tilt.rotateY, perspective: 800 }} />
          </div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="text-sm font-light tracking-[0.3em] uppercase text-white/70 mb-3">
            Premium BarberShop
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="flex items-center gap-3 mb-5">
            <Link to="/reviews" className="flex items-center gap-1.5 backdrop-blur-xl bg-white/10 border border-white/15 rounded-full px-3 py-1.5 active:scale-95 transition-transform">
              <Star className="w-3.5 h-3.5 text-primary fill-primary" />
              <span className="text-white font-bold text-sm">{avgRating}</span>
              <span className="text-white/50 text-xs">({reviews.length})</span>
            </Link>
            <div className="flex items-center gap-1.5 text-white/60 text-xs">
              <MapPin className="w-3.5 h-3.5" /> Douvaine
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
            <Link to="/booking">
              <motion.button whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-7 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-2xl shadow-primary/30 hover:bg-primary/90 transition-all">
                <Scissors className="w-4 h-4" /> Réserver maintenant
              </motion.button>
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex items-center gap-3 mt-4">
            <motion.a href="https://www.instagram.com/dhomebarber_74" target="_blank" rel="noopener noreferrer" whileTap={{ scale: 0.9 }}
              className="w-11 h-11 rounded-xl backdrop-blur-xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </motion.a>
            <motion.a href="https://www.tiktok.com/@dhomebarber" target="_blank" rel="noopener noreferrer" whileTap={{ scale: 0.9 }}
              className="w-11 h-11 rounded-xl backdrop-blur-xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13.2a8.16 8.16 0 005.58 2.17V11.9a4.83 4.83 0 01-3.77-1.87V6.69h3.77z"/>
              </svg>
            </motion.a>
          </motion.div>
        </div>
      </div>

      {/* Sections - Reorderable by admin */}
      <div className="max-w-lg mx-auto px-5 py-6">
        {editMode ? (
          /* Admin edit mode - drag to reorder */
          <Reorder.Group axis="y" values={sectionOrder} onReorder={setSectionOrder} className="space-y-4">
            {sectionOrder.map((id) => (
              <Reorder.Item key={id} value={id} className="cursor-grab active:cursor-grabbing">
                <div className="relative">
                  {/* Drag handle overlay */}
                  <div className="absolute -left-2 -right-2 -top-1 -bottom-1 rounded-2xl border-2 border-dashed border-primary/30 pointer-events-none z-10" />
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-primary px-3 py-1 rounded-full shadow-lg">
                    <GripVertical className="w-3 h-3 text-primary-foreground" />
                    <span className="text-[10px] font-bold text-primary-foreground uppercase tracking-wider">{SECTION_LABELS[id]}</span>
                  </div>
                  <div className="opacity-60 pointer-events-none pt-2">
                    {renderSection(id)}
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        ) : (
          /* Normal mode */
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
            {sectionOrder.map((id) => {
              const content = renderSection(id);
              if (!content) return null;
              return (
                <motion.div key={id} variants={itemVariants}>
                  {content}
                </motion.div>
              );
            })}
          </motion.div>
        )}
        <div className="h-4" />
      </div>

      {/* Modal horaires */}
      {showHours && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5" onClick={() => setShowHours(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()} className="relative w-full max-w-sm rounded-3xl bg-card border border-border p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-green-500/15 flex items-center justify-center border border-green-500/20">
                <Clock className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Horaires d'ouverture</h3>
                <p className="text-xs text-muted-foreground">{openDaysLabel}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {openingHours.map(({ day, hours, closed }) => (
                <div key={day} className={`flex items-center justify-between py-2 px-3 rounded-xl ${closed ? 'opacity-40' : 'bg-white/5'}`}>
                  <span className="text-sm font-medium text-foreground">{day}</span>
                  <span className={`text-sm font-semibold ${closed ? 'text-red-400' : 'text-green-400'}`}>{hours}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowHours(false)} className="w-full mt-5 py-3 rounded-2xl bg-white/10 text-sm font-semibold text-foreground hover:bg-white/15 transition-colors">
              Fermer
            </button>
          </motion.div>
        </div>
      )}

      {/* Admin FAB - Organize homepage */}
      {isAdmin && (
        <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
          {editMode && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                saveOrder(sectionOrder);
                setEditMode(false);
              }}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-green-500 text-white text-sm font-bold shadow-2xl shadow-green-500/30 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </motion.button>
          )}
          {editMode && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                // Reset to saved order
                if (settings?.homepage_order?.length > 0) {
                  setSectionOrder([...settings.homepage_order]);
                } else {
                  setSectionOrder([...DEFAULT_SECTION_ORDER]);
                }
                setEditMode(false);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-card border border-border text-sm font-semibold text-muted-foreground shadow-xl"
            >
              <X className="w-4 h-4" /> Annuler
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl transition-all ${
              editMode
                ? 'bg-red-500/90 text-white shadow-red-500/30'
                : 'bg-primary text-primary-foreground shadow-primary/30'
            }`}
          >
            <Pencil className="w-4 h-4" />
            {editMode ? 'Mode édition' : 'Organiser'}
          </motion.button>
        </div>
      )}
    </div>
  );
}
