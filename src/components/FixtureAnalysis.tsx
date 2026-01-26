import { useState } from 'react';
import type { Match, Team } from '../types/fpl';
import { calculateTable, getFixtureTicker, type TeamSchedule } from '../utils/fixtures';
import './FixtureAnalysis.css';

interface FixtureAnalysisProps {
    fixtures: Match[];
    teams: Team[];
    currentEvent: number;
}

export function FixtureAnalysis({ fixtures, teams, currentEvent }: FixtureAnalysisProps) {
    const [weeks, setWeeks] = useState(5);
    const table = calculateTable(fixtures, teams);

    // Calculate both tables
    const attackTicker = getFixtureTicker(fixtures, table, currentEvent, weeks, 'attack');
    const defenseTicker = getFixtureTicker(fixtures, table, currentEvent, weeks, 'defense');

    const gameweeks = Array.from({ length: weeks }, (_, i) => currentEvent + i);

    return (
        <div className="fixture-analysis">
            <div className="analysis-header">
                <h2>Fixture Ticker</h2>
                <div className="controls">
                    <label>Lookahead:</label>
                    <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                        <option value={3}>3 Weeks</option>
                        <option value={5}>5 Weeks</option>
                        <option value={8}>8 Weeks</option>
                    </select>
                </div>
            </div>

            {/* Attack Table */}
            <div className="ticker-section">
                <h3>Attacking Potential (Best Attack vs Weakest Defense)</h3>
                <p className="subtitle">High Score = Good Matchup (Green)</p>
                <TickerTable ticker={attackTicker} gameweeks={gameweeks} metric="attack" />
            </div>

            {/* Defense Table */}
            <div className="ticker-section" style={{ marginTop: '2rem' }}>
                <h3>Defensive Potential (Strong Defense vs Weakest Attack)</h3>
                <p className="subtitle">Low Score = Good Matchup (Green)</p>
                <TickerTable ticker={defenseTicker} gameweeks={gameweeks} metric="defense" />
            </div>
        </div>
    );
}

function TickerTable({ ticker, gameweeks, metric }: { ticker: TeamSchedule[], gameweeks: number[], metric: 'attack' | 'defense' }) {
    return (
        <div className="ticker-container">
            <table className="ticker-table">
                <thead>
                    <tr>
                        <th className="th-team">Team</th>
                        <th className="th-score">Score</th>
                        {gameweeks.map(gw => (
                            <th key={gw} className="th-gw">GW {gw}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {ticker.map(row => (
                        <tr key={row.team.id}>
                            <td className="td-team">
                                <div className="team-name">{row.team.name}</div>
                                <div className="team-stats-mini">
                                    {metric === 'attack' ? `GS: ${row.team.goalsScored}` : `GC: ${row.team.goalsConceded}`}
                                </div>
                            </td>
                            <td className="td-score">{row.totalScore}</td>
                            {row.matches.map((match, i) => (
                                <td key={gameweeks[i]} className={`td-match ${match ? match.difficultyClass : 'blank'}`}>
                                    {match ? (
                                        <div className="match-cell">
                                            <span className="opponent">{match.opponent.short_name}</span>
                                            <span className="venue">{match.isHome ? '(H)' : '(A)'}</span>
                                            <span className="cell-score">{match.score}</span>
                                        </div>
                                    ) : (
                                        <span className="blank-gw">-</span>
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
