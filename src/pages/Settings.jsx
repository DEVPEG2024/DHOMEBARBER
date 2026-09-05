import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush } from '@/lib/pushNotifications';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Bell, Shield, ChevronRight, Cake, Trash2, Ban } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { isNative, openExternalUrl } from '@/lib/capacitor';

export default function Settings() {
  const { user, refreshUser, logout } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [savingBirth, setSavingBirth] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const pushSupported = isPushSupported();
  const queryClient = useQueryClient();
  const [unblocking, setUnblocking] = useState(null);

  // Utilisateurs bloqués depuis le fil
  const { data: blocks = [] } = useQuery({
    queryKey: ['userBlocks'],
    queryFn: () => api.entities.UserBlock.list('-created_at', 200),
    enabled: !!user,
  });

  // Un blocage porte sur la clé publique du membre : l'email n'est plus renvoyé aux clients.
  // On affiche donc le nom, et l'email seulement quand il est présent (staff, anciens blocages).
  const blockedLabel = (b) => b.blocked_name || b.blocked_email || 'Utilisateur';
  const blockedSubLabel = (b) => {
    if (b.blocked_email) return b.blocked_email;
    if (!b.created_at) return 'Membre bloqué';
    return `Bloqué le ${new Date(b.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  const unblock = async (b) => {
    setUnblocking(b.id);
    try {
      await api.entities.UserBlock.delete(b.id);
      queryClient.invalidateQueries({ queryKey: ['userBlocks'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['postComments'] });
      toast.success(`${blockedLabel(b)} débloqué`);
    } catch (err) {
      toast.error(err?.message || 'Erreur lors du déblocage');
    } finally {
      setUnblocking(null);
    }
  };

  // birth_date peut arriver en ISO complet (ex. 1990-05-04T00:00:00.000Z) : on garde YYYY-MM-DD
  const userBirthDate = user?.birth_date ? String(user.birth_date).slice(0, 10) : '';

  useEffect(() => {
    setBirthDate(userBirthDate);
  }, [userBirthDate]);

  // Dans l'app native, target="_blank" ne fait rien : on ouvre les pages légales via le navigateur in-app
  const openLegal = (path) => (e) => {
    if (isNative) {
      e.preventDefault();
      openExternalUrl(`https://dhomebarber.fr${path}`);
    }
  };

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
                {birthDate !== userBirthDate && (
                  <button
                    onClick={async () => {
                      if (!user?.id) return;
                      setSavingBirth(true);
                      try {
                        const value = birthDate && birthDate.length === 10 ? birthDate : null;
                        await api.entities.User.update(user.id, { birth_date: value });
                        if (refreshUser) await refreshUser();
                        toast.success(value ? 'Date de naissance enregistrée' : 'Date de naissance supprimée');
                      } catch (err) {
                        console.error('Birth date save error:', err);
                        toast.error(err?.message || 'Erreur lors de la sauvegarde');
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

        {/* Blocked users */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl overflow-hidden mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-4 pb-2">Utilisateurs bloqués</p>
          {blocks.length === 0 ? (
            <p className="px-4 pb-4 text-[11px] text-muted-foreground">
              Aucun utilisateur bloqué. Vous pouvez bloquer un membre depuis le fil « Ca dit quoi le Gang ? » (menu ··· d'une publication).
            </p>
          ) : (
            blocks.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                    <Ban className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{blockedLabel(b)}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{blockedSubLabel(b)}</p>
                  </div>
                </div>
                <button
                  onClick={() => unblock(b)}
                  disabled={unblocking === b.id}
                  className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50 shrink-0"
                >
                  {unblocking === b.id ? '...' : 'Débloquer'}
                </button>
              </div>
            ))
          )}
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

        {/* Danger zone */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-2xl border border-red-500/20 bg-red-500/5 overflow-hidden mb-4 mt-4">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider px-4 pt-4 pb-2">Zone de danger</p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-red-500/10 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-red-400">Supprimer mon compte</p>
                <p className="text-[11px] text-muted-foreground">Cette action est irréversible</p>
              </div>
            </button>
          ) : (
            <div className="px-4 py-4 space-y-3">
              <p className="text-sm text-red-300">Êtes-vous sûr de vouloir supprimer votre compte ? Toutes vos données seront définitivement supprimées.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-white/10 text-foreground hover:bg-white/15 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    setDeleteLoading(true);
                    try {
                      await apiRequest('DELETE', apiUrl('/auth/delete-account'));
                      toast.success('Compte supprimé avec succès');
                      logout();
                    } catch (err) {
                      toast.error(err?.message || 'Erreur lors de la suppression');
                    } finally {
                      setDeleteLoading(false);
                    }
                  }}
                  disabled={deleteLoading}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleteLoading ? 'Suppression...' : 'Confirmer la suppression'}
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Legal links */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl overflow-hidden mb-4">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer" onClick={openLegal('/privacy.html')} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5">
            <span className="text-sm text-muted-foreground">Politique de confidentialité</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </a>
          <a href="/cgu.html" target="_blank" rel="noopener noreferrer" onClick={openLegal('/cgu.html')} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
            <span className="text-sm text-muted-foreground">Conditions générales d'utilisation</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </a>
        </motion.div>

        {/* App info */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="text-center mt-8">
          <p className="text-[11px] text-muted-foreground">D'Home Barber v1.0</p>
          <p className="text-[11px] text-muted-foreground">Douvaine, France</p>
        </motion.div>
      </div>
    </div>
  );
}
