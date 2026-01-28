import { useState } from 'react';
import type { Player, Team, Pick } from '../types/fpl';
import './TransferModal.css';

interface TransferModalProps {
    player: Player;
    elements: Player[];
    teams: Team[];
    currentPicks: Pick[];
    bank: number;
    onClose: () => void;
    onTransfer: (playerOut: Player, playerIn: Player) => void;
}

export function TransferModal({ player, elements, teams, currentPicks, bank, onClose, onTransfer }: TransferModalProps) {
    const [searchTerm, setSearchTerm] = useState("");

    const getTeamName = (id: number) => teams.find(t => t.id === id)?.short_name;

    // Get outgoing player's actual selling price
    const currentPick = currentPicks.find(p => p.element === player.id);
    const sellingPrice = currentPick?.selling_price ?? player.now_cost;

    // Helper: Check if player can be transferred in
    const getTransferStatus = (target: Player) => {
        // 1. Check if already in team
        const alreadyOwned = currentPicks.some(p => p.element === target.id);
        if (alreadyOwned) return { valid: false, reason: "Owned" };

        // 2. Check Budget
        if (bank - (target.now_cost - sellingPrice) < 0) return { valid: false, reason: "Too Expensive" };

        // 3. Check Team Limit (Max 3)
        const teamCount = currentPicks.reduce((count, p) => {
            const pickPlayer = elements.find(e => e.id === p.element);
            // Don't count the player leaving
            if (pickPlayer?.team === target.team && pickPlayer?.id !== player.id) {
                return count + 1;
            }
            return count;
        }, 0);

        if (target.team === player.team) {
            if (teamCount >= 3) return { valid: false, reason: "Max 3 Agents" };
        } else {
            if (teamCount >= 3) return { valid: false, reason: "Max 3 Players" };
        }

        return { valid: true };
    };

    // Filter and sort players
    const recommendations = elements
        .filter(e => {
            const isPositionMatch = e.element_type === player.element_type;
            const isNotSelf = e.id !== player.id;
            const hasSmartValue = e.smart_value !== undefined;

            // Search Logic
            const searchLower = searchTerm.toLowerCase();
            const nameMatch = !searchTerm ||
                e.web_name.toLowerCase().includes(searchLower) ||
                e.first_name.toLowerCase().includes(searchLower) ||
                e.second_name.toLowerCase().includes(searchLower);

            return isPositionMatch && isNotSelf && hasSmartValue && nameMatch;
        })
        .sort((a, b) => (b.smart_value || 0) - (a.smart_value || 0)); // Sort by Smart Value Descending

    // Helper for score colors
    const getScoreColor = (score: number) => {
        if (score >= 70) return '#4caf50'; // High Green
        if (score >= 50) return '#8bc34a'; // Light Green
        if (score >= 30) return '#ffc107'; // Yellow
        if (score >= 15) return '#ff9800'; // Orange
        return '#f44336'; // Red
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2>Transfer Recommendations <span className="modal-subtitle">for {player.web_name}</span></h2>
                        <div className="search-container">
                            <input
                                type="text"
                                placeholder="Search players..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="search-input-modal"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="header-meta">
                        <span className="bank-info">Bank: £{(bank / 10).toFixed(1)}m</span>
                        <button className="close-btn" onClick={onClose}>&times;</button>
                    </div>
                </div>

                <div className="modal-body">
                    <div className="recommendation-section">
                        <h3>Top Smart Value Replacements {searchTerm && `(Found ${recommendations.length})`}</h3>
                        <div className="table-wrapper">
                            <table className="transfer-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Team</th>
                                        <th>Cost</th>
                                        <th>Diff</th>
                                        <th>Smart Value</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recommendations.map(rec => {
                                        const balanceChange = sellingPrice - rec.now_cost;
                                        const status = getTransferStatus(rec);
                                        const sv = rec.smart_value || 0;

                                        return (
                                            <tr key={rec.id} className={!status.valid ? "row-disabled" : ""}>
                                                <td>{rec.web_name}</td>
                                                <td>{getTeamName(rec.team)}</td>
                                                <td>£{(rec.now_cost / 10).toFixed(1)}</td>
                                                <td className={balanceChange >= 0 ? "positive-diff" : "negative-diff"}>
                                                    {balanceChange > 0 ? `+£${(balanceChange / 10).toFixed(1)}` : balanceChange < 0 ? `-£${(Math.abs(balanceChange) / 10).toFixed(1)}` : `£0.0`}
                                                </td>
                                                <td className="smart-value-cell">
                                                    <div style={{
                                                        backgroundColor: getScoreColor(sv),
                                                        color: '#fff',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontWeight: 'bold',
                                                        display: 'inline-block',
                                                        minWidth: '40px',
                                                        textAlign: 'center',
                                                        fontSize: '0.9em'
                                                    }}>
                                                        {sv.toFixed(0)}
                                                    </div>
                                                </td>
                                                <td>
                                                    {status.valid ? (
                                                        <button
                                                            className="transfer-btn"
                                                            onClick={() => onTransfer(player, rec)}
                                                        >
                                                            Select
                                                        </button>
                                                    ) : (
                                                        <span className="status-error">{status.reason}</span>
                                                    )}
                                                </td>
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
