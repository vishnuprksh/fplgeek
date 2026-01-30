import type { UnifiedPlayer, BootstrapStatic } from '../types/fpl';
import './PlayerDetailModal.css';

interface PlayerDetailModalProps {
    player: UnifiedPlayer;
    staticData: BootstrapStatic;
    onClose: () => void;
}

export function PlayerDetailModal({ player, staticData, onClose }: PlayerDetailModalProps) {
    const getTeamName = (id: number) => staticData.teams.find(t => t.id === id)?.short_name;

    // Filter out summary rows (where round is missing) and sort
    const sortedHistory = player.history
        .filter(h => h.round !== undefined && h.round !== null)
        .sort((a, b) => {
            // Determine season for sorting. 
            // Current season usually lacks explicit season_name in 'data' but we can infer or default to '2025/26' (maximal)
            // Ingested 24/25 data has season_name = '2024/25'
            const seasonA = a.season_name || a.season || '2025/26';
            const seasonB = b.season_name || b.season || '2025/26';

            if (seasonA !== seasonB) {
                // Descending season (2025/26 -> 2024/25 -> ...)
                return seasonB.localeCompare(seasonA);
            }
            // Descending round
            return (b.round || 0) - (a.round || 0);
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
                                        const opponent = match.opponent_team ? getTeamName(match.opponent_team) : '-';
                                        const isHome = match.was_home;
                                        const score = match.opponent_team
                                            ? (isHome ? `${match.team_h_score}-${match.team_a_score}` : `${match.team_a_score}-${match.team_h_score}`)
                                            : '-';

                                        // Use actual season or default to '25/26' (current) if missing
                                        // Past seasons come as summaries with a 'season_name' or 'season' field
                                        let season = match.season_name || match.season || '25/26';

                                        // Normalize to YY/YY format (e.g. 2024/25 -> 24/25)
                                        if (season.length === 7 && season.indexOf('/') === 4) {
                                            season = season.substring(2);
                                        }

                                        return (
                                            <tr key={idx} className="match-row">
                                                <td className="season-cell">{season}</td>
                                                <td>{match.round || 'All'}</td>
                                                <td>{opponent} {match.opponent_team ? (isHome ? '(H)' : '(A)') : ''}</td>
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
