import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Calendar, Newspaper, User, PartyPopper } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';

const navItems = [
  { path: '/', icon: Home, label: 'Accueil' },
  { path: '/events', icon: PartyPopper, label: 'Événements' },
  { path: '/booking', icon: Calendar, label: 'Réserver' },
  { path: '/feed', icon: Newspaper, label: "New's Gang !" },
  { path: '/profile', icon: User, label: 'Profil' },
];

const springy = { type: 'spring', stiffness: 420, damping: 30 };

export default function BottomNav() {
  const location = useLocation();

  if (location.pathname.startsWith('/admin')) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-transparent" />
      <div className="absolute inset-0 backdrop-blur-2xl" style={{ WebkitBackdropFilter: 'blur(24px)' }} />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative flex items-end justify-around h-[72px] max-w-lg mx-auto px-2 pb-2">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          const isBooking = path === '/booking';

          if (isBooking) {
            return (
              <Link key={path} to={path} onClick={() => hapticFeedback()} className="flex flex-col items-center -mt-4">
                {/* Anneau lumineux qui orbite lentement autour du bouton central */}
                <div className="relative w-14 h-14 rounded-2xl overflow-hidden shadow-lg shadow-primary/40">
                  <div className="nav-orbit absolute -inset-1/2" aria-hidden="true" />
                  <motion.div
                    whileTap={{ scale: 0.92 }}
                    transition={springy}
                    className="absolute inset-[2px] rounded-[14px] bg-primary flex items-center justify-center"
                  >
                    <Icon className="w-5 h-5 text-primary-foreground" strokeWidth={2} />
                  </motion.div>
                </div>
                <span className="text-[11px] font-semibold mt-1 text-primary">{label}</span>
              </Link>
            );
          }

          return (
            <Link key={path} to={path} onClick={() => { if (!isActive) hapticFeedback(); }}
              className="flex flex-col items-center justify-center min-w-[56px] py-1.5">
              <div className="relative flex items-center justify-center w-10 h-10">
                {/* Indicateur actif partagé : glisse d'un onglet à l'autre */}
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    transition={springy}
                    className="absolute inset-0 rounded-xl bg-primary/15"
                  />
                )}
                <motion.div
                  animate={isActive ? { y: -1.5, scale: 1.1 } : { y: 0, scale: 1 }}
                  transition={springy}
                  className="relative"
                >
                  <Icon
                    className={`w-5 h-5 transition-colors duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                </motion.div>
              </div>
              <span className={`text-[11px] font-medium transition-colors duration-300 ${
                isActive ? 'text-primary' : 'text-muted-foreground/70'
              }`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
