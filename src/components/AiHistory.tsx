
import { useState, useEffect } from 'react';
import type { Player, Team, Pick } from '../types/fpl';
import { PitchView } from './PitchView';
import { getDataProvider } from '../services/dataFactory';
import './AiHistory.css';

interface AiHistoryProps {
    elements: Player[];
    teams: Team[];
}

interface BacktestResult {
    gw: number;
    ai_points: number;
    xp: number;
    squad: {
        id: number;
        name: string;
        team: number;
        type: number;
        xp: number;
        actual: number;
        cost: number;
    }[];
}

export function AiHistory({ elements, teams }: AiHistoryProps) {
    const [history, setHistory] = useState<BacktestResult[]>([]);
    const [expandedGW, setExpandedGW] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadHistory = async () => {
            try {
                const results = await getDataProvider().getBacktestHistory();
                // results is array of { data: string } or raw objects?
                // sqliteService.querySingle logic: "if row.data && typeof row.data === 'string' ... result.push(JSON.parse(row.data))"
                // So results IS the parsed object array.
                // Wait, logic in step 1515: `if (row.data) result.push(JSON.parse(row.data))`.
                // Step 1509 (Script): `INSERT VALUES (?, JSON.stringify(record))`.
                // So yes, `getBacktestHistory` returns the `record` object directly.
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

    const getPicksFromSquad = (squad: BacktestResult['squad']): Pick[] => {
        // Map backtest squad to Pick[] for PitchView
        // Squad is 15 players. 11 starters, 4 bench?
        // Script logic: `result.starting11`. Then `result.bench`. The `squad` saved in DB is CONCATENATED.
        // `squad: result.starting11.map(...)`.
        // Wait! In `backtest.ts` step 1509:
        // `squad: result.starting11.map(...)` 
        // IT ONLY STORES STARTING 11? 
        // Line 256: `squad: result.starting11.map(p => ...)` 
        // Does it include bench? No.
        // The script ONLY saved Starting 11.
        // "Optimization": Runs `solve` which returns `starting11`.
        // The `solve` function in `backtest.ts`:
        // Returns `optimizeStartingXI(bestSquad)`.
        // `optimizeStartingXI` returns `{ ..., starting11, bench }`.
        // BUT the saving logic (Line 256) ONLY accessed `result.starting11`.
        // Ideally we want the full squad.
        // It's acceptable for now to just show the XI ("AI Team").
        // But PitchView expects 15 players usually?
        // If I pass 11 picks, PitchView might break or show empty bench.
        // `PitchView` maps `picks`. If picks has 11 items, it will render 11.

        return squad.map((p, idx) => ({
            element: p.id,
            position: idx + 1,
            multiplier: 1,
            is_captain: idx === 0, // Mock captain
            is_vice_captain: false,
            selling_price: p.cost,
            purchase_price: p.cost
        }));
    };

    const totalAiPoints = history.reduce((sum, h) => sum + h.ai_points, 0);
    const avgAiPoints = history.length > 0 ? totalAiPoints / history.length : 0;
    const totalXp = history.reduce((sum, h) => sum + h.xp, 0);

    if (loading) return <div style={{ padding: '20px', color: 'white' }}>Loading History...</div>;

    return (
        <div className="ai-history-container">
            <div className="history-summary">
                <div className="stat-card">
                    <h3>Total AI Points</h3>
                    <div className="stat-value highlight">{totalAiPoints}</div>
                </div>
                <div className="stat-card">
                    <h3>Avg per GW</h3>
                    <div className="stat-value">{avgAiPoints.toFixed(1)}</div>
                </div>
                <div className="stat-card">
                    <h3>Total Predicted</h3>
                    <div className="stat-value">{totalXp.toFixed(1)}</div>
                </div>
                <div className="stat-card">
                    <h3>Weeks Analyzed</h3>
                    <div className="stat-value">{history.length}</div>
                </div>
            </div>

            <div className="gameweek-list">
                {history.map(h => (
                    <div key={h.gw} className="gw-card">
                        <div className="gw-header" onClick={() => toggleExpand(h.gw)}>
                            <div className="gw-info">
                                <span className="gw-label">Gameweek {h.gw}</span>
                                <span className="gw-points">
                                    <span className="label">Actual:</span>
                                    <strong className={h.ai_points >= 60 ? 'high-score' : 'med-score'}>{h.ai_points}</strong>
                                </span>
                                <span className="gw-xp">
                                    (xP: {h.xp.toFixed(1)})
                                </span>
                            </div>
                            <div className="expand-icon">{expandedGW === h.gw ? '▲' : '▼'}</div>
                        </div>

                        {expandedGW === h.gw && (
                            <div className="gw-body">
                                <PitchView
                                    picks={getPicksFromSquad(h.squad)}
                                    elements={elements as any}
                                    teams={teams}
                                    onPlayerClick={() => { }}
                                    isOptimizing={false}
                                    predictions={{}} // No live predictions needed
                                />
                                <div className="squad-list-text">
                                    <h4>Detailed Score</h4>
                                    <ul>
                                        {h.squad.map(p => {
                                            const teamName = teams.find(t => t.id === p.team)?.short_name;
                                            return (
                                                <li key={p.id} className="player-row">
                                                    <span className="player-name">{p.name} ({teamName})</span>
                                                    <span className="player-xp">xP: {p.xp.toFixed(1)}</span>
                                                    <span className="player-actual">{p.actual} pts</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
