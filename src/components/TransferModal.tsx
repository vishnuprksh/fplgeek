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
    predictions?: Record<number, any>;
    t100Ownership?: Record<number, number>;
}

type SortField = 'total_points' | 'form' | 'haul_3gw' | 'now_cost' | 'diff' | 't100_ownership';
type SortDirection = 'asc' | 'desc';

export function TransferModal({ player, elements, teams, currentPicks, bank, onClose, onTransfer, predictions, t100Ownership }: TransferModalProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<SortField>('total_points');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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
            // Search Logic
            const searchLower = searchTerm.toLowerCase();
            const nameMatch = !searchTerm ||
                e.web_name.toLowerCase().includes(searchLower) ||
                e.first_name.toLowerCase().includes(searchLower) ||
                e.second_name.toLowerCase().includes(searchLower);

            return isPositionMatch && isNotSelf && nameMatch;
        })
        .map(e => {
            const pred = predictions ? predictions[e.id] : null;
            return {
                ...e,
                haul_3gw: pred?.prob_gt_6 || 0,
                t100_ownership: t100Ownership ? (t100Ownership[e.id] || 0) : 0
            };
        })
        .sort((a, b) => {
            let valA: number = 0;
            let valB: number = 0;

            switch (sortField) {
                case 'total_points':
                    valA = a.total_points || 0;
                    valB = b.total_points || 0;
                    break;
                case 'form':
                    valA = parseFloat(a.form) || 0;
                    valB = parseFloat(b.form) || 0;
                    break;
                case 'haul_3gw':
                    valA = a.haul_3gw;
                    valB = b.haul_3gw;
                    break;
                case 'now_cost':
                    valA = a.now_cost;
                    valB = b.now_cost;
                    break;
                case 'diff':
                    valA = sellingPrice - a.now_cost;
                    valB = sellingPrice - b.now_cost;
                    break;
                case 't100_ownership':
                    valA = a.t100_ownership;
                    valB = b.t100_ownership;
                    break;
            }

            return sortDirection === 'asc' ? valA - valB : valB - valA;
        });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Helper for score colors


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
                        <h3>Top Replacements {searchTerm && `(Found ${recommendations.length})`}</h3>
                        <div className="table-wrapper">
                            <table className="transfer-table">
                                <thead>
                                    <tr>
                                        <th onClick={() => handleSort('total_points')} className="sortable">Name {sortField === 'total_points' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                        <th>Team</th>
                                        <th onClick={() => handleSort('form')} className="sortable">Form {sortField === 'form' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                        <th onClick={() => handleSort('haul_3gw')} className="sortable">3GW Haul {sortField === 'haul_3gw' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                        <th onClick={() => handleSort('t100_ownership')} className="sortable">T100% {sortField === 't100_ownership' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                        <th onClick={() => handleSort('now_cost')} className="sortable">Cost {sortField === 'now_cost' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                        <th onClick={() => handleSort('diff')} className="sortable">Diff {sortField === 'diff' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recommendations.map(rec => {
                                        const balanceChange = sellingPrice - rec.now_cost;
                                        const status = getTransferStatus(rec);

                                        return (
                                            <tr
                                                key={rec.id}
                                                className={!status.valid ? "row-disabled" : ""}
                                                onClick={() => status.valid && onTransfer(player, rec)}
                                                style={{ cursor: status.valid ? 'pointer' : 'default' }}
                                            >
                                                <td>
                                                    <div style={{ fontWeight: 'bold' }}>
                                                        {rec.web_name}
                                                        {!status.valid && <span className="status-error" style={{ marginLeft: '8px', fontSize: '0.8em', fontWeight: 'normal' }}>({status.reason})</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.8em', color: '#888' }}>{rec.total_points} pts</div>
                                                </td>
                                                <td>{getTeamName(rec.team)}</td>
                                                <td style={{ color: '#fbbf24', fontWeight: 500 }}>
                                                    {rec.form}
                                                </td>
                                                <td style={{ color: '#c084fc', fontWeight: 'bold' }}>
                                                    {(rec.haul_3gw * 100).toFixed(0)}%
                                                </td>
                                                <td style={{ color: rec.t100_ownership > 40 ? '#fbbf24' : rec.t100_ownership > 0 ? '#888' : '#444' }}>
                                                    {rec.t100_ownership > 0 ? `${rec.t100_ownership.toFixed(0)}%` : '-'}
                                                </td>
                                                <td>£{(rec.now_cost / 10).toFixed(1)}</td>
                                                <td className={balanceChange >= 0 ? "positive-diff" : "negative-diff"}>
                                                    {balanceChange > 0 ? `+£${(balanceChange / 10).toFixed(1)}` : balanceChange < 0 ? `-£${(Math.abs(balanceChange) / 10).toFixed(1)}` : `£0.0`}
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
