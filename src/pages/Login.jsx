import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Phone, Scissors, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
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
      // Admin goes to admin dashboard, clients to requested page
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
      const msg = err?.response?.data?.error || err?.data?.error || 'Erreur lors de l\'inscription';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-accent/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-72 h-72 bg-primary/6 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-auto px-4 py-8">
        {/* Back button */}
        <Link to="/">
          <motion.button whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            Retour au salon
          </motion.button>
        </Link>

        {/* Logo & title */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === 'login' ? 'Accédez à votre espace' : 'Rejoignez D\'Home Barber'}
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 p-1 rounded-2xl bg-white/5 border border-white/8">
          {[
            { id: 'login', label: 'Connexion' },
            { id: 'register', label: 'Inscription' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 ${
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
          initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          onSubmit={mode === 'login' ? handleLogin : handleRegister}
          className="space-y-4"
        >
          {mode === 'register' && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Nom complet *"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              placeholder="Email *"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Mot de passe *"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {mode === 'register' && (
            <>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirmer le mot de passe *"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
                />
              </div>

              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="tel"
                  placeholder="Téléphone (optionnel)"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-60"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              mode === 'login' ? 'Se connecter' : 'Créer mon compte'
            )}
          </button>
        </motion.form>

        {/* Footer text */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          {mode === 'login' ? (
            <>Pas encore de compte ?{' '}
              <button onClick={() => setMode('register')} className="text-primary font-semibold hover:underline">
                Inscrivez-vous
              </button>
            </>
          ) : (
            <>Déjà un compte ?{' '}
              <button onClick={() => setMode('login')} className="text-primary font-semibold hover:underline">
                Connectez-vous
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
