
import { useState, useEffect } from 'react';
import type { Player, Team, Pick } from '../types/fpl';
import { PitchView } from './PitchView';
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
}

interface BacktestResult {
    gw: number;
    points: number;
    net_points: number;
    transfer_cost: number;
    active_chip?: string | null;
    total_xp?: number;
    bank: number;
    transfers: Transfer[];
    squad: SquadPlayer[];
}

export function AiHistory({ elements, teams }: AiHistoryProps) {
    const [history, setHistory] = useState<BacktestResult[]>([]);
    const [expandedGW, setExpandedGW] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

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
            selling_price: 0,
            purchase_price: 0
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
                    <h3>Total Transfers</h3>
                    <div className="stat-value">{totalTransfers}</div>
                </div>
            </div>

            <div className="gameweek-list">
                {history.map(h => {
                    return (
                        <div key={h.gw} className="gw-card">
                            <div className="gw-header" onClick={() => toggleExpand(h.gw)}>
                                <div className="gw-info">
                                    <span className="gw-label">GW {h.gw}</span>
                                    <span className="gw-points">
                                        <strong className={h.net_points >= 60 ? 'high-score' : 'med-score'}>{h.net_points}</strong> pts
                                        <span style={{ fontSize: '0.8em', opacity: 0.7, marginLeft: '8px' }}>
                                            (xP: {h.total_xp ? h.total_xp.toFixed(1) : '0.0'})
                                        </span>
                                    </span>
                                    {h.transfer_cost > 0 && <span className="gw-hits">(-{h.transfer_cost} hit)</span>}
                                    <span className="gw-transfers-badge">
                                        {h.transfers.length > 0 ? `${h.transfers.length} Tx` : 'No Tx'}
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
                                        onPlayerClick={() => { }}
                                        isOptimizing={false}
                                        showSmartValue={false}
                                        predictions={h.squad.reduce((acc, p) => ({
                                            ...acc,
                                            [p.id]: { totalForecast: p.xp }
                                        }), {})}
                                    />

                                    {/* Bench Section */}
                                    <div className="bench-section">
                                        <h4>Bench</h4>
                                        <div className="bench-list">
                                            {h.squad.filter(p => p.role === 'B').map(p => (
                                                <div key={p.id} className="bench-player">
                                                    {p.name} ({p.points}pts)
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
                                                            {p.name} ({teamName}) {isCap && <span className="c-badge">C</span>} {p.role === 'V' && <span className="v-badge">V</span>}
                                                        </span>
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
        </div>
    );
}
