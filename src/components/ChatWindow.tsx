import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { aiService, type AnalysisType } from '../services/aiService';
import type { TeamEntry, Pick, Player } from '../types/fpl';
interface ChatSession {
    sendMessage: (message: string) => Promise<{
        response: {
            text: () => string;
        };
    }>;
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
    const [analysisType, setAnalysisType] = useState<AnalysisType>('general');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const startChat = async () => {
        if (!teamData) return;
        setLoading(true);
        setError(null);

        try {
            // Context construction similar to ReportGenerator
            let performance = `Rank: ${teamData.summary_overall_rank}, Total Points: ${teamData.summary_overall_points}, GW Points: ${teamData.summary_event_points}`;
            let playerList = "";
            let strengths = "High Value Squad";
            let weaknesses = "Mixed Fixtures";

            if (picks && elements && picks.length > 0) {
                const activePlayers = picks.map(p => elements.find(e => e.id === p.element)).filter(Boolean) as Player[];
                const starters = activePlayers.slice(0, 11);
                playerList = starters.map(p => `${p.web_name} (${p.element_type === 1 ? 'GKP' : p.element_type === 2 ? 'DEF' : p.element_type === 3 ? 'MID' : 'FWD'}, Form: ${p.form || '0.0'})`).join(', ');

                const avgForm = starters.reduce((acc, p) => acc + (parseFloat(p.form || '0') || 0), 0) / 11;
                const highOwnership = starters.filter(p => (parseFloat(p.selected_by_percent || '0') || 0) > 30).length;
                const differentials = starters.filter(p => (parseFloat(p.selected_by_percent || '0') || 0) < 10).length;

                strengths = `Avg Form: ${avgForm.toFixed(1)}, High Ownership Players: ${highOwnership}`;
                weaknesses = `Differentials: ${differentials}, Squad Value: ${(teamData.current_event_squad_total_value / 10).toFixed(1)}m`;
                performance += `\nSquad: ${playerList}`;
            }

            const chat = await aiService.startChat(teamData.name, performance, strengths, weaknesses, analysisType);
            setChatSession(chat);

            // Get initial response
            const result = await chat.sendMessage("Start analysis");
            const responseText = result.response.text();

            setMessages([{ role: 'model', text: responseText }]);

        } catch (err) {
            console.error(err);
            setError("Failed to start chat. Please try again.");
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
            const result = await chatSession.sendMessage(userMsg);
            const responseText = result.response.text();
            setMessages(prev => [...prev, { role: 'model', text: responseText }]);
        } catch (err) {
            console.error(err);
            setError("Failed to send message.");
        } finally {
            setLoading(false);
        }
    };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setAnalysisType(e.target.value as AnalysisType);
        // Optional: Reset chat if type changes? For now just let it affect the *next* start.
        // If user wants to restart with new type, they can refresh or we could provide a reset button.
        // Ideally, if a chat hasn't started, it just updates the state. 
        // If it HAS started, maybe we should warn or auto-restart.
        // For simplicity, let's keep it as a pre-chat configuration or just update state. 
        // But the prompt is sent at startChat. So changing it mid-chat won't retarget the system instruction easily unless we restart.
        if (chatSession) {
            setChatSession(null);
            setMessages([]);
        }
    };

    if (!teamData) {
        return <div className="chat-window placeholder">Select a team to start analysis.</div>;
    }

    return (
        <div className="chat-window">
            <div className="chat-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <h3>AI Assistant</h3>
                    <select
                        value={analysisType}
                        onChange={handleTypeChange}
                        className="analysis-type-select"
                        style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            fontSize: '0.9rem',
                            backgroundColor: '#fff',
                            color: '#333'
                        }}
                    >
                        <option value="general">General Team Analysis</option>
                        <option value="player">Player by Player</option>
                        <option value="buy-hold-sell">BUY / HOLD / SELL</option>
                    </select>
                </div>
                {loading && <span className="loading-indicator">Thinking...</span>}
            </div>

            <div className="chat-messages">
                {!chatSession && messages.length === 0 && (
                    <div className="initial-state">
                        <p>Get a personalized analysis of your team and discuss strategy.</p>
                        <button onClick={startChat} className="start-chat-btn">
                            Start Analysis ({analysisType === 'general' ? 'General' : analysisType === 'player' ? 'Player Focus' : 'Transfer Market'})
                        </button>
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
