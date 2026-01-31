import type { Player, Team } from '../types/fpl';
import './PlayerHistoryModal.css';

interface BacktestResult {
    gw: number;
    points: number;
    net_points: number;
    transfer_cost: number;
    squad: Array<{
        id: number;
        name: string;
        points: number;
        xp: number;
        role: 'C' | 'V' | 'S' | 'B';
    }>;
}

interface PlayerHistoryModalProps {
    player: Player;
    history: BacktestResult[];
    onClose: () => void;
    teamName?: string;
}

export function PlayerHistoryModal({ player, history, onClose, teamName }: PlayerHistoryModalProps) {
    // Filter history for this player
    const playerHistory = history.map(h => {
        const squadPlayer = h.squad.find(p => p.id === player.id);
        if (!squadPlayer) return null;
        return {
            gw: h.gw,
            ...squadPlayer
        };
    }).filter(h => h !== null) as Array<{
        gw: number;
        points: number;
        xp: number;
        role: 'C' | 'V' | 'S' | 'B';
    }>;

    const totalPoints = playerHistory.reduce((sum, h) => sum + h.points, 0);
    const avgPoints = playerHistory.length > 0 ? (totalPoints / playerHistory.length).toFixed(1) : '0.0';
    const totalXp = playerHistory.reduce((sum, h) => sum + h.xp, 0).toFixed(1);

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2>{player.web_name}</h2>
                        {teamName && <span style={{ color: '#888', fontSize: '1rem' }}>{teamName}</span>}
                    </div>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <div className="stats-summary">
                        <div className="stat-item">
                            <span className="stat-label">Total Points</span>
                            <span className="stat-val">{totalPoints}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Avg / GW</span>
                            <span className="stat-val">{avgPoints}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Total xP</span>
                            <span className="stat-val">{totalXp}</span>
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th>GW</th>
                                    <th>Role</th>
                                    <th>xP</th>
                                    <th>Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                {playerHistory.map(h => (
                                    <tr key={h.gw}>
                                        <td>{h.gw}</td>
                                        <td className={`role-${h.role}`}>{h.role === 'S' ? 'Start' : (h.role === 'B' ? 'Bench' : h.role)}</td>
                                        <td>{h.xp.toFixed(1)}</td>
                                        <td className="points-cell">{h.points}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
