import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlayCircle, Eye, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GameReplayModal } from './GameReplayModal';
import { GameReplayData } from './GameReplayViewer';
import { SAMPLE_SHOWCASE_GAMES, getLocalMatchHistory } from '@/utils/sampleGames';

interface GameRecord {
  id: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  status: string;
  reason?: string;
  timeControl?: string;
  timestamp?: { _seconds: number, _nanoseconds: number } | string | number;
  pgn?: string;
  description?: string;
}

export function GameHistory({ username }: { username: string }) {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameReplayData | null>(null);

  useEffect(() => {
    const fetchGames = async () => {
      setLoading(true);
      setError(null);
      try {
        const localGames: GameRecord[] = getLocalMatchHistory();
        let serverGames: GameRecord[] = [];

        try {
          const response = await fetch(`/api/games?username=${encodeURIComponent(username)}`, {
            headers: {
              'Accept': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            serverGames = data.games || [];
          }
        } catch (serverErr) {
          console.warn("Server games fetch issue, falling back to local history:", serverErr);
        }

        // Merge server games and local games
        const map = new Map<string, GameRecord>();
        serverGames.forEach(g => map.set(g.id, g));
        localGames.forEach(g => {
          if (!map.has(g.id)) map.set(g.id, g);
        });

        setGames(Array.from(map.values()));
      } catch (err) {
        console.error("Error fetching games:", err);
        setError("Could not load game history.");
      } finally {
        setLoading(false);
      }
    };

    if (username) {
      fetchGames();
    }
  }, [username]);

  if (loading) {
    return <div className="text-center py-4 text-muted-foreground animate-pulse text-sm">Loading match history...</div>;
  }

  if (error) {
    return <div className="text-center py-4 text-red-500 text-sm">{error}</div>;
  }

  if (games.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-6 border border-dashed border-border rounded-lg bg-card/50">
          <p className="text-sm text-muted-foreground mb-3">No matches completed yet.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link to="/play">
              <Button size="sm" variant="default" className="text-xs">
                Play a Match
              </Button>
            </Link>
            <Link to="/replay">
              <Button size="sm" variant="outline" className="text-xs flex items-center gap-1.5">
                <PlayCircle className="w-3.5 h-3.5" />
                Open Replay Studio
              </Button>
            </Link>
          </div>
        </div>

        {/* Featured Showcase Games */}
        <div className="pt-2">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Featured Historic Matches (Demo Replays)
          </div>
          <div className="space-y-2">
            {SAMPLE_SHOWCASE_GAMES.slice(0, 2).map((game) => (
              <div
                key={game.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border border-border bg-card rounded-md shadow-xs gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {game.white} vs {game.black}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      Historical
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {game.description}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs flex items-center gap-1.5 h-8 shrink-0 hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => setSelectedGame(game)}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Replay Game
                </Button>
              </div>
            ))}
          </div>
        </div>

        <GameReplayModal
          game={selectedGame}
          isOpen={!!selectedGame}
          onClose={() => setSelectedGame(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {games.map((game) => {
        const isWhite = game.white === username;
        const opponent = isWhite ? game.black : game.white;
        let resultLabel = "Draw";
        let resultVariant: "default" | "secondary" | "destructive" | "outline" = "outline";

        if (game.status === "white_won") {
          if (isWhite) { resultLabel = "Win"; resultVariant = "default"; }
          else { resultLabel = "Loss"; resultVariant = "destructive"; }
        } else if (game.status === "black_won") {
          if (!isWhite) { resultLabel = "Win"; resultVariant = "default"; }
          else { resultLabel = "Loss"; resultVariant = "destructive"; }
        } else if (game.status === "abandoned") {
          resultLabel = "Abandoned";
        }

        let dateStr = "Recently";
        try {
          if (game.timestamp) {
            if (typeof game.timestamp === 'string') {
              dateStr = formatDistanceToNow(new Date(game.timestamp), { addSuffix: true });
            } else if (typeof game.timestamp === 'number') {
              dateStr = formatDistanceToNow(new Date(game.timestamp), { addSuffix: true });
            } else if (game.timestamp._seconds) {
              dateStr = formatDistanceToNow(new Date(game.timestamp._seconds * 1000), { addSuffix: true });
            }
          }
        } catch {
          dateStr = "Recently";
        }

        return (
          <div
            key={game.id}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 border border-border bg-card rounded-lg shadow-xs gap-3 hover:border-primary/40 transition-colors"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground">vs {opponent}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                  Played as {isWhite ? "White" : "Black"}
                </span>
                {game.timeControl && (
                  <span className="text-[11px] px-1.5 py-0.2 rounded border border-border/70 text-muted-foreground capitalize">
                    {game.timeControl}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {dateStr} {game.reason ? `• ${game.reason}` : ''}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Badge variant={resultVariant} className="text-xs px-2.5 py-0.5 font-semibold">
                {resultLabel}
              </Badge>

              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 px-2.5 flex items-center gap-1.5 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                onClick={() => setSelectedGame(game)}
                title="View move-by-move replay"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                Replay
              </Button>
            </div>
          </div>
        );
      })}

      <GameReplayModal
        game={selectedGame}
        isOpen={!!selectedGame}
        onClose={() => setSelectedGame(null)}
      />
    </div>
  );
}
