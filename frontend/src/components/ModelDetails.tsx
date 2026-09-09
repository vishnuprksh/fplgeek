import { useState, useEffect } from 'react';
import './ModelDetails.css';

interface ModelReport {
    [position: string]: {
        model: {
            type: string;
            params: Record<string, string | number>;
            n_features: number;
            n_classes: number;
        };
        training: {
            samples: number;
            train_samples: number;
            test_samples: number;
            test_size: number;
            random_state: number;
        };
        metrics: {
            test_accuracy: number;
            test_mae: number;
            test_log_loss: number;
        };
    };
}

interface FIEntry {
    rank: number;
    feature: string;
    importance: number;
    haul_mean: number;
    non_haul_mean: number;
}

interface FeatureImportance {
    [position: string]: {
        samples: number;
        hauls: number;
        haul_rate: number;
        features: FIEntry[];
    };
}

const POSITIONS = ['GKP', 'DEF', 'MID', 'FWD'] as const;

async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url);
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) return null;
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

export function ModelDetails() {
    const [report, setReport] = useState<ModelReport | null>(null);
    const [fi, setFi] = useState<FeatureImportance | null>(null);
    const [loading, setLoading] = useState(true);
    const [pos, setPos] = useState<string>('MID');

    useEffect(() => {
        Promise.all([
            fetchJson<ModelReport>('/ai-api/api/model-report'),
            fetchJson<FeatureImportance>('/ai-api/api/data/feature-importance')
        ]).then(([r, f]) => {
            setReport(r);
            setFi(f);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return (
            <div className="model-details fade-in">
                <div className="md-loading">Loading model details…</div>
            </div>
        );
    }

    const availablePos = POSITIONS.filter(p => report?.[p] || fi?.[p]);
    const activePos = availablePos.includes(pos as any) ? pos : availablePos[0];

    if (!report && !fi) {
        return (
            <div className="model-details fade-in">
                <div className="md-empty">
                    <h2>🤖 No Model Data Yet</h2>
                    <p>Run <strong>Update Data</strong> to train the model and generate metrics &amp; feature importance.</p>
                </div>
            </div>
        );
    }

    if (!activePos) {
        return (
            <div className="model-details fade-in">
                <div className="md-loading">No per-position model data available.</div>
            </div>
        );
    }

    const m = report?.[activePos]?.metrics;
    const training = report?.[activePos]?.training;
    const modelType = report?.[activePos]?.model.type;
    const fiData = fi?.[activePos];
    const maxImportance = fiData?.features.length
        ? Math.max(...fiData.features.map(f => f.importance))
        : 1;

    return (
        <div className="model-details fade-in">
            <div className="md-header">
                <h2>🤖 Model Details</h2>
                {modelType && (
                    <span className="md-model-type">{modelType}</span>
                )}
            </div>

            <div className="md-pos-tabs">
                {availablePos.map(p => (
                    <button
                        key={p}
                        className={`md-pos-tab${p === activePos ? ' active' : ''}`}
                        onClick={() => setPos(p)}
                    >
                        {p}
                    </button>
                ))}
            </div>

            {m && (
                <div className="md-metrics">
                    <div className="md-metric-card">
                        <span className="md-metric-value">{(m.test_accuracy * 100).toFixed(1)}%</span>
                        <span className="md-metric-label">Test Accuracy</span>
                    </div>
                    <div className="md-metric-card">
                        <span className="md-metric-value">{m.test_mae.toFixed(3)}</span>
                        <span className="md-metric-label">MAE</span>
                    </div>
                    <div className="md-metric-card">
                        <span className="md-metric-value">{m.test_log_loss.toFixed(3)}</span>
                        <span className="md-metric-label">Log Loss</span>
                    </div>
                    <div className="md-metric-card">
                        <span className="md-metric-value">{training!.train_samples.toLocaleString()}</span>
                        <span className="md-metric-label">Train Samples</span>
                    </div>
                    <div className="md-metric-card">
                        <span className="md-metric-value">{training!.test_samples.toLocaleString()}</span>
                        <span className="md-metric-label">Test Samples</span>
                    </div>
                </div>
            )}

            {report?.[activePos] && (
                <div className="md-section">
                    <h3>Model &amp; Training Configuration</h3>
                    <div className="md-params">
                        {Object.entries(report[activePos].model.params).map(([k, v]) => (
                            <div className="md-param" key={k}>
                                <span className="md-param-key">{k}</span>
                                <span className="md-param-value">{String(v)}</span>
                            </div>
                        ))}
                        <div className="md-param">
                            <span className="md-param-key">test_size</span>
                            <span className="md-param-value">{report[activePos].training.test_size}</span>
                        </div>
                        <div className="md-param">
                            <span className="md-param-key">n_features</span>
                            <span className="md-param-value">{report[activePos].model.n_features}</span>
                        </div>
                        <div className="md-param">
                            <span className="md-param-key">n_classes</span>
                            <span className="md-param-value">{report[activePos].model.n_classes}</span>
                        </div>
                    </div>
                </div>
            )}

            {fiData && (
                <div className="md-section">
                    <h3>
                        Feature Importance
                        <span className="md-fi-meta">
                            {fiData.hauls.toLocaleString()} hauls / {fiData.samples.toLocaleString()} samples ({fiData.haul_rate.toFixed(1)}%)
                        </span>
                    </h3>
                    <table className="md-fi-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Feature</th>
                                <th>Importance</th>
                                <th>Haul Mean</th>
                                <th>Non-Haul Mean</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fiData.features.map(f => (
                                <tr key={f.feature}>
                                    <td className="md-rank">{f.rank}</td>
                                    <td className="md-feature">{f.feature}</td>
                                    <td>
                                        <div className="md-bar-wrap">
                                            <div
                                                className="md-bar"
                                                style={{ width: `${(f.importance / maxImportance) * 100}%` }}
                                            />
                                            <span className="md-bar-label">{f.importance.toFixed(4)}</span>
                                        </div>
                                    </td>
                                    <td className="md-num">{f.haul_mean.toFixed(3)}</td>
                                    <td className="md-num">{f.non_haul_mean.toFixed(3)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
