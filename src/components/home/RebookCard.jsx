import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '@/api/apiClient';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';

// Statuts qui ne correspondent pas à une vraie visite du client
const IGNORED_STATUSES = ['cancelled', 'break'];

/** Date du jour (YYYY-MM-DD) à l'heure de Paris, comparable aux dates des RDV. */
function todayInParis() {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

/**
 * Bloc « Comme la dernière fois » : relance en un tap de la dernière visite
 * du client connecté (même barber, mêmes prestations). Ne rend rien sans
 * utilisateur connecté ou sans rendez-vous exploitable.
 *
 * @param {object} user       utilisateur connecté (useAuth)
 * @param {Array}  employees  barbers actifs (déjà chargés par l'accueil)
 * @param {Array}  services   prestations actives (déjà chargées par l'accueil)
 */
export default function RebookCard({ user, employees = [], services = [] }) {
  const reduceMotion = useReducedMotion();

  // Le serveur force le filtre sur le client connecté : on ne reçoit que ses RDV
  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', 'mine', user?.email],
    queryFn: () => api.entities.Appointment.filter({ client_email: user.email }, '-date', 20),
    enabled: !!user?.email,
  });

  const last = useMemo(() => {
    const valid = appointments
      .filter(a => a?.date && !IGNORED_STATUSES.includes(a.status))
      // Tri décroissant date puis heure : le serveur ne trie que par date
      .sort((a, b) => (b.date + (b.start_time || '')).localeCompare(a.date + (a.start_time || '')));
    if (valid.length === 0) return null;
    // On préfère la dernière visite passée ; à défaut (client avec un seul RDV
    // à venir), on propose quand même de reprendre ce prochain rendez-vous
    const today = todayInParis();
    return valid.find(a => a.date <= today) || valid[0];
  }, [appointments]);

  const details = useMemo(() => {
    if (!last) return null;
    // Ids mixtes (UUID / number) selon la source : comparaison en chaîne
    const barber = employees.find(e => String(e.id) === String(last.employee_id)) || null;
    const items = Array.isArray(last.services) ? last.services : [];
    // Seules les prestations encore actives sont pré-sélectionnées
    const activeServices = items
      .map(s => services.find(sv => String(sv.id) === String(s?.service_id || s?.id)))
      .filter(Boolean);
    const serviceNames = items.map(s => s?.name).filter(Boolean);
    const barberName = barber?.name || last.employee_name || null;

    const params = new URLSearchParams();
    if (barber) params.set('barber', String(barber.id));
    if (activeServices.length > 0) params.set('services', activeServices.map(s => String(s.id)).join(','));
    const query = params.toString();

    const parsed = parseISO(last.date);
    const isFuture = last.date > todayInParis();
    const sameYear = isValid(parsed) && parsed.getFullYear() === new Date().getFullYear();
    const dateLabel = isValid(parsed) ? format(parsed, sameYear ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy', { locale: fr }) : last.date;

    return {
      barber,
      barberName,
      serviceNames,
      activeServices,
      total: activeServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0),
      duration: activeServices.reduce((sum, s) => sum + (Number(s.duration) || 0), 0),
      href: query ? `/booking?${query}` : '/booking',
      dateLabel,
      isFuture,
    };
  }, [last, employees, services]);

  if (!user?.email || !details) return null;

  const { barber, barberName, serviceNames, activeServices, total, duration, href, dateLabel, isFuture } = details;
  const subtitle = [serviceNames.join(' + ') || 'Votre prestation', barberName ? `avec ${barberName}` : null]
    .filter(Boolean).join(' · ');

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay: 0.2 }}
      className="glass rounded-2xl p-3 relative overflow-hidden"
    >
      {/* Halo discret, même vocabulaire que les cartes prestations */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-3xl pointer-events-none" />

      <div className="relative flex items-center gap-3">
        {/* Vignette portrait du barber (format 1748 × 2480, fond sombre) */}
        <div
          className="w-16 shrink-0 rounded-xl overflow-hidden border border-white/10 shadow-lg shadow-black/40"
          style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }}
        >
          {barber?.photo_url ? (
            <img src={barber.photo_url} alt={barber.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl font-bold text-muted-foreground bg-gradient-to-br from-primary/10 to-primary/5">
              {(barberName || 'D').charAt(0)}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <RotateCcw className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="text-sm font-bold text-foreground truncate">Comme la dernière fois</p>
          </div>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
            {isFuture ? 'Prochain rendez-vous le ' : 'Dernière visite le '}{dateLabel}
            {activeServices.length > 0 && (
              <span className="text-foreground/60"> · {total}€ · {duration} min</span>
            )}
          </p>

          <Link to={href} className="block mt-2.5">
            <motion.span
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors"
            >
              Réserver à nouveau <ArrowRight className="w-3.5 h-3.5" />
            </motion.span>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
