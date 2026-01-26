import { useState, useEffect } from 'react';
import type { Player, Team, Match } from '../types/fpl';
import { generatePredictions } from '../utils/predictions';
import type { PredictionResult } from '../utils/predictions';
import { pickBestXI } from '../utils/solver';
import { fplService } from '../services/fpl';
import './PlayerAnalysis.css'; // Reusing styles

interface BestTeamProps {
    elements: Player[];
    teams: Team[];
    fixtures: Match[];
    teamId: number;
}

export function BestTeam({ elements, teams, fixtures, teamId }: BestTeamProps) {
    const [lineup, setLineup] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadTeamAndOptimize = async () => {
            setLoading(true);
            setError(null);
            try {
                // 1. Get Current Event
                const bootstrap = await fplService.getBootstrapStatic();
                const currentEvent = bootstrap.events.find(e => e.is_next)?.id || 1;

                // 2. Get User's Picks
                const picksData = await fplService.getTeamPicks(teamId, currentEvent - 1); // Use previous GW picks as base

                if (!picksData || !picksData.picks) {
                    setError("Could not fetch team picks.");
                    return;
                }

                // 3. Map Picks to Players
                const myPlayers: Player[] = [];
                picksData.picks.forEach(pick => {
                    const player = elements.find(e => e.id === pick.element);
                    if (player) myPlayers.push(player);
                });

                // 4. Generate Predictions for these 15 players
                const predictions = generatePredictions(myPlayers, teams, fixtures);

                // 5. Optimize for Best XI
                const bestXI = pickBestXI(predictions, 0); // Cost doesn't matter for existing squad
                setLineup(bestXI);

            } catch (err) {
                console.error("Failed to optimize team", err);
                setError("Failed to load team data. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        if (elements.length > 0 && fixtures.length > 0 && teamId) {
            loadTeamAndOptimize();
        }
    }, [elements, fixtures, teams, teamId]);

    const getTeamName = (id: number) => teams.find(t => t.id === id)?.short_name || '-';

    if (loading) return <div className="loading-message">Analyzing your squad...</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!lineup) return null;

    return (
        <div className="best-team-container" style={{ padding: '20px' }}>
            <h2>🏆 Best XI for Next Gameweek</h2>
            <p style={{ marginBottom: '20px', color: '#666' }}>
                Based on AI predictions for your current squad.
            </p>

            <div className="dream-xi-view" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                {/* Pitch View */}
                <div style={{ flex: '2', minWidth: '0' }}>
                    <div className="stats-summary" style={{ background: '#f0f0f0', color: '#333', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '20px' }}>
                        <div>
                            <strong>Predicted Points:</strong> {lineup.totalPredictedPoints.toFixed(1)}
                        </div>
                    </div>

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
                        {/* Goalkeeper */}
                        <div className="pitch-row" style={{ display: 'flex', justifyContent: 'center' }}>
                            {lineup.starting11.filter((p: any) => p.player.element_type === 1).map((p: any) =>
                                <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} />
                            )}
                        </div>
                        {/* Defenders */}
                        <div className="pitch-row" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            {lineup.starting11.filter((p: any) => p.player.element_type === 2).map((p: any) =>
                                <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} />
                            )}
                        </div>
                        {/* Midfielders */}
                        <div className="pitch-row" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            {lineup.starting11.filter((p: any) => p.player.element_type === 3).map((p: any) =>
                                <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} />
                            )}
                        </div>
                        {/* Forwards */}
                        <div className="pitch-row" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            {lineup.starting11.filter((p: any) => p.player.element_type === 4).map((p: any) =>
                                <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} />
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
                                <PlayerCard key={p.player.id} data={p} team={getTeamName(p.player.team)} isBench={true} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const PlayerCard = ({ data, team, isBench }: { data: PredictionResult, team: string, isBench?: boolean }) => (
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
    </div>
);
