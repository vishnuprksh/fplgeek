
import { useState, useMemo } from 'react';
import type { Player, Team, UnifiedPlayer } from '../types/fpl';
import type { PredictionMetadata } from '../types/gameweek';
import './PlayerAnalysis.css';
import { PlayerDetailModal } from './PlayerDetailModal';

interface PlayerAnalysisProps {
    elements: Player[];
    teams: Team[];
    t100Ownership?: Record<number, number>;
    aiPredictions?: Record<number, any>;
    gameweekMetadata?: PredictionMetadata | null;
}

type SortField = keyof Player | 'prob_gt_6' | 'prob_gt_6_next' | 'r6_min' | 'r6_pts' | 'r6_inf' | 'r6_cre' | 'r6_thr' | 'r6_xg' | 't100_ownership' | 'f_atk_next' | 'f_def_next' | 'gw1_haul' | 'gw2_haul' | 'gw3_haul';
type SortDirection = 'asc' | 'desc';

export function PlayerAnalysis({ elements, teams, t100Ownership, aiPredictions, gameweekMetadata }: PlayerAnalysisProps) {
    const [search, setSearch] = useState('');
    const [positionFilter, setPositionFilter] = useState<number | 'all'>('all');
    const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
    const [maxOwnership, setMaxOwnership] = useState<number | 'all'>('all');
    const [sortField, setSortField] = useState<SortField>('t100_ownership');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

    // Elements already have smart_value calculated? (Actually they don't, but let's just use raw elements)
    const enrichedPlayers = useMemo(() => {
        return elements.map(p => {
            const pred = aiPredictions?.[p.id];
            const gw1_haul = pred?.projections?.[0]?.prob_gt_6 ?? 0;
            const gw2_haul = pred?.projections?.[1]?.prob_gt_6 ?? 0;
            const gw3_haul = pred?.projections?.[2]?.prob_gt_6 ?? 0;
            return {
                ...p,
                prob_gt_6: pred?.prob_gt_6 ?? 0,
                prob_gt_6_next: pred?.prob_gt_6_next ?? 0,
                gw1_haul,
                gw2_haul,
                gw3_haul,
                r6_min: pred?.r6_min ?? 0,
                r6_pts: pred?.r6_pts ?? 0,
                r6_inf: pred?.r6_inf ?? 0,
                r6_cre: pred?.r6_cre ?? 0,
                r6_thr: pred?.r6_thr ?? 0,
                r6_xg: pred?.r6_xg ?? 0,
                f_atk_next: pred?.f_atk_next ?? 0,
                f_def_next: pred?.f_def_next ?? 0,
                ownership: parseFloat(p.selected_by_percent || "0"),
                t100_ownership: t100Ownership ? (t100Ownership[p.id] || 0) : 0
            };
        });
    }, [elements, t100Ownership, aiPredictions]);

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

    // Get color intensity based on value rank (0-1, where 1 is highest)
    const getTop10Color = (field: SortField, value: number): string => {
        const sorted = [...filteredPlayers]
            .map(p => Number((p as any)[field] || 0))
            .filter(v => v > 0)
            .sort((a, b) => b - a);
        
        if (sorted.length === 0) return 'transparent';
        
        const top10 = sorted.slice(0, 10);
        const isInTop10 = value >= top10[top10.length - 1];
        
        if (!isInTop10) return 'transparent';
        
        // Calculate intensity (0-1)
        const maxVal = top10[0];
        const minVal = top10[top10.length - 1];
        const range = maxVal - minVal || 1;
        const intensity = (value - minVal) / range;
        
        // Use different colors for different value ranges
        return `rgba(168, 85, 247, ${intensity * 0.5 + 0.15})`;
    };

    // TODO: topHaulPlayers could be displayed in UI later

    return (
        <div className="player-analysis fade-in">
            {/* Summary Section (removed) */}

            <div className="dashboard-panel">
                <div className="analysis-header" style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.4rem' }}>🏃</span>
                        <h2 style={{ margin: 0 }}>Player Search & Data</h2>
                    </div>

                    <div className="analysis-toolbar">
                        {gameweekMetadata && (
                            <div style={{ fontSize: '0.9em', color: '#888', padding: '0 10px', whiteSpace: 'nowrap' }}>
                                📊 GW {gameweekMetadata.nextPlayGW}-{gameweekMetadata.nextPlayGW + 2}
                            </div>
                        )}
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
                </div>

                <div className="table-container" style={{ padding: '2px' }}>
                    <table className="analysis-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Team</th>
                                <th>Pos</th>
                                <th onClick={() => handleSort('gw1_haul')} className="sortable">GW {gameweekMetadata?.nextPlayGW ?? '?'} {sortField === 'gw1_haul' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('gw2_haul')} className="sortable">GW {gameweekMetadata ? gameweekMetadata.nextPlayGW + 1 : '?'} {sortField === 'gw2_haul' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('gw3_haul')} className="sortable">GW {gameweekMetadata ? gameweekMetadata.nextPlayGW + 2 : '?'} {sortField === 'gw3_haul' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('prob_gt_6')} className="sortable">Haul Avg (3GW) {sortField === 'prob_gt_6' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_pts')} className="sortable">L6 Pts {sortField === 'r6_pts' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_xg')} className="sortable">L6 xG {sortField === 'r6_xg' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_inf')} className="sortable">L6 Inf {sortField === 'r6_inf' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_cre')} className="sortable">L6 Cre {sortField === 'r6_cre' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_thr')} className="sortable">L6 Thr {sortField === 'r6_thr' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_min')} className="sortable">L6 Min {sortField === 'r6_min' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('now_cost')} className="sortable">Price {sortField === 'now_cost' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('total_points')} className="sortable">Points {sortField === 'total_points' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('form')} className="sortable">Form {sortField === 'form' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('t100_ownership')} className="sortable">T100% {sortField === 't100_ownership' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('selected_by_percent')} className="sortable">Selected % {sortField === 'selected_by_percent' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPlayers.slice(0, 100).map(player => (
                                <tr key={player.id} onClick={() => setSelectedPlayer(player)} className="clickable-row">
                                    <td className="player-name-cell">
                                        <div className="player-name-main">{player.web_name}</div>
                                    </td>
                                    <td>{getTeamName(player.team)}</td>
                                    <td>{getPosition(player.element_type)}</td>
                                    <td className="color-cell" style={{ fontWeight: 600 }}>
                                        {(((player as any).gw1_haul || 0) * 100).toFixed(0)}%
                                    </td>
                                    <td className="color-cell" style={{ fontWeight: 500, fontSize: '0.85em' }}>
                                        {(((player as any).gw2_haul || 0) * 100).toFixed(0)}%
                                    </td>
                                    <td className="color-cell" style={{ fontWeight: 500, fontSize: '0.85em' }}>
                                        {(((player as any).gw3_haul || 0) * 100).toFixed(0)}%
                                    </td>
                                    <td className="color-cell" style={{ fontWeight: 800 }}>
                                        {((player as any).prob_gt_6 * 100).toFixed(0)}%
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('r6_pts', (player as any).r6_pts) }}>
                                        {((player as any).r6_pts || 0).toFixed(1)}
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('r6_xg', (player as any).r6_xg) }}>
                                        {((player as any).r6_xg || 0).toFixed(2)}
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('r6_inf', (player as any).r6_inf) }}>
                                        {((player as any).r6_inf || 0).toFixed(1)}
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('r6_cre', (player as any).r6_cre) }}>
                                        {((player as any).r6_cre || 0).toFixed(1)}
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('r6_thr', (player as any).r6_thr) }}>
                                        {((player as any).r6_thr || 0).toFixed(1)}
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('r6_min', (player as any).r6_min) }}>
                                        {((player as any).r6_min || 0).toFixed(0)}
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('now_cost', player.now_cost) }}>
                                        £{(player.now_cost / 10).toFixed(1)}m
                                    </td>
                                    <td className="font-bold" style={{ backgroundColor: getTop10Color('total_points', player.total_points) }}>
                                        {player.total_points}
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('form', parseFloat(player.form)) }}>
                                        {player.form}
                                    </td>
                                    <td style={{ color: (player as any).t100_ownership > 40 ? '#fbbf24' : (player as any).t100_ownership > 0 ? '#888' : '#444', backgroundColor: getTop10Color('t100_ownership', (player as any).t100_ownership) }}>
                                        {(player as any).t100_ownership > 0 ? `${(player as any).t100_ownership.toFixed(0)}%` : '-'}
                                    </td>
                                    <td style={{ backgroundColor: getTop10Color('selected_by_percent', parseFloat(player.selected_by_percent)) }}>
                                        {player.selected_by_percent}%
                                    </td>
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
        </div>
    );
}
