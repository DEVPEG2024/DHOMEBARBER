import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush, getPushPermission, syncPushSubscription } from '@/lib/pushNotifications';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Bell, Shield, ChevronRight, Cake, Trash2, Ban, Pencil, Settings as SettingsIcon, Megaphone } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { isNative, platform, openExternalUrl } from '@/lib/capacitor';
import FeedbackSection from '@/components/feedback/FeedbackSection';
import { hasObjectionableName } from '@/lib/contentFilter';
import LoadError, { friendlyError, queryFailed } from '@/components/shared/LoadError';
import { GANG_LEADERBOARD_QUERY_KEY } from '@/lib/gangCardApi';
import { parisDay } from '@/lib/slots';

// Mêmes limites que l'inscription (routes/auth.js côté serveur)
const NAME_MAX = 120;
// Mêmes coordonnées que les CGU (section 14) et la politique de confidentialité
const CONTACT_EMAIL = 'contact@dhomebarber.fr';
const CONTACT_PHONE = '06 66 08 36 05';
const PHONE_MAX = 30;

const squash = (s) => String(s || '').trim().replace(/\s+/g, ' ');

const validateName = (v) => {
  if (!v) return 'Le nom est obligatoire.';
  if (v.length > NAME_MAX) return `Le nom ne peut pas dépasser ${NAME_MAX} caractères.`;
  if (hasObjectionableName(v)) return 'Ce nom contient un mot interdit par les règles de la communauté.';
  return null;
};

const validatePhone = (v) => {
  if (v.length > PHONE_MAX) return `Le téléphone ne peut pas dépasser ${PHONE_MAX} caractères.`;
  if (v && !/^[0-9+().\s-]+$/.test(v)) return 'Numéro invalide : utilisez seulement des chiffres, des espaces et le signe +.';
  return null;
};

/**
 * Champ du bloc « Informations » modifiable sur place, comme la date de naissance :
 * le bouton « OK » n'apparaît que si la valeur a changé. Entrée enregistre, Échap annule.
 * `validate(valeur)` renvoie un message d'erreur ou rien, `onSave(valeur)` enregistre.
 */
