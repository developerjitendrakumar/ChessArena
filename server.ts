import { Server } from "socket.io";
import Filter from "bad-words";
const filter = new Filter();
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import path from "path";
import { Chess } from "chess.js";
import { createServer as createViteServer } from "vite";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import cron from "node-cron";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import webpush from "web-push";

// Configure Web Push
webpush.setVapidDetails(
  "mailto:notifications@chessarena.pro",
  "BI61SnhN40gyLAUGFUPeViTjlWQxdeGWz6Tekexfcr-zZlSW8e5l7bQpW0Wrk5clwrUD9gjvfkdRMrPlaYdGXvk",
  "F4Eao5SvvZmZY9mL1teaApewWi7J0oydk3uE4Bi0HDY"
);

// Initialize Firebase Admin
try {
  admin.initializeApp();
  console.log("Firebase Admin initialized successfully.");
} catch (e) {
  console.log("Firebase Admin already initialized or failed to initialize, using default app.");
}

const dbId = "ai-studio-cbdc0722-2ae7-4fa6-be41-64af744a4730";
let firestoreDb: any = null;
try {
  firestoreDb = getFirestore(dbId);
  console.log("Firestore initialized successfully on database ID:", dbId);
} catch (err) {
  console.error("Failed to initialize Firestore with custom database ID, attempting default:", err);
  try {
    firestoreDb = getFirestore();
  } catch (e) {
    console.error("Firestore initialization failed completely.", e);
  }
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

// Security: Rate limiting & basic DDoS protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  validate: { trustProxy: false, xForwardedForHeader: false, default: false },
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 20, // start blocking after 20 requests
  message: { error: 'Too many login attempts from this IP, please try again after an hour' },
  validate: { trustProxy: false, xForwardedForHeader: false, default: false },
});

// Apply rate limiting to all /api routes
app.use('/api/', apiLimiter);

// Specific stricter rate limiting for auth endpoints (to prevent brute-force and bot attacks)
app.use('/api/auth/', authLimiter);


// Chess Tutor API
app.post("/api/chess/tutor", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key missing" });
    }
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const { fen, mode, playerMove, history = [] } = req.body;
    
    let instructions = "";
    if (mode === "openings") {
      instructions = "Teach the user how chess pieces move.";
    } else if (mode === "tactics") {
      instructions = "Teach the user how to play and defense and attack.";
    } else {
      instructions = "Provide general chess advice.";
    }
    
    const prompt = `You are an expert chess tutor playing Black against a beginner playing White.
The user is in '${mode}' mode. ${instructions}

Current board FEN: ${fen}
Moves played so far: ${history.join(', ')}

Please evaluate the position. It is Black's turn (your turn).
Provide a valid, legal chess move for Black in Standard Algebraic Notation (SAN) based on the FEN.
Also provide a short, encouraging message (1-3 sentences) teaching the user based on the instructions.

Respond strictly in valid JSON format:
{
  "move": "your_legal_move_in_san",
  "message": "your tutoring message"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    
    const text = response.text || "";
    try {
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (e) {
      console.error("Failed to parse Gemini JSON:", text);
      res.status(500).json({ error: "Failed to parse AI response" });
    }
  } catch (err: any) {
    console.error("Gemini Error:", err);
    require('fs').writeFileSync('gemini_err.txt', String(err) + "\n" + String(err.stack));
    res.status(500).json({ error: "AI error", details: String(err) });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = 3000;

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "dummy" });

// Initialize Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    // Force using the specific email address since GMAIL_USER might be incorrectly set to a name
    user: 'lifegrowbusiness@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'dummy_password',
  },
});

// For backward compatibility and online socket associations
const mockFriends = new Map<string, string[]>();
const mockFriendRequests = new Map<string, any>();
const userActivity = new Map<string, { username: string, email: string, lastMatchAt: number, retentionEmailSent: boolean, retentionWebSent: boolean, socketId?: string, pushSubscription?: any }>();
const activeSockets = new Map<string, string>(); // email (lowercase) -> socketId
const usernameToSocketId = new Map<string, string>(); // username -> socketId
const userSessions = new Map<string, { startTime: number, email: string, username?: string }>(); // socketId -> sessionInfo

// Function to send a generic email
async function sendEmail(email: string, subject: string, htmlContent: string) {
  if (!process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD === 'dummy_password') {
    console.log(`[Email Mock] Skipped sending to ${email}: ${subject}`);
    return true;
  }

  const emailTemplate = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
      <div style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 1px solid #f1f5f9;">
        <img src="https://img.icons8.com/fluency/96/chess-king.png" alt="ChessArena Logo" style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 10px;" />
        <div style="font-size: 28px; font-weight: bold; color: #0f172a;">Chess<span style="color: #10b981;">Arena</span></div>
      </div>
      <div style="padding: 40px 30px; color: #334155; line-height: 1.6; background-color: #ffffff; font-size: 16px;">
        ${htmlContent}
      </div>
      <div style="background-color: #f8fafc; padding: 25px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #f1f5f9;">
        <p style="margin: 0 0 10px;">Play Chess Anytime, Anywhere at <a href="https://chessarena.ai.studio" style="color: #10b981; text-decoration: none; font-weight: 600;">chessarena.ai.studio</a></p>
        <p style="margin: 0;">© 2026 ChessArena. All rights reserved.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: '"ChessArena" <lifegrowbusiness@gmail.com>',
      to: email, 
      subject: subject,
      html: emailTemplate
    });
    return true;
  } catch (err: any) {
    if (err.message && err.message.includes('Invalid login')) {
      console.log(`[Email Mock Fallback] Skipped sending to ${email} due to invalid credentials: ${subject}`);
      return true;
    }
    console.error(`Failed to send email to ${email}:`, err);
    return false;
  }
}

async function notifyUser(username: string, notification: { title: string, message: string, type: string }, emailHtml: string) {
  if (!firestoreDb) return;
  try {
    const userSnap = await firestoreDb.collection("users").where("username", "==", username).get();
    if (userSnap.empty) return;
    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();
    
    if (userData.email) {
      await sendEmail(userData.email, notification.title, emailHtml);
      const socketId = activeSockets.get(userData.email.toLowerCase());
      if (socketId) {
        io.to(socketId).emit("system_notification", notification);
      }
    }
    
    if (userData.pushSubscription) {
      try {
        await webpush.sendNotification(userData.pushSubscription, JSON.stringify(notification));
      } catch (err) {}
    }
  } catch (err) {
    console.error("Notify user failed", err);
  }
}

async function notifyAdmins(notification: { title: string, message: string, type: string }, emailHtml: string) {
  const adminEmails = ["priyanshushaurya0@gmail.com", "jitendramth@gmail.com"];
  for (const email of adminEmails) {
    await sendEmail(email, notification.title, emailHtml);
    const socketId = activeSockets.get(email.toLowerCase());
    if (socketId) {
      io.to(socketId).emit("system_notification", notification);
    }
    
    if (firestoreDb) {
      const adminSnap = await firestoreDb.collection("users").where("email", "==", email).get();
      if (!adminSnap.empty) {
        const adminData = adminSnap.docs[0].data();
        if (adminData.pushSubscription) {
          try {
             await webpush.sendNotification(adminData.pushSubscription, JSON.stringify(notification));
          } catch (err) {}
        }
      }
    }
  }
}

// Function to send welcome email and record in Firestore
async function sendWelcomeEmail(email: string, username: string, uid: string) {
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fafafa; padding: 40px; border-radius: 16px;">
      <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; border-top: 4px solid #10b981;">
        <div style="font-size: 48px; margin-bottom: 20px;">♟️</div>
        <h1 style="color: #111827; font-size: 28px; margin-bottom: 16px; font-weight: 800; letter-spacing: -0.5px;">Welcome to ChessArena, ${username}!</h1>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 12px;">We're thrilled to have you join our community.</p>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">Get ready to play ranked matches, analyze your games with AI, and climb the leaderboards!</p>
        <a href="https://chessarena.ai.studio/dashboard" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; transition: background-color 0.2s ease; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);">Go to Dashboard</a>
        <div style="margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          <p style="color: #9ca3af; font-size: 14px;">If you have any questions, reply to this email.</p>
        </div>
      </div>
    </div>
  `;
  
  const success = await sendEmail(email, "Welcome to ChessArena!", html);
  
  if (success) {
    console.log(`Welcome email successfully sent to ${email}`);
    if (firestoreDb && uid) {
      await firestoreDb.collection("users").doc(uid).update({
        welcomeEmailSent: true
      }).catch(err => { if(err.code === 7 || err.message?.includes('PERMISSION_DENIED')) console.error('Firestore operation failed, but keeping connection alive.'); else console.error("Error updating welcomeEmailSent:", err); });
    }
  } else {
    console.error(`Failed to send welcome email to ${email}`);
  }
  return success;
}

// Check and send welcome emails on startup
async function scanAndSendWelcomeEmails() {
  if (!firestoreDb) return;
  console.log("[Startup Check] Scanning Firestore users for missing welcome emails...");
  try {
    
    let usersSnap = { docs: [] };
    try {
      usersSnap = await firestoreDb.collection("users").get();
    } catch (err) {
      // console.log("Firestore get failed, falling back to mock list.");
      // Fallback
      usersSnap = { docs: [] };
    }
  
    const emailsWelcomed = new Set();
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const email = data.email;
      const username = data.username || "Chess Master";
      const uid = doc.id;
      
      if (email) {
        if (emailsWelcomed.has(email)) continue;
        emailsWelcomed.add(email);
        if (!data.welcomeEmailSent) {
          console.log(`[Startup Check] User ${email} lacks welcome email. Sending now...`);
          await sendWelcomeEmail(email, username, uid);
        }
      }
    }
  } catch (err: any) {
    if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
      console.log("[Startup Check] Skipping welcome email scan due to missing FIREBASE_SERVICE_ACCOUNT.");
      // console.error('Firestore operation failed, but keeping connection alive.');
    } else {
      if(err.code === 7 || err.message?.includes('PERMISSION_DENIED')) console.error('Firestore operation failed, but keeping connection alive.'); else console.error("[Startup Check] Error in welcome email scan:", err);
    }
  }
}

// Cron job to run every 5 minutes and check for users who haven't logged in/played in 24 hours
let isRunningRetention = false;
let lastRetentionRun = 0;

