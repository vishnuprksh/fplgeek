import type { TeamEntry } from '../types/fpl';

interface TeamCardProps {
    team: TeamEntry | null;
    totalValue?: number;
    bank?: number;
}

export function TeamCard({ team, totalValue, bank }: TeamCardProps) {
    if (!team) return null;

    const displayValue = totalValue ?? team.current_event_squad_total_value ?? 0;

    return (
        <div className="team-card">
            <h2>{team.name}</h2>
            <div className="team-stats">
                <div className="team-stat-item"><span className="stat-label">Manager:</span> <span className="stat-value">{team.player_first_name} {team.player_last_name}</span></div>
                <div className="team-stat-item"><span className="stat-label">Rank:</span> <span className="stat-value">{team.summary_overall_rank?.toLocaleString()}</span></div>
                <div className="team-stat-item"><span className="stat-label">Points:</span> <span className="stat-value">{team.summary_overall_points}</span></div>
                <div className="team-stat-item"><span className="stat-label">Gameweek:</span> <span className="stat-value">{team.current_event}</span></div>
                <div className="team-stat-item"><span className="stat-label">GW Points:</span> <span className="stat-value">{team.summary_event_points}</span></div>
                <div className="team-stat-item"><span className="stat-label">Value:</span> <span className="stat-value">£{(displayValue / 10).toFixed(1)}m</span></div>
                {bank !== undefined && (
                    <div className="team-stat-item"><span className="stat-label">Bank:</span> <span className="stat-value">£{(bank / 10).toFixed(1)}m</span></div>
                )}
            </div>
        </div>
    );
}
