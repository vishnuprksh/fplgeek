
import { useState, useEffect } from 'react';
import type { Player, Team } from '../types/fpl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
    xp_5gw?: number;
    sum_prob_6_5gw?: number;
    prob_gt_10?: number;
    prob_gt_6?: number;
    role: 'C' | 'V' | 'S' | 'B';
    purchase_price?: number;
    current_price?: number;
    selling_price?: number;
    status?: string;
    injury_chance?: number;
    prob_gt_7?: number;
    prob_gt_11?: number;
    form?: number;
}

interface BacktestResult {
    gw: number;
    points: number;
    net_points: number;
    transfer_cost?: number;
    event_transfers_cost?: number;
    active_chip?: string | null;
    total_xp?: number;
    team_prob_gt_target?: number;
    bank?: number;
    free_transfers?: number;
    transfers: Transfer[];
    squad: SquadPlayer[];
    season?: string;
}

export function AiHistory({ elements }: AiHistoryProps) {
    const [history, setHistory] = useState<BacktestResult[]>([]);
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
                const response = await fetch('/data/ai_manager_history.json');
                const allResults: BacktestResult[] = await response.json();

                // Filter for current season (assuming the first entry has the latest season)
                // The user specifically requested "this season"
                const currentSeason = allResults.length > 0 ? allResults[0].season : "25/26";
                const results = allResults.filter(r => r.season === currentSeason);

                setHistory(results);
            } catch (e) {
                console.error("Failed to load history", e);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, []);


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
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <h2 style={{ margin: 0, color: '#fff' }}>AI Manager History</h2>
                </div>
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
                    <div className="stat-value">£{(history.length > 0 ? (history[history.length - 1].bank ?? 0) : 0).toFixed(1)}m</div>
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

            <div className="history-table-view">
                <div className="table-scroll-container">
                    <table className="evolution-table">
                        <thead>
                            <tr>
                                <th className="sticky-col">Squad Slot</th>
                                {history.map(h => (
                                    <th key={h.gw}>
                                        <div className="gw-col-header">
                                            <span>GW {h.gw}</span>
                                            <div className="gw-col-summary">
                                                <span className="gw-col-pts">{h.net_points}pts</span>
                                                {h.active_chip && <span className={`chip-dot chip-${h.active_chip}`} title={h.active_chip}></span>}
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                // Build slot tracking across all gameweeks
                                const slotTracking: { [slotIdx: number]: { [gw: number]: any } } = {};

                                // Initialize slots from first gameweek
                                if (history.length > 0) {
                                    const firstGW = history[0];
                                    const sortedFirstSquad = [...firstGW.squad].sort((a, b) => {
                                        const elA = elements.find(el => el.id === a.id || el.id.toString() === a.name);
                                        const elB = elements.find(el => el.id === b.id || el.id.toString() === b.name);

                                        // Sort by position first
                                        const typeA = elA?.element_type || (a.role === 'B' ? 5 : 1);
                                        const typeB = elB?.element_type || (b.role === 'B' ? 5 : 1);

                                        if (typeA !== typeB) return typeA - typeB;

                                        // Within same position, starters before bench
                                        const roleOrderA = a.role === 'B' ? 1 : 0;
                                        const roleOrderB = b.role === 'B' ? 1 : 0;
                                        if (roleOrderA !== roleOrderB) return roleOrderA - roleOrderB;

                                        return (a.id || 0) - (b.id || 0);
                                    });

                                    sortedFirstSquad.forEach((player, idx) => {
                                        slotTracking[idx] = { [firstGW.gw]: player };
                                    });
                                }

                                // Track players across gameweeks, handling transfers
                                for (let gwIdx = 1; gwIdx < history.length; gwIdx++) {
                                    const currentGW = history[gwIdx];
                                    const prevGW = history[gwIdx - 1];

                                    // Build a map of current squad by player identifier
                                    const currentSquadMap = new Map();
                                    currentGW.squad.forEach(p => {
                                        const key = p.id || p.name;
                                        currentSquadMap.set(key, p);
                                    });

                                    // For each slot, determine which player occupies it
                                    Object.keys(slotTracking).forEach(slotIdxStr => {
                                        const slotIdx = parseInt(slotIdxStr);
                                        const prevPlayer = slotTracking[slotIdx][prevGW.gw];

                                        if (!prevPlayer) return;

                                        const prevKey = prevPlayer.id || prevPlayer.name;

                                        // Check if this player was transferred out
                                        const wasTransferredOut = currentGW.transfers.some(t =>
                                            t.out === prevPlayer.name || t.out === prevKey.toString()
                                        );

                                        if (wasTransferredOut) {
                                            // Find the replacement player (transferred in)
                                            const transfer = currentGW.transfers.find(t =>
                                                t.out === prevPlayer.name || t.out === prevKey.toString()
                                            );

                                            if (transfer) {
                                                // Find the new player in current squad
                                                const newPlayer = currentGW.squad.find(p =>
                                                    p.name === transfer.in || p.id?.toString() === transfer.in
                                                );

                                                if (newPlayer) {
                                                    slotTracking[slotIdx][currentGW.gw] = newPlayer;
                                                }
                                            }
                                        } else {
                                            // Player continues in same slot
                                            const continuingPlayer = currentSquadMap.get(prevKey);
                                            if (continuingPlayer) {
                                                slotTracking[slotIdx][currentGW.gw] = continuingPlayer;
                                            }
                                        }
                                    });
                                }

                                // Render rows based on slot tracking
                                return Object.keys(slotTracking).sort((a, b) => parseInt(a) - parseInt(b)).map(slotIdxStr => {
                                    const slotIdx = parseInt(slotIdxStr);

                                    const getSlotLabel = (idx: number) => {
                                        if (idx < 2) return `GKP ${idx + 1}`;
                                        if (idx < 7) return `DEF ${idx - 1}`;
                                        if (idx < 12) return `MID ${idx - 6}`;
                                        return `FWD ${idx - 11}`;
                                    };

                                    return (
                                        <tr key={slotIdx}>
                                            <td className="sticky-col slot-label">{getSlotLabel(slotIdx)}</td>
                                            {history.map((h, gwIdx) => {
                                                const player = slotTracking[slotIdx][h.gw];
                                                if (!player) return <td key={h.gw}>-</td>;

                                                const isTransferredIn = h.transfers.some(t =>
                                                    t.in === player.name || t.in === (player.id?.toString())
                                                );

                                                // Check if this player is transferred out in the NEXT gameweek
                                                const nextGW = gwIdx < history.length - 1 ? history[gwIdx + 1] : null;
                                                const isTransferredOut = nextGW ? nextGW.transfers.some(t =>
                                                    t.out === player.name || t.out === (player.id?.toString())
                                                ) : false;

                                                const isCaptain = player.role === 'C';
                                                const isBench = player.role === 'B';

                                                return (
                                                    <td
                                                        key={h.gw}
                                                        className={`${isTransferredIn ? 'transfer-in' : ''} ${isTransferredOut ? 'transfer-out' : ''} ${isCaptain ? 'is-captain' : ''} ${isBench ? 'bench-player-cell' : ''}`}
                                                        onClick={() => {
                                                            const p = elements.find(e => e.id === player.id || e.id.toString() === player.name);
                                                            if (p) setSelectedPlayer(p);
                                                        }}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        <div className="cell-player">
                                                            <span className="cell-name">
                                                                {(() => {
                                                                    // Try to resolve name if it looks like an ID
                                                                    const nameIsId = !isNaN(Number(player.name));
                                                                    if (nameIsId) {
                                                                        const el = elements.find(e => e.id.toString() === player.name);
                                                                        return el ? el.web_name : player.name;
                                                                    }
                                                                    return player.name;
                                                                })()}
                                                            </span>
                                                            <div className="cell-meta">
                                                                <span className="cell-pts">{player.points}p</span>
                                                                <span className="cell-role">{player.role}</span>
                                                                {player.prob_gt_6 !== undefined && (
                                                                    <span className="cell-prob" style={{
                                                                        fontSize: '0.7em',
                                                                        marginLeft: '4px',
                                                                        color: player.prob_gt_6 > 0.5 ? '#4ade80' : player.prob_gt_6 > 0.3 ? '#fbbf24' : '#ef4444'
                                                                    }}>
                                                                        P:{(player.prob_gt_6 * 100).toFixed(0)}%
                                                                    </span>
                                                                )}
                                                                {player.form !== undefined && (
                                                                    <span className="cell-form" style={{
                                                                        fontSize: '0.7em',
                                                                        marginLeft: '4px',
                                                                        color: player.form < 3.0 ? '#ef4444' : '#4ade80'
                                                                    }}>
                                                                        F:{player.form.toFixed(1)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedPlayer && (
                <PlayerHistoryModal
                    player={selectedPlayer}
                    history={history}
                    onClose={() => setSelectedPlayer(null)}
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