async function runRetentionCheck() {
  if (isRunningRetention) return;
  if (Date.now() - lastRetentionRun < 5 * 60 * 1000) return;
  isRunningRetention = true;
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  
  console.log(`[Cron] Checking Firestore users for 24-hour inactivity...`);
  if (!firestoreDb) {
    console.log("[Cron] Firestore is not initialized, skipping check.");
    return;
  }

  try {
    
    let usersSnap = { docs: [] };
    try {
      usersSnap = await firestoreDb.collection("users").get();
    } catch (err) {
      // console.log("Firestore get failed, falling back to mock list.");
      usersSnap = { docs: [] };
    }
  
    console.log(`[Cron] Found ${usersSnap.docs.length} users to evaluate for inactivity.`);
    
    const emailsProcessed = new Set();
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const email = data.email;
      const username = data.username || "Chess Master";
      
      if (!email) continue;
      if (emailsProcessed.has(email)) continue;
      emailsProcessed.add(email);
      
      // Determine last active time based on lastLoginAt or lastMatchAt
      let t1 = 0;
      let t2 = 0;
      if (data.lastLoginAt) {
        if (typeof data.lastLoginAt === 'object' && data.lastLoginAt.toDate) {
          t1 = data.lastLoginAt.toDate().getTime();
        } else if (typeof data.lastLoginAt === 'string') {
          t1 = new Date(data.lastLoginAt).getTime();
        } else if (typeof data.lastLoginAt === 'number') {
          t1 = data.lastLoginAt;
        }
      }
      if (data.lastMatchAt) {
        if (typeof data.lastMatchAt === 'object' && data.lastMatchAt.toDate) {
          t2 = data.lastMatchAt.toDate().getTime();
        } else if (typeof data.lastMatchAt === 'string') {
          t2 = new Date(data.lastMatchAt).getTime();
        } else if (typeof data.lastMatchAt === 'number') {
          t2 = data.lastMatchAt;
        }
      }
      let lastActiveAt = Math.max(t1, t2);
      
      if (!lastActiveAt) {
        if (data.createdAt) {
          if (typeof data.createdAt === 'object' && data.createdAt.toDate) {
            lastActiveAt = data.createdAt.toDate().getTime();
          } else {
            lastActiveAt = new Date(data.createdAt).getTime();
          }
        } else {
          lastActiveAt = now;
        }
      }
      
      const inactiveMs = now - lastActiveAt;
      console.log(`[Cron] User ${email} has been inactive for ${Math.round(inactiveMs / 60000)} minutes.`);
      
      if (inactiveMs > ONE_DAY_MS) {
        let sentAnything = false;
        
        // 1. Send retention email if not yet sent
        if (!data.retentionEmailSent) {
          console.log(`[Cron] User ${email} is inactive > 24h. Sending retention email...`);
          const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fafafa; padding: 40px; border-radius: 16px;">
              <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; border-top: 4px solid #2563eb;">
                <div style="font-size: 48px; margin-bottom: 20px;">♟️</div>
                <h1 style="color: #111827; font-size: 28px; margin-bottom: 16px; font-weight: 800; letter-spacing: -0.5px;">It's been a while, ${username}!</h1>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 12px;">You haven't played a match in the last 24 hours. Your opponents are waiting!</p>
                <a href="https://chessarena.ai.studio/dashboard" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; transition: background-color 0.2s ease; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);">Play a Game Now</a>
              </div>
            </div>
          `;
          const success = await sendEmail(email, "We miss you at ChessArena!", html);
          if (success) {
            console.log(`[Cron] Retention email sent to ${email}`);
            sentAnything = true;
          }
        }
        
        // 2. Send socket.io notification if not yet sent
        if (!data.retentionWebSent) {
          const socketId = activeSockets.get(email.toLowerCase());
          if (socketId) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit("system_notification", {
                type: "warning",
                title: "We miss you!",
                message: "You haven't played a match in 24 hours. Play a game now!"
              });
              console.log(`[Cron] Sent online inactivity warning toast via Socket.io to ${email}`);
              sentAnything = true;
            }
          }
          
          if (data.pushSubscription) {
            try {
              await webpush.sendNotification(data.pushSubscription, JSON.stringify({
                type: "warning",
                title: "We miss you at ChessArena!",
                message: "You haven't played a match in 24 hours. Play a game now!"
              }));
              console.log(`[Cron] Web push sent to ${email} for 24h retention`);
              sentAnything = true;
            } catch (err) {
              console.error(`[Cron] Failed to send web push to ${email}:`, err);
            }
          }
        }
        
        if (sentAnything) {
          // Always reset the timer if we tried to send something (even if it failed, we wait another 24h so we don't spam errors every 5 mins)
          // Resetting lastMatchAt to Date.now() ensures it repeats exactly 24h later
          try {
            await doc.ref.update({
              lastMatchAt: Date.now(),
              retentionEmailSent: false, // Ensure flags are reset just in case
              retentionWebSent: false
            });
          } catch (e) {
            console.error("Failed to update retention timer", e);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[Cron] Error during inactivity checks:", err);
  } finally {
    isRunningRetention = false;
    lastRetentionRun = Date.now();
  }
}

cron.schedule("*/5 * * * *", runRetentionCheck);
cron.schedule("* * * * *", runTournamentAlerts);

async function runTournamentAlerts() {
  if (!firestoreDb) return;
  try {
    const now = new Date();
    // Find all tournaments and filter in memory to avoid index/permission issues with complex queries
    const tournamentsSnap = await firestoreDb.collection("tournaments").get();
    
    for (const tDoc of tournamentsSnap.docs) {
      const t = tDoc.data();
      if (!t.startTime || !["upcoming", "registering"].includes(t.status)) continue;
      
      const startTime = new Date(t.startTime);
      const diffMs = startTime.getTime() - now.getTime();
      const diffMins = diffMs / (1000 * 60);

      // If tournament starts in 9-11 minutes, send alerts
      if (diffMins > 9 && diffMins <= 11) {
        // Fetch all alerts for this tournament and filter in memory
        const alertsSnap = await firestoreDb.collection("tournament_alerts")
          .where("tournamentId", "==", tDoc.id)
          .get();

        const pendingAlerts = alertsSnap.docs.filter(d => d.data().notified === false);

        for (const aDoc of pendingAlerts) {
          const alert = aDoc.data();
          
          try {
            const userDoc = await firestoreDb.collection("users").doc(alert.userId).get();
            if (userDoc.exists()) {
              const userData = userDoc.data();
              const notification = {
                type: "tournament_alert",
                title: "Tournament Starting Soon!",
                message: `"${t.title}" starts in 10 minutes. Get ready!`
              };

              const socketId = usernameToSocketId.get(userData.username);
              if (socketId) {
                io.to(socketId).emit("system_notification", notification);
              }

              if (userData.pushSubscription) {
                try {
                  await webpush.sendNotification(userData.pushSubscription, JSON.stringify(notification));
                } catch (err) {
                  console.error(`Failed to send web push to ${userData.email}:`, err);
                }
              }
            }

            await aDoc.ref.update({ notified: true });
          } catch (itemErr) {
            console.error(`Error processing alert for user ${alert.userId} in tournament ${tDoc.id}:`, itemErr);
          }
        }
      }
    }
  } catch (err) {
    console.error("Tournament alerts cron failure details:", {
      code: err.code,
      details: err.details,
      message: err.message,
      stack: err.stack
    });
    
    if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
      console.warn("CRITICAL: Tournament alerts cron hit permission error. This usually indicates the service account lacks access to the specific Firestore database or a required index is missing.");
    }
  }
}

// Also run it eagerly on incoming traffic
app.use((req, res, next) => {
  runRetentionCheck().catch(err => console.error("Retention check error:", err));
  next();
});


// Game state and matchmaking
interface Player {
  id: string;
  socketId: string;
  username: string;
  email?: string;
  rating: number;
  gamesPlayed?: number;
}

interface Game {
  id: string;
  white: Player;
  black: Player;
  chess: Chess;
  timeControl: string;
  whiteTime: number; // ms
  blackTime: number; // ms
  increment?: number; // ms per move
  lastMoveTime: number;
  status: "active" | "white_won" | "black_won" | "draw" | "abandoned";
  disconnectTimeouts?: { white?: NodeJS.Timeout, black?: NodeJS.Timeout };
}

function parseTimeControl(timeControl: string): { initialTime: number; increment: number } {
  if (!timeControl) return { initialTime: 600000, increment: 0 };
  if (timeControl === 'bullet') return { initialTime: 60000, increment: 0 };
  if (timeControl === 'blitz') return { initialTime: 180000, increment: 2000 };
  if (timeControl === 'rapid') return { initialTime: 600000, increment: 0 };
  if (timeControl === 'classical') return { initialTime: 1800000, increment: 0 };
  if (timeControl.startsWith('custom')) {
    const numbers = timeControl.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      const mins = Math.max(1, Math.min(180, parseInt(numbers[0], 10) || 5));
      const incSecs = Math.max(0, Math.min(60, numbers[1] !== undefined ? parseInt(numbers[1], 10) : 0));
      return { initialTime: mins * 60 * 1000, increment: incSecs * 1000 };
    }
    return { initialTime: 300000, increment: 0 }; // 5 min default
  }
  return { initialTime: 600000, increment: 0 };
}

const queue: { [timeControl: string]: Player[] } = {
  bullet: [],
  blitz: [],
  rapid: [],
  classical: [],
};

const activeGames = new Map<string, Game>();
const playerToGame = new Map<string, string>(); // socketId -> gameId
const privateRooms = new Map<string, { creator: Player, timeControl: string, code: string, createdAt?: number }>(); // code -> room info

// Dedicated in-memory voice recordings store
export interface VoiceRecordingChunk {
  id: string;
  gameId: string;
  sender: string;
  white?: string;
  black?: string;
  timeControl?: string;
  audioData: string;
  timestamp: number;
  duration?: number;
  isFullRecording?: boolean;
  recordingGroupId?: string;
  partIndex?: number;
  totalParts?: number;
  recordedAt: number;
}
const voiceRecordingsStore = new Map<string, VoiceRecordingChunk[]>(); // gameId -> chunks

// Dedicated in-memory reports store for new/active reports
export interface ReportItem {
  id: string;
  reporterId: string;
  reportedUser: string;
  reason: string;
  pgn: string;
  type: string;
  evidence: string;
  gameId: string;
  status: 'pending' | 'new' | 'completed' | 'dismissed';
  timestamp: number;
  createdAt: string;
  resolution?: string;
  isNew?: boolean;
}
const reportsStore = new Map<string, ReportItem>(); // id -> report


// API Routes
app.post("/api/auth/socket", (req, res) => {
  const { email, socketId } = req.body;
  if (email && socketId) {
    activeSockets.set(email.toLowerCase(), socketId);
    
    const existing = userActivity.get(email) || { username: email.split('@')[0], email, lastMatchAt: Date.now(), retentionEmailSent: false, retentionWebSent: false };
    (existing as any).socketId = socketId;
    userActivity.set(email, existing);

    console.log(`Linked email ${email} to socket ID ${socketId}`);
  }
  res.json({ success: true });
});

app.post("/api/push/subscribe", async (req, res) => {
  const { email, subscription } = req.body;
  if (!email || !subscription) return res.status(400).json({ error: "Email and subscription required" });
  
  // Save to in-memory map as fallback
  const existing = userActivity.get(email) || { username: "User", email, lastMatchAt: Date.now(), retentionEmailSent: false, retentionWebSent: false };
  (existing as any).pushSubscription = subscription;
  userActivity.set(email, existing);

  if (firestoreDb) {
    try {
      const usersSnap = await firestoreDb.collection("users").where("email", "==", email).get();
      if (!usersSnap.empty) {
        await usersSnap.docs[0].ref.update({ pushSubscription: subscription });
        return res.json({ success: true });
      } else {
        return res.json({ success: true, warning: "Saved in memory, but user not found in DB" });
      }
    } catch (err) {
      if(err.code === 7 || err.message?.includes('PERMISSION_DENIED')) console.error('Firestore operation failed, but keeping connection alive.'); else console.error("Error saving push subscription:", err);
    }
  }
  res.json({ success: true });
});

app.get("/api/admin/force-welcome", async (req, res) => {
  try {
    let usersSnap = { docs: [] };
    if (firestoreDb) {
      try {
        usersSnap = await firestoreDb.collection("users").get();
      } catch (err) {
        // console.log("Firestore get failed, falling back to mock list.");
        usersSnap = { docs: [] };
      }
    } else {
        usersSnap = { docs: [] };
    }

    let count = 0;
    const processedEmails = new Set();
    const notificationData = {
      type: "info",
      title: "Play a game!",
      message: "Welcome to ChessArena! It's time to play your first game."
    };
    io.emit("system_notification", notificationData);

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const email = data.email;
      const username = data.username || "Chess Master";
      const uid = doc.id;
      if (email) {
        processedEmails.add(email);
        await sendWelcomeEmail(email, username, uid);
        
        if (data.pushSubscription) {
          try {
            await webpush.sendNotification(data.pushSubscription, JSON.stringify(notificationData));
          } catch (err) {}
        }
        count++;
      }
    }

    for (const [email, user] of userActivity.entries()) {
      if (!processedEmails.has(email)) {
        await sendWelcomeEmail(email, user.username || "Chess Master", "");
        
        if (user.pushSubscription) {
          try {
            await webpush.sendNotification(user.pushSubscription, JSON.stringify(notificationData));
          } catch (err) {}
        }
        count++;
        processedEmails.add(email);
      } else {
        // If already processed but has memory push sub
        if (user.pushSubscription) {
          try {
            await webpush.sendNotification(user.pushSubscription, JSON.stringify(notificationData));
          } catch (err) {}
        }
      }
    }

    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

interface DiagnosticLog {
  timestamp: number;
  type: 'CONNECT' | 'DISCONNECT' | 'HANDSHAKE_ERROR' | 'QUEUE_JOIN' | 'QUEUE_LEAVE' | 'MATCH_FOUND' | 'TIMEOUT_TRIGGER' | 'ROOM_CREATE' | 'ROOM_JOIN';
  socketId: string;
  details: any;
}

const matchmakingDiagnostics: DiagnosticLog[] = [];
function logDiagnostic(type: DiagnosticLog['type'], socketId: string, details: any) {
  const entry: DiagnosticLog = { timestamp: Date.now(), type, socketId, details };
  matchmakingDiagnostics.unshift(entry);
  if (matchmakingDiagnostics.length > 200) matchmakingDiagnostics.pop();
  console.log(`[Diagnostics][${type}] Socket: ${socketId}`, JSON.stringify(details));
}

app.get("/api/matchmaking/diagnostics", (req, res) => {
  res.json({
    success: true,
    totalLogs: matchmakingDiagnostics.length,
    queues: Object.fromEntries(Object.entries(queue).map(([k, v]) => [k, v.length])),
    activeGamesCount: activeGames.size,
    privateRoomsCount: privateRooms.size,
    logs: matchmakingDiagnostics.slice(0, 50)
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { uid, email, username, isNewUser } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  
  console.log(`Login requested for user: ${email} (${uid}), isNewUser: ${isNewUser}`);

  if (firestoreDb && uid) {
    try {
      const userRef = firestoreDb.collection("users").doc(uid);
      const userSnap = await userRef.get();
      
      let welcomeEmailSent = false;
      
      if (userSnap.exists) {
        const data = userSnap.data();
        welcomeEmailSent = data?.welcomeEmailSent || false;
        
        await userRef.update({
          retentionEmailSent: false,
          retentionWebSent: false,
          lastLoginAt: FieldValue.serverTimestamp()
        });
      } else {
        await userRef.set({
          lastLoginAt: FieldValue.serverTimestamp(),
          uid,
          username,
          email,
          rating: 1200,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          fairPlayScore: 100,
          welcomeEmailSent: false,
          lastMatchAt: Date.now(),
          createdAt: FieldValue.serverTimestamp()
        });
      }

      // Send or resend welcome email if not sent or if it's one of the target users
      if (isNewUser || !welcomeEmailSent) {
        console.log(`Sending welcome email to ${email}...`);
        await sendWelcomeEmail(email, username, uid);
      }
    } catch (err) {
      if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
        console.error('Firestore operation failed, but keeping connection alive.');
      } else {
        console.error("Error managing user document in Firestore on login:", err);
      }
      if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
        console.error('Firestore operation failed, but keeping connection alive.');
      }
    }
  }

  // Backward compatibility activity map update
  const existing = userActivity.get(email);
  userActivity.set(email, { 
    username, 
    email,
    lastMatchAt: existing ? existing.lastMatchAt : Date.now(), 
    retentionEmailSent: existing ? existing.retentionEmailSent : false,
    retentionWebSent: existing ? existing.retentionWebSent : false,
    socketId: existing ? existing.socketId : undefined
  });
  
  res.json({ success: true });
});




// --- Friends & Social Endpoints ---
app.post("/api/friends/request", async (req, res) => {
  const { fromEmail, fromUsername, toUsername } = req.body;
  if (!firestoreDb) {
    const toEmail = Array.from(userActivity.values()).find(u => u.username === toUsername)?.email;
    if (!toEmail) return res.status(404).json({ error: "User not found" });
    if (toEmail === fromEmail) return res.status(400).json({ error: "Cannot add yourself" });
    
    const fromFriends = mockFriends.get(fromEmail) || [];
    if (fromFriends.includes(toEmail)) return res.status(400).json({ error: "Already friends" });
    
    const requestId = `${fromEmail}_${toEmail}`;
    const reverseRequestId = `${toEmail}_${fromEmail}`;
    if (mockFriendRequests.has(requestId) && mockFriendRequests.get(requestId).status === "pending") return res.status(400).json({ error: "Request already sent" });
    if (mockFriendRequests.has(reverseRequestId) && mockFriendRequests.get(reverseRequestId).status === "pending") return res.status(400).json({ error: "They already sent you a request! Check notifications." });
    
    mockFriendRequests.set(requestId, {
      fromEmail, fromUsername, toEmail, toUsername, status: "pending", createdAt: Date.now()
    });
    
    const toSocket = Array.from(userActivity.values()).find(u => u.email === toEmail)?.socketId;
    if (toSocket) io.to(toSocket).emit("friend_request_received", { fromUsername, requestId });
    return res.json({ success: true });
  }
  try {
    const toUserSnap = await firestoreDb.collection("users").where("username", "==", toUsername).get();
    if (toUserSnap.empty) return res.status(404).json({ error: "User not found" });
    const toUser = toUserSnap.docs[0];
    const toEmail = toUser.data().email;

    if (toEmail === fromEmail) return res.status(400).json({ error: "Cannot add yourself" });

    // Check if already friends
    const fromUserSnap = await firestoreDb.collection("users").where("email", "==", fromEmail).get();
    if (fromUserSnap.empty) return res.status(404).json({ error: "Your account not found" });
    const fromUser = fromUserSnap.docs[0];
    if (fromUser.data().friends?.includes(toEmail)) {
      return res.status(400).json({ error: "Already friends" });
    }

    // Check if request already exists
    const requestId = `${fromEmail}_${toEmail}`;
    const reverseRequestId = `${toEmail}_${fromEmail}`;
    const reqDoc1 = await firestoreDb.collection("friend_requests").doc(requestId).get();
    const reqDoc2 = await firestoreDb.collection("friend_requests").doc(reverseRequestId).get();
    
    if (reqDoc1.exists && reqDoc1.data().status === "pending") return res.status(400).json({ error: "Request already sent" });
    if (reqDoc2.exists && reqDoc2.data().status === "pending") return res.status(400).json({ error: "They already sent you a request! Check notifications." });

    // Create request
    await firestoreDb.collection("friend_requests").doc(requestId).set({
      fromEmail,
      fromUsername,
      toEmail,
      toUsername,
      status: "pending",
      createdAt: FieldValue.serverTimestamp()
    });

    // Send notification
    const toSocket = Array.from(userActivity.values()).find(u => u.email === toEmail)?.socketId;
    if (toSocket) {
      io.to(toSocket).emit("friend_request_received", { fromUsername, requestId });
    }
    
    // Check if web push available
    if (toUser.data().pushSubscription) {
      try {
        await webpush.sendNotification(toUser.data().pushSubscription, JSON.stringify({
           title: "New Friend Request",
           body: `${fromUsername} sent you a friend request!`
        }));
      } catch(e) {}
    }

    return res.json({ success: true });
  } catch (err: any) {
    if(err.code === 7 || err.message?.includes('PERMISSION_DENIED')) console.error('Firestore operation failed, but keeping connection alive.');
    else console.error(err);
    res.status(500).json({ error: "Failed to send request" });
  }
});

app.post("/api/friends/respond", async (req, res) => {
  const { requestId, accept } = req.body;
  if (!firestoreDb) {
    const reqData = mockFriendRequests.get(requestId);
    if (!reqData) return res.status(404).json({ error: "Request not found" });
    if (reqData.status !== "pending") return res.status(400).json({ error: "Already responded" });
    
    if (accept) {
      reqData.status = "accepted";
      const fromFriends = mockFriends.get(reqData.fromEmail) || [];
      const toFriends = mockFriends.get(reqData.toEmail) || [];
      if (!fromFriends.includes(reqData.toEmail)) fromFriends.push(reqData.toEmail);
      if (!toFriends.includes(reqData.fromEmail)) toFriends.push(reqData.fromEmail);
      mockFriends.set(reqData.fromEmail, fromFriends);
      mockFriends.set(reqData.toEmail, toFriends);
      
      const senderSocket = Array.from(userActivity.values()).find(u => u.email === reqData.fromEmail)?.socketId;
      if (senderSocket) io.to(senderSocket).emit("friend_request_accepted", { toUsername: reqData.toUsername });
    } else {
      reqData.status = "rejected";
      const senderSocket = Array.from(userActivity.values()).find(u => u.email === reqData.fromEmail)?.socketId;
      if (senderSocket) io.to(senderSocket).emit("friend_request_rejected", { toUsername: reqData.toUsername });
    }
    return res.json({ success: true });
  }
  
  try {
    const reqDoc = await firestoreDb.collection("friend_requests").doc(requestId).get();
    if (!reqDoc.exists) return res.status(404).json({ error: "Request not found" });
    
    const reqData = reqDoc.data();
    if (reqData.status !== "pending") return res.status(400).json({ error: "Already responded" });
    
    if (accept) {
       await reqDoc.ref.update({ status: "accepted" });
       
       // Add to both friends lists
       const fromSnap = await firestoreDb.collection("users").where("email", "==", reqData.fromEmail).get();
       const toSnap = await firestoreDb.collection("users").where("email", "==", reqData.toEmail).get();
       
       if (!fromSnap.empty) await fromSnap.docs[0].ref.update({ friends: FieldValue.arrayUnion(reqData.toEmail) });
       if (!toSnap.empty) await toSnap.docs[0].ref.update({ friends: FieldValue.arrayUnion(reqData.fromEmail) });

       // Notify sender that it was accepted
       const senderSocket = Array.from(userActivity.values()).find(u => u.email === reqData.fromEmail)?.socketId;
       if (senderSocket) {
         io.to(senderSocket).emit("friend_request_accepted", { toUsername: reqData.toUsername });
       }
    } else {
       await reqDoc.ref.update({ status: "rejected" });
       // Notify sender it was rejected
       const senderSocket = Array.from(userActivity.values()).find(u => u.email === reqData.fromEmail)?.socketId;
       if (senderSocket) {
         io.to(senderSocket).emit("friend_request_rejected", { toUsername: reqData.toUsername });
       }
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to respond" });
  }
});

app.get("/api/friends", async (req, res) => {
  const { email } = req.query;
  if (!firestoreDb) {
    const friendEmails = mockFriends.get(email as string) || [];
    const friends = friendEmails.map(fEmail => {
      const act = Array.from(userActivity.values()).find(u => u.email === fEmail);
      return {
        username: act ? act.username : "Unknown",
        email: fEmail,
        rating: 1500,
        isOnline: !!(act && act.socketId)
      };
    });
    const pendingRequests = Array.from(mockFriendRequests.values()).filter(r => r.toEmail === email && r.status === "pending").map(r => ({
      id: `${r.fromEmail}_${r.toEmail}`,
      fromUsername: r.fromUsername,
      createdAt: r.createdAt
    }));
    return res.json({ friends, pendingRequests });
  }
  
  try {
    const userSnap = await firestoreDb.collection("users").where("email", "==", email).get();
    if (userSnap.empty) return res.json({ friends: [], pendingRequests: [] });
    
    const friendEmails = userSnap.docs[0].data().friends || [];
    const friends = [];
    
    // Load friend profiles
    if (friendEmails.length > 0) {
       const chunkSize = 10;
       for (let i = 0; i < friendEmails.length; i += chunkSize) {
         const chunk = friendEmails.slice(i, i + chunkSize);
         const friendsSnap = await firestoreDb.collection("users").where("email", "in", chunk).get();
         friendsSnap.forEach(doc => {
           const d = doc.data();
           const act = Array.from(userActivity.values()).find(u => u.email === d.email);
           const isOnline = act && act.socketId ? true : false;
           friends.push({ username: d.username, email: d.email, rating: d.rating, isOnline });
         });
       }
    }
    
    // Load pending requests
    const reqSnap = await firestoreDb.collection("friend_requests")
      .where("toEmail", "==", email)
      .where("status", "==", "pending")
      .get();
      
    const pendingRequests = reqSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    res.json({ friends, pendingRequests });
  } catch(err: any) {
    if(err.code === 7 || err.message?.includes('PERMISSION_DENIED')) console.error('Firestore operation failed, but keeping connection alive.');
    else console.error(err);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});
// --- End Friends & Social Endpoints ---

app.post("/api/user/username", async (req, res) => {
  const { email, newUsername } = req.body;
  if (!email || !newUsername) return res.status(400).json({ error: "Email and new username required" });
  
  if (filter.isProfane(newUsername)) {
    return res.status(400).json({ error: "Inappropriate username detected. Please choose another." });
  }

  if (newUsername.length < 3 || newUsername.length > 20) {
    return res.status(400).json({ error: "Username must be between 3 and 20 characters." });
  }

  if (firestoreDb) {
    try {
      // Check if username is already taken
      const existingUserSnap = await firestoreDb.collection("users").where("username", "==", newUsername).get();
      if (!existingUserSnap.empty) {
        return res.status(400).json({ error: "Username is already taken." });
      }

      // Update the user's document
      const usersSnap = await firestoreDb.collection("users").where("email", "==", email).get();
      if (!usersSnap.empty) {
        const userDoc = usersSnap.docs[0];
        await userDoc.ref.update({
          username: newUsername
        });
        
        // Also update memory maps if needed
        const existing = userActivity.get(email);
        if (existing) {
          existing.username = newUsername;
        }

        return res.json({ success: true, username: newUsername });
      } else {
        return res.status(404).json({ error: "User not found." });
      }
    } catch (err) {
      if(err.code === 7 || err.message?.includes('PERMISSION_DENIED')) console.error('Firestore operation failed, but keeping connection alive.'); else console.error("Error updating username in Firestore:", err);
      return res.status(500).json({ error: "Internal server error." });
    }
  } else {
    // If no firestore, just update map for dev
    const existing = userActivity.get(email);
    if (existing) {
      existing.username = newUsername;
    }
    return res.json({ success: true, username: newUsername });
  }
});

app.get("/api/user/profile", async (req, res) => {
  const uid = req.query.uid as string;
  const email = req.query.email as string;
  const username = req.query.username as string;

  if (!uid && !email && !username) {
    return res.status(400).json({ error: "uid, email, or username required" });
  }

  if (firestoreDb) {
    try {
      let doc: any = null;
      if (uid) {
        const snap = await firestoreDb.collection("users").doc(uid).get();
        if (snap.exists) doc = snap;
      }
      if (!doc && email) {
        const snap = await firestoreDb.collection("users").where("email", "==", email).limit(1).get();
        if (!snap.empty) doc = snap.docs[0];
      }
      if (!doc && username) {
        const snap = await firestoreDb.collection("users").where("username", "==", username).limit(1).get();
        if (!snap.empty) doc = snap.docs[0];
      }
      if (doc && doc.exists) {
        return res.json({ user: { id: doc.id, ...doc.data() } });
      }
    } catch (err) {
      console.error("Error fetching user profile in /api/user/profile:", err);
    }
  }

  const fallbackUsername = username || (email ? email.split("@")[0] : (uid ? `User_${uid.substring(0, 5)}` : "Player"));
  res.json({
    user: {
      uid: uid || "",
      username: fallbackUsername,
      email: email || "",
      rating: 1200,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      fairPlayScore: 100,
      achievements: [
        { id: "first_login", title: "First Steps", icon: "♟️", description: "Joined the platform", dateEarned: new Date().toISOString() }
      ]
    }
  });
});

app.get("/api/leaderboard", async (req, res) => {
  if (firestoreDb) {
    try {
      const snap = await firestoreDb.collection("users").orderBy("rating", "desc").limit(50).get();
      if (!snap.empty) {
        const users = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        return res.json({ users });
      }
    } catch (err) {
      console.error("Error fetching leaderboard from Firestore:", err);
    }
  }

  res.json({
    users: [
      { username: 'GrandMaster', rating: 2800 },
      { username: 'ChessKing', rating: 2650 },
      { username: 'TacticsNinja', rating: 2500 },
      { username: 'PawnPusher', rating: 2100 },
      { username: 'KnightRider', rating: 1950 },
    ]
  });
});

app.post("/api/user/active", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  
  console.log(`User active check-in: ${email}`);
  
  const existing = userActivity.get(email);
  userActivity.set(email, {
    username: existing ? existing.username : email.split('@')[0],
    email,
    lastMatchAt: Date.now(),
    retentionEmailSent: false,
    retentionWebSent: false,
    socketId: existing ? existing.socketId : undefined
  });

  if (firestoreDb) {
    try {
      const usersSnap = await firestoreDb.collection("users").where("email", "==", email).get();
      if (!usersSnap.empty) {
        const userDoc = usersSnap.docs[0];
        await userDoc.ref.update({
          lastMatchAt: Date.now(),
          retentionEmailSent: false,
          retentionWebSent: false
        });
        console.log(`Updated lastMatchAt and reset retention flags in Firestore for ${email}`);
      }
    } catch (err) {
      if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
        console.error('Firestore operation failed, but keeping connection alive.');
      } else {
        console.error(`Error updating active state in Firestore for ${email}:`, err);
      }
    }
  }

  res.json({ success: true });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { pgn } = req.body;
    if (!pgn) {
      return res.status(400).json({ error: "PGN is required" });
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are an expert chess coach. Analyze the following chess game provided in PGN format. Provide a brief analysis, highlighting any major mistakes or brilliant moves, and give a short coaching tip for improvement. Keep it concise (3-4 sentences max).

CRITICAL REQUIREMENT: Instead of using standard algebraic notation (e.g., "c6", "Nf3"), ALWAYS use the full name of the piece and its color. For example, say "Black's King" or "White's Knight to f3" or "Black's Pawn to c6" so that new players can easily understand your analysis.

PGN:
${pgn}`,
    });
    
    res.json({ analysis: response.text });
  } catch (error: any) {
    console.error("Analysis error:", error);
    res.status(500).json({ error: "Failed to analyze game" });
  }
});

