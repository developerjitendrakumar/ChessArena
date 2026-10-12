import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { toast, Toaster } from 'sonner';
import { useAppStore } from '../store';

export function NotificationManager() {
  const { socket } = useAppStore();

  useEffect(() => {
    // Request permission for system notifications
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    if (!socket) return;

    const handleSystemNotification = (data: { title: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }) => {
      const icon = <img src="/logo.png" className="w-5 h-5 object-contain" alt="ChessArena" />;
      // 1. Show in-app toast
      switch (data.type) {
        case 'success':
          toast.success(data.title, { description: data.message, icon });
          break;
        case 'warning':
          toast.warning(data.title, { description: data.message, icon });
          break;
        case 'error':
          toast.error(data.title, { description: data.message, icon });
          break;
        default:
          toast(data.title, { description: data.message, icon });
          break;
      }
    };

    socket.on('system_notification', handleSystemNotification);

    socket.on('achievement_unlocked', (data: { achievements: any[], title?: string | null }) => {
      const icon = <img src="/logo.png" className="w-5 h-5 object-contain" alt="ChessArena" />;
      
      data.achievements.forEach(ach => {
        toast.success('Achievement Unlocked!', {
          description: `${ach.icon} ${ach.title}: ${ach.description}`,
          icon,
          duration: 6000,
          action: {
            label: 'View Gallery',
            onClick: () => navigate(`/profile/${useAppStore.getState().user?.username}`)
          }
        });
      });

      if (data.title) {
        toast.success('New Title Awarded!', {
          description: `You have earned the title: ${data.title}! 👑`,
          icon,
          duration: 8000,
          className: "bg-yellow-500/10 border-yellow-500/50",
          action: {
            label: 'View Profile',
            onClick: () => navigate(`/profile/${useAppStore.getState().user?.username}`)
          }
        });
      }
      
      // Update local store with new data
      const currentUser = useAppStore.getState().user;
      if (currentUser) {
        const updatedUser = { ...currentUser };
        if (data.achievements.length > 0) {
          updatedUser.achievements = [...(currentUser.achievements || []), ...data.achievements];
        }
        if (data.title) {
          updatedUser.title = data.title;
        }
        useAppStore.getState().setUser(updatedUser);
      }
    });

    return () => {
      socket.off('system_notification', handleSystemNotification);
      socket.off('achievement_unlocked');
    };
  }, [socket]);


  const navigate = useNavigate();

  useEffect(() => {
    const handleFRReceived = (e: any) => {
      const { fromUsername, requestId } = e.detail;
      const icon = <img src="/logo.png" className="w-5 h-5 object-contain" alt="ChessArena" />;
      toast('Friend Request', {
        description: `${fromUsername} sent you a friend request!`,
        icon,
        action: {
          label: 'View',
          onClick: () => navigate('/dashboard')
        }
      });
    };
    
    const handleFRAccepted = (e: any) => {
      const { toUsername } = e.detail;
      const icon = <img src="/logo.png" className="w-5 h-5 object-contain" alt="ChessArena" />;
      toast.success('Request Accepted', { description: `${toUsername} accepted your friend request!`, icon });
    };
    
    const handleFRRejected = (e: any) => {
      const { toUsername } = e.detail;
      const icon = <img src="/logo.png" className="w-5 h-5 object-contain" alt="ChessArena" />;
      toast.error('Request Rejected', { description: `${toUsername} rejected your friend request.`, icon });
    };
    
    const handleChallReceived = (e: any) => {
      const { challengerUsername, timeControl } = e.detail;
      const icon = <img src="/logo.png" className="w-5 h-5 object-contain" alt="ChessArena" />;
      toast(`Challenge from ${challengerUsername}`, {
        description: `They want to play a ${timeControl} match with you!`,
        duration: 10000,
        icon,
        action: {
          label: 'Accept',
          onClick: () => {
             const user = useAppStore.getState().user;
             if (socket && user) {
               socket.emit('respond_challenge', { challengerUsername, targetUsername: user.username, timeControl, accept: true });
               navigate('/play');
             }
          }
        },
        cancel: {
          label: 'Decline',
          onClick: () => {
             const user = useAppStore.getState().user;
             if (socket && user) {
               socket.emit('respond_challenge', { challengerUsername, targetUsername: user.username, timeControl, accept: false });
             }
          }
        }
      });
    };
    
    const handleChallRejected = (e: any) => {
      const { targetUsername } = e.detail;
      const icon = <img src="/logo.png" className="w-5 h-5 object-contain" alt="ChessArena" />;
      toast.error('Challenge Declined', { description: `${targetUsername} declined your challenge.`, icon });
    };
    
    const handleChallFailed = (e: any) => {
      const { reason } = e.detail;
      const icon = <img src="/logo.png" className="w-5 h-5 object-contain" alt="ChessArena" />;
      toast.error('Challenge Failed', { description: reason, icon });
    };

    window.addEventListener('friend_request_received', handleFRReceived);
    window.addEventListener('friend_request_accepted', handleFRAccepted);
    window.addEventListener('friend_request_rejected', handleFRRejected);
    window.addEventListener('challenge_received', handleChallReceived);
    window.addEventListener('challenge_rejected', handleChallRejected);
    window.addEventListener('challenge_failed', handleChallFailed);
    
    return () => {
      window.removeEventListener('friend_request_received', handleFRReceived);
      window.removeEventListener('friend_request_accepted', handleFRAccepted);
      window.removeEventListener('friend_request_rejected', handleFRRejected);
      window.removeEventListener('challenge_received', handleChallReceived);
      window.removeEventListener('challenge_rejected', handleChallRejected);
      window.removeEventListener('challenge_failed', handleChallFailed);
    };
  }, [navigate, socket]);

  return <Toaster position="top-right" richColors />;

}
