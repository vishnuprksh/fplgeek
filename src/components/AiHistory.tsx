
import { useState, useEffect } from 'react';
import type { Player, Team, Pick } from '../types/fpl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PitchView } from './PitchView';
import { PlayerHistoryModal } from './PlayerHistoryModal';
import './AiHistory.css';

interface AiHistoryProps {
    elements: Player[];
    teams: Team[];
}

interface Transfer {
    in: string;
    out: string;
}

interface SquadPlayer {
    id: number;
    name: string;
    points: number;
    xp: number;
    role: 'C' | 'V' | 'S' | 'B';
    purchase_price?: number;
    current_price?: number;
    selling_price?: number;
    status?: string;
}

interface BacktestResult {
    gw: number;
    points: number;
    net_points: number;
    transfer_cost: number;
    active_chip?: string | null;
    total_xp?: number;
    bank: number;
    free_transfers?: number;
    transfers: Transfer[];
    squad: SquadPlayer[];
}

export function AiHistory({ elements, teams }: AiHistoryProps) {
    const [history, setHistory] = useState<BacktestResult[]>([]);
    const [expandedGW, setExpandedGW] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [showRules, setShowRules] = useState(false);
    const [rulesContent, setRulesContent] = useState('');

    useEffect(() => {
        const loadRules = async () => {
            try {
                const response = await fetch('/manager_rules.md');
                const text = await response.text();
                setRulesContent(text);
            } catch (e) {
                console.error("Failed to load rules", e);
            }
        };
        loadRules();
    }, []);

    useEffect(() => {
        const loadHistory = async () => {
            try {
                // We fetch the new JSON file. Assuming data provider sends the raw JSON.
                // In a real app we might need a specific API endpoint but here we reused the mechanism.
                // Or we can fetch 'ai_manager_history.json' directly if public?
                // The getDataProvider().getBacktestHistory() reads 'backtest_results.json'.
                // I need to change the DataProvider usage OR ensure 'ai_manager_history.json' is read.
                // For now, let's assume I should fetch the new file.

                const response = await fetch('/data/ai_manager_history.json');
                const results: BacktestResult[] = await response.json();
                setHistory(results);

                if (results.length > 0) {
                    setExpandedGW(results[0].gw);
                }
            } catch (e) {
                console.error("Failed to load history", e);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, []);

    const toggleExpand = (gw: number) => {
        setExpandedGW(expandedGW === gw ? null : gw);
    };

    const getPicksFromSquad = (squad: SquadPlayer[]): Pick[] => {
        // Filter starters for pitch view
        const starters = squad.filter(p => p.role !== 'B');

        // PitchView expects specific positions usually, but we can just map 1-11
        // We need to map `element` id.
        return starters.map((p, idx) => ({
            element: p.id,
            position: idx + 1,
            multiplier: p.role === 'C' ? 2 : 1,
            is_captain: p.role === 'C',
            is_vice_captain: p.role === 'V',
            selling_price: p.selling_price || 0,
            purchase_price: p.purchase_price || 0
        }));
    };

    const totalNetPoints = history.reduce((sum, h) => sum + h.net_points, 0);
    const avgNetPoints = history.length > 0 ? totalNetPoints / history.length : 0;
    const totalTransfers = history.reduce((sum, h) => sum + h.transfers.length, 0);
    const totalPredicted = history.reduce((sum, h) => sum + (h.total_xp || 0), 0);

    const getChipLabel = (chip: string) => {
        switch (chip) {
            case 'wildcard': return 'WC';
            case 'freehit': return 'FH';
            case 'bench_boost': return 'BB';
            case 'triple_captain': return 'TC';
            default: return chip;
        }
    };

    if (loading) return <div style={{ padding: '20px', color: 'white' }}>Loading Simulation...</div>;

    return (
        <div className="ai-history-container">
            <div className="history-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: '#fff' }}>AI Manager History</h2>
                <button
                    className="rules-btn"
                    onClick={() => setShowRules(true)}
                    style={{
                        padding: '8px 16px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <span role="img" aria-label="book">📜</span> Manager Rules
                </button>
            </div>

            <div className="history-summary">
                <div className="stat-card">
                    <h3>Tot Actual Points</h3>
                    <div className="stat-value highlight">{totalNetPoints}</div>
                </div>
                <div className="stat-card">
                    <h3>Tot Predicted</h3>
                    <div className="stat-value">{totalPredicted.toFixed(0)}</div>
                </div>
                <div className="stat-card">
                    <h3>Avg per GW</h3>
                    <div className="stat-value">{avgNetPoints.toFixed(1)}</div>
                </div>
                <div className="stat-card">
                    <h3>Tot Transfers</h3>
                    <div className="stat-value">{totalTransfers}</div>
                </div>
                <div className="stat-card">
                    <h3>Current Bank</h3>
                    <div className="stat-value">£{(history.length > 0 ? history[history.length - 1].bank : 0).toFixed(1)}m</div>
                </div>
                <div className="stat-card">
                    <h3>Current FTs</h3>
                    <div className="stat-value">{history.length > 0 ? (history[history.length - 1].free_transfers ?? 1) : 1}</div>
                </div>
            </div>

            {/* Chip Usage Summary */}
            <div className="chip-summary-container">
                {['wildcard', 'freehit', 'bench_boost', 'triple_captain'].map(chip => {
                    // Find if/when this chip was used
                    // Note: We might use chips multiple times now (renewal), so find ALL usages
                    const usages = history.filter(h => h.active_chip === chip).map(h => h.gw);
                    const label = getChipLabel(chip);

                    return (
                        <div key={chip} className={`chip-status-card ${usages.length > 0 ? 'used' : 'available'}`}>
                            <span className="chip-name">{label}</span>
                            {usages.length > 0 ? (
                                <span className="chip-used-at">GW {usages.join(', ')}</span>
                            ) : (
                                <span className="chip-available-tag">AVAIL</span>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="gameweek-list">
                {history.map(h => {
                    return (
                        <div key={h.gw} className="gw-card">
                            <div className="gw-header" onClick={() => toggleExpand(h.gw)}>
                                <div className="gw-info">
                                    <span className="gw-label">
                                        GW {h.gw}
                                        {h.squad.some(p => p.status && p.status !== 'a') && (
                                            <span title="Squad contains injured/unavailable players" style={{
                                                marginLeft: '6px',
                                                color: '#eab308',
                                                fontSize: '0.9em'
                                            }}>⚠️</span>
                                        )}
                                    </span>
                                    <span className="gw-points">
                                        <strong className={h.net_points >= 60 ? 'high-score' : 'med-score'}>{h.net_points}</strong> pts
                                        <span style={{ fontSize: '0.8em', opacity: 0.7, marginLeft: '8px' }}>
                                            (xP: {h.total_xp ? h.total_xp.toFixed(1) : '0.0'})
                                        </span>
                                    </span>
                                    {h.transfer_cost > 0 && <span className="gw-hits">(-{h.transfer_cost} hit)</span>}
                                    <span className="gw-transfers-badge">
                                        {h.transfers.length > 0 ? `${h.transfers.length} Tx` : 'No Tx'}
                                        <span style={{ fontSize: '0.8em', marginLeft: '6px', opacity: 0.8 }}>
                                            (£{h.bank.toFixed(1)}m, {h.free_transfers ?? 1} FT)
                                        </span>
                                    </span>
                                    {h.active_chip && (
                                        <span className={`chip-badge chip-${h.active_chip}`}>
                                            {getChipLabel(h.active_chip)}
                                        </span>
                                    )}
                                </div>
                                <div className="expand-icon">{expandedGW === h.gw ? '▲' : '▼'}</div>
                            </div>

                            {expandedGW === h.gw && (
                                <div className="gw-body">
                                    {/* Transfers Section */}
                                    {h.transfers.length > 0 && (
                                        <div className="transfers-section">
                                            <h4>Transfers Made</h4>
                                            {h.transfers.map((t, i) => (
                                                <div key={i} className="transfer-row">
                                                    <span className="tx-out">OUT: {t.out}</span>
                                                    <span className="tx-arrow">➔</span>
                                                    <span className="tx-in">IN: {t.in}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Pitch View */}
                                    <PitchView
                                        picks={getPicksFromSquad(h.squad)}
                                        elements={elements as any}
                                        teams={teams}
                                        onPlayerClick={(p) => setSelectedPlayer(p)}
                                        isOptimizing={false}
                                        predictions={h.squad.reduce((acc, p) => ({
                                            ...acc,
                                            [p.id]: { totalForecast: p.xp * 5 }
                                        }), {})}
                                        points={h.squad.reduce((acc, p) => ({
                                            ...acc,
                                            [p.id]: p.points
                                        }), {})}
                                        statuses={h.squad.reduce((acc, p) => ({
                                            ...acc,
                                            [p.id]: p.status || 'a'
                                        }), {})}
                                    />

                                    {/* Bench Section */}
                                    <div className="bench-section">
                                        <h4>Bench</h4>
                                        <div className="bench-list">
                                            {h.squad.filter(p => p.role === 'B').map(p => (
                                                <div key={p.id} className="bench-player">
                                                    {p.name} ({p.points}pts) - £{(p.selling_price || 0).toFixed(1)}m
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Detailed Stats */}
                                    <div className="squad-list-text" style={{ marginTop: '1rem' }}>
                                        <h4>Detailed Score</h4>
                                        <ul>
                                            {h.squad.map(p => {
                                                const teamName = teams.find(t => {
                                                    const playerMeta = elements.find(el => el.id === p.id);
                                                    return t.id === playerMeta?.team;
                                                })?.short_name;

                                                const isCap = p.role === 'C';

                                                return (
                                                    <li key={p.id} className={`player-row role-${p.role}`}>
                                                        <span className="player-name">
                                                            {p.name} ({teamName})
                                                            {isCap && <span className="c-badge">C</span>}
                                                            {p.role === 'V' && <span className="v-badge">V</span>}
                                                            {p.status && p.status !== 'a' && (
                                                                <span title="Injured/Unavailable" style={{
                                                                    marginLeft: '4px',
                                                                    color: '#eab308',
                                                                    fontSize: '0.9em'
                                                                }}>⚠️</span>
                                                            )}
                                                        </span>
                                                        <span className="player-price">£{(p.selling_price || 0).toFixed(1)}m</span>
                                                        <span className="player-xp">xP: {p.xp.toFixed(1)}</span>
                                                        <span className="player-actual">
                                                            {isCap ? `${p.points * 2}` : p.points} pts
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {selectedPlayer && (
                <PlayerHistoryModal
                    player={selectedPlayer}
                    history={history}
                    onClose={() => setSelectedPlayer(null)}
                    teamName={teams.find(t => t.id === selectedPlayer.team)?.short_name}
                />
            )}

            {showRules && (
                <div className="modal-overlay" onClick={() => setShowRules(false)} style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                        background: '#1e293b',
                        padding: '30px',
                        borderRadius: '12px',
                        maxWidth: '800px',
                        width: '90%',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px' }}>
                            <h2 style={{ margin: 0, color: '#fff' }}>Manager Rules</h2>
                            <button onClick={() => setShowRules(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
                        </div>
                        <div className="markdown-content" style={{ color: '#e2e8f0', lineHeight: '1.6', padding: '0 10px' }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rulesContent}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
