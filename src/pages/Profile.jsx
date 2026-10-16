import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { Calendar, Star, ShoppingBag, Settings, LogOut, ChevronRight, Shield, Bell, Camera, Shirt, Handshake, Heart, IdCard } from 'lucide-react';
import { toast } from 'sonner';
import ImageCropDialog, { unreadableImageMessage } from '@/components/shared/ImageCropDialog';
import { parisInstant } from '@/lib/calendarLinks';
import { formatPrice } from '@/components/services/serviceUtils';
import { useGangCard, useInvalidateGang } from '@/lib/gangCardApi';
import GangCard, { GangCardPlaceholder } from '@/components/gang/GangCard';
import { gangPalette } from '@/components/gang/gangTheme';

// Fin d'un rendez-vous à l'heure de Paris (sans heure de fin : son début, sinon fin de journée)
const endsAt = (apt) => parisInstant(apt.date, apt.end_time || apt.start_time || '23:59');
// Une visite = rendez-vous honoré : confirmé (le salon n'utilise pas « Valider la prestation »)
// ou terminé, et dont l'heure de fin est passée
const VISIT_STATUSES = ['confirmed', 'completed'];

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

const menuItems = [
  { icon: Calendar, label: 'Mes Rendez-vous', path: '/appointments', desc: 'Historique & prochains RDV' },
  { icon: Bell, label: 'Notifications', path: '/notifications', desc: 'Messages & alertes' },
  { icon: ShoppingBag, label: 'Mes Commandes', path: '/orders', desc: 'Suivi de vos achats' },
  { icon: Heart, label: 'Mes favoris', path: '/favorites', desc: 'Prestations et produits que vous aimez' },
  { icon: Shirt, label: 'Textile & Drops', path: '/textile', desc: 'Concepts, votes & réservations' },
  { icon: Handshake, label: 'Bons plans du Gang', path: '/partners', desc: 'Remises chez nos partenaires' },
  { icon: Star, label: 'Avis', path: '/reviews', desc: 'Avis clients et les vôtres' },
  { icon: Settings, label: 'Paramètres', path: '/settings', desc: 'Compte & préférences' },
];

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
      toast.error(err?.message || 'Erreur lors de la mise à jour de la photo');
    } finally {
      setUploading(false);
    }
  };

  // Carte Gang : en tête du profil pour un client (le staff garde l'avatar). Rien de bloquant si
  // la requête échoue sans aucune donnée : on retombe sur l'avatar. Un rafraîchissement en
  // arrière-plan qui échoue (`isError` avec la carte encore en cache) garde la carte affichée.
  const isClient = user?.role === 'user';
  const { data: gangData, isPending: gangPending, isError: gangError } = useGangCard({ enabled: !!user && isClient });
  const gangCard = gangData?.card || null;
  const showGangHero = isClient && !(gangError && !gangData);
  const cardSize = useProfileCardSize();
  const gangDesc = gangCard
    ? `${gangPalette(gangCard).label} · ${gangCard.visits} visite${Number(gangCard.visits) > 1 ? 's' : ''}`
    : 'Ta carte de collection du Gang';

  const { data: appointments = [], isLoading: loadingStats, isError: statsError } = useQuery({
    queryKey: ['myAppointments', user?.email],
    queryFn: () => api.entities.Appointment.filter({ client_email: user?.email }, '-date', 100),
    enabled: !!user,
  });

  const now = Date.now();
  const dated = (Array.isArray(appointments) ? appointments : []).filter(a => a?.date);
  const visits = dated.filter(a => VISIT_STATUSES.includes(a.status) && endsAt(a) <= now);
  const upcomingCount = dated.filter(a => a.status === 'confirmed' && endsAt(a) > now).length;
  // Montant réglé (encaissement du salon, produits et pourboire compris) sinon prix des prestations
  const totalSpent = visits.reduce((sum, a) => sum + (Number(a.grand_total) || Number(a.total_price) || 0), 0);
  // Pas de « 0 » trompeur pendant le chargement ou après un échec
  const statsReady = !loadingStats && !(statsError && !appointments.length);
  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-40 -right-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        {/* Hero Profile : la carte Gang en premier pour un client, sinon l'avatar */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          {showGangHero && (
            <div className="flex flex-col items-center mb-5">
              {gangPending ? (
                // Emplacement réservé pendant le chargement : la page ne saute pas
                <div style={{ width: 300 * cardSize, height: 440 * cardSize }} aria-hidden="true" />
              ) : gangCard ? (
                <GangCard card={gangCard} size={cardSize} />
              ) : (
                <GangCardPlaceholder size={cardSize} />
              )}
              <Link to={gangCard ? '/gang-card' : '/booking'}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                {gangCard ? `${gangDesc} · voir ma carte et la collection` : 'Réserver ma première visite'}
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* Avatar (staff) ; pour un client, la photo est sur la carte : simple bouton pour la changer */}
          <div className={`relative inline-block mb-4 ${showGangHero ? 'hidden' : ''}`}>
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
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
          </div>

          {/* Crop dialog */}
          <ImageCropDialog
            open={!!cropImage}
            imageSrc={cropImage}
            onOpenChange={(open) => { if (!open) setCropImage(null); }}
            onCropComplete={handleCropComplete}
          />

          <h1 className="font-display text-2xl font-bold text-foreground">{user?.full_name || 'Chargement...'}</h1>
          <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
          {showGangHero && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
            >
              <Camera className="w-3.5 h-3.5" />
              {uploading ? 'Envoi…' : user?.photo_url ? 'Changer ma photo' : 'Ajouter ma photo sur la carte'}
            </button>
          )}

          {(user?.role === 'admin' || user?.role === 'manager') && (
            <Link to="/admin">
              <motion.button whileTap={{ scale: 0.95 }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                <Shield className="w-3.5 h-3.5" />
                Espace Admin
              </motion.button>
            </Link>
          )}
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3 mb-8">
          {[
            { value: statsReady ? visits.length : '–', label: 'Visites' },
            { value: statsReady ? upcomingCount : '–', label: 'À venir' },
            { value: statsReady ? formatPrice(totalSpent) : '–', label: 'Total' },
          ].map(({ value, label }) => (
            <div key={label} className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-4 text-center">
              {/* Montant long (« 1250 € ») : plus petit pour tenir dans la colonne à 320 px */}
              <p className={`${String(value).length > 5 ? 'text-lg leading-8' : 'text-2xl'} font-bold text-primary font-display whitespace-nowrap`}>{value}</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Menu */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-2xl overflow-hidden border border-white/8 bg-white/4 backdrop-blur-xl mb-5">
          {isClient && !showGangHero && (
          <Link
            to="/gang-card"
            className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors group border-b border-white/6"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              {gangCard ? (
                // Mini-carte (300 × 440 à l'échelle 0,13 → 39 × 57 px)
                <div className="w-10 flex justify-center flex-shrink-0" aria-hidden="true">
                  <GangCard card={gangCard} size={0.13} flippable={false} interactive={false} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                  <IdCard className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Ma carte Gang</p>
                <p className="text-[11px] text-muted-foreground truncate">{gangDesc}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
          </Link>
          )}
          {menuItems.map((item, i) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors group ${
                i < menuItems.length - 1 ? 'border-b border-white/6' : ''
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </Link>
          ))}
        </motion.div>

        {/* Logout */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
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
      </div>
    </div>
  );
}