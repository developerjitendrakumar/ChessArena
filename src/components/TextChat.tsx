import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: number;
}

const QUICK_CHATS = ["Hi!", "Good luck!", "Nice move!", "Oops", "Well played", "Thanks!"];

export function TextChat() {
  const { socket, gameId, user, timeControl } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket || !gameId || gameId === 'local-ai') return;

    const handleMessage = (data: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      setMessages(prev => [...prev, { ...data, id: Math.random().toString(), timestamp: Date.now() }]);
    };

    socket.on('chat_message', handleMessage);
    return () => {
      socket.off('chat_message', handleMessage);
    };
  }, [socket, gameId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendSpecificMessage = (messageText: string) => {
    if (!messageText.trim() || !gameId || !user) return;
    
    if (gameId === 'local-ai') {
      // Local chat for AI
      setMessages(prev => [...prev, { id: Math.random().toString(), sender: user.username, message: messageText, timestamp: Date.now() }]);
      
      // Simulate AI response
      setTimeout(() => {
         const responses = ["I'm just a bot!", "Beep boop.", "Focus on the game!", "Checkmate is near."];
         const aiResponse = responses[Math.floor(Math.random() * responses.length)];
         setMessages(prev => [...prev, { id: Math.random().toString(), sender: 'AI Bot', message: aiResponse, timestamp: Date.now() }]);
      }, 1000);
      return;
    }

    if (socket) {
      socket.emit('chat_message', {
        gameId,
        message: messageText,
        sender: user.username,
        email: user.email
      });
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendSpecificMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-background/50">
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm mt-4">
            No messages yet. Say hi!
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === user?.username ? 'items-end' : 'items-start'}`}>
            <span className="text-xs text-muted-foreground mb-1">{msg.sender}</span>
            <div className={`px-3 py-2 rounded-lg text-sm max-w-[80%] ${msg.sender === user?.username ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground border border-border shadow-sm'}`}>
              {msg.message}
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-2 border-t border-border flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {QUICK_CHATS.map(msg => (
          <Button 
            key={msg} 
            variant="secondary" 
            size="sm" 
            className="text-xs py-1 h-7 rounded-full flex-shrink-0"
            onClick={() => sendSpecificMessage(msg)}
          >
            {msg}
          </Button>
        ))}
      </div>

      <form onSubmit={sendMessage} className="p-3 bg-card border-t border-border flex gap-2">
        <Input 
          value={input} 
          onChange={e => setInput(e.target.value)} 
          placeholder="Type a message..." 
          className="flex-1 bg-background border-border"
        />
        <Button type="submit" size="icon">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
