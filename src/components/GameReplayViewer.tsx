import { useState, useEffect, useRef, useMemo } from 'react';
import { Chess, Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useAppStore } from '@/store';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Play, 
  Pause, 
  RotateCcw, 
  Copy, 
  Check, 
  Download, 
  Brain, 
  Loader2, 
  Swords, 
  Share2, 
  Maximize2,
  Clock,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';

export interface GameReplayData {
  id: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  status: string; // 'white_won' | 'black_won' | 'draw' | 'abandoned'
  reason?: string;
  timeControl?: string;
  timestamp?: any;
  pgn?: string;
  description?: string;
}

export interface ReplayStep {
  stepIndex: number; // 0 is initial board, 1..N is after move 1..N
  moveNumber: number; // 1, 2, 3...
  color: 'w' | 'b';
  san: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  fen: string;
  isCheck: boolean;
  isCheckmate: boolean;
  description: string;
}

const pieceSymbols: Record<string, Record<string, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }
};

const pieceValues: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

function formatMoveDescription(color: 'w' | 'b', piece: string, from: string, to: string, san: string, captured?: string) {
  const colorName = color === 'w' ? "White's" : "Black's";
  const pieceNames: Record<string, string> = {
    p: 'Pawn',
    n: 'Knight',
    b: 'Bishop',
    r: 'Rook',
    q: 'Queen',
    k: 'King'
  };
  const pName = pieceNames[piece] || 'Piece';

  if (san.startsWith('O-O-O')) return `${colorName} King castles queenside`;
  if (san.startsWith('O-O')) return `${colorName} King castles kingside`;

  let action = 'moves to';
  if (captured) {
    const capturedName = pieceNames[captured] || 'piece';
    action = `takes ${capturedName} on`;
  }

  let suffix = '';
  if (san.includes('#')) suffix = ' (Checkmate!)';
  else if (san.includes('+')) suffix = ' (Check!)';

  return `${colorName} ${pName} from ${from} ${action} ${to}${suffix}`;
}

