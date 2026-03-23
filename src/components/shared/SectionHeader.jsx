import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function SectionHeader({ title, subtitle, linkTo, linkLabel }) {
  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        {subtitle && (
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">{subtitle}</p>
        )}
        <h2 className="text-xl font-display font-bold text-foreground">{title}</h2>
      </div>
      {linkTo && (
        <Link to={linkTo} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
          {linkLabel || 'Voir tout'}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}