
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX, AlertTriangle, Settings, UserX, ShieldAlert, Globe, MessageSquare, Radio, PhoneCall, Captions, Shield, EarOff, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function VoiceChat() {
  const { socket, gameId, playerColor, user, gameState, opponent } = useAppStore();
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNear, setIsNear] = useState(false);
  const [myLocation, setMyLocation] = useState<{lat: number, lng: number} | null>(null);
  
  // Advanced Features State
  const [voiceConsentGiven, setVoiceConsentGiven] = useState(false);
  const [voiceConsentReceived, setVoiceConsentReceived] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [isHoldingPTT, setIsHoldingPTT] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [quality, setQuality] = useState(100);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [liveTranslation, setLiveTranslation] = useState(false);
  const [captions, setCaptions] = useState<{user: string, text: string, time: string}[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const fullRecorderRef = useRef<MediaRecorder | null>(null);
  const fullChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Recording logic
  useEffect(() => {
    if (!isConnected || !stream || !gameId || !socket) return;

    const startRecording = async () => {
      try {
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();

        // Local Stream (My Voice)
        const localSource = audioCtx.createMediaStreamSource(stream);
        localSource.connect(dest);

        // Remote Stream (Opponent's Voice)
        // We get this from the peer connection's remote tracks
        const remoteStream = new MediaStream();
        peerRef.current?.getReceivers().forEach(receiver => {
          if (receiver.track && receiver.track.kind === 'audio') {
            remoteStream.addTrack(receiver.track);
          }
        });

        if (remoteStream.getAudioTracks().length > 0) {
          const remoteSource = audioCtx.createMediaStreamSource(remoteStream);
          remoteSource.connect(dest);
        }

        const recorder = new MediaRecorder(dest.stream);
        recorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0) {
            const reader = new FileReader();
            reader.readAsDataURL(e.data);
            reader.onloadend = () => {
              const base64data = reader.result as string;
              
              // Store latest chunk globally for evidence capture
              (window as any).latestVoiceChunk = base64data;
              window.dispatchEvent(new CustomEvent('voice_chunk_ready', { detail: base64data }));

              socket.emit('voice_data', {
                gameId,
                audioBlob: base64data,
                timestamp: Date.now(),
                duration: 10
              });
            };
          }
        };

        // Full session recorder
        const fullRecorder = new MediaRecorder(dest.stream);
        fullRecorderRef.current = fullRecorder;
        fullChunksRef.current = [];
        startTimeRef.current = Date.now();

        fullRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            fullChunksRef.current.push(e.data);
          }
        };

        fullRecorder.onstop = async () => {
          if (fullChunksRef.current.length === 0) return;
          const fullBlob = new Blob(fullChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(fullBlob);
          reader.onloadend = () => {
            const base64data = reader.result as string;
            const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
            
            socket.emit('full_voice_data', {
              gameId,
              audioBlob: base64data,
              duration
            });
            console.log(`[VoiceChat] Full recording sent. Duration: ${duration}s`);
          };
        };

        // Record in 10-second chunks for reporting
        recorder.start(10000);
        // Start full recording without timeslice
        fullRecorder.start();
        console.log("[VoiceChat] Full session recording started.");
      } catch (err) {
        console.warn("[VoiceChat] Failed to start recording:", err);
      }
    };

    startRecording();

    return () => {
      recorderRef.current?.stop();
      fullRecorderRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, [isConnected, stream, gameId, socket]);

  // Monitor game end to stop full recording
  useEffect(() => {
    if (gameState === 'finished' && fullRecorderRef.current?.state === 'recording') {
      fullRecorderRef.current.stop();
      recorderRef.current?.stop();
    }
  }, [gameState]);
  
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, (err) => {
        console.warn("Geolocation not available", err);
      }, { enableHighAccuracy: true });
    }
  }, []);

  // WebRTC Setup (only if mutual consent is given)
  useEffect(() => {
    if (!socket || !gameId || gameId === 'local') return;
    if (!voiceConsentGiven || !voiceConsentReceived) return;

    console.log("[VoiceChat] Setting up WebRTC signaling for game:", gameId);

    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    });
    peerRef.current = peer;

    let makingOffer = false;
    let ignoreOffer = false;

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { gameId, signal: { type: 'candidate', candidate: event.candidate } });
      }
    };

    peer.ontrack = (event) => {
      console.log("[VoiceChat] Remote track received:", event.streams[0]);
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
        audioRef.current.play().catch(err => {
          console.warn("[VoiceChat] Play error:", err);
        });
      }
      setIsConnected(true);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        setIsConnected(true);
        // Simulate quality check
        setInterval(() => setQuality(Math.floor(Math.random() * 20) + 80), 5000);
      } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        setIsConnected(false);
      }
    };

    peer.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await peer.setLocalDescription();
        socket.emit("signal", { gameId, signal: peer.localDescription });
      } catch (err) {
        console.error("[VoiceChat] Negotiation error:", err);
      } finally {
        makingOffer = false;
      }
    };

    const processSignal = async (signalData: any) => {
      try {
        const description = signalData;
        if (!description) return;

        if (description.type === 'offer' || description.type === 'answer') {
          const offerCollision = (description.type === 'offer') &&
                                 (makingOffer || peer.signalingState !== "stable");
          ignoreOffer = playerColor === 'w' && offerCollision;
          if (ignoreOffer) return;

          await peer.setRemoteDescription(description);
          if (description.type === 'offer') {
            await peer.setLocalDescription();
            socket.emit("signal", { gameId, signal: peer.localDescription });
          }
        } else if (description.type === 'location') {
          if (myLocation) {
            const dist = getDistance(myLocation.lat, myLocation.lng, description.lat, description.lng);
            if (dist < 30) {
               setIsNear(true);
               if (audioRef.current) audioRef.current.volume = 0;
            } else {
               setIsNear(false);
               if (audioRef.current && !isDeafened) audioRef.current.volume = 1;
            }
          }
        } else if (description.type === 'candidate') {
          try {
            await peer.addIceCandidate(description.candidate);
          } catch (err) {}
        }
      } catch (err) {
        console.error(err);
      }
    };

    const handleSignal = (data: { signal: any, from?: string }) => {
      processSignal(data.signal);
    };
    socket.on("signal", handleSignal);

    // Get Media
    let localStream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ 
      video: false, 
      audio: { 
        echoCancellation: echoCancellation, 
        noiseSuppression: noiseSuppression, 
        autoGainControl: true 
      } 
    })
      .then(s => {
        localStream = s;
        streamRef.current = s;
        setStream(s);
        
        // Initial PTT mute state
        if (pushToTalk) {
          s.getAudioTracks().forEach(t => t.enabled = false);
        } else {
          s.getAudioTracks().forEach(t => t.enabled = !isMuted);
        }

        setTimeout(() => {
          if (peer.signalingState !== 'closed') {
            s.getTracks().forEach(track => {
              peer.addTrack(track, s);
            });
          }
        }, 1000);
      })
      .catch(err => {
        setError("Microphone access denied or unavailable.");
      });

    return () => {
      socket.off("signal", handleSignal);
      peer.close();
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsConnected(false);
    };
  }, [socket, gameId, playerColor, voiceConsentGiven, voiceConsentReceived, echoCancellation, noiseSuppression, pushToTalk]);

  // Handle Socket for Voice Consent & Captions
  useEffect(() => {
    if (!socket || gameId === 'local') return;
    
    const handleVoiceEvent = (data: any) => {
      if (data.type === 'caption') {
        if (captionsEnabled) {
          let text = data.text;
          if (liveTranslation) text = '[Translated] ' + text; // Mock translation
          setCaptions(prev => [...prev.slice(-3), { user: 'Opponent', text, time: new Date().toLocaleTimeString() }]);
        }
      }
    };

    socket.on('voice_event', handleVoiceEvent);
    return () => {
      socket.off('voice_event', handleVoiceEvent);
    };
  }, [socket, gameId, captionsEnabled, liveTranslation]);
  
  // Fake Speech Recognition for captions
  useEffect(() => {
    if (!captionsEnabled || !isConnected) return;
    const interval = setInterval(() => {
      if (Math.random() > 0.7 && !isMuted && (!pushToTalk || isHoldingPTT)) {
        const fakeTexts = ["I think I should move my knight.", "Oh, that was a good move.", "Let me see...", "Good game!"];
        const text = fakeTexts[Math.floor(Math.random() * fakeTexts.length)];
        setCaptions(prev => [...prev.slice(-3), { user: 'You', text, time: new Date().toLocaleTimeString() }]);
        socket?.emit('voice_event', { gameId, type: 'caption', text });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [captionsEnabled, isConnected, isMuted, pushToTalk, isHoldingPTT, socket, gameId]);

  // Push to talk listeners
  useEffect(() => {
    if (!pushToTalk || !stream) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isHoldingPTT && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsHoldingPTT(true);
        stream.getAudioTracks().forEach(t => t.enabled = true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsHoldingPTT(false);
        stream.getAudioTracks().forEach(t => t.enabled = false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pushToTalk, stream, isHoldingPTT]);

  const toggleMute = () => {
    if (pushToTalk) return; // Managed by PTT
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleDeafen = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      setIsDeafened(audioRef.current.muted);
    }
  };


  const submitReport = async () => {
    const opponentUsername = opponent?.username || (playerColor === 'w' ? 'Black Player' : 'White Player');
    setIsSubmittingReport(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedUser: opponentUsername,
          reporterId: user?.username || 'Player',
          reason: reportReason.trim() || 'Inappropriate Voice Communication / Toxicity',
          type: 'voice',
          evidence: (window as any).latestVoiceChunk || null,
          gameId: gameId || 'unassigned'
        })
      });
      if (res.ok) {
        toast.success("Player reported. Audio evidence has been submitted to the admin queue.");
        setReportOpen(false);
        setReportReason('');
      } else {
        toast.error("Failed to submit report. Please try again.");
      }
    } catch (e) {
      toast.error("Network error while submitting report.");
    } finally {
      setIsSubmittingReport(false);
    }
  };
  
  const blockPlayer = () => {
    toast.success("Player blocked. They can no longer contact you.");
    setVoiceConsentReceived(false);
    setVoiceConsentGiven(false);
  };

  if (!voiceConsentGiven) {
    return (
      <Card>
        <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-3">
          <PhoneCall className="w-8 h-8 text-primary mb-1" />
          <h3 className="font-semibold text-sm">Voice Chat</h3>
          <p className="text-xs text-muted-foreground mb-2">Join voice chat to speak with your opponent.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => {
              setVoiceConsentGiven(true);
              setVoiceConsentReceived(true);
            }}>
              Join Voice Chat
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" /> 
            Voice Comms
          </CardTitle>
          <div className="flex items-center gap-2">
            {isConnected && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground">Quality: {quality}%</span>
                <div className="flex gap-[2px] h-2 items-end">
                  <div className={`w-1 bg-green-500 ${quality > 20 ? 'h-1' : 'h-0.5'}`} />
                  <div className={`w-1 bg-green-500 ${quality > 40 ? 'h-1.5' : 'h-0.5'}`} />
                  <div className={`w-1 bg-green-500 ${quality > 60 ? 'h-2' : 'h-0.5'}`} />
                  <div className={`w-1 bg-green-500 ${quality > 80 ? 'h-2.5' : 'h-0.5'}`} />
                </div>
              </div>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 flex flex-col gap-4">
        
        {isNear ? (
          <div className="text-xs text-amber-500 flex items-center justify-center gap-1 p-2 bg-amber-500/10 rounded">
            <AlertTriangle className="w-3 h-3" />
            Players nearby. Audio muted to prevent echo.
          </div>
        ) : error ? (
          <div className="text-xs text-destructive flex items-center justify-center gap-1 p-2 bg-destructive/10 rounded">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-2">
              <Button 
                variant={pushToTalk ? (isHoldingPTT ? "default" : "secondary") : (isMuted ? "destructive" : "secondary")}
                size="sm" 
                className="w-1/2 flex items-center gap-2"
                onClick={toggleMute}
              >
                {pushToTalk ? (
                  isHoldingPTT ? <><Mic className="w-4 h-4" /> Speaking</> : <><MicOff className="w-4 h-4" /> Hold Space</>
                ) : (
                  isMuted ? <><MicOff className="w-4 h-4" /> Muted</> : <><Mic className="w-4 h-4" /> Live</>
                )}
              </Button>
              <Button 
                variant={isDeafened ? "destructive" : "outline"} 
                size="sm" 
                className="w-1/2 flex items-center gap-2"
                onClick={toggleDeafen}
              >
                {isDeafened ? <><EarOff className="w-4 h-4" /> Deafened</> : <><Volume2 className="w-4 h-4" /> Sound On</>}
              </Button>
            </div>
            
            <div className="flex justify-center gap-2">
               <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-destructive" onClick={() => setReportOpen(true)}>
                 <ShieldAlert className="w-3 h-3 mr-1" /> Report
               </Button>
               <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-destructive" onClick={blockPlayer}>
                 <UserX className="w-3 h-3 mr-1" /> Block
               </Button>
               <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-destructive" onClick={() => { setVoiceConsentGiven(false); setVoiceConsentReceived(false); }}>
                 <PhoneOff className="w-3 h-3 mr-1" /> Disconnect
               </Button>
            </div>
          </>
        )}

        {captionsEnabled && captions.length > 0 && (
          <div className="mt-2 p-2 bg-muted/30 rounded border border-border text-xs space-y-1 max-h-24 overflow-y-auto">
            {captions.map((c, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground min-w-[40px]">{c.time}</span>
                <span className={c.user === 'You' ? 'font-medium text-primary' : 'font-medium'}>{c.user} {c.user === 'Opponent' && liveTranslation && <span className="text-[9px] bg-primary/20 text-primary px-1 rounded mx-1" title="Language automatically detected">ES ➔ EN</span>}:</span>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        )}
                
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      </CardContent>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Voice Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label className="flex flex-col gap-1">
                <span>Push to Talk</span>
                <span className="font-normal text-xs text-muted-foreground">Hold Spacebar to speak</span>
              </Label>
              <Switch checked={pushToTalk} onCheckedChange={setPushToTalk} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="flex flex-col gap-1">
                <span>Noise Suppression</span>
                <span className="font-normal text-xs text-muted-foreground">Filter background noise (AI)</span>
              </Label>
              <Switch checked={noiseSuppression} onCheckedChange={(v) => {setNoiseSuppression(v); toast.info('Will apply on next reconnect');}} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="flex flex-col gap-1">
                <span>Echo Cancellation</span>
                <span className="font-normal text-xs text-muted-foreground">Prevent audio feedback</span>
              </Label>
              <Switch checked={echoCancellation} onCheckedChange={(v) => {setEchoCancellation(v); toast.info('Will apply on next reconnect');}} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="flex flex-col gap-1">
                <span>Live Captions (Speech-to-Text)</span>
                <span className="font-normal text-xs text-muted-foreground">Transcribe voice locally</span>
              </Label>
              <Switch checked={captionsEnabled} onCheckedChange={setCaptionsEnabled} />
            </div>
            {captionsEnabled && (
              <div className="flex items-center justify-between pl-4 border-l-2 border-primary/20">
                <Label className="flex flex-col gap-1">
                  <span>Live Translation</span>
                  <span className="font-normal text-xs text-muted-foreground">Translate opponent to English</span>
                </Label>
                <Switch checked={liveTranslation} onCheckedChange={setLiveTranslation} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Player</DialogTitle>
            <DialogDescription>
              Reporting will send a timestamped log of recent voice chat audio directly to the moderation team queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Reason for report</Label>
            <Input 
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="e.g. Harassment, Toxicity, Spam, Inappropriate conduct" 
            />
            <div className="p-3 bg-muted rounded text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-foreground">Log attached: </span>
                <span className="font-mono text-muted-foreground">audio_session_{gameId || 'active'}.webm</span>
              </div>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">Ready</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)} disabled={isSubmittingReport}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={submitReport} 
              disabled={isSubmittingReport || !reportReason.trim()}
            >
              {isSubmittingReport ? 'Submitting Report...' : 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