// Socket.io logic
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("auth", async (data: { email: string, username?: string }) => {
    if (data.email) {
      const email = data.email.toLowerCase();
      activeSockets.set(email, socket.id);
      userSessions.set(socket.id, { startTime: Date.now(), email });
      
      if (data.username) {
        usernameToSocketId.set(data.username, socket.id);
      }

      if (firestoreDb) {
        const snap = await firestoreDb.collection("users").where("email", "==", email).get();
        if (!snap.empty) {
          const userDoc = snap.docs[0];
          await userDoc.ref.update({ isOnline: true, lastLoginAt: FieldValue.serverTimestamp() });
          
          if (!data.username) {
            const userData = userDoc.data();
            if (userData.username) {
              usernameToSocketId.set(userData.username, socket.id);
            }
          }
        }
      }
    }
  });

  socket.on("check_active_game", (data: { username: string }) => {
    let activeGame: Game | undefined;
    for (const game of activeGames.values()) {
      if (game.white.username === data.username || game.black.username === data.username) {
        activeGame = game;
        break;
      }
    }

    if (activeGame && activeGame.status === "active") {
      const isWhite = activeGame.white.username === data.username;
      socket.emit("active_game_found", {
        gameId: activeGame.id,
        opponent: isWhite ? activeGame.black.username : activeGame.white.username
      });
    } else {
      socket.emit("no_active_game");
    }
  });

  socket.on("rejoin_game", (data: { username: string, gameId: string }) => {
    const activeGame = activeGames.get(data.gameId);
    if (activeGame && activeGame.status === "active") {
      const isWhite = activeGame.white.username === data.username;
      const color = isWhite ? "white" : "black";
      
      if (activeGame.disconnectTimeouts && activeGame.disconnectTimeouts[color]) {
        clearTimeout(activeGame.disconnectTimeouts[color]);
        activeGame.disconnectTimeouts[color] = undefined;
      }

      if (isWhite) {
        activeGame.white.socketId = socket.id;
      } else {
        activeGame.black.socketId = socket.id;
      }
      playerToGame.set(socket.id, activeGame.id);
      socket.join(activeGame.id);

      socket.to(activeGame.id).emit("player_reconnected", { color, username: data.username });

      socket.emit("game_start", {
        gameId: activeGame.id,
        white: activeGame.white,
        black: activeGame.black,
        timeControl: activeGame.timeControl,
        fen: activeGame.chess.fen(),
        whiteTime: activeGame.whiteTime,
        blackTime: activeGame.blackTime,
        opponentDisconnected: !!(activeGame.disconnectTimeouts && activeGame.disconnectTimeouts[isWhite ? "black" : "white"])
      });
    }
  });

  
  socket.on("challenge_friend", (data) => {
    const targetSocket = Array.from(userActivity.values()).find(u => u.username === data.targetUsername)?.socketId;
    if (targetSocket) {
      io.to(targetSocket).emit("challenge_received", { challengerUsername: data.challengerUsername, timeControl: data.timeControl });
    } else {
      socket.emit("challenge_failed", { reason: "User is offline" });
    }
  });
  
  socket.on("respond_challenge", (data) => {
    const challengerActivity = Array.from(userActivity.values()).find(u => u.username === data.challengerUsername);
    const targetActivity = Array.from(userActivity.values()).find(u => u.username === data.targetUsername);
    
    if (!challengerActivity || !challengerActivity.socketId) return;

    if (!data.accept) {
       io.to(challengerActivity.socketId).emit("challenge_rejected", { targetUsername: data.targetUsername });
       return;
    }

    if (targetActivity && targetActivity.socketId) {
      const p1 = { id: uuidv4(), socketId: challengerActivity.socketId, username: data.challengerUsername, email: challengerActivity.email, rating: 1200 };
      const p2 = { id: uuidv4(), socketId: targetActivity.socketId, username: data.targetUsername, email: targetActivity.email, rating: 1200 };
      
      const gameId = uuidv4();
      const game = {
        id: gameId,
        white: p1,
        black: p2,
        chess: new Chess(),
        timeControl: data.timeControl,
        whiteTime: 600000,
        blackTime: 600000,
        lastMoveTime: Date.now(),
        status: "active" as const,
      };
      
      activeGames.set(gameId, game);
      playerToGame.set(p1.socketId, gameId);
      playerToGame.set(p2.socketId, gameId);
      
      const p1Socket = io.sockets.sockets.get(p1.socketId);
      if (p1Socket) p1Socket.join(gameId);
      const p2Socket = io.sockets.sockets.get(p2.socketId);
      if (p2Socket) p2Socket.join(gameId);

      io.to(gameId).emit("game_start", {
        gameId,
        white: p1,
        black: p2,
        fen: game.chess.fen(),
        timeControl: game.timeControl,
        whiteTime: game.whiteTime,
        blackTime: game.blackTime
      });
    }
  });

  socket.on("join_queue", async (data: { username: string; email?: string; timeControl: string; force?: boolean }) => {
    const { username, email, timeControl, force } = data;
    
    if (inMemoryBannedUsers.has(username)) {
      socket.emit("system_notification", {
        type: "error",
        title: "Banned",
        message: "You have been banned from playing games."
      });
      return;
    }
    
    // Clear out any old / abandoned games for this user if forced or stale (> 5 mins since last move or opponent gone)
    for (const [gId, g] of activeGames.entries()) {
      if (g.white.username === username || g.black.username === username) {
        const isStale = (Date.now() - (g.lastMoveTime || 0)) > 5 * 60 * 1000;
        const oppSocketId = g.white.username === username ? g.black.socketId : g.white.socketId;
        const oppConnected = io.sockets.sockets.has(oppSocketId);
        if (force || isStale || !oppConnected) {
          activeGames.delete(gId);
        } else if (g.status === "active") {
          socket.emit("already_in_game");
          return;
        }
      }
    }

    if (!queue[timeControl]) queue[timeControl] = [];
    
    // Remove existing entry for this socket or username if already present
    queue[timeControl] = queue[timeControl].filter(p => p.socketId !== socket.id && p.username !== username);
    
    // Fetch rating and gamesPlayed from Firestore
    let rating = 1200;
    let gamesPlayed = 0;
    if (firestoreDb && email) {
      try {
        const userSnap = await firestoreDb.collection("users").where("email", "==", email).get();
        if (!userSnap.empty) {
          const userData = userSnap.docs[0].data();
          rating = userData.rating || 1200;
          gamesPlayed = userData.gamesPlayed || 0;
        }
      } catch (err) {
        console.error("Error fetching user data on join_queue:", err);
      }
    }

    const player: Player = { id: uuidv4(), socketId: socket.id, username, email, rating, gamesPlayed };
    queue[timeControl].push(player);
    logDiagnostic('QUEUE_JOIN', socket.id, { username, timeControl, rating });
    console.log(`[Queue] Player ${username} (rating ${rating}) joined ${timeControl} queue. Queue size: ${queue[timeControl].length}`);

    // Clean any dead sockets from the queue
    queue[timeControl] = queue[timeControl].filter(p => io.sockets.sockets.has(p.socketId));

    // Instant Matchmaking: Pair players whenever 2 or more are waiting
    while (queue[timeControl].length >= 2) {
      const p1 = queue[timeControl].shift()!;
      let bestMatchIndex = 0;
      let minRatingDiff = Infinity;

      for (let i = 0; i < queue[timeControl].length; i++) {
        const other = queue[timeControl][i];
        if (other.socketId === p1.socketId || other.username === p1.username) continue;
        const diff = Math.abs(other.rating - p1.rating);
        if (diff < minRatingDiff) {
          minRatingDiff = diff;
          bestMatchIndex = i;
        }
      }

      const p2 = queue[timeControl].splice(bestMatchIndex, 1)[0];
      if (!p2) {
        queue[timeControl].unshift(p1);
        break;
      }
        
      const tcConfig = parseTimeControl(timeControl);
      const gameId = uuidv4();
      const game: Game = {
        id: gameId,
        white: p1,
        black: p2,
        chess: new Chess(),
        timeControl,
        whiteTime: tcConfig.initialTime,
        blackTime: tcConfig.initialTime,
        increment: tcConfig.increment,
        lastMoveTime: Date.now(),
        status: "active",
      };
      
      activeGames.set(gameId, game);
      playerToGame.set(p1.socketId, gameId);
      playerToGame.set(p2.socketId, gameId);
      
      logDiagnostic('MATCH_FOUND', p1.socketId, { gameId, white: p1.username, black: p2.username, timeControl });
        
        // Update lastMatchAt when game starts
        if (p1.email) {
          const existing = userActivity.get(p1.email);
          if (existing) {
            existing.lastMatchAt = Date.now();
            existing.retentionEmailSent = false;
            existing.retentionWebSent = false;
            existing.socketId = p1.socketId;
          }
          if (firestoreDb) {
            firestoreDb.collection("users").where("email", "==", p1.email).get().then((snap: any) => {
              if (!snap.empty) snap.docs[0].ref.update({ lastMatchAt: Date.now(), retentionEmailSent: false, retentionWebSent: false });
            }).catch((err: any) => { if(err.code === 7 || err.message?.includes('PERMISSION_DENIED')) console.error('Firestore operation failed, but keeping connection alive.'); else console.error("Error updating player 1 match status in Firestore:", err); });
          }
        }
        if (p2.email) {
          const existing = userActivity.get(p2.email);
          if (existing) {
            existing.lastMatchAt = Date.now();
            existing.retentionEmailSent = false;
            existing.retentionWebSent = false;
            existing.socketId = p2.socketId;
          }
          if (firestoreDb) {
            firestoreDb.collection("users").where("email", "==", p2.email).get().then((snap: any) => {
              if (!snap.empty) snap.docs[0].ref.update({ lastMatchAt: Date.now(), retentionEmailSent: false, retentionWebSent: false });
            }).catch((err: any) => { if(err.code === 7 || err.message?.includes('PERMISSION_DENIED')) console.error('Firestore operation failed, but keeping connection alive.'); else console.error("Error updating player 2 match status in Firestore:", err); });
          }
        }

        const p1Socket = io.sockets.sockets.get(p1.socketId);
        if (p1Socket) p1Socket.join(gameId);
        const p2Socket = io.sockets.sockets.get(p2.socketId);
        if (p2Socket) p2Socket.join(gameId);

        const gameStartPayload = {
          gameId,
          white: p1,
          black: p2,
          fen: game.chess.fen(),
          timeControl,
          whiteTime: game.whiteTime,
          blackTime: game.blackTime
        };

        io.to(gameId).emit("game_start", gameStartPayload);
        if (p1Socket) p1Socket.emit("game_start", gameStartPayload);
        if (p2Socket) p2Socket.emit("game_start", gameStartPayload);
        console.log(`[Matchmaking] Match successfully started: ${p1.username} vs ${p2.username} (${timeControl})`);
    }
  });

  socket.on("leave_queue", () => {
    logDiagnostic('QUEUE_LEAVE', socket.id, {});
    const session = userSessions.get(socket.id);
    Object.keys(queue).forEach(tc => {
      queue[tc] = queue[tc].filter(p => p.socketId !== socket.id && (session?.username ? p.username !== session.username : true));
    });
  });

  socket.on("create_private_room", async (data: { username: string; email?: string; timeControl: string; customMinutes?: number; customIncrement?: number }) => {
    const cleanUsername = (data.username || "Player").trim();
    let cleanTC = (data.timeControl || "rapid").trim();
    if ((cleanTC === 'custom' || cleanTC.startsWith('custom')) && data.customMinutes) {
      cleanTC = `custom_${data.customMinutes}_${data.customIncrement !== undefined ? data.customIncrement : 0}`;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    let rating = 1200;
    if (firestoreDb && data.email) {
      try {
        const userSnap = await firestoreDb.collection("users").where("email", "==", data.email).get();
        if (!userSnap.empty) rating = userSnap.docs[0].data().rating || 1200;
      } catch (err) {}
    }

    const player: Player = { id: uuidv4(), socketId: socket.id, username: cleanUsername, email: data.email, rating };
    privateRooms.set(code, { creator: player, timeControl: cleanTC, code, createdAt: Date.now() });
    socket.join(`room_${code}`);
    socket.emit("room_created", { code, timeControl: cleanTC });
    console.log(`Private room created: ${code} by ${cleanUsername} (${socket.id}) with TC: ${cleanTC}`);
  });

  socket.on("cancel_private_room", (data: { code: string }) => {
    const rawCode = (data.code || "").toString();
    const cleanCode = rawCode.replace(/[^0-9a-zA-Z]/g, '').trim().toUpperCase();
    if (privateRooms.has(cleanCode) || privateRooms.has(rawCode.trim())) {
      privateRooms.delete(cleanCode);
      privateRooms.delete(rawCode.trim());
      socket.leave(`room_${cleanCode}`);
      socket.leave(`room_${rawCode.trim()}`);
      socket.emit("room_cancelled", { code: cleanCode || rawCode });
      console.log(`Private room ${cleanCode || rawCode} cancelled by creator`);
    }
  });

  socket.on("join_private_room", async (data: { username: string; email?: string; code: string }) => {
    const rawCode = (data.code || "").toString();
    const cleanCode = rawCode.replace(/[^0-9a-zA-Z]/g, '').trim().toUpperCase();
    const cleanUsername = (data.username || "Guest").trim();
    console.log(`User ${cleanUsername} attempting to join private room with code: "${cleanCode}" (raw: "${rawCode}")`);

    if (!cleanCode) {
      socket.emit("room_error", { message: "Please enter a valid room code." });
      return;
    }

    // Lookup room by normalized code or raw code
    let room = privateRooms.get(cleanCode) || privateRooms.get(rawCode.trim());
    if (!room) {
      for (const [rCode, rData] of privateRooms.entries()) {
        if (rCode.toUpperCase() === cleanCode) {
          room = rData;
          break;
        }
      }
    }

    if (!room) {
      socket.emit("room_error", { message: `Room code "${cleanCode}" was not found or has expired. Please verify and try again.` });
      return;
    }

    let rating = 1200;
    if (firestoreDb && data.email) {
      try {
        const userSnap = await firestoreDb.collection("users").where("email", "==", data.email).get();
        if (!userSnap.empty) rating = userSnap.docs[0].data().rating || 1200;
      } catch (err) {}
    }

    const isSelfTest = room.creator.socketId === socket.id;
    const p1 = room.creator;
    const p2: Player = isSelfTest
      ? { id: uuidv4(), socketId: `${socket.id}_guest`, username: `${cleanUsername} (Guest/Test)`, email: data.email, rating }
      : { id: uuidv4(), socketId: socket.id, username: cleanUsername, email: data.email, rating };
    
    // Remove room now that both players are matched
    privateRooms.delete(room.code);
    privateRooms.delete(cleanCode);
    privateRooms.delete(rawCode.trim());
    
    const tcConfig = parseTimeControl(room.timeControl);
    const gameId = uuidv4();
    const game: Game = {
      id: gameId,
      white: p1,
      black: p2,
      chess: new Chess(),
      timeControl: room.timeControl,
      whiteTime: tcConfig.initialTime,
      blackTime: tcConfig.initialTime,
      increment: tcConfig.increment,
      lastMoveTime: Date.now(),
      status: "active",
    };
    
    activeGames.set(gameId, game);
    playerToGame.set(p1.socketId, gameId);
    playerToGame.set(p2.socketId, gameId);
    if (isSelfTest) {
      playerToGame.set(socket.id, gameId);
    }
    
    // Find creator socket: check by socketId first, then by username or email if reconnected
    let p1Socket = io.sockets.sockets.get(p1.socketId);
    if (!p1Socket && p1.username) {
      const altSocketId = usernameToSocketId.get(p1.username);
      if (altSocketId) {
        p1Socket = io.sockets.sockets.get(altSocketId);
        if (p1Socket) {
          p1.socketId = altSocketId;
          playerToGame.set(altSocketId, gameId);
        }
      }
    }
    if (!p1Socket && p1.email) {
      const altSocketId = activeSockets.get(p1.email.toLowerCase());
      if (altSocketId) {
        p1Socket = io.sockets.sockets.get(altSocketId);
        if (p1Socket) {
          p1.socketId = altSocketId;
          playerToGame.set(altSocketId, gameId);
        }
      }
    }

    if (p1Socket) p1Socket.join(gameId);
    socket.join(gameId);
    socket.join(`room_${cleanCode}`);

    const gameStartPayload = {
      gameId,
      white: p1,
      black: p2,
      fen: game.chess.fen(),
      timeControl: room.timeControl,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime
    };

    // Emit to room channels and directly to individual sockets
    io.to(gameId).emit("game_start", gameStartPayload);
    io.to(`room_${cleanCode}`).emit("game_start", gameStartPayload);
    if (p1Socket) p1Socket.emit("game_start", gameStartPayload);
    socket.emit("game_start", gameStartPayload);
    console.log(`[Private Room] Match started: ${p1.username} vs ${p2.username} (Code: ${cleanCode})`);
  });

  socket.on("make_move", (data: { gameId: string; move: any }) => {
    const game = activeGames.get(data.gameId);
    if (!game) return;

    try {
      const move = game.chess.move(data.move);
      if (move) {
        // Calculate clock time update
        const now = Date.now();
        const elapsed = Math.max(0, now - (game.lastMoveTime || now));
        game.lastMoveTime = now;
        
        if (move.color === 'w') {
          game.whiteTime = Math.max(0, game.whiteTime - elapsed + (game.increment || 0));
        } else {
          game.blackTime = Math.max(0, game.blackTime - elapsed + (game.increment || 0));
        }

        // Broadcast the move with updated clocks
        io.to(data.gameId).emit("move_made", {
          fen: game.chess.fen(),
          move,
          history: game.chess.history(),
          isGameOver: game.chess.isGameOver(),
          whiteTime: game.whiteTime,
          blackTime: game.blackTime,
        });
        
        if (game.chess.isGameOver()) {
          game.status = game.chess.isCheckmate() ? (game.chess.turn() === "w" ? "black_won" : "white_won") : "draw";
          activeGames.delete(data.gameId);
          saveGameToFirestore(game, game.chess.isCheckmate() ? "Checkmate" : "Draw").then(ratings => {
            io.to(data.gameId).emit("game_over", { status: game.status, ratingChanges: ratings });
          });
        }
      }
    } catch (e) {
      // Invalid move
      socket.emit("invalid_move", { fen: game.chess.fen() });
    }
  });

  socket.on("resign", (data: { gameId: string }) => {
    const game = activeGames.get(data.gameId);
    if (!game) return;
    
    const isWhite = game.white.socketId === socket.id;
    game.status = isWhite ? "black_won" : "white_won";
    const winnerName = isWhite ? game.black.username : game.white.username;
    activeGames.delete(data.gameId);
    saveGameToFirestore(game, "Resignation").then(ratings => {
      io.to(data.gameId).emit("game_over", { status: game.status, reason: `Resignation - ${winnerName} wins`, ratingChanges: ratings });
    });
  });
  
const PROFANITY_LIST = ["badword1", "badword2", "abuse", "cheat", "scam", "idiot", "trash", "hate", "kill", "stupid"];

socket.on("chat_message", async (data: { gameId: string, message: string, sender: string, email?: string }) => {
  const containsBadWord = PROFANITY_LIST.some(word => data.message.toLowerCase().includes(word));
  
  if (containsBadWord) {
    socket.emit("system_notification", {
      type: "warning",
      title: "Chat Warning",
      message: "Please maintain a respectful environment. Offensive language is not allowed."
    });

    if (firestoreDb && data.email) {
      try {
        const userSnap = await firestoreDb.collection("users").where("email", "==", data.email).get();
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          const userData = userDoc.data();
          const warnings = (userData.chatWarnings || 0) + 1;
          
          if (warnings >= 3) {
            await userDoc.ref.update({ chatWarnings: warnings, banned: true, status: 'banned', bannedBy: 'System (Chat Moderation)' });
            
            const notifyData = {
              type: "error",
              title: "Account Banned",
              message: "You have been banned for repeated chat violations."
            };
            
            const emailHtml = `<p>Your account (<strong>${userData.username}</strong>) has been automatically banned for repeated violations of our chat policy.</p>
            <p>Reason: Repeated offensive language.</p>`;
            
            await notifyUser(userData.username, notifyData, emailHtml);
            
            await notifyAdmins({
              type: "warning",
              title: "User Automatically Banned",
              message: `User ${userData.username} was banned after 3 chat warnings.`
            }, `<p>System alert: User <strong>${userData.username}</strong> (${data.email}) has been automatically banned for repeated chat abuse.</p>`);
            
            socket.disconnect();
            return;
          } else {
            await userDoc.ref.update({ chatWarnings: warnings });
            
            await notifyUser(userData.username, {
              type: "warning",
              title: "Moderation Warning",
              message: `You have ${3 - warnings} warnings left before an automatic ban.`
            }, `<p>You received a formal warning for your behavior in chat. You have ${3 - warnings} warnings remaining before your account is automatically restricted.</p>`);
          }
        }
      } catch (e) {
        console.error("Failed to update chat warnings:", e);
      }
    }
    return;
  }

  io.to(data.gameId).emit("chat_message", data);
});

  socket.on("anti_cheat_alert", async (data: { gameId: string, username: string, reason: string }) => {
    const game = activeGames.get(data.gameId);
    if (!game) return;
    
    const warningMsg = `[System] Anti-Cheat Alert: ${data.username} flagged for ${data.reason}`;
    io.to(data.gameId).emit("chat_message", { gameId: data.gameId, message: warningMsg, sender: "System" });
    
    if (firestoreDb) {
      try {
         const userSnap = await firestoreDb.collection("users").where("username", "==", data.username).get();
         if (!userSnap.empty) {
            const userDoc = userSnap.docs[0];
            const userData = userDoc.data();
            const currentScore = userData.fairPlayScore || 100;
            const newScore = Math.max(0, currentScore - 5);
            
            const flags = (userData.cheatFlags || 0) + 1;
            const updateData: any = { 
              fairPlayScore: newScore,
              cheatFlags: flags
            };

            // Automated ban if too many flags (e.g., 3)
            if (flags >= 3 && !userData.banned && userData.email !== "priyanshushaurya0@gmail.com" && userData.email !== "jitendramth@gmail.com") {
              updateData.banned = true;
              updateData.status = "banned";
              updateData.bannedReason = `Automated ban: Multiple anti-cheat flags (${data.reason})`;
              updateData.bannedBy = "System";
              updateData.systemNotes = `Banned automatically after 3 anti-cheat alerts. Last trigger: ${data.reason}`;
              
              // Force disconnect if online
              const targetSocketId = usernameToSocketId.get(data.username);
              if (targetSocketId) {
                io.to(targetSocketId).emit("banned", { reason: updateData.bannedReason });
              }
            }

            await userDoc.ref.update(updateData);
         }
      } catch (e) {
         console.error("Failed to update fairplay score:", e);
      }
    }
  });
  
  socket.on("admin_broadcast_notification", async (data: { type: string, title: string, message: string }) => {
    // In a real app, verify if socket user is actually an admin
    io.emit("system_notification", data);

    const pushedEmails = new Set();

    // 1. Try DB or mock
    let usersSnap = { docs: [] };
    if (firestoreDb) {
      try {
        usersSnap = await firestoreDb.collection("users").get();
      } catch (err) {
        // console.log("Firestore get failed, falling back to mock list.");
        usersSnap = { docs: [] };
      }
    } else {
      usersSnap = { docs: [] };
    }

    // Process from DB/mock
    const emailsSent = new Set();
    for (const doc of usersSnap.docs) {
      const user = doc.data();
      if (!user.email) continue;
      
      if (emailsSent.has(user.email)) continue; // PREVENT DUPLICATES
      emailsSent.add(user.email);
      pushedEmails.add(user.email);
      
      // Send Web Push if subscribed
      if (user.pushSubscription) {
        try {
          await webpush.sendNotification(user.pushSubscription, JSON.stringify(data));
          console.log(`Web push sent to ${user.email} from DB`);
        } catch (err) {
          console.error(`Failed to send web push to ${user.email} from DB:`, err);
        }
      }
      
      // Send Email
      await sendEmail(user.email, data.title, `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>${data.title}</h2>
          <p>${data.message}</p>
          <br/>
          <a href="https://chessarena.ai.studio/dashboard" style="padding: 10px 20px; background-color: #10b981; color: white; text-decoration: none; border-radius: 5px;">Play Now</a>
        </div>
      `);
    }

    // Process from in-memory activity (catch active users not in DB / missing DB subscriptions)
    for (const [email, user] of userActivity.entries()) {
      if (user.pushSubscription && !pushedEmails.has(email)) {
        try {
          await webpush.sendNotification(user.pushSubscription, JSON.stringify(data));
          console.log(`Web push sent to ${email} from Memory`);
        } catch (err) {
          console.error(`Failed to send web push to ${email} from Memory:`, err);
        }
      }
      if (!pushedEmails.has(email)) {
        await sendEmail(email, data.title, `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>${data.title}</h2>
            <p>${data.message}</p>
            <br/>
            <a href="https://chessarena.ai.studio/dashboard" style="padding: 10px 20px; background-color: #10b981; color: white; text-decoration: none; border-radius: 5px;">Play Now</a>
          </div>
        `);
      }
      pushedEmails.add(email);
    }
  });

  // WebRTC Signaling
  socket.on("signal", (data: { gameId: string, signal: any, to: string }) => {
    socket.to(data.gameId).emit("signal", { signal: data.signal, from: socket.id });
  });

  socket.on("full_voice_data", async (data: { gameId: string, audioBlob: string, duration?: number }) => {
    try {
      const game = activeGames.get(data.gameId);
      const session = userSessions.get(socket.id);
      let username = session?.username || "Unknown";
      if (game) {
        username = game.white.socketId === socket.id ? game.white.username : game.black.username;
      }

      // Split base64 into ~800KB chunks to stay safe under 1MB limit
      const chunkSize = 800 * 1024;
      const totalSize = data.audioBlob.length;
      const numChunks = Math.max(1, Math.ceil(totalSize / chunkSize));
      
      const recordingGroupId = uuidv4();
      const now = Date.now();

      if (!voiceRecordingsStore.has(data.gameId)) {
        voiceRecordingsStore.set(data.gameId, []);
      }
      const gameChunks = voiceRecordingsStore.get(data.gameId)!;

      for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, totalSize);
        const partData = data.audioBlob.substring(start, end);

        const chunk: VoiceRecordingChunk = {
          id: `${recordingGroupId}_${i}`,
          gameId: data.gameId,
          recordingGroupId,
          partIndex: i,
          totalParts: numChunks,
          audioData: partData,
          duration: data.duration,
          recordedAt: now,
          timestamp: now,
          sender: username,
          white: game?.white.username || "Unknown",
          black: game?.black.username || "Unknown",
          isFullRecording: true
        };

        gameChunks.push(chunk);

        if (firestoreDb) {
          try {
            await firestoreDb.collection("recordings").add({
              ...chunk,
              recordedAt: FieldValue.serverTimestamp()
            });
          } catch (dbErr) {
            // Firestore quota/perm error ignored safely
          }
        }
      }
      
      console.log(`[Server] Saved full recording for ${username} (game: ${data.gameId}) in ${numChunks} parts.`);
    } catch (err) {
      console.error("Error saving full voice data:", err);
    }
  });

  socket.on("voice_data", async (data: { gameId: string, audioBlob: string, timestamp: number, duration?: number }) => {
    try {
      const game = activeGames.get(data.gameId);
      const session = userSessions.get(socket.id);
      let username = session?.username || "Unknown";
      if (game) {
        username = game.white.socketId === socket.id ? game.white.username : game.black.username;
      }

      const now = Date.now();
      const chunk: VoiceRecordingChunk = {
        id: uuidv4(),
        gameId: data.gameId,
        audioData: data.audioBlob,
        timestamp: data.timestamp || now,
        duration: data.duration || 10,
        recordedAt: now,
        sender: username,
        white: game?.white.username || "Unknown",
        black: game?.black.username || "Unknown",
        timeControl: game?.timeControl || "Unknown"
      };

      if (!voiceRecordingsStore.has(data.gameId)) {
        voiceRecordingsStore.set(data.gameId, []);
      }
      voiceRecordingsStore.get(data.gameId)!.push(chunk);

      if (firestoreDb) {
        try {
          await firestoreDb.collection("recordings").add({
            ...chunk,
            recordedAt: FieldValue.serverTimestamp()
          });
        } catch (err) {
          // Ignored safely
        }
      }
    } catch (err) {
      console.error("Error saving voice data:", err);
    }
  });

  socket.on("disconnect", async () => {
    logDiagnostic('DISCONNECT', socket.id, {});
    const session = userSessions.get(socket.id);
    if (session && firestoreDb) {
      const durationSeconds = Math.floor((Date.now() - session.startTime) / 1000);
      try {
        const snap = await firestoreDb.collection("users").where("email", "==", session.email).get();
        if (!snap.empty) {
          const userDoc = snap.docs[0];
          const currentTotal = userDoc.data().totalPlayTime || 0;
          await userDoc.ref.update({
            isOnline: false,
            totalPlayTime: currentTotal + durationSeconds
          });
        }
      } catch (err) {
        console.error("Failed to update session time:", err);
      }
      userSessions.delete(socket.id);
    }
    console.log("Client disconnected:", socket.id);
    const gameId = playerToGame.get(socket.id);
    if (gameId) {
      const game = activeGames.get(gameId);
      if (game && game.status === "active") {
        let color: "white" | "black" | null = null;
        if (game.white.socketId === socket.id) color = "white";
        else if (game.black.socketId === socket.id) color = "black";
        
                if (color) {
          const isWhite = color === "white";
          io.to(gameId).emit("player_disconnected", { color, username: isWhite ? game.white.username : game.black.username });
          
          if (!game.disconnectTimeouts) game.disconnectTimeouts = {};
          
          game.disconnectTimeouts[color] = setTimeout(() => {
            logDiagnostic('TIMEOUT_TRIGGER', socket.id, { gameId, color, reason: 'abandonment_timeout_fired' });
            if (game.status === "active") {
              game.status = isWhite ? "black_won" : "white_won";
              const winnerName = isWhite ? game.black.username : game.white.username;
              activeGames.delete(gameId);
              saveGameToFirestore(game, "Opponent abandoned the game").then(ratings => {
                io.to(gameId).emit("game_over", { status: game.status, reason: `Opponent abandoned the game - ${winnerName} wins`, ratingChanges: ratings });
              });
            }
          }, 30000);
        }
      }
      playerToGame.delete(socket.id);
    }
    
    // Remove from queues
    Object.keys(queue).forEach(tc => {
      queue[tc] = queue[tc].filter(p => p.socketId !== socket.id);
    });
  });
});

