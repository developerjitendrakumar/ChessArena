import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Frown, Handshake, Home, RotateCcw, Brain, PlayCircle, Loader2, Share2, Sparkles, Target, ArrowUpRight, ArrowDownRight, Download, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { toast } from 'sonner';
import { toPng } from 'html-to-image';

interface GameOverScreenProps {
  result: 'win' | 'lose' | 'draw';
  reason: string;
  ratingChange?: number | null;
  onClose: () => void;
  onPlayAgain?: () => void;
  onAnalyze?: () => void;
  onReplay?: () => void;
  analyzing?: boolean;
  analysis?: string | null;
  opponentName: string;
  playerName: string;
  gameId?: string;
}

const Particle = ({ color, index }: { color: string, index: number }) => {
  const randomX = Math.random() * 100;
  const randomDelay = Math.random() * 2;
  const randomDuration = 3 + Math.random() * 4;
  
  return (
    <motion.div
      initial={{ y: '110%', x: `${randomX}%`, scale: 0, opacity: 0 }}
      animate={{ 
        y: '-10%', 
        x: `${randomX + (Math.random() * 20 - 10)}%`,
        scale: [0, 1, 0.5, 0],
        opacity: [0, 1, 1, 0],
        rotate: [0, 180, 360]
      }}
      transition={{ 
        duration: randomDuration, 
        repeat: Infinity, 
        delay: randomDelay,
        ease: "linear"
      }}
      className={`absolute w-2 h-2 rounded-full ${color}`}
    />
  );
};

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
  result,
  reason,
  ratingChange,
  onClose,
  onPlayAgain,
  onAnalyze,
  onReplay,
  analyzing,
  analysis,
  opponentName,
  playerName,
  gameId,
}) => {
  const [showContent, setShowContent] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    
    if (result === 'win') {
      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 45, spread: 360, ticks: 100, zIndex: 1000 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 70 * (timeLeft / duration);
        confetti({ 
          ...defaults, 
          particleCount, 
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          colors: ['#fbbf24', '#f59e0b', '#d97706', '#fff']
        });
        confetti({ 
          ...defaults, 
          particleCount, 
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          colors: ['#fbbf24', '#f59e0b', '#d97706', '#fff']
        });
      }, 300);

      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }
    return () => clearTimeout(timer);
  }, [result]);

  const handleShare = async () => {
    if (!shareRef.current) return;
    
    setSharing(true);
    const toastId = toast.loading("Generating shareable result...");
    
    try {
      const replayUrl = gameId ? `${window.location.origin}/replay/${gameId}` : window.location.href;
      const text = `I just ${result === 'win' ? 'won' : result === 'lose' ? 'lost' : 'drew'} a chess match on ChessArena! ${result === 'win' ? '🏆' : ''}\nWatch the replay: ${replayUrl}`;

      // Generate image
      const dataUrl = await toPng(shareRef.current, {
        cacheBust: true,
        backgroundColor: '#020617', // Match bg-slate-950
        style: {
          transform: 'scale(1)',
          borderRadius: '16px'
        }
      });

      // Try Web Share API with image
      if (navigator.share && navigator.canShare) {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], 'chess-match-result.png', { type: 'image/png' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'ChessArena Match Results',
            text: text,
            files: [file],
          });
          toast.dismiss(toastId);
          return;
        }
      }

      // Fallback: Copy link and offer download
      await navigator.clipboard.writeText(text);
      
      // Auto-download for fallback
      const link = document.createElement('a');
      link.download = `chess-result-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      toast.success("Result link copied & image downloaded!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate shareable image", { id: toastId });
    } finally {
      setSharing(false);
    }
  };

  const theme = {
    win: {
      icon: <Trophy className="w-16 h-16 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.3)]" />,
      title: "Victory",
      subtitle: "Brilliant Play",
      gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
      accent: "bg-amber-500",
      text: "text-amber-500",
      border: "border-amber-500/30",
      glow: "shadow-amber-500/40",
      particleColor: "bg-amber-400",
      banner: "bg-amber-500/10",
      headerIcon: <Sparkles className="w-4 h-4 text-amber-500" />
    },
    lose: {
      icon: <Frown className="w-16 h-16 text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]" />,
      title: "Defeat",
      subtitle: "Better luck next time",
      gradient: "from-rose-500/20 via-rose-500/5 to-transparent",
      accent: "bg-rose-500",
      text: "text-rose-500",
      border: "border-rose-500/30",
      glow: "shadow-rose-500/40",
      particleColor: "bg-rose-400",
      banner: "bg-rose-500/10",
      headerIcon: <Target className="w-4 h-4 text-rose-500" />
    },
    draw: {
      icon: <Handshake className="w-16 h-16 text-sky-500 drop-shadow-[0_0_10px_rgba(14,165,233,0.3)]" />,
      title: "Draw",
      subtitle: "Equal match",
      gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
      accent: "bg-sky-500",
      text: "text-sky-500",
      border: "border-sky-500/30",
      glow: "shadow-sky-500/40",
      particleColor: "bg-sky-400",
      banner: "bg-sky-500/10",
      headerIcon: <Handshake className="w-4 h-4 text-sky-500" />
    }
  }[result];

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-hidden">
      {/* Background Particles */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        {Array.from({ length: 20 }).map((_, i) => (
          <Particle key={i} index={i} color={theme.particleColor} />
        ))}
      </div>

      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="w-full max-w-md relative"
          >
            <Card 
              ref={shareRef}
              className={`relative overflow-hidden border border-white/10 rounded-2xl shadow-2xl bg-slate-900/95 backdrop-blur-xl text-white max-h-[90vh] flex flex-col`}
            >
              <CardContent className="p-0 overflow-y-auto hide-scrollbar">
                {/* Header Banner */}
                <div className={`relative h-40 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b ${theme.gradient}`}>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.1 }}
                    className="relative z-10"
                  >
                    {theme.icon}
                  </motion.div>

                  <div className="text-center mt-2 relative z-10">
                    <motion.h1 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-3xl font-black italic tracking-tighter uppercase ${theme.text}`}
                    >
                      {theme.title}
                    </motion.h1>
                    <p className="text-white/40 font-bold tracking-widest text-[10px] uppercase">
                      {theme.subtitle}
                    </p>
                  </div>
                  
                  <div className="absolute top-3 right-3">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/60"
                      onClick={handleShare}
                      disabled={sharing}
                    >
                      {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                <div className="p-5 space-y-5 bg-slate-900/50">
                  {/* Result Details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Reason</p>
                      <p className="font-semibold text-xs text-white/80">{reason}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Rating</p>
                      <div className="flex items-center justify-center gap-1">
                        <span className={`font-bold text-base italic ${ratingChange && ratingChange > 0 ? 'text-emerald-400' : ratingChange && ratingChange < 0 ? 'text-rose-400' : 'text-sky-400'}`}>
                          {ratingChange && ratingChange > 0 ? <ArrowUpRight className="inline w-3 h-3 mr-0.5" /> : ratingChange && ratingChange < 0 ? <ArrowDownRight className="inline w-3 h-3 mr-0.5" /> : null}
                          {ratingChange === 0 ? '0' : (ratingChange && ratingChange > 0 ? `+${ratingChange}` : ratingChange)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Player Comparison */}
                  <div className="relative py-2 px-2">
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5 -translate-y-1/2" />
                    <div className="flex justify-between items-center relative z-10">
                      <div className="flex items-center gap-3 bg-slate-900 pr-3">
                        <div className="w-10 h-10 rounded-full border-2 border-slate-800 p-0.5 bg-slate-900">
                          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${playerName}`} className="w-full h-full rounded-full" alt={playerName} />
                        </div>
                        <div className="text-left">
                          <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">You</p>
                          <p className="font-bold text-xs truncate max-w-[80px]">{playerName}</p>
                        </div>
                      </div>

                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-[9px] text-white/30 shadow-lg">
                        VS
                      </div>

                      <div className="flex items-center gap-3 bg-slate-900 pl-3 text-right flex-row-reverse">
                        <div className="w-10 h-10 rounded-full border-2 border-slate-800 p-0.5 bg-slate-900">
                          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${opponentName}`} className="w-full h-full rounded-full" alt={opponentName} />
                        </div>
                        <div>
                          <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">Opponent</p>
                          <p className="font-bold text-xs truncate max-w-[80px]">{opponentName}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Analysis Preview */}
                  {analysis && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-indigo-500/10 border border-indigo-500/10 rounded-xl p-3 text-[11px] leading-relaxed relative overflow-hidden"
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-indigo-400 font-bold uppercase tracking-widest text-[8px]">
                        <Brain className="w-3 h-3" />
                        <span>Insight</span>
                      </div>
                      <div className="text-white/60 italic">
                        "{analysis}"
                      </div>
                    </motion.div>
                  )}

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Button
                      onClick={onPlayAgain}
                      className={`col-span-2 h-11 rounded-xl font-bold uppercase tracking-widest text-xs transition-all active:scale-95 ${
                        result === 'win' ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' :
                        result === 'lose' ? 'bg-white hover:bg-slate-200 text-slate-950' :
                        'bg-sky-500 hover:bg-sky-600 text-slate-950'
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-2" />
                      Rematch
                    </Button>

                    <Button
                      variant="outline"
                      onClick={onAnalyze}
                      disabled={analyzing}
                      className="h-10 rounded-xl font-bold uppercase tracking-widest text-[9px] border-white/5 hover:bg-white/5 text-white/70"
                    >
                      {analyzing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Brain className="w-3 h-3 mr-2" />}
                      Analyze
                    </Button>

                    <Button
                      variant="outline"
                      onClick={onReplay}
                      className="h-10 rounded-xl font-bold uppercase tracking-widest text-[9px] border-white/5 hover:bg-white/5 text-white/70"
                    >
                      <PlayCircle className="w-3 h-3 mr-2" />
                      Replay
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={onClose}
                      className="col-span-2 h-9 rounded-lg font-bold text-[10px] uppercase text-white/30 hover:text-white/60 hover:bg-white/5"
                    >
                      <Home className="w-3 h-3 mr-1.5" />
                      Exit to Lobby
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
