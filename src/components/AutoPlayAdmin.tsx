import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, StepForward, Activity, Save } from 'lucide-react';
import { toast } from 'sonner';

export function AutoPlayAdmin() {
  const { user, chess, gameState, playerColor, makeMove, timeControl } = useAppStore();
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [depth, setDepth] = useState(12);
  const [thinking, setThinking] = useState(false);
  const [evalScore, setEvalScore] = useState<number | null>(null);
  const [bestLine, setBestLine] = useState<string>('');
  const [lastMessage, setLastMessage] = useState<string>('');
  
  const autoPlayRef = useRef(autoPlayEnabled);
  const thinkingRef = useRef(thinking);

  useEffect(() => {
    autoPlayRef.current = autoPlayEnabled;
  }, [autoPlayEnabled]);
  
  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);

  useEffect(() => {
    if (!chess || gameState !== 'playing') return;
    if (!autoPlayEnabled) return;
    
    const isOurTurn = timeControl === 'local-pass' || chess.turn() === playerColor;
    if (isOurTurn && !thinkingRef.current && !chess.isGameOver()) {
       const randomDelay = Math.floor(Math.random() * (10000 - 500 + 1)) + 500; // Random delay between 500ms and 10000ms
       const timer = setTimeout(() => {
          playBestMove();
       }, randomDelay);
       return () => clearTimeout(timer);
    }
  }, [chess?.fen(), gameState, autoPlayEnabled, playerColor, timeControl]);

  const playBestMove = async () => {
    if (!chess || chess.isGameOver() || thinkingRef.current) return;
    setThinking(true);
    try {
      const res = await fetch('https://chess-api.com/v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: chess.fen(), depth })
      });
      const data = await res.json();
      
      if (data.eval !== undefined) setEvalScore(data.eval);
      if (data.continuationArr) setBestLine(data.continuationArr.join(' '));
      if (data.text) setLastMessage(data.text);
      
      if (data.san) {
        if (autoPlayRef.current) {
          makeMove(data.san);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error('AI API Error');
    } finally {
      setThinking(false);
    }
  };

  const forceStep = async () => {
    if (!chess || chess.isGameOver() || thinkingRef.current) return;
    setThinking(true);
    try {
      const res = await fetch('https://chess-api.com/v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: chess.fen(), depth })
      });
      const data = await res.json();
      if (data.eval !== undefined) setEvalScore(data.eval);
      if (data.continuationArr) setBestLine(data.continuationArr.join(' '));
      if (data.text) setLastMessage(data.text);
      if (data.san) makeMove(data.san);
    } catch(e) {
      toast.error('AI Error on Step');
    }
    finally { setThinking(false); }
  }

  const downloadPGN = () => {
    if (!chess) return;
    const pgn = chess.pgn();
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai_game.pgn';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (user?.email !== 'priyanshushaurya0@gmail.com') return null;

  return (
    <Card className="mt-4 border-amber-500/50 shadow-lg bg-amber-500/10 dark:bg-amber-500/5">
      <CardHeader className="py-3 border-b border-amber-500/20">
        <CardTitle className="text-sm flex items-center justify-between text-amber-600 dark:text-amber-500">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" /> Admin God Mode (Stockfish 17)
          </div>
          <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-500 text-[10px]">Anti-Cheat Bypassed</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={autoPlayEnabled} onCheckedChange={setAutoPlayEnabled} className="data-[state=checked]:bg-amber-500" />
            <span className="text-sm font-bold">{autoPlayEnabled ? 'Auto-Play Active' : 'Auto-Play Paused'}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={forceStep} disabled={thinking} title="Force Step">
              {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <StepForward className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadPGN} title="Save PGN">
              <Save className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>Strength: {depth < 5 ? 'Beginner' : depth < 12 ? 'Intermediate' : depth < 16 ? 'Advanced' : 'Grandmaster'}</span>
            <span>Depth {depth}</span>
          </div>
          <Slider value={[depth]} onValueChange={v => setDepth(v[0])} min={1} max={18} step={1} className="[&_[role=slider]]:border-amber-500 [&_[role=slider]]:bg-amber-500" />
        </div>

        {evalScore !== null && (
          <div className="text-xs space-y-2 p-3 bg-background/50 rounded-lg border border-amber-500/20">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-amber-500" /> Evaluation</span>
              <span className={evalScore > 0 ? 'text-green-500' : evalScore < 0 ? 'text-red-500' : ''}>
                {evalScore > 0 ? '+' : ''}{evalScore}
              </span>
            </div>
            {lastMessage && (
              <div className="text-amber-600 dark:text-amber-400 font-medium">
                {lastMessage}
              </div>
            )}
            <div className="text-muted-foreground truncate" title={bestLine}>
              <span className="font-semibold text-foreground/70">Line:</span> {bestLine}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
