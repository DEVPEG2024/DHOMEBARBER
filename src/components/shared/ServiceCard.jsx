import React, { useState } from 'react';
import { Clock, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ServiceCard({ service, onClick, selected, compact }) {
  const [expanded, setExpanded] = useState(false);

  const hasDetails = service.description && service.description.length > 0;

  const toggleDetails = (e) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(service)}
      className={`group cursor-pointer rounded-2xl border transition-all duration-300 p-4 relative overflow-hidden ${
        selected
          ? 'border-primary/40 bg-primary/8 shadow-lg shadow-primary/10'
          : 'border-white/8 bg-white/4 backdrop-blur-xl hover:bg-white/8 hover:border-white/15'
      }`}
    >
      {selected && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
      )}
      <div className="flex items-center justify-between relative">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-foreground">{service.name}</h3>
          {!compact && hasDetails && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{service.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {service.duration} min
            </span>
            <span className="text-sm font-bold text-primary">{service.price}€</span>
            {hasDetails && (
              <button
                onClick={toggleDetails}
                className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors ml-auto"
              >
                Détails
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ml-4 flex-shrink-0 transition-all duration-300 ${
          selected
            ? 'bg-primary shadow-lg shadow-primary/30'
            : 'bg-white/5 border border-white/15 group-hover:border-primary/30'
        }`}>
          <Check className={`w-3.5 h-3.5 transition-all duration-300 ${
            selected ? 'text-primary-foreground opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-30'
          }`} />
        </div>
      </div>

      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-xs text-muted-foreground leading-relaxed">{service.description}</p>
              {service.category && (
                <span className="inline-block mt-2 text-[11px] uppercase tracking-wider text-primary/60 bg-primary/8 px-2 py-0.5 rounded-full">
                  {service.category}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
