import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Calendar, Newspaper, User, PartyPopper } from 'lucide-react';

const navItems = [
  { path: '/', icon: Home, label: 'Accueil' },
  { path: '/events', icon: PartyPopper, label: 'Événements' },
  { path: '/booking', icon: Calendar, label: 'Réserver' },
  { path: '/feed', icon: Newspaper, label: "New's Gang !" },
  { path: '/profile', icon: User, label: 'Profil' },
];

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
              <Link key={path} to={path} className="flex flex-col items-center -mt-4">
                <div className={`w-14 h-14 rounded-2xl bg-primary shadow-lg shadow-primary/40 flex items-center justify-center border border-primary/30`}>
                  <Icon className="w-5 h-5 text-primary-foreground" strokeWidth={2} />
                </div>
                <span className="text-[11px] font-semibold mt-1 text-primary">{label}</span>
              </Link>
            );
          }

          return (
            <Link key={path} to={path} className="flex flex-col items-center justify-center min-w-[56px] py-1.5">
              <div className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${
                isActive ? 'bg-primary/15' : ''
              }`}>
                <Icon
                  className={`w-5 h-5 transition-all duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
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
