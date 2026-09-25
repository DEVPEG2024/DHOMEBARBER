import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BadgeCheck, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { hapticFeedback } from '@/lib/capacitor';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * « Carte Gang » à montrer au partenaire : nom du client, partenaire, code promo éventuel et une
 * horloge qui tourne à la seconde avec un reflet animé, pour qu'une simple capture d'écran se
 * repère d'un coup d'œil. Aucune donnée n'est envoyée au partenaire.
 */
export default function GangPass({ user, partner }) {
  const reduceMotion = useReducedMotion();
  const now = useClock();
  const [copied, setCopied] = useState(false);
  const code = String(partner?.promo_code || '').trim();

  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      hapticFeedback();
      setCopied(true);
      toast.success('Code copié');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Copie impossible : note le code à la main');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-[#10261a] via-[#0d1611] to-[#07120c] p-5">
      {!reduceMotion && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]"
          animate={{ x: ['0%', '400%'] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
        />
      )}
      <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-primary/15 blur-2xl" aria-hidden="true" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-semibold">Carte Gang</p>
              <p className="text-[11px] text-white/60">D'Home Barber · Douvaine</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/30 px-2 py-1 text-[10px] font-semibold text-primary">
            <BadgeCheck className="w-3 h-3" /> Membre
          </span>
        </div>

        <p className="mt-4 font-fut text-3xl font-extrabold uppercase leading-none text-white truncate">
          {user?.full_name || 'Membre du Gang'}
        </p>
        <p className="text-xs text-white/60 mt-1 truncate">chez {partner?.name}</p>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="font-fut text-2xl font-bold tabular-nums text-white leading-none">{time}</p>
            <p className="text-[11px] text-white/50 mt-1 first-letter:uppercase">{date}</p>
          </div>
          {code && (
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-2 rounded-xl bg-white text-black px-3 py-2 font-mono text-sm font-bold tracking-wider"
              aria-label={`Copier le code ${code}`}
            >
              {code}
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
