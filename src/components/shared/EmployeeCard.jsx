import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export default function EmployeeCard({ employee, onClick, selected }) {
  const [expanded, setExpanded] = useState(false);

  const hasDetails = employee.bio || employee.specialties?.length > 0;

  const toggleDetails = (e) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => onClick?.(employee)}
      className={`cursor-pointer rounded-2xl border p-4 text-center transition-all duration-300 relative overflow-hidden ${
        selected
          ? 'border-primary/40 bg-primary/8 shadow-lg shadow-primary/15'
          : 'border-white/8 bg-white/4 backdrop-blur-xl hover:bg-white/8 hover:border-white/15'
      }`}
    >
      {selected && (
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      )}

      {/* Avatar */}
      <div className={`w-16 h-16 mx-auto rounded-2xl overflow-hidden mb-3 transition-all duration-300 ${
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
      }`}>
        {employee.photo_url ? (
          <img src={employee.photo_url} alt={employee.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl font-bold bg-white/10 text-foreground/60">
            {employee.name?.charAt(0)}
          </div>
        )}
      </div>

      <h3 className="font-semibold text-sm text-foreground">{employee.name}</h3>
      {employee.title && (
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{employee.title}</p>
      )}

      {hasDetails && (
        <button
          onClick={toggleDetails}
          className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors mx-auto mt-2"
        >
          Détails
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}

      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/10 text-left">
              {employee.bio && (
                <p className="text-xs text-muted-foreground leading-relaxed">{employee.bio}</p>
              )}
              {employee.specialties?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {employee.specialties.map((spec, i) => (
                    <span key={i} className="text-[11px] uppercase tracking-wider text-primary/60 bg-primary/8 px-2 py-0.5 rounded-full">
                      {spec}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selected && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-primary-foreground" />
        </motion.div>
      )}
    </motion.div>
  );
}
