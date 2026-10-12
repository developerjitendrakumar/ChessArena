import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider, signInWithPopup, db, doc, setDoc, getDoc, collection, query, where, getDocs } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store';

export function AuthPage() {
  const navigate = useNavigate();
  const { setUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuthResult = async (userCredential: any) => {
    const user = userCredential.user;
    let userData: any = null;
    let isNewUser = false;

    try {
      const userRef = doc(db, 'users', user.uid);
      const getDocPromise = getDoc(userRef);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
      const userDoc = await Promise.race([getDocPromise, timeoutPromise]) as any;

      if (!userDoc || !userDoc.exists()) {
        isNewUser = true;
        let baseUsername = user.displayName ? user.displayName.replace(/\s+/g, '') : (user.email ? user.email.split('@')[0] : `User_${user.uid.substring(0, 5)}`);
        let uniqueUsername = baseUsername;
        
        try {
          const q = query(collection(db, 'users'), where('username', '==', uniqueUsername));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            uniqueUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
          }
        } catch (e) {
          // ignore query error
        }

        userData = {
          uid: user.uid,
          username: uniqueUsername,
          email: user.email,
          rating: 1200,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          fairPlayScore: 100,
          achievements: [
            { id: 'first_login', title: 'First Steps', icon: '♟️', description: 'Joined the platform', dateEarned: new Date().toISOString() }
          ],
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(userRef, userData);
        } catch (e) {
          console.warn("Client setDoc skipped/failed, server will persist:", e);
        }
      } else {
        userData = userDoc.data();
        if (!userData.achievements) {
          userData.achievements = [
            { id: 'first_login', title: 'First Steps', icon: '♟️', description: 'Joined the platform', dateEarned: new Date().toISOString() }
          ];
        }
      }
    } catch (err) {
      console.warn("Client firestore lookup encountered error, using fallback and relying on server:", err);
    }

    if (!userData) {
      const fallbackName = user.displayName ? user.displayName.replace(/\s+/g, '') : (user.email ? user.email.split('@')[0] : `User_${user.uid.substring(0, 5)}`);
      userData = {
        uid: user.uid,
        username: fallbackName,
        email: user.email,
        rating: 1200,
        achievements: [
          { id: 'first_login', title: 'First Steps', icon: '♟️', description: 'Joined the platform', dateEarned: new Date().toISOString() }
        ]
      };
    }

    setUser({
      username: userData.username,
      rating: userData.rating || 1200,
      email: userData.email,
      isAdmin: userData.isAdmin || userData.email === 'priyanshushaurya0@gmail.com' || userData.email === 'jitendramth@gmail.com',
      achievements: userData.achievements
    });
    
    // Call server to trigger welcome email, persist user in firestoreDb, and track login
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        uid: user.uid, 
        email: userData.email, 
        username: userData.username,
        isNewUser: isNewUser
      })
    }).catch(console.error);

    navigate('/dashboard');
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await handleAuthResult(result);
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError('Google Sign-In is not enabled in the Firebase Console.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completing.');
      } else if (err.message.includes('cross-origin')) {
        setError('Sign-in failed due to browser restrictions. Please open the app in a new tab.');
      } else {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="flex justify-center pt-8">
          <img src="/logo.png" alt="ChessArena Logo" className="w-20 h-20 object-contain" />
        </div>
        <CardHeader className="text-center pt-4">
          <CardTitle className="text-2xl font-bold">Welcome to ChessArena</CardTitle>
          <CardDescription>Sign in to play ranked matches</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="text-red-500 text-sm mb-4 text-center">{error}</div>}
          
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
              <path d="M1 1h22v22H1z" fill="none" />
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col items-center justify-center space-y-2 text-xs text-muted-foreground pt-4 border-t border-border/50 bg-muted/20">
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-green-500" /> Protected by Enterprise Anti-DDoS
          </div>
          <div className="flex items-center gap-1">
            <span>reCAPTCHA Bot Protection Enabled</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
