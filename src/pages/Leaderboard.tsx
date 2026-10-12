import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Medal, Award } from 'lucide-react';
import { db, collection, query, orderBy, limit, getDocs } from '@/lib/firebase';
import { Link } from 'react-router-dom';

export function Leaderboard() {
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaders = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        if (res.ok) {
          const json = await res.json();
          if (json.users && json.users.length > 0) {
            setLeaders(json.users);
            setLoading(false);
            return;
          }
        }

        const q = query(collection(db, 'users'), orderBy('rating', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (data.length > 0) {
          setLeaders(data);
        } else {
          setLeaders([
            { username: 'GrandMaster', rating: 2800 },
            { username: 'ChessKing', rating: 2650 },
            { username: 'TacticsNinja', rating: 2500 },
            { username: 'PawnPusher', rating: 2100 },
            { username: 'KnightRider', rating: 1950 },
          ]);
        }
      } catch (err) {
        console.warn("Error fetching leaderboard, using defaults:", err);
        setLeaders([
          { username: 'GrandMaster', rating: 2800 },
          { username: 'ChessKing', rating: 2650 },
          { username: 'TacticsNinja', rating: 2500 },
          { username: 'PawnPusher', rating: 2100 },
          { username: 'KnightRider', rating: 1950 },
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaders();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Trophy className="w-8 h-8 text-primary" />
          Global Leaderboard
        </h1>
        <p className="text-muted-foreground">Top players from around the world.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground animate-pulse">Loading rankings...</div>
          ) : (
            <div className="space-y-4">
              {leaders.map((player, index) => (
                <Link to={`/profile/${player.username}`} key={player.username || index} className="flex items-center justify-between p-4 bg-background border border-border rounded-lg hover:border-primary/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-8 font-bold text-lg text-muted-foreground text-center">
                      {index === 0 ? <Medal className="w-6 h-6 text-yellow-500 mx-auto" /> : 
                       index === 1 ? <Medal className="w-6 h-6 text-gray-400 mx-auto" /> : 
                       index === 2 ? <Medal className="w-6 h-6 text-amber-600 mx-auto" /> : 
                       `#${index + 1}`}
                    </div>
                    <Avatar className="w-10 h-10 border-2 border-primary/20">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${player.username}`} />
                      <AvatarFallback>{player.username?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="font-semibold text-foreground">{player.username}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 rounded-full text-emerald-700 dark:text-emerald-400 font-bold">
                      <Award className="w-4 h-4" />
                      {player.rating}
                    </div>
                    <div className="text-[10px] text-slate-400 flex gap-2">
                      <span>{player.gamesPlayed || 0} games</span>
                      <span className="text-emerald-500 font-medium">{player.wins || 0}W</span>
                      <span className="text-red-500 font-medium">{player.losses || 0}L</span>
                      <span className="text-slate-500 font-medium">{player.draws || 0}D</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
