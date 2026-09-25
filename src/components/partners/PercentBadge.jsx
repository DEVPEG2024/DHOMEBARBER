import React from 'react';

/** Pastille « -15 % » ; `prefix` = « jusqu'à » sur les cartes qui résument plusieurs offres. */
export default function PercentBadge({ percent, prefix = '', size = 'md', className = '' }) {
  if (!percent) return null;
  const sizes = {
    sm: 'text-sm px-2 py-0.5',
    md: 'text-lg px-2.5 py-0.5',
    lg: 'text-3xl px-3 py-1',
  };
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-xl bg-primary text-primary-foreground font-fut font-extrabold leading-none shadow-lg shadow-primary/25 ${sizes[size] || sizes.md} ${className}`}>
      {prefix && <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{prefix}</span>}
      -{percent}%
    </span>
  );
}
