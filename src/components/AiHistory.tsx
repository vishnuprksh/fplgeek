
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

export function AiHistory({ elements, teams }: AiHistoryProps) {
    const [history, setHistory] = useState<BacktestResult[]>([]);
    const [expandedGW, setExpandedGW] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [showRules, setShowRules] = useState(false);
    const [rulesContent, setRulesContent] = useState('');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <h2 style={{ margin: 0, color: '#fff' }}>AI Manager History</h2>
                    <div className="view-toggle">
                        <button
                            className={`toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
                            onClick={() => setViewMode('cards')}
                        >
                            Pitch View
                        </button>
                        <button
                            className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            Table View
                        </button>
                    </div>
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

            {viewMode === 'cards' ? (
                <div className="gameweek-list">
                    {history.map(h => {
                        const cost = h.transfer_cost ?? h.event_transfers_cost ?? 0;
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
                                            {h.team_prob_gt_target !== undefined && (
                                                <span style={{
                                                    fontSize: '0.8em',
                                                    marginLeft: '8px',
                                                    color: (h.team_prob_gt_target > 0.5 ? '#4ade80' : '#94a3b8')
                                                }}>
                                                    Win Prob: {(h.team_prob_gt_target * 100).toFixed(0)}%
                                                </span>
                                            )}
                                        </span>
                                        {cost > 0 && <span className="gw-hits">(-{cost} hit)</span>}
                                        <span className="gw-transfers-badge">
                                            {h.transfers.length > 0 ? `${h.transfers.length} Tx` : 'No Tx'}
                                            <span style={{ fontSize: '0.8em', marginLeft: '6px', opacity: 0.8 }}>
                                                (£{(h.bank ?? 0).toFixed(1)}m, {h.free_transfers ?? 1} FT)
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
                                            injuryChances={h.squad.reduce((acc, p) => ({
                                                ...acc,
                                                [p.id]: p.injury_chance
                                            }), {})}
                                        />

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
                                                                {((p.status && p.status !== 'a') || p.injury_chance === 0) && (
                                                                    <span title={p.injury_chance === 0 ? "Serious Injury (0% Chance)" : "Injured/Unavailable"} style={{
                                                                        marginLeft: '4px',
                                                                        color: p.injury_chance === 0 ? '#ef4444' : '#eab308',
                                                                        fontSize: '0.9em'
                                                                    }}>{p.injury_chance === 0 ? '🚑' : '⚠️'}</span>
                                                                )}
                                                            </span>
                                                            <span className="player-price">£{(p.selling_price || 0).toFixed(1)}m</span>
                                                            <span className="player-xp" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.2' }}>
                                                                <span title="Expected Points">xP: {p.xp.toFixed(1)}</span>
                                                                {p.xp_5gw !== undefined && (
                                                                    <span style={{ fontSize: '0.8em', color: '#94a3b8' }} title="5 Gameweek Total XP">
                                                                        5GW: {p.xp_5gw.toFixed(1)}
                                                                    </span>
                                                                )}
                                                                {p.sum_prob_6_5gw !== undefined && (
                                                                    <span style={{ fontSize: '0.8em', color: '#facc15', fontWeight: 'bold' }} title="Sum of Prob > 6 over 5 GWs">
                                                                        Prob: {p.sum_prob_6_5gw.toFixed(2)}
                                                                    </span>
                                                                )}
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                    {p.prob_gt_6 !== undefined && (
                                                                        <span
                                                                            style={{
                                                                                fontSize: '0.7em',
                                                                                padding: '1px 4px',
                                                                                borderRadius: '4px',
                                                                                background: p.prob_gt_6 > 0.4 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.1)',
                                                                                color: p.prob_gt_6 > 0.4 ? '#4ade80' : '#94a3b8',
                                                                                border: `1px solid ${p.prob_gt_6 > 0.4 ? 'rgba(34, 197, 94, 0.3)' : 'transparent'}`
                                                                            }}
                                                                            title="Probability of scoring > 6 points"
                                                                        >
                                                                            &gt;6: {(p.prob_gt_6 * 100).toFixed(0)}%
                                                                        </span>
                                                                    )}
                                                                    {p.prob_gt_10 !== undefined && (
                                                                        <span
                                                                            style={{
                                                                                fontSize: '0.7em',
                                                                                padding: '1px 4px',
                                                                                borderRadius: '4px',
                                                                                background: p.prob_gt_10 > 0.15 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(148, 163, 184, 0.1)',
                                                                                color: p.prob_gt_10 > 0.15 ? '#facc15' : '#94a3b8',
                                                                                border: `1px solid ${p.prob_gt_10 > 0.15 ? 'rgba(234, 179, 8, 0.3)' : 'transparent'}`
                                                                            }}
                                                                            title="Probability of scoring > 10 points"
                                                                        >
                                                                            &gt;10: {(p.prob_gt_10 * 100).toFixed(0)}%
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </span>
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
            ) : (
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
                                {[...Array(15)].map((_, slotIdx) => {
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
                                                const sortedSquad = [...h.squad].sort((a, b) => {
                                                    const elA = elements.find(el => el.id === a.id);
                                                    const elB = elements.find(el => el.id === b.id);
                                                    if (elA && elB && elA.element_type !== elB.element_type) {
                                                        return elA.element_type - elB.element_type;
                                                    }
                                                    return a.id - b.id;
                                                });

                                                const player = sortedSquad[slotIdx];
                                                if (!player) return <td key={h.gw}>-</td>;

                                                const isTransferredIn = h.transfers.some(t => t.in === player.name);
                                                // Check if this player is transferred out in the NEXT gameweek
                                                const nextGW = gwIdx < history.length - 1 ? history[gwIdx + 1] : null;
                                                const isTransferredOut = nextGW ? nextGW.transfers.some(t => t.out === player.name) : false;
                                                const isCaptain = player.role === 'C';

                                                return (
                                                    <td key={h.gw} className={`${isTransferredIn ? 'transfer-in' : ''} ${isTransferredOut ? 'transfer-out' : ''} ${isCaptain ? 'is-captain' : ''}`}>
                                                        <div className="cell-player">
                                                            <span className="cell-name">{player.name}</span>
                                                            <div className="cell-meta">
                                                                <span className="cell-pts">{player.points}p</span>
                                                                <span className="cell-role">{player.role}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
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
