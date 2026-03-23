import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Scissors, Calendar, ShoppingBag, User, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '@/lib/ThemeContext';

const navItems = [
  { path: '/', icon: Home, label: 'Accueil' },
  { path: '/services', icon: Scissors, label: 'Services' },
  { path: '/booking', icon: Calendar, label: 'Réserver' },
  { path: '/shop', icon: ShoppingBag, label: 'Boutique' },
  { path: '/profile', icon: User, label: 'Profil' },
];

export default function BottomNav() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  if (location.pathname.startsWith('/admin')) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute -top-12 right-4 w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center shadow-lg z-50"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Gradient fade */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-transparent" />
      <div className="absolute inset-0 backdrop-blur-2xl" style={{ WebkitBackdropFilter: 'blur(24px)' }} />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative flex items-center justify-around h-[68px] max-w-lg mx-auto px-4 pb-1">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          const isBooking = path === '/booking';

          if (isBooking) {
            return (
              <Link key={path} to={path} className="flex flex-col items-center justify-center -mt-5">
                <motion.div
                  whileTap={{ scale: 0.93 }}
                  className="w-14 h-14 rounded-2xl bg-primary shadow-lg shadow-primary/40 flex items-center justify-center border border-primary/30"
                >
                  <Icon className="w-5 h-5 text-primary-foreground" strokeWidth={2} />
                </motion.div>
                <span className={`text-[9px] font-semibold tracking-wider mt-1 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  {label.toUpperCase()}
                </span>
              </Link>
            );
          }

          return (
            <Link key={path} to={path} className="flex flex-col items-center justify-center gap-1 py-1 relative min-w-[52px]">
              <div className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 ${
                isActive ? 'bg-primary/15' : ''
              }`}>
                <Icon
                  className={`w-5 h-5 transition-all duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
              </div>
              <span className={`text-[9px] font-semibold tracking-wider transition-colors duration-300 ${
                isActive ? 'text-primary' : 'text-muted-foreground/60'
              }`}>
                {label.toUpperCase()}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute -bottom-0.5 w-4 h-0.5 rounded-full bg-primary"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}