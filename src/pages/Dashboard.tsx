import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, History, ShieldCheck, Bell, Users, UserPlus, Check, X, Swords } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GameHistory } from '@/components/GameHistory';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


export function Dashboard() {
  
  const { user, setUser } = useAppStore();
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [renaming, setRenaming] = useState(false);
  
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [challengeTimeControl, setChallengeTimeControl] = useState("blitz");
  const { socket } = useAppStore();
  

  const handleRename = async () => {
    if (!newUsername.trim()) return;
    if (newUsername.trim() === user?.username) {
      setIsRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch('/api/user/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email, newUsername: newUsername.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setUser({ ...user, username: data.username });
        toast.success("Username updated successfully!");
        setIsRenameOpen(false);
      } else {
        toast.error(data.error || "Failed to update username");
      }
    } catch (err) {
      toast.error("Failed to update username");
      console.error(err);
    } finally {
      setRenaming(false);
    }
  };

  const loadFriends = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`/api/friends?email=${encodeURIComponent(user.email)}`);
      const data = await res.json();
      setFriends(data.friends || []);
      setPendingRequests(data.pendingRequests || []);
    } catch(e) {
      console.error(e);
    }
  };
  
  useEffect(() => {
    loadFriends();
    const interval = setInterval(loadFriends, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [user?.email]);
  
  const handleAddFriend = async () => {
    if (!addFriendUsername.trim()) return;
    setAddingFriend(true);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail: user?.email, fromUsername: user?.username, toUsername: addFriendUsername.trim() })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Friend request sent!");
        setIsAddFriendOpen(false);
        setAddFriendUsername("");
      } else {
        toast.error(data.error || "Failed to send request");
      }
    } catch(e) {
      toast.error("An error occurred");
    } finally {
      setAddingFriend(false);
    }
  };
  
  const handleRespondRequest = async (id: string, accept: boolean) => {
    try {
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, accept })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(accept ? "Request accepted!" : "Request declined");
        loadFriends();
      } else {
        toast.error(data.error || "Failed to respond");
      }
    } catch(e) {
      toast.error("An error occurred");
    }
  };
  
  const handleChallenge = (targetUsername: string) => {
     if (socket && user) {
       socket.emit('challenge_friend', { targetUsername, timeControl: challengeTimeControl, challengerUsername: user.username });
       toast.success(`Challenge sent to ${targetUsername}`);
     }
  };


  useEffect(() => {
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
    
    // Check if we should prompt the user to rename
    if (sessionStorage.getItem('promptRename') === 'true') {
      setIsRenameOpen(true);
      sessionStorage.removeItem('promptRename');
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('Browser does not support notifications');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);
    if (permission === 'granted') {
      toast.success('Notifications enabled successfully');
    } else {
      toast.error('Notifications permission denied');
    }
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-6 p-6 bg-card rounded-xl border border-border shadow-sm">
        <Avatar className="w-24 h-24 border-4 border-primary">
          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} />
          <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">{user.username}</h1>
            <Dialog open={isRenameOpen} onOpenChange={isOpen => { setIsRenameOpen(isOpen); if(isOpen) setNewUsername(user.username); }}>
              <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 text-muted-foreground hover:text-foreground">
                <Edit2 className="h-4 w-4" />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Username</DialogTitle>
                  <DialogDescription>
                    Choose a new display name. Please avoid inappropriate words.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">New Username</Label>
                    <Input 
                      id="username" 
                      value={newUsername} 
                      onChange={e => setNewUsername(e.target.value)} 
                      placeholder="Enter new username"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
                  <Button onClick={handleRename} disabled={renaming}>
                    {renaming ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">

            <Trophy className="w-4 h-4 text-primary" />
            <span className="font-medium text-foreground">{user.rating} ELO</span>
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Trophy className="w-5 h-5 text-primary" />
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {user.achievements && user.achievements.length > 0 ? (
                user.achievements.map((achievement) => (
                  <div key={achievement.id} className="flex flex-col items-center p-4 bg-background border border-border rounded-lg text-center space-y-2 hover:border-primary/50 transition-colors">
                    <div className="text-4xl">{achievement.icon}</div>
                    <div className="font-semibold text-sm">{achievement.title}</div>
                    <div className="text-xs text-muted-foreground">{achievement.description}</div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center text-sm text-muted-foreground py-4">
                  No achievements yet. Play some games to earn them!
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <History className="w-5 h-5 text-primary" />
              Recent Games
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user ? <GameHistory username={user.username} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Account Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="font-medium text-muted-foreground">Fair Play Score</span>
              <Badge variant="secondary" className="bg-primary/20 text-primary">100%</Badge>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="font-medium text-muted-foreground">Account Type</span>
              <Badge className="bg-primary text-primary-foreground">{user.isAdmin ? 'Admin' : 'Registered Player'}</Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="font-medium text-muted-foreground">Voice Chat Status</span>
              <Badge variant="outline" className="border-primary/50 text-primary">Enabled</Badge>
            </div>
          </CardContent>
        </Card>
                <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-foreground">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Friends & Social
              </div>
              <Dialog open={isAddFriendOpen} onOpenChange={setIsAddFriendOpen}>
                <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1" />}>
                    <UserPlus className="w-4 h-4" /> Add Friend
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add a Friend</DialogTitle>
                    <DialogDescription>Enter their unique username to send a friend request.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input value={addFriendUsername} onChange={(e) => setAddFriendUsername(e.target.value)} placeholder="e.g. Magnus" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddFriend} disabled={addingFriend}>
                      {addingFriend ? "Sending..." : "Send Request"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingRequests.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold mb-3">Pending Requests</h4>
                <div className="space-y-3">
                  {pendingRequests.map(req => (
                    <div key={req.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                      <div className="font-medium">{req.fromUsername}</div>
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500" onClick={() => handleRespondRequest(req.id, true)}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => handleRespondRequest(req.id, false)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <h4 className="text-sm font-semibold mb-3">Your Friends</h4>
            {friends.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6 bg-secondary/20 rounded-lg">
                You don't have any friends yet. Add friends to challenge them!
              </div>
            ) : (
              <div className="space-y-3">
                {friends.map(friend => (
                  <div key={friend.username} className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="w-10 h-10 border border-border">
                          <AvatarFallback>{friend.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${friend.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      </div>
                      <div>
                        <div className="font-medium">{friend.username}</div>
                        <div className="text-xs text-muted-foreground">{friend.rating} ELO</div>
                      </div>
                    </div>
                    {friend.isOnline && (
                      <Dialog>
                        <DialogTrigger render={<Button variant="ghost" size="sm" className="h-8 text-xs gap-1" />}>
                          <Button size="sm" variant="secondary" className="gap-1">
                            <Swords className="w-4 h-4" /> Challenge
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Challenge {friend.username}</DialogTitle>
                            <DialogDescription>Select time control for the match.</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                             <Label>Time Control</Label>
                             <Select value={challengeTimeControl} onValueChange={setChallengeTimeControl}>
                                <SelectTrigger>
                                   <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                   <SelectItem value="bullet">Bullet (1 min)</SelectItem>
                                   <SelectItem value="blitz">Blitz (3 min)</SelectItem>
                                   <SelectItem value="rapid">Rapid (10 min)</SelectItem>
                                </SelectContent>
                             </Select>
                          </div>
                          <DialogFooter>
                            <Button onClick={() => handleChallenge(friend.username)}>Send Challenge</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Bell className="w-5 h-5 text-primary" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="space-y-1">
                <p className="font-medium">System Notifications</p>
                <p className="text-sm text-muted-foreground">Receive alerts for friend requests, match invitations, rewards, and safety warnings.</p>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant={notificationStatus === 'granted' ? 'default' : 'outline'} className={notificationStatus === 'granted' ? 'bg-primary' : ''}>
                  {notificationStatus === 'granted' ? 'Enabled' : notificationStatus === 'denied' ? 'Denied' : 'Not configured'}
                </Badge>
                {notificationStatus !== 'granted' && (
                  <Button onClick={requestNotificationPermission} variant="outline" size="sm">
                    Enable
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {user.isAdmin && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Admin Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Welcome, Admin {user.username}. Here you can monitor system activity.</p>
            <div className="grid grid-cols-3 gap-4 mt-4 text-center">
              <div className="p-4 rounded bg-background border border-border">
                <div className="text-2xl font-bold text-foreground">12</div>
                <div>Active Games</div>
              </div>
              <div className="p-4 rounded bg-background border border-border">
                <div className="text-2xl font-bold text-foreground">58</div>
                <div>Players Online</div>
              </div>
              <div className="p-4 rounded bg-background border border-border">
                <div className="text-2xl font-bold text-foreground">0</div>
                <div>Reports</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
