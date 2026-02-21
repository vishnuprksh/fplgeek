import { useState, useEffect, useMemo } from 'react';
import './LeagueAnalysis.css';

interface OwnedPlayer {
    id: number;
    name: string;
    count: number;
    percent: number;
    effective_ownership: number;
}

interface GWData {
    gw: number;
    top_owned: OwnedPlayer[];
}

interface LeagueData {
    league_id: number;
    total_teams_analyzed: number;
    history: GWData[];
}

interface TableRow {
    name: string;
    [key: string]: string | number; // 'gw1': 10, etc.
}

type SortConfig = { key: string; direction: 'asc' | 'desc' };

export function LeagueAnalysis() {
    const [data, setData] = useState<LeagueData | null>(null);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const [metric, setMetric] = useState<'percent' | 'effective_ownership'>('percent');

    useEffect(() => {
        fetch('/data/league_analysis.json')
            .then(res => {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("text/html")) {
                    throw new Error("Data not generated yet (HTML response)");
                }
                if (!res.ok) {
                    throw new Error(`Failed to fetch data: ${res.statusText}`);
                }
                return res.json();
            })
            .then((json: LeagueData) => {
                setData(json);
                setLoading(false);
                // Default sort: Latest GW Descending
                if (json.history.length > 0) {
                    const lastGw = json.history[json.history.length - 1].gw;
                    setSortConfig({ key: `gw${lastGw}`, direction: 'desc' });
                }
            })
            .catch(err => {
                console.warn("League data missing or invalid:", err);
                setLoading(false);
            });
    }, []);

    // Transform data for Table: Rows = Players, Cols = GWs
    const tableData = useMemo(() => {
        if (!data) return { rows: [], columns: [] };

        const playerMap = new Map<string, TableRow>();
        const gws: number[] = [];

        data.history.forEach(h => {
            gws.push(h.gw);
            h.top_owned.forEach(p => {
                if (!playerMap.has(p.name)) {
                    playerMap.set(p.name, { name: p.name });
                }
                const row = playerMap.get(p.name)!;
                row[`gw${h.gw}`] = p[metric] || 0;
            });
        });

        // Ensure all rows have all GW columns (fill 0 if missing)
        Array.from(playerMap.values()).forEach(row => {
            gws.forEach(gw => {
                if (row[`gw${gw}`] === undefined) {
                    row[`gw${gw}`] = 0;
                }
            });
        });

        const rows = Array.from(playerMap.values());
        const columns = gws.sort((a, b) => b - a); // Descending order: Latest first

        return { rows, columns };
    }, [data, metric]);

    const sortedRows = useMemo(() => {
        let sortableItems = [...tableData.rows];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];

                if (aVal < bVal) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aVal > bVal) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [tableData, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    if (loading) return <div className="loading-text">Loading League Data...</div>;
    if (!data) return <div className="error-text">No data found. Please run the analyzer script.</div>;

    return (
        <div className="league-analysis-container fade-in">
            <div className="analysis-header">
                <h2>League Ownership Analysis</h2>
                <div className="league-meta">
                    <span>League ID: {data.league_id}</span>
                    <span>Sample Size: {data.total_teams_analyzed} Teams</span>
                </div>
                <div className="metric-toggle">
                    <button
                        className={`toggle-btn ${metric === 'percent' ? 'active' : ''}`}
                        onClick={() => setMetric('percent')}
                    >
                        Ownership
                    </button>
                    <button
                        className={`toggle-btn ${metric === 'effective_ownership' ? 'active' : ''}`}
                        onClick={() => setMetric('effective_ownership')}
                    >
                        Effective Ownership (EO)
                    </button>
                </div>
            </div>

            <div className="table-container">
                <table className="analysis-table">
                    <thead>
                        <tr>
                            <th
                                className={sortConfig?.key === 'name' ? sortConfig.direction : ''}
                                onClick={() => requestSort('name')}
                            >
                                Player
                            </th>
                            {tableData.columns.map(gw => (
                                <th
                                    key={gw}
                                    className={sortConfig?.key === `gw${gw}` ? sortConfig.direction : ''}
                                    onClick={() => requestSort(`gw${gw}`)}
                                >
                                    GW {gw}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.map((row) => (
                            <tr key={row.name as string}>
                                <td className="player-col">{row.name}</td>
                                {tableData.columns.map(gw => {
                                    const val = row[`gw${gw}`] as number;
                                    // Max percent is usually ~100%, EO max is ~300%
                                    const maxExpected = metric === 'percent' ? 100 : 200;
                                    const intensity = Math.min(val / maxExpected, 1);
                                    const color = `rgba(0, 255, 135, ${0.1 + (intensity * 0.9)})`;
                                    const textColor = intensity > 0.5 ? '#000' : '#fff'; // Contrast text

                                    return (
                                        <td
                                            key={gw}
                                            style={{ backgroundColor: color, color: textColor }}
                                        >
                                            {val > 0 ? val.toFixed(1) + '%' : '-'}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
