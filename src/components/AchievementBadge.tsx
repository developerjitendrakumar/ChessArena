import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface AchievementBadgeProps {
  title: string;
  icon: string;
  description: string;
  dateEarned?: string;
  className?: string;
}

export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  title,
  icon,
  description,
  dateEarned,
  className
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={cn("relative flex flex-col items-center group", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.95 }}
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 flex items-center justify-center text-3xl sm:text-4xl shadow-sm hover:shadow-amber-500/10 hover:border-amber-500/40 transition-colors cursor-help relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
        {icon}
      </motion.div>
      
      <div className="mt-2 text-center">
        <div className="text-[10px] sm:text-xs font-bold text-foreground/80 line-clamp-1">{title}</div>
      </div>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full mb-3 z-50 w-48 p-3 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl pointer-events-none"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">{icon}</span>
                <div className="font-bold text-sm text-white">{title}</div>
              </div>
              <p className="text-[11px] text-white/70 leading-relaxed">
                {description}
              </p>
              {dateEarned && (
                <div className="pt-1.5 border-t border-white/5 text-[9px] text-amber-500/60 font-medium uppercase tracking-wider">
                  Earned {new Date(dateEarned).toLocaleDateString()}
                </div>
              )}
            </div>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900/95" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
