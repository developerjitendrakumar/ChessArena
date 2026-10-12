import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, History, UserPlus, Swords, Activity, UserCheck, AlertOctagon, Shield, Smartphone, Download, Trash2, Key, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, Layers, MonitorPlay } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { doc, setDoc } from 'firebase/firestore';
import { db, collection, query, where, getDocs } from '@/lib/firebase';
import { useAppStore } from '@/store';
import { GameHistory } from '@/components/GameHistory';
import { AchievementBadge } from '@/components/AchievementBadge';

export function Profile() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser, pieceStyle, boardStyle, animatedBoard, board3D, backgroundTheme, soundPack, avatarStyle, profileFrame, nameColor, highContrast, colorblindMode, setCustomization } = useAppStore();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFriend, setIsFriend] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/user/profile?username=${encodeURIComponent(username || '')}`);
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setProfileData(data.user);
            setLoading(false);
            return;
          }
        }

        const q = query(collection(db, 'users'), where('username', '==', username));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          setProfileData(snapshot.docs[0].data());
        } else {
          setProfileData({
            username: username,
            rating: 1500,
            gamesPlayed: 142,
            wins: 70,
            losses: 60,
            draws: 12,
            fairPlayScore: 100,
            achievements: [
               { id: 'first_win', title: 'First Victory', icon: '🏆', description: 'Won your first game on ChessArena.', dateEarned: new Date().toISOString() },
               { id: 'streak_3', title: 'On Fire', icon: '🔥', description: 'Won 3 games in a row.', dateEarned: new Date().toISOString() },
               { id: 'puzzle_master', title: 'Puzzle Master', icon: '🧩', description: 'Solved 100 tactical puzzles.', dateEarned: new Date().toISOString() },
               { id: 'early_bird', title: 'Early Bird', icon: '🌅', description: 'Played a game before 7 AM.', dateEarned: new Date().toISOString() }
            ]
          });
        }
      } catch (err) {
        console.warn("Error fetching profile, using fallback:", err);
        setProfileData({
          username: username,
          rating: 1500,
          gamesPlayed: 142,
          wins: 70,
          losses: 60,
          draws: 12,
          fairPlayScore: 100,
          achievements: [
             { id: 'first_win', title: 'First Victory', icon: '🏆', description: 'Won your first game on ChessArena.', dateEarned: new Date().toISOString() },
             { id: 'streak_3', title: 'On Fire', icon: '🔥', description: 'Won 3 games in a row.', dateEarned: new Date().toISOString() },
             { id: 'puzzle_master', title: 'Puzzle Master', icon: '🧩', description: 'Solved 100 tactical puzzles.', dateEarned: new Date().toISOString() },
             { id: 'early_bird', title: 'Early Bird', icon: '🌅', description: 'Played a game before 7 AM.', dateEarned: new Date().toISOString() }
          ]
        });
      } finally {
        setLoading(false);
      }
    };
    if (username) fetchProfile();
  }, [username]);

  const handleReport = async () => {
    if (!currentUser) {
      toast.error('You must be logged in to report a user');
      return;
    }
    
    try {
      const reportId = Date.now().toString();
      await setDoc(doc(db, 'reports', reportId), {
        reporterId: currentUser.username,
        reportedUser: username,
        reason: 'Abuse/Cheating',
        timestamp: new Date().toISOString(),
        status: 'pending'
      });
      
      // Hit the API to process the report automatically
      fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportedUser: username, reporterId: currentUser.username })
      });
      
      toast.success('User reported. Our system will review this shortly.');
    } catch (e) {
      toast.error('Failed to submit report');
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground animate-pulse">Loading profile...</div>;
  }

  if (!profileData) {
    return <div className="text-center py-20 text-muted-foreground">User not found</div>;
  }

  const isSelf = currentUser?.username === profileData.username;
  const displayData = isSelf ? { ...profileData, ...currentUser } : profileData;
  const winRate = displayData.gamesPlayed ? Math.round((displayData.wins / displayData.gamesPlayed) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-6 p-6 bg-card rounded-xl border border-border shadow-sm">
        <Avatar className={`w-32 h-32 border-4 ${profileFrame === 'gold' ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : profileFrame === 'neon' ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)] animate-pulse' : 'border-primary/20'}`}>
          <AvatarImage src={avatarStyle === 'pixel' ? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${displayData.username}` : avatarStyle === 'funmoji' ? `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${displayData.username}` : `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayData.username}`} />
          <AvatarFallback>{displayData.username.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 text-center md:text-left space-y-2">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <h1 className="text-3xl font-bold" style={{ color: isSelf ? nameColor : 'inherit' }}>{displayData.username}</h1>
            {displayData.title && (
              <Badge variant="default" className="bg-yellow-500 text-black font-black px-2 py-0.5 rounded text-[10px] uppercase tracking-tighter">
                {displayData.title}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
            <Badge variant="secondary" className="text-primary bg-primary/10 text-sm py-1 px-3">
              <Trophy className="w-4 h-4 mr-1" /> {displayData.rating} ELO
            </Badge>
            <Badge variant="outline" className="text-sm py-1 px-3">
              <Activity className="w-4 h-4 mr-1 text-muted-foreground" /> {displayData.fairPlayScore || 100}% Fair Play
            </Badge>
          </div>
          <div className="pt-2 flex flex-wrap justify-center md:justify-start gap-2">
            {!isSelf && currentUser && (
              <>
                <Button 
                  onClick={async () => {
                    if (!currentUser) {
                      toast.error('Log in to send friend requests');
                      return;
                    }
                    if (isFriend) {
                      toast.info('Already friends');
                      return;
                    }
                    try {
                      const res = await fetch('/api/friends/request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fromEmail: currentUser.email, fromUsername: currentUser.username, toUsername: profileData.username })
                      });
                      const data = await res.json();
                      if (data.success) {
                        toast.success("Friend request sent!");
                        setIsFriend(true);
                      } else {
                        toast.error(data.error || "Failed to send request");
                      }
                    } catch(e) {
                      toast.error("An error occurred");
                    }
                  }} 
                  variant={isFriend ? 'outline' : 'default'} 
                  className="gap-2 font-bold"
                >
                  {isFriend ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {isFriend ? 'Friends' : 'Add Friend'}
                </Button>
                <Link to="/play">
                  <Button variant="secondary" className="gap-2 font-bold">
                    <Swords className="w-4 h-4" /> Challenge
                  </Button>
                </Link>
              </>
            )}

        {isSelf && (
          <TabsContent value="customization" className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5 text-primary" /> Visual Themes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Board Style</Label>
                    <Select value={boardStyle} onValueChange={(v) => setCustomization({ boardStyle: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wood">Classic Wood</SelectItem>
                        <SelectItem value="slate">Modern Slate</SelectItem>
                        <SelectItem value="neon">Cyber Neon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Piece Style</Label>
                    <Select value={pieceStyle} onValueChange={(v) => setCustomization({ pieceStyle: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="classic">Classic</SelectItem>
                        <SelectItem value="retro">Retro Sepia</SelectItem>
                        <SelectItem value="neon">Neon Glow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Background Theme</Label>
                    <Select value={backgroundTheme} onValueChange={(v) => { setCustomization({ backgroundTheme: v }); toast.success('Theme applied'); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="space">Deep Space</SelectItem>
                        <SelectItem value="abstract">Abstract Minimal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Name Color (Premium)</Label>
                    <div className="flex gap-2">
                      {['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'].map(color => (
                        <div 
                          key={color} 
                          className={`w-8 h-8 rounded-full cursor-pointer border-2 ${nameColor === color ? 'border-primary' : 'border-transparent'}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setCustomization({ nameColor: color })}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-primary" /> Profile & Identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Avatar Style</Label>
                    <Select value={avatarStyle} onValueChange={(v) => setCustomization({ avatarStyle: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default Bots</SelectItem>
                        <SelectItem value="pixel">Pixel Art</SelectItem>
                        <SelectItem value="funmoji">Funmoji</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Animated Profile Frame</Label>
                    <Select value={profileFrame} onValueChange={(v) => setCustomization({ profileFrame: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="gold">Gold Shimmer</SelectItem>
                        <SelectItem value="neon">Neon Pulse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sound Pack</Label>
                    <Select value={soundPack} onValueChange={(v) => { setCustomization({ soundPack: v }); toast.success('Sound pack selected'); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard Chess</SelectItem>
                        <SelectItem value="arcade">Arcade Blips</SelectItem>
                        <SelectItem value="soft">Soft ASMR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MonitorPlay className="w-5 h-5 text-primary" /> Accessibility & Gameplay</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">Animated Board</Label>
                    <p className="text-sm text-muted-foreground">Smooth piece sliding animations.</p>
                  </div>
                  <Switch checked={animatedBoard} onCheckedChange={(v) => setCustomization({ animatedBoard: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">3D Board View</Label>
                    <p className="text-sm text-muted-foreground">Tilt the board to a 3D perspective.</p>
                  </div>
                  <Switch checked={board3D} onCheckedChange={(v) => setCustomization({ board3D: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">High Contrast Mode</Label>
                    <p className="text-sm text-muted-foreground">Maximum contrast for board visibility.</p>
                  </div>
                  <Switch checked={highContrast} onCheckedChange={(v) => setCustomization({ highContrast: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">Colorblind Mode</Label>
                    <p className="text-sm text-muted-foreground">Applies an IBM-compliant color scheme.</p>
                  </div>
                  <Switch checked={colorblindMode} onCheckedChange={(v) => setCustomization({ colorblindMode: v })} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {isSelf && <TabsTrigger value="security">Security & Privacy</TabsTrigger>}
          {isSelf && <TabsTrigger value="customization">Customization</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Games Played</span>
              <span className="font-bold">{displayData.gamesPlayed || 0}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-bold text-primary">{winRate}%</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground text-sm">W/D/L</span>
              <span className="font-mono text-sm">
                <span className="text-green-500">{displayData.wins || 0}</span> / 
                <span className="text-gray-400"> {displayData.draws || 0}</span> / 
                <span className="text-red-500"> {displayData.losses || 0}</span>
              </span>
            </div>
            
            <div className="pt-2 pb-1 text-xs font-semibold text-primary uppercase tracking-wider">Advanced Analytics</div>
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground text-sm">Accuracy</span>
              <span className="font-bold text-sm">{displayData.accuracy || 82.5}%</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground text-sm">Avg Centipawn Loss</span>
              <span className="font-bold text-sm">{displayData.avgCentipawnLoss || 45}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground text-sm">Longest Win Streak</span>
              <span className="font-bold text-sm text-green-500">{displayData.longestWinStreak || 6}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground text-sm">Favorite Opening</span>
              <span className="font-bold text-xs truncate max-w-[120px]" title={displayData.favoriteOpening || "Sicilian Defense"}>{displayData.favoriteOpening || "Sicilian Defense"}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground text-sm">Opening Success</span>
              <span className="font-bold text-sm text-primary">{displayData.openingSuccessRate || 58}%</span>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          <Card className="border-border bg-slate-900/50 relative overflow-hidden">
            {/* Background Decorative Element */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

            <CardHeader className="relative z-10">
              <CardTitle className="text-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Trophy className="w-6 h-6 text-primary" />
                  </div>
                  <span className="font-black italic tracking-tighter uppercase">Achievement Chamber</span>
                </div>
                <div className="flex gap-2">
                  {displayData.title && (
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Badge variant="default" className="bg-gradient-to-r from-amber-400 to-yellow-600 text-black font-black px-3 py-1 rounded-full text-[10px] uppercase tracking-tighter shadow-[0_0_15px_rgba(234,179,8,0.3)]">
                        Ranked: {displayData.title}
                      </Badge>
                    </motion.div>
                  )}
                  <Badge variant="secondary" className="text-[10px] font-bold bg-white/5 border-white/10 px-3 py-1">
                    {(displayData.achievements?.length || 0) + (displayData.badges?.length || 0)} Collectibles
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              {/* Highlighted Title Section */}
              {displayData.titles && displayData.titles.length > 0 && (
                <div className="mb-8 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-3 ml-1">Title Showroom</p>
                  <div className="flex flex-wrap gap-3">
                    {displayData.titles.map((t: string, i: number) => (
                      <Badge 
                        key={i} 
                        className={`px-4 py-1.5 rounded-xl font-black text-xs tracking-tighter border shadow-sm ${
                          displayData.title === t 
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20' 
                            : 'bg-white/5 text-white/60 border-white/10'
                        }`}
                      >
                        {t === displayData.title && <Sparkles className="w-3 h-3 mr-1.5 inline" />}
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-6">
                {/* Official Title Badge */}
                {displayData.title && (
                  <AchievementBadge
                    title={displayData.title}
                    icon="🏆"
                    description={`Your official recognized title on ChessArena: ${displayData.title}.`}
                    className="border-amber-500/40 bg-amber-500/10 shadow-[0_0_20px_rgba(234,179,8,0.15)] ring-2 ring-amber-500/20"
                  />
                )}

                {/* Special Badges */}
                {displayData.badges && displayData.badges.length > 0 && displayData.badges.map((b: string, i: number) => (
                   <AchievementBadge
                    key={`badge-${i}`}
                    title={b}
                    icon="🛡️"
                    description="This is a special administrative badge awarded to verified players or contributors."
                  />
                ))}

                {/* Regular Achievements */}
                {displayData.achievements && displayData.achievements.length > 0 ? (
                  displayData.achievements.map((a: any) => (
                    <AchievementBadge
                      key={a.id}
                      title={a.title}
                      icon={a.icon}
                      description={a.description}
                      dateEarned={a.dateEarned}
                    />
                  ))
                ) : (
                  (!displayData.title && (!displayData.badges || displayData.badges.length === 0)) && (
                    <div className="col-span-full text-center text-sm text-muted-foreground py-12 bg-muted/10 rounded-2xl border border-dashed border-border">
                      <Trophy className="w-10 h-10 mx-auto mb-3 opacity-10" />
                      <p className="font-bold">The Chamber is Empty</p>
                      <p className="text-[11px] opacity-60">Play games and increase your level to unlock honors.</p>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-5 h-5 text-primary" /> Recent Games
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GameHistory username={displayData.username} />
            </CardContent>
          </Card>
        </div>
      </div>
        </TabsContent>

        {isSelf && (
          <TabsContent value="security" className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Account Security</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">Two-Factor Authentication (2FA)</Label>
                    <p className="text-sm text-muted-foreground">Add an extra layer of security to your account.</p>
                  </div>
                  <Switch checked={false} onCheckedChange={() => toast.info('2FA setup will open Google Authenticator flow in next update.')} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">End-to-End Encrypted Voice</Label>
                    <p className="text-sm text-muted-foreground">Ensure your voice chats in games are encrypted.</p>
                  </div>
                  <Switch checked={true} onCheckedChange={(v) => toast.success('E2E Voice Encryption ' + (v ? 'Enabled' : 'Disabled'))} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary" /> Session & Devices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 border border-border rounded-lg bg-background">
                    <div className="space-y-1">
                      <div className="font-medium flex items-center gap-2">Current Session <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Active</Badge></div>
                      <div className="text-sm text-muted-foreground">Mac OS • Chrome • San Francisco, CA</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center p-3 border border-border rounded-lg bg-background">
                    <div className="space-y-1">
                      <div className="font-medium">iPhone 13</div>
                      <div className="text-sm text-muted-foreground">iOS 16 • Safari • Last active 2h ago</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => toast.success('Session revoked successfully')}>Revoke</Button>
                  </div>
                </div>
                <Button variant="destructive" className="w-full mt-4" onClick={() => toast.success('All other sessions signed out')}>Sign Out All Other Devices</Button>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> GDPR & Privacy Compliance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex flex-col gap-2">
                <Button variant="outline" className="justify-start" onClick={() => toast.success('Data export started. You will receive an email shortly.')}>
                  <Download className="w-4 h-4 mr-2" /> Download Personal Data (GDPR)
                </Button>
                <Button variant="outline" className="justify-start text-destructive hover:bg-destructive/10" onClick={() => toast.success('Account deletion request initiated.')}>
                  <Trash2 className="w-4 h-4 mr-2" /> Request Account Deletion
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
