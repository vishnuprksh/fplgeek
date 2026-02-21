import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { openRouterService } from '../services/openRouterService';
import type { TeamEntry, Pick, Player } from '../types/fpl';

interface ChatSession {
    sendMessage: (message: string) => Promise<string>;
    getMessages: () => Array<{ role: string, content: string }>;
}

interface ChatWindowProps {
    teamData: TeamEntry | null;
    picks?: Pick[];
    elements?: Player[];
}

interface Message {
    role: 'user' | 'model';
    text: string;
}

export function ChatWindow({ teamData, picks, elements }: ChatWindowProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [chatSession, setChatSession] = useState<ChatSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Automatically start the chat session once data is available
    useEffect(() => {
        if (teamData && picks && elements && !chatSession) {
            startChat();
        }
    }, [teamData, picks, elements]);

    const startChat = async () => {
        if (!teamData || !picks || !elements) return;
        setLoading(true);
        setError(null);

        try {
            const chat = await openRouterService.startChat(teamData, picks, elements);
            setChatSession(chat);

            // Optional: Send an initial invisible prompt to get the agent to introduce itself
            const responseText = await chat.sendMessage("Hi! Please introduce yourself to the user and briefly mention what tools you have available. Keep it under 2 sentences.");

            setMessages([{ role: 'model', text: responseText }]);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to start chat. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || !chatSession) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            const responseText = await chatSession.sendMessage(userMsg);
            setMessages(prev => [...prev, { role: 'model', text: responseText }]);
        } catch (err: any) {
            console.error(err);
            setError("Failed to send message.");
        } finally {
            setLoading(false);
        }
    };


    if (!teamData) {
        return <div className="chat-window placeholder">Select a team to start analysis.</div>;
    }

    return (
        <div className="chat-window">
            <div className="chat-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <h3>AI Assistant (GLM-4.7-Flash Agent)</h3>
                </div>
                {loading && <span className="loading-indicator">Thinking...</span>}
            </div>

            <div className="chat-messages">
                {!chatSession && messages.length === 0 && (
                    <div className="initial-state">
                        <p>Initializing agent and loading your team data...</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`message-bubble ${msg.role}`}>
                        <div className="message-content">
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="chat-input-area">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask a follow-up question..."
                    disabled={loading || (!chatSession && messages.length === 0)}
                    className="chat-input"
                />
                <button type="submit" disabled={loading || !input.trim() || (!chatSession && messages.length === 0)} className="send-btn">
                    ➤
                </button>
            </form>
            {error && <div className="error-message small">{error}</div>}
        </div>
    );
}
