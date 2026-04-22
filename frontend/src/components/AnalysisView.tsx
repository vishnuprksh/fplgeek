
import React, { useEffect, useState } from 'react';
import './AnalysisView.css';

interface FeatureImportance {
    rank: number;
    feature: string;
    importance: number;
    haul_mean: number;
    non_haul_mean: number;
}

interface PositionAnalysis {
    samples: number;
    hauls: number;
    haul_rate: number;
    features: FeatureImportance[];
}

interface AnalysisData {
    [key: string]: PositionAnalysis;
}

export const AnalysisView: React.FC = () => {
    const [data, setData] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/data/feature_importance.json')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load analysis data');
                return res.json();
            })
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="analysis-loading">Loading model insights...</div>;
    if (error) return <div className="analysis-error">Error: {error}</div>;
    if (!data) return null;

    const positions = ['GKP', 'DEF', 'MID', 'FWD'];

    return (
        <div className="analysis-container fade-in">
            <header className="analysis-header">
                <div className="header-icon">🔍</div>
                <div className="header-text">
                    <h1>Model Insights</h1>
                    <p>Feature importance analysis for haul prediction (&gt;6 pts)</p>
                </div>
            </header>

            <div className="analysis-grid">
                {positions.map(pos => (
                    <div key={pos} className="position-card dashboard-panel">
                        <div className="card-header">
                            <h2>{pos}</h2>
                            <span className="sample-badge">
                                {data[pos].hauls} hauls in {data[pos].samples} games
                            </span>
                        </div>
                        
                        <div className="feature-list">
                            <div className="feature-item header">
                                <span>Feature</span>
                                <span className="importance-label">Importance</span>
                            </div>
                            {data[pos].features.map(feat => (
                                <div key={feat.feature} className="feature-item">
                                    <div className="feature-info">
                                        <span className="feature-name">{formatFeatureName(feat.feature)}</span>
                                        <div className="feature-bar-container">
                                            <div 
                                                className="feature-bar" 
                                                style={{ width: `${(feat.importance / 0.2) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className="importance-value">
                                        {(feat.importance * 100).toFixed(1)}%
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="card-footer">
                            <span className="haul-rate">
                                Base Haul Rate: {data[pos].haul_rate.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <section className="analysis-info dashboard-panel">
                <h3>How to read this?</h3>
                <p>
                    This analysis uses a <strong>Random Forest model</strong> trained on historical FPL data. 
                    The percentages represent how much weight the AI gives to each metric when predicting 
                    if a player will "haul" (score more than 6 points) in a given gameweek.
                </p>
                <ul>
                    <li><strong>r6:</strong> Rolling performance over the last 6 gameweeks.</li>
                    <li><strong>ctx:</strong> Contextual data like fixture difficulty, price, and home/away status.</li>
                    <li><strong>thr / cre / inf:</strong> Threat, Creativity, and Influence (ICT Index metrics).</li>
                </ul>
            </section>
        </div>
    );
};

function formatFeatureName(name: string): string {
    return name
        .replace('ctx_', '')
        .replace('r6_', '6wk ')
        .replace('inf', 'Influence')
        .replace('thr', 'Threat')
        .replace('cre', 'Creativity')
        .replace('min', 'Minutes')
        .replace('pts', 'Points')
        .replace('gc', 'GA')
        .replace('saves', 'Saves')
        .replace('xG', 'Expected Goals')
        .replace('xA', 'Expected Assists')
        .replace('difficulty', 'Difficulty')
        .replace('ownership', 'Ownership')
        .replace('price', 'Price')
        .replace('_', ' ');
}
