import type { UnifiedPlayer, BootstrapStatic } from '../types/fpl';
import './PlayerDetailModal.css';

interface PlayerDetailModalProps {
    player: UnifiedPlayer;
    staticData: BootstrapStatic;
    onClose: () => void;
}

export function PlayerDetailModal({ player, staticData, onClose }: PlayerDetailModalProps) {
    const getTeamName = (id: number) => staticData.teams.find(t => t.id === id)?.short_name;

    // Current-season rows (ingested from the live FPL API) lack season_name,
    // so derive the ongoing season (Aug-Jul) from today's date instead of
    // hardcoding it. This keeps the current season visible and correctly labelled.
    const now = new Date();
    const seasonStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const currentSeason = `${seasonStartYear}/${String(seasonStartYear + 1).slice(-2)}`;

    // Filter out summary rows (where round is missing) and sort
    const sortedHistory = player.history
        .filter(h => h.round !== undefined && h.round !== null)
        .sort((a, b) => {
            // Determine season for sorting.
            // Current season lacks explicit season_name in 'data' so we default to the ongoing season
            // Ingested 24/25 data has season_name = '2024/25'
            const seasonA = a.season_name || a.season || currentSeason;
            const seasonB = b.season_name || b.season || currentSeason;

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
                    {/* Upcoming Fixtures Predictions */}
                    {player.upcoming_fixtures && player.upcoming_fixtures.length > 0 && (
                        <div className="fixtures-section">
                            <h3>Upcoming Fixtures (Predicted Points)</h3>
                            <div className="table-wrapper">
                                <table className="history-table fixtures-table">
                                    <thead>
                                        <tr>
                                            <th>GW</th>
                                            <th>Opponent</th>
                                            <th>Diff</th>
                                            <th>Kickoff</th>
                                            <th>Pred Pts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {player.upcoming_fixtures.map((fix) => {
                                            const opponent = fix.opponent_team ? getTeamName(fix.opponent_team) : '-';
                                            const difficultyClass = `diff-${fix.difficulty}`;
                                            const date = new Date(fix.kickoff_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                                            return (
                                                <tr key={fix.id} className="fixture-row">
                                                    <td>{fix.event}</td>
                                                    <td>
                                                        {opponent} <span className="venue">{fix.is_home ? '(H)' : '(A)'}</span>
                                                    </td>
                                                    <td>
                                                        <span className={`difficulty-badge ${difficultyClass}`}>{fix.difficulty}</span>
                                                    </td>
                                                    <td className="date-cell">{date}</td>
                                                    <td className="predicted-points">
                                                        <strong>{fix.predicted_points?.toFixed(1) || '-'}</strong>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="history-section">
                        <h3>Match History ({sortedHistory.length} matches)</h3>
                        <div className="table-wrapper">
                            <table className="history-table">
                                <thead>
                                    <tr>
                                        <th>Season</th>
                                        <th>Pts</th>
                                        <th>GW</th>
                                        <th>Opponent</th>
                                        <th>Res</th>
                                        <th>Mins</th>
                                        <th>xG</th>
                                        <th>xA</th>
                                        <th>CS</th>
                                        <th>BPS</th>
                                        <th>ICT</th>
                                        <th>Inf</th>
                                        <th>Cre</th>
                                        <th>Thr</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedHistory.map((match, idx) => {
                                        const opponent = match.opponent_team ? getTeamName(match.opponent_team) : '-';
                                        const isHome = match.was_home;
                                        const score = match.opponent_team
                                            ? (isHome ? `${match.team_h_score}-${match.team_a_score}` : `${match.team_a_score}-${match.team_h_score}`)
                                            : '-';

                                        // Use actual season or default to the current one if missing
                                        // Past seasons come as summaries with a 'season_name' or 'season' field
                                        let season = match.season_name || match.season || currentSeason;

                                        // Normalize to YY/YY format (e.g. 2024/25 -> 24/25)
                                        if (season.length === 7 && season.indexOf('/') === 4) {
                                            season = season.substring(2);
                                        }

                                        return (
                                            <tr key={idx} className="match-row">
                                                <td className="season-cell">{season}</td>
                                                <td className="points-cell">{match.total_points ?? 0}</td>
                                                <td>{match.round || 'All'}</td>
                                                <td>{opponent} {match.opponent_team ? (isHome ? '(H)' : '(A)') : ''}</td>
                                                <td>{score}</td>
                                                <td>{match.minutes}</td>
                                                <td className="stat-dim">{match.expected_goals}</td>
                                                <td className="stat-dim">{match.expected_assists}</td>
                                                <td>{match.clean_sheets}</td>
                                                <td>{match.bps}</td>
                                                <td>{match.ict_index}</td>
                                                <td className="stat-dim">{match.influence}</td>
                                                <td className="stat-dim">{match.creativity}</td>
                                                <td className="stat-dim">{match.threat}</td>
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
