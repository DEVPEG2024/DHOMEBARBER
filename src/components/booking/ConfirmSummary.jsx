/**
 * Récapitulatif de la confirmation : une seule carte, une ligne par choix (prestations, barber,
 * date et heure) avec « Modifier » qui ramène à la bonne étape sans rien perdre du reste.
 * Réservation depuis un look (`look` = { photoUrl, title }) : la ligne des prestations montre la
 * photo du look et son titre ; son « Modifier » ramène au look (décidé par l'appelant).
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Calendar, Scissors } from 'lucide-react';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';
import { formatDuration, formatPrice } from '@/components/services/serviceUtils';
import { LookPhoto } from '@/components/booking/LookHeader';

function Row({ icon, label, children, onEdit, editLabel, last = false, index = 0 }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 + index * 0.07, duration: 0.3, ease: 'easeOut' }}
      className={`flex items-center gap-3 p-3.5 ${last ? '' : 'border-b border-border'}`}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
        {children}
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label={editLabel}
          className="shrink-0 min-h-[44px] px-2 text-[13px] font-semibold text-primary hover:text-primary/80">
          Modifier
        </button>
      )}
    </motion.div>
  );
}

const IconTile = ({ Icon }) => (
  <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/12 text-primary flex items-center justify-center" aria-hidden="true">
    <Icon className="w-[18px] h-[18px]" />
  </span>
);

export default function ConfirmSummary({
  services = [], totalDuration, totalPrice, employee, anyBarber = false, dateLabel, time, endTime,
  onEditServices, onEditSlot, canEditServices = true, look = null,
}) {
  const names = services.map(s => s.name).filter(Boolean).join(' + ');
  return (
    <div className="rounded-[18px] border border-border bg-card overflow-hidden">
      {look ? (
        <Row index={0} icon={<LookPhoto url={look.photoUrl} className="w-10 rounded-[9px]" />} label="Votre look"
          onEdit={canEditServices ? onEditServices : null} editLabel="Modifier le look">
          <p className="text-sm font-semibold text-foreground break-words">{look.title || names}</p>
          {look.title && look.title !== names && (
            <p className="text-xs text-foreground/80 mt-0.5 break-words">{names}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">{formatDuration(totalDuration)} · {formatPrice(totalPrice)}</p>
        </Row>
      ) : (
        <Row index={0} icon={<IconTile Icon={Scissors} />} label={services.length > 1 ? 'Prestations' : 'Prestation'}
          onEdit={canEditServices ? onEditServices : null} editLabel="Modifier les prestations">
          {services.map(s => (
            <p key={s.id} className="text-sm font-semibold text-foreground break-words">{s.name}</p>
          ))}
          <p className="text-xs text-muted-foreground mt-0.5">{formatDuration(totalDuration)} · {formatPrice(totalPrice)}</p>
        </Row>
      )}
      <Row
        index={1}
        icon={(
          <span className="w-10 shrink-0 rounded-[9px] overflow-hidden border border-border flex items-center justify-center"
            style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }} aria-hidden="true">
            {employee?.photo_url
              ? <img src={employee.photo_url} alt="" className="w-full h-full object-cover" />
              : <span className="font-display text-base font-bold text-muted-foreground">{String(employee?.name || '?').charAt(0)}</span>}
          </span>
        )}
        label="Barber"
        onEdit={onEditSlot}
        editLabel="Changer de barber"
      >
        <p className="text-sm font-semibold text-foreground">{employee?.name}</p>
        {anyBarber && <p className="text-xs text-muted-foreground mt-0.5">Premier disponible à cette heure</p>}
      </Row>
      <Row index={2} last icon={<IconTile Icon={Calendar} />} label="Date et heure" onEdit={onEditSlot} editLabel="Changer de date ou d'heure">
        <p className="text-sm font-semibold text-foreground first-letter:uppercase">
          {dateLabel} · <span className="tabular-nums">{time}</span>
        </p>
        {endTime && <p className="text-xs text-muted-foreground mt-0.5">Fin vers {endTime}</p>}
      </Row>
    </div>
  );
}
