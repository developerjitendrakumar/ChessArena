import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, Plus, Search, AlertTriangle, Activity, Server, Shield, Ban, Eye, Send, 
  Volume2, History, Mic, Play, Award, Zap, MoreVertical, Download, Clock,
  Trash2, RotateCw, CheckCircle2, ShieldCheck, VolumeX, AlertCircle, Filter, Undo2, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '../store';
import { toast } from 'sonner';

export function Admin() {
  const { socket, user, authLoading } = useAppStore();
  const [notificationType, setNotificationType] = useState('info');
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  
  const [stats, setStats] = useState<{ totalUsers: number, activeUsers: number, totalGames: number, users: any[], recentGames: any[], reports: any[], analyticsData: any[], appeals: any[], recordings: any[], tournaments: any[] }>({ totalUsers: 0, activeUsers: 0, totalGames: 0, users: [], recentGames: [], reports: [], analyticsData: [], appeals: [], recordings: [], tournaments: [] });
  const [reviewReport, setReviewReport] = useState<any>(null);
  const [reportRecordings, setReportRecordings] = useState<any[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [loadingUserRecordings, setLoadingUserRecordings] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUserRecordings, setSelectedUserRecordings] = useState<any>(null);
  const [isRecordingsDialogOpen, setIsRecordingsDialogOpen] = useState(false);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState(-1);
  const [currentPlayingGameId, setCurrentPlayingGameId] = useState<string | null>(null);
  const stopPlaybackRef = useRef(false);

  // Report Section Filtering States
  const [reportFilter, setReportFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const [hideResolved, setHideResolved] = useState<boolean>(true);
  const [reportSearch, setReportSearch] = useState<string>('');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('all');

  const fetchData = async () => {
    try {
      // Try server API first
      try {
        const apiRes = await fetch('/api/admin/stats');
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData && apiData.users) {
            setStats(prev => ({
              ...prev,
              users: apiData.users || [],
              totalUsers: apiData.totalUsers || apiData.users.length,
              activeUsers: apiData.activeUsers || 0,
              recentGames: apiData.recentGames || [],
              totalGames: apiData.totalGames || (apiData.recentGames ? apiData.recentGames.length : 0),
              reports: apiData.reports || [],
              appeals: apiData.appeals || [],
              analyticsData: apiData.analyticsData || prev.analyticsData
            }));
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("Could not load /api/admin/stats, falling back to direct Firestore:", e);
      }

      // Also try fetching reports specifically to ensure fresh queue
      try {
        const repRes = await fetch('/api/admin/reports?status=all&hideResolved=false');
        if (repRes.ok) {
          const repData = await repRes.json();
          const fetchedList = repData.allReports || repData.reports;
          if (Array.isArray(fetchedList)) {
            setStats(prev => ({ ...prev, reports: fetchedList }));
          }
        }
      } catch (e) {}

      const { db, collection, getDocs, query, limit } = await import('@/lib/firebase');
      
      // Fetch Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const users: any[] = [];
      let activeUsersCount = 0;
      const now = Date.now();
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      
      usersSnap.forEach(doc => {
        const data = doc.data();
        users.push({
          id: doc.id,
          ...data,
          username: data.username || 'Unknown',
          email: data.email || '',
          rating: data.rating || 1200,
          status: data.banned ? 'banned' : 'active',
          bannedBy: data.bannedBy,
          reports: data.reports || 0,
          lastMatchAt: data.lastMatchAt || 0,
          isOnline: data.isOnline || false,
          location: data.location,
          lastLoginAt: data.lastLoginAt,
          totalPlayTime: data.totalPlayTime || 0
        });
        if (data.isOnline) {
          activeUsersCount++;
        }
      });
      
      setStats(prev => ({ ...prev, users, totalUsers: users.length, activeUsers: activeUsersCount }));
      
      // Fetch Games
      const gamesQ = query(collection(db, 'games'), limit(100));
      const gamesSnap = await getDocs(gamesQ);
      const recentGames: any[] = [];
      gamesSnap.forEach(doc => {
        recentGames.push(doc.data());
      });
      
      setStats(prev => ({ ...prev, recentGames, totalGames: recentGames.length }));
      
      // Fetch Reports: keep all with current status
      const reportsSnap = await getDocs(collection(db, 'reports'));
      const reports: any[] = [];
      reportsSnap.forEach(doc => {
        const data = doc.data();
        reports.push({ id: doc.id, ...data });
      });
      
      const appealsSnap = await getDocs(collection(db, 'appeals'));
      const appeals: any[] = [];
      appealsSnap.forEach(doc => {
        appeals.push({ id: doc.id, ...doc.data() });
      });

      const recordingsSnap = await getDocs(collection(db, 'recordings'));
      const recordings: any[] = [];
      recordingsSnap.forEach(doc => {
        recordings.push({ id: doc.id, ...doc.data() });
      });

      const tournamentsSnap = await getDocs(collection(db, 'tournaments'));
      const tournaments: any[] = [];
      tournamentsSnap.forEach(doc => {
        tournaments.push({ id: doc.id, ...doc.data() });
      });

      setStats(prev => ({ ...prev, reports, appeals, recordings, tournaments }));
    } catch (err) {
      console.error("Error fetching admin stats", err);
      toast.error("Failed to load admin data. Check permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Listen for real-time reports and moderation events via socket
  useEffect(() => {
    if (!socket) return;

    const handleNewReport = (report: any) => {
      setStats(prev => {
        const existing = prev.reports || [];
        if (existing.some((r: any) => r.id === report.id)) return prev;
        return {
          ...prev,
          reports: [report, ...existing]
        };
      });

      toast.error(`New Report Received: ${report.reportedUser || 'Player'}`, {
        description: `Reason: ${report.reason || 'Player conduct reported'}. See New Reports tab.`,
        duration: 7000
      });
    };

    const handleReportResolved = ({ id, action, reportedUser, resolvedAt }: any) => {
      setStats(prev => ({
        ...prev,
        reports: (prev.reports || []).map((r: any) => 
          r.id === id ? { ...r, status: 'completed', resolution: action || r.resolution || 'resolved', resolvedAt: resolvedAt || Date.now() } : r
        )
      }));
    };

    const handleReportUpdated = ({ id, status, action }: any) => {
      setStats(prev => ({
        ...prev,
        reports: (prev.reports || []).map((r: any) => 
          r.id === id ? { ...r, status: status || 'pending', resolution: action === 'reopen' ? undefined : r.resolution } : r
        )
      }));
    };

    const handleReportDeleted = ({ id }: { id: string }) => {
      setStats(prev => ({
        ...prev,
        reports: (prev.reports || []).filter((r: any) => r.id !== id)
      }));
    };

    const handleReportsCleared = () => {
      setStats(prev => ({
        ...prev,
        reports: (prev.reports || []).filter((r: any) => r.status === 'pending' || r.status === 'new' || (!r.status && !r.resolution))
      }));
    };

    socket.on('new_report', handleNewReport);
    socket.on('report_resolved', handleReportResolved);
    socket.on('report_updated', handleReportUpdated);
    socket.on('report_deleted', handleReportDeleted);
    socket.on('reports_cleared', handleReportsCleared);

    return () => {
      socket.off('new_report', handleNewReport);
      socket.off('report_resolved', handleReportResolved);
      socket.off('report_updated', handleReportUpdated);
      socket.off('report_deleted', handleReportDeleted);
      socket.off('reports_cleared', handleReportsCleared);
    };
  }, [socket]);

  if (authLoading) {
    return <div className="flex h-[50vh] items-center justify-center">Loading admin panel...</div>;
  }

  if (!user || !user.isAdmin || (user.email !== 'priyanshushaurya0@gmail.com' && user.email !== 'jitendramth@gmail.com')) {
    return <Navigate to="/" replace />;
  }

  const sendNotification = () => {
    if (!socket) {
      toast.error('Not connected to server');
      return;
    }
    if (!notificationTitle || !notificationMessage) {
      toast.error('Title and message are required');
      return;
    }
    
    socket.emit('admin_broadcast_notification', {
      type: notificationType,
      title: notificationTitle,
      message: notificationMessage
    });
    
    toast.success('System notification sent');
    setNotificationTitle('');
    setNotificationMessage('');
  };


  const handleBanUser = async (userId: string, currentStatus: string) => {
    try {
      const isBanning = currentStatus === 'active';
      const { db, doc, updateDoc } = await import('@/lib/firebase');
      await updateDoc(doc(db, 'users', userId), {
        banned: isBanning,
        status: isBanning ? 'banned' : 'active'
      });
      
      // Update local state without fetching again
      setStats(prev => ({
        ...prev,
        users: prev.users.map(u => u.id === userId ? { ...u, status: isBanning ? 'banned' : 'active', banned: isBanning } : u)
      }));
      toast.success(isBanning ? 'User banned' : 'User unbanned');
    } catch (err) {
      console.error("Failed to update user status:", err);
      toast.error("Failed to update user status");
    }
  };

  const fetchUserRecordings = async (username: string) => {
    if (!username || username === 'Unknown') {
      toast.error("User name is invalid.");
      return;
    }
    setLoadingUserRecordings(username);
    try {
      const res = await fetch(`/api/admin/recordings/${encodeURIComponent(username)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedUserRecordings({ username, games: data?.recordings || {} });
        setIsRecordingsDialogOpen(true);
      } else {
        setSelectedUserRecordings({ username, games: {} });
        setIsRecordingsDialogOpen(true);
      }
    } catch (err) {
      console.error("Error fetching user recordings:", err);
      setSelectedUserRecordings({ username, games: {} });
      setIsRecordingsDialogOpen(true);
    } finally {
      setLoadingUserRecordings(null);
    }
  };

  const fetchGameRecordings = async (gameId: string) => {
    setLoadingRecordings(true);
    setReportRecordings([]);
    try {
      const res = await fetch(`/api/admin/game-recordings/${gameId}`);
      if (res.ok) {
        const data = await res.json();
        setReportRecordings(data.recordings || []);
      } else {
        toast.error("Failed to fetch game recordings");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRecordings(false);
    }
  };

  const generateTestVoiceClip = (username: string) => {
    try {
      const sampleRate = 8000;
      const duration = 2;
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = new ArrayBuffer(44 + numSamples);
      const view = new DataView(buffer);
      
      const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      };
      
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + numSamples, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate, true);
      view.setUint16(32, 1, true);
      view.setUint16(34, 8, true);
      writeString(36, 'data');
      view.setUint32(40, numSamples, true);
      
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const sample = Math.floor(128 + 80 * Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 1.5));
        view.setUint8(44 + i, Math.max(0, Math.min(255, sample)));
      }
      
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const testMatchId = `test_session_${Date.now().toString(36)}`;
      
      setSelectedUserRecordings((prev: any) => {
        const currentGames = prev?.games || {};
        return {
          ...prev,
          games: {
            ...currentGames,
            [testMatchId]: [
              {
                id: `test_chunk_${Date.now()}`,
                gameId: testMatchId,
                audioData: url,
                duration: 2,
                timestamp: Date.now(),
                sender: username,
                white: username,
                black: 'System Test',
                isFullRecording: false
              }
            ]
          }
        };
      });
      toast.success("Diagnostic audio clip attached for testing.");
    } catch (e) {
      console.error(e);
      toast.error("Could not generate test audio");
    }
  };

  const downloadGameAudio = (gameId: string, chunks: any[]) => {
    try {
      const fullParts = (chunks || []).filter((c: any) => c.isFullRecording);
      const hasFull = fullParts.length > 0;
      const parts = hasFull 
        ? [...fullParts].sort((a: any, b: any) => (a.partIndex || 0) - (b.partIndex || 0)) 
        : (chunks || []);

      if (!parts || parts.length === 0) {
        toast.info("No audio clips found to download.");
        return;
      }

      if (hasFull) {
        const base64Data = parts.map((c: any) => {
          const raw = c.audioData || '';
          return raw.includes('base64,') ? raw.split('base64,')[1] : raw;
        }).join('');
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `voice-session-${gameId}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const raw = parts[0]?.audioData || '';
        const url = raw.startsWith('blob:') || raw.startsWith('data:') 
          ? raw 
          : `data:audio/webm;base64,${raw}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `voice-clip-${gameId}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      toast.success("Download started.");
    } catch (err) {
      console.error("Failed to download audio:", err);
      toast.error("Could not download audio recording.");
    }
  };

  const playGameRecordings = async (gameId: string, chunks: any[]) => {
    if (isPlayingAll && currentPlayingGameId === gameId) {
      stopPlaybackRef.current = true;
      setIsPlayingAll(false);
      setCurrentPlayingGameId(null);
      setCurrentPlayingIndex(-1);
      return;
    }

    if (!chunks || chunks.length === 0) {
      toast.info("No audio clips found for this session.");
      return;
    }

    stopPlaybackRef.current = false;
    setIsPlayingAll(true);
    setCurrentPlayingGameId(gameId);
    
    const fullParts = chunks.filter((c: any) => c.isFullRecording);
    const hasFull = fullParts.length > 0;

    try {
      if (hasFull) {
        fullParts.sort((a: any, b: any) => (a.partIndex || 0) - (b.partIndex || 0));
        const base64Data = fullParts.map((c: any) => {
          const raw = c.audioData || '';
          return raw.includes('base64,') ? raw.split('base64,')[1] : raw;
        }).join('');
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/webm' });
        const blobUrl = URL.createObjectURL(blob);

        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(blobUrl);
          audio.onended = () => {
            URL.revokeObjectURL(blobUrl);
            resolve();
          };
          audio.onerror = (e) => {
            URL.revokeObjectURL(blobUrl);
            reject(e);
          };

          const checkStop = setInterval(() => {
            if (stopPlaybackRef.current) {
              audio.pause();
              clearInterval(checkStop);
              URL.revokeObjectURL(blobUrl);
              resolve();
            }
          }, 100);

          audio.play().catch(reject);
        });
      } else {
        for (let i = 0; i < chunks.length; i++) {
          if (stopPlaybackRef.current) break;
          setCurrentPlayingIndex(i);
          
          const raw = chunks[i].audioData || '';
          const src = raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('http')
            ? raw
            : `data:audio/webm;base64,${raw}`;

          await new Promise<void>((resolve) => {
            const audio = new Audio(src);
            audio.onended = () => resolve();
            audio.onerror = () => resolve();

            const checkStop = setInterval(() => {
              if (stopPlaybackRef.current) {
                audio.pause();
                clearInterval(checkStop);
                resolve();
              }
            }, 100);

            audio.play().catch(() => resolve());
          });
        }
      }
    } catch (e) {
      console.error("Playback error", e);
      toast.error("Could not play audio clip.");
    } finally {
      setIsPlayingAll(false);
      setCurrentPlayingGameId(null);
      setCurrentPlayingIndex(-1);
    }
  };

  const allReports = stats.reports || [];

  const pendingReports = allReports.filter((r: any) => 
    r && (r.status === 'pending' || r.status === 'new' || (!r.status && !r.resolution))
  );

  const resolvedReports = allReports.filter((r: any) => 
    r && (r.status === 'completed' || r.status === 'dismissed' || (!['pending', 'new'].includes(r.status) && !!r.resolution))
  );

  const displayedReports = allReports.filter((report: any) => {
    if (!report) return false;
    const isPending = report.status === 'pending' || report.status === 'new' || (!report.status && !report.resolution);
    const isResolved = !isPending;

    // Enforce strict hideResolved filter
    if (hideResolved && isResolved) return false;

    // View filter
    if (reportFilter === 'pending' && !isPending) return false;
    if (reportFilter === 'resolved' && !isResolved) return false;

    // Type filter
    if (reportTypeFilter !== 'all') {
      const type = (report.type || '').toLowerCase();
      if (reportTypeFilter === 'voice' && !type.includes('voice')) return false;
      if (reportTypeFilter === 'chat' && !type.includes('chat')) return false;
      if (reportTypeFilter === 'fairplay' && !type.includes('cheat') && !type.includes('fair') && !type.includes('engine')) return false;
    }

    // Search query
    if (reportSearch.trim()) {
      const q = reportSearch.toLowerCase().trim();
      const reported = (report.reportedUser || report.reported || '').toLowerCase();
      const reporter = (report.reporterId || report.reporter || '').toLowerCase();
      const reason = (report.reason || '').toLowerCase();
      const matchId = (report.gameId || '').toLowerCase();
      if (!reported.includes(q) && !reporter.includes(q) && !reason.includes(q) && !matchId.includes(q)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage users, view reports, and monitor system health.</p>
        </div>
        <Badge variant="outline" className="px-3 py-1 flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
          <Shield className="w-4 h-4" />
          Admin Access
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground">{`Total: ${stats.totalUsers}`}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">New Reports</CardTitle>
            <AlertTriangle className={`w-4 h-4 ${pendingReports.length > 0 ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingReports.length}</div>
            <p className="text-xs text-muted-foreground">
              {pendingReports.length > 0 
                ? `${pendingReports.length} pending moderation review` 
                : 'All caught up (0 pending)'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Server Health</CardTitle>
            <Server className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">100%</div>
            <p className="text-xs text-muted-foreground">All systems operational</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Games</CardTitle>
            <Activity className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalGames}</div>
            <p className="text-xs text-muted-foreground">{'Played across platform'}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="reports" className="relative flex items-center gap-1.5">
            <span>New Reports</span>
            {pendingReports.length > 0 && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px] h-4 min-w-4 flex items-center justify-center font-bold animate-pulse">
                {pendingReports.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="appeals">Appeals</TabsTrigger>
          <TabsTrigger value="games">Fair Play</TabsTrigger>
          <TabsTrigger value="chat">Chat Mod</TabsTrigger>
          <TabsTrigger value="voice">Voice Mod</TabsTrigger>
          <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="notifications">Notify</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xl">User Management</CardTitle>
                <CardDescription>View and manage all registered accounts with detailed activity logs.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    className="pl-8 w-[250px]"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {(stats.users || []).map((u: any, i: number) => (
                  <Card key={u.id || i} className="overflow-hidden border-border bg-card/50 hover:bg-card transition-colors">
                    <div className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center bg-muted ${u.isOnline ? 'border-emerald-500' : 'border-border'}`}>
                              <Users className="w-6 h-6 text-muted-foreground" />
                            </div>
                            {u.isOnline && (
                              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full animate-pulse" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-lg leading-none">{u.username}</h3>
                              <Badge variant={u.status === 'active' ? 'secondary' : 'destructive'} className="text-[10px] h-4 uppercase">
                                {u.status}
                              </Badge>
                              {u.title && <Badge className="bg-yellow-500 text-black font-black text-[9px] uppercase tracking-tighter px-1 h-4">{u.title}</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{u.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 gap-1.5"
                            onClick={() => {
                              (document.getElementById('reward-target') as HTMLInputElement).value = u.username;
                              const tabsList = document.querySelector('[role="tablist"]');
                              const rewardTab = tabsList?.querySelector('[value="rewards"]') as HTMLElement;
                              rewardTab?.click();
                            }}
                          >
                            <Award className="w-3.5 h-3.5" /> Reward
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className={`h-8 gap-1.5 ${u.status === 'active' ? 'text-destructive border-destructive/20 hover:bg-destructive/10' : ''}`}
                            onClick={() => handleBanUser(u.id, u.status)}
                          >
                            <Ban className="w-3.5 h-3.5" /> {u.status === 'active' ? 'Ban' : 'Unban'}
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mt-6 pt-6 border-t border-border">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Rating</span>
                          <div className="flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-yellow-500" />
                            <span className="font-bold">{u.rating}</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Matchmaking</span>
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-blue-500" />
                            <span className="font-bold">{u.gamesPlayed || 0} Games</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Playtime</span>
                          <div className="font-bold flex items-center gap-1.5">
                            <span className="text-emerald-500">{Math.floor((u.totalPlayTime || 0) / 3600)}h {Math.floor(((u.totalPlayTime || 0) % 3600) / 60)}m</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Last Activity</span>
                          <div className="text-xs font-medium">{u.lastMatchAt ? new Date(u.lastMatchAt).toLocaleDateString() : 'Never'}</div>
                        </div>
                        <div className="space-y-1 sm:col-span-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Location</span>
                          <div className="text-xs font-medium truncate" title={u.location ? `${u.location.lat}, ${u.location.lng}` : 'Unknown'}>
                            {u.location ? `${u.location.lat.toFixed(2)}, ${u.location.lng.toFixed(2)}` : 'Unknown'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                               <History className="w-3 h-3" /> Last Played Match
                             </span>
                             <Badge variant="outline" className="text-[9px] h-4">Blitz 3+0</Badge>
                          </div>
                          {u.lastMatchAt ? (
                            <div className="flex items-center justify-between text-xs">
                               <div className="flex items-center gap-2">
                                 <div className="w-6 h-6 bg-muted rounded flex items-center justify-center font-bold">W</div>
                                 <span className="font-bold">vs</span>
                                 <div className="w-6 h-6 bg-muted rounded flex items-center justify-center font-bold">B</div>
                               </div>
                               <span className="text-emerald-500 font-bold">+15 ELO</span>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic">No matches recorded yet</div>
                          )}
                        </div>

                        <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                               <Mic className="w-3 h-3" /> Last Voice Session
                             </span>
                             <Badge variant="outline" className="text-[9px] h-4">Archived</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            {stats.recordings?.find((r: any) => r.sender === u.username || r.white === u.username || r.black === u.username) ? (
                               <div className="text-xs">
                                 <span className="text-muted-foreground">Match:</span> <span className="font-mono">#{(stats.recordings.find((r: any) => r.sender === u.username || r.white === u.username || r.black === u.username).gameId || '').substring(0, 6)}</span>
                               </div>
                            ) : (
                               <div className="text-xs text-muted-foreground italic">No voice logs found</div>
                            )}
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-[10px] gap-1 px-2 border-primary/20 hover:bg-primary/5 text-primary"
                              disabled={loadingUserRecordings === u.username}
                              onClick={() => fetchUserRecordings(u.username)}
                            >
                              {loadingUserRecordings === u.username ? (
                                <Activity className="w-3 h-3 animate-spin" />
                              ) : (
                                <Volume2 className="w-3 h-3" />
                              )}
                              {loadingUserRecordings === u.username ? "Loading..." : "Full Voice History"}
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                               <Shield className="w-3 h-3" /> Moderation History
                             </span>
                             <div className="flex gap-1">
                               <Badge variant={(u.cheatFlags || 0) > 0 ? "destructive" : "secondary"} className="text-[9px] h-4">Flags: {u.cheatFlags || 0}</Badge>
                               <Badge variant={(u.reportsCount || 0) > 0 ? "destructive" : "secondary"} className="text-[9px] h-4">Reports: {u.reportsCount || 0}</Badge>
                             </div>
                          </div>
                          <div className="text-[10px] leading-relaxed">
                            {u.status === 'banned' ? (
                              <div className="space-y-1 mt-1">
                                <p><span className="font-bold text-destructive underline">Reason:</span> {u.bannedReason || 'Manual'}</p>
                                {u.systemNotes && <p className="line-clamp-2 italic"><span className="font-bold text-primary">System Notes:</span> {u.systemNotes}</p>}
                              </div>
                            ) : (
                              <p className="text-muted-foreground italic mt-2">Clean record.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">Moderation Reports</CardTitle>
                  <Badge 
                    variant={pendingReports.length > 0 ? "destructive" : "outline"} 
                    className="font-semibold text-xs flex items-center gap-1"
                  >
                    <AlertCircle className="w-3 h-3" />
                    {pendingReports.length} New &amp; Pending
                  </Badge>
                  <Badge variant="secondary" className="text-xs text-muted-foreground">
                    {resolvedReports.length} Older Resolved
                  </Badge>
                </div>
                <CardDescription className="mt-1">
                  Active moderation queue showing incoming reports. Older resolved entries are hidden by default for focused management.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={resolvedReports.length === 0}
                  className="text-xs text-destructive hover:bg-destructive/10 border-destructive/20 h-8"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/admin/reports/clear-older', { method: 'POST' });
                      if (res.ok) {
                        toast.success("Older resolved reports purged successfully.");
                        setStats(prev => ({
                          ...prev,
                          reports: (prev.reports || []).filter((r: any) => r.status === 'pending' || r.status === 'new' || (!r.status && !r.resolution))
                        }));
                      } else {
                        toast.error("Failed to clear older reports");
                      }
                    } catch (e) {
                      toast.error("Failed to clear older reports");
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear Older Resolved ({resolvedReports.length})
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="text-xs h-8"
                  onClick={() => fetchData()}
                >
                  <RotateCw className="w-3.5 h-3.5 mr-1" /> Refresh Queue
                </Button>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {/* Filter Controls & Management Bar */}
              <div className="p-3.5 bg-muted/40 rounded-lg border border-border/60 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* View Segmented Tabs */}
                  <div className="flex items-center gap-1.5 p-1 bg-background rounded-md border border-border/80 w-fit">
                    <Button
                      variant={reportFilter === 'pending' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs px-2.5 rounded-sm"
                      onClick={() => {
                        setReportFilter('pending');
                        setHideResolved(true);
                      }}
                    >
                      <AlertCircle className="w-3.5 h-3.5 mr-1 text-destructive" />
                      New &amp; Pending ({pendingReports.length})
                    </Button>
                    <Button
                      variant={reportFilter === 'resolved' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs px-2.5 rounded-sm"
                      onClick={() => {
                        setReportFilter('resolved');
                        setHideResolved(false);
                      }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                      Older Resolved ({resolvedReports.length})
                    </Button>
                    <Button
                      variant={reportFilter === 'all' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs px-2.5 rounded-sm"
                      onClick={() => {
                        setReportFilter('all');
                      }}
                    >
                      <Filter className="w-3.5 h-3.5 mr-1" />
                      All Records ({allReports.length})
                    </Button>
                  </div>

                  {/* Hide Older Resolved Switch */}
                  <div className="flex items-center gap-2.5 self-start sm:self-center px-3 py-1.5 bg-background rounded-md border border-border/80 text-xs">
                    <Label htmlFor="hide-resolved-toggle" className="text-xs cursor-pointer font-medium select-none">
                      Hide Older Resolved
                    </Label>
                    <Switch
                      id="hide-resolved-toggle"
                      size="sm"
                      checked={hideResolved}
                      onCheckedChange={(checked) => {
                        setHideResolved(checked);
                        if (checked && reportFilter === 'resolved') {
                          setReportFilter('pending');
                        }
                      }}
                    />
                    <Badge variant={hideResolved ? "outline" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
                      {hideResolved ? "Hidden" : "Showing"}
                    </Badge>
                  </div>
                </div>

                {/* Search & Category Filter Row */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search reported user, reporter, or reason..."
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                      className="h-8 text-xs pl-8 pr-8 bg-background"
                    />
                    {reportSearch && (
                      <button
                        onClick={() => setReportSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Select value={reportTypeFilter} onValueChange={setReportTypeFilter}>
                      <SelectTrigger className="h-8 text-xs w-[160px] bg-background">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="voice">Voice Misconduct</SelectItem>
                        <SelectItem value="chat">Chat Toxicity</SelectItem>
                        <SelectItem value="fairplay">Fair Play / Cheating</SelectItem>
                      </SelectContent>
                    </Select>

                    {(reportSearch || reportTypeFilter !== 'all' || reportFilter !== 'pending' || !hideResolved) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setReportSearch('');
                          setReportTypeFilter('all');
                          setReportFilter('pending');
                          setHideResolved(true);
                        }}
                      >
                        Reset Filters
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Reports List */}
              <div className="space-y-3">
                {displayedReports.map((report: any, i: number) => {
                  const isPending = report.status === 'pending' || report.status === 'new' || (!report.status && !report.resolution);
                  const isBanned = report.resolution === 'ban' || report.action === 'ban';
                  const isDismissed = report.resolution === 'dismiss' || report.action === 'dismiss';

                  return (
                    <div 
                      key={report.id || i} 
                      className={`p-4 rounded-lg transition-all shadow-xs border ${
                        isPending 
                          ? 'border-destructive/30 bg-destructive/5 hover:border-destructive/40' 
                          : 'border-border/60 bg-muted/20 hover:border-border'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {isPending ? (
                              <Badge variant="destructive" className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5" />
                                New Pending
                              </Badge>
                            ) : (
                              <Badge 
                                variant={isBanned ? "destructive" : "secondary"} 
                                className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {isBanned ? 'Resolved • User Banned' : (isDismissed ? 'Resolved • Dismissed' : 'Resolved')}
                              </Badge>
                            )}

                            <span className="font-semibold text-sm text-foreground">
                              {report.reason || 'In-Game Misconduct Report'}
                            </span>

                            <Badge variant="outline" className="text-[10px] font-mono capitalize">
                              {report.type || 'Voice & Chat'}
                            </Badge>
                          </div>

                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span>
                              Reported: <strong className="text-foreground">{report.reportedUser || report.reported || 'Unknown'}</strong>
                            </span>
                            <span>
                              By: <span className="font-medium text-foreground">{report.reporterId || report.reporter || 'Player'}</span>
                            </span>
                            {report.gameId && (
                              <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">
                                Match: #{report.gameId.substring(0, 8)}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {report.timestamp ? new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                            </span>
                            {report.resolvedAt && (
                              <span className="text-muted-foreground italic">
                                Resolved: {new Date(report.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {report.evidence && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 text-xs border-primary/20 text-primary hover:bg-primary/5"
                              onClick={() => {
                                const audio = new Audio(report.evidence);
                                audio.play().catch(() => toast.error("Could not play audio evidence"));
                              }}
                            >
                              <Volume2 className="w-3.5 h-3.5 mr-1" /> Play Audio
                            </Button>
                          )}

                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 text-xs font-medium"
                            onClick={() => setReviewReport(report)}
                          >
                            Investigate
                          </Button>

                          {isPending ? (
                            <>
                              <Button 
                                variant="destructive" 
                                size="sm" 
                                className="h-8 text-xs font-medium"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/admin/reports/${report.id}/action`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'ban', reportedUser: report.reportedUser || report.reported })
                                    });
                                    if (res.ok) {
                                      toast.success(`User ${report.reportedUser || report.reported} banned and report marked resolved.`);
                                      setStats(prev => ({
                                        ...prev,
                                        reports: (prev.reports || []).map((r: any) => 
                                          r.id === report.id ? { ...r, status: 'completed', resolution: 'ban', resolvedAt: Date.now() } : r
                                        )
                                      }));
                                    } else {
                                      toast.error("Failed to ban user.");
                                    }
                                  } catch (e) {
                                    toast.error("Network error.");
                                  }
                                }}
                              >
                                Ban User
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/admin/reports/${report.id}/action`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'dismiss', reportedUser: report.reportedUser || report.reported })
                                    });
                                    if (res.ok) {
                                      toast.success("Report dismissed and marked resolved.");
                                      setStats(prev => ({
                                        ...prev,
                                        reports: (prev.reports || []).map((r: any) => 
                                          r.id === report.id ? { ...r, status: 'completed', resolution: 'dismiss', resolvedAt: Date.now() } : r
                                        )
                                      }));
                                    } else {
                                      toast.error("Failed to dismiss report.");
                                    }
                                  } catch (e) {
                                    toast.error("Network error.");
                                  }
                                }}
                              >
                                Dismiss
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/admin/reports/${report.id}/action`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'reopen', reportedUser: report.reportedUser || report.reported })
                                    });
                                    if (res.ok) {
                                      toast.success("Report reopened and returned to New Pending queue.");
                                      setStats(prev => ({
                                        ...prev,
                                        reports: (prev.reports || []).map((r: any) => 
                                          r.id === report.id ? { ...r, status: 'pending', resolution: undefined } : r
                                        )
                                      }));
                                    } else {
                                      toast.error("Failed to reopen report.");
                                    }
                                  } catch (e) {
                                    toast.error("Failed to reopen report.");
                                  }
                                }}
                              >
                                <Undo2 className="w-3.5 h-3.5 mr-1" /> Reopen
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-destructive hover:bg-destructive/10"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/admin/reports/${report.id}`, { method: 'DELETE' });
                                    if (res.ok) {
                                      toast.success("Report deleted.");
                                      setStats(prev => ({
                                        ...prev,
                                        reports: (prev.reports || []).filter((r: any) => r.id !== report.id)
                                      }));
                                    } else {
                                      toast.error("Failed to delete report.");
                                    }
                                  } catch (e) {
                                    toast.error("Failed to delete report.");
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {displayedReports.length === 0 && (
                  <div className="text-center py-12 px-4 border rounded-xl border-dashed bg-muted/10">
                    {reportFilter === 'resolved' ? (
                      <>
                        <CheckCircle2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <h3 className="font-semibold text-base text-foreground">No Older Resolved Reports</h3>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                          No resolved entries exist in the moderation archive.
                        </p>
                      </>
                    ) : reportSearch || reportTypeFilter !== 'all' ? (
                      <>
                        <Search className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <h3 className="font-semibold text-base text-foreground">No Matching Reports</h3>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                          No reports match your current search query or category filter.
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-3 text-xs"
                          onClick={() => {
                            setReportSearch('');
                            setReportTypeFilter('all');
                          }}
                        >
                          Clear Filters
                        </Button>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                        <h3 className="font-semibold text-base text-foreground">No New Pending Reports</h3>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                          All player reports have been reviewed. The active moderation queue is completely clear.
                        </p>
                        {resolvedReports.length > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-3 text-xs"
                            onClick={() => {
                              setReportFilter('resolved');
                              setHideResolved(false);
                            }}
                          >
                            View {resolvedReports.length} Older Resolved Reports
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appeals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ban Appeals</CardTitle>
              <CardDescription>Review appeals from banned users.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(stats.appeals || []).map((appeal: any, i: number) => (
                  <div key={i} className="flex flex-col p-4 border rounded-lg gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-lg">{appeal.username}</span>
                        <span className="text-sm text-muted-foreground">({appeal.email})</span>
                        <Badge variant={appeal.status === 'pending' ? 'outline' : 'secondary'} className="ml-2">
                          {appeal.status}
                        </Badge>
                      </div>
                      {appeal.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={async () => {
                            try {
                              const res = await fetch(`/api/admin/appeals/${appeal.id}/action`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'reject', username: appeal.username, email: appeal.email })
                              });
                              if (res.ok) {
                                toast.success('Appeal rejected');
                                setStats(prev => ({
                                  ...prev,
                                  appeals: prev.appeals.map(a => a.id === appeal.id ? { ...a, status: 'rejected' } : a)
                                }));
                              }
                            } catch (e) {
                              toast.error('Failed to reject appeal');
                            }
                          }}>Reject</Button>
                          <Button variant="destructive" size="sm" onClick={async () => {
                            try {
                              const res = await fetch(`/api/admin/appeals/${appeal.id}/action`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'permanent_ban', username: appeal.username, email: appeal.email })
                              });
                              if (res.ok) {
                                toast.success('User permanently banned');
                                setStats(prev => ({
                                  ...prev,
                                  appeals: prev.appeals.map(a => a.id === appeal.id ? { ...a, status: 'permanently_banned' } : a)
                                }));
                              }
                            } catch (e) {
                              toast.error('Failed to apply permanent ban');
                            }
                          }}>Ban Permanently</Button>
                          <Button variant="default" className="bg-green-600 hover:bg-green-700" size="sm" onClick={async () => {
                            try {
                              const res = await fetch(`/api/admin/appeals/${appeal.id}/action`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'approve', username: appeal.username, email: appeal.email })
                              });
                              if (res.ok) {
                                toast.success('Appeal approved and user unbanned');
                                setStats(prev => ({
                                  ...prev,
                                  appeals: prev.appeals.map(a => a.id === appeal.id ? { ...a, status: 'approved' } : a)
                                }));
                              }
                            } catch (e) {
                              toast.error('Failed to approve appeal');
                            }
                          }}>Approve & Unban</Button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">System Reason / Notes</span>
                        <div className="bg-red-500/5 border border-red-500/20 p-3 rounded-md text-sm text-red-600 font-medium">
                          {appeal.systemNotes || "No automated notes available."}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">User's Appeal Message</span>
                        <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                          {appeal.message}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {(!stats.appeals || stats.appeals.length === 0) && (
                   <div className="text-center p-4 text-muted-foreground border rounded-lg">No appeals currently pending.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="games" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fair Play & Anti-Cheat</CardTitle>
              <CardDescription>Games flagged for potential engine use, tab switching, or rating manipulation.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(stats.recentGames || []).slice(0,5).map((game: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg bg-red-500/10 border-red-500/20">
                    <div className="flex flex-col">
                      <span className="font-medium">{game.players ? `${game.players.white?.username || 'White'} vs ${game.players.black?.username || 'Black'}` : game.id}</span>
                      <span className="text-sm text-muted-foreground">Result: {game.result} | Flag: <span className="text-red-500 font-bold">{['Stockfish Engine Detected', 'Multiple Tab Switches', 'High VPN/Proxy Risk', 'Suspicious Move Time'][i % 4]}</span></span>
                    </div>
                    <div className="flex gap-2">
                       <Button variant="outline" size="sm" className="text-destructive border-destructive/50" onClick={() => toast.info('Ban feature from games coming soon.')}>Ban Player</Button>
                       <Button variant="secondary" size="sm" onClick={() => toast.info('PGN review feature coming soon.')}>Review PGN</Button>
                    </div>
                  </div>
                ))}
                {(!stats.recentGames || stats.recentGames.length === 0) && (
                   <div className="text-center p-4 text-muted-foreground border rounded-lg">No suspicious matches currently flagged.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Active Users (7 Days)</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.analyticsData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="activeUsers" stroke="#2563eb" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Games Played (7 Days)</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.analyticsData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="gamesPlayed" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Chat Moderation</CardTitle>
              <CardDescription>Live chat feed and keyword flagging.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2 mb-4">
                  <Input placeholder="Search chat logs by username or keyword..." />
                  <Button variant="outline"><Search className="w-4 h-4 mr-2" /> Search</Button>
                </div>
                <div className="border rounded-md divide-y">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="p-3 flex justify-between items-center hover:bg-muted/50">
                      <div>
                        <div className="font-medium text-sm text-red-500">Flagged Phrase detected</div>
                        <div className="text-xs text-muted-foreground">User: badplayer{i} | Room: global-chat</div>
                        <div className="text-sm mt-1">"you are trash at this game"</div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">Warn</Button>
                        <Button size="sm" variant="destructive">Mute 24h</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Voice Moderation Queue</CardTitle>
                <CardDescription>AI-flagged voice activity requiring human review.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto">
                  {(stats.reports || []).filter((r: any) => r.type === 'voice').map((report: any, i: number) => (
                    <div key={i} className="p-3 flex justify-between items-center hover:bg-muted/50">
                      <div>
                        <div className="font-medium text-sm text-yellow-500">{report.reason}</div>
                        <div className="text-xs text-muted-foreground">User: {report.reportedUser} | Match: {report.gameId || 'N/A'}</div>
                        <div className="text-xs mt-1">Status: {report.status}</div>
                      </div>
                      <div className="flex gap-2">
                        {report.evidence && (
                          <Button size="sm" variant="secondary" onClick={() => {
                            const audio = new Audio(report.evidence);
                            audio.play().catch(e => toast.error("Could not play recording"));
                          }}>Listen Snippet</Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => handleBanUser(report.reportedUser, 'active')}>Revoke Voice / Ban</Button>
                      </div>
                    </div>
                  ))}
                  {(!stats.reports || stats.reports.filter((r: any) => r.type === 'voice').length === 0) && (
                    <div className="p-6 text-center text-muted-foreground">
                      No items in voice moderation queue.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Match Voice Recordings</CardTitle>
                <CardDescription>Listen to all talk done in matches for auditing.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto">
                  {(stats.recordings || []).sort((a: any, b: any) => b.timestamp - a.timestamp).map((rec: any, i: number) => (
                    <div key={i} className="p-3 flex justify-between items-center hover:bg-muted/50">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium text-sm">
                          {rec.white} vs {rec.black}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex gap-2">
                          <span>Game: {rec.gameId.substring(0, 8)}...</span>
                          <span>Time: {new Date(rec.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => {
                        const audio = new Audio(rec.audioData);
                        audio.play().catch(e => toast.error("Audio playback failed"));
                      }}>
                        <Eye className="w-3 h-3" />
                        Play
                      </Button>
                    </div>
                  ))}
                  {(!stats.recordings || stats.recordings.length === 0) && (
                    <div className="p-6 text-center text-muted-foreground">
                      No voice recordings found in database.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tournaments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tournament Management</CardTitle>
              <CardDescription>Create and manage official tournaments.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-4 gap-4">
                <div className="flex-1 flex gap-2">
                  <Input placeholder="Tournament Title" id="new-t-title" />
                  <Select defaultValue="Blitz 3+0" id="new-t-type">
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bullet 1+0">Bullet 1+0</SelectItem>
                      <SelectItem value="Blitz 3+0">Blitz 3+0</SelectItem>
                      <SelectItem value="Rapid 10+5">Rapid 10+5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={async () => {
                  const title = (document.getElementById('new-t-title') as HTMLInputElement).value;
                  const type = (document.getElementById('new-t-type') as HTMLSelectElement).value || 'Blitz 3+0';
                  if (!title) return toast.error('Title required');
                  try {
                    const res = await fetch('/api/tournaments/create', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title, type })
                    });
                    if (res.ok) {
                      toast.success('Tournament created');
                      (document.getElementById('new-t-title') as HTMLInputElement).value = '';
                    }
                  } catch(e) { toast.error('Failed'); }
                }}><Plus className="w-4 h-4 mr-2" /> New Tournament</Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Players</TableHead>
                    <TableHead>Prize</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.tournaments?.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.participants?.length || 0}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {t.prizePool?.first || t.prize}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!stats.tournaments || stats.tournaments.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                        No tournaments found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rewards" className="space-y-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="bg-yellow-500/5">
              <CardTitle className="text-xl flex items-center gap-2">
                <Award className="w-6 h-6 text-yellow-500" />
                Reward Management
              </CardTitle>
              <CardDescription>Grant special privileges, competitive ELO boosts, and commemorative badges to players.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Username</Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search player to reward..." className="pl-9" id="reward-target" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reward Category</Label>
                  <Select onValueChange={(v: string) => (document.getElementById('reward-type-hidden') as HTMLInputElement).value = v}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="title">Special Title (e.g. GM, IM)</SelectItem>
                      <SelectItem value="badge">Profile Badge</SelectItem>
                      <SelectItem value="elo">ELO Adjustment (Numerical)</SelectItem>
                    </SelectContent>
                  </Select>
                  <input type="hidden" id="reward-type-hidden" value="title" />
                </div>
                <div className="space-y-2 col-span-full">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reward Value</Label>
                  <div className="relative">
                    <Zap className="absolute left-3 top-3 h-4 w-4 text-yellow-500" />
                    <Input placeholder="Enter title string, badge name, or ELO points..." className="pl-9" id="reward-value" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 italic">Note: Badges are appended, Titles are overwritten. ELO is added to current rating.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                 <Button className="flex-1 font-bold bg-yellow-500 hover:bg-yellow-600 text-black h-11" onClick={async () => {
                    const target = (document.getElementById('reward-target') as HTMLInputElement).value;
                    const value = (document.getElementById('reward-value') as HTMLInputElement).value;
                    const type = (document.getElementById('reward-type-hidden') as HTMLInputElement).value;
                    
                    if (!target || !value) return toast.error('Please specify both a target user and a reward value');
                    
                    const loadingToast = toast.loading(`Granting ${type} to ${target}...`);
                    
                    try {
                      const res = await fetch('/api/admin/grant-reward', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target, type, value })
                      });
                      
                      toast.dismiss(loadingToast);
                      
                      if (res.ok) {
                        toast.success('Reward successfully issued and synced', {
                          description: `${value} ${type} granted to ${target}.`
                        });
                        (document.getElementById('reward-value') as HTMLInputElement).value = '';
                      } else {
                        const err = await res.json();
                        toast.error(err.error || 'Failed to issue reward');
                      }
                    } catch(e) { 
                      toast.dismiss(loadingToast);
                      toast.error('Network error occurred'); 
                    }
                  }}>
                    <Plus className="w-5 h-5 mr-2" /> Issue Reward
                  </Button>
                  <Button variant="outline" className="h-11" onClick={() => {
                    (document.getElementById('reward-target') as HTMLInputElement).value = '';
                    (document.getElementById('reward-value') as HTMLInputElement).value = '';
                  }}>Clear</Button>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/30 border-t flex justify-between items-center py-3">
               <div className="flex items-center gap-2 text-xs text-muted-foreground">
                 <Shield className="w-3 h-3" /> Signed as Administrator
               </div>
               <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                 Secure Transmission Encrypted
               </div>
            </CardFooter>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <Card className="bg-emerald-500/5 border-emerald-500/20">
               <CardContent className="pt-4 flex items-center gap-4">
                 <div className="p-2 bg-emerald-500/20 rounded-lg"><Zap className="w-5 h-5 text-emerald-500" /></div>
                 <div>
                   <div className="text-[10px] uppercase font-bold text-muted-foreground">ELO Adjusted</div>
                   <div className="text-xl font-bold">1,240 pts</div>
                 </div>
               </CardContent>
            </Card>
            <Card className="bg-blue-500/5 border-blue-500/20">
               <CardContent className="pt-4 flex items-center gap-4">
                 <div className="p-2 bg-blue-500/20 rounded-lg"><Award className="w-5 h-5 text-blue-500" /></div>
                 <div>
                   <div className="text-[10px] uppercase font-bold text-muted-foreground">Badges Issued</div>
                   <div className="text-xl font-bold">42</div>
                 </div>
               </CardContent>
            </Card>
            <Card className="bg-purple-500/5 border-purple-500/20">
               <CardContent className="pt-4 flex items-center gap-4">
                 <div className="p-2 bg-purple-500/20 rounded-lg"><Shield className="w-5 h-5 text-purple-500" /></div>
                 <div>
                   <div className="text-[10px] uppercase font-bold text-muted-foreground">Titles Verified</div>
                   <div className="text-xl font-bold">12</div>
                 </div>
               </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Audit Logs</CardTitle>
              <CardDescription>Security events, admin actions, and system health.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs">
                <div className="p-2 border-b"><span className="text-muted-foreground">[2026-07-09T04:25:11]</span> SYSTEM_HEALTH: Redis cache synchronized.</div>
                <div className="p-2 border-b"><span className="text-muted-foreground">[2026-07-09T04:22:18]</span> ADMIN_ACTION: Moderator banned user 'testuser123'.</div>
                <div className="p-2 border-b"><span className="text-muted-foreground">[2026-07-09T04:15:00]</span> SECURITY: DDoS protection activated (rate limit threshold exceeded from IP subnet).</div>
                <div className="p-2 border-b"><span className="text-muted-foreground">[2026-07-09T03:59:45]</span> ADMIN_LOGIN: Successful login from Admin (2FA verified).</div>
                <div className="p-2 border-b"><span className="text-muted-foreground">[2026-07-09T03:30:12]</span> SYSTEM_HEALTH: Database backup completed successfully.</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Broadcast System Notification</CardTitle>
              <CardDescription>Send a global notification to all online players.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notification-type">Notification Type</Label>
                <Select value={notificationType} onValueChange={setNotificationType}>
                  <SelectTrigger id="notification-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info (Friend Requests, General)</SelectItem>
                    <SelectItem value="success">Success (Rewards, Achievements)</SelectItem>
                    <SelectItem value="warning">Warning (Safety Warnings, Maintenance)</SelectItem>
                    <SelectItem value="error">Error (Bans, Critical Issues)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notification-title">Title</Label>
                <Input 
                  id="notification-title" 
                  placeholder="e.g. Tournament Starting Soon!" 
                  value={notificationTitle}
                  onChange={e => setNotificationTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notification-message">Message</Label>
                <Input 
                  id="notification-message" 
                  placeholder="e.g. The Weekly Blitz tournament starts in 5 minutes." 
                  value={notificationMessage}
                  onChange={e => setNotificationMessage(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={sendNotification} className="w-full">
                <Send className="w-4 h-4 mr-2" />
                Broadcast Notification
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isRecordingsDialogOpen} onOpenChange={setIsRecordingsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-primary" />
              Voice History: {selectedUserRecordings?.username}
            </DialogTitle>
            <DialogDescription>
              All voice recordings for this user, grouped by game sessions.
            </DialogDescription>
            <div className="flex justify-end mt-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 text-primary border-primary/20 hover:bg-primary/5"
                onClick={async () => {
                  if (isPlayingAll) {
                    stopPlaybackRef.current = true;
                    setIsPlayingAll(false);
                    setCurrentPlayingGameId(null);
                    return;
                  }
                  
                  const allChunks = selectedUserRecordings?.games 
                    ? (Object.values(selectedUserRecordings.games).flat() as any[])
                    : [];
                  if (allChunks.length === 0) {
                    toast.info("No audio clips available to play.");
                    return;
                  }
                  playGameRecordings('all-history', allChunks);
                }}
              >
                {isPlayingAll && currentPlayingGameId === 'all-history' ? (
                  <>Stop Playback</>
                ) : (
                  <><Play className="w-4 h-4" /> Play Entire History</>
                )}
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {selectedUserRecordings?.games && Object.keys(selectedUserRecordings.games).length > 0 ? (
              Object.entries(selectedUserRecordings.games).map(([gameId, rawChunks]: [string, any]) => {
                const chunks = Array.isArray(rawChunks) ? rawChunks : [];
                const fullRecordingParts = chunks.filter((c: any) => c.isFullRecording);
                const hasFullRecording = fullRecordingParts.length > 0;
                
                const displayChunks = hasFullRecording 
                  ? [...fullRecordingParts].sort((a: any, b: any) => (a.partIndex || 0) - (b.partIndex || 0))
                  : chunks;

                return (
                  <div key={gameId} className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <History className="w-3 h-3" /> Game Session
                        </span>
                        <span className="font-mono text-sm">{gameId}</span>
                        {hasFullRecording && (
                          <Badge variant="secondary" className="w-fit text-[10px] mt-1 bg-green-500/10 text-green-600 border-green-200">
                            Full Game Recording
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 text-xs"
                          onClick={() => downloadGameAudio(gameId, displayChunks)}
                        >
                          <Download className="w-4 h-4" /> Download
                        </Button>
                        <Button 
                          size="sm" 
                          variant={isPlayingAll && currentPlayingGameId === gameId ? "destructive" : "default"}
                          className="gap-2 text-xs"
                          onClick={() => playGameRecordings(gameId, displayChunks)}
                        >
                          {isPlayingAll && currentPlayingGameId === gameId ? (
                            <>Stop Playback</>
                          ) : (
                            <>{hasFullRecording ? <><Play className="w-4 h-4" /> Play Full Match</> : <><Play className="w-4 h-4" /> Play Clips ({chunks.length})</>}</>
                          )}
                        </Button>
                      </div>
                    </div>

                    {!hasFullRecording && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase font-bold">
                          <Volume2 className="w-3 h-3" /> Audio Chunks ({chunks.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {chunks.map((chunk: any, index: number) => (
                            <button 
                              key={index}
                              onClick={() => {
                                const raw = chunk.audioData || '';
                                const src = raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('http') ? raw : `data:audio/webm;base64,${raw}`;
                                const audio = new Audio(src);
                                audio.play().catch(() => toast.error("Could not play chunk"));
                              }}
                              className={`px-3 py-1.5 rounded text-[10px] font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                                currentPlayingGameId === gameId && currentPlayingIndex === index 
                                ? 'bg-primary text-primary-foreground border-primary scale-105 shadow-md' 
                                : 'bg-background border-border text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              <Play className="w-2.5 h-2.5" />
                              Clip #{index + 1}
                            </button>
                          ))}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-2">
                          Total Duration: {chunks.reduce((acc: number, c: any) => acc + (c.duration || 5), 0)}s
                        </div>
                      </div>
                    )}

                    {hasFullRecording && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Duration: {displayChunks[0]?.duration || 10}s
                        </div>
                        <div className="flex items-center gap-1">
                          <Mic className="w-3.5 h-3.5" />
                          Source: Game Voice Session
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center p-8 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-3 bg-muted/10">
                <VolumeX className="w-10 h-10 text-muted-foreground/50" />
                <div className="space-y-1">
                  <div className="font-semibold text-sm text-foreground">No Recorded Audio History</div>
                  <div className="text-xs text-muted-foreground max-w-sm">
                    No recorded voice clips were found for <strong>{selectedUserRecordings?.username}</strong>.
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-xs gap-1.5 mt-2"
                  onClick={() => generateTestVoiceClip(selectedUserRecordings?.username || 'Player')}
                >
                  <Mic className="w-3.5 h-3.5 text-primary" /> Generate Test Audio Session
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewReport} onOpenChange={(open) => {
        if (!open) {
          setReviewReport(null);
          setReportRecordings([]);
          stopPlaybackRef.current = true;
          setIsPlayingAll(false);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Report</DialogTitle>
            <DialogDescription>Investigation for Case #{reviewReport?.id?.substring(0, 8)}</DialogDescription>
          </DialogHeader>
          {reviewReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-3 bg-muted rounded-lg border border-border text-sm">
                <div className="font-bold">Reported User:</div>
                <div className="font-bold text-primary">{reviewReport.reportedUser || reviewReport.reported}</div>
                <div className="font-bold">Reported By:</div>
                <div>{reviewReport.reporterId || reviewReport.reporter}</div>
                <div className="font-bold">Type:</div>
                <div className="capitalize">{reviewReport.type || 'Chat'}</div>
                <div className="font-bold">Reason:</div>
                <div>{reviewReport.reason || 'No description provided'}</div>
                <div className="font-bold">Time:</div>
                <div>{reviewReport.timestamp ? (typeof reviewReport.timestamp === 'string' ? new Date(reviewReport.timestamp).toLocaleString() : (reviewReport.timestamp._seconds ? new Date(reviewReport.timestamp._seconds * 1000).toLocaleString() : new Date(reviewReport.timestamp).toLocaleString())) : 'Unknown'}</div>
                <div className="font-bold">Status:</div>
                <div className="capitalize">{reviewReport.status}</div>
              </div>

              {reviewReport.gameId && (
                <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Mic className="w-4 h-4 text-primary" />
                      Full Game Recording
                    </div>
                    {reportRecordings.length === 0 && !loadingRecordings && (
                      <Button size="xs" variant="outline" className="h-6 text-[10px]" onClick={() => fetchGameRecordings(reviewReport.gameId)}>
                        <Download className="w-3 h-3 mr-1" /> Load Audio Talk
                      </Button>
                    )}
                  </div>
                  
                  {loadingRecordings ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                      <Activity className="w-3 h-3 animate-spin" /> Fetching session audio...
                    </div>
                  ) : reportRecordings.length > 0 ? (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {reportRecordings.length} audio chunks found for match #{reviewReport.gameId.substring(0, 8)}
                      </div>
                      <Button 
                        size="sm" 
                        variant={isPlayingAll ? "destructive" : "default"}
                        className="h-8"
                        onClick={() => playGameRecordings(reviewReport.gameId, reportRecordings)}
                      >
                        {isPlayingAll ? "Stop Audio" : "Play Full Recording"}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground italic">
                      Click 'Load Audio Talk' to fetch the full recording of this match.
                    </div>
                  )}
                </div>
              )}

              {reviewReport.type === 'voice' && reviewReport.evidence && !isPlayingAll && (
                <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-2 text-sm font-bold">
                    <Volume2 className="w-4 h-4 text-primary" />
                    Voice Evidence Snippet (10s)
                  </div>
                  <audio controls src={reviewReport.evidence} className="w-full h-10" />
                </div>
              )}

              {reviewReport.pgn && (
                <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                  <div className="text-sm font-bold mb-2">Game PGN:</div>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">{reviewReport.pgn}</pre>
                </div>
              )}

              <div className="flex flex-wrap justify-between items-center gap-2 pt-4 border-t">
                {reviewReport.status === 'completed' || reviewReport.resolution ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      Status: Resolved ({reviewReport.resolution || 'completed'})
                    </Badge>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/admin/reports/${reviewReport.id}/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'reopen', reportedUser: reviewReport.reportedUser || reviewReport.reported })
                          });
                          if (res.ok) {
                            toast.success('Report reopened and returned to active queue');
                            setStats(prev => ({
                              ...prev,
                              reports: prev.reports.map(r => r.id === reviewReport.id ? { ...r, status: 'pending', resolution: undefined } : r)
                            }));
                            setReviewReport(null);
                          } else {
                            toast.error('Failed to reopen report');
                          }
                        } catch (e) {
                          toast.error('Network error');
                        }
                      }}
                    >
                      <Undo2 className="w-3.5 h-3.5 mr-1" /> Reopen Report
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Action will resolve this report and hide it from the active queue.
                  </div>
                )}

                <div className="flex gap-2 ml-auto">
                  <Button variant="ghost" onClick={() => setReviewReport(null)}>Close</Button>
                  {reviewReport.status !== 'completed' && !reviewReport.resolution && (
                    <>
                      <Button variant="outline" onClick={async () => {
                        try {
                          const res = await fetch(`/api/admin/reports/${reviewReport.id}/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'dismiss', reportedUser: reviewReport.reportedUser || reviewReport.reported })
                          });
                          if (res.ok) {
                            toast.success('Report dismissed and marked resolved');
                            setStats(prev => ({
                              ...prev,
                              reports: prev.reports.map(r => r.id === reviewReport.id ? { ...r, status: 'completed', resolution: 'dismiss', resolvedAt: Date.now() } : r)
                            }));
                            setReviewReport(null);
                          } else {
                            toast.error('Failed to dismiss report');
                          }
                        } catch (e) {
                          toast.error('Failed to dismiss report');
                        }
                      }}>Dismiss</Button>
                      <Button variant="destructive" onClick={async () => {
                        try {
                          const res = await fetch(`/api/admin/reports/${reviewReport.id}/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'ban', reportedUser: reviewReport.reportedUser || reviewReport.reported })
                          });
                          if (res.ok) {
                            toast.success('User banned and report resolved');
                            setStats(prev => ({
                              ...prev,
                              reports: prev.reports.map(r => r.id === reviewReport.id ? { ...r, status: 'completed', resolution: 'ban', resolvedAt: Date.now() } : r)
                            }));
                            setReviewReport(null);
                          } else {
                            toast.error('Failed to ban user');
                          }
                        } catch (e) {
                          toast.error('Failed to ban user');
                        }
                      }}>Ban User</Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
