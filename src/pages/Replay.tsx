import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { GameReplayViewer, GameReplayData } from '@/components/GameReplayViewer';
import { SAMPLE_SHOWCASE_GAMES, getLocalMatchHistory } from '@/utils/sampleGames';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Swords, History, BookOpen, Upload, Loader2, ArrowLeft, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

export function ReplayPage() {
  const { gameId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = gameId || searchParams.get('id');

  const { user } = useAppStore();
  const [activeGame, setActiveGame] = useState<GameReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [userGames, setUserGames] = useState<GameReplayData[]>([]);
  const [showPgnModal, setShowPgnModal] = useState(false);
  const [customPgn, setCustomPgn] = useState('');

  // Fetch user completed games from server + local storage
  useEffect(() => {
    const fetchUserGames = async () => {
      const localGames = getLocalMatchHistory();
      if (user?.username) {
        try {
          const res = await fetch(`/api/games?username=${encodeURIComponent(user.username)}`);
          if (res.ok) {
            const data = await res.json();
            const serverGames: GameReplayData[] = (data.games || []).map((g: any) => ({
              id: g.id,
              white: g.white,
              black: g.black,
              whiteRating: g.whiteRating,
              blackRating: g.blackRating,
              status: g.status,
              reason: g.reason,
              timeControl: g.timeControl,
              timestamp: g.timestamp,
              pgn: g.pgn
            }));

            // Merge local and server games, deduplicating by id
            const map = new Map<string, GameReplayData>();
            serverGames.forEach(g => map.set(g.id, g));
            localGames.forEach((g: any) => {
              if (!map.has(g.id)) map.set(g.id, g);
            });

            setUserGames(Array.from(map.values()));
            return;
          }
        } catch (e) {
          console.error("Error fetching games for replay page:", e);
        }
      }
      setUserGames(localGames);
    };

    fetchUserGames();
  }, [user?.username]);

  // Load game when activeId changes
  useEffect(() => {
    if (!activeId) {
      // Default to the first available user game, or first showcase game
      if (userGames.length > 0) {
        setActiveGame(userGames[0]);
      } else {
        setActiveGame(SAMPLE_SHOWCASE_GAMES[0]);
      }
      return;
    }

    // 1. Check showcase games
    const showcase = SAMPLE_SHOWCASE_GAMES.find(g => g.id === activeId);
    if (showcase) {
      setActiveGame(showcase);
      return;
    }

    // 2. Check user games list
    const inUserList = userGames.find(g => g.id === activeId);
    if (inUserList) {
      setActiveGame(inUserList);
      return;
    }

    // 3. Try fetching from server /api/games/:id
    const fetchGame = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(activeId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.game) {
            setActiveGame(data.game);
            return;
          }
        }
        toast.error("Could not find the specified game.");
        setActiveGame(SAMPLE_SHOWCASE_GAMES[0]);
      } catch (err) {
        console.error("Failed to load game", err);
        setActiveGame(SAMPLE_SHOWCASE_GAMES[0]);
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [activeId, userGames]);

  const handleSelectGame = (game: GameReplayData) => {
    setActiveGame(game);
    setSearchParams({ id: game.id });
  };

  const handleLoadCustomPgn = () => {
    if (!customPgn.trim()) {
      toast.error("Please paste valid PGN notation.");
      return;
    }

    const customGame: GameReplayData = {
      id: `custom-${Date.now()}`,
      white: "White",
      black: "Black",
      status: "draw",
      reason: "Custom PGN",
      pgn: customPgn,
      description: "Imported game notation"
    };

    setActiveGame(customGame);
    setShowPgnModal(false);
    setCustomPgn('');
    toast.success("Imported custom game replay!");
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/play" className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Play
            </Link>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
            <PlayCircle className="w-8 h-8 text-primary" />
            Game Replay Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Step forward and backward move-by-move through completed matches, review tactical sequences, and inspect positions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPgnModal(true)}
            className="flex items-center gap-1.5 text-xs h-9"
          >
            <Upload className="w-3.5 h-3.5" />
            Import PGN
          </Button>
          <Link to="/dashboard">
            <Button variant="secondary" size="sm" className="flex items-center gap-1.5 text-xs h-9">
              <History className="w-3.5 h-3.5" />
              Match History
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Replay Viewer */}
      {loading ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading game replay...</span>
        </div>
      ) : activeGame ? (
        <div className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm">
          <GameReplayViewer game={activeGame} />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border p-12 text-center text-muted-foreground">
          No game selected. Pick a game from the lists below.
        </div>
      )}

      {/* Match Pickers: Recent Matches & Showcase Classics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {/* User Matches */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-base text-foreground">Your Match History</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {userGames.length} {userGames.length === 1 ? 'game' : 'games'}
            </span>
          </div>

          {userGames.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg p-4">
              <p className="mb-2">No completed matches recorded on this device yet.</p>
              <Link to="/play">
                <Button size="sm" variant="outline" className="text-xs">
                  Play a Game
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {userGames.map((g) => {
                const isSelected = activeGame?.id === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleSelectGame(g)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between text-xs ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-foreground font-semibold shadow-xs'
                        : 'border-border bg-card hover:bg-secondary/40 text-muted-foreground'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-foreground">
                        {g.white} vs {g.black}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {g.timeControl ? `${g.timeControl} • ` : ''}{g.reason || g.status}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">
                      {g.status === 'white_won' ? '1-0' : g.status === 'black_won' ? '0-1' : '½-½'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Master Showcase Games */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-base text-foreground">Historical Masterpieces</h2>
            </div>
            <span className="text-xs text-muted-foreground">Classics</span>
          </div>

          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {SAMPLE_SHOWCASE_GAMES.map((g) => {
              const isSelected = activeGame?.id === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handleSelectGame(g)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between text-xs ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-foreground font-semibold shadow-xs'
                      : 'border-border bg-card hover:bg-secondary/40 text-muted-foreground'
                  }`}
                >
                  <div className="pr-2">
                    <div className="font-semibold text-foreground">
                      {g.white} vs {g.black}
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">
                      {g.description}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-medium shrink-0">
                    {g.status === 'white_won' ? '1-0' : g.status === 'black_won' ? '0-1' : '½-½'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Import Custom PGN Dialog */}
      <Dialog open={showPgnModal} onOpenChange={setShowPgnModal}>
        <DialogContent className="max-w-md w-full bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Import Game PGN</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Paste standard Portable Game Notation (PGN) to step through and analyze any match move-by-move.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <Textarea
              placeholder="Paste PGN here (e.g. 1. e4 e5 2. Nf3 Nc6...)"
              className="font-mono text-xs h-40 resize-none"
              value={customPgn}
              onChange={(e) => setCustomPgn(e.target.value)}
            />
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPgnModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleLoadCustomPgn} className="flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              Load Replay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
