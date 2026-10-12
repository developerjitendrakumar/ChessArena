import { useEffect, useState, useRef, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Chessboard } from 'react-chessboard';
import { Square } from 'react-chessboard/dist/chessboard/types';
import { Chess } from 'chess.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Timer, Search, Loader2, Brain, Swords, PlayCircle, History, Volume2, VolumeX, RotateCcw, Sparkles, Layers, AlertOctagon, Copy, Check, Share2, Crown, Zap, Sliders, X, CheckCircle2, ChevronRight, ArrowRight, User, Users, Shield, Plus, Minus, ArrowLeftRight, Clock } from 'lucide-react';
import { TextChat } from '@/components/TextChat';
import { AutoPlayAdmin } from '@/components/AutoPlayAdmin';
import { VoiceChat } from '@/components/VoiceChat';
import { GameReplayModal } from '@/components/GameReplayModal';
import { GameOverScreen } from '@/components/GameOverScreen';

import { playSound } from '../utils/audio';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface TimerConfig {
  type: 'bullet' | 'blitz' | 'rapid' | 'classical' | 'custom';
  minutes: number;
  increment: number;
}

function formatTime(ms: number) {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (totalSeconds < 20) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}`;
  }
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatMoveVerbose(move: any) {
  if (!move) return '';
  const colors: Record<string, string> = { w: "White's", b: "Black's" };
  const pieces: Record<string, string> = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };
  const pieceName = pieces[move.piece] || move.piece;
  const colorName = colors[move.color] || move.color;
  let action = "to";
  
  if (move.flags && (move.flags.includes('c') || move.flags.includes('e'))) {
    action = "takes on";
  } else if (move.flags && move.flags.includes('k')) {
    return `${colorName} kingside castles`;
  } else if (move.flags && move.flags.includes('q')) {
    return `${colorName} queenside castles`;
  }
  
  return `${colorName} ${pieceName} ${action} ${move.to}`;
}


const pieceSymbols: Record<string, Record<string, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }
};

const CapturedPieces = ({ pieces, color, advantage }: { pieces: any[], color: 'w' | 'b', advantage?: number }) => {
  if ((!pieces || pieces.length === 0) && (!advantage || advantage <= 0)) return null;
  return (
    <div className="flex flex-wrap gap-0.5 ml-2 items-center">
      <AnimatePresence>
        {pieces && pieces.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, scale: 0.5, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={`text-lg leading-none cursor-default select-none ${color === 'w' ? 'text-zinc-400 dark:text-zinc-300 drop-shadow-sm' : 'text-zinc-800 dark:text-zinc-900 drop-shadow-sm'}`}
          >
            {pieceSymbols[color][p.type]}
          </motion.div>
        ))}
      </AnimatePresence>
      {advantage !== undefined && advantage > 0 && (
        <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30">
          +{advantage}
        </span>
      )}
    </div>
  );
};

const getCustomPieces = (style: string) => {
  return undefined;
};

export function Play() {
  const { 
    user, chess, gameId, opponent, gameState, timeControl, searchGame, makeMove, 
    resetGame, playerColor, socket, opponentDisconnectedAt, gameOverReason, 
    ratingChange, activeGameToRejoin, resignGame, rejoinGame, tutorMessage, 
    saveLocalGame, resumeLocalGame, hasSavedGame, checkSavedGame, tick,
    customTimeConfig, setCustomTimeConfig, createPrivateRoom, joinPrivateRoom, cancelPrivateRoom
  } = useAppStore();
  const { boardStyle, pieceStyle, animatedBoard, board3D, highContrast, colorblindMode, setCustomization } = useAppStore();

  if (!user) return <Navigate to="/login" />;

  const [selectedTC, setSelectedTC] = useState<string>('bullet');
  const [isFlipped, setIsFlipped] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);

  // Custom Timer Settings
  const [customMins, setCustomMins] = useState<number>(customTimeConfig?.minutes || 5);
  const [customInc, setCustomInc] = useState<number>(customTimeConfig?.increment || 2);

  // Private Room & Code
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Play with Computer Bot Settings
  const [showBotModal, setShowBotModal] = useState(false);
  const [selectedBotLevel, setSelectedBotLevel] = useState<number>(5); // Default to Yellow Level
  const [botPlayerSide, setBotPlayerSide] = useState<'w' | 'random' | 'b'>('w');
  const [botUseTimer, setBotUseTimer] = useState<boolean>(true);

  const timeControls = [
    { id: 'bullet', name: 'Bullet', time: '1 min', icon: '⚡' },
    { id: 'blitz', name: 'Blitz', time: '3 min + 2s', icon: '⏱️' },
    { id: 'rapid', name: 'Rapid', time: '10 min', icon: '🐢' },
    { id: 'classical', name: 'Classical', time: '30 min', icon: '⏳' },
    { id: 'custom', name: 'Custom', time: 'Custom timer', icon: '⚙️' },
  ];

  useEffect(() => {
    let interval: any;
    if (gameState === 'playing') {
      interval = setInterval(() => {
        tick();
      }, 100);
    }
    return () => clearInterval(interval);
  }, [gameState, tick]);

  const getBoardStyles = () => {
    if (highContrast) return { dark: '#000000', light: '#ffffff' };
    if (colorblindMode) return { dark: '#005ab5', light: '#dc3220' };
    switch (boardStyle) {
      case 'emerald': return { dark: '#2e6f40', light: '#ebecd0' };
      case 'wood': return { dark: '#b58863', light: '#f0d9b5' };
      case 'neon': return { dark: '#090d16', light: '#38bdf8' };
      case 'glass': return { dark: '#1e293b', light: '#64748b' };
      case 'slate': default: return { dark: '#334155', light: '#94a3b8' };
    }
  };
  const { dark: darkSquare, light: lightSquare } = getBoardStyles();
  const effectiveOrientation = (playerColor === 'b' && timeControl !== 'local-pass') 
    ? (isFlipped ? 'white' : 'black') 
    : (isFlipped ? 'black' : 'white');

  const boardTransform = board3D ? 'perspective(1000px) rotateX(20deg) scale(0.95)' : 'none';
  const boardBoxShadow = board3D ? '0 20px 40px rgba(0,0,0,0.4), 0 10px 15px rgba(0,0,0,0.2)' : 'none';

  const [analysis, setAnalysis] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reporting, setReporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [disconnectTimer, setDisconnectTimer] = useState(60);

  const [reportType, setReportType] = useState<'chat' | 'voice'>('chat');
  const [recordingEvidence, setRecordingEvidence] = useState(false);
  const [evidenceCaptured, setEvidenceCaptured] = useState<string | null>(null);

  const handleReport = async () => {
    if (!user || !opponent) {
      toast.error('You must be logged in to report a user');
      return;
    }
    
    setReporting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reportedUser: opponent.username, 
          reporterId: user.username,
          reason: reportMessage || `Abusive ${reportType} behavior`,
          type: reportType,
          evidence: evidenceCaptured,
          gameId: gameId,
          pgn: chess?.pgn()
        })
      });
      
      if (res.ok) {
        toast.success('Report submitted. Our moderation team will review the evidence shortly.');
        setShowReportModal(false);
        setReportMessage('');
        setEvidenceCaptured(null);
      } else {
        toast.error('Failed to submit report');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit report');
    } finally {
      setReporting(false);
    }
  };

  // Listen for voice chunks to capture as evidence
  useEffect(() => {
    if (showReportModal && reportType === 'voice') {
      const handleChunk = (e: any) => {
        if (recordingEvidence) {
          setEvidenceCaptured(e.detail);
          setRecordingEvidence(false);
          toast.success("Voice evidence snippet captured!");
        }
      };
      window.addEventListener('voice_chunk_ready', handleChunk);
      return () => window.removeEventListener('voice_chunk_ready', handleChunk);
    }
  }, [showReportModal, reportType, recordingEvidence]);


  
  useEffect(() => {
    checkSavedGame();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && gameState === 'playing' && user && socket) {
        socket.emit("anti_cheat_alert", {
           gameId,
           username: user.username,
           reason: "Multiple Tab Switches"
        });
        toast.warning("Fair Play Warning", {
           description: "Switching tabs during an active game is not allowed and reduces your Fair Play Score."
        });
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [gameState, user, socket, gameId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (opponentDisconnectedAt && gameState === 'playing') {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - opponentDisconnectedAt) / 1000);
        setDisconnectTimer(Math.max(0, 30 - elapsed));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [opponentDisconnectedAt, gameState]);

  const handleAnalyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setAnalysis("Analysis complete: You played a brilliant game! Minor inaccuracies in the opening, but strong tactical vision in the middle game.");
    }, 2000);
  };

  const getClockStyle = (isActive: boolean, time: number) => {
    let base = "font-mono font-bold text-2xl px-4 py-2 rounded-lg transition-all duration-300 ";
    if (time < 10000) base += "text-destructive bg-destructive/10 animate-pulse ring-2 ring-destructive/50";
    else if (isActive) base += "text-primary bg-primary/10 shadow-[0_0_20px_rgba(16,185,129,0.3)] ring-2 ring-primary/30 scale-105";
    else base += "text-muted-foreground bg-muted border border-border";
    return base;
  };

  const getKingSquare = (color: 'w' | 'b') => {
    if (!chess) return null;
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === color) {
          return `${String.fromCharCode(97 + c)}${8 - r}`;
        }
      }
    }
    return null;
  };

  const bottomTime = playerColor === 'w' ? useAppStore(s => s.whiteTime) : useAppStore(s => s.blackTime);
  const topTime = playerColor === 'w' ? useAppStore(s => s.blackTime) : useAppStore(s => s.whiteTime);
  const isBottomActive = chess?.turn() === (playerColor === 'w' ? 'w' : 'b') && gameState === 'playing';
  const isTopActive = chess?.turn() === (playerColor === 'w' ? 'b' : 'w') && gameState === 'playing';

  const getCaptured = (color: 'w' | 'b') => {
    if (!chess) return [];
    const history = chess.history({ verbose: true });
    return history
      .filter(m => m.captured && m.color === color)
      .map((m, i) => ({ id: `${m.captured}-${i}`, type: m.captured as any }));
  };

  const bottomCaptured = getCaptured(playerColor === 'w' ? 'w' : 'b');
  const topCaptured = getCaptured(playerColor === 'w' ? 'b' : 'w');
  const bottomColor = playerColor === 'w' ? 'w' : 'b';
  const topColor = playerColor === 'w' ? 'b' : 'w';

  const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const bottomMaterial = bottomCaptured.reduce((sum, p) => sum + (PIECE_VALUES[p.type] || 0), 0);
  const topMaterial = topCaptured.reduce((sum, p) => sum + (PIECE_VALUES[p.type] || 0), 0);
  const bottomAdvantage = bottomMaterial - topMaterial;
  const topAdvantage = topMaterial - bottomMaterial;

  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<Square | null>(null);
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [optionSquares, setOptionSquares] = useState({});
  const [coachAnalysis, setCoachAnalysis] = useState('');
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);

  const botOptions = [
    {
      level: 1,
      id: 'ai-1',
      name: 'Level 1: Novice Bot',
      badge: 'Beginner',
      rating: 800,
      description: 'Friendly & forgiving. Makes natural beginner mistakes and casual moves.',
      icon: '♟️',
      colorClass: 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-white dark:bg-slate-900',
      activeClass: 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 ring-2 ring-emerald-500/30',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
    },
    {
      level: 2,
      id: 'ai-2',
      name: 'Level 2: Casual Bot',
      badge: 'Club Player',
      rating: 1300,
      description: 'Solid opening development and tactical fundamentals with balanced gameplay.',
      icon: '♞',
      colorClass: 'border-slate-200 dark:border-slate-800 hover:border-blue-500/50 bg-white dark:bg-slate-900',
      activeClass: 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20 ring-2 ring-blue-500/30',
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
    },
    {
      level: 3,
      id: 'ai-3',
      name: 'Level 3: Advanced Bot',
      badge: 'Expert Master',
      rating: 1900,
      description: 'Sharp tactical calculation, punishing positional play, and high endgame precision.',
      icon: '♜',
      colorClass: 'border-slate-200 dark:border-slate-800 hover:border-purple-500/50 bg-white dark:bg-slate-900',
      activeClass: 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/20 ring-2 ring-purple-500/30',
      badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300'
    },
    {
      level: 4,
      id: 'ai-4',
      name: 'Level 4: Grandmaster Bot',
      badge: 'International Master',
      rating: 2600,
      description: 'Elite positional mastery, deep opening preparation, and flawless tactical calculation.',
      icon: '♛',
      colorClass: 'border-slate-200 dark:border-slate-800 hover:border-amber-500/50 bg-white dark:bg-slate-900',
      activeClass: 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 ring-2 ring-amber-500/30',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
    },
    {
      level: 5,
      id: 'ai-5',
      name: 'Level 5: Superhuman Bot (Yellow Level Highest)',
      badge: 'YELLOW LEVEL HIGHEST',
      rating: 3500,
      description: 'More than any human! Deep 20-ply neural evaluation, flawless calculation, and ruthless tactical accuracy.',
      icon: '⚡',
      isYellowLevel: true,
      colorClass: 'border-yellow-400/80 dark:border-yellow-500/80 bg-gradient-to-br from-yellow-50 via-amber-50 to-yellow-100/60 dark:from-yellow-950/30 dark:via-amber-950/20 dark:to-yellow-900/30',
      activeClass: 'border-2 border-yellow-500 bg-yellow-100/90 dark:bg-yellow-900/40 ring-4 ring-yellow-400/40 shadow-[0_0_25px_rgba(234,179,8,0.4)]',
      badgeClass: 'bg-yellow-400 text-yellow-950 font-black tracking-wider uppercase border border-yellow-500 shadow-xs'
    }
  ];

  const handleUpdateCustomTime = (mins: number, inc: number) => {
    const validMins = Math.max(1, Math.min(180, mins));
    const validInc = Math.max(0, Math.min(60, inc));
    setCustomMins(validMins);
    setCustomInc(validInc);
    setCustomTimeConfig({ minutes: validMins, increment: validInc });
  };

  const handleStartBotGame = (level?: number) => {
    const lvl = level !== undefined ? level : selectedBotLevel;
    searchGame(`ai-${lvl}`, {
      side: botPlayerSide,
      baseTimeControl: botUseTimer ? selectedTC : 'classical',
      customMinutes: customMins,
      customIncrement: customInc
    });
    setShowBotModal(false);
  };

  const handleCreateRoom = () => {
    createPrivateRoom(selectedTC, {
      customMinutes: customMins,
      customIncrement: customInc
    });
  };

  const handleCancelRoom = () => {
    if (roomCode) {
      cancelPrivateRoom(roomCode);
      setRoomCode(null);
    }
  };

  const handleJoinRoom = () => {
    const clean = joinCodeInput.replace(/[^0-9a-zA-Z]/g, '').trim().toUpperCase();
    if (!clean) {
      toast.error("Please enter a room code.");
      return;
    }
    setIsJoiningRoom(true);
    joinPrivateRoom(clean);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success("Room code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/play?room=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success("Room invite link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        const clean = roomParam.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
        setJoinCodeInput(clean);
        toast.info(`Room code ${clean} loaded from link. Click Join!`);
      }
    } catch (e) {}
  }, []);

  const prevFenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!chess) return;
    const currentFen = chess.fen();
    if (prevFenRef.current && prevFenRef.current !== currentFen) {
      if (!soundMuted) {
        if (chess.inCheck() || chess.isCheck()) {
          playSound('check');
        } else {
          const hist = chess.history({ verbose: true });
          const last = hist[hist.length - 1];
          if (last && (last.captured || (last.flags && (last.flags.includes('c') || last.flags.includes('e'))))) {
            playSound('capture');
          } else {
            playSound('move');
          }
        }
      }
    }
    prevFenRef.current = currentFen;
  }, [chess?.fen(), soundMuted]);

  useEffect(() => {
    const onRoomCreated = (e: any) => {
      setRoomCode(e.detail.code);
      toast.success(`Room created! Code: ${e.detail.code}`);
    };
    const onRoomCancelled = () => {
      setRoomCode(null);
      setIsJoiningRoom(false);
      toast.info("Private room closed.");
    };
    const onRoomError = (e: any) => {
      setIsJoiningRoom(false);
      toast.error(e.detail.message || "Failed to join room.");
    };
    
    window.addEventListener('room_created', onRoomCreated);
    window.addEventListener('room_cancelled', onRoomCancelled);
    window.addEventListener('room_error', onRoomError);
    return () => {
      window.removeEventListener('room_created', onRoomCreated);
      window.removeEventListener('room_cancelled', onRoomCancelled);
      window.removeEventListener('room_error', onRoomError);
    };
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      setIsJoiningRoom(false);
    }
  }, [gameState]);

  const handleDrop = (sourceSquare: string, targetSquare: string, piece: string) => {
    if (gameState !== 'playing') return false;
    
    // Check for promotion
    if ((piece === 'wP' && targetSquare[1] === '8') || (piece === 'bP' && targetSquare[1] === '1')) {
      setMoveFrom(sourceSquare);
      setMoveTo(targetSquare as Square);
      setShowPromotionDialog(true);
      return false; // wait for dialog
    }

    const success = makeMove({ from: sourceSquare, to: targetSquare });
    setMoveFrom(null);
    setOptionSquares({});
    return !!success;
  };

  const onPromotionPieceSelect = (piece: string | undefined) => {
    if (piece && moveFrom && moveTo) {
      const promotion = piece[1].toLowerCase() || 'q';
      makeMove({ from: moveFrom, to: moveTo, promotion });
    }
    setMoveFrom(null);
    setMoveTo(null);
    setShowPromotionDialog(false);
    setOptionSquares({});
    return true;
  };

  const onPromotionCheck = (sourceSquare: string, targetSquare: string, piece: string) => {
    return (piece === 'wP' && targetSquare[1] === '8') || (piece === 'bP' && targetSquare[1] === '1');
  };

  const generateMoveHighlightOptions = (square: string, verboseMoves: any[]) => {
    const newOptions: Record<string, any> = {};
    newOptions[square] = {
      backgroundColor: 'rgba(59, 130, 246, 0.45)',
      boxShadow: 'inset 0 0 10px rgba(59, 130, 246, 0.65)',
      borderRadius: '6px'
    };
    verboseMoves.forEach((m: any) => {
      if (m.captured || (m.flags && (m.flags.includes('c') || m.flags.includes('e')))) {
        newOptions[m.to] = {
          background: 'radial-gradient(circle, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.4) 60%, transparent 80%)',
          border: '3px solid rgba(239, 68, 68, 0.85)',
          borderRadius: '50%',
          cursor: 'pointer'
        };
      } else {
        newOptions[m.to] = {
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.75) 24%, transparent 26%)',
          borderRadius: '50%',
          cursor: 'pointer'
        };
      }
    });
    return newOptions;
  };

  const onSquareClick = (square: string) => {
    if (gameState !== 'playing' || !chess) return;
    
    // check if it's our turn
    if (timeControl !== 'local-pass' && chess.turn() !== playerColor) return;

    if (moveFrom === null) {
      const piece = chess.get(square as any);
      if (piece && piece.color === chess.turn()) {
        setMoveFrom(square);
        const moves = chess.moves({ square: square as any, verbose: true });
        setOptionSquares(generateMoveHighlightOptions(square, moves));
      }
    } else {
      const moves = chess.moves({ square: moveFrom as any, verbose: true });
      const foundMove = moves.find((m: any) => m.to === square);
      
      if (foundMove) {
        if (foundMove.promotion) {
          setMoveTo(square as Square);
          setShowPromotionDialog(true);
        } else {
          handleDrop(moveFrom, square, chess.get(moveFrom as any).type);
        }
      } else {
        const piece = chess.get(square as any);
        if (piece && piece.color === chess.turn()) {
          setMoveFrom(square);
          const newMoves = chess.moves({ square: square as any, verbose: true });
          setOptionSquares(generateMoveHighlightOptions(square, newMoves));
        } else {
          setMoveFrom(null);
          setOptionSquares({});
        }
      }
    }
  };

  const lastMove = chess?.history({ verbose: true }).pop();
  const lastMoveSquares = lastMove ? {
    [lastMove.from]: { 
      backgroundColor: 'rgba(245, 158, 11, 0.35)',
      boxShadow: 'inset 0 0 8px rgba(245, 158, 11, 0.45)',
      borderRadius: '4px'
    },
    [lastMove.to]: { 
      backgroundColor: 'rgba(245, 158, 11, 0.45)',
      boxShadow: 'inset 0 0 8px rgba(245, 158, 11, 0.55)',
      borderRadius: '4px'
    }
  } : {};

  const isKingInCheck = !!(chess && (chess.inCheck() || chess.isCheck()));
  const kingInCheckSquare = isKingInCheck ? getKingSquare(chess.turn()) : null;
  const checkSquares = kingInCheckSquare ? {
    [kingInCheckSquare]: {
      background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.8) 45%, rgba(185, 28, 28, 0.45) 75%, transparent 100%)',
      boxShadow: 'inset 0 0 20px 4px rgba(220, 38, 38, 1), 0 0 25px rgba(239, 68, 68, 0.85)',
      borderRadius: '8px',
      border: '2px solid rgba(254, 202, 202, 0.95)',
      animation: 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
    }
  } : {};

  const combinedSquareStyles = {
    ...lastMoveSquares,
    ...optionSquares,
    ...checkSquares
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-start gap-8 max-w-7xl mx-auto py-4 md:py-8 px-4">
      <AnimatePresence mode="popLayout">
        {gameState === 'idle' && (
          <motion.div 
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full space-y-12"
          >
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">Play Chess</h1>
              <p className="text-slate-500 dark:text-slate-400 text-lg">Find a match online or play locally against a friend or AI</p>
            </div>

          <Card className="w-full max-w-4xl mx-auto border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden rounded-2xl bg-white dark:bg-slate-900">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Timer className="w-5 h-5" />
                <CardTitle className="text-base font-semibold">Match Time Control</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {timeControls.map((tc) => (
                  <button
                    key={tc.id}
                    onClick={() => setSelectedTC(tc.id)}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 group ${
                      selectedTC === tc.id 
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg scale-105' 
                        : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-emerald-200 dark:hover:border-emerald-800'
                    }`}
                  >
                    <span className={`text-2xl mb-2 transition-transform duration-200 ${selectedTC === tc.id ? 'scale-110' : 'group-hover:scale-110'}`}>
                      {tc.icon}
                    </span>
                    <span className="font-bold text-sm">{tc.name}</span>
                    <span className={`text-[10px] opacity-80 ${selectedTC === tc.id ? 'text-emerald-50' : 'text-slate-400'}`}>
                      {tc.id === 'custom' ? `${customMins}m + ${customInc}s` : tc.time}
                    </span>
                  </button>
                ))}
              </div>

              {/* Custom Timer Configuration Panel */}
              {selectedTC === 'custom' && (
                <div className="mt-4 p-5 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      <div>
                        <h4 className="font-bold text-sm text-foreground">Configure Custom Chess Clock</h4>
                        <p className="text-xs text-muted-foreground">Customize your exact starting minutes and per-move increment.</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="self-start sm:self-center font-mono font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                      ⏱️ {customMins} min + {customInc}s increment
                    </Badge>
                  </div>

                  {/* Quick Presets */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                      Quick Time Presets
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: '1+0 Bullet', m: 1, s: 0 },
                        { label: '2+1 Bullet', m: 2, s: 1 },
                        { label: '3+0 Blitz', m: 3, s: 0 },
                        { label: '3+2 Blitz', m: 3, s: 2 },
                        { label: '5+0 Blitz', m: 5, s: 0 },
                        { label: '5+3 Blitz', m: 5, s: 3 },
                        { label: '10+0 Rapid', m: 10, s: 0 },
                        { label: '15+10 Rapid', m: 15, s: 10 },
                        { label: '30+0 Classical', m: 30, s: 0 },
                        { label: '60+0 Marathon', m: 60, s: 0 },
                      ].map((preset) => (
                        <Button
                          key={preset.label}
                          type="button"
                          variant={customMins === preset.m && customInc === preset.s ? "default" : "outline"}
                          size="sm"
                          className={`h-7 text-xs ${customMins === preset.m && customInc === preset.s ? 'bg-amber-600 hover:bg-amber-700 text-white font-bold' : ''}`}
                          onClick={() => handleUpdateCustomTime(preset.m, preset.s)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* Minutes selector */}
                    <div className="space-y-2 p-3 bg-background/80 rounded-lg border border-border/70">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          Starting Time (Minutes)
                        </label>
                        <span className="font-mono font-bold text-sm text-primary">{customMins} min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleUpdateCustomTime(Math.max(1, customMins - 1), customInc)}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <input
                          type="range"
                          min="1"
                          max="120"
                          value={customMins}
                          onChange={(e) => handleUpdateCustomTime(parseInt(e.target.value) || 1, customInc)}
                          className="flex-1 accent-amber-500 cursor-pointer"
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleUpdateCustomTime(Math.min(180, customMins + 1), customInc)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                        <span>1 min</span>
                        <span>15 min</span>
                        <span>30 min</span>
                        <span>60 min</span>
                        <span>120 min</span>
                      </div>
                    </div>

                    {/* Increment selector */}
                    <div className="space-y-2 p-3 bg-background/80 rounded-lg border border-border/70">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          Move Increment (Seconds)
                        </label>
                        <span className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400">+{customInc}s</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleUpdateCustomTime(customMins, Math.max(0, customInc - 1))}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <input
                          type="range"
                          min="0"
                          max="60"
                          value={customInc}
                          onChange={(e) => handleUpdateCustomTime(customMins, parseInt(e.target.value) || 0)}
                          className="flex-1 accent-amber-500 cursor-pointer"
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleUpdateCustomTime(customMins, Math.min(60, customInc + 1))}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                        <span>+0s</span>
                        <span>+5s</span>
                        <span>+15s</span>
                        <span>+30s</span>
                        <span>+60s</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Active Selection: <span className="font-bold text-slate-900 dark:text-white">{timeControls.find(t => t.id === selectedTC)?.name}</span> 
                  <span className="text-xs ml-1 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    ({selectedTC === 'custom' ? `${customMins} min + ${customInc}s` : timeControls.find(t => t.id === selectedTC)?.time})
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl mx-auto">
             <Card 
               className="border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden rounded-2xl group cursor-pointer hover:shadow-xl transition-shadow" 
               onClick={() => searchGame(selectedTC, { customMinutes: customMins, customIncrement: customInc })}
             >
               <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
                 <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                   <Swords className="w-8 h-8" />
                 </div>
                 <h3 className="text-xl font-bold">Quick Player Online</h3>
                 <p className="text-sm text-slate-500">
                   Pair with someone of your skill level for a rated match with {selectedTC === 'custom' ? `${customMins}m+${customInc}s` : selectedTC} clock.
                 </p>
                 <Button className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                   Find Match
                 </Button>
               </CardContent>
             </Card>

             <Card className="border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden rounded-2xl group hover:shadow-xl transition-shadow flex flex-col justify-between">
               <CardContent className="p-8 flex flex-col items-center text-center space-y-4 flex-1 justify-between">
                 <div className="flex flex-col items-center space-y-3">
                   <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-400/50 rounded-full flex items-center justify-center text-yellow-600 dark:text-yellow-400 group-hover:scale-110 transition-transform shadow-xs">
                     <Brain className="w-8 h-8" />
                   </div>
                   <div>
                     <div className="flex items-center justify-center gap-1.5 mb-1">
                       <h3 className="text-xl font-bold">Play with Computer</h3>
                       <Badge className="bg-yellow-400 text-yellow-950 font-black text-[10px] px-1.5 py-0 uppercase">
                         Lv 1 - 5
                       </Badge>
                     </div>
                     <p className="text-sm text-slate-500">
                       Challenge Level 1, 2, 3 or the Superhuman Yellow Level bot (more than human).
                     </p>
                   </div>
                 </div>

                 {/* Quick Pick Bot Buttons */}
                 <div className="w-full space-y-2 pt-2">
                   <div className="grid grid-cols-2 gap-2 text-xs">
                     <Button 
                       variant="outline" 
                       size="sm" 
                       className="h-8 justify-start text-xs border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                       onClick={(e) => { e.stopPropagation(); handleStartBotGame(1); }}
                     >
                       <span className="mr-1">♟️</span> Lv 1 Novice
                     </Button>
                     <Button 
                       variant="outline" 
                       size="sm" 
                       className="h-8 justify-start text-xs border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                       onClick={(e) => { e.stopPropagation(); handleStartBotGame(2); }}
                     >
                       <span className="mr-1">♞</span> Lv 2 Casual
                     </Button>
                     <Button 
                       variant="outline" 
                       size="sm" 
                       className="h-8 justify-start text-xs border-purple-300 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                       onClick={(e) => { e.stopPropagation(); handleStartBotGame(3); }}
                     >
                       <span className="mr-1">♜</span> Lv 3 Expert
                     </Button>
                     <Button 
                       variant="outline" 
                       size="sm" 
                       className="h-8 justify-start text-xs border-2 border-yellow-400 dark:border-yellow-500 bg-yellow-100/70 hover:bg-yellow-200/80 dark:bg-yellow-950/40 text-yellow-950 dark:text-yellow-200 font-bold shadow-xs"
                       onClick={(e) => { e.stopPropagation(); handleStartBotGame(5); }}
                     >
                       <Crown className="w-3.5 h-3.5 mr-1 text-yellow-600 dark:text-yellow-400 fill-yellow-500" />
                       Lv 5 Yellow
                     </Button>
                   </div>

                   <Button 
                     variant="default"
                     className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold shadow-sm"
                     onClick={() => setShowBotModal(true)}
                   >
                     <Brain className="w-4 h-4 mr-2" />
                     Choose Bot Level &amp; Side
                   </Button>
                 </div>
               </CardContent>
             </Card>
          </div>

          {/* Room Code Section */}
          <div className="w-full max-w-4xl mx-auto">
            <Card className="border-primary/20 dark:border-primary/20 bg-primary/5 shadow-sm overflow-hidden rounded-2xl">
               <CardContent className="p-6">
                 <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary shrink-0">
                       <Swords className="w-6 h-6" />
                     </div>
                     <div>
                       <h3 className="text-lg font-bold">Play with Room Code</h3>
                       <p className="text-sm text-muted-foreground">Challenge a friend privately by sharing a 6-digit room code.</p>
                     </div>
                   </div>

                   <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                     {!roomCode ? (
                       <Button 
                         className="bg-primary hover:bg-primary/90 font-bold px-5"
                         onClick={handleCreateRoom}
                       >
                         Create Room
                       </Button>
                     ) : (
                       <div className="flex flex-wrap items-center gap-2 p-2 bg-emerald-500/15 border border-emerald-500/40 rounded-xl">
                         <div className="px-3 py-1 bg-emerald-500 text-white font-mono font-black tracking-widest text-base rounded shadow-xs">
                           {roomCode}
                         </div>
                         <Button
                           type="button"
                           size="sm"
                           variant="outline"
                           className="h-8 text-xs bg-background/80"
                           onClick={() => handleCopyCode(roomCode)}
                         >
                           {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                           {copiedCode ? 'Copied!' : 'Copy Code'}
                         </Button>
                         <Button
                           type="button"
                           size="sm"
                           variant="outline"
                           className="h-8 text-xs bg-background/80"
                           onClick={() => handleCopyLink(roomCode)}
                         >
                           {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500 mr-1" /> : <Share2 className="w-3.5 h-3.5 mr-1" />}
                           {copiedLink ? 'Link Copied!' : 'Copy Link'}
                         </Button>
                         <Button
                           type="button"
                           size="sm"
                           variant="ghost"
                           className="h-8 text-xs text-destructive hover:bg-destructive/10"
                           onClick={handleCancelRoom}
                         >
                           <X className="w-3.5 h-3.5 mr-1" /> Cancel
                         </Button>
                       </div>
                     )}

                     <div className="flex gap-2">
                       <Input 
                          placeholder="6-Digit Code" 
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 6).toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleJoinRoom();
                          }}
                          className="w-36 text-center font-mono font-bold tracking-widest uppercase bg-background" 
                          maxLength={6}
                       />
                       <Button 
                          variant="outline"
                          disabled={isJoiningRoom || !joinCodeInput.trim()}
                          onClick={handleJoinRoom}
                          className="font-semibold"
                       >
                         {isJoiningRoom ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join Room'}
                       </Button>
                     </div>
                   </div>
                 </div>

                 {roomCode && (
                   <div className="mt-3 pt-3 border-t border-primary/10 flex items-center justify-between text-xs text-muted-foreground">
                     <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                       <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                       Waiting for your opponent to enter code or open link...
                     </span>
                     <span>Timer: {selectedTC === 'custom' ? `${customMins}m + ${customInc}s` : selectedTC}</span>
                   </div>
                 )}
               </CardContent>
            </Card>
          </div>

          <div className="w-full max-w-4xl mx-auto">
            <Tabs defaultValue="training" className="w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Other Modes</h3>
                <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
                  <TabsTrigger value="training">Training</TabsTrigger>
                  <TabsTrigger value="local">Local</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="training" className="grid grid-cols-2 gap-4">
                <Button variant="outline" className="h-32 flex flex-col gap-2 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 transition-all" onClick={() => searchGame('tactics')}>
                  <Search className="w-6 h-6 text-emerald-500" />
                  <span className="font-bold">Tactics Trainer</span>
                  <span className="text-xs text-muted-foreground">Solve AI puzzles</span>
                </Button>
                <Button variant="outline" className="h-32 flex flex-col gap-2 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 transition-all" onClick={() => searchGame('openings')}>
                  <Brain className="w-6 h-6 text-emerald-500" />
                  <span className="font-bold">Opening Explorer</span>
                  <span className="text-xs text-muted-foreground">Learn opening theory</span>
                </Button>
              </TabsContent>
              <TabsContent value="local" className="flex justify-center">
                <Button variant="outline" className="h-32 w-64 flex flex-col gap-2 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all" onClick={() => searchGame('local-pass')}>
                  <Swords className="w-6 h-6 text-slate-500" />
                  <span className="font-bold">Pass & Play</span>
                  <span className="text-xs text-muted-foreground">Local 2-player mode</span>
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          {hasSavedGame && (
            <div className="flex justify-center">
              <Button onClick={resumeLocalGame} variant="link" className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <History className="w-4 h-4" />
                Resume your last saved game
              </Button>
            </div>
          )}
        </motion.div>
      )}

        {gameState === 'searching' && (
          <motion.div 
            key="searching"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="w-full max-w-xl bg-card p-12 rounded-2xl border border-border text-center space-y-6 shadow-2xl flex flex-col items-center justify-center"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping scale-150" />
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary relative z-10">
                <Loader2 className="w-12 h-12 animate-spin" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground mb-2">Finding Opponent</h2>
              <p className="text-muted-foreground mb-8 font-medium">Mode: <span className="text-primary font-bold">{timeControl}</span> • Estimated wait &lt; 30s</p>
              <Button variant="destructive" onClick={resetGame} className="w-full h-12 font-bold uppercase tracking-widest">
                Cancel Matchmaking
              </Button>
            </div>
          </motion.div>
        )}

        {(gameState === 'playing' || gameState === 'finished') && (
          <motion.div 
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col lg:flex-row gap-8 w-full items-start justify-center"
          >
            {/* Game Column */}
            <div className="flex-1 flex flex-col items-center gap-6 w-full max-w-[620px]">
              {/* Top Player Info */}
              <div className={`w-full bg-card rounded-xl p-4 border transition-all duration-300 flex items-center justify-between ${timeControl === 'local-pass' ? 'rotate-180' : ''} ${
                isTopActive 
                  ? 'border-primary shadow-[0_0_15px_rgba(16,185,129,0.15)] bg-primary/5' 
                  : 'border-border'
              }`}>
                <div className="flex items-center gap-3">
                  <Avatar className={`w-10 h-10 border-2 transition-colors ${isTopActive ? 'border-primary' : 'border-zinc-300'}`}>
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${opponent?.username}`} />
                    <AvatarFallback>OP</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-bold text-sm text-foreground flex items-center gap-2">
                      {opponent?.username}
                      {opponent?.title && (
                        <Badge variant="default" className="bg-yellow-500 text-black font-black px-1.5 py-0 rounded text-[9px] uppercase tracking-tighter">
                          {opponent.title}
                        </Badge>
                      )}
                      {opponentDisconnectedAt && gameState === 'playing' && (
                        <Badge variant="destructive" className="animate-pulse flex gap-1 px-1.5 py-0">
                          <AlertOctagon className="w-3 h-3" />
                          <span className="text-[10px]">Reconnecting {disconnectTimer}s</span>
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-2 items-center">
                      <span>Rating: {opponent?.rating || '1500'}</span>
                      <CapturedPieces pieces={topCaptured} color={topColor === 'w' ? 'b' : 'w'} advantage={topAdvantage} />
                    </div>
                  </div>
                </div>
                <div className={getClockStyle(!!isTopActive, topTime)}>
                  {formatTime(topTime)}
                </div>
              </div>

              {tutorMessage && (
                <div className="w-full bg-primary/10 border border-primary/20 rounded-xl p-4 flex gap-3 items-start animate-in fade-in slide-in-from-top-4 duration-500 shadow-sm">
                  <div className="text-2xl mt-0.5">🧠</div>
                  <div className="text-sm text-foreground/90 leading-relaxed font-medium">
                    {tutorMessage}
                  </div>
                </div>
              )}

              {/* Board Quick Toolbar */}
              <div className="w-full flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  {isKingInCheck ? (
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ repeat: Infinity, duration: 1.2 }}
                      className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white font-black text-xs uppercase tracking-wider rounded-full shadow-[0_0_15px_rgba(239,68,68,0.6)] border border-red-400"
                    >
                      <AlertOctagon className="w-3.5 h-3.5 animate-bounce" />
                      King in Check!
                    </motion.div>
                  ) : isBottomActive ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 font-bold text-xs rounded-full border border-emerald-500/30">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      Your Turn
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/80 text-muted-foreground font-medium text-xs rounded-full border border-border">
                      Opponent's Move
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Theme Selector Pills */}
                  <div className="hidden sm:flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg border border-border">
                    {(['emerald', 'wood', 'slate', 'neon', 'glass'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setCustomization({ boardStyle: t })}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize transition-all ${
                          boardStyle === t
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                        title={`${t} theme`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Flip Board Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1 border-border bg-card/60 hover:bg-accent"
                    onClick={() => setIsFlipped(!isFlipped)}
                    title="Flip Board Orientation"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Flip</span>
                  </Button>

                  {/* Sound Toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs border-border bg-card/60 hover:bg-accent"
                    onClick={() => setSoundMuted(!soundMuted)}
                    title={soundMuted ? "Unmute audio effects" : "Mute audio effects"}
                  >
                    {soundMuted ? <VolumeX className="w-3.5 h-3.5 text-destructive" /> : <Volume2 className="w-3.5 h-3.5 text-primary" />}
                  </Button>

                  {/* 3D View Toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-7 px-2 text-xs gap-1 border-border bg-card/60 hover:bg-accent ${board3D ? 'text-primary border-primary/50 font-bold' : ''}`}
                    onClick={() => setCustomization({ board3D: !board3D })}
                    title="Toggle 3D perspective"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">3D</span>
                  </Button>
                </div>
              </div>

              {/* Board Container */}
              <div 
                className={`relative bg-slate-900/90 dark:bg-slate-950 p-3 sm:p-5 rounded-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] flex items-center justify-center border-2 transition-all duration-500 w-full overflow-hidden ${
                  isKingInCheck 
                    ? 'border-red-500/70 shadow-[0_0_35px_rgba(239,68,68,0.4)] ring-2 ring-red-500/30' 
                    : 'border-slate-800/80 ring-1 ring-white/10'
                }`} 
                style={{ transform: boardTransform, boxShadow: boardBoxShadow }}
              >
                {/* Visual Check Glow Perimeter Overlay */}
                {isKingInCheck && (
                  <div className="absolute inset-0 pointer-events-none rounded-2xl border-2 border-red-500/50 shadow-[inset_0_0_40px_rgba(239,68,68,0.25)] z-20 animate-pulse" />
                )}
                
                {gameState === 'finished' && (
                  <GameOverScreen
                    result={(() => {
                      if (chess?.isDraw()) return 'draw';
                      const winnerColor = chess?.turn() === 'w' ? 'b' : 'w';
                      return winnerColor === playerColor ? 'win' : 'lose';
                    })()}
                    reason={(() => {
                      if (gameOverReason) return gameOverReason;
                      if (chess?.isCheckmate()) return "Checkmate";
                      if (chess?.isStalemate()) return "Stalemate";
                      if (chess?.isThreefoldRepetition()) return "Threefold Repetition";
                      if (chess?.isInsufficientMaterial()) return "Insufficient Material";
                      if (chess?.isDraw()) return "Draw";
                      return "Game Over";
                    })()}
                    ratingChange={ratingChange?.change}
                    onClose={resetGame}
                    onPlayAgain={() => searchGame(timeControl || 'blitz')}
                    onAnalyze={handleAnalyze}
                    onReplay={() => setShowReplayModal(true)}
                    analyzing={analyzing}
                    analysis={analysis}
                    playerName={user?.username || 'You'}
                    opponentName={opponent?.username || 'Opponent'}
                    gameId={gameId}
                  />
                )}

                {chess ? (
                  <div className="w-full max-w-[580px] aspect-square rounded-xl overflow-hidden shadow-2xl bg-slate-950 z-10 border border-black/40">
                    <Chessboard 
                      position={chess.fen()}
                      boardOrientation={effectiveOrientation}
                      onPieceDrop={handleDrop}
                      onSquareClick={onSquareClick}
                      customSquareStyles={combinedSquareStyles}
                      onPromotionCheck={onPromotionCheck}
                      onPromotionPieceSelect={onPromotionPieceSelect}
                      promotionToSquare={moveTo || undefined}
                      showPromotionDialog={showPromotionDialog}
                      promotionDialogVariant="modal"
                      customDarkSquareStyle={{ 
                        backgroundColor: darkSquare,
                        backgroundImage: 'radial-gradient(circle at center, rgba(0,0,0,0.06) 0%, transparent 100%)'
                      }}
                      customLightSquareStyle={{ 
                        backgroundColor: lightSquare,
                        backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.06) 0%, transparent 100%)'
                      }}
                      customDropSquareStyle={{
                        boxShadow: 'inset 0 0 0 3px rgba(16, 185, 129, 0.9), inset 0 0 16px rgba(16, 185, 129, 0.4)'
                      }}
                      customBoardStyle={{
                        borderRadius: '10px',
                        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.3)'
                      }}
                      customNotationStyle={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'monospace'
                      }}
                      showBoardNotation={true}
                      animationDuration={300}
                      customPieces={getCustomPieces(pieceStyle)}
                    />
                  </div>
                ) : (
                  <div className="w-full max-w-[580px] aspect-square border-4 border-border rounded flex flex-col items-center justify-center bg-muted/20 animate-pulse">
                     <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                     <p className="text-muted-foreground font-medium">Initializing Chess Engine...</p>
                  </div>
                )}
              </div>

              {/* Player Info */}
              <div className={`w-full bg-card rounded-xl p-4 border transition-all duration-300 flex items-center justify-between ${
                isBottomActive 
                  ? 'border-primary shadow-[0_0_15px_rgba(16,185,129,0.15)] bg-primary/5' 
                  : 'border-border'
              }`}>
                <div className="flex items-center gap-3">
                  <Avatar className={`w-10 h-10 border-2 transition-colors ${isBottomActive ? 'border-primary' : 'border-zinc-300'}`}>
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} />
                    <AvatarFallback>ME</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-bold text-sm text-foreground flex items-center gap-2">
                      {user?.username}
                      {user?.title && (
                        <Badge variant="default" className="bg-yellow-500 text-black font-black px-1.5 py-0 rounded text-[9px] uppercase tracking-tighter">
                          {user.title}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-2 items-center">
                      <span>Rating: {user?.rating || '1200'}</span>
                      <CapturedPieces pieces={bottomCaptured} color={bottomColor === 'w' ? 'b' : 'w'} advantage={bottomAdvantage} />
                    </div>
                  </div>
                </div>
                <div className={getClockStyle(!!isBottomActive, bottomTime)}>
                  {formatTime(bottomTime)}
                </div>
              </div>
              <AutoPlayAdmin />
            </div>

            {/* Sidebar Column */}
            <div className="w-full lg:w-80 flex flex-col gap-4 sticky top-8">
              {gameState === 'playing' && <VoiceChat />}
              
              <div className="flex-1 bg-card rounded-xl border border-border flex flex-col overflow-hidden shadow-sm min-h-[400px]">
                <Tabs defaultValue="moves" className="w-full flex flex-col h-full">
                  <TabsList className="w-full grid grid-cols-2 rounded-none border-b border-border bg-transparent p-0">
                    <TabsTrigger value="moves" className="rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary h-12">Moves</TabsTrigger>
                    <TabsTrigger value="chat" className="rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary h-12">Chat</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="moves" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-2 font-mono text-sm space-y-1 bg-background/50">
                      {chess?.history().length === 0 ? (
                        <div className="text-muted-foreground text-center py-4 font-sans text-sm">No moves yet.</div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {Array.from({ length: Math.ceil((chess?.history().length || 0) / 2) }).map((_, i) => {
                            const verboseHistory = chess?.history({ verbose: true }) || [];
                            const whiteMove = verboseHistory[i * 2];
                            const blackMove = verboseHistory[i * 2 + 1];
                            return (
                              <div key={i} className={`flex flex-col md:flex-row md:justify-between px-2 py-1.5 rounded gap-1 md:gap-4 ${i % 2 === 0 ? 'bg-card' : ''}`}>
                                <span className="text-muted-foreground font-bold hidden md:inline-block w-6">{i + 1}.</span>
                                <div className="flex-1 text-foreground flex items-center gap-2">
                                  <span className="text-muted-foreground font-bold md:hidden">{i + 1}.w</span>
                                  <span>{formatMoveVerbose(whiteMove)}</span>
                                </div>
                                {blackMove && (
                                  <div className="flex-1 text-foreground flex items-center gap-2">
                                    <span className="text-muted-foreground font-bold md:hidden">{i + 1}.b</span>
                                    <span>{formatMoveVerbose(blackMove)}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="chat" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden overflow-hidden">
                    <TextChat />
                  </TabsContent>

                  {/* Persistent Game Actions */}
                  <div className="p-3 bg-muted/30 border-t border-border flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" className="flex-1 h-9 text-xs font-bold" onClick={async () => {
                        if (!chess) return;
                        setAnalyzing(true);
                        try {
                          const res = await fetch('/api/analyze', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pgn: chess.pgn() })
                          });
                          const data = await res.json();
                          setCoachAnalysis(data.analysis);
                          setShowCoachModal(true);
                        } catch (e) {
                          setCoachAnalysis("Failed to get advice.");
                          setShowCoachModal(true);
                        } finally {
                          setAnalyzing(false);
                        }
                      }} disabled={analyzing || !chess || chess.history().length === 0}>
                      {analyzing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Brain className="w-4 h-4 mr-1" />}
                      AI COACH
                    </Button>
                    <Button variant="destructive" size="sm" className="flex-1 h-9 text-xs font-bold" onClick={() => {
                      if (window.confirm("Are you sure you want to resign/leave?")) {
                        resignGame();
                        resetGame();
                      }
                    }}>
                      LEAVE
                    </Button>
                  </div>
                </Tabs>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play with Computer Bot Settings Modal */}
      <Dialog open={showBotModal} onOpenChange={setShowBotModal}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Brain className="w-6 h-6 text-yellow-500" />
              Configure AI Computer Opponent
            </DialogTitle>
            <DialogDescription>
              Select your desired bot difficulty, player side, and clock settings to start a practice match.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Bot Level Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Select Bot Difficulty &amp; Neural Tier
              </label>
              <div className="grid grid-cols-1 gap-3">
                {botOptions.map((bot) => {
                  const isSelected = selectedBotLevel === bot.level;
                  return (
                    <div
                      key={bot.id}
                      onClick={() => setSelectedBotLevel(bot.level)}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                        isSelected ? bot.activeClass : bot.colorClass
                      }`}
                    >
                      <div className="text-3xl p-2 bg-background/60 rounded-xl shadow-xs shrink-0 flex items-center justify-center">
                        {bot.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                            {bot.name}
                            {bot.isYellowLevel && (
                              <Crown className="w-4 h-4 text-yellow-500 fill-yellow-400 animate-bounce" />
                            )}
                          </h4>
                          <Badge className={bot.badgeClass}>
                            {bot.badge} • ~{bot.rating} ELO
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {bot.description}
                        </p>
                      </div>
                      <div className="self-center">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-primary bg-primary text-white' : 'border-border'}`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Choose Side */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Choose Your Side
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'w', label: 'White Pieces', icon: '♔', desc: 'Play first' },
                  { id: 'random', label: 'Random Side', icon: '🎲', desc: '50/50 chance' },
                  { id: 'b', label: 'Black Pieces', icon: '♚', desc: 'Defend first' },
                ].map((side) => {
                  const isSelected = botPlayerSide === side.id;
                  return (
                    <button
                      key={side.id}
                      type="button"
                      onClick={() => setBotPlayerSide(side.id as any)}
                      className={`p-3 rounded-xl border-2 flex flex-col items-center text-center transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/10 text-foreground font-bold shadow-xs' 
                          : 'border-border hover:border-primary/40 text-muted-foreground bg-background'
                      }`}
                    >
                      <span className="text-2xl mb-1">{side.icon}</span>
                      <span className="text-xs font-bold text-foreground">{side.label}</span>
                      <span className="text-[10px] opacity-70 mt-0.5">{side.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Timer Toggle */}
            <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Use Time Control Clock</h4>
                  <p className="text-xs text-muted-foreground">
                    Play with clock ({selectedTC === 'custom' ? `${customMins}m + ${customInc}s` : selectedTC}) or disable for untimed casual practice.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant={botUseTimer ? "default" : "outline"}
                size="sm"
                onClick={() => setBotUseTimer(!botUseTimer)}
                className={botUseTimer ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold" : ""}
              >
                {botUseTimer ? 'Enabled (Timed)' : 'Disabled (Untimed)'}
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowBotModal(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold px-6 shadow-md"
              onClick={() => handleStartBotGame()}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Start Match vs Level {selectedBotLevel} Bot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCoachModal} onOpenChange={setShowCoachModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              AI Coach
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-foreground whitespace-pre-wrap leading-relaxed">
            {coachAnalysis}
          </DialogDescription>
        </DialogContent>
      </Dialog>


      <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-destructive" />
              Report Player
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Please provide details about why you are reporting <strong>{opponent?.username}</strong>.
            </p>
            <div className="flex gap-2">
              <Button 
                variant={reportType === 'chat' ? 'default' : 'outline'} 
                size="sm" 
                className="flex-1"
                onClick={() => setReportType('chat')}
              >Chat Abuse</Button>
              <Button 
                variant={reportType === 'voice' ? 'default' : 'outline'} 
                size="sm" 
                className="flex-1"
                onClick={() => setReportType('voice')}
              >Voice Abuse</Button>
            </div>
            {reportType === 'voice' && (
              <div className="bg-muted p-3 rounded-md flex flex-col gap-2 border border-border">
                <p className="text-xs font-bold text-primary flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Capture Evidence
                </p>
                <Button 
                  variant={evidenceCaptured ? "secondary" : "outline"}
                  size="sm" 
                  className="w-full"
                  onClick={() => {
                    if (evidenceCaptured) {
                       setEvidenceCaptured(null);
                    } else {
                       setRecordingEvidence(true);
                       toast.info("Capturing next available audio chunk...");
                    }
                  }}
                >
                  <div className={`w-2 h-2 rounded-full ${evidenceCaptured ? 'bg-green-500' : (recordingEvidence ? 'bg-red-500 animate-ping' : 'bg-muted-foreground')}`} />
                  {evidenceCaptured ? 'Audio Snippet Captured' : (recordingEvidence ? 'Capturing...' : 'Capture Latest Snippet')}
                </Button>
                {evidenceCaptured && (
                  <audio controls src={evidenceCaptured} className="w-full h-8 mt-1" />
                )}
              </div>
            )}
            <Textarea 
              placeholder={reportType === 'chat' ? "Describe the chat abuse..." : "Describe the voice abuse..."}
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReport} disabled={reporting || !reportMessage.trim()}>
              {reporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
