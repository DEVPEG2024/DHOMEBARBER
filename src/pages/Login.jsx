import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Phone, Eye, EyeOff, Download, Bell, CheckCircle, ArrowRight, Share, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { isPushSupported, subscribeToPush } from '@/lib/pushNotifications';

const LOGO_URL = '/logo.png';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [pushDone, setPushDone] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Remplissez tous les champs');
      return;
    }
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Bienvenue ${user.full_name || ''} !`);
      if ((user.role === 'admin' || user.role === 'barber') && redirect === '/') {
        // Barbers go to /admin, the layout will redirect to their first permitted page
        navigate('/admin');
      } else {
        navigate(redirect);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.data?.error || 'Email ou mot de passe incorrect';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      toast.error('Remplissez les champs obligatoires');
      return;
    }
    if (password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      await register({ email, password, full_name: fullName, phone });
      toast.success('Compte créé avec succès !');
      setShowWelcome(true);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.data?.error || "Erreur lors de l'inscription";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  const handleEnablePush = async () => {
    try {
      await subscribeToPush();
      setPushDone(true);
      toast.success('Notifications activées !');
    } catch (err) {
      toast.error(err.message || 'Impossible d\'activer les notifications');
    }
  };

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors';
  const iconClass = 'absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70';

  if (showWelcome) {
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

          {/* Step 1: Install app */}
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
                    <p className="flex items-center gap-1.5">
                      1. Appuyez sur <Share className="w-3.5 h-3.5 inline text-blue-400" /> en bas du navigateur
                    </p>
                    <p className="flex items-center gap-1.5">
                      2. Sélectionnez <span className="font-semibold text-foreground">"Sur l'écran d'accueil"</span> <Plus className="w-3 h-3 inline text-blue-400" />
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
            onClick={() => navigate(redirect)}
            className="w-full flex items-center justify-center gap-2 h-13 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all"
          >
            Commencer
            <ArrowRight className="w-4 h-4" />
          </motion.button>

          <button onClick={() => navigate(redirect)} className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Passer cette étape
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
          className="w-64 h-64 object-contain mx-auto drop-shadow-2xl"
        />
        <p className="text-sm font-light tracking-[0.3em] uppercase text-muted-foreground mt-1">Premium BarberShop</p>
      </motion.div>

      {/* Title */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="text-center mb-6">
        <h1 className="font-display text-xl font-bold text-foreground">
          {mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === 'login' ? 'Accédez à votre espace' : "Rejoignez D'Home Barber"}
        </p>
      </motion.div>

      <div className="w-full max-w-sm">
        {/* Tabs */}
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

        {/* Form */}
        <motion.form
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
        </motion.form>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-5">
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
      </div>
    </div>
  );
}
