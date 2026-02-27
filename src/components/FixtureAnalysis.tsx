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

    const topAttack = attackTicker[0];
    const topDefense = defenseTicker[0];

    return (
        <div className="fixture-analysis fade-in">
            {/* Page Header */}
            <div className="analysis-header-main" style={{ marginBottom: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '2rem' }}>🗓️</span>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800 }}>Fixture Ticker</h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Strategic planning for upcoming gameweeks</p>
                    </div>
                </div>
                <div className="controls-glass">
                    <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lookahead</label>
                    <select
                        value={weeks}
                        onChange={(e) => setWeeks(Number(e.target.value))}
                        className="premium-select"
                    >
                        <option value={3}>3 Weeks</option>
                        <option value={5}>5 Weeks</option>
                        <option value={8}>8 Weeks</option>
                    </select>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--space-6)' }}>
                {/* Attack Panel */}
                <div className="dashboard-panel premium-border">
                    <div className="panel-inner-header" style={{ background: 'linear-gradient(90deg, rgba(0, 255, 135, 0.1) 0%, transparent 100%)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '1.4rem' }}>⚔️</span>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--accent-primary)' }}>Attacking Potential</h2>
                                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Target: Weakest Defenses</p>
                            </div>
                        </div>
                        {topAttack && (
                            <div className="top-badge attack">
                                <span className="label">Best:</span>
                                <span className="value">{topAttack.team.name}</span>
                            </div>
                        )}
                    </div>

                    <div style={{ padding: 'var(--space-4)' }}>
                        <TickerTable ticker={attackTicker} gameweeks={gameweeks} metric="attack" />
                    </div>
                </div>

                {/* Defense Panel */}
                <div className="dashboard-panel premium-border">
                    <div className="panel-inner-header" style={{ background: 'linear-gradient(90deg, rgba(96, 165, 250, 0.1) 0%, transparent 100%)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '1.4rem' }}>🛡️</span>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', color: '#60a5fa' }}>Defensive Potential</h2>
                                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Target: Weakest Attacks</p>
                            </div>
                        </div>
                        {topDefense && (
                            <div className="top-badge defense">
                                <span className="label">Best:</span>
                                <span className="value">{topDefense.team.name}</span>
                            </div>
                        )}
                    </div>

                    <div style={{ padding: 'var(--space-4)' }}>
                        <TickerTable ticker={defenseTicker} gameweeks={gameweeks} metric="defense" />
                    </div>
                </div>
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
                        <th className="th-score">Avg Score</th>
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
                            <td className="td-score">{row.averageScore.toFixed(1)}</td>
                            {row.matches.map((matchesInGw, i) => (
                                <td key={gameweeks[i]} className="td-match-container">
                                    {matchesInGw.length > 0 ? (
                                        <div className="match-stack">
                                            {matchesInGw.map((match, idx) => (
                                                <div key={idx} className={`match-cell ${match.difficultyClass}`}>
                                                    <span className="opponent">{match.opponent.short_name}</span>
                                                    <span className="venue">{match.isHome ? '(H)' : '(A)'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="blank-gw">-</div>
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
