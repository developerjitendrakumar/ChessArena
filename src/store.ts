import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { Chess } from 'chess.js';
import { toast } from 'sonner';
import { saveLocalMatchHistory } from './utils/sampleGames';

interface User {
  uid?: string;
  username: string;
  rating: number;
  email?: string;
  isAdmin?: boolean;
  title?: string;
  badges?: string[];
  achievements?: { id: string; title: string; icon: string; description: string; dateEarned?: string }[];
  stats?: {
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    winStreak: number;
  };
}

interface AppState {
  user: User | null;
  authLoading: boolean;
  setAuthLoading: (loading: boolean) => void;
  socket: Socket | null;
  isConnected: boolean;
  gameId: string | null;
  chess: Chess | null;
  opponent: User | null;
  playerColor: "w" | "b" | null;
  timeControl: string | null;
  whiteTime: number;
  blackTime: number;
  gameState: 'idle' | 'searching' | 'playing' | 'finished';
  opponentDisconnectedAt: number | null;
  gameOverReason: string | null;
  ratingChange: { old: number; new: number; change: number } | null;
  activeGameToRejoin: { gameId: string, opponent: string } | null;
  tutorMessage: string | null;
  matchmakingTimeoutId?: any;

  // Customization Settings
  pieceStyle: string;
  boardStyle: string;
  animatedBoard: boolean;
  board3D: boolean;
  backgroundTheme: string;
  soundPack: string;
  avatarStyle: string;
  profileFrame: string;
  nameColor: string;
  highContrast: boolean;
  colorblindMode: boolean;
  setCustomization: (settings: Partial<AppState>) => void;
  
  theme: 'dark' | 'light' | 'premium';
  setTheme: (theme: 'dark' | 'light' | 'premium') => void;
  setUser: (user: User) => void;
  connect: () => void;
  customTimeConfig: { minutes: number; increment: number };
  setCustomTimeConfig: (config: { minutes: number; increment: number }) => void;
  searchGame: (timeControl: string, options?: { customMinutes?: number; customIncrement?: number; side?: 'w' | 'b' | 'random'; baseTimeControl?: string }) => void;
  makeMove: (move: any) => boolean | void;
  tick: () => void;
  resignGame: () => void;
  rejoinGame: () => void;
  resetGame: () => void;
  createPrivateRoom: (timeControl: string, options?: { customMinutes?: number; customIncrement?: number }) => void;
  cancelPrivateRoom: (code: string) => void;
  joinPrivateRoom: (code: string) => void;
  saveLocalGame: () => void;
  resumeLocalGame: () => void;
  hasSavedGame: boolean;
  checkSavedGame: () => void;
  setGameId: (id: string) => void;
  bannedStatus: { isBanned: boolean; reason?: string; username?: string; email?: string; banExpiresAt?: string } | null;
  setBannedStatus: (status: { isBanned: boolean; reason?: string; username?: string; email?: string } | null) => void;
}

const notifyUserActive = (email?: string) => {
  if (!email) return;
  fetch('/api/user/active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  }).catch(console.error);
};

function recordLocalGameOver(c: Chess, timeControl: string | null, user: User | null, opponent: any, reason?: string) {
  let status = 'draw';
  if (c.isCheckmate()) {
    status = c.turn() === 'w' ? 'black_won' : 'white_won';
  }
  saveLocalMatchHistory({
    id: `local-${Date.now()}`,
    white: user?.username || 'You',
    black: opponent?.username || (timeControl === 'local-pass' ? 'Player 2' : 'Computer'),
    whiteRating: user?.rating || 1200,
    blackRating: opponent?.rating || 1500,
    status,
    reason: reason || (c.isCheckmate() ? 'Checkmate' : c.isDraw() ? 'Draw' : 'Game Finished'),
    timeControl: timeControl || 'casual',
    pgn: c.pgn()
  });
}

function getSmartFallbackMove(chess: Chess, botLevel: number): string {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return '';
  
  // Level 1: 40% random move to emulate beginner blunders
  if (botLevel === 1 && Math.random() < 0.4) {
    return moves[Math.floor(Math.random() * moves.length)].san;
  }
  
  const pieceValues: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  let bestMove = moves[0].san;
  let bestScore = -Infinity;

  for (const m of moves) {
    let score = 0;
    if (m.captured) {
      const victimValue = pieceValues[m.captured] || 100;
      const attackerValue = pieceValues[m.piece] || 100;
      score += victimValue * 10 - attackerValue;
    }
    if (['d4', 'd5', 'e4', 'e5'].includes(m.to)) score += 30;
    if (['c3', 'c6', 'f3', 'f6', 'c4', 'c5', 'f4', 'f5'].includes(m.to)) score += 15;
    if (m.san.includes('+')) score += 45;
    if (m.san.includes('#')) score += 100000;
    if (m.promotion) score += 800;

    const noise = botLevel === 5 ? (Math.random() * 4 - 2) : (Math.random() * 20 - 10);
    const finalScore = score + noise;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMove = m.san;
    }
  }

  return bestMove;
}

