
import { useState, useMemo } from 'react';
import type { Player, Team, UnifiedPlayer } from '../types/fpl';
import './PlayerAnalysis.css';
import { PlayerDetailModal } from './PlayerDetailModal';



interface PlayerAnalysisProps {
    elements: Player[];
    teams: Team[];
    predictions?: Record<number, { totalForecast: number, next5Points: number[] }>;
}

type SortField = keyof Player | 'smart_value' | 'predicted_points' | 'next_gw_points';
type SortDirection = 'asc' | 'desc';

export function PlayerAnalysis({ elements, teams, predictions }: PlayerAnalysisProps) {
    const [search, setSearch] = useState('');
    const [positionFilter, setPositionFilter] = useState<number | 'all'>('all');
    const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
    const [maxOwnership, setMaxOwnership] = useState<number | 'all'>('all');
    const [sortField, setSortField] = useState<SortField>('predicted_points');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

    // Elements already have smart_value calculated in App.tsx
    const enrichedPlayers = useMemo(() => {
        return elements.map(p => {
            const pred = predictions ? predictions[p.id] : null;
            return {
                ...p,
                smart_value: (p.smart_value || 0),
                predicted_points: pred ? pred.totalForecast : 0,
                next_gw_points: pred && pred.next5Points.length > 0 ? pred.next5Points[0] : 0,
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
            if (sortField === 'smart_value') {
                const valA = a.smart_value ?? 0;
                const valB = b.smart_value ?? 0;
                return sortDirection === 'asc' ? valA - valB : valB - valA;
            }
            if (sortField === 'predicted_points') {
                const valA = a.predicted_points ?? 0;
                const valB = b.predicted_points ?? 0;
                return sortDirection === 'asc' ? valA - valB : valB - valA;
            }
            if (sortField === 'next_gw_points') {
                const valA = a.next_gw_points ?? 0;
                const valB = b.next_gw_points ?? 0;
                return sortDirection === 'asc' ? valA - valB : valB - valA;
            }

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

    const getScoreColor = (score: number) => {
        if (score >= 70) return '#4caf50'; // High Green
        if (score >= 50) return '#8bc34a'; // Light Green
        if (score >= 30) return '#ffc107'; // Yellow
        if (score >= 15) return '#ff9800'; // Orange
        return '#f44336'; // Red
    };

    const getScoreLabel = (type: number) => {
        if (type === 1) return 'GVS';
        if (type === 2) return 'DVS';
        if (type === 3) return 'MVS';
        if (type === 4) return 'AVS';
        return '-';
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
                            <th onClick={() => handleSort('predicted_points')} className="sortable">AI Pred (5GW) {sortField === 'predicted_points' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('next_gw_points')} className="sortable">Next GW {sortField === 'next_gw_points' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            <th onClick={() => handleSort('smart_value')} className="sortable">Smart Val {sortField === 'smart_value' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
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
                                <td style={{ fontWeight: 'bold', color: player.predicted_points > 25 ? '#00ff87' : '#fff' }}>
                                    {player.predicted_points.toFixed(1)}
                                </td>
                                <td style={{ color: player.next_gw_points > 5 ? '#00ff87' : '#fff' }}>
                                    {player.next_gw_points.toFixed(1)}
                                </td>
                                <td>
                                    {(player.element_type >= 1 && player.element_type <= 4) ? (
                                        <div className="dvs-badge" style={{ backgroundColor: getScoreColor(player.smart_value || 0), color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '60px', textAlign: 'center', fontSize: '0.85em' }}>
                                            {(player.smart_value || 0).toFixed(0)} <span style={{ fontSize: '0.7em', opacity: 0.8, marginLeft: '4px' }}>({getScoreLabel(player.element_type)})</span>
                                        </div>
                                    ) : (
                                        <span style={{ color: '#ccc' }}>-</span>
                                    )}
                                </td>
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
