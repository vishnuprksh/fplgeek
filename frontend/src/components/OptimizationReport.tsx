import type { OptimizationResult, TransferDetail } from '../utils/solver';
import './OptimizationReport.css';

interface OptimizationReportProps {
    result: OptimizationResult;
    onRejectTransfer?: (t: TransferDetail) => void;
    onResetRejections?: () => void;
    rejectedCount?: number;
}

export function OptimizationReport({ result, onRejectTransfer, onResetRejections, rejectedCount = 0 }: OptimizationReportProps) {
    const { transfers, haulBefore, haulAfter, netGainPercent, formationSelected, logLines: _logLines, warnings } = result;

    const gainColor = netGainPercent > 0 ? '#00ff87' : netGainPercent < 0 ? '#ef4444' : '#888';

    return (
        <div className="opt-report">
            <div className="opt-report-header">
                <h3>📊 Optimization Report</h3>
                <div className="opt-header-actions">
                    {rejectedCount > 0 && onResetRejections && (
                        <button
                            className="opt-reset-rejections"
                            onClick={onResetRejections}
                            title="Restore original suggestions"
                        >
                            ↺ Reset rejected ({rejectedCount})
                        </button>
                    )}
                    <span className="opt-gain" style={{ color: gainColor }}>
                        {netGainPercent > 0 ? `+${netGainPercent}` : netGainPercent}% Haul Gain
                    </span>
                </div>
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
                                    {onRejectTransfer && (
                                        <button
                                            className="opt-transfer-reject"
                                            onClick={() => onRejectTransfer(t)}
                                            title={`Reject ${t.out.player.web_name} → ${t.in.player.web_name} and suggest the next best transfer`}
                                            aria-label={`Reject transfer ${t.out.player.web_name} to ${t.in.player.web_name}`}
                                        >
                                            ✕
                                        </button>
                                    )}
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
