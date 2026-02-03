import type { Player } from '../types/fpl';
import './PlayerHistoryModal.css';

interface BacktestResult {
    gw: number;
    points: number;
    net_points: number;
    transfer_cost?: number;
    squad: Array<{
        id: number;
        name: string;
        points: number;
        xp: number;
        selected_by_percent?: string | number;
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
    // Filter history for this player
    const playerHistory = history.map(h => {
        const squadPlayer = h.squad.find(p => p.id === player.id);
        return {
            gw: h.gw,
            inSquad: !!squadPlayer,
            ...squadPlayer
        };
    }).sort((a, b) => a.gw - b.gw); // Ensure chronological order filter(h => h !== null) removed to keep all GWs match

    const validHistory = playerHistory.filter(h => h.inSquad);
    const totalPoints = validHistory.reduce((sum, h) => sum + (h.points || 0), 0);
    const avgPoints = validHistory.length > 0 ? (totalPoints / validHistory.length).toFixed(1) : '0.0';
    const totalXp = validHistory.reduce((sum, h) => sum + (h.xp || 0), 0).toFixed(1);

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
                                    <th>Selected %</th>
                                    <th>xP</th>
                                    <th>Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                {playerHistory.map(h => (
                                    <tr key={h.gw} className={!h.inSquad ? 'row-inactive' : ''}>
                                        <td>{h.gw}</td>
                                        {h.inSquad ? (
                                            <>
                                                <td className={`role-${h.role}`}>{h.role === 'S' ? 'Start' : (h.role === 'B' ? 'Bench' : h.role)}</td>
                                                <td>{h.selected_by_percent || '-'}%</td>
                                                <td>{h.xp?.toFixed(1)}</td>
                                                <td className="points-cell">{h.points}</td>
                                            </>
                                        ) : (
                                            <td colSpan={4} style={{ textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                                                Not in Squad
                                            </td>
                                        )}
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
