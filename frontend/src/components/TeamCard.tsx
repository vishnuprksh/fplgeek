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
            <div className="team-card-header">
                <div className="team-info">
                    <h2>{team.name}</h2>
                    <span className="manager-name">
                        <span className="icon">👤</span> {team.player_first_name} {team.player_last_name}
                    </span>
                </div>
                <div className="team-badge">GW {team.current_event}</div>
            </div>

            <div className="team-stats-grid">
                <div className="stat-card">
                    <span className="stat-label">Overall Rank</span>
                    <span className="stat-value highlight">#{team.summary_overall_rank?.toLocaleString()}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Total Points</span>
                    <span className="stat-value">{team.summary_overall_points}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">GW Points</span>
                    <span className="stat-value">{team.summary_event_points}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Team Value</span>
                    <span className="stat-value">£{(displayValue / 10).toFixed(1)}m</span>
                </div>
                {bank !== undefined && (
                    <div className="stat-card bank">
                        <span className="stat-label">In Bank</span>
                        <span className="stat-value">£{(bank / 10).toFixed(1)}m</span>
                    </div>
                )}
            </div>
        </div>
    );
}