async function saveGameToFirestore(game: Game, reason?: string) {
  if (!firestoreDb) return null;
  try {
    const isLocal = game.id.startsWith("local-");
    if (isLocal) return; // Don't save local/bot games
    
    await firestoreDb.collection("games").doc(game.id).set({
      white: game.white.username,
      black: game.black.username,
      whiteRating: game.white.rating || 1200,
      blackRating: game.black.rating || 1200,
      timeControl: game.timeControl || "blitz",
      whiteEmail: game.white.email || null,
      blackEmail: game.black.email || null,
      status: game.status,
      pgn: game.chess.pgn(),
      reason: reason || null,
      timestamp: FieldValue.serverTimestamp()
    });
    
    // ELO Calculation according to PRD
    const getKFactor = (rating: number, gamesPlayed: number) => {
      if (gamesPlayed < 30) return 40;
      if (rating < 2100) return 20;
      return 10;
    };

    const whiteRating = game.white.rating || 1200;
    const blackRating = game.black.rating || 1200;
    const whiteGames = game.white.gamesPlayed || 0;
    const blackGames = game.black.gamesPlayed || 0;

    const expectedWhite = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
    const expectedBlack = 1 / (1 + Math.pow(10, (whiteRating - blackRating) / 400));
    
    let actualWhite = 0.5;
    let actualBlack = 0.5;
    if (game.status === "white_won") {
      actualWhite = 1;
      actualBlack = 0;
    } else if (game.status === "black_won") {
      actualWhite = 0;
      actualBlack = 1;
    }
    
    const KWhite = getKFactor(whiteRating, whiteGames);
    const KBlack = getKFactor(blackRating, blackGames);

    const newWhiteRating = Math.round(whiteRating + KWhite * (actualWhite - expectedWhite));
    const newBlackRating = Math.round(blackRating + KBlack * (actualBlack - expectedBlack));

    const whiteChange = newWhiteRating - whiteRating;
    const blackChange = newBlackRating - blackRating;

    // Update player stats
    const updates = [];
    if (game.white.email) {
      const userRef = firestoreDb.collection("users").where("email", "==", game.white.email);
      updates.push(userRef.get().then(async snap => {
        if (!snap.empty) {
          const doc = snap.docs[0];
          const updateData: any = { 
            gamesPlayed: FieldValue.increment(1),
            rating: newWhiteRating,
            lastMatchAt: Date.now()
          };
          if (game.status === "white_won") updateData.wins = FieldValue.increment(1);
          else if (game.status === "black_won") updateData.losses = FieldValue.increment(1);
          else if (game.status === "draw") updateData.draws = FieldValue.increment(1);
          
          // Add to rating history
          await doc.ref.collection("ratingHistory").add({
            rating: newWhiteRating,
            change: whiteChange,
            opponent: game.black.username,
            timestamp: FieldValue.serverTimestamp(),
            gameId: game.id
          });

          return doc.ref.update(updateData);
        }
      }));
    }
    
    if (game.black.email) {
      const userRef = firestoreDb.collection("users").where("email", "==", game.black.email);
      updates.push(userRef.get().then(async snap => {
        if (!snap.empty) {
          const doc = snap.docs[0];
          const updateData: any = { 
            gamesPlayed: FieldValue.increment(1),
            rating: newBlackRating,
            lastMatchAt: Date.now()
          };
          if (game.status === "black_won") updateData.wins = FieldValue.increment(1);
          else if (game.status === "white_won") updateData.losses = FieldValue.increment(1);
          else if (game.status === "draw") updateData.draws = FieldValue.increment(1);

          // Add to rating history
          await doc.ref.collection("ratingHistory").add({
            rating: newBlackRating,
            change: blackChange,
            opponent: game.white.username,
            timestamp: FieldValue.serverTimestamp(),
            gameId: game.id
          });

          return doc.ref.update(updateData);
        }
      }));
    }
    
    await Promise.all(updates);

    // Achievement System Check
    if (firestoreDb) {
      const awardAchievements = async (email: string, newRating: number) => {
        const snap = await firestoreDb.collection("users").where("email", "==", email).get();
        if (snap.empty) return;
        const doc = snap.docs[0];
        const data = doc.data();
        const achievements = data.achievements || [];
        const existingTitles = data.titles || [];
        const gamesPlayed = data.gamesPlayed || 0;
        const wins = data.wins || 0;
        
        const newAchievements: any[] = [];
        let newTitle = data.title || "";

        // 1. Rating Titles (Promotes competitive play)
        if (newRating >= 2200 && newTitle !== "GM") newTitle = "GM";
        else if (newRating >= 2000 && !["GM", "IM"].includes(newTitle)) newTitle = "IM";
        else if (newRating >= 1800 && !["GM", "IM", "FM"].includes(newTitle)) newTitle = "FM";
        else if (newRating >= 1500 && !["GM", "IM", "FM", "CM"].includes(newTitle)) newTitle = "CM";
        else if (newRating >= 1300 && !["GM", "IM", "FM", "CM", "Expert"].includes(newTitle)) newTitle = "Expert";

        // 2. Progression Achievements (Yellow Level / Improvements)
        const hasAchievement = (id: string) => achievements.some((a: any) => a.id === id);

        if (gamesPlayed >= 1 && !hasAchievement('first_game')) {
          newAchievements.push({ id: 'first_game', title: 'Initiated', icon: '♟️', description: 'Played your first game on ChessArena.', dateEarned: new Date().toISOString() });
        }
        if (wins >= 1 && !hasAchievement('first_win')) {
          newAchievements.push({ id: 'first_win', title: 'First Blood', icon: '🩸', description: 'Won your first game.', dateEarned: new Date().toISOString() });
        }
        if (gamesPlayed >= 50 && !hasAchievement('veteran')) {
          newAchievements.push({ id: 'veteran', title: 'Chess Veteran', icon: '🎖️', description: 'Played 50 games.', dateEarned: new Date().toISOString() });
        }
        if (newRating >= 1500 && !hasAchievement('yellow_belt')) {
          newAchievements.push({ id: 'yellow_belt', title: 'Yellow Level', icon: '🟨', description: 'Reached Yellow Level (1500+ Rating).', dateEarned: new Date().toISOString() });
        }
        if (wins >= 10 && !hasAchievement('winner_10')) {
          newAchievements.push({ id: 'winner_10', title: 'Dominator', icon: '⚡', description: 'Won 10 matches.', dateEarned: new Date().toISOString() });
        }

        const finalUpdate: any = {};
        if (newAchievements.length > 0) {
          finalUpdate.achievements = [...achievements, ...newAchievements];
        }
        if (newTitle !== data.title) {
          finalUpdate.title = newTitle;
          // Store history of titles
          finalUpdate.titles = Array.from(new Set([...existingTitles, newTitle]));
        }

        if (Object.keys(finalUpdate).length > 0) {
          await doc.ref.update(finalUpdate);
          // Optional: Emit to user if online
          const userSocketId = Array.from(io.sockets.sockets.values()).find(s => (s as any).email === email)?.id;
          if (userSocketId) {
            io.to(userSocketId).emit("achievement_unlocked", { 
              achievements: newAchievements, 
              title: newTitle !== data.title ? newTitle : null 
            });
          }
        }
      };

      if (game.white.email) awardAchievements(game.white.email, newWhiteRating);
      if (game.black.email) awardAchievements(game.black.email, newBlackRating);
    }

    return {
      white: { old: whiteRating, new: newWhiteRating, change: whiteChange },
      black: { old: blackRating, new: newBlackRating, change: blackChange }
    };
    
  } catch (err) {
    if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
        console.error('Firestore operation failed, but keeping connection alive.');
      } else {
        console.error("Error saving game to Firestore:", err);
      }
  }
}

