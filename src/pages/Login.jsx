import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Phone, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const LOGO_URL = 'https://media.base44.com/images/public/69c06ae86f050e715edd5046/71f45dd08_Capturedecran2026-02-07a170222.png';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
      if (user.role === 'admin' && redirect === '/') {
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
      navigate(redirect);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.data?.error || "Erreur lors de l'inscription";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors';
  const iconClass = 'absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70';

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
          className="w-36 h-36 object-contain mx-auto drop-shadow-2xl"
        />
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
