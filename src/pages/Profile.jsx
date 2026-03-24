import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { Calendar, Star, ShoppingBag, Settings, LogOut, ChevronRight, Shield, Scissors, Bell, Camera } from 'lucide-react';
import { toast } from 'sonner';
import ImageCropDialog from '@/components/shared/ImageCropDialog';

const menuItems = [
  { icon: Calendar, label: 'Mes Rendez-vous', path: '/appointments', desc: 'Historique & prochains RDV' },
  { icon: Bell, label: 'Notifications', path: '/notifications', desc: 'Messages & alertes' },
  { icon: ShoppingBag, label: 'Mes Commandes', path: '/orders', desc: 'Suivi de vos achats' },
  { icon: Star, label: 'Mes Avis', path: '/reviews', desc: 'Vos évaluations' },
  { icon: Settings, label: 'Paramètres', path: '/settings', desc: 'Compte & préférences' },
];

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [cropImage, setCropImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropImage(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropComplete = async (croppedFile) => {
    setCropImage(null);
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: croppedFile });
      await base44.entities.User.update(user.id, { photo_url: file_url });
      if (refreshUser) await refreshUser();
      toast.success('Photo de profil mise à jour');
    } catch (err) {
      toast.error('Erreur lors de la mise à jour de la photo');
    } finally {
      setUploading(false);
    }
  };

  const { data: appointments = [] } = useQuery({
    queryKey: ['myAppointments', user?.email],
    queryFn: () => base44.entities.Appointment.filter({ client_email: user?.email }, '-date', 100),
    enabled: !!user,
  });

  const completedCount = appointments.filter(a => a.status === 'completed').length;
  const totalSpent = appointments.filter(a => a.status === 'completed').reduce((sum, a) => sum + (a.grand_total || a.total_price || 0), 0);
  const upcomingCount = appointments.filter(a => a.status === 'confirmed').length;
  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-40 -right-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        {/* Hero Profile */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          {/* Avatar */}
          <div className="relative inline-block mb-4">
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
            onClose={() => setCropImage(null)}
            onCropComplete={handleCropComplete}
          />

          <h1 className="font-display text-2xl font-bold text-foreground">{user?.full_name || 'Chargement...'}</h1>
          <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>

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
            { value: completedCount, label: 'Visites' },
            { value: upcomingCount, label: 'À venir' },
            { value: `${totalSpent}€`, label: 'Total' },
          ].map(({ value, label }) => (
            <div key={label} className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-4 text-center">
              <p className="text-2xl font-bold text-primary font-display">{value}</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Menu */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-2xl overflow-hidden border border-white/8 bg-white/4 backdrop-blur-xl mb-5">
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
          onClick={logout}
          className="w-full h-12 rounded-2xl border border-red-500/20 bg-red-500/8 text-red-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-500/12 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </motion.button>
      </div>
    </div>
  );
}