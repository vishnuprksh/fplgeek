import type { OptimizationResult } from '../utils/solver';
import './OptimizationReport.css';

interface OptimizationReportProps {
    result: OptimizationResult;
}

export function OptimizationReport({ result }: OptimizationReportProps) {
    const { transfers, haulBefore, haulAfter, netGainPercent, formationSelected, logLines, warnings } = result;

    const gainColor = netGainPercent > 0 ? '#00ff87' : netGainPercent < 0 ? '#ef4444' : '#888';

    return (
        <div className="opt-report">
            <div className="opt-report-header">
                <h3>📊 Optimization Report</h3>
                <span className="opt-gain" style={{ color: gainColor }}>
                    {netGainPercent > 0 ? `+${netGainPercent}` : netGainPercent}% Haul Gain
                </span>
            </div>

            {/* Summary Bar */}
            <div className="opt-summary-bar">
                <div className="opt-metric">
                    <span className="opt-metric-label">XI Haul Before</span>
                    <span className="opt-metric-value" style={{ color: '#888' }}>
                        {(haulBefore * 100).toFixed(1)}%
                    </span>
                </div>
                <div className="opt-arrow">→</div>
                <div className="opt-metric">
                    <span className="opt-metric-label">XI Haul After</span>
                    <span className="opt-metric-value" style={{ color: '#00ff87' }}>
                        {(haulAfter * 100).toFixed(1)}%
                    </span>
                </div>
                {formationSelected && (
                    <div className="opt-metric" style={{ marginLeft: 'auto' }}>
                        <span className="opt-metric-label">Formation</span>
                        <span className="opt-metric-value" style={{ color: '#c084fc' }}>{formationSelected}</span>
                    </div>
                )}
            </div>

            {/* Transfers */}
            {transfers.length > 0 ? (
                <div className="opt-transfers">
                    <h4>Suggested Transfers</h4>
                    <div className="opt-transfer-list">
                        {transfers.map((t, i) => {
                            const balanceStr = t.costDiff > 0
                                ? `-£${(t.costDiff / 10).toFixed(1)}m`
                                : t.costDiff < 0
                                    ? `+£${(Math.abs(t.costDiff) / 10).toFixed(1)}m`
                                    : '£0.0m';
                            const balanceColor = t.costDiff <= 0 ? '#00ff87' : '#f59e0b';

                            return (
                                <div key={i} className="opt-transfer-card">
                                    <div className="opt-transfer-number">T{i + 1}</div>
                                    <div className="opt-transfer-out">
                                        <span className="opt-player-name out">{t.out.player.web_name}</span>
                                        <span className="opt-player-haul">{(t.out.totalForecast * 100).toFixed(1)}% haul</span>
                                    </div>
                                    <div className="opt-transfer-arrow">
                                        <span className="arrow-icon">⇒</span>
                                    </div>
                                    <div className="opt-transfer-in">
                                        <span className="opt-player-name in">{t.in.player.web_name}</span>
                                        <span className="opt-player-haul">{(t.in.totalForecast * 100).toFixed(1)}% haul</span>
                                    </div>
                                    <div className="opt-transfer-cost" style={{ color: balanceColor }}>
                                        {balanceStr}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="opt-transfers-note" style={{ fontSize: '0.8em', color: '#888', marginTop: '12px', fontStyle: 'italic', textAlign: 'center' }}>
                        Note: Total XI Haul Gain may differ from the sum of individual transfer differences due to optimal bench rotation and formation changes.
                    </div>
                </div>
            ) : (
                <div className="opt-no-transfers">
                    ✅ No transfers needed — current squad is already optimal for this allowance.
                </div>
            )}

            {/* Log / Explanation */}
            <details className="opt-log">
                <summary>How this optimization works ▾</summary>
                <div className="opt-log-body">
                    <h4>Step-by-Step Analysis</h4>
                    <ol className="opt-log-list">
                        {logLines.map((line, i) => (
                            <li key={i}>{line}</li>
                        ))}
                    </ol>
                    <div className="opt-algorithm-box">
                        <h5>🔬 Algorithm: Greedy Best-Swap Search</h5>
                        <p>
                            For each transfer slot, the optimizer evaluates <strong>every possible single player swap</strong> across the full squad,
                            simulating the resulting XI haul probability for each candidate swap. The swap that yields the highest
                            haul gain is selected. This repeats for each available transfer, with the updated squad as the new baseline.
                        </p>
                        <ul>
                            <li><strong>Haul probability</strong> = AI-predicted chance of scoring &gt;6 points next GW</li>
                            <li><strong>Budget</strong>: selling price + bank = total spend available per slot</li>
                            <li><strong>Constraints</strong>: same position, max 3 players per club, within budget</li>
                            <li><strong>Formation</strong>: after transfers, all valid FPL formations (e.g. 4-4-2, 3-5-2…) are tested and the one with highest XI haul is selected</li>
                        </ul>
                    </div>
                </div>
            </details>

            {/* T100 Ownership Warnings */}
            {warnings && warnings.length > 0 && (
                <div className="opt-warnings">
                    <h4 style={{ color: '#f59e0b', marginBottom: '8px' }}>⚠️ T100 Ownership Warnings</h4>
                    {warnings.map((w, i) => (
                        <div key={i} className="opt-warning-item" style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            marginBottom: '6px',
                            fontSize: '0.85em',
                            color: '#fbbf24'
                        }}>
                            {w}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
