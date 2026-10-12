import { BanModal } from '@/components/BanModal';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Home } from './pages/Home';
import { Play } from './pages/Play';
import { Dashboard } from './pages/Dashboard';
import { AuthPage } from './pages/Auth';
import { Admin } from './pages/Admin';
import { Tournaments } from './pages/Tournaments';
import { Profile } from './pages/Profile';
import { Leaderboard } from './pages/Leaderboard';
import { ReplayPage } from './pages/Replay';
import { NotificationManager } from './components/NotificationManager';
import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { Swords, LogIn, LogOut, ShieldAlert, Palette, Menu, X } from 'lucide-react';
import { auth, signOut } from './lib/firebase';

function Navigation() {
  const { user, setUser, theme, setTheme, avatarStyle, profileFrame, nameColor } = useAppStore();
  const avatarSrc = avatarStyle === 'pixel' ? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user?.username}` : avatarStyle === 'funmoji' ? `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${user?.username}` : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };
  
  const cycleTheme = () => {
    if (theme === 'dark') setTheme('light');
    else if (theme === 'light') setTheme('premium');
    else setTheme('dark');
  };

  return (
    <nav className="border-b bg-card border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link to="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-foreground">
              <img src="/logo.png" alt="ChessArena Logo" className="w-10 h-10 object-contain" />
              <span>Chess<span className="text-primary">Arena</span></span>
            </Link>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link to="/play" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-primary border-b-2 border-primary pb-5 pt-5">
                Play
              </Link>
              <Link to="/tournaments" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-5">
                Tournaments
              </Link>
              <Link to="/leaderboard" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-5">
                Leaderboard
              </Link>
              <Link to="/replay" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-5">
                Replay
              </Link>
              {user && (
                <Link to="/dashboard" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-5">
                  Dashboard
                </Link>
              )}
              {user?.isAdmin && (
                <Link to="/admin" className="inline-flex items-center gap-1 px-1 pt-1 text-sm font-medium text-destructive hover:text-destructive/80 transition-colors py-5">
                  <ShieldAlert className="w-4 h-4" />
                  Admin
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={cycleTheme} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors" title={`Current theme: ${theme}`}>
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline capitalize">{theme}</span>
            </button>
            {user ? (
              <div className="hidden sm:flex items-center gap-4 border-l border-border pl-4">
                <span className="text-sm font-medium text-foreground">
                  {user.username} ({user.rating})
                </span>
                <button onClick={handleLogout} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            ) : (
              <div className="hidden sm:block">
                <Link to="/login" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              </div>
            )}
            <div className="flex items-center sm:hidden">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-muted-foreground hover:text-foreground">
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-border bg-card">
          <div className="pt-2 pb-3 space-y-1">
            <Link to="/play" onClick={() => setMobileMenuOpen(false)} className="block pl-3 pr-4 py-2 border-l-4 border-primary text-base font-medium text-primary">Play</Link>
            <Link to="/tournaments" onClick={() => setMobileMenuOpen(false)} className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-muted-foreground hover:text-foreground hover:border-border">Tournaments</Link>
            <Link to="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-muted-foreground hover:text-foreground hover:border-border">Leaderboard</Link>
            <Link to="/replay" onClick={() => setMobileMenuOpen(false)} className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-muted-foreground hover:text-foreground hover:border-border">Replay</Link>
            {user && (
              <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-muted-foreground hover:text-foreground hover:border-border">Dashboard</Link>
            )}
            {user?.isAdmin && (
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-destructive hover:text-destructive/80 hover:border-border">Admin</Link>
            )}
          </div>
          <div className="pt-4 pb-3 border-t border-border">
            {user ? (
              <div className="px-4">
                <div className="text-base font-medium text-foreground">{user.username}</div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Rating: {user.rating}</div>
                <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80 transition-colors">
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            ) : (
              <div className="px-4">
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export default function App() {
  const { connect, setUser, theme, user, setAuthLoading, backgroundTheme } = useAppStore();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark', 'premium');
    root.classList.add(theme);
    
    // Custom background themes
    if (backgroundTheme === 'space') {
      document.body.style.backgroundImage = 'radial-gradient(circle at center, #1e1b4b 0%, #000000 100%)';
      document.body.style.color = '#fff';
    } else if (backgroundTheme === 'abstract') {
      document.body.style.backgroundImage = 'linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 75%, #f3f4f6 75%, #f3f4f6), linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 75%, #f3f4f6 75%, #f3f4f6)';
      document.body.style.backgroundSize = '20px 20px';
      document.body.style.backgroundPosition = '0 0, 10px 10px';
    } else {
      document.body.style.backgroundImage = 'none';
    }
  }, [theme]);

  useEffect(() => {
    connect();
    
    // Listen for firebase auth state changes
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        let userData: any = null;
        try {
          const { db, doc, getDoc } = await import('@/lib/firebase');
          // Timeout after 3.5s so we don't stall for 10s if client Firestore is offline
          const fetchPromise = getDoc(doc(db, 'users', firebaseUser.uid));
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore client timeout")), 3500));
          const userDoc = await Promise.race([fetchPromise, timeoutPromise]) as any;
          if (userDoc?.exists()) {
            userData = userDoc.data();
          }
        } catch (err) {
          console.warn("Firestore client fetch failed or timed out, checking server API:", err);
        }

        // Fallback to server API if client Firestore timed out or failed
        if (!userData) {
          try {
            const res = await fetch(`/api/user/profile?uid=${encodeURIComponent(firebaseUser.uid)}&email=${encodeURIComponent(firebaseUser.email || '')}`);
            if (res.ok) {
              const data = await res.json();
              if (data.user) {
                userData = data.user;
              }
            }
          } catch (serverErr) {
            console.warn("Server profile API fetch failed:", serverErr);
          }
        }

        // Final fallback to firebase auth object so user is never stuck logged out
        if (!userData) {
          userData = {
            username: firebaseUser.displayName?.replace(/\s+/g, '') || (firebaseUser.email ? firebaseUser.email.split('@')[0] : `User_${firebaseUser.uid.substring(0, 5)}`),
            email: firebaseUser.email || '',
            rating: 1200,
            isAdmin: firebaseUser.email === 'priyanshushaurya0@gmail.com' || firebaseUser.email === 'jitendramth@gmail.com',
            achievements: [
              { id: 'first_login', title: 'First Steps', icon: '♟️', description: 'Joined the platform', dateEarned: new Date().toISOString() }
            ]
          };
        }

        try {
          if (userData.banned) {
            if (userData.banExpiresAt && new Date(userData.banExpiresAt).getTime() < Date.now()) {
              try {
                const { updateDoc, doc, db } = await import('@/lib/firebase');
                await updateDoc(doc(db, 'users', firebaseUser.uid), { banned: false, banExpiresAt: null, status: 'active', bannedReason: null, bannedBy: null });
              } catch (e) {
                console.warn("Could not unban in firestore client:", e);
              }
              setUser({
                username: userData.username,
                rating: userData.rating || 1200,
                email: userData.email || firebaseUser.email || '',
                isAdmin: userData.isAdmin || userData.email === 'priyanshushaurya0@gmail.com' || userData.email === 'jitendramth@gmail.com' || firebaseUser.email === 'jitendramth@gmail.com',
                achievements: userData.achievements || []
              });
            } else {
              useAppStore.getState().setBannedStatus({
                isBanned: true,
                reason: userData.bannedReason || 'Terms of service violation',
                username: userData.username,
                email: userData.email,
                // @ts-ignore
                banExpiresAt: userData.banExpiresAt
              });
              import('@/lib/firebase').then(m => m.signOut(m.auth)).catch(console.error);
            }
          } else {
            setUser({
              uid: firebaseUser.uid,
              username: userData.username,
              rating: userData.rating || 1200,
              email: userData.email || firebaseUser.email || '',
              isAdmin: userData.isAdmin || userData.email === 'priyanshushaurya0@gmail.com' || userData.email === 'jitendramth@gmail.com' || firebaseUser.email === 'jitendramth@gmail.com',
              achievements: userData.achievements || []
            });

            // Capture location and report login
            if (firebaseUser.email) {
              navigator.geolocation.getCurrentPosition(
                async (pos) => {
                  const { latitude, longitude } = pos.coords;
                  await fetch('/api/user/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: firebaseUser.email,
                      uid: firebaseUser.uid,
                      location: { lat: latitude, lng: longitude }
                    })
                  });
                },
                async (err) => {
                  console.warn("Location permission denied or failed:", err);
                  await fetch('/api/user/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: firebaseUser.email,
                      uid: firebaseUser.uid
                    })
                  });
                }
              );
            }
          }
        } catch (err) {
          console.error("Error setting user data:", err);
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    
    return unsubscribe;
  }, [connect]);

  useEffect(() => {
    if (user && user.email && 'serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then(async (registration) => {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: 'BI61SnhN40gyLAUGFUPeViTjlWQxdeGWz6Tekexfcr-zZlSW8e5l7bQpW0Wrk5clwrUD9gjvfkdRMrPlaYdGXvk'
            });
            await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: user.email, subscription })
            });
          }
        } catch (err) {
          console.error('Push registration error:', err);
        }
      });
    }
  }, [user]);

  return (
    <Router>
      <NotificationManager />
      <BanModal />
      <div className="min-h-screen bg-background font-sans text-foreground">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/play" element={<Play />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/replay" element={<ReplayPage />} />
            <Route path="/replay/:gameId" element={<ReplayPage />} />
            <Route path="/profile/:username" element={<Profile />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}