export function GameReplayViewer({
  game,
  onClose,
  isModal = false
}: {
  game: GameReplayData;
  onClose?: () => void;
  isModal?: boolean;
}) {
  const { boardStyle, highContrast, colorblindMode, animatedBoard, user } = useAppStore();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1000); // ms per move
  const [copiedPgn, setCopiedPgn] = useState(false);
  const [copiedFen, setCopiedFen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const activeMoveRef = useRef<HTMLButtonElement | null>(null);

  // Set default board orientation to match player's perspective if logged in
  useEffect(() => {
    if (user && game.black === user.username && game.white !== user.username) {
      setOrientation('black');
    } else {
      setOrientation('white');
    }
  }, [user, game]);

  // Parse PGN and build the full move step-by-step history
  const { steps, initialFen, parseError } = useMemo(() => {
    const startChess = new Chess();
    const initFen = startChess.fen();

    if (!game.pgn || game.pgn.trim() === '') {
      return { steps: [], initialFen: initFen, parseError: 'No PGN recorded for this game.' };
    }

    try {
      const replayChess = new Chess();
      replayChess.loadPgn(game.pgn);
      const rawHistory = replayChess.history({ verbose: true });

      const parsedSteps: ReplayStep[] = rawHistory.map((m: any, index: number) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const color = m.color as 'w' | 'b';
        const isCheck = m.after.includes('+') || m.san.includes('+');
        const isCheckmate = m.san.includes('#');
        const description = formatMoveDescription(color, m.piece, m.from, m.to, m.san, m.captured);

        return {
          stepIndex: index + 1,
          moveNumber,
          color,
          san: m.san,
          from: m.from,
          to: m.to,
          piece: m.piece,
          captured: m.captured,
          promotion: m.promotion,
          fen: m.after,
          isCheck,
          isCheckmate,
          description
        };
      });

      return { steps: parsedSteps, initialFen: initFen, parseError: null };
    } catch (err: any) {
      console.error("Failed to parse game PGN:", err);
      return { steps: [], initialFen: initFen, parseError: 'Could not parse game move notation.' };
    }
  }, [game.pgn]);

  // Set initial step to final position so user sees game conclusion first
  useEffect(() => {
    if (steps.length > 0) {
      setCurrentStep(steps.length);
    } else {
      setCurrentStep(0);
    }
    setIsPlaying(false);
    setAiAnalysis(null);
  }, [steps]);

  // Auto-play interval
  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= steps.length) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, playbackSpeed, steps.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStep((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStep((prev) => Math.min(steps.length, prev + 1));
      } else if (e.key === 'ArrowUp' || e.key === 'Home') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStep(0);
      } else if (e.key === 'ArrowDown' || e.key === 'End') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentStep(steps.length);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [steps.length]);

  // Auto scroll move list to keep active move in view
  useEffect(() => {
    if (activeMoveRef.current) {
      activeMoveRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [currentStep]);

  // Current FEN and active move
  const currentFen = currentStep === 0 ? initialFen : steps[currentStep - 1]?.fen || initialFen;
  const currentMove = currentStep > 0 ? steps[currentStep - 1] : null;

  // Board colors based on user settings
  const getBoardStyles = () => {
    if (highContrast) return { dark: '#000000', light: '#ffffff' };
    if (colorblindMode) return { dark: '#005ab5', light: '#dc3220' };
    switch (boardStyle) {
      case 'wood': return { dark: '#b58863', light: '#f0d9b5' };
      case 'neon': return { dark: '#0f172a', light: '#38bdf8' };
      case 'slate': default: return { dark: '#475569', light: '#cbd5e1' };
    }
  };
  const { dark: darkSquare, light: lightSquare } = getBoardStyles();

  // Highlight squares for current move
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (currentMove) {
      styles[currentMove.from] = {
        backgroundColor: 'rgba(234, 179, 8, 0.4)',
        boxShadow: 'inset 0 0 4px rgba(0,0,0,0.2)'
      };
      styles[currentMove.to] = {
        backgroundColor: 'rgba(234, 179, 8, 0.55)',
        boxShadow: 'inset 0 0 6px rgba(0,0,0,0.3)'
      };
    }

    // Check indicator on king if in check
    try {
      const tempChess = new Chess(currentFen);
      if (tempChess.inCheck()) {
        const turn = tempChess.turn();
        // find king square
        const board = tempChess.board();
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.type === 'k' && piece.color === turn) {
              const file = String.fromCharCode(97 + c);
              const rank = 8 - r;
              const kingSquare = `${file}${rank}`;
              styles[kingSquare] = {
                backgroundColor: 'rgba(239, 68, 68, 0.65)',
                borderRadius: '50%',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.8)'
              };
            }
          }
        }
      }
    } catch (e) {
      // Ignore fen check error
    }

    return styles;
  }, [currentMove, currentFen]);

  // Compute captured pieces and material balance at currentStep
  const { whiteCaptured, blackCaptured, materialDiff } = useMemo(() => {
    try {
      const tempChess = new Chess(currentFen);
      const board = tempChess.board();
      const counts: Record<string, Record<string, number>> = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
      };

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.type !== 'k') {
            counts[piece.color][piece.type] = (counts[piece.color][piece.type] || 0) + 1;
          }
        }
      }

      const startingCounts: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
      const wLost: { type: string; id: string }[] = [];
      const bLost: { type: string; id: string }[] = [];

      let whiteScore = 0;
      let blackScore = 0;

      (['p', 'n', 'b', 'r', 'q'] as const).forEach((t) => {
        const wRemain = counts.w[t] || 0;
        const bRemain = counts.b[t] || 0;

        whiteScore += wRemain * pieceValues[t];
        blackScore += bRemain * pieceValues[t];

        const wCapturedCount = Math.max(0, startingCounts[t] - wRemain);
        const bCapturedCount = Math.max(0, startingCounts[t] - bRemain);

        for (let i = 0; i < wCapturedCount; i++) {
          wLost.push({ type: t, id: `w-${t}-${i}` });
        }
        for (let i = 0; i < bCapturedCount; i++) {
          bLost.push({ type: t, id: `b-${t}-${i}` });
        }
      });

      return {
        whiteCaptured: bLost, // Pieces captured by White (Black pieces lost)
        blackCaptured: wLost, // Pieces captured by Black (White pieces lost)
        materialDiff: whiteScore - blackScore
      };
    } catch {
      return { whiteCaptured: [], blackCaptured: [], materialDiff: 0 };
    }
  }, [currentFen]);

  // Group moves into pairs (White move, Black move)
  const movePairs = useMemo(() => {
    const pairs: { round: number; white?: ReplayStep; black?: ReplayStep }[] = [];
    for (let i = 0; i < steps.length; i += 2) {
      pairs.push({
        round: Math.floor(i / 2) + 1,
        white: steps[i],
        black: steps[i + 1]
      });
    }
    return pairs;
  }, [steps]);

  // Copy PGN handler
  const handleCopyPgn = () => {
    if (game.pgn) {
      navigator.clipboard.writeText(game.pgn);
      setCopiedPgn(true);
      toast.success('PGN copied to clipboard');
      setTimeout(() => setCopiedPgn(false), 2000);
    }
  };

  // Copy FEN handler
  const handleCopyFen = () => {
    navigator.clipboard.writeText(currentFen);
    setCopiedFen(true);
    toast.success('Current position FEN copied');
    setTimeout(() => setCopiedFen(false), 2000);
  };

  // Download PGN handler
  const handleDownloadPgn = () => {
    if (!game.pgn) return;
    const blob = new Blob([game.pgn], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${game.white}_vs_${game.black}_${game.id}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('PGN file downloaded');
  };

  // AI Game Analysis handler
  const handleAnalyzeGame = async () => {
    if (!game.pgn) {
      toast.error('No PGN available to analyze');
      return;
    }
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: game.pgn })
      });
      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      setAiAnalysis(data.analysis || 'Analysis completed successfully.');
    } catch (err) {
      console.error(err);
      toast.error('Could not generate AI analysis at this time.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Outcome details
  const getOutcomeDetails = () => {
    if (game.status === 'white_won') {
      return {
        winner: game.white,
        score: '1 - 0',
        badge: 'White won',
        variant: 'default' as const,
        bgClass: 'bg-primary/10 border-primary/30 text-primary'
      };
    }
    if (game.status === 'black_won') {
      return {
        winner: game.black,
        score: '0 - 1',
        badge: 'Black won',
        variant: 'destructive' as const,
        bgClass: 'bg-destructive/10 border-destructive/30 text-destructive'
      };
    }
    if (game.status === 'draw') {
      return {
        winner: null,
        score: '½ - ½',
        badge: 'Draw',
        variant: 'secondary' as const,
        bgClass: 'bg-secondary/60 border-border text-foreground'
      };
    }
    return {
      winner: null,
      score: '* - *',
      badge: game.status || 'Game Over',
      variant: 'outline' as const,
      bgClass: 'bg-card border-border text-muted-foreground'
    };
  };

  const outcome = getOutcomeDetails();

  return (
    <div className={`flex flex-col gap-6 ${isModal ? 'w-full' : 'max-w-6xl mx-auto'}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Match Replay & Analysis
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Step through moves, review tactical transitions, and examine positions at any point in the match.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyFen}
            className="text-xs h-8 flex items-center gap-1.5"
            title="Copy current board position FEN"
          >
            {copiedFen ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            Copy FEN
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPgn}
            className="text-xs h-8 flex items-center gap-1.5"
            title="Copy complete game PGN notation"
          >
            {copiedPgn ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            Copy PGN
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPgn}
            className="text-xs h-8 flex items-center gap-1.5"
            title="Download PGN file"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-3 text-xs">
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid: Board + Controls (Left) and Moves Table + Info (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Board and Player Cards */}
        <div className="lg:col-span-7 flex flex-col items-center gap-3 w-full">
          {/* Top Player (Black by default, or White if flipped) */}
          <div className="w-full max-w-[500px] flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <Avatar className="w-9 h-9 border border-border">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${orientation === 'white' ? game.black : game.white}`} />
                <AvatarFallback>{(orientation === 'white' ? game.black : game.white).substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">
                    {orientation === 'white' ? game.black : game.white}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({orientation === 'white' ? (game.blackRating || 1200) : (game.whiteRating || 1200)})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-xs">
                    {orientation === 'white' ? 'Black' : 'White'}
                  </span>
                  {/* Captured pieces by top player */}
                  <div className="flex items-center text-sm ml-1 select-none">
                    {(orientation === 'white' ? blackCaptured : whiteCaptured).map((p) => (
                      <span key={p.id} className="text-muted-foreground leading-none">
                        {pieceSymbols[orientation === 'white' ? 'w' : 'b'][p.type]}
                      </span>
                    ))}
                  </div>
                  {/* Material diff for top player */}
                  {orientation === 'white' ? (
                    materialDiff < 0 && <span className="font-bold text-xs text-foreground ml-1">+{Math.abs(materialDiff)}</span>
                  ) : (
                    materialDiff > 0 && <span className="font-bold text-xs text-foreground ml-1">+{materialDiff}</span>
                  )}
                </div>
              </div>
            </div>

            <Badge variant="outline" className="text-xs uppercase tracking-wider">
              {orientation === 'white' ? 'Black' : 'White'}
            </Badge>
          </div>

          {/* Chessboard */}
          <div className="w-full max-w-[500px] aspect-square border-4 border-border rounded-lg overflow-hidden shadow-lg bg-card">
            <Chessboard
              position={currentFen}
              boardOrientation={orientation}
              customSquareStyles={customSquareStyles}
              customDarkSquareStyle={{ backgroundColor: darkSquare }}
              customLightSquareStyle={{ backgroundColor: lightSquare }}
              animationDuration={animatedBoard ? 250 : 0}
              arePiecesDraggable={false}
            />
          </div>

          {/* Bottom Player (White by default, or Black if flipped) */}
          <div className="w-full max-w-[500px] flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <Avatar className="w-9 h-9 border border-border">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${orientation === 'white' ? game.white : game.black}`} />
                <AvatarFallback>{(orientation === 'white' ? game.white : game.black).substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">
                    {orientation === 'white' ? game.white : game.black}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({orientation === 'white' ? (game.whiteRating || 1200) : (game.blackRating || 1200)})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-xs">
                    {orientation === 'white' ? 'White' : 'Black'}
                  </span>
                  {/* Captured pieces by bottom player */}
                  <div className="flex items-center text-sm ml-1 select-none">
                    {(orientation === 'white' ? whiteCaptured : blackCaptured).map((p) => (
                      <span key={p.id} className="text-muted-foreground leading-none">
                        {pieceSymbols[orientation === 'white' ? 'b' : 'w'][p.type]}
                      </span>
                    ))}
                  </div>
                  {/* Material diff for bottom player */}
                  {orientation === 'white' ? (
                    materialDiff > 0 && <span className="font-bold text-xs text-foreground ml-1">+{materialDiff}</span>
                  ) : (
                    materialDiff < 0 && <span className="font-bold text-xs text-foreground ml-1">+{Math.abs(materialDiff)}</span>
                  )}
                </div>
              </div>
            </div>

            <Badge variant="outline" className="text-xs uppercase tracking-wider">
              {orientation === 'white' ? 'White' : 'Black'}
            </Badge>
          </div>

          {/* Step Controls Bar */}
          <div className="w-full max-w-[500px] flex flex-col gap-2 p-3 bg-card border border-border rounded-lg">
            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(0);
                }}
                disabled={currentStep === 0}
                title="First move (Home / Up Arrow)"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep((s) => Math.max(0, s - 1));
                }}
                disabled={currentStep === 0}
                title="Previous move (Left Arrow)"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <Button
                variant={isPlaying ? 'default' : 'secondary'}
                className="flex items-center gap-1.5 px-4 h-9 font-medium text-xs"
                onClick={() => {
                  if (currentStep >= steps.length) {
                    setCurrentStep(0);
                    setIsPlaying(true);
                  } else {
                    setIsPlaying((p) => !p);
                  }
                }}
                title="Play / Pause auto replay (Spacebar)"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Auto-Play
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep((s) => Math.min(steps.length, s + 1));
                }}
                disabled={currentStep >= steps.length}
                title="Next move (Right Arrow)"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(steps.length);
                }}
                disabled={currentStep >= steps.length}
                title="Last move (End / Down Arrow)"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>

              <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
                title="Flip board perspective (F)"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            {/* Slider & Move index counter */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs font-mono text-muted-foreground whitespace-nowrap min-w-[55px]">
                {currentStep} / {steps.length}
              </span>
              <input
                type="range"
                min={0}
                max={steps.length}
                value={currentStep}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStep(Number(e.target.value));
                }}
                className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPlaybackSpeed(2000)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                    playbackSpeed === 2000 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                  }`}
                  title="Slow speed (2.0s)"
                >
                  0.5x
                </button>
                <button
                  type="button"
                  onClick={() => setPlaybackSpeed(1000)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                    playbackSpeed === 1000 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                  }`}
                  title="Normal speed (1.0s)"
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => setPlaybackSpeed(500)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                    playbackSpeed === 500 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                  }`}
                  title="Fast speed (0.5s)"
                >
                  2x
                </button>
              </div>
            </div>

            {/* Current Move Explanation Description */}
            <div className="text-xs text-center py-1 px-2 rounded bg-muted/50 text-foreground min-h-[28px] flex items-center justify-center font-medium">
              {currentStep === 0 ? (
                <span className="text-muted-foreground">Starting position — No moves played yet</span>
              ) : currentMove ? (
                <span className="text-primary font-medium">
                  Move {currentMove.moveNumber}: {currentMove.description}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right Column: Game Details, Interactive Move Sheet, and AI Analysis */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Game Outcome & Metadata Card */}
          <div className="bg-card p-4 rounded-lg border border-border flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={outcome.variant} className="font-semibold text-xs px-2.5 py-1">
                  {outcome.score} • {outcome.badge}
                </Badge>
                {game.timeControl && (
                  <Badge variant="outline" className="text-xs text-muted-foreground capitalize">
                    {game.timeControl}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {game.reason ? game.reason : 'Completed'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 bg-secondary/30 rounded border border-border/50">
              <div>
                <span className="text-muted-foreground block">White</span>
                <span className="font-semibold text-foreground">{game.white}</span>
                <span className="text-[11px] text-muted-foreground block">{game.whiteRating || 1200} ELO</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Black</span>
                <span className="font-semibold text-foreground">{game.black}</span>
                <span className="text-[11px] text-muted-foreground block">{game.blackRating || 1200} ELO</span>
              </div>
            </div>

            {game.description && (
              <p className="text-xs text-muted-foreground italic border-l-2 border-primary/50 pl-2 py-0.5">
                {game.description}
              </p>
            )}
          </div>

          {/* Interactive Move Sheet (PGN Notation Table) */}
          <div className="bg-card rounded-lg border border-border flex flex-col overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-foreground">
                Move List ({steps.length} moves)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Click any move to jump
              </span>
            </div>

            <div className="p-2 max-h-[300px] overflow-y-auto divide-y divide-border/40 font-mono text-xs">
              {parseError ? (
                <div className="text-center py-6 text-muted-foreground text-xs">{parseError}</div>
              ) : movePairs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">No moves recorded.</div>
              ) : (
                movePairs.map((pair) => {
                  const whiteStepIdx = pair.white ? pair.white.stepIndex : null;
                  const blackStepIdx = pair.black ? pair.black.stepIndex : null;
                  const isWhiteActive = currentStep === whiteStepIdx;
                  const isBlackActive = currentStep === blackStepIdx;

                  return (
                    <div key={pair.round} className="grid grid-cols-12 py-1 items-center hover:bg-secondary/30 rounded px-1 transition-colors">
                      <div className="col-span-2 text-muted-foreground text-[11px] font-semibold">
                        {pair.round}.
                      </div>

                      {/* White Move */}
                      <div className="col-span-5">
                        {pair.white && (
                          <button
                            type="button"
                            ref={isWhiteActive ? activeMoveRef : undefined}
                            onClick={() => {
                              setIsPlaying(false);
                              setCurrentStep(pair.white!.stepIndex);
                            }}
                            className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center justify-between font-medium ${
                              isWhiteActive
                                ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                                : 'hover:bg-secondary text-foreground'
                            }`}
                          >
                            <span>{pair.white.san}</span>
                            {pair.white.captured && (
                              <span className="text-[10px] opacity-70">
                                x{pair.white.captured.toUpperCase()}
                              </span>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Black Move */}
                      <div className="col-span-5">
                        {pair.black && (
                          <button
                            type="button"
                            ref={isBlackActive ? activeMoveRef : undefined}
                            onClick={() => {
                              setIsPlaying(false);
                              setCurrentStep(pair.black!.stepIndex);
                            }}
                            className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center justify-between font-medium ${
                              isBlackActive
                                ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                                : 'hover:bg-secondary text-foreground'
                            }`}
                          >
                            <span>{pair.black.san}</span>
                            {pair.black.captured && (
                              <span className="text-[10px] opacity-70">
                                x{pair.black.captured.toUpperCase()}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* AI Coach Analysis */}
          <div className="bg-card p-4 rounded-lg border border-border flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="font-bold text-xs uppercase tracking-wider text-foreground">
                  AI Coach Analysis
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAnalyzeGame}
                disabled={isAnalyzing || !game.pgn}
                className="text-xs h-8 flex items-center gap-1.5"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Analyze Match
                  </>
                )}
              </Button>
            </div>

            {aiAnalysis ? (
              <div className="p-3 bg-secondary/40 rounded border border-border text-xs text-foreground leading-relaxed">
                {aiAnalysis}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Click "Analyze Match" to get Grandmaster insights and critical turning-point breakdowns powered by Gemini AI.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
