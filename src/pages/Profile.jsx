import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import {
  Calendar, Star, ShoppingBag, Settings, LogOut, ChevronRight, Shield, Bell, Camera, Shirt,
  Handshake, Heart, IdCard, Gift, CalendarCheck, CalendarClock, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError, queryFailed } from '@/components/shared/LoadError';
import ImageCropDialog, { unreadableImageMessage } from '@/components/shared/ImageCropDialog';
import { formatPrice } from '@/components/services/serviceUtils';
import { useGangCard, useInvalidateGang } from '@/lib/gangCardApi';
import GangCard, { GangCardPlaceholder } from '@/components/gang/GangCard';
import { gangPalette } from '@/components/gang/gangTheme';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { NOTIFICATIONS_EVENT, readNotifications } from '@/lib/pushNotifications';
import Reveal, { RevealGroup, RevealItem } from '@/components/motion/Reveal';
import AnimatedCounter from '@/components/motion/AnimatedCounter';
import NextVisitCard from '@/components/profile/NextVisitCard';
import ShortcutGrid from '@/components/profile/ShortcutGrid';
import FavoritesCarousel from '@/components/profile/FavoritesCarousel';
import { OPEN_ORDER_STATUSES, VISIT_STATUSES, endsAt, firstName } from '@/components/profile/profileUtils';

