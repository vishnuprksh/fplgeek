import { useState } from 'react';
import type { Pick, Team, UnifiedPlayer } from '../types/fpl';
import './PitchView.css';

interface PitchViewProps {
    picks: Pick[];
    elements: UnifiedPlayer[];
    teams: Team[];
    onPlayerClick: (player: UnifiedPlayer) => void;
    predictions: Record<number, { totalForecast: number }>;
    // New Props for Inline Optimization
    isOptimizing?: boolean;
    selectedToSell?: Set<number>;
    onToggleSell?: (id: number) => void;
}

export function PitchView({
    picks,
    elements,
    teams,
    onPlayerClick,
    predictions,
    isOptimizing = false,
    selectedToSell = new Set(),
    onToggleSell
}: PitchViewProps) {
    // Helper to find player details
    const getPlayer = (id: number) => elements.find(e => e.id === id);
    const getTeam = (id: number) => teams.find(t => t.id === id);

    // Group picks by position ... (rest is same)
    const starters = picks.filter(p => p.position <= 11);
    const bench = picks.filter(p => p.position > 11);

    const goalkeepers = starters.filter(p => getPlayer(p.element)?.element_type === 1);
    const defenders = starters.filter(p => getPlayer(p.element)?.element_type === 2);
    const midfielders = starters.filter(p => getPlayer(p.element)?.element_type === 3);
    const forwards = starters.filter(p => getPlayer(p.element)?.element_type === 4);

    const getImageUrl = (code: number) => `https://resources.premierleague.com/premierleague/photos/players/110x140/p${code}.png`;
    const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});

    const handleImageError = (id: number) => {
        setImageErrors(prev => ({ ...prev, [id]: true }));
    };

    const renderPlayer = (pick: Pick) => {
        const player = getPlayer(pick.element);
        if (!player) return null;
        const team = getTeam(player.team);
        const prediction = predictions ? predictions[player.id] : null;
        const isSold = selectedToSell.has(player.id);

        return (
            <div
                key={pick.element}
                className="pitch-player"
                onClick={() => {
                    if (isOptimizing) {
                        onToggleSell?.(player.id);
                    } else {
                        onPlayerClick?.(player);
                    }
                }}
                role="button"
                tabIndex={0}
                style={{
                    opacity: isSold ? 0.6 : 1,
                    transform: isSold ? 'scale(0.95)' : 'none',
                    border: isSold ? '2px solid #ef4444' : 'none',
                    borderRadius: '8px'
                }}
            >
                <div className={`player-shirt type-${player.element_type}`}>
                    {/* Image or Placeholder using code */}
                    {!imageErrors[player.id] ? (
                        <img
                            src={getImageUrl(player.code)}
                            alt={player.web_name}
                            className="player-image"
                            onError={() => handleImageError(player.id)}
                            style={{ filter: isSold ? 'grayscale(100%)' : 'none' }}
                        />
                    ) : (
                        <div className="shirt-body"></div>
                    )}
                </div>

                {isSold && (
                    <div style={{
                        position: 'absolute',
                        top: '-8px',
                        left: '-8px',
                        width: '24px',
                        height: '24px',
                        background: '#ef4444',
                        color: 'white',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.9em',
                        fontWeight: 'bold',
                        zIndex: 20,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                        border: '2px solid #1a0524'
                    }}>
                        ✕
                    </div>
                )}

                {prediction && !isSold && (
                    <div className="ai-badge" style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-10px',
                        background: 'rgba(55, 0, 60, 0.9)',
                        backdropFilter: 'blur(4px)',
                        color: '#00ff87',
                        fontSize: '0.7em',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        border: '1px solid #00ff87',
                        fontWeight: 'bold',
                        zIndex: 10,
                        boxShadow: '0 0 8px rgba(0, 255, 135, 0.3)',
                        minWidth: '35px',
                        textAlign: 'center'
                    }}>
                        {(prediction.totalForecast / 5).toFixed(1)}
                    </div>
                )}
                <div className="player-info">
                    <div className="player-name">{player.web_name}</div>
                    <div className="player-meta">
                        <span className="player-team">{team?.short_name}</span>
                        <span className="player-price">£{((pick.selling_price ?? player.now_cost) / 10).toFixed(1)}</span>
                    </div>
                    {/* If we have prediction, show it prominently, else show event points */}
                    <div className="player-points" style={{ fontSize: '0.8em' }}>
                        {player.event_points} (GW)
                    </div>
                </div>
                {pick.is_captain && <div className="captain-badge">C</div>}
                {pick.is_vice_captain && <div className="vice-captain-badge">V</div>}
            </div>
        );
    };

    return (
        <div className="pitch-container">
            <div className="pitch">
                <div className="pitch-line row-gkp">
                    {goalkeepers.map(renderPlayer)}
                </div>
                <div className="pitch-line row-def">
                    {defenders.map(renderPlayer)}
                </div>
                <div className="pitch-line row-mid">
                    {midfielders.map(renderPlayer)}
                </div>
                <div className="pitch-line row-fwd">
                    {forwards.map(renderPlayer)}
                </div>
            </div>

            <div className="bench">
                <div className="bench-title">Bench</div>
                <div className="bench-players">
                    {bench.map(renderPlayer)}
                </div>
            </div>
        </div>
    );
}