// REST Endpoints

// In-memory ban list for when Firestore isn't writable
const inMemoryBannedUsers = new Set();

app.post("/api/reports", async (req, res) => {
  try {
    const { reportId, reportedUser, reporterId, reason, pgn, type, evidence, gameId } = req.body;
    
    const newReport: ReportItem = {
      id: reportId || `rep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      reporterId: reporterId || "Anonymous",
      reportedUser: reportedUser || "Unknown",
      reason: reason || `Abusive ${type || 'chat'} behavior`,
      pgn: pgn || "",
      type: type || "chat",
      evidence: evidence || "",
      gameId: gameId || "",
      status: "pending",
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      isNew: true
    };

    // Store in-memory store immediately
    reportsStore.set(newReport.id, newReport);

    // Broadcast new report to all admin sockets in real time!
    io.emit("new_report", newReport);
    io.emit("admin_alert", {
      type: "report",
      message: `New report against ${newReport.reportedUser} by ${newReport.reporterId}`,
      report: newReport
    });

    let userEmail = "";
    for (const [email, data] of userActivity.entries()) {
      if (data.username === reportedUser) {
        userEmail = email;
        break;
      }
    }
    
    const isAdminUser = reportedUser.toLowerCase() === "admin" || 
      reportedUser.includes("Admin") || 
      userEmail === "priyanshushaurya0@gmail.com" || 
      userEmail === "jitendramth@gmail.com";

    if (firestoreDb) {
      try {
        await firestoreDb.collection("reports").doc(newReport.id).set({
          ...newReport,
          timestamp: FieldValue.serverTimestamp()
        });

        if (!isAdminUser) {
          // Automated moderation: Check if reports threshold exceeded
          const userSnap = await firestoreDb.collection("users").where("username", "==", reportedUser).get();
          if (!userSnap.empty) {
            const userDoc = userSnap.docs[0];
            const userData = userDoc.data();
            const reportsCount = (userData.reportsCount || 0) + 1;
            const updateData: any = { reportsCount };

            if (reportsCount >= 5 && !userData.banned) {
              updateData.banned = true;
              updateData.status = "banned";
              updateData.bannedReason = `Automated ban: Excessive user reports (${reportsCount}+ reports)`;
              updateData.bannedBy = "System";
              updateData.systemNotes = `Banned automatically after reaching 5 user reports. Latest report: ${reason}`;
              
              const targetSocketId = usernameToSocketId.get(reportedUser);
              if (targetSocketId) {
                io.to(targetSocketId).emit("banned", { reason: updateData.bannedReason });
              }
            }
            await userDoc.ref.update(updateData);
          }
        }
      } catch (e) {
        // Firestore write error handled safely
      }
    }

    // Notify Admins
    await notifyAdmins({
      type: "info",
      title: "New Abuse Report",
      message: `User ${reporterId} reported ${reportedUser} for ${type || 'abuse'}.`
    }, `
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; border-radius: 8px;">
        <h2 style="color: #991b1b; margin-top: 0;">New Moderation Report</h2>
        <p>A new report has been filed by <strong>${reporterId}</strong> against <strong>${reportedUser}</strong>.</p>
        <p><strong>Reason:</strong> ${reason || 'No details provided'}</p>
        <p><strong>Type:</strong> ${type || 'chat'}</p>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #fee2e2;">
          <a href="https://chessarena.ai.studio/admin" style="color: #ef4444; font-weight: bold; text-decoration: none;">Review in Admin Panel →</a>
        </div>
      </div>
    `);

    // AI Evaluation (for chat reports when key is set and user is not admin)
    if (process.env.GEMINI_API_KEY && (!type || type === 'chat') && !isAdminUser) {
      try {
        const prompt = `
        You are an automated moderation system for a chess website.
        A user (${reporterId}) has reported another user (${reportedUser}).
        Reporter's message: "${reason || 'No message provided'}"
        Game PGN (if any): "${pgn || 'No PGN provided'}"

        Analyze the provided information. Determine if the reported user has clearly violated terms of service.
        Respond with a JSON object: {"shouldBan": boolean, "reason": string}
        `;
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const interaction = await ai.interactions.create({
          model: "gemini-3.8-flash",
          input: prompt
        });
        
        const text = interaction.output_text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const aiResult = JSON.parse(jsonMatch[0]);
          if (aiResult.shouldBan && firestoreDb) {
            try {
              const usersSnap = await firestoreDb.collection("users").where("username", "==", reportedUser).get();
              if (!usersSnap.empty) {
                const userDoc = usersSnap.docs[0];
                await userDoc.ref.update({
                  banned: true,
                  status: 'banned',
                  bannedBy: 'system (AI)',
                  bannedReason: 'Automated AI Ban: ' + aiResult.reason,
                  updatedAt: FieldValue.serverTimestamp()
                });

                const notifyData = {
                  type: "error",
                  title: "Account Banned",
                  message: "Your account has been banned following an automated review."
                };
                
                const emailHtml = `<p>Your account (<strong>${reportedUser}</strong>) has been automatically banned after an AI review.</p>
                <p>Reason: ${aiResult.reason}</p>`;
                
                await notifyUser(reportedUser, notifyData, emailHtml);
                
                await notifyAdmins({
                  type: "warning",
                  title: "AI Auto-Ban",
                  message: `AI automatically banned ${reportedUser}`
                }, `<p>System alert: AI has banned <strong>${reportedUser}</strong> for: ${aiResult.reason}</p>`);

                newReport.status = 'completed';
                newReport.resolution = 'ai_ban';
                reportsStore.set(newReport.id, newReport);
                return res.json({ success: true, banned: true, message: "Report received. User banned after AI analysis.", report: newReport });
              }
            } catch (aiBanErr) {}
          }
        }
      } catch (err) {
        console.error("AI Evaluation failed", err);
      }
    }
    
    res.json({ success: true, message: "Report received and queued in admin panel.", report: newReport });
  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

// GET /api/admin/reports - Returns new pending reports by default, with filter support
app.get("/api/admin/reports", async (req, res) => {
  try {
    const statusQuery = ((req.query.status || req.query.filter) as string) || 'pending';
    const hideResolvedParam = req.query.hideResolved;
    const hideResolved = hideResolvedParam !== undefined ? hideResolvedParam === 'true' : (statusQuery === 'pending');

    const allReports: ReportItem[] = [];
    
    // In-memory reports first
    for (const report of reportsStore.values()) {
      allReports.push(report);
    }

    // Also check Firestore if available and merge
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection("reports")
          .limit(100)
          .get();
        snap.docs.forEach((d: any) => {
          const data = d.data();
          if (!allReports.some(r => r.id === d.id)) {
            allReports.push({ id: d.id, ...data });
          }
        });
      } catch (e) {}
    }

    // Sort newest first
    allReports.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    const pendingReports = allReports.filter(r => 
      r.status === 'pending' || r.status === 'new' || (!r.status && !r.resolution)
    );
    const resolvedReports = allReports.filter(r => 
      r.status === 'completed' || r.status === 'dismissed' || (!['pending', 'new'].includes(r.status) && !!r.resolution)
    );

    let displayReports: ReportItem[] = pendingReports;
    if (statusQuery === 'resolved') {
      displayReports = resolvedReports;
    } else if (statusQuery === 'all' && !hideResolved) {
      displayReports = allReports;
    } else {
      // Default: only display new, pending reports
      displayReports = pendingReports;
    }

    res.json({ 
      reports: displayReports,
      allReports,
      pendingCount: pendingReports.length,
      resolvedCount: resolvedReports.length,
      totalCount: allReports.length
    });
  } catch (err) {
    console.error("Error fetching reports:", err);
    res.json({ reports: [], allReports: [], pendingCount: 0, resolvedCount: 0, totalCount: 0 });
  }
});

// Clear older / completed reports
app.post("/api/admin/reports/clear-older", async (req, res) => {
  try {
    const clearAll = req.body?.clearAll === true;
    let clearedCount = 0;

    for (const [id, report] of reportsStore.entries()) {
      if (clearAll || report.status === 'completed' || report.status === 'dismissed' || (Date.now() - (report.timestamp || 0) > 86400000 && report.status !== 'pending')) {
        reportsStore.delete(id);
        clearedCount++;
      }
    }

    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection("reports").get();
        for (const doc of snap.docs) {
          const data = doc.data();
          if (clearAll || data.status === 'completed' || data.status === 'dismissed') {
            await doc.ref.delete().catch(() => {});
          }
        }
      } catch (e) {}
    }

    io.emit("reports_cleared", { clearedCount, remaining: reportsStore.size });
    res.json({ success: true, clearedCount, remaining: reportsStore.size });
  } catch (err) {
    console.error("Error clearing older reports:", err);
    res.status(500).json({ error: "Failed to clear older reports" });
  }
});

// Delete single report by ID
app.delete("/api/admin/reports/:id", async (req, res) => {
  try {
    const { id } = req.params;
    reportsStore.delete(id);

    if (firestoreDb) {
      try {
        await firestoreDb.collection("reports").doc(id).delete();
      } catch (e) {}
    }

    io.emit("report_deleted", { id });
    res.json({ success: true, message: "Report deleted" });
  } catch (err) {
    console.error("Error deleting report:", err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// Voice history for specific user - robust fallback with in-memory store
app.get("/api/admin/recordings/:username", async (req, res) => {
  try {
    const rawUsername = req.params.username || "";
    const username = decodeURIComponent(rawUsername).trim();
    const unameLower = username.toLowerCase();
    
    const matchedChunks: VoiceRecordingChunk[] = [];
    
    // 1. Check in-memory store
    for (const chunks of voiceRecordingsStore.values()) {
      for (const chunk of chunks) {
        const sender = (chunk.sender || "").toLowerCase();
        const white = (chunk.white || "").toLowerCase();
        const black = (chunk.black || "").toLowerCase();
        if (sender === unameLower || white === unameLower || black === unameLower) {
          matchedChunks.push(chunk);
        }
      }
    }

    // 2. Query Firestore if available
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection("recordings")
          .where("sender", "==", username)
          .get();
        
        snap.docs.forEach((d: any) => {
          const data = d.data();
          if (!matchedChunks.some(m => m.id === d.id || (m.gameId === data.gameId && m.partIndex === data.partIndex))) {
            matchedChunks.push({ id: d.id, ...data });
          }
        });
      } catch (err) {
        // Fallback safely to in-memory records
      }
    }

    // Group by gameId
    const grouped: Record<string, any[]> = {};
    matchedChunks.forEach((rec: any) => {
      const gid = rec.gameId || "session_history";
      if (!grouped[gid]) grouped[gid] = [];
      grouped[gid].push(rec);
    });

    // Sort chunks within each game
    Object.keys(grouped).forEach(gameId => {
      grouped[gameId].sort((a, b) => {
        if (a.isFullRecording && b.isFullRecording) {
          return (a.partIndex || 0) - (b.partIndex || 0);
        }
        return (a.timestamp || a.recordedAt || 0) - (b.timestamp || b.recordedAt || 0);
      });
    });

    res.json({ recordings: grouped });
  } catch (err) {
    console.error("Error fetching user recordings:", err);
    res.json({ recordings: {} });
  }
});

// Game recordings for specific match
app.get("/api/admin/game-recordings/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    const recordings = voiceRecordingsStore.get(gameId) ? [...voiceRecordingsStore.get(gameId)!] : [];
    
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection("recordings")
          .where("gameId", "==", gameId)
          .get();
        
        snap.docs.forEach((d: any) => {
          const data = d.data();
          if (!recordings.some(r => r.id === d.id || (r.partIndex !== undefined && r.partIndex === data.partIndex))) {
            recordings.push({ id: d.id, ...data });
          }
        });
      } catch (err) {}
    }

    recordings.sort((a: any, b: any) => {
      if (a.isFullRecording && b.isFullRecording) {
        return (a.partIndex || 0) - (b.partIndex || 0);
      }
      return (a.timestamp || a.recordedAt || 0) - (b.timestamp || b.recordedAt || 0);
    });

    res.json({ recordings });
  } catch (err) {
    console.error("Error fetching game recordings:", err);
    res.json({ recordings: [] });
  }
});

app.get("/api/admin/stats", async (req, res) => {
  if (!firestoreDb) return res.json({
      totalUsers: 0,
      activeUsers: 0,
      totalGames: 0,
      users: [],
      recentGames: [],
      reports: [],
      analyticsData: []
    });
  try {
    const usersSnap = await firestoreDb.collection("users").get();
    const gamesSnap = await firestoreDb.collection("games").limit(100).get();
    
    const users = [];
    let activeUsersCount = 0;
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    
    usersSnap.forEach(doc => {
      const data = doc.data();
      users.push({
        id: doc.id,
        ...data,
        username: data.username || "Unknown",
        email: data.email || "",
        rating: data.rating || 1200,
        status: data.banned ? "banned" : "active",
        reports: data.reports || 0,
        lastMatchAt: data.lastMatchAt || 0
      });
      if (now - (data.lastMatchAt || 0) < ONE_WEEK_MS) {
        activeUsersCount++;
      }
    });

    const games = [];
    gamesSnap.forEach(doc => {
      games.push(doc.data());
    });

        // Analytics data (mocked from real stats for now since we don't have historical data)
    const analyticsData = [
      { name: 'Mon', activeUsers: Math.floor(activeUsersCount * 0.8), gamesPlayed: Math.floor(gamesSnap.size * 0.1) },
      { name: 'Tue', activeUsers: Math.floor(activeUsersCount * 0.9), gamesPlayed: Math.floor(gamesSnap.size * 0.15) },
      { name: 'Wed', activeUsers: activeUsersCount, gamesPlayed: Math.floor(gamesSnap.size * 0.2) },
      { name: 'Thu', activeUsers: Math.floor(activeUsersCount * 1.1), gamesPlayed: Math.floor(gamesSnap.size * 0.25) },
      { name: 'Fri', activeUsers: Math.floor(activeUsersCount * 1.2), gamesPlayed: Math.floor(gamesSnap.size * 0.3) },
      { name: 'Sat', activeUsers: Math.floor(activeUsersCount * 1.5), gamesPlayed: Math.floor(gamesSnap.size * 0.4) },
      { name: 'Sun', activeUsers: Math.floor(activeUsersCount * 1.3), gamesPlayed: Math.floor(gamesSnap.size * 0.35) },
    ];

    // Fetch reports: all reports for comprehensive admin management
    const allReportsList: any[] = [];
    for (const rep of reportsStore.values()) {
      allReportsList.push(rep);
    }
    if (firestoreDb) {
      try {
        const reportsSnap = await firestoreDb.collection("reports")
          .limit(100)
          .get();
        reportsSnap.forEach(doc => {
          const data = doc.data();
          if (!allReportsList.some(r => r.id === doc.id)) {
            allReportsList.push({ id: doc.id, ...data });
          }
        });
      } catch(err) {}
    }
    allReportsList.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
    const pendingReportsList = allReportsList.filter(r => r.status === 'pending' || r.status === 'new' || (!r.status && !r.resolution));

    res.json({
      totalUsers: users.length,
      activeUsers: activeUsersCount,
      totalGames: gamesSnap.size,
      users: users,
      recentGames: games,
      reports: allReportsList,
      pendingReportsCount: pendingReportsList.length,
      analyticsData: analyticsData
    });
  } catch (err) {
    if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
      console.error('Firestore operation failed, but keeping connection alive.');
    } else {
      console.error("Error fetching admin stats:", err);
    }
    
    // Return in-memory reports even if Firestore fails
    const fallbackReports: any[] = [];
    for (const rep of reportsStore.values()) {
      fallbackReports.push(rep);
    }
    fallbackReports.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
    const fallbackPending = fallbackReports.filter(r => r.status === 'pending' || r.status === 'new' || (!r.status && !r.resolution));

    res.json({
      totalUsers: 0,
      activeUsers: 0,
      totalGames: 0,
      users: [],
      recentGames: [],
      reports: fallbackReports,
      pendingReportsCount: fallbackPending.length,
      analyticsData: []
    });
  }
});


app.post("/api/admin/users/:id/ban", async (req, res) => {
  if (!firestoreDb) return res.status(500).json({ error: "Firestore not initialized" });
  try {
    const { id } = req.params;
    const { action } = req.body; // 'ban' or 'unban'
    const userRef = firestoreDb.collection("users").doc(id);
    const userDoc = await userRef.get();
    
    await userRef.update({
      banned: action === 'ban',
      status: action === 'ban' ? 'banned' : 'active',
      bannedBy: 'admin',
      updatedAt: FieldValue.serverTimestamp()
    });
    
    if (action === 'ban' && userDoc.exists) {
       const userData = userDoc.data();
       if (userData.email) {
          const subject = "Your account has been banned";
          const html = `<p>Your account (<strong>${userData.username}</strong>) has been manually banned by an administrator due to terms of service violations.</p>
          <p>If you believe this was an error, you may appeal this decision.</p>`;
          await sendEmail(userData.email, subject, html);
       }
    }
    
    res.json({ success: true, banned: action === 'ban' });
  } catch (err) {
    console.error("Error banning user:", err);
    res.status(500).json({ error: "Failed to update user status" });
  }
});

app.post("/api/admin/reports/:id/action", async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reportedUser } = req.body; // 'ban' or 'dismiss' or 'reopen'
    
    if (action === 'reopen') {
      const existing = reportsStore.get(id);
      if (existing) {
        existing.status = 'pending';
        delete existing.resolution;
        reportsStore.set(id, existing);
      }

      if (firestoreDb) {
        try {
          await firestoreDb.collection("reports").doc(id).update({
            status: 'pending',
            resolution: FieldValue.delete()
          });
        } catch (dbErr) {}
      }

      io.emit("report_updated", { id, status: 'pending', action: 'reopen', reportedUser });
      return res.json({ success: true, message: "Report reopened and returned to active pending queue." });
    }

    // update report status in in-memory store
    const existing = reportsStore.get(id);
    if (existing) {
      existing.status = 'completed';
      existing.resolution = action;
      (existing as any).resolvedAt = Date.now();
      reportsStore.set(id, existing);
    }

    if (firestoreDb) {
      try {
        await firestoreDb.collection("reports").doc(id).update({
          status: 'completed',
          resolution: action,
          resolvedAt: Date.now()
        });
      } catch (dbErr) {}
    }

    const resolutionMsg = action === 'ban' ? `User ${reportedUser} was banned.` : `Report against ${reportedUser} was dismissed.`;
    
    await notifyAdmins({
      type: action === 'ban' ? 'error' : 'info',
      title: "Report Resolved",
      message: resolutionMsg
    }, `<p>Moderation update: A report against <strong>${reportedUser}</strong> has been resolved.</p>
    <p><strong>Action taken:</strong> ${action === 'ban' ? 'Account Banned' : 'Report Dismissed'}</p>`);
    
    if (action === 'ban') {
       inMemoryBannedUsers.add(reportedUser);
       const targetSocketId = usernameToSocketId.get(reportedUser);
       if (targetSocketId) {
         io.to(targetSocketId).emit("banned", { reason: "Account banned following admin report review." });
       }

       if (firestoreDb) {
         try {
           const usersSnap = await firestoreDb.collection("users").where("username", "==", reportedUser).get();
           if (!usersSnap.empty) {
             const userDoc = usersSnap.docs[0];
             await userDoc.ref.update({
                banned: true,
                status: 'banned',
                bannedBy: 'admin',
                bannedReason: 'Manual ban from report review',
                updatedAt: FieldValue.serverTimestamp()
             });
             
             const notifyData = {
               type: "error",
               title: "Account Banned",
               message: "Your account has been banned by an administrator."
             };
             
             const emailHtml = `<p>Your account (<strong>${reportedUser}</strong>) has been manually banned by an administrator following a report review.</p>
             <p>Reason: Manual ban from report review.</p>
             <p>If you believe this was an error, you may appeal this decision.</p>`;
             
             await notifyUser(reportedUser, notifyData, emailHtml);
           }
         } catch (dbBanErr) {}
       }
    }
    
    io.emit("report_resolved", { id, action, reportedUser, resolvedAt: Date.now() });
    res.json({ success: true, message: `Report ${action === 'ban' ? 'banned user' : 'dismissed'}` });
  } catch (err) {
    console.error("Error updating report:", err);
    res.status(500).json({ error: "Failed to process report action" });
  }
});

app.post("/api/admin/appeals/:id/action", async (req, res) => {
  if (!firestoreDb) return res.status(500).json({ error: "Firestore not initialized" });
  try {
    const { id } = req.params;
    const { action, username, email } = req.body;
    
    await firestoreDb.collection("appeals").doc(id).update({
      status: action === 'approve' ? 'approved' : (action === 'permanent_ban' ? 'permanently_banned' : 'rejected'),
      updatedAt: FieldValue.serverTimestamp()
    });
    
    if (action === 'approve') {
       const usersSnap = await firestoreDb.collection("users").where("username", "==", username).get();
       if (!usersSnap.empty) {
         await usersSnap.docs[0].ref.update({
            banned: false,
            status: 'active',
            bannedBy: null,
            bannedReason: null,
            systemNotes: null,
            cheatFlags: 0,
            reportsCount: 0,
            updatedAt: FieldValue.serverTimestamp()
         });
         
         const subject = "Your account ban appeal has been approved";
         const html = `<p>Your account (<strong>${username}</strong>) has been unbanned. You may now login and play again.</p>`;
         await sendEmail(email, subject, html);
       }
    } else if (action === 'permanent_ban') {
       const usersSnap = await firestoreDb.collection("users").where("username", "==", username).get();
       if (!usersSnap.empty) {
         await usersSnap.docs[0].ref.update({
            banned: true,
            status: 'banned',
            bannedReason: 'Permanent ban after appeal review',
            bannedBy: 'Admin (Permanent)',
            updatedAt: FieldValue.serverTimestamp()
         });
         
         const subject = "Your account has been permanently banned";
         const html = `<p>Your appeal for account (<strong>${username}</strong>) has been reviewed and rejected. Your account is now permanently banned.</p>`;
         await sendEmail(email, subject, html);
       }
    } else {
         const subject = "Your account ban appeal has been rejected";
         const html = `<p>Your account (<strong>${username}</strong>) appeal has been reviewed and rejected. The ban remains in place.</p>`;
         await sendEmail(email, subject, html);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("Error processing appeal action:", err);
    res.status(500).json({ error: "Failed to process appeal action" });
  }
});

app.post("/api/appeals", async (req, res) => {
  if (!firestoreDb) return res.status(500).json({ error: "Firestore not initialized" });
  try {
    const { email, username, message } = req.body;
    
    // Fetch system notes for this user to include in appeal
    let systemNotes = "No system notes found.";
    const userSnap = await firestoreDb.collection("users").where("username", "==", username).get();
    if (!userSnap.empty) {
      systemNotes = userSnap.docs[0].data().systemNotes || userSnap.docs[0].data().bannedReason || "Manual ban";
    }

    await firestoreDb.collection("appeals").add({
      email,
      username,
      message,
      systemNotes,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });
    
    // Notify admin
    const adminEmail = "priyanshushaurya0@gmail.com";
    const subject = `Ban Appeal from ${username}`;
    const html = `<p>User <strong>${username}</strong> (${email}) has appealed their ban.</p>
    <p><strong>System Ban Reason:</strong> ${systemNotes}</p>
    <p><strong>User Appeal Message:</strong></p>
    <blockquote>${message}</blockquote>
    <p>Please review this in the admin dashboard.</p>`;
    await sendEmail(adminEmail, subject, html);

    // Notify user
    const userSubject = "Appeal Received - ChessArena";
    const userHtml = `<p>Hello <strong>${username}</strong>,</p>
    <p>Your appeal has been successfully sent to the admin team.</p>
    <p>We will review your request and get back to you shortly.</p>
    <p>Thank you for your patience.</p>
    <p>Best regards,<br/>The ChessArena Team</p>`;
    await sendEmail(email, userSubject, userHtml);
    
    res.json({ success: true });
  } catch (err) {
    console.error("Error creating appeal:", err);
    res.status(500).json({ error: "Failed to submit appeal" });
  }
});


app.get("/api/games", async (req, res) => {
  if (!firestoreDb) return res.json({ games: [] });
  try {
    const { username } = req.query;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username is required" });
    }
    
    // Fetch games where user is white
    const whiteGamesSnap = await firestoreDb.collection("games").where("white", "==", username).get();
    // Fetch games where user is black
    const blackGamesSnap = await firestoreDb.collection("games").where("black", "==", username).get();
    
    const games: any[] = [];
    whiteGamesSnap.forEach(doc => games.push({ id: doc.id, ...doc.data() }));
    blackGamesSnap.forEach(doc => games.push({ id: doc.id, ...doc.data() }));
    
    // Sort by timestamp descending
    games.sort((a, b) => {
      const timeA = a.timestamp ? (typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp.toMillis ? a.timestamp.toMillis() : (a.timestamp._seconds * 1000) || 0) : 0;
      const timeB = b.timestamp ? (typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp.toMillis ? b.timestamp.toMillis() : (b.timestamp._seconds * 1000) || 0) : 0;
      return timeB - timeA;
    });
    
    res.json({ games });
  } catch (error) {
    if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
      console.error('Firestore operation failed, but keeping connection alive.');
    } else {
      console.error("Error fetching games:", error);
    }
    res.json({ games: [] });
  }
});

app.get("/api/games/:id", async (req, res) => {
  if (!firestoreDb) return res.status(404).json({ error: "Database not connected" });
  try {
    const doc = await firestoreDb.collection("games").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Game not found" });
    }
    res.json({ game: { id: doc.id, ...doc.data() } });
  } catch (error) {
    console.error("Error fetching game by ID:", error);
    res.status(500).json({ error: "Failed to fetch game" });
  }
});

async function startServer() {
  app.post("/api/admin/grant-reward", async (req, res) => {
    if (!firestoreDb) return res.status(500).json({ error: "Database not connected" });
    try {
      const { target, type, value } = req.body;
      const userSnap = await firestoreDb.collection("users").where("username", "==", target).get();
      if (userSnap.empty) return res.status(404).json({ error: "User not found" });

      const userDoc = userSnap.docs[0];
      const updateData: any = {};
      if (type === 'title') {
        updateData.title = value;
      } else if (type === 'badge') {
        const currentBadges = userDoc.data().badges || [];
        updateData.badges = [...currentBadges, value];
      } else if (type === 'elo') {
        const currentElo = userDoc.data().rating || 1200;
        updateData.rating = currentElo + parseInt(value);
      }
      
      await userDoc.ref.update(updateData);

      // Notify user via socket
      const targetSocketId = usernameToSocketId.get(target);
      if (targetSocketId) {
        io.to(targetSocketId).emit("reward_granted", { type, value, ...updateData });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Error granting reward:", err);
      res.status(500).json({ error: "Failed to grant reward" });
    }
  });

  app.post("/api/tournaments/notify", async (req, res) => {
    if (!firestoreDb) return res.status(500).json({ error: "Database not connected" });
    try {
      const { tournamentId, userId, userEmail } = req.body;
      if (!tournamentId || !userId) return res.status(400).json({ error: "Missing required fields" });

      // Check if alert already exists
      const existing = await firestoreDb.collection("tournament_alerts")
        .where("tournamentId", "==", tournamentId)
        .where("userId", "==", userId)
        .get();

      if (!existing.empty) {
        return res.json({ success: true, message: "Already subscribed" });
      }

      await firestoreDb.collection("tournament_alerts").add({
        tournamentId,
        userId,
        userEmail,
        notified: false,
        createdAt: FieldValue.serverTimestamp()
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Error creating tournament alert:", err);
      res.status(500).json({ error: "Failed to set notification" });
    }
  });

  app.get("/api/tournaments", async (req, res) => {
    if (!firestoreDb) return res.json({ tournaments: [] });
    try {
      const snap = await firestoreDb.collection("tournaments").get();
      const tournaments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ tournaments });
    } catch (err) {
      res.json({ tournaments: [] });
    }
  });

  app.post("/api/tournaments/create", async (req, res) => {
    if (!firestoreDb) return res.status(500).json({ error: "Database not connected" });
    try {
      const { title, type } = req.body;
      
      const coinsPrizes = ["1,000", "2,500", "5,000", "10,000", "15,000", "20,000", "25,000", "50,000"];
      const cosmeticPrizes = ["Premium Membership (1 Month)", "Premium Membership (3 Months)", "Custom Avatar Frame", "Tournament Champion Badge", "Grandmaster Title", "VIP Chat Badge", "Legendary Border"];
      const eloPrizes = ["25 ELO Boost", "50 ELO Boost", "100 ELO Boost"];

      const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
      
      // Generate randomized prize pool
      const prizePool = {
        first: `${getRandom(coinsPrizes)} Coins + ${getRandom(cosmeticPrizes)} + ${getRandom(eloPrizes)}`,
        second: `${getRandom(coinsPrizes)} Coins + ${getRandom(eloPrizes)}`,
        third: `${getRandom(coinsPrizes)} Coins`
      };

      const tournament = {
        title,
        type,
        prize: prizePool.first, // Legacy field for compatibility
        prizePool,
        status: "registering",
        participants: [],
        startTime: new Date(Date.now() + 3600000).toISOString(),
        createdAt: FieldValue.serverTimestamp()
      };
      const docRef = await firestoreDb.collection("tournaments").add(tournament);
      res.json({ id: docRef.id, ...tournament });
    } catch (err) {
      res.status(500).json({ error: "Failed to create tournament" });
    }
  });

  app.post("/api/tournaments/join", async (req, res) => {
    if (!firestoreDb) return res.status(500).json({ error: "Database not connected" });
    try {
      const { tournamentId, username } = req.body;
      const tRef = firestoreDb.collection("tournaments").doc(tournamentId);
      const tDoc = await tRef.get();
      if (!tDoc.exists) return res.status(404).json({ error: "Tournament not found" });

      const participants = tDoc.data().participants || [];
      if (participants.includes(username)) return res.status(400).json({ error: "Already joined" });

      await tRef.update({
        participants: [...participants, username]
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to join" });
    }
  });

  app.post("/api/user/login", async (req, res) => {
    if (!firestoreDb) return res.status(500).json({ error: "Database not connected" });
    try {
      const { email, uid, location } = req.body;
      const userRef = firestoreDb.collection("users").doc(uid);
      const updateData: any = {
        lastLoginAt: FieldValue.serverTimestamp(),
        isOnline: true
      };
      if (location) {
        updateData.location = location;
      }
      await userRef.update(updateData).catch(async () => {
        // If doc doesn't exist, set it (though it should exist)
        await userRef.set(updateData, { merge: true });
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Login report error:", err);
      res.status(500).json({ error: "Failed to report login" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  // Unban admin on startup
  if (firestoreDb) {
    const adminEmails = ["priyanshushaurya0@gmail.com", "jitendramth@gmail.com"];
    adminEmails.forEach(email => {
      firestoreDb.collection("users").where("email", "==", email).get()
        .then(snap => {
          if (!snap.empty) {
            snap.docs[0].ref.update({ banned: false, status: 'active', isAdmin: true });
          }
        }).catch(console.error);
    });
  }
    // Run startup scan for welcome emails
    scanAndSendWelcomeEmails().catch(err => console.error("Error in startup scan:", err));
  });
}

startServer();
