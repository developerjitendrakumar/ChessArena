import { useState } from 'react';
import { useAppStore } from '../store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { auth, signOut } from '@/lib/firebase';

export function BanModal() {
  const { bannedStatus, setBannedStatus } = useAppStore();
  const [appealMessage, setAppealMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [appealed, setAppealed] = useState(false);

  if (!bannedStatus?.isBanned) return null;

  const handleAppeal = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/appeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: bannedStatus.email,
          username: bannedStatus.username,
          message: appealMessage
        })
      });
      if (res.ok) {
        setAppealed(true);
        toast.success('Appeal submitted successfully');
      } else {
        toast.error('Failed to submit appeal');
      }
    } catch (e) {
      toast.error('Error submitting appeal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    signOut(auth);
    setBannedStatus(null);
  };

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive text-xl">Account Banned</DialogTitle>
          <DialogDescription className="text-base text-foreground">
            Your account has been banned due to fair play violations or abusive behavior.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-destructive/10 text-destructive p-3 rounded text-sm font-medium">
            Reason: {bannedStatus.reason || 'Manual review by admin'}
            {bannedStatus.banExpiresAt && (
              <div className="mt-2 text-xs">
                Ban expires at: {new Date(bannedStatus.banExpiresAt).toLocaleString()}
              </div>
            )}
          </div>
          
          {!appealed ? (
            <>
              <p className="text-sm text-muted-foreground">
                If you believe this decision was made in error, you may submit an appeal. Please explain the situation clearly.
              </p>
              <Textarea
                placeholder="Write your appeal message here..."
                value={appealMessage}
                onChange={(e) => setAppealMessage(e.target.value)}
                rows={4}
              />
            </>
          ) : (
            <div className="bg-green-500/10 text-green-600 p-4 rounded text-sm text-center font-medium">
              Your appeal has been submitted and will be reviewed by an administrator. You will be notified of the outcome via email.
            </div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose}>
            Logout
          </Button>
          {!appealed && (
            <Button variant="default" onClick={handleAppeal} disabled={submitting || !appealMessage.trim()}>
              {submitting ? 'Submitting...' : 'Submit Appeal'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