// Taille de la carte en tête du profil : la largeur de l'écran moins les marges, 0,9 au plus
function useProfileCardSize() {
  const compute = () => (typeof window === 'undefined' ? 0.8 : Math.max(0.62, Math.min(0.9, (Math.min(window.innerWidth, 512) - 76) / 300)));
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** Notifications non lues rangées sur l'appareil (mises à jour à chaque réception / lecture). */
function useUnreadNotifications(userId) {
  const count = () => (userId ? readNotifications(userId).filter((n) => !n.read).length : 0);
  const [unread, setUnread] = useState(count);
  useEffect(() => {
    const refresh = () => setUnread(count());
    refresh();
    window.addEventListener(NOTIFICATIONS_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [userId]);
  return unread;
}

/** Salut selon l'heure de Paris. */
function greeting() {
  const h = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(new Date()));
  if (h >= 5 && h < 18) return 'Salut';
  return 'Bonsoir';
}

/**
 * Profil client en tableau de bord (18 oct. 2026) : salut et réglages, carte Gang, prochaine
 * visite (compte à rebours) ou jauge de fraîcheur, chiffres qui montent, raccourcis avec
 * pastilles, carrousel des favoris. Le staff garde l'avatar à la place de la carte Gang.
 */
export default function Profile() {
  const invalidateGang = useInvalidateGang();
  const { user, logout, refreshUser } = useAuth();
  const fileInputRef = useRef(null);
  const [cropImage, setCropImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    // On vérifie que le navigateur sait décoder la photo avant d'ouvrir le recadrage
    // (HEIC hors Safari, fichier abîmé) : sinon la fenêtre s'ouvrirait vide.
    reader.onload = () => {
      const probe = new Image();
      probe.onload = () => setCropImage(reader.result);
      probe.onerror = () => toast.error(unreadableImageMessage(file));
      probe.src = reader.result;
    };
    reader.onerror = () => toast.error(unreadableImageMessage(file));
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedFile) => {
    setCropImage(null);
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file: croppedFile });
      await api.entities.User.update(user.id, { photo_url: file_url });
      if (refreshUser) await refreshUser();
      // La photo est aussi celle de la carte Gang
      invalidateGang();
      toast.success('Photo de profil mise à jour');
    } catch (err) {
      toast.error(friendlyError(err, 'Erreur lors de la mise à jour de la photo'));
    } finally {
      setUploading(false);
    }
  };

  // Carte Gang : en tête du profil pour un client (le staff garde l'avatar). Rien de bloquant si
  // la requête échoue sans aucune donnée, ou reste en pause hors connexion (React Query ne lève
  // alors aucune erreur) : on retombe sur l'avatar et sur la tuile « Carte Gang », dont la page
  // affiche « Pas de connexion ». Un rafraîchissement en arrière-plan qui échoue (`isError` avec
  // la carte encore en cache) garde la carte affichée.
  const isClient = user?.role === 'user';
  const gangQuery = useGangCard({ enabled: !!user && isClient });
  const { data: gangData, isPending: gangPending } = gangQuery;
  const gangCard = gangData?.card || null;
  const showGangHero = isClient && !queryFailed(gangQuery);
  const cardSize = useProfileCardSize();
  const gangDesc = gangCard
    ? `${gangPalette(gangCard).label} · ${gangCard.visits} visite${Number(gangCard.visits) > 1 ? 's' : ''}`
    : null;

  const { data: appointments = [], isLoading: loadingStats, isError: statsError } = useQuery({
    queryKey: ['myAppointments', user?.email],
    queryFn: () => api.entities.Appointment.filter({ client_email: user?.email }, '-date', 100),
    enabled: !!user,
  });
  // Mêmes clé et requête que Mes commandes (cache partagé)
  const { data: orders = [] } = useQuery({
    queryKey: ['myOrders', user?.email],
    queryFn: () => api.entities.Order.filter({ client_email: user?.email }, '-created_date', 100),
    enabled: !!user?.email,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000,
    queryFn: fetchPublicBarbers,
  });
  const unread = useUnreadNotifications(user?.id);

  const now = Date.now();
  const dated = (Array.isArray(appointments) ? appointments : []).filter(a => a?.date);
  const visits = dated.filter(a => VISIT_STATUSES.includes(a.status) && endsAt(a) <= now);
  // Une visite par jour, comme la carte Gang (une famille qui réserve 3 RDV le même jour = 1 visite)
  const visitDays = new Set(visits.map(a => String(a.date).slice(0, 10))).size;
  const upcomingCount = dated.filter(a => a.status === 'confirmed' && endsAt(a) > now).length;
  // Montant réglé (encaissement du salon, produits et pourboire compris) sinon prix des prestations
  const totalSpent = visits.reduce((sum, a) => sum + (Number(a.grand_total) || Number(a.total_price) || 0), 0);
  // Pas de « 0 » trompeur pendant le chargement ou après un échec
  const statsReady = !loadingStats && !(statsError && !appointments.length);
  const openOrders = (Array.isArray(orders) ? orders : []).filter(o => OPEN_ORDER_STATUSES.includes(o?.status)).length;
  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';
  const prenom = firstName(user?.full_name);

  const shortcuts = [
    { to: '/appointments', label: 'Rendez-vous', icon: Calendar, badge: upcomingCount },
    { to: '/orders', label: 'Commandes', icon: ShoppingBag, badge: openOrders },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unread },
    { to: '/favorites', label: 'Favoris', icon: Heart, badge: 0 },
    isClient
      ? { to: '/gang-card', label: 'Carte Gang', icon: IdCard, badge: 0 }
      : { to: '/settings', label: 'Paramètres', icon: Settings, badge: 0 },
    { to: '/gift-cards', label: 'Cartes cadeau', icon: Gift, badge: 0 },
    { to: '/textile', label: 'Textile', icon: Shirt, badge: 0 },
    { to: '/partners', label: 'Bons plans', icon: Handshake, badge: 0 },
    { to: '/reviews', label: 'Avis', icon: Star, badge: 0 },
  ];

  const stats = [
    { icon: CalendarCheck, label: 'Visites', value: visitDays },
    { icon: CalendarClock, label: 'À venir', value: upcomingCount },
    { icon: Wallet, label: 'Total', value: totalSpent, format: (v) => formatPrice(Math.round(v)) },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-40 -right-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-6 pb-28 space-y-6">
        {/* Salut + réglages */}
        {/* pr-10 : le bouton musique (32 px, en haut à droite de toutes les pages) reste à côté du réglage */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-3 pr-10">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-semibold">Mon espace</p>
            <h1 className="font-display text-2xl max-[360px]:text-xl font-bold text-foreground leading-tight break-words">
              {user ? `${greeting()}${prenom ? ` ${prenom}` : ''} 👋` : 'Chargement...'}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{gangDesc || user?.email}</p>
          </div>
          <Link to="/settings" aria-label="Paramètres"
            className="w-11 h-11 shrink-0 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform">
            <Settings className="w-5 h-5 text-foreground/80" />
          </Link>
        </motion.div>

        {/* Carte Gang (client) ou avatar (staff) */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-center">
          {showGangHero && (
            <div className="flex flex-col items-center">
              <div className="glow-breathe">
                {gangPending ? (
                  // Emplacement réservé pendant le chargement : la page ne saute pas
                  <div style={{ width: 300 * cardSize, height: 440 * cardSize }} aria-hidden="true" />
                ) : gangCard ? (
                  <GangCard card={gangCard} size={cardSize} />
                ) : (
                  <GangCardPlaceholder size={cardSize} />
                )}
              </div>
              {/* Lien seulement une fois la réponse connue : pendant le chargement, un client
                  fidèle ne doit pas lire « Réserver ma première visite » */}
              {!gangPending && (
                <Link to={gangCard ? '/gang-card' : '/booking'}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                  {gangCard ? 'Voir ma carte, mes écussons et la collection' : 'Réserver ma première visite'}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}

          {/* Avatar (staff) ; pour un client, la photo est sur la carte : simple bouton pour la changer */}
          <div className={`relative inline-block ${showGangHero ? 'hidden' : ''}`}>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-3xl overflow-hidden border border-primary/20 shadow-2xl shadow-primary/10 group"
              disabled={uploading}
            >
              {user?.photo_url ? (
                <img src={user.photo_url} alt="Photo de profil" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <span className="text-3xl font-bold text-primary font-display">{initials}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </button>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Camera className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />

          <ImageCropDialog
            open={!!cropImage}
            imageSrc={cropImage}
            onOpenChange={(open) => { if (!open) setCropImage(null); }}
            onCropComplete={handleCropComplete}
          />

          {showGangHero && (
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
              >
                <Camera className="w-3.5 h-3.5" />
                {uploading ? 'Envoi…' : user?.photo_url ? 'Changer ma photo' : 'Ajouter ma photo sur la carte'}
              </button>
            </div>
          )}

          {(user?.role === 'admin' || user?.role === 'manager') && (
            <div>
              <Link to="/admin">
                <motion.button whileTap={{ scale: 0.95 }}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                  <Shield className="w-3.5 h-3.5" />
                  Espace Admin
                </motion.button>
              </Link>
            </div>
          )}
        </motion.div>

        {/* Prochaine visite ou fraîcheur */}
        <Reveal>
          <NextVisitCard
            appointments={appointments}
            employees={employees}
            gangCard={gangCard}
            loading={loadingStats || (isClient && gangPending)}
          />
        </Reveal>

        {/* Chiffres */}
        <RevealGroup className="grid grid-cols-3 gap-2.5">
          {stats.map(({ icon: Icon, label, value, format }, i) => (
            <RevealItem key={label}
              className="rounded-2xl bg-white/[0.04] border border-white/8 backdrop-blur-xl px-2 py-3.5 text-center">
              <Icon className="w-4 h-4 text-primary/70 mx-auto mb-1.5" />
              {/* Montant long (« 1250 € ») : plus petit pour tenir dans la colonne à 320 px */}
              <p className={`${statsReady && format && formatPrice(Math.round(value)).length > 5 ? 'text-lg leading-8' : 'text-2xl'} font-bold text-primary font-display whitespace-nowrap`}>
                {statsReady ? <AnimatedCounter value={value} format={format} delay={0.1 + i * 0.08} /> : '–'}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
            </RevealItem>
          ))}
        </RevealGroup>

        {/* Raccourcis */}
        <section>
          <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold mb-2">Ton espace</p>
          <ShortcutGrid items={shortcuts} />
        </section>

        {/* Favoris */}
        <FavoritesCarousel />

        {/* Paramètres et déconnexion */}
        <Reveal className="space-y-2.5">
          <Link to="/settings"
            className="flex items-center justify-between px-4 py-3.5 rounded-2xl border border-white/8 bg-white/[0.04] active:scale-[0.99] transition-transform">
            <span className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center"><Settings className="w-4 h-4 text-foreground/80" /></span>
              <span>
                <span className="block text-sm font-semibold text-foreground">Paramètres</span>
                <span className="block text-[11px] text-muted-foreground">Compte, notifications, bugs et suggestions</span>
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
          </Link>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={async () => {
              setLoggingOut(true);
              await logout();
            }}
            disabled={loggingOut}
            className="w-full h-12 rounded-2xl border border-red-500/20 bg-red-500/8 text-red-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-500/12 transition-colors disabled:opacity-60"
          >
            <LogOut className="w-4 h-4" />
            {loggingOut ? 'Déconnexion…' : 'Déconnexion'}
          </motion.button>
        </Reveal>
      </div>
    </div>
  );
}
