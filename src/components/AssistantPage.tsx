import React, { useState, useRef, useEffect, Component } from 'react';
import type { TeamEntry, Pick, Player } from '../types/fpl';
import { runAgentLoop, type ConversationEntry, type AgentContext } from '../services/multiAgentService';
import './AssistantPage.css';

// ── Error Boundary ────────────────────────────────────────────────────────────
class EntryErrorBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
    constructor(props: any) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(err: Error) { return { error: err.message }; }
    render() {
        if (this.state.error) {
            return <div style={{ color: '#f87171', padding: '12px', fontSize: '0.8em' }}>Render error: {this.state.error}</div>;
        }
        return this.props.children;
    }
}

// ── Crash-safe markdown renderer ─────────────────────────────────────────────
function inlineFmt(str: string): React.ReactNode {
    if (!str) return null;
    const segments: React.ReactNode[] = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0, k = 0;
    let match;
    while ((match = re.exec(str)) !== null) {
        if (match.index > last) segments.push(str.slice(last, match.index));
        segments.push(<strong key={k++}>{match[1]}</strong>);
        last = match.index + match[0].length;
    }
    if (last < str.length) segments.push(str.slice(last));
    if (segments.length === 0) return null;
    if (segments.length === 1) return segments[0];
    return <>{segments}</>;
}

