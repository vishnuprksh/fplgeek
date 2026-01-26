import { useState, useEffect } from 'react';
import type { Player, Team, Match } from '../types/fpl';
import { generatePredictions } from '../utils/predictions';
import type { PredictionResult } from '../utils/predictions';
import { optimizeSquad } from '../utils/solver';
import { aiService } from '../services/aiService';
import { fplService } from '../services/fpl';
import { getDataProvider } from '../services/dataFactory';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// import { PitchView } from './PitchView'; // We can reuse or adapt this
import './PlayerAnalysis.css'; // Reusing table styles

interface PredictionsProps {
    elements: Player[];
    teams: Team[];
    fixtures: Match[];
}

export function Predictions({ elements, teams, fixtures }: PredictionsProps) {
    const [view, setView] = useState<'lineup' | 'table' | 'suggestions'>('lineup');
    const [lineup, setLineup] = useState<any>(null);
    const [allPredictions, setAllPredictions] = useState<PredictionResult[]>([]);
    const [excludedPlayers, setExcludedPlayers] = useState<Set<number>>(new Set());

    // Report State
    // Report State
    const [report, setReport] = useState<string | null>(null);
    const [reportLoading, setReportLoading] = useState(false);

    // Suggestions State
    const [userTeamId, setUserTeamId] = useState<string>("");
    const [suggestionsReport, setSuggestionsReport] = useState<string | null>(null);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);

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


    useEffect(() => {
        if (allPredictions.length > 0) {
            // Filter out excluded players
            const available = allPredictions.filter(p => !excludedPlayers.has(p.player.id));
            const bestSquad = optimizeSquad(available, 2000); // 200m budget (effectively unlimited)
            setLineup(bestSquad);
        }
    }, [allPredictions, excludedPlayers]);

    // Auto-report generation removed in favor of manual button
    // useEffect(() => { ... }, [lineup, view]);

    const fetchReport = async (currentLineup: any) => {
        setReportLoading(true);
        setReport(null);
        try {
            const players = [
                ...currentLineup.starting11.map((p: any) => `${p.player.web_name} (${getTeamName(p.player.team)})`),
                ...currentLineup.bench.map((p: any) => `${p.player.web_name} (${getTeamName(p.player.team)})`)
            ];
            const text = await aiService.getHealthReport(players);
            setReport(text);
        } catch (e) {
            console.error("Failed to fetch report", e);
            setReport("Failed to generate report. Please try again later.");
        } finally {
            setReportLoading(false);
        }
    };

    const fetchSuggestions = async () => {
        if (!userTeamId || !lineup) return;
        setSuggestionsLoading(true);
        setSuggestionsReport(null);
        try {
            // 1. Fetch User Picks (using current gameweek - assuming next GW is current + 1 or similar logic)
            // For simplicity, we'll fetch GW 1 or need a way to know current GW. 
            // Let's try to fetch bootstrap static to get current GW first if needed, or just ask user for GW?
            // Better: fplService.getTeamPicks(teamId, currentGW). 
            // We need current GW. Let's assume we can get it from fixtures or bootstrap.
            // For now, let's just use a hardcoded GW or try to find it.
            const bootstrap = await fplService.getBootstrapStatic();
            const currentEvent = bootstrap.events.find(e => e.is_current)?.id || 1;

            const picksData = await fplService.getTeamPicks(parseInt(userTeamId), currentEvent);
            const picks = picksData.picks.map(p => {
                const player = elements.find(e => e.id === p.element);
                return player ? `${player.web_name} (${getTeamName(player.team)})` : `Unknown (${p.element})`;
            });
            // 2. Prepare Dream Squad List
            const dreamSquadList = [
                ...lineup.starting11.map((p: any) => `${p.player.web_name} (${getTeamName(p.player.team)})`),
                ...lineup.bench.map((p: any) => `${p.player.web_name} (${getTeamName(p.player.team)})`)
            ];

            // 3. Generate Suggestions
            const text = await aiService.getTransferSuggestions(picks, dreamSquadList);
            setSuggestionsReport(text);

        } catch (e) {
            console.error("Failed to fetch suggestions", e);
            setSuggestionsReport("Failed to generate suggestions. Please check your Team ID and try again.");
        } finally {
            setSuggestionsLoading(false);
        }
    };

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
        <div className="predictions-container" style={{ padding: '20px' }}>
            <div className="header-actions" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h2>🤖 AI Predictions (Next 5 GWs)</h2>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                        Elements: {elements.length} | Fixtures: {fixtures.length}
                        {fixtures.length === 0 && <span style={{ color: 'red', marginLeft: '10px' }}>Warning: No fixtures loaded. Predictions will be empty.</span>}
                    </div>
                </div>
                <div className="toggle-btn">
                    <button
                        onClick={() => setView('lineup')}
                        style={{ padding: '8px 16px', background: view === 'lineup' ? '#37003c' : '#ddd', color: view === 'lineup' ? '#fff' : '#000', border: 'none', borderRadius: '4px 0 0 4px', cursor: 'pointer' }}
                    >
                        Dream Squad (15)
                    </button>
                    <button
                        onClick={() => setView('table')}
                        style={{ padding: '8px 16px', background: view === 'table' ? '#37003c' : '#ddd', color: view === 'table' ? '#fff' : '#000', border: 'none', cursor: 'pointer' }}
                    >
                        All Predictions
                    </button>
                    <button
                        onClick={() => setView('suggestions')}
                        style={{ padding: '8px 16px', background: view === 'suggestions' ? '#37003c' : '#ddd', color: view === 'suggestions' ? '#fff' : '#000', border: 'none', borderRadius: '0 4px 4px 0', cursor: 'pointer' }}
                    >
                        AI Suggestions
                    </button>
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

            {view === 'lineup' && lineup && (
                <div className="dream-xi-view" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

                    {/* Left Panel: Pitch & Bench */}
                    <div style={{ flex: '2', minWidth: '0' }}>
                        <div className="stats-summary" style={{ background: '#f0f0f0', color: '#333', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '20px' }}>
                            <div>
                                <strong>Total Cost:</strong> £{(lineup.totalCost / 10).toFixed(1)}m
                            </div>
                            <div>
                                <strong>Predicted Points (XI):</strong> {lineup.totalPredictedPoints.toFixed(1)}
                            </div>
                        </div>

                        {/* Visual Pitch */}
                        <div className="pitch" style={{
                            background: 'linear-gradient(180deg, #1a8f3c 0%, #2ecc71 100%)',
                            padding: '20px',
                            borderRadius: '12px',
                            position: 'relative',
                            minHeight: '600px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-around',
                            marginBottom: '20px'
                        }}>
                            <h3 style={{ textAlign: 'center', color: 'white', margin: '0 0 10px 0', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Starting XI</h3>

                            {/* Goalkeeper */}
                            <div className="pitch-row" style={{ display: 'flex', justifyContent: 'center' }}>
                                {lineup.starting11.filter((p: any) => p.player.element_type === 1).map((p: any) =>
                                    <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} onExclude={() => toggleExclusion(p.player.id)} />
                                )}
                            </div>
                            {/* Defenders */}
                            <div className="pitch-row" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                {lineup.starting11.filter((p: any) => p.player.element_type === 2).map((p: any) =>
                                    <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} onExclude={() => toggleExclusion(p.player.id)} />
                                )}
                            </div>
                            {/* Midfielders */}
                            <div className="pitch-row" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                {lineup.starting11.filter((p: any) => p.player.element_type === 3).map((p: any) =>
                                    <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} onExclude={() => toggleExclusion(p.player.id)} />
                                )}
                            </div>
                            {/* Forwards */}
                            <div className="pitch-row" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                {lineup.starting11.filter((p: any) => p.player.element_type === 4).map((p: any) =>
                                    <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} onExclude={() => toggleExclusion(p.player.id)} />
                                )}
                            </div>
                        </div>

                        {/* Bench */}
                        <div className="bench" style={{
                            background: '#e0e0e0',
                            padding: '20px',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}>
                            <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Bench</h3>
                            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                {lineup.bench.map((p: any) => (
                                    <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} isBench={true} onExclude={() => toggleExclusion(p.player.id)} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Team Health Report */}
                    <div className="report-panel" style={{
                        flex: '1',
                        background: '#fff',
                        borderRadius: '12px',
                        padding: '20px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        maxHeight: '800px',
                        overflowY: 'auto',
                        position: 'sticky',
                        top: '20px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #37003c', paddingBottom: '10px', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0, color: '#37003c' }}>🏥 Team Health Report</h3>
                            <button
                                onClick={() => fetchReport(lineup)}
                                disabled={reportLoading}
                                style={{
                                    padding: '6px 12px',
                                    background: '#37003c',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.8em',
                                    opacity: reportLoading ? 0.7 : 1
                                }}
                            >
                                {reportLoading ? 'Generating...' : 'Generate Report'}
                            </button>
                        </div>

                        {reportLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                Generating AI Report...
                            </div>
                        ) : report ? (
                            <div className="markdown-content" style={{ fontSize: '0.9em', lineHeight: '1.4' }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#999', fontStyle: 'italic' }}>
                                Click 'Generate Report' to analyze this squad's potential.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {view === 'table' && (
                <div className="table-container">
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
                </div>
            )}

            {view === 'suggestions' && (
                <div className="suggestions-view" style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Enter FPL Team ID"
                            value={userTeamId}
                            onChange={(e) => setUserTeamId(e.target.value)}
                            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', width: '200px' }}
                        />
                        <button
                            onClick={fetchSuggestions}
                            disabled={suggestionsLoading || !lineup}
                            style={{
                                padding: '10px 20px',
                                background: '#00ff87',
                                color: '#37003c',
                                border: 'none',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                opacity: (suggestionsLoading || !lineup) ? 0.7 : 1
                            }}
                        >
                            {suggestionsLoading ? 'Analyzing...' : 'Compare & Suggest'}
                        </button>
                    </div>

                    {suggestionsReport && (
                        <div style={{ display: 'flex', gap: '20px' }}>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ color: '#37003c' }}>🧠 AI Analysis</h3>
                                <div className="markdown-content" style={{ fontSize: '1em', lineHeight: '1.6', color: '#333' }}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{suggestionsReport}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const PlayerCard = ({ data, team, isBench, onExclude }: { data: PredictionResult, team: string, isBench?: boolean, onExclude: () => void }) => (
    <div style={{
        width: '100px',
        background: isBench ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.9)',
        color: '#000',
        borderRadius: '6px',
        padding: '6px',
        textAlign: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        opacity: isBench ? 0.8 : 1,
        position: 'relative'
    }}>
        <button
            onClick={(e) => { e.stopPropagation(); onExclude(); }}
            style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: '#c62828',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
            }}
            title="Exclude Player"
        >
            ✕
        </button>
        <div style={{ fontSize: '0.8em', fontWeight: 'bold', marginBottom: '2px' }}>{data.player.web_name}</div>
        <div style={{ fontSize: '0.7em', color: '#555', marginBottom: '4px' }}>{team}</div>
        <div style={{
            background: '#37003c',
            color: '#00ff87',
            borderRadius: '4px',
            padding: '2px',
            fontSize: '0.9em',
            fontWeight: 'bold'
        }}>
            {data.totalForecast.toFixed(1)} pts
        </div>
        <div style={{ fontSize: '0.7em', marginTop: '2px' }}>£{(data.cost / 10).toFixed(1)}m</div>
    </div>
);