function InlineField({ id, icon: Icon, label, value, placeholder, validate, onSave, inputProps = {} }) {
  const saved = squash(value);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const cleaned = squash(draft);
  const dirty = cleaned !== saved;

  const save = async () => {
    if (!dirty || saving) return;
    const error = validate?.(cleaned);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await onSave(cleaned);
    } catch (err) {
      console.error(`${label} save error:`, err);
      toast.error(friendlyError(err, 'Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="block text-[11px] text-muted-foreground">{label}</label>
        <div className="flex items-center gap-2 mt-0.5">
          <input
            id={id}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); save(); }
              if (e.key === 'Escape') setDraft(saved);
            }}
            placeholder={placeholder}
            enterKeyHint="done"
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground/60 placeholder:font-normal border-b border-transparent focus:border-primary/40 focus:outline-none transition-colors"
            {...inputProps}
          />
          {dirty ? (
            <button
              onClick={save}
              disabled={saving}
              className="text-xs font-semibold text-primary px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {saving ? '...' : 'OK'}
            </button>
          ) : (
            <label htmlFor={id} aria-hidden="true" className="p-1 text-muted-foreground/50 cursor-pointer">
              <Pencil className="w-3.5 h-3.5" />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, refreshUser, logout } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  // Autorisation du téléphone / du navigateur (getPushPermission) : 'denied' = refusée dans
  // les réglages, l'interrupteur ne peut rien y faire, on explique comment la rouvrir
  const [pushPermission, setPushPermission] = useState(null);
  const [birthDate, setBirthDate] = useState('');
  const [savingBirth, setSavingBirth] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const pushSupported = isPushSupported();
  const queryClient = useQueryClient();
  const [unblocking, setUnblocking] = useState(null);
  // Emails d'offres et d'actualités (« Tous les clients ») : activés tant que le compte ne les a
  // pas refusés (champ absent d'un ancien serveur = activé). Les emails liés aux rendez-vous et
  // commandes ne sont pas concernés.
  const [marketingOverride, setMarketingOverride] = useState(null);
  const [marketingSaving, setMarketingSaving] = useState(false);
  const marketingEnabled = marketingOverride ?? (user?.marketing_emails !== false);
  const toggleMarketing = async () => {
    if (!user?.id || marketingSaving) return;
    const next = !marketingEnabled;
    setMarketingOverride(next);
    setMarketingSaving(true);
    try {
      await api.entities.User.update(user.id, { marketing_emails: next });
      if (refreshUser) await refreshUser();
      toast.success(next ? 'Emails d\'offres activés' : 'Vous ne recevrez plus nos offres par email');
    } catch (err) {
      setMarketingOverride(!next);
      toast.error(friendlyError(err, 'Réglage non enregistré, réessayez'));
    } finally {
      setMarketingSaving(false);
    }
  };
  // Une fois l'utilisateur relu, c'est lui qui fait foi
  useEffect(() => { setMarketingOverride(null); }, [user?.marketing_emails]);

  // Utilisateurs bloqués depuis le fil
  // Requête gardée entière : queryFailed() couvre aussi la requête en pause hors connexion
  const blocksQuery = useQuery({
    queryKey: ['userBlocks'],
    queryFn: () => api.entities.UserBlock.list('-created_at', 200),
    enabled: !!user,
  });
  const {
    data: blocksData, error: blocksErr, refetch: refetchBlocks,
    isFetching: blocksFetching, isLoading: blocksLoading,
  } = blocksQuery;
  // Seulement MES blocages (le serveur filtre déjà, admin compris) : jamais « Débloquer » pour autrui
  const myEmail = String(user?.email || '').toLowerCase();
  const blocks = (blocksData ?? []).filter(b => String(b.blocker_email || '').toLowerCase() === myEmail);

  // Un blocage porte sur la clé publique du membre : l'email n'est plus renvoyé aux clients.
  // On affiche donc le nom, et l'email seulement quand il est présent (staff, anciens blocages).
  const blockedLabel = (b) => b.blocked_name || b.blocked_email || 'Utilisateur';
  const blockedSubLabel = (b) => {
    if (b.blocked_email) return b.blocked_email;
    if (!b.created_at) return 'Membre bloqué';
    return `Bloqué le ${new Date(b.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' })}`;
  };

  const unblock = async (b) => {
    setUnblocking(b.id);
    try {
      await api.entities.UserBlock.delete(b.id);
      queryClient.invalidateQueries({ queryKey: ['userBlocks'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['postComments'] });
      // Team of the Season : le membre débloqué y réapparaît sans attendre 5 min
      queryClient.invalidateQueries({ queryKey: GANG_LEADERBOARD_QUERY_KEY });
      toast.success(`${blockedLabel(b)} débloqué`);
    } catch (err) {
      toast.error(friendlyError(err, 'Erreur lors du déblocage'));
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

  // État de l'abonnement et de l'autorisation, relu au montage et au retour dans l'app
  // (le client revient des réglages du téléphone après y avoir réactivé les notifications)
  useEffect(() => {
    if (!pushSupported) return undefined;
    let cancelled = false;
    let previous = null;
    const refreshPush = async () => {
      // L'autorisation d'abord : isSubscribed peut attendre le service worker sur le web
      const permission = await getPushPermission().catch(() => 'unsupported');
      if (cancelled) return;
      setPushPermission(permission);
      // Autorisation rendue dans les réglages : l'appareil est rattaché au compte sans autre geste
      if (permission === 'granted' && previous && previous !== 'granted') syncPushSubscription();
      previous = permission;
      const subscribed = permission === 'denied' ? false : await isSubscribed().catch(() => false);
      if (!cancelled) setPushEnabled(subscribed);
    };
    refreshPush();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshPush(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pushSupported]);

  const pushDenied = pushPermission === 'denied';
  // iOS : le schéma app-settings: ouvre la page de l'app dans Réglages (comme NotificationPrompt)
  const canOpenSettings = isNative && platform === 'ios';
  const deniedHelp = isNative
    ? (platform === 'android'
      ? 'Pour les réactiver : Paramètres du téléphone → Applications → D’Home Barber → Notifications.'
      : 'Pour les réactiver : Réglages → D’Home Barber → Notifications.')
    : 'Pour les réactiver : autorisez les notifications pour dhomebarber.fr dans les réglages du navigateur (icône à gauche de l’adresse, ou Réglages → Notifications sur iPhone).';

  const openPhoneSettings = () => {
    window.location.href = 'app-settings:';
  };

  const handleTogglePush = async () => {
    if (pushDenied) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
        toast.success('Notifications désactivées');
      } else {
        await subscribeToPush();
        setPushEnabled(true);
        setPushPermission('granted');
        toast.success('Notifications activées');
      }
    } catch (err) {
      // Refus dans la fenêtre du téléphone : l'explication s'affiche sous l'interrupteur
      const permission = await getPushPermission().catch(() => null);
      if (permission) setPushPermission(permission);
      if (permission === 'denied') toast.error('Notifications refusées sur cet appareil');
      else toast.error(friendlyError(err, 'Erreur notifications', { foreign: "Impossible d'activer les notifications sur cet appareil. Réessayez." }));
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
          <InlineField
            id="settings-full-name"
            icon={User}
            label="Nom"
            value={user?.full_name}
            placeholder="Votre nom"
            validate={validateName}
            onSave={async (value) => {
              if (!user?.id) return;
              await api.entities.User.update(user.id, { full_name: value });
              if (refreshUser) await refreshUser();
              toast.success('Nom mis à jour');
            }}
            inputProps={{ autoComplete: 'name', maxLength: NAME_MAX }}
          />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Email</p>
              <p className="text-sm font-semibold text-foreground break-all">{user?.email || '-'}</p>
            </div>
          </div>
          {/* Toujours affiché : un client inscrit sans numéro peut l'ajouter (facultatif) */}
          <InlineField
            id="settings-phone"
            icon={Phone}
            label="Téléphone"
            value={user?.phone}
            placeholder="Ajouter un numéro"
            validate={validatePhone}
            onSave={async (value) => {
              if (!user?.id) return;
              await api.entities.User.update(user.id, { phone: value });
              if (refreshUser) await refreshUser();
              toast.success(value ? 'Téléphone mis à jour' : 'Téléphone supprimé');
            }}
            inputProps={{ type: 'tel', inputMode: 'tel', autoComplete: 'tel', maxLength: PHONE_MAX }}
          />
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
                  min="1900-01-01"
                  max={parisDay()}
                  className="flex-1 bg-transparent text-sm font-semibold text-foreground focus:outline-none"
                />
                {birthDate !== userBirthDate && (
                  <button
                    onClick={async () => {
                      if (!user?.id) return;
                      setSavingBirth(true);
                      try {
                        const value = birthDate && birthDate.length === 10 ? birthDate : null;
                        // L'attribut max n'empêche pas une saisie au clavier (an 0026, date future)
                        if (value && (value < '1900-01-01' || value > parisDay())) {
                          toast.error('Date de naissance invalide');
                          return;
                        }
                        await api.entities.User.update(user.id, { birth_date: value });
                        if (refreshUser) await refreshUser();
                        toast.success(value ? 'Date de naissance enregistrée' : 'Date de naissance supprimée');
                      } catch (err) {
                        console.error('Birth date save error:', err);
                        toast.error(friendlyError(err, 'Erreur lors de la sauvegarde'));
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
            disabled={pushLoading || !pushSupported || pushDenied}
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
                    : pushDenied
                      ? (isNative ? 'Désactivées dans les réglages du téléphone' : 'Bloquées dans les réglages du navigateur')
                      : 'Rappels de rendez-vous'}
                </p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${pushEnabled ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${pushEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
          {pushDenied && (
            <div className="px-4 pb-4 -mt-1">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Vous ne recevrez ni le rappel de vos rendez-vous ni les créneaux last minute.
                {canOpenSettings ? ' Réactivez-les en un geste dans les réglages.' : ` ${deniedHelp}`}
              </p>
              {canOpenSettings && (
                <button
                  type="button"
                  onClick={openPhoneSettings}
                  className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                >
                  <SettingsIcon className="w-3.5 h-3.5" /> Ouvrir les réglages
                </button>
              )}
            </div>
          )}
          {/* Emails d'offres (« Tous les clients ») : refus simple à tout moment (CNIL, art. L34-5 CPCE) */}
          <button
            onClick={toggleMarketing}
            disabled={marketingSaving}
            className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-white/5 transition-colors disabled:opacity-50 border-t border-white/5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-semibold text-foreground">Emails d'offres et d'actualités</p>
                <p className="text-[11px] text-muted-foreground">Les emails de vos rendez-vous et commandes arrivent toujours</p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${marketingEnabled ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${marketingEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </motion.div>

        {/* Bugs et suggestions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}>
          <FeedbackSection user={user} />
        </motion.div>

        {/* Blocked users */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl overflow-hidden mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-4 pb-2">Utilisateurs bloqués</p>
          {queryFailed(blocksQuery) ? (
            <div className="px-4 pb-4">
              <LoadError compact what="vos utilisateurs bloqués" error={blocksErr} onRetry={refetchBlocks} retrying={blocksFetching} />
            </div>
          ) : blocksLoading ? (
            <p className="px-4 pb-4 text-[11px] text-muted-foreground">Chargement…</p>
          ) : blocks.length === 0 ? (
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

        {/* Compte du salon (admin qui parcourt les pages client) : pas de suppression ici, le serveur
            la refuse (le salon perdait son seul accès administrateur) */}
        {user && user.role !== 'user' && (
          <p className="mt-4 mb-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-[11px] text-muted-foreground leading-relaxed">
            Compte du salon : il se gère depuis l'espace admin → Comptes barbers.
          </p>
        )}

        {/* Danger zone (clients seulement) */}
        {(!user || user.role === 'user') && (
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
              <p className="text-sm text-red-300">Êtes-vous sûr de vouloir supprimer votre compte ? Vos rendez-vous à venir et vos commandes en cours seront annulés, et toutes vos données personnelles définitivement supprimées. Vos cartes cadeau déjà achetées restent valables avec leur code, mais vous ne pourrez plus les consulter : notez les codes avant de supprimer.</p>
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
                      // logout() recharge la page : le toast serait perdu. La page de connexion
                      // affiche ce message au chargement.
                      try { sessionStorage.setItem('dhb-flash', 'Votre compte a bien été supprimé.'); } catch { /* stockage indisponible */ }
                      // Le serveur a déjà effacé les abonnements push du compte : pas de désinscription
                      await logout({ detachPush: false });
                    } catch (err) {
                      // 401 : le jeton ne correspond plus à aucun compte. Cas typique : nouvel essai
                      // après une réponse perdue, le compte est déjà supprimé. Plus de page « connectée »
                      // avec « Token invalide ou expiré » : retour à la connexion avec un message.
                      if (err?.status === 401) {
                        try { sessionStorage.setItem('dhb-flash', 'Votre compte a été supprimé (ou votre session avait expiré : reconnectez-vous pour vérifier).'); } catch { /* stockage indisponible */ }
                        await logout({ detachPush: false });
                        return;
                      }
                      toast.error(friendlyError(err, 'Erreur lors de la suppression'));
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
        )}

        {/* Contact (directive App Store 1.2 : coordonnées publiées pour joindre le salon) */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
          className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl overflow-hidden mb-4">
          <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nous contacter</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5">
            <Mail className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 text-sm text-foreground truncate">{CONTACT_EMAIL}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </a>
          <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
            <Phone className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 text-sm text-foreground">{CONTACT_PHONE}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </a>
          <p className="px-4 pb-3 text-[11px] text-muted-foreground">
            Un contenu choquant dans le fil ? Signalez-le avec « ··· » : le salon le traite sous 24 h.
          </p>
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
