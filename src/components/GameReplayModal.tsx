import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { GameReplayViewer, GameReplayData } from './GameReplayViewer';

interface GameReplayModalProps {
  game: GameReplayData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function GameReplayModal({ game, isOpen, onClose }: GameReplayModalProps) {
  if (!game) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl w-[95vw] p-4 sm:p-6 max-h-[92vh] overflow-y-auto bg-card border-border rounded-xl">
        <DialogTitle className="sr-only">Game Replay Viewer</DialogTitle>
        <DialogDescription className="sr-only">
          Move-by-move match replay viewer for {game.white} vs {game.black}
        </DialogDescription>
        <GameReplayViewer game={game} onClose={onClose} isModal={true} />
      </DialogContent>
    </Dialog>
  );
}
