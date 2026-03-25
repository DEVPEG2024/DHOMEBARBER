import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/apiClient';
import { isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush } from '@/lib/pushNotifications';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Bell, Shield, ChevronRight, Cake } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [savingBirth, setSavingBirth] = useState(false);
  const pushSupported = isPushSupported();

  useEffect(() => {
    if (user?.birth_date) setBirthDate(user.birth_date);
  }, [user]);

  // Check current subscription status on mount
  useEffect(() => {
    if (pushSupported) {
      isSubscribed().then(setPushEnabled);
    }
  }, []);

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
        toast.success('Notifications désactivées');
      } else {
        await subscribeToPush();
        setPushEnabled(true);
        toast.success('Notifications activées');
      }
    } catch (err) {
      toast.error(err.message || 'Erreur notifications');
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 right-0 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Compte</p>
          <h1 className="font-display text-3xl font-bold text-foreground">Paramètres</h1>
          <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
        </motion.div>

        {/* Profile info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informations</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Nom</p>
              <p className="text-sm font-semibold text-foreground">{user?.full_name || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Email</p>
              <p className="text-sm font-semibold text-foreground">{user?.email || '-'}</p>
            </div>
          </div>
          {user?.phone && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Téléphone</p>
                <p className="text-sm font-semibold text-foreground">{user.phone}</p>
              </div>
            </div>
          )}
          {/* Birthday */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Cake className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground">Date de naissance</p>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="date"
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="flex-1 bg-transparent text-sm font-semibold text-foreground focus:outline-none"
                />
                {birthDate !== (user?.birth_date || '') && (
                  <button
                    onClick={async () => {
                      if (!user?.id) return;
                      setSavingBirth(true);
                      try {
                        await api.entities.User.update(user.id, { birth_date: birthDate || null });
                        if (refreshUser) await refreshUser();
                        toast.success('Date de naissance enregistrée');
                      } catch (err) {
                        toast.error('Erreur');
                      } finally {
                        setSavingBirth(false);
                      }
                    }}
                    disabled={savingBirth}
                    className="text-xs font-semibold text-primary px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
                  >
                    {savingBirth ? '...' : 'OK'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Preferences */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl overflow-hidden mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-4 pb-2">Préférences</p>

          {/* Notifications toggle */}
          <button
            onClick={handleTogglePush}
            disabled={pushLoading || !pushSupported}
            className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                <p className="text-[11px] text-muted-foreground">
                  {!pushSupported
                    ? (navigator.standalone !== undefined && !navigator.standalone
                      ? "Ajoutez l'app à l'écran d'accueil d'abord"
                      : 'Non supporté sur ce navigateur')
                    : 'Rappels de rendez-vous'}
                </p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${pushEnabled ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${pushEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </motion.div>

        {/* Admin access */}
        {(user?.role === 'admin' || user?.role === 'manager') && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Link to="/admin" className="flex items-center justify-between px-4 py-3.5 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">Espace Admin</p>
                  <p className="text-[11px] text-muted-foreground">Gérer le salon</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-primary" />
            </Link>
          </motion.div>
        )}

        {/* App info */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="text-center mt-8">
          <p className="text-[11px] text-muted-foreground">D'Home Barber v1.0</p>
          <p className="text-[11px] text-muted-foreground">Douvaine, France</p>
        </motion.div>
      </div>
    </div>
  );
}
