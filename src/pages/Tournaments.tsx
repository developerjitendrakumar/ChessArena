import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, Clock, Users, Calendar, Plus, Loader2, Bell } from 'lucide-react';
import { useAppStore } from '@/store';
import { toast } from 'sonner';

export function Tournaments() {
  const { user } = useAppStore();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [notifying, setNotifying] = useState<string | null>(null);
  const [notifiedTournaments, setNotifiedTournaments] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await fetch('/api/tournaments');
        if (res.ok) {
          const data = await res.json();
          setTournaments(data.tournaments || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchTournaments();
  }, []);

  const handleNotify = async (id: string) => {
    if (!user) return toast.error('You must be logged in to set alerts');
    setNotifying(id);
    try {
      const res = await fetch('/api/tournaments/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: id, userId: user.uid, userEmail: user.email })
      });
      if (res.ok) {
        toast.success('We will notify you 10 minutes before the start!');
        setNotifiedTournaments(prev => new Set(prev).add(id));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to set alert');
      }
    } catch (e) {
      toast.error('Error setting alert');
    } finally {
      setNotifying(null);
    }
  };

  const handleJoin = async (id: string) => {
    if (!user) return toast.error('You must be logged in to join');
    setJoining(id);
    try {
      const res = await fetch('/api/tournaments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: id, username: user.username })
      });
      if (res.ok) {
        toast.success('Joined tournament!');
        setTournaments(prev => prev.map(t => t.id === id ? { ...t, participants: [...(t.participants || []), user.username] } : t));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to join');
      }
    } catch (e) {
      toast.error('Error joining tournament');
    } finally {
      setJoining(null);
    }
  };

  const handleCreate = async () => {
    const title = prompt("Enter Tournament Title:");
    if (!title) return;
    const type = prompt("Enter Type (e.g. Blitz 3+0):", "Blitz 3+0");
    if (!type) return;

    try {
      const res = await fetch('/api/tournaments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type })
      });
      if (res.ok) {
        const newT = await res.json();
        setTournaments(prev => [newT, ...prev]);
        toast.success('Tournament created!');
      }
    } catch (e) {
      toast.error('Failed to create tournament');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Trophy className="w-8 h-8 text-primary" />
            Tournaments
          </h1>
          <p className="text-muted-foreground mt-1">Compete against others and win prizes.</p>
        </div>
        <Button className="font-bold" onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-2" /> Create Tournament
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map(t => (
            <Card key={t.id} className={`border-2 ${t.status === 'active' ? 'border-primary shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-border'}`}>
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={t.status === 'active' ? 'default' : 'secondary'} className={t.status === 'active' ? 'animate-pulse' : ''}>
                    {t.status.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">{t.type}</Badge>
                </div>
                <CardTitle className="text-xl">{t.title}</CardTitle>
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center gap-1 text-primary font-bold">
                    <Trophy className="w-4 h-4 text-yellow-500" />
                    <span>Prize Pool</span>
                  </div>
                  <div className="text-xs space-y-1 bg-primary/5 p-2 rounded-lg border border-primary/10">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">1st:</span>
                      <span className="font-semibold text-foreground">{t.prizePool?.first || t.prize}</span>
                    </div>
                    {t.prizePool?.second && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">2nd:</span>
                        <span className="font-medium text-foreground/80">{t.prizePool.second}</span>
                      </div>
                    )}
                    {t.prizePool?.third && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">3rd:</span>
                        <span className="font-medium text-foreground/70">{t.prizePool.third}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  {(t.participants?.length || 0)} Players Joined
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {t.status === 'active' ? <Clock className="w-4 h-4 text-primary" /> : <Calendar className="w-4 h-4" />}
                  <span className={t.status === 'active' ? 'text-primary font-medium' : ''}>{t.status === 'active' ? 'In Progress' : (t.startTime ? new Date(t.startTime).toLocaleString() : 'TBD')}</span>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button 
                  className="w-full font-bold" 
                  variant={t.status === 'active' ? 'secondary' : 'default'} 
                  disabled={t.status === 'active' || joining === t.id || t.participants?.includes(user?.username)}
                  onClick={() => handleJoin(t.id)}
                >
                  {joining === t.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {t.status === 'active' ? 'In Progress' : (t.participants?.includes(user?.username) ? 'Joined' : 'Join Tournament')}
                </Button>
                
                {(t.status === 'upcoming' || t.status === 'registering') && !t.participants?.includes(user?.username) && (
                  <Button 
                    variant="outline" 
                    className="w-full gap-2" 
                    disabled={notifying === t.id || notifiedTournaments.has(t.id)}
                    onClick={() => handleNotify(t.id)}
                  >
                    {notifying === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                    {notifiedTournaments.has(t.id) ? 'Notification Set' : 'Notify Me'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
          {tournaments.length === 0 && (
            <div className="col-span-full text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
              No tournaments available. Create one to get started!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
