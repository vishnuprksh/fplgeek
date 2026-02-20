
import { useState, useMemo } from 'react';
import type { Player, Team, UnifiedPlayer } from '../types/fpl';
import './PlayerAnalysis.css';
import { PlayerDetailModal } from './PlayerDetailModal';



interface PlayerAnalysisProps {
    elements: Player[];
    teams: Team[];
    predictions?: Record<number, any>;
}

type SortField = keyof Player | 'prob_gt_6' | 'prob_gt_6_next' | 'r10_min' | 'r10_pts' | 'r10_inf' | 'r10_thr';
type SortDirection = 'asc' | 'desc';

export function PlayerAnalysis({ elements, teams, predictions }: PlayerAnalysisProps) {
    const [search, setSearch] = useState('');
    const [positionFilter, setPositionFilter] = useState<number | 'all'>('all');
    const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
    const [maxOwnership, setMaxOwnership] = useState<number | 'all'>('all');
    const [sortField, setSortField] = useState<SortField>('prob_gt_6');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

    // Elements already have smart_value calculated in App.tsx
    const enrichedPlayers = useMemo(() => {
        return elements.map(p => {
            const pred = predictions ? predictions[p.id] : null;
            return {
                ...p,
                prob_gt_6: (pred as any)?.prob_gt_6 || 0,
                prob_gt_6_next: (pred as any)?.prob_gt_6_next || 0,
                r10_min: (pred as any)?.r10_min || 0,
                r10_pts: (pred as any)?.r10_pts || 0,
                r10_inf: (pred as any)?.r10_inf || 0,
                r10_thr: (pred as any)?.r10_thr || 0,
                ownership: parseFloat(p.selected_by_percent || "0")
            };
        });
    }, [elements, predictions]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const filteredPlayers = useMemo(() => {
        return enrichedPlayers.filter(p => {
            const matchesSearch = p.web_name.toLowerCase().includes(search.toLowerCase());
            const matchesPosition = positionFilter === 'all' || p.element_type === positionFilter;
            const matchesTeam = teamFilter === 'all' || p.team === teamFilter;
            const matchesOwnership = maxOwnership === 'all' || p.ownership <= maxOwnership;
            return matchesSearch && matchesPosition && matchesTeam && matchesOwnership;
        }).sort((a, b) => {
            // Handle Custom sorts
            const valA = Number((a as any)[sortField] || 0);
            const valB = Number((b as any)[sortField] || 0);
            return sortDirection === 'asc' ? valA - valB : valB - valA;
        });
    }, [enrichedPlayers, search, positionFilter, teamFilter, maxOwnership, sortField, sortDirection]);

    const getTeamName = (id: number) => teams.find(t => t.id === id)?.short_name || '-';
    const getPosition = (type: number) => {
        switch (type) {
            case 1: return 'GKP';
            case 2: return 'DEF';
            case 3: return 'MID';
            case 4: return 'FWD';
            default: return '-';
        }
    };



    return (
        <div className="player-analysis">
            <div className="analysis-toolbar">
                <input
                    type="text"
                    placeholder="Search players..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="search-input"
                />

                <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="filter-select"
                >
                    <option value="all">All Positions</option>
                    <option value="1">GKP</option>
                    <option value="2">DEF</option>
                    <option value="3">MID</option>
                    <option value="4">FWD</option>
                </select>

                <select
                    value={maxOwnership}
                    onChange={(e) => setMaxOwnership(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="filter-select"
                >
                    <option value="all">Any Ownership</option>
                    <option value="50">Under 50%</option>
                    <option value="20">Under 20%</option>
                    <option value="10">Differential (&lt;10%)</option>
                    <option value="5">Differential (&lt;5%)</option>
                    <option value="2">Ultra (&lt;2%)</option>
                </select>

                <select
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="filter-select"
                >
                    <option value="all">All Teams</option>
                    {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
            </div>

            <div className="table-container">
                <table className="analysis-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Team</th>
                            <th>Pos</th>
                            <th onClick={() => handleSort('prob_gt_6_next')} className="sortable">Next GW Haul {sortField === 'prob_gt_6_next' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('prob_gt_6')} className="sortable">Haul (3GW Avg) {sortField === 'prob_gt_6' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('r10_pts')} className="sortable">L10 Pts {sortField === 'r10_pts' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('r10_inf')} className="sortable">L10 Inf {sortField === 'r10_inf' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('r10_thr')} className="sortable">L10 Thr {sortField === 'r10_thr' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('r10_min')} className="sortable">L10 Min {sortField === 'r10_min' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('now_cost')} className="sortable">Price {sortField === 'now_cost' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('total_points')} className="sortable">Points {sortField === 'total_points' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('form')} className="sortable">Form {sortField === 'form' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('selected_by_percent')} className="sortable">Selected % {sortField === 'selected_by_percent' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPlayers.slice(0, 100).map(player => (
                            <tr key={player.id} onClick={() => setSelectedPlayer(player)} className="clickable-row">
                                <td className="player-name-cell">
                                    <div className="player-name-main">{player.web_name}</div>
                                    <span className="player-name-meta">{player.first_name} {player.second_name}</span>
                                </td>
                                <td>{getTeamName(player.team)}</td>
                                <td>{getPosition(player.element_type)}</td>
                                <td style={{ color: '#d8b4fe' }}>
                                    {((player as any).prob_gt_6_next * 100).toFixed(0)}%
                                </td>
                                <td style={{ color: '#c084fc', fontWeight: 'bold' }}>
                                    {((player as any).prob_gt_6 * 100).toFixed(0)}%
                                </td>
                                <td>{((player as any).r10_pts || 0).toFixed(1)}</td>
                                <td>{((player as any).r10_inf || 0).toFixed(1)}</td>
                                <td>{((player as any).r10_thr || 0).toFixed(1)}</td>
                                <td>{((player as any).r10_min || 0).toFixed(0)}</td>
                                <td>£{(player.now_cost / 10).toFixed(1)}m</td>
                                <td className="font-bold">{player.total_points}</td>
                                <td>{player.form}</td>
                                <td>{player.selected_by_percent}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="table-footer">
                    Showing top {Math.min(filteredPlayers.length, 100)} of {filteredPlayers.length} matches
                </div>
            </div>

            {selectedPlayer && (
                <PlayerDetailModal
                    player={selectedPlayer as UnifiedPlayer}
                    staticData={{ elements: elements as UnifiedPlayer[], teams, events: [], element_types: [] }}
                    onClose={() => setSelectedPlayer(null)}
                />
            )}
        </div>
    );
}
