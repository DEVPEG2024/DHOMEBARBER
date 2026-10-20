import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Phone, Eye, EyeOff, Download, Bell, CheckCircle, ArrowRight, Share, Plus, KeyRound, WifiOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/components/shared/LoadError';
import LegalLink from '@/components/shared/LegalLink';
import { isPushSupported, subscribeToPush } from '@/lib/pushNotifications';
import { isNative } from '@/lib/capacitor';
import { apiRequest, apiUrl, getToken } from '@/api/apiClient';
import { hasObjectionableName } from '@/lib/contentFilter';

const LOGO_URL = '/logo.png';
// Délai avant de pouvoir redemander un code de réinitialisation : aligné sur le serveur
// (RESET_RESEND_GAP_SECONDS = 60), qui ignore en silence un nouvel envoi plus rapproché
const RESEND_DELAY = 60;

const NETWORK_MESSAGE = 'Pas de connexion internet. Vérifiez votre réseau.';

/**
 * Message à afficher pour une erreur de l'API d'authentification : sans réponse du serveur
 * (hors ligne) → message réseau ; réponse sans message lisible (page d'erreur HTML, 5xx) →
 * serveur indisponible ; sinon le message du serveur, ou `fallback`.
 */
function authErrorMessage(err, fallback) {
  if (!err?.status) return NETWORK_MESSAGE;
  const serverMessage = err.data?.error || err.data?.message || err.response?.data?.error;
  if (serverMessage) return serverMessage;
  if (err.status === 429) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (err.status >= 500) return 'Le serveur ne répond pas. Réessayez dans un instant.';
  return fallback;
}

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushDone, setPushDone] = useState(false);

  // Forgot password state
  const [resetStep, setResetStep] = useState('email'); // 'email' | 'code'
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  // Fin du délai avant « Renvoyer le code » (horodatage), et seconde courante pour l'afficher
  const [resendAt, setResendAt] = useState(0);
  // Adresse du dernier code envoyé : « Changer d'email » / « Retour à la connexion » ne doivent pas
  // permettre de redemander tout de suite un code pour la même adresse (le serveur l'ignorerait
  // en silence alors que l'app annoncerait un envoi)
  const [lastResetEmail, setLastResetEmail] = useState('');
  // Mots de passe refusés à la suite (pas les pannes réseau) : au 2e, piste « Mot de passe oublié »
  const [loginFailures, setLoginFailures] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  // Après une connexion ou une inscription, la redirection (paramètre `redirect` compris)
  // est faite par la garde GuestOnly d'App.jsx, dès que la session est ouverte.
  const { login, register, welcomePending, dismissWelcome, authError, retryAuth, isRetryingAuth, dismissAuthError } = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (resendAt <= Date.now()) return undefined;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= resendAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  // Session expirée en cours d'utilisation (voir AuthContext) : dire pourquoi on est ici,
  // plutôt que de renvoyer l'utilisateur sur un écran de connexion sans explication.
  // `expired=1` vient de RequireAuth / RequireAdmin (état `sessionExpired` d'AuthContext) ; le
  // drapeau de session couvre un rechargement complet. L'`id` évite un double toast.
  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem('dhb-session-expired') === '1';
      sessionStorage.removeItem('dhb-session-expired');
    } catch { /* stockage indisponible */ }
    if (flagged || searchParams.get('expired') === '1') {
      toast.info('Votre session a expiré, reconnectez-vous.', { id: 'session-expired' });
    }
  }, [searchParams]);

  // Message laissé avant un rechargement complet (ex. Paramètres pose « Votre compte a bien
  // été supprimé. » juste avant la déconnexion, qui recharge l'app) : affiché une fois, puis effacé.
  useEffect(() => {
    let flash = null;
    try {
      flash = sessionStorage.getItem('dhb-flash');
      sessionStorage.removeItem('dhb-flash');
    } catch { /* stockage indisponible */ }
    if (flash) toast.success(flash, { duration: 6000 });
  }, []);

  // Quitter l'écran de bienvenue par un autre chemin que ses boutons ne doit pas le
  // laisser armé pour le prochain passage sur /login
  useEffect(() => dismissWelcome, [dismissWelcome]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Remplissez tous les champs');
      return;
    }
    setLoading(true);
    try {
      const user = await login(email, password);
      setLoginFailures(0);
      toast.success(`Bienvenue ${user.full_name || ''} !`);
    } catch (err) {
      // Une panne réseau n'est pas un mauvais mot de passe
      const shown = authErrorMessage(err, 'Email ou mot de passe incorrect');
      // Mot de passe refusé (401) ou compte verrouillé (429 `locked`) : à partir du 2e refus, ou dès
      // le verrou, le toast propose « Mot de passe oublié ? » (message du serveur inchangé)
      const refused = err?.status === 401 || (err?.status === 429 && err?.data?.locked);
      const failures = refused ? loginFailures + 1 : loginFailures;
      if (refused) setLoginFailures(failures);
      if (refused && (failures >= 2 || err?.data?.locked)) {
        toast.error(shown, {
          duration: 8000,
          action: { label: 'Mot de passe oublié ?', onClick: () => setMode('forgot') },
        });
      } else {
        toast.error(shown);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    // Un nom fait seulement d'espaces est refusé (le serveur l'enregistrait vide)
    if (!email || !password || !fullName.trim()) {
      toast.error('Remplissez les champs obligatoires');
      return;
    }
    // Le nom est affiché aux autres clients (fil, avis) : même filtre que les publications
    if (hasObjectionableName(fullName)) {
      toast.error('Ce nom contient un mot interdit par les règles de la communauté.');
      return;
    }
    if (password.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      // Ouvre la session et arme l'écran de bienvenue ci-dessous (welcomePending)
      await register({ email, password, full_name: fullName.trim(), phone });
      toast.success('Compte créé avec succès !');
    } catch (err) {
      toast.error(authErrorMessage(err, "Erreur lors de l'inscription"));
    } finally {
      setLoading(false);
    }
  };

  // Demande (ou redemande) du code à 6 chiffres. Passe par le client de l'API : avant, un
  // fetch brut affichait « Failed to fetch » hors ligne et « Unexpected token '<' » quand le
  // serveur renvoyait une page d'erreur.
  const requestResetCode = async () => {
    if (!email) {
      toast.error('Entrez votre adresse email');
      return;
    }
    // Même adresse redemandée avant la minute (« Changer d'email », « Retour à la connexion ») :
    // retour à l'étape du code avec le décompte en cours, sans appel ni annonce d'un nouvel envoi
    const target = email.trim().toLowerCase();
    if (target === lastResetEmail && resendAt > Date.now()) {
      setResetStep('code');
      const s = Math.ceil((resendAt - Date.now()) / 1000);
      toast.info(`Un code vient d'être envoyé à cette adresse. Vous pourrez en redemander un dans ${s} s.`);
      return;
    }
    setLoading(true);
    try {
      await apiRequest('POST', apiUrl('/auth/forgot-password'), { email: email.trim() });
      toast.success('Si un compte existe avec cet email, un code vous a été envoyé.');
      setResetStep('code');
      setResendAt(Date.now() + RESEND_DELAY * 1000);
      setLastResetEmail(target);
      setNow(Date.now());
    } catch (err) {
      toast.error(authErrorMessage(err, 'Erreur lors de la demande'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    requestResetCode();
  };

  const handleResendCode = () => {
    if (loading || resendIn > 0) return;
    setResetCode('');
    requestResetCode();
  };

  // Retour à l'étape email (faute de frappe) : le code éventuel ne vaut plus rien
  const handleChangeEmail = () => {
    setResetStep('email');
    setResetCode('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetCode || !newPassword) {
      toast.error('Remplissez tous les champs');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      await apiRequest('POST', apiUrl('/auth/reset-password'), {
        email: email.trim(), code: resetCode, new_password: newPassword,
      });
      toast.success('Mot de passe réinitialisé ! Connectez-vous.');
      setMode('login');
      setResetStep('email');
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
      setResendAt(0);
      setLastResetEmail('');
      setLoginFailures(0);
    } catch (err) {
      const shown = authErrorMessage(err, 'Erreur lors de la réinitialisation');
      toast.error(shown);
      // Code refusé : champ vidé ; « Renvoyer le code » se réactive dès que la minute depuis le
      // dernier envoi est écoulée (`resendAt`), pas avant : le serveur ignorerait la demande
      if (/invalide|expiré/i.test(shown)) {
        setResetCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  const ua = navigator.userAgent || '';
  // iPadOS (Safari) se présente comme un Mac : on le reconnaît à l'écran tactile
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  const isAndroid = /Android/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  const handleEnablePush = async () => {
    try {
      await subscribeToPush();
      setPushDone(true);
      toast.success('Notifications activées !');
    } catch (err) {
      toast.error(friendlyError(err, "Impossible d'activer les notifications", { foreign: "Impossible d'activer les notifications sur cet appareil. Réessayez." }));
    }
  };

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors';
  const iconClass = 'absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70';

  if (welcomePending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-6 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm text-center"
        >
          <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Bienvenue !</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Votre compte a été créé avec succès. Pour une meilleure expérience :
          </p>

          {/* Step 1: Install app (pas dans l'app des stores : elle est déjà installée) */}
          {!isNative && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4 mb-3 text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Download className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Installer l'application</p>
                {isIOS ? (
                  <div className="text-xs text-muted-foreground mt-1 space-y-1.5">
                    {/* Icônes en ligne dans le texte (pas de flex : à 320 px chaque morceau devenait une colonne) */}
                    <p>
                      1. Appuyez sur <Share className="w-3.5 h-3.5 inline-block align-[-2px] mx-0.5 text-blue-400" /> dans la barre du navigateur (en bas sur iPhone, en haut sur iPad)
                    </p>
                    <p>
                      2. Sélectionnez <span className="font-semibold text-foreground">"Sur l'écran d'accueil"</span> <Plus className="w-3 h-3 inline-block align-[-1px] text-blue-400" />
                    </p>
                    <p>3. Appuyez sur <span className="font-semibold text-foreground">"Ajouter"</span></p>
                  </div>
                ) : isAndroid ? (
                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                    <p>Appuyez sur la bannière <span className="font-semibold text-foreground">"Installer l'application"</span> qui apparaît en haut, ou :</p>
                    <p>Menu <span className="font-semibold">⋮</span> → <span className="font-semibold text-foreground">"Installer l'application"</span></p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cliquez sur l'icône d'installation dans la barre d'adresse de votre navigateur.
                  </p>
                )}
                {isStandalone && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-primary font-semibold">
                    <CheckCircle className="w-3.5 h-3.5" />
                    App déjà installée
                  </div>
                )}
              </div>
            </div>
          </motion.div>
          )}

          {/* Step 2: Notifications */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4 mb-6 text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Activer les notifications</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Recevez des rappels avant vos rendez-vous et les offres exclusives.
                </p>
                {isPushSupported() && !pushDone && (
                  <button
                    onClick={handleEnablePush}
                    className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    Activer les notifications
                  </button>
                )}
                {pushDone && (
                  <div className="flex items-center gap-1.5 mt-3 text-xs text-primary font-semibold">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Notifications activées
                  </div>
                )}
                {!isPushSupported() && (
                  <p className="text-[10px] text-muted-foreground/60 mt-2">
                    Installez d'abord l'application pour activer les notifications.
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Continue button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={dismissWelcome}
            className="w-full flex items-center justify-center gap-2 h-13 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all"
          >
            Commencer
            <ArrowRight className="w-4 h-4" />
          </motion.button>

          <button onClick={dismissWelcome} className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Passer cette étape
          </button>
        </motion.div>
      </div>
    );
  }

  // Hors ligne au lancement avec une session enregistrée : rien n'est perdu, il suffit de
  // retrouver le réseau (nouvelle tentative automatique au retour de la connexion).
  // « Se connecter avec un autre compte » efface l'échec (dismissAuthError) : formulaire.
  if (authError && getToken()) {
    const offline = authError.type === 'network';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-6 bg-background">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          role="alert" className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto mb-5">
            <WifiOff className="w-7 h-7 text-amber-400" aria-hidden="true" />
          </div>
          <h1 className="font-display text-xl font-bold text-foreground">
            {offline ? 'Pas de connexion internet' : 'Le serveur ne répond pas'}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {offline
              ? 'Votre session est bien enregistrée. Vérifiez votre réseau : l’app se reconnecte dès qu’internet revient.'
              : 'Votre session est bien enregistrée. Réessayez dans un instant.'}
          </p>
          <button type="button" disabled={isRetryingAuth}
            onClick={async () => {
              if (await retryAuth() === 'failed') {
                toast.error(offline ? 'Toujours pas de connexion. Réessayez dans un instant.' : 'Le serveur ne répond toujours pas.');
              }
            }}
            className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${isRetryingAuth ? 'animate-spin' : ''}`} aria-hidden="true" />
            {isRetryingAuth ? 'Connexion…' : 'Réessayer'}
          </button>
          <button type="button" onClick={dismissAuthError}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Se connecter avec un autre compte
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-6 bg-background">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-6"
      >
        <img
          src={LOGO_URL}
          alt="D'Home Barber"
          className="login-logo w-64 h-64 object-contain mx-auto drop-shadow-2xl"
        />
        <p className="text-sm font-light tracking-[0.3em] uppercase text-muted-foreground mt-1">Premium BarberShop</p>
      </motion.div>

      {/* Title */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="text-center mb-6">
        <h1 className="font-display text-xl font-bold text-foreground">
          {mode === 'forgot' ? 'Mot de passe oublié' : mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === 'forgot'
            ? (resetStep === 'email' ? 'Entrez votre email pour recevoir un code' : 'Entrez le code et votre nouveau mot de passe')
            : mode === 'login' ? 'Accédez à votre espace' : "Rejoignez D'Home Barber"}
        </p>
      </motion.div>

      <div className="w-full max-w-sm">
        {/* Tabs */}
        {mode !== 'forgot' && (
          <div className="flex gap-1 mb-5 p-1 rounded-2xl bg-white/5 border border-white/8">
            {[
              { id: 'login', label: 'Connexion' },
              { id: 'register', label: 'Inscription' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setMode(t.id)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  mode === t.id
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Forgot password form */}
        {mode === 'forgot' && (
          <motion.form
            key="forgot"
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            onSubmit={resetStep === 'email' ? handleForgotPassword : handleResetPassword}
            className="space-y-3"
          >
            <div className="relative">
              <Mail className={iconClass} />
              <input type="email" placeholder="Email *" value={email}
                onChange={e => setEmail(e.target.value)} autoComplete="email"
                className={inputClass} disabled={resetStep === 'code'} />
            </div>

            {resetStep === 'code' && (
              <>
                <div className="relative">
                  <KeyRound className={iconClass} />
                  <input type="text" placeholder="Code à 6 chiffres *" value={resetCode}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6}
                    inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code"
                    className={inputClass} />
                </div>
                <div className="relative">
                  <Lock className={iconClass} />
                  <input type={showPassword ? 'text' : 'password'} placeholder="Nouveau mot de passe *"
                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    className={`${inputClass} !pr-11`} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <Lock className={iconClass} />
                  <input type={showPassword ? 'text' : 'password'} placeholder="Confirmer le mot de passe *"
                    value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)}
                    className={inputClass} />
                </div>
              </>
            )}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 h-13 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-60 mt-2">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                resetStep === 'email' ? 'Envoyer le code' : 'Réinitialiser le mot de passe'
              )}
            </button>

            {resetStep === 'code' && (
              <>
                <p className="text-center text-xs text-muted-foreground/70 mt-2">
                  Un code à 6 chiffres a été envoyé à votre adresse email. Vérifiez aussi vos spams. Si vous recevez plusieurs emails, utilisez le plus récent.
                </p>
                <div className="flex items-center justify-center gap-4 text-xs">
                  <button type="button" onClick={handleResendCode} disabled={loading || resendIn > 0}
                    className="font-semibold text-primary disabled:text-muted-foreground disabled:font-normal">
                    {resendIn > 0 ? `Renvoyer le code (${resendIn} s)` : 'Renvoyer le code'}
                  </button>
                  <button type="button" onClick={handleChangeEmail} disabled={loading}
                    className="text-muted-foreground hover:text-foreground transition-colors">
                    Changer d'email
                  </button>
                </div>
              </>
            )}
          </motion.form>
        )}

        {/* Form */}
        {mode !== 'forgot' && <motion.form
          key={mode}
          initial={{ opacity: 0, x: mode === 'login' ? -15 : 15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          onSubmit={mode === 'login' ? handleLogin : handleRegister}
          className="space-y-3"
        >
          {mode === 'register' && (
            <div className="relative">
              <User className={iconClass} />
              <input type="text" placeholder="Nom complet *" value={fullName}
                onChange={e => setFullName(e.target.value)} className={inputClass} />
            </div>
          )}

          <div className="relative">
            <Mail className={iconClass} />
            <input type="email" placeholder="Email *" value={email}
              onChange={e => setEmail(e.target.value)} autoComplete="email" className={inputClass} />
          </div>

          <div className="relative">
            <Lock className={iconClass} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Mot de passe *"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={`${inputClass} !pr-11`}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {mode === 'register' && (
            <>
              <div className="relative">
                <Lock className={iconClass} />
                <input type={showPassword ? 'text' : 'password'} placeholder="Confirmer le mot de passe *"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password" className={inputClass} />
              </div>
              <div className="relative">
                <Phone className={iconClass} />
                <input type="tel" placeholder="Téléphone (optionnel)" value={phone}
                  onChange={e => setPhone(e.target.value)} className={inputClass} />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 h-13 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-60 mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              mode === 'login' ? 'Se connecter' : 'Créer mon compte'
            )}
          </button>

          {mode === 'register' && (
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed pt-1">
              En créant un compte, vous acceptez les{' '}
              <LegalLink path="/cgu.html" className="text-primary underline">conditions d'utilisation</LegalLink>
              {' '}et la{' '}
              <LegalLink path="/privacy.html" className="text-primary underline">politique de confidentialité</LegalLink>.
            </p>
          )}
        </motion.form>}

        {/* Footer */}
        <div className="text-center mt-5 space-y-2">
          {mode === 'forgot' ? (
            <p className="text-sm text-muted-foreground">
              <button onClick={() => { setMode('login'); setResetStep('email'); setResetCode(''); setNewPassword(''); setConfirmNewPassword(''); }}
                className="text-primary font-semibold">
                Retour à la connexion
              </button>
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {mode === 'login' ? (
                  <>Pas encore de compte ?{' '}
                    <button onClick={() => setMode('register')} className="text-primary font-semibold">
                      Inscrivez-vous
                    </button>
                  </>
                ) : (
                  <>Déjà un compte ?{' '}
                    <button onClick={() => setMode('login')} className="text-primary font-semibold">
                      Connectez-vous
                    </button>
                  </>
                )}
              </p>
              {mode === 'login' && (
                <p className="text-sm">
                  <button onClick={() => setMode('forgot')} className="text-muted-foreground hover:text-primary transition-colors">
                    Mot de passe oublié ?
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
