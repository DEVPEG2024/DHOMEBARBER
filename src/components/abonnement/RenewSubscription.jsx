/**
 * Sur la page des cartes : plus qu'une coupe, ou abonnement terminé. Les pushs « Plus qu'une coupe » et
 * « Abonnement terminé » mènent ici (les apps publiées n'ont pas `/abonnement`) : le bouton pour en
 * reprendre un doit s'y trouver. Formule retirée entre-temps : `/abonnement` propose les autres.
 */
import React from 'react';
import { Link } from 'react-router-dom';

export default function RenewSubscription({ subscription }) {
  const title = subscription.outdated
    ? 'Vos coupes ne sont plus valables'
    : subscription.visits_left <= 0 ? 'Votre abonnement est terminé' : 'Plus qu\'une coupe sur votre abonnement';
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3.5">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-0.5 text-[13px] text-foreground/85">Reprenez un abonnement pour garder vos créneaux : {subscription.service_name}.</p>
      <Link
        to={`/abonnement?service=${encodeURIComponent(subscription.service_id)}`}
        className="mt-2.5 min-h-[44px] flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Reprendre un abonnement
      </Link>
    </div>
  );
}
