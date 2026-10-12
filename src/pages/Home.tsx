import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAppStore } from '../store';
import { Play, Trophy, Users, ShieldAlert, Smartphone } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';

export function Home() {
  const { user, setUser } = useAppStore();
  const navigate = useNavigate();

  const handleGuestLogin = () => {
    setUser({
      username: `Guest_${uuidv4().substring(0, 5)}`,
      rating: 1200
    });
    navigate('/play');
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Section */}
      <section className="text-center space-y-4 py-12">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-foreground">
          Master the Board
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Professional online chess platform with real-time multiplayer, WebRTC voice chat, and AI analysis.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link to="/play" className={cn(buttonVariants({ size: "lg" }), "h-12 px-8")}>
            <Play className="mr-2 h-5 w-5" />
            Play Now
          </Link>
          {!user && (
            <Button size="lg" variant="outline" className="h-12 px-8" onClick={handleGuestLogin}>
              Play as Guest
            </Button>
          )}
        </div>
      </section>

      {/* Features Grid */}
      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <Users className="w-8 h-8 mb-2 text-primary" />
            <CardTitle>Real-Time Multiplayer</CardTitle>
            <CardDescription>Play against opponents worldwide with instantaneous move transmission.</CardDescription>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader>
            <ShieldAlert className="w-8 h-8 mb-2 text-primary" />
            <CardTitle>Fair Play System</CardTitle>
            <CardDescription>Strict anti-cheat and moderation systems ensure a safe environment.</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Trophy className="w-8 h-8 mb-2 text-primary" />
            <CardTitle>Global Rankings</CardTitle>
            <CardDescription>Climb the ELO ladder and compete in daily tournaments.</CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <Smartphone className="w-8 h-8 mb-2 text-primary" />
            <CardTitle>Progressive Web App</CardTitle>
            <CardDescription>
              <ul className="text-xs space-y-1 mt-2 list-disc list-inside">
                <li>Install like a native app</li>
                <li>Offline support & sync</li>
                <li>Push notifications</li>
                <li>Fast loading & responsive</li>
              </ul>
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
}
