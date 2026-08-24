import React, { useEffect, useState } from 'react';
import './DataView.css';
import { dataApi } from '../services/dataApi';

interface ProcessedSample {
    name: string;
    id: number;
    gw: number;
    season: string;
    target: number;
    is_future: boolean;
    ctx_was_home: number;
    ctx_opponent: number;
    ctx_difficulty: number;
    ctx_price: number;
    ctx_hours_rest: number;
    ctx_ownership: number;
    ctx_chance_of_playing: number;
    ctx_fixture_attack: number;
    ctx_fixture_defense: number;
    agg_r6: number[]; // pre-computed rolling-window aggregates [min, pts, xG, xA, inf, cre, thr, gc, saves]
}

export const DataView: React.FC = () => {
    const [data, setData] = useState<ProcessedSample[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [position, setPosition] = useState('MID');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [search, setSearch] = useState('');
    const [showAggregates, setShowAggregates] = useState(true);

    const pageSize = 50;

    const fetchData = async () => {
        setLoading(true);
        try {
            const result = await dataApi.getTrainingData(new URLSearchParams({ position, page: String(page), pageSize: String(pageSize), search }));
            setData(result.data as unknown as ProcessedSample[]);
            setTotal(result.total);
            setTotalPages(result.totalPages);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to fetch training data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Debounce search
        const timer = setTimeout(() => {
            fetchData();
        }, search ? 300 : 0);

        return () => clearTimeout(timer);
    }, [position, page, search]);



    const positions = ['GKP', 'DEF', 'MID', 'FWD'];

    return (
        <div className="data-view-container">
            <div className="data-view-header">
                <h2>📈 Preprocessed Training Data</h2>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button
                        className={`pos-tab ${showAggregates ? 'active' : ''}`}
                        onClick={() => setShowAggregates(!showAggregates)}
                        style={{ fontSize: '0.8rem' }}
                    >
                        {showAggregates ? 'Hide History Aggr' : 'Show History Aggr'}
                    </button>
                    <div className="page-info">
                        Showing {total.toLocaleString()} samples {search && `matching "${search}"`}
                    </div>
                </div>
            </div>

            <div className="data-controls">
                <div className="pos-tabs">
                    {positions.map(pos => (
                        <button
                            key={pos}
                            className={`pos-tab ${position === pos ? 'active' : ''}`}
                            onClick={() => {
                                setPosition(pos);
                                setPage(1);
                            }}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search player name..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1); // Reset to first page on search
                    }}
                />
            </div>

            {loading ? (
                <div className="loading-spinner">Loading dataset...</div>
            ) : error ? (
                <div className="error-message">{error}</div>
            ) : (
                <>
                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th rowSpan={2}>Player</th>
                                    <th rowSpan={2} title="Season">S</th>
                                    <th rowSpan={2} title="Gameweek">GW</th>
                                    <th rowSpan={2} title="Target Points">Target</th>
                                    <th colSpan={9} style={{ textAlign: 'center', background: '#2a2a2a' }}>Current Fixture Context</th>
                                    {showAggregates && (
                                        <>
                                            <th colSpan={9} style={{ textAlign: 'center', background: '#1c2e26' }}>R6 Aggregates (6-Game Window)</th>
                                        </>
                                    )}
                                    <th rowSpan={2}>Status</th>
                                </tr>
                                <tr>
                                    <th title="Was Home">H</th>
                                    <th title="Opponent Strength">Opp</th>
                                    <th title="Difficulty">Diff</th>
                                    <th title="Price">£</th>
                                    <th title="Hours Rest">Rest</th>
                                    <th title="Ownership %">Own%</th>
                                    <th title="Chance of Playing">Ch%</th>
                                    <th title="Fixture Attack Strength">Atk</th>
                                    <th title="Fixture Defense Strength">Def</th>
                                    {showAggregates && (
                                        <>
                                            <th title="R6 Pts">Pts</th>
                                            <th title="R6 xG">xG</th>
                                            <th title="R6 xA">xA</th>
                                            <th title="R6 Inf">Inf</th>
                                            <th title="R6 Cre">Cre</th>
                                            <th title="R6 Thr">Thr</th>
                                            <th title="R6 GC">GC</th>
                                            <th title="R6 Saves">Sav</th>
                                            <th title="R6 Min">Min</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((sample, idx) => {
                                    const r6 = showAggregates && sample.agg_r6 ? sample.agg_r6 : Array(9).fill(0);

                                    return (
                                        <tr key={`${sample.id}-${sample.gw}-${idx}`}>
                                            <td>{sample.name}</td>
                                            <td style={{ fontSize: '0.7rem', color: '#888' }}>{sample.season}</td>
                                            <td>{sample.gw}</td>
                                            <td className="target-points">{sample.target}</td>
                                            <td>{sample.ctx_was_home ? 'H' : 'A'}</td>
                                            <td>{sample.ctx_opponent}</td>
                                            <td>{sample.ctx_difficulty}</td>
                                            <td>{sample.ctx_price.toFixed(1)}</td>
                                            <td>{Math.round(sample.ctx_hours_rest)}</td>
                                            <td>{sample.ctx_ownership.toFixed(1)}%</td>
                                            <td>{sample.ctx_chance_of_playing}%</td>
                                            <td>{sample.ctx_fixture_attack.toFixed(2)}</td>
                                            <td>{sample.ctx_fixture_defense.toFixed(2)}</td>
                                            {showAggregates && (
                                                <>
                                                    {/* R6 */}
                                                    <td style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>{r6[1]?.toFixed(1)}</td>
                                                    <td>{r6[2]?.toFixed(2)}</td>
                                                    <td>{r6[3]?.toFixed(2)}</td>
                                                    <td>{r6[4]?.toFixed(1)}</td>
                                                    <td>{r6[5]?.toFixed(1)}</td>
                                                    <td>{r6[6]?.toFixed(1)}</td>
                                                    <td>{r6[7]?.toFixed(1)}</td>
                                                    <td>{r6[8]?.toFixed(1)}</td>
                                                    <td style={{ color: '#888' }}>{Math.round(r6[0] || 0)}</td>
                                                </>
                                            )}
                                            <td>
                                                {sample.is_future ? (
                                                    <span className="future-badge">FUTURE</span>
                                                ) : (
                                                    <span style={{ color: '#888' }}>PAST</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="pagination">
                        <button
                            className="page-btn"
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            Previous
                        </button>
                        <span className="page-info">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            className="page-btn"
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Next
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