function renderMarkdown(text: string): React.ReactNode {
    if (!text) return null;
    const lines = text.split('\n');
    const out: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];
    let tableRows: string[][] = [];
    let listKey = 0;
    let tableKey = 0;

    const flushList = () => {
        if (listItems.length > 0) {
            out.push(<ul key={`ul-${listKey++}`}>{listItems}</ul>);
            listItems = [];
        }
    };

    const flushTable = () => {
        if (tableRows.length > 0) {
            // Filter out separator rows like |---|---|
            const filteredRows = tableRows.filter(row => !row.every(cell => cell.trim().match(/^-+$/)));
            if (filteredRows.length > 0) {
                out.push(
                    <table key={`table-${tableKey++}`}>
                        <thead>
                            <tr>
                                {filteredRows[0].map((cell, idx) => <th key={idx}>{inlineFmt(cell.trim())}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.slice(1).map((row, rIdx) => (
                                <tr key={rIdx}>
                                    {row.map((cell, cIdx) => <td key={cIdx}>{inlineFmt(cell.trim())}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );
            }
            tableRows = [];
        }
    };

    lines.forEach((line, i) => {
        const trimmed = line.trim();
        const isTableLine = trimmed.startsWith('|') && trimmed.endsWith('|');
        const isListItem = line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line);

        if (!isListItem) flushList();
        if (!isTableLine) flushTable();

        if (isTableLine) {
            const cells = line.split('|').slice(1, -1);
            tableRows.push(cells);
        } else if (line.startsWith('### ')) {
            out.push(<h3 key={i}>{inlineFmt(line.slice(4))}</h3>);
        } else if (line.startsWith('## ')) {
            out.push(<h2 key={i}>{inlineFmt(line.slice(3))}</h2>);
        } else if (line.startsWith('# ')) {
            out.push(<h2 key={i}>{inlineFmt(line.slice(2))}</h2>);
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            listItems.push(<li key={i}>{inlineFmt(line.slice(2))}</li>);
        } else if (/^\d+\.\s/.test(line)) {
            listItems.push(<li key={i}>{inlineFmt(line.replace(/^\d+\.\s/, ''))}</li>);
        } else if (line.trim() === '') {
            // skip blank lines
        } else {
            out.push(<p key={i}>{inlineFmt(line)}</p>);
        }
    });
    flushList();
    flushTable();
    return <>{out}</>;
}

// ── Entry card ────────────────────────────────────────────────────────────────

interface EntryCardProps {
    entry: ConversationEntry;
    startExpanded?: boolean;
}

const AGENT_META: Record<string, { avatar: string; name: string; avatarClass: string; nameClass: string; iterClass: string; entryClass: string }> = {
    researcher: {
        avatar: '🔬', name: 'Researcher',
        avatarClass: 'avatar-researcher', nameClass: 'name-researcher',
        iterClass: 'iter-researcher', entryClass: 'entry-researcher',
    },
    manager: {
        avatar: '👔', name: 'Manager',
        avatarClass: 'avatar-manager', nameClass: 'name-manager',
        iterClass: 'iter-manager', entryClass: 'entry-manager',
    },
    system: {
        avatar: '✅', name: 'System',
        avatarClass: 'avatar-system', nameClass: 'name-system',
        iterClass: 'iter-system', entryClass: 'entry-system',
    },
};

const EntryCard: React.FC<EntryCardProps> = ({ entry, startExpanded = true }) => {
    const [expanded, setExpanded] = useState(startExpanded);
    const meta = AGENT_META[entry.role] ?? AGENT_META.system;
    const timeStr = entry.timestamp instanceof Date
        ? entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '';

    return (
        <EntryErrorBoundary>
            <div className={`conversation-entry ${meta.entryClass}`}>
                <div className="entry-header" onClick={() => setExpanded(v => !v)}>
                    <div className={`entry-avatar ${meta.avatarClass}`}>{meta.avatar}</div>
                    <div className="entry-meta">
                        <span className={`entry-agent-name ${meta.nameClass}`}>{meta.name}</span>
                        <span className="entry-time">{timeStr}</span>
                    </div>
                    {entry.role !== 'system' && (
                        <span className={`entry-iter-badge ${meta.iterClass}`}>Iter {entry.iteration}</span>
                    )}
                    <span className="entry-toggle">{expanded ? '▲' : '▼'}</span>
                </div>
                {expanded && (
                    <div className="entry-body">
                        <div className="entry-content">
                            {renderMarkdown(entry.content)}
                        </div>
                    </div>
                )}
            </div>
        </EntryErrorBoundary>
    );
};

// ── Main page ────────────────────────────────────────────────────────────────

interface AssistantPageProps {
    teamData: TeamEntry | null;
    picks: Pick[];
    elements: Player[] | undefined;
    predictionsMap: Record<number, any>;
    t100OwnershipMap: Record<number, any>;
}

export const AssistantPage: React.FC<AssistantPageProps> = ({
    teamData, picks, elements, predictionsMap, t100OwnershipMap,
}) => {
    const [isRunning, setIsRunning] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [status, setStatus] = useState('');
    const [conversation, setConversation] = useState<ConversationEntry[]>([]);
    const [currentIteration, setCurrentIteration] = useState(0);
    const feedBottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        feedBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation]);

    const handleStart = async () => {
        if (!teamData || !elements) return;
        setConversation([]);
        setIsRunning(true);
        setIsDone(false);
        setStatus('🚀 Initializing agents...');
        setCurrentIteration(0);

        const ctx: AgentContext = { teamData, picks, elements, predictionsMap, t100OwnershipMap };

        try {
            await runAgentLoop(
                ctx,
                (entry) => {
                    setConversation(prev => [...prev, entry]);
                    if (entry.role !== 'system') setCurrentIteration(entry.iteration);
                },
                (s) => {
                    setStatus(s);
                    const m = s.match(/Iteration (\d+)/);
                    if (m) setCurrentIteration(Number(m[1]));
                }
            );
        } catch (err: any) {
            setConversation(prev => [...prev, {
                role: 'system',
                content: `❌ Error: ${err.message}`,
                iteration: 0,
                timestamp: new Date(),
            }]);
        } finally {
            setIsRunning(false);
            setIsDone(true);
            setStatus('Analysis complete.');
        }
    };

    const handleReset = () => {
        setConversation([]);
        setIsDone(false);
        setStatus('');
        setCurrentIteration(0);
    };

    const hasNoTeam = !teamData || !elements;

    return (
        <div className="assistant-page fade-in">
            {/* Header card */}
            <div className="assistant-header-card">
                <div className="assistant-header-info">
                    <h2 className="assistant-title">🤖 Multi-Agent Transfer Advisor</h2>
                    <p className="assistant-subtitle">
                        Two AI agents debate your squad — a data-driven Researcher and a rules-strict Manager — to find the optimal transfers.
                    </p>
                    <div className="assistant-meta">
                        <span className="meta-pill green">Gemini Flash</span>
                        <span className="meta-pill">Max 10 Iterations</span>
                        <span className="meta-pill">Web Grounding</span>
                        {teamData && <span className="meta-pill green">✓ {teamData.name}</span>}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                    <button
                        className="start-analysis-btn"
                        onClick={handleStart}
                        disabled={isRunning || hasNoTeam}
                    >
                        {isRunning ? '⏳ Analyzing...' : isDone ? '▶ Run Again' : '▶ Start Analysis'}
                    </button>
                    {(isDone || conversation.length > 0) && !isRunning && (
                        <button className="reset-btn" onClick={handleReset}>✕ Clear</button>
                    )}
                </div>
            </div>

            {/* No team warning */}
            {hasNoTeam && (
                <div className="no-team-warning">
                    ⚠️ Please load a team from the Dashboard first, then return to the Advisor.
                </div>
            )}

            {/* Live status bar */}
            {isRunning && (
                <div className="assistant-status-bar">
                    <div className="status-dot" />
                    <span className="status-text">{status}</span>
                    {currentIteration > 0 && (
                        <span className="iter-badge">{currentIteration} / 10</span>
                    )}
                </div>
            )}

            {/* Conversation feed */}
            {conversation.length > 0 && (
                <div className="conversation-feed">
                    {conversation.map((entry, idx) => (
                        <EntryCard key={idx} entry={entry} startExpanded={true} />
                    ))}
                    <div ref={feedBottomRef} />
                </div>
            )}

            {/* Idle state */}
            {conversation.length === 0 && !isRunning && (
                <div className="assistant-idle">
                    <div className="idle-orb" />
                    <div className="idle-icon">🧠</div>
                    <h3>Agents Ready</h3>
                    <p>
                        Click <strong>Start Analysis</strong> to begin the multi-agent debate. The Researcher gathers FPL data and proposes transfers; the Manager evaluates them against proven rules.
                    </p>
                    <div className="agent-chips">
                        <span className="agent-chip chip-researcher">🔬 Researcher — FPL Data + Web Search</span>
                        <span className="agent-chip chip-manager">👔 Manager — Rules Evaluator</span>
                    </div>
                </div>
            )}
        </div>
    );
};
