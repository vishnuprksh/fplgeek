
import { useState, useMemo } from 'react';
import type { Player, Team, UnifiedPlayer } from '../types/fpl';
import type { PredictionMetadata } from '../types/gameweek';
import { validateProjection } from '../utils/gameweekValidation';
import './PlayerAnalysis.css';
import { PlayerDetailModal } from './PlayerDetailModal';

interface PlayerAnalysisProps {
    elements: Player[];
    teams: Team[];
    predictions?: Record<number, any>;
    t100Ownership?: Record<number, number>;
    gameweekMetadata?: PredictionMetadata | null;
}

type SortField = keyof Player | 'prob_gt_6' | 'prob_gt_6_next' | 'r6_min' | 'r6_pts' | 'r6_inf' | 'r6_thr' | 'r6_xg' | 'r6_creativity' | 't100_ownership' | 'f_atk_next' | 'f_def_next' | 'gw1_haul' | 'gw2_haul' | 'gw3_haul';
type SortDirection = 'asc' | 'desc';

export function PlayerAnalysis({ elements, teams, predictions, t100Ownership, gameweekMetadata }: PlayerAnalysisProps) {
    const [search, setSearch] = useState('');
    const [positionFilter, setPositionFilter] = useState<number | 'all'>('all');
    const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
    const [maxOwnership, setMaxOwnership] = useState<number | 'all'>('all');
    const [sortField, setSortField] = useState<SortField>('prob_gt_6');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

    // Elements enriched with predictions, normalized to GW 34+
    const enrichedPlayers = useMemo(() => {
        return elements.map(p => {
            const pred = predictions ? predictions[p.id] : null;
            
            // Normalize prediction to GW 34+ only if metadata available
            let validatedProjs = (pred as any)?.projections || [];
            let gw1_haul = 0, gw2_haul = 0, gw3_haul = 0;
            let haul_avg = 0;
            
            if (gameweekMetadata && validatedProjs.length > 0) {
                // Validate each projection and filter to GW 34+
                const validated = validatedProjs
                    .map((proj: any) => validateProjection(proj, gameweekMetadata.nextPlayGW, gameweekMetadata.blankGWs))
                    .filter((proj: any) => proj.gw >= gameweekMetadata.nextPlayGW);
                
                // Extract GW 34, 35, 36 hauls (skip GW 33)
                if (validated.length > 0) gw1_haul = validated[0]?.prob_gt_6 || 0;
                if (validated.length > 1) gw2_haul = validated[1]?.prob_gt_6 || 0;
                if (validated.length > 2) gw3_haul = validated[2]?.prob_gt_6 || 0;
                
                // Calculate average across all available projections (including blank weeks)
                if (validated.length > 0) {
                    haul_avg = (gw1_haul + gw2_haul + gw3_haul) / validated.length;
                }
                
                validatedProjs = validated;
            } else if (validatedProjs.length > 0) {
                // Fallback: use first 3 projections if no metadata
                gw1_haul = (validatedProjs[0]?.prob_gt_6 || 0);
                gw2_haul = (validatedProjs[1]?.prob_gt_6 || 0);
                gw3_haul = (validatedProjs[2]?.prob_gt_6 || 0);
                haul_avg = (gw1_haul + gw2_haul + gw3_haul) / 3;
            }
            
            return {
                ...p,
                prob_gt_6: haul_avg,  // Updated to use validated avg
                prob_gt_6_next: (pred as any)?.prob_gt_6_next || 0,
                gw1_haul,  // GW 34
                gw2_haul,  // GW 35
                gw3_haul,  // GW 36
                r6_min: (pred as any)?.r6_min || 0,
                r6_pts: (pred as any)?.r6_pts || 0,
                r6_inf: (pred as any)?.r6_inf || 0,
                r6_thr: (pred as any)?.r6_thr || 0,
                r6_creativity: (((pred as any)?.r6_inf || 0) + ((pred as any)?.r6_thr || 0)) / 2,
                r6_xg: (pred as any)?.r6_xg || 0,
                f_atk_next: (pred as any)?.f_atk_next || 0,
                f_def_next: (pred as any)?.f_def_next || 0,
                projections: validatedProjs,
                ownership: parseFloat(p.selected_by_percent || "0"),
                t100_ownership: t100Ownership ? (t100Ownership[p.id] || 0) : 0
            };
        });
    }, [elements, predictions, t100Ownership, gameweekMetadata]);

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



    // TODO: topHaulPlayers could be displayed in UI later

    return (
        <div className="player-analysis fade-in">
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
                                <th onClick={() => handleSort('gw1_haul')} className="sortable">GW 34 {sortField === 'gw1_haul' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('gw2_haul')} className="sortable">GW 35 {sortField === 'gw2_haul' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('gw3_haul')} className="sortable">GW 36 {sortField === 'gw3_haul' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_creativity')} className="sortable">L6 Creative {sortField === 'r6_creativity' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('prob_gt_6')} className="sortable">Haul Avg (3GW) {sortField === 'prob_gt_6' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_pts')} className="sortable">L6 Pts {sortField === 'r6_pts' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_xg')} className="sortable">L6 xG {sortField === 'r6_xg' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                                <th onClick={() => handleSort('r6_inf')} className="sortable">L6 Inf {sortField === 'r6_inf' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
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
                                        <div className="color-bg" style={{ backgroundColor: `rgba(168, 85, 247, ${Math.min((player as any).gw1_haul * 0.8, 0.4)})` }}></div>
                                        {(((player as any).gw1_haul || 0) * 100).toFixed(0)}%
                                    </td>
                                    <td className="color-cell" style={{ fontWeight: 500, fontSize: '0.85em' }}>
                                        <div className="color-bg" style={{ backgroundColor: `rgba(168, 85, 247, ${Math.min((player as any).gw2_haul * 0.6, 0.3)})` }}></div>
                                        {(((player as any).gw2_haul || 0) * 100).toFixed(0)}%
                                    </td>
                                    <td className="color-cell" style={{ fontWeight: 500, fontSize: '0.85em' }}>
                                        <div className="color-bg" style={{ backgroundColor: `rgba(168, 85, 247, ${Math.min((player as any).gw3_haul * 0.6, 0.3)})` }}></div>
                                        {(((player as any).gw3_haul || 0) * 100).toFixed(0)}%
                                    </td>
                                    <td>{((player as any).r6_creativity || 0).toFixed(1)}</td>
                                    <td className="color-cell" style={{ fontWeight: 800 }}>
                                        <div className="color-bg" style={{ backgroundColor: `rgba(168, 85, 247, ${Math.min(player.prob_gt_6 * 1.5, 0.8)})` }}></div>
                                        {((player as any).prob_gt_6 * 100).toFixed(0)}%
                                    </td>
                                    <td>{((player as any).r6_pts || 0).toFixed(1)}</td>
                                    <td>{((player as any).r6_xg || 0).toFixed(2)}</td>
                                    <td>{((player as any).r6_inf || 0).toFixed(1)}</td>
                                    <td>{((player as any).r6_thr || 0).toFixed(1)}</td>
                                    <td>{((player as any).r6_min || 0).toFixed(0)}</td>
                                    <td>£{(player.now_cost / 10).toFixed(1)}m</td>
                                    <td className="font-bold">{player.total_points}</td>
                                    <td>{player.form}</td>
                                    <td style={{ color: (player as any).t100_ownership > 40 ? '#fbbf24' : (player as any).t100_ownership > 0 ? '#888' : '#444' }}>
                                        {(player as any).t100_ownership > 0 ? `${(player as any).t100_ownership.toFixed(0)}%` : '-'}
                                    </td>
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
        </div>
    );
}
