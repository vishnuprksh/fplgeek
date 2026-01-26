import type { UnifiedPlayer, BootstrapStatic } from '../types/fpl';
import './PlayerDetailModal.css';

interface PlayerDetailModalProps {
    player: UnifiedPlayer;
    staticData: BootstrapStatic;
    onClose: () => void;
}

export function PlayerDetailModal({ player, staticData, onClose }: PlayerDetailModalProps) {
    const getTeamName = (id: number) => staticData.teams.find(t => t.id === id)?.short_name;

    // Sort history by season (desc) then round (desc)
    const sortedHistory = [...player.history].sort((a, b) => {
        const seasonA = a.season || '2526';
        const seasonB = b.season || '2526';
        if (seasonA !== seasonB) return seasonB.localeCompare(seasonA);
        return b.round - a.round;
    });

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{player.web_name} <span className="modal-subtitle">{player.first_name} {player.second_name}</span></h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <div className="history-section">
                        <h3>Match History ({sortedHistory.length} matches)</h3>
                        <div className="table-wrapper">
                            <table className="history-table">
                                <thead>
                                    <tr>
                                        <th>Season</th>
                                        <th>GW</th>
                                        <th>Opponent</th>
                                        <th>Res</th>
                                        <th>Mins</th>
                                        <th>G</th>
                                        <th>xG</th>
                                        <th>A</th>
                                        <th>xA</th>
                                        <th>xGI</th>
                                        <th>xGC</th>
                                        <th>CS</th>
                                        <th>BPS</th>
                                        <th>ICT</th>
                                        <th>Pts</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedHistory.map((match, idx) => {
                                        const opponent = getTeamName(match.opponent_team);
                                        const isHome = match.was_home;
                                        const score = isHome ? `${match.team_h_score}-${match.team_a_score}` : `${match.team_a_score}-${match.team_h_score}`;
                                        const season = match.season === '2425' ? '24/25' : '25/26';

                                        return (
                                            <tr key={idx} className="match-row">
                                                <td className="season-cell">{season}</td>
                                                <td>{match.round}</td>
                                                <td>{opponent} ({isHome ? 'H' : 'A'})</td>
                                                <td>{score}</td>
                                                <td>{match.minutes}</td>
                                                <td>{match.goals_scored}</td>
                                                <td className="stat-dim">{match.expected_goals}</td>
                                                <td>{match.assists}</td>
                                                <td className="stat-dim">{match.expected_assists}</td>
                                                <td className="stat-dim">{match.expected_goal_involvements}</td>
                                                <td className="stat-dim">{match.expected_goals_conceded}</td>
                                                <td>{match.clean_sheets}</td>
                                                <td>{match.bps}</td>
                                                <td>{match.ict_index}</td>
                                                <td className="points-cell">{match.total_points}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