function triggerAIMove(
  currentChess: Chess,
  botLevel: number,
  set: any,
  get: any
) {
  let depth = 3;
  let maxThinkingTime = 100;
  if (botLevel === 2) { depth = 6; maxThinkingTime = 300; }
  if (botLevel === 3) { depth = 11; maxThinkingTime = 700; }
  if (botLevel === 4) { depth = 15; maxThinkingTime = 1500; }
  if (botLevel === 5) { depth = 20; maxThinkingTime = 2500; } // Yellow level highest (Superhuman Stockfish)

  const fen = currentChess.fen();

  fetch('https://chess-api.com/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen, depth, maxThinkingTime })
  })
  .then(res => res.json())
  .then(data => {
    const activeState = get();
    if (activeState.gameState !== 'playing' || !activeState.chess) return;
    const aiChess = new Chess(activeState.chess.fen());
    
    // Level 1 beginner sometimes blunders like a real human novice
    if (botLevel === 1 && Math.random() < 0.35) {
      const fallbackSan = getSmartFallbackMove(aiChess, 1);
      if (fallbackSan) {
        try {
          aiChess.move(fallbackSan);
          set({ chess: aiChess });
          if (aiChess.isGameOver()) {
            recordLocalGameOver(aiChess, activeState.timeControl, activeState.user, activeState.opponent);
            set({ gameState: 'finished' });
          }
          return;
        } catch (e) {}
      }
    }

    if (data.san) {
      try {
        aiChess.move(data.san);
        set({ chess: aiChess });
        if (aiChess.isGameOver()) {
          recordLocalGameOver(aiChess, activeState.timeControl, activeState.user, activeState.opponent);
          set({ gameState: 'finished' });
        }
        return;
      } catch (e) {
        console.warn("Invalid move from chess-api", data.san);
      }
    }

    const fallbackSan = getSmartFallbackMove(aiChess, botLevel);
    if (fallbackSan) {
      try {
        aiChess.move(fallbackSan);
        set({ chess: aiChess });
        if (aiChess.isGameOver()) {
          recordLocalGameOver(aiChess, activeState.timeControl, activeState.user, activeState.opponent);
          set({ gameState: 'finished' });
        }
      } catch (e) {}
    }
  })
  .catch(err => {
    console.error("AI API Error, using smart engine fallback:", err);
    const activeState = get();
    if (activeState.gameState !== 'playing' || !activeState.chess) return;
    const aiChess = new Chess(activeState.chess.fen());
    const fallbackSan = getSmartFallbackMove(aiChess, botLevel);
    if (fallbackSan) {
      try {
        aiChess.move(fallbackSan);
        set({ chess: aiChess });
        if (aiChess.isGameOver()) {
          recordLocalGameOver(aiChess, activeState.timeControl, activeState.user, activeState.opponent);
          set({ gameState: 'finished' });
        }
      } catch (e) {}
    }
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  authLoading: true,
  setAuthLoading: (loading) => set({ authLoading: loading }),
  socket: null,
  isConnected: false,
  gameId: null,
  chess: null,
  opponent: null,
  playerColor: null,
  timeControl: null,
  gameState: 'idle',
  whiteTime: 600000,
  blackTime: 600000,
  customTimeConfig: { minutes: 5, increment: 2 },
  setCustomTimeConfig: (config) => set({ customTimeConfig: config }),
  bannedStatus: null,
  setBannedStatus: (status) => set({ bannedStatus: status }),
  opponentDisconnectedAt: null,
  gameOverReason: null,
  ratingChange: null,
  activeGameToRejoin: null,
  tutorMessage: null,
  hasSavedGame: false,

  pieceStyle: 'classic',
  boardStyle: 'slate',
  animatedBoard: false,
  board3D: false,
  backgroundTheme: 'default',
  soundPack: 'standard',
  avatarStyle: 'default',
  profileFrame: 'none',
  nameColor: '#ffffff',
  highContrast: false,
  colorblindMode: false,
  setCustomization: (settings) => set((state) => ({ ...state, ...settings })),

  
  theme: (localStorage.getItem('chessarena-theme') as any) || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('chessarena-theme', theme);
    set({ theme });
  },

  setUser: (user) => {
    set({ user });
    const { socket } = get();
    if (socket && socket.connected && user?.email) {
      socket.emit('auth', { email: user.email, username: user.username });
      fetch('/api/auth/socket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, socketId: socket.id })
      }).catch(console.error);
    }
  },

  connect: () => {
    if (get().socket) return;
    const socket = io(); // Connects to same host/port

    socket.on('connect', () => {
      set({ isConnected: true });
      const { user } = get();
      if (user && user.email) {
        socket.emit('auth', { email: user.email, username: user.username });
        fetch('/api/auth/socket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, socketId: socket.id })
        }).catch(console.error);
      }
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('game_start', (data) => {
      const state = get() as any;
      if (state.matchmakingTimeoutId) {
        clearTimeout(state.matchmakingTimeoutId);
      }
      const user = get().user;
      const currentUsername = user?.username || 'Player';
      const { socket } = get();
      const playerColor = (socket && data.white.socketId === socket.id)
        ? 'w'
        : (socket && data.black.socketId === socket.id
          ? 'b'
          : (data.white.username === currentUsername ? 'w' : 'b'));
      const opponentInfo = playerColor === 'w' ? data.black : data.white;
      
      set({
        gameId: data.gameId,
        chess: new Chess(data.fen),
        opponent: opponentInfo,
        playerColor,
        timeControl: data.timeControl,
        gameState: 'playing',
        whiteTime: data.whiteTime !== undefined ? data.whiteTime : 600000,
        blackTime: data.blackTime !== undefined ? data.blackTime : 600000,
        gameOverReason: null,
        opponentDisconnectedAt: data.opponentDisconnected ? Date.now() : null,
        matchmakingTimeoutId: null
      });
    });

    socket.on('move_made', (data) => {
      set({
        chess: new Chess(data.fen),
        ...(data.whiteTime !== undefined ? { whiteTime: data.whiteTime, blackTime: data.blackTime } : {})
      });
    });

    socket.on('invalid_move', (data) => {
      set({ chess: new Chess(data.fen) });
    });

    socket.on('game_over', (data) => {
      const { gameId, chess, user, opponent, playerColor, timeControl } = get();
      if (gameId) {
        let ratingChangeData = null;
        if (data.ratingChanges) {
          ratingChangeData = playerColor === 'w' ? data.ratingChanges.white : data.ratingChanges.black;
        }

        set({ 
          gameState: 'finished', 
          gameOverReason: data.reason,
          ratingChange: ratingChangeData
        });
        
        if (chess) {
          const whiteName = playerColor === 'w' ? (user?.username || 'You') : (opponent?.username || 'Opponent');
          const blackName = playerColor === 'b' ? (user?.username || 'You') : (opponent?.username || 'Opponent');
          saveLocalMatchHistory({
            id: gameId,
            white: whiteName,
            black: blackName,
            whiteRating: playerColor === 'w' ? user?.rating : opponent?.rating,
            blackRating: playerColor === 'b' ? user?.rating : opponent?.rating,
            status: data.status || (chess.isCheckmate() ? (chess.turn() === 'w' ? 'black_won' : 'white_won') : 'draw'),
            reason: data.reason || (chess.isCheckmate() ? 'Checkmate' : 'Game Finished'),
            timeControl: timeControl || 'blitz',
            pgn: chess.pgn()
          });
        }
      }
    });

    socket.on('player_disconnected', (data) => {
      set({ opponentDisconnectedAt: Date.now() });
    });

    socket.on('player_reconnected', (data) => {
      set({ opponentDisconnectedAt: null });
    });

    socket.on('active_game_found', (data) => {
      set({ activeGameToRejoin: data });
    });

    
    socket.on('friend_request_received', (data) => {
      // Import toast inside the callback to avoid circular dependencies if needed, or just rely on a generic event emitter
      // Alternatively, we can use a custom event and listen to it in NotificationManager
      window.dispatchEvent(new CustomEvent('friend_request_received', { detail: data }));
    });
    
    socket.on('friend_request_accepted', (data) => {
      window.dispatchEvent(new CustomEvent('friend_request_accepted', { detail: data }));
    });
    
    socket.on('friend_request_rejected', (data) => {
      window.dispatchEvent(new CustomEvent('friend_request_rejected', { detail: data }));
    });

    socket.on('challenge_received', (data) => {
      window.dispatchEvent(new CustomEvent('challenge_received', { detail: data }));
    });
    
    socket.on('challenge_rejected', (data) => {
      window.dispatchEvent(new CustomEvent('challenge_rejected', { detail: data }));
    });
    
    socket.on('challenge_failed', (data) => {
      window.dispatchEvent(new CustomEvent('challenge_failed', { detail: data }));
    });

    socket.on('already_in_game', () => {
      set({ gameState: 'idle' });
      // Notify the user they should rejoin the active game
      const { user } = get();
      if (user) {
        socket.emit('check_active_game', { username: user.username });
      }
    });

    socket.on('room_created', (data) => {
       window.dispatchEvent(new CustomEvent('room_created', { detail: data }));
    });

    socket.on('room_cancelled', (data) => {
       window.dispatchEvent(new CustomEvent('room_cancelled', { detail: data }));
    });

    socket.on('room_error', (data) => {
       window.dispatchEvent(new CustomEvent('room_error', { detail: data }));
    });

    socket.on('reward_granted', (data) => {
      const { user } = get();
      if (user) {
        set({ user: { ...user, ...data } });
        toast.success(`Reward Granted: ${data.type === 'elo' ? '+' + data.value + ' ELO' : data.value}`);
      }
    });

    set({ socket });
  },

  searchGame: (timeControl, options) => {
    const { user, customTimeConfig } = get();
    if (user && user.email) {
      notifyUserActive(user.email);
    }

    let initialTime = 600000;
    let increment = 0;
    const baseTC = options?.baseTimeControl || timeControl;
    if (baseTC === 'bullet') { initialTime = 60000; increment = 0; }
    else if (baseTC === 'blitz') { initialTime = 180000; increment = 2000; }
    else if (baseTC === 'rapid') { initialTime = 600000; increment = 0; }
    else if (baseTC === 'classical') { initialTime = 1800000; increment = 0; }
    else if (baseTC === 'custom' || baseTC.startsWith('custom') || options?.customMinutes) {
      const mins = options?.customMinutes || customTimeConfig?.minutes || 5;
      const incSecs = options?.customIncrement !== undefined ? options.customIncrement : (customTimeConfig?.increment || 0);
      initialTime = mins * 60000;
      increment = incSecs * 1000;
    }

    if (timeControl.startsWith('ai') || timeControl === 'local-pass' || timeControl === 'tactics' || timeControl === 'openings') {
      const chess = new Chess();
      let botName = 'Novice Bot (Lv 1)';
      let botRating = 800;
      let botLevel = 1;

      if (timeControl === 'ai-1') { botName = 'Novice Bot (Lv 1)'; botRating = 800; botLevel = 1; }
      else if (timeControl === 'ai-2') { botName = 'Casual Bot (Lv 2)'; botRating = 1300; botLevel = 2; }
      else if (timeControl === 'ai-3') { botName = 'Advanced Bot (Lv 3)'; botRating = 1900; botLevel = 3; }
      else if (timeControl === 'ai-4') { botName = 'Master Bot (Lv 4)'; botRating = 2400; botLevel = 4; }
      else if (timeControl === 'ai-5') { botName = 'Superhuman Bot (Lv 5 • Yellow Level Highest)'; botRating = 3500; botLevel = 5; }
      else if (timeControl === 'local-pass') { botName = 'Player 2'; botRating = 1500; }
      else if (timeControl === 'tactics') { botName = 'Tactics Trainer'; botRating = 1600; }
      else if (timeControl === 'openings') { botName = 'Opening Trainer'; botRating = 1600; }

      let chosenColor: 'w' | 'b' = 'w';
      if (options?.side === 'b') chosenColor = 'b';
      else if (options?.side === 'random') chosenColor = Math.random() < 0.5 ? 'w' : 'b';

      set({
        gameState: 'playing',
        timeControl,
        gameId: timeControl === 'local-pass' ? 'local-pass' : 'local-ai',
        opponent: { username: botName, rating: botRating },
        playerColor: chosenColor,
        chess,
        whiteTime: initialTime,
        blackTime: initialTime,
        tutorMessage: timeControl === 'openings' ? 'Welcome to Opening Practice! Make your first move to get started.' : timeControl === 'tactics' ? 'Welcome to Tactics Puzzle! Make your move.' : null
      });

      // If user chose to play as Black against AI bot, trigger bot opening move as White
      if (timeControl.startsWith('ai') && chosenColor === 'b') {
        setTimeout(() => {
          triggerAIMove(chess, botLevel, set, get);
        }, 500);
      }
      return;
    }

    const { socket } = get();
    if (!socket || !user) return;

    let tcPayload = timeControl;
    if (timeControl === 'custom' || timeControl.startsWith('custom')) {
      const mins = options?.customMinutes || customTimeConfig?.minutes || 5;
      const incSecs = options?.customIncrement !== undefined ? options.customIncrement : (customTimeConfig?.increment || 0);
      tcPayload = `custom_${mins}_${incSecs}`;
    }

    // Clear any existing timeout
    const existingTimeout = (get() as any).matchmakingTimeoutId;
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    socket.emit('join_queue', { username: user.username, email: user.email, timeControl: tcPayload, force: true });
    
    // 30-second matchmaking timeout
    const matchmakingTimeoutId = window.setTimeout(() => {
      const state = get() as any;
      if (state.gameState === 'searching') {
        state.socket?.emit('leave_queue');
        set({ gameState: 'idle', matchmakingTimeoutId: null });
        toast.error("Matchmaking timed out. No opponent found within 30 seconds.");
      }
    }, 30000);

    set({ gameState: 'searching', timeControl: tcPayload, whiteTime: initialTime, blackTime: initialTime, matchmakingTimeoutId });
  },

  tick: () => {
    const { gameState, chess, whiteTime, blackTime } = get();
    if (gameState !== 'playing' || !chess) return;

    if (chess.turn() === 'w') {
      const newTime = Math.max(0, whiteTime - 100);
      set({ whiteTime: newTime });
      if (newTime === 0) {
        set({ gameState: 'finished', gameOverReason: 'Time out - Black wins' });
      }
    } else {
      const newTime = Math.max(0, blackTime - 100);
      set({ blackTime: newTime });
      if (newTime === 0) {
        set({ gameState: 'finished', gameOverReason: 'Time out - White wins' });
      }
    }
  },

  makeMove: (move) => {
    let moveSuccess = false;
    const { socket, gameId, timeControl, chess, user } = get();
    if (user && user.email) {
      notifyUserActive(user.email);
    }
    
    if (timeControl && (timeControl.startsWith('ai') || timeControl === 'local-pass' || timeControl === 'tactics' || timeControl === 'openings') && chess) {
      // Local game
      const newChess = new Chess(chess.fen());
      try {
        newChess.move(move); moveSuccess = true;
        set({ chess: newChess });
        
        if (newChess.isGameOver()) {
          const { user, opponent } = get();
          recordLocalGameOver(newChess, timeControl, user, opponent);
          set({ gameState: 'finished' });
          return;
        }

        if (timeControl === 'local-pass') {
          // Both players move manually, do not trigger AI
          return;
        }

        // AI's turn
        if (timeControl === 'tactics' || timeControl === 'openings') {
          // Call our Gemini API tutor backend
          set({ tutorMessage: 'Thinking...' });
          fetch('/api/chess/tutor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fen: newChess.fen(),
              mode: timeControl,
              history: newChess.history()
            })
          })
          .then(res => res.json())
          .then(data => {
             const aiChess = new Chess(newChess.fen());
             if (data.move) {
               try {
                 aiChess.move(data.move);
                 set({ chess: aiChess });
                 if (aiChess.isGameOver()) {
                   set({ gameState: 'finished' });
                 }
               } catch (e) {
                 const fallback = getSmartFallbackMove(aiChess, 2);
                 if (fallback) {
                   aiChess.move(fallback);
                   set({ chess: aiChess });
                   if (aiChess.isGameOver()) set({ gameState: 'finished' });
                 }
               }
             }
             if (data.message) {
               set({ tutorMessage: data.message });
             } else {
               set({ tutorMessage: null });
             }
          })
          .catch(err => {
             console.error("Tutor error", err);
             set({ tutorMessage: 'Oops, my connection hiccuped. Making a tactical move.' });
             const aiChess = new Chess(newChess.fen());
             const fallback = getSmartFallbackMove(aiChess, 2);
             if (fallback) {
               aiChess.move(fallback);
               set({ chess: aiChess });
               if (aiChess.isGameOver()) set({ gameState: 'finished' });
             }
          });
        } else {
          // Bot move
          const botLevel = parseInt(timeControl.split('-')[1] || '1', 10);
          triggerAIMove(newChess, botLevel, set, get);
        }
      } catch (e) {
        // Invalid move
      }
      return;
    }

    if (!socket || !gameId) return;
    socket.emit('make_move', { gameId, move });
  },

  resignGame: () => {
    const { socket, gameId, timeControl, chess, user, opponent } = get();
    if (timeControl && (timeControl.startsWith('ai') || timeControl === 'local-pass' || timeControl === 'tactics' || timeControl === 'openings')) {
      if (chess) {
        recordLocalGameOver(chess, timeControl, user, opponent, 'Resignation');
      }
      set({ gameState: 'finished', gameOverReason: 'Resignation' });
      return;
    }
    if (socket && gameId) {
      socket.emit('resign', { gameId });
    }
  },
  rejoinGame: () => {
    const { socket, user, activeGameToRejoin } = get();
    if (socket && user && activeGameToRejoin) {
      socket.emit('rejoin_game', { username: user.username, gameId: activeGameToRejoin.gameId });
      set({ activeGameToRejoin: null });
    }
  },
  createPrivateRoom: (timeControl, options) => {
    const { socket, user, customTimeConfig } = get();
    if (socket) {
      let tc = timeControl;
      const mins = options?.customMinutes || customTimeConfig?.minutes || 5;
      const inc = options?.customIncrement !== undefined ? options.customIncrement : (customTimeConfig?.increment || 0);
      if (timeControl === 'custom' || timeControl.startsWith('custom')) {
        tc = `custom_${mins}_${inc}`;
      }
      const username = user?.username || 'Player';
      socket.emit('create_private_room', {
        username,
        email: user?.email,
        timeControl: tc,
        customMinutes: mins,
        customIncrement: inc
      });
    }
  },
  cancelPrivateRoom: (code) => {
    const { socket } = get();
    if (socket && code) {
      const cleanCode = code.toString().replace(/[^0-9a-zA-Z]/g, '').trim().toUpperCase();
      socket.emit('cancel_private_room', { code: cleanCode });
    }
  },
  joinPrivateRoom: (code) => {
    const { socket, user } = get();
    if (socket && code) {
      const cleanCode = code.toString().replace(/[^0-9a-zA-Z]/g, '').trim().toUpperCase();
      const username = user?.username || 'Player';
      socket.emit('join_private_room', { username, email: user?.email, code: cleanCode });
    }
  },
  resetGame: () => {
    const state = get() as any;
    if (state.matchmakingTimeoutId) {
      clearTimeout(state.matchmakingTimeoutId);
    }
    const { socket } = get();
    if (socket) {
      socket.emit('leave_queue');
    }
    set({
      gameId: null,
      chess: null,
      opponent: null,
      playerColor: null,
      timeControl: null,
      gameState: 'idle',
      gameOverReason: null,
      ratingChange: null,
      opponentDisconnectedAt: null,
      activeGameToRejoin: null,
      matchmakingTimeoutId: null
    });
  },

  setGameId: (id) => set({ gameId: id }),
  checkSavedGame: () => {
    const saved = localStorage.getItem('chessarena_saved_game');
    set({ hasSavedGame: !!saved });
  },
  saveLocalGame: () => {
    const { chess, timeControl, opponent, playerColor, gameId, tutorMessage } = get();
    if (chess && timeControl && (timeControl.startsWith('ai') || timeControl === 'local-pass' || timeControl === 'tactics' || timeControl === 'openings')) {
      const savedData = {
        fen: chess.fen(),
        timeControl,
        opponent,
        playerColor,
        gameId,
        tutorMessage,
        savedAt: Date.now()
      };
      localStorage.setItem('chessarena_saved_game', JSON.stringify(savedData));
      get().resetGame();
      get().checkSavedGame();
    }
  },
  resumeLocalGame: () => {
    const data = localStorage.getItem('chessarena_saved_game');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        set({
          chess: new Chess(parsed.fen),
          timeControl: parsed.timeControl,
          opponent: parsed.opponent,
          playerColor: parsed.playerColor,
          gameId: parsed.gameId,
          tutorMessage: parsed.tutorMessage,
          gameState: 'playing',
          gameOverReason: null
        });
        localStorage.removeItem('chessarena_saved_game');
        get().checkSavedGame();
      } catch (e) {
        console.error(e);
      }
    }
  }
}));
