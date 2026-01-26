import { useState, useEffect } from 'react';
import type { Player, Team, Match } from '../types/fpl';
import { generatePredictions } from '../utils/predictions';
import type { PredictionResult } from '../utils/predictions';

import { getDataProvider } from '../services/dataFactory';
import './PlayerAnalysis.css'; // Reusing table styles
// import { PitchView } from './PitchView'; // We can reuse or adapt this
import './PlayerAnalysis.css'; // Reusing table styles
import { SkeletonTable } from './SkeletonLoader';

interface PredictionsProps {
    elements: Player[];
    teams: Team[];
    fixtures: Match[];
}

export function Predictions({ elements, teams, fixtures }: PredictionsProps) {
    const [allPredictions, setAllPredictions] = useState<PredictionResult[]>([]);
    const [excludedPlayers, setExcludedPlayers] = useState<Set<number>>(new Set());

    // Report State


    useEffect(() => {
        const fetchPredictions = async () => {
            try {
                const storedPreds = await getDataProvider().getPredictions();
                if (storedPreds && storedPreds.length > 0) {
                    console.log(`Loaded ${storedPreds.length} pre-calculated predictions`);

                    // Map stored predictions back to PredictionResult format if needed
                    // The stored format is already quite close: { id, name, team, projections, total5Week }
                    // We need to map it to PredictionResult interface: { player, smartValue, predictedPoints, next5Points, totalForecast, cost }
                    const formatted = storedPreds.map((sp: any) => {
                        const player = elements.find(e => e.id === sp.id);
                        if (!player) return null;

                        return {
                            player: player,
                            smartValue: (player as any).smart_value ? (player as any).smart_value * 100 : 50,
                            predictedPoints: sp.total5Week / 5,
                            next5Points: sp.projections.map((p: any) => p.xP),
                            totalForecast: sp.total5Week,
                            cost: player.now_cost
                        } as PredictionResult;
                    }).filter((p: any) => p !== null) as PredictionResult[];

                    setAllPredictions(formatted.sort((a, b) => b.totalForecast - a.totalForecast));
                } else if (elements.length > 0 && fixtures.length > 0) {
                    // Fallback to live generation if table is empty
                    const preds = generatePredictions(elements, teams, fixtures);
                    setAllPredictions(preds);
                }
            } catch (e) {
                console.error("Failed to fetch pre-calculated predictions", e);
                if (elements.length > 0 && fixtures.length > 0) {
                    const preds = generatePredictions(elements, teams, fixtures);
                    setAllPredictions(preds);
                }
            }
        };

        fetchPredictions();
    }, [elements, fixtures, teams]);




    // Auto-report generation removed in favor of manual button
    // useEffect(() => { ... }, [lineup, view]);





    const getTeamName = (id: number) => teams.find(t => t.id === id)?.short_name || '-';

    const toggleExclusion = (playerId: number) => {
        const newExcluded = new Set(excludedPlayers);
        if (newExcluded.has(playerId)) {
            newExcluded.delete(playerId);
        } else {
            newExcluded.add(playerId);
        }
        setExcludedPlayers(newExcluded);
    };

    return (
        <div className="predictions-container fade-in-up" style={{ padding: '20px' }}>
            <div className="header-actions" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h2>🤖 AI Predictions (Next 5 GWs)</h2>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                        Elements: {elements.length} | Fixtures: {fixtures.length}
                        {fixtures.length === 0 && <span style={{ color: 'red', marginLeft: '10px' }}>Warning: No fixtures loaded. Predictions will be empty.</span>}
                    </div>
                </div>
            </div>

            {excludedPlayers.size > 0 && (
                <div className="excluded-section" style={{ marginBottom: '20px', padding: '10px', background: '#ffebee', borderRadius: '8px', border: '1px solid #ffcdd2' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#c62828' }}>Excluded Players ({excludedPlayers.size})</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {Array.from(excludedPlayers).map(id => {
                            const player = elements.find(e => e.id === id);
                            return (
                                <div key={id} style={{ background: '#fff', padding: '4px 8px', borderRadius: '16px', border: '1px solid #ffcdd2', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {player?.web_name}
                                    <button
                                        onClick={() => toggleExclusion(id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontWeight: 'bold', padding: 0 }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {allPredictions.length === 0 ? (
                <div style={{ padding: '40px 0' }}>
                    <SkeletonTable />
                </div>
            ) : (
                <div className="table-container">
                    {allPredictions.filter(p => !excludedPlayers.has(p.player.id)).length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '60px 20px',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: '12px',
                            border: '1px dashed rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔮</div>
                            <h3 style={{ color: '#00ff87', marginBottom: '8px' }}>The Crystal Ball is Cloudy</h3>
                            <p style={{ color: '#888' }}>Either you've excluded everyone, or we're waiting for those elite differentials to pop up.</p>
                            <button
                                onClick={() => setExcludedPlayers(new Set())}
                                style={{
                                    marginTop: '20px',
                                    padding: '8px 20px',
                                    background: '#37003c',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '20px',
                                    fontSize: '0.9rem'
                                }}
                            >
                                Reset Exclusions
                            </button>
                        </div>
                    ) : (
                        <table className="analysis-table">
                            <thead>
                                <tr>
                                    <th>Player</th>
                                    <th>Team</th>
                                    <th>Pos</th>
                                    <th>Price</th>
                                    <th>Smart Val</th>
                                    <th>Predicted (5 GWs)</th>
                                    <th>GW+1</th>
                                    <th>GW+2</th>
                                    <th>GW+3</th>
                                    <th>GW+4</th>
                                    <th>GW+5</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allPredictions.filter(p => !excludedPlayers.has(p.player.id)).slice(0, 100).map(pred => (
                                    <tr key={pred.player.id}>
                                        <td>
                                            <div style={{ fontWeight: 'bold' }}>{pred.player.web_name}</div>
                                        </td>
                                        <td>{getTeamName(pred.player.team)}</td>
                                        <td>{['GKP', 'DEF', 'MID', 'FWD'][pred.player.element_type - 1]}</td>
                                        <td>£{(pred.cost / 10).toFixed(1)}m</td>
                                        <td>
                                            <div className="dvs-badge" style={{ backgroundColor: '#37003c', color: '#fff', padding: '2px 6px', borderRadius: '4px', textAlign: 'center' }}>
                                                {pred.smartValue.toFixed(0)}
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{pred.totalForecast.toFixed(1)}</td>
                                        {pred.next5Points.map((pt, i) => (
                                            <td key={i} style={{ color: pt > 4 ? '#00ff87' : 'inherit' }}>{pt.toFixed(1)}</td>
                                        ))}
                                        <td>
                                            <button
                                                onClick={() => toggleExclusion(pred.player.id)}
                                                style={{ background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px' }}
                                            >
                                                Exclude
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}


