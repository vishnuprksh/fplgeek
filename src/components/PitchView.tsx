import { useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { Pick, Team, UnifiedPlayer } from '../types/fpl';

interface PitchViewProps {
    picks: Pick[];
    elements: UnifiedPlayer[];
    teams: Team[];
    onPlayerClick: (player: UnifiedPlayer) => void;
    predictions: Record<number, { totalForecast: number }>;
    isOptimizing?: boolean;
    selectedToSell?: Set<number>;
    onToggleSell?: (id: number) => void;
    showSmartValue?: boolean;
    onSwap?: (id1: number, id2: number) => void;
}

const ItemTypes = {
    PLAYER: 'player'
};


// Extract to Component to use Hooks
function PitchPlayer({
    pick,
    player,
    team,
    prediction,
    isOptimizing,
    isSold,
    onToggleSell,
    onPlayerClick,
    showSmartValue,
    onSwap
}: {
    pick: Pick;
    player: UnifiedPlayer;
    team?: Team;
    prediction: any;
    isOptimizing: boolean;
    isSold: boolean;
    onToggleSell?: (id: number) => void;
    onPlayerClick?: (player: UnifiedPlayer) => void;
    showSmartValue?: boolean;
    onSwap?: (id1: number, id2: number) => void;
}) {

    const getImageUrl = (code: number) => `https://resources.premierleague.com/premierleague/photos/players/110x140/p${code}.png`;
    const [imgError, setImgError] = useState(false);

    // DND Hooks
    const [{ isDragging }, drag] = useDrag(() => ({
        type: ItemTypes.PLAYER,
        item: { id: player.id, position: pick.position, type: player.element_type },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
        canDrag: !isOptimizing // Disable drag during optimization
    }), [player.id, pick.position, isOptimizing]);

    const [{ isOver, canDrop }, drop] = useDrop(() => ({
        accept: ItemTypes.PLAYER,
        drop: (item: { id: number, position: number, type: number }) => {
            if (item.id !== player.id) {
                onSwap?.(item.id, player.id);
            }
        },
        canDrop: (item: { id: number, position: number, type: number }) => {
            // Logic to prevent invalid drops?
            // E.g. Can only swap GKP with GKP?
            // FPL Rules:
            // 1. GKP can only swap with GKP.
            // 2. Outfield can swap with any Outfield.
            // BUT, valid formation check is complex.
            // Simplification: Allow swap if Types Match OR (Both are Outfielders).
            // Actually, user wants "Substitute".
            // Drag Starter to Bench -> Swap.
            // Drag Bench to Starter -> Swap.
            // Drag Starter to Starter -> Reorder (Visual).

            if (isOptimizing) return false;

            // GKP Rule
            if (item.type === 1 && player.element_type !== 1) return false;
            if (item.type !== 1 && player.element_type === 1) return false;

            return true;
        },
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
            canDrop: !!monitor.canDrop(),
        }),
    }), [player.id, player.element_type, isOptimizing, onSwap]);

    if (!player) return null;

    // Combined Ref
    const attachRef = (el: HTMLDivElement) => {
        drag(el);
        drop(el);
    };

    return (
        <div
            ref={attachRef}
            className={`pitch-player ${isDragging ? 'dragging' : ''} ${isOver && canDrop ? 'dropping' : ''}`}
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
                opacity: isSold || isDragging ? 0.5 : 1,
                transform: isSold ? 'scale(0.95)' : 'none',
                border: isSold ? '2px solid #ef4444' : (isOver && canDrop ? '2px solid #00ff87' : 'none'),
                borderRadius: '8px',
                cursor: isOptimizing ? 'pointer' : 'grab'
            }}
        >
            <div className={`player-shirt type-${player.element_type}`}>
                {!imgError ? (
                    <img
                        src={getImageUrl(player.code)}
                        alt={player.web_name}
                        className="player-image"
                        onError={() => setImgError(true)}
                        style={{ filter: isSold ? 'grayscale(100%)' : 'none' }}
                    />
                ) : (
                    <div className="shirt-body"></div>
                )}
            </div>

            {isSold && (
                <div style={{
                    position: 'absolute', top: '-8px', left: '-8px', width: '24px', height: '24px',
                    background: '#ef4444', color: 'white', borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '0.9em', fontWeight: 'bold',
                    zIndex: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.5)', border: '2px solid #1a0524'
                }}>✕</div>
            )}

            {prediction && !isSold && (
                <div className="ai-badge" style={{
                    position: 'absolute', top: '-8px', right: '-10px', background: 'rgba(55, 0, 60, 0.9)',
                    backdropFilter: 'blur(4px)', color: '#00ff87', fontSize: '0.7em', padding: '2px 6px',
                    borderRadius: '12px', border: '1px solid #00ff87', fontWeight: 'bold', zIndex: 10,
                    boxShadow: '0 0 8px rgba(0, 255, 135, 0.3)', minWidth: '35px', textAlign: 'center'
                }}>
                    {(prediction.totalForecast / 5).toFixed(1)}
                </div>
            )}

            {!isSold && showSmartValue && player.smart_value !== undefined && (
                <div style={{
                    position: 'absolute', top: '18px', right: '-10px',
                    background: player.smart_value >= 70 ? '#4caf50' : player.smart_value >= 50 ? '#8bc34a' : player.smart_value >= 30 ? '#ffc107' : '#f44336',
                    color: '#fff', fontSize: '0.65em', padding: '1px 4px', borderRadius: '8px',
                    fontWeight: 'bold', zIndex: 9, minWidth: '25px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
                }}>
                    {player.smart_value.toFixed(0)}
                </div>
            )}

            <div className="player-info">
                <div className="player-name">{player.web_name}</div>
                <div className="player-meta">
                    <span className="player-team">{team?.short_name}</span>
                    <span className="player-price">£{((pick.selling_price ?? player.now_cost) / 10).toFixed(1)}</span>
                </div>
                <div className="player-points" style={{ fontSize: '0.8em' }}>
                    {player.event_points} (GW)
                </div>
            </div>
            {pick.is_captain && <div className="captain-badge">C</div>}
            {pick.is_vice_captain && <div className="vice-captain-badge">V</div>}
        </div>
    );
}

export function PitchView({
    picks,
    elements,
    teams,
    onPlayerClick,
    predictions,
    isOptimizing = false,
    selectedToSell = new Set(),
    onToggleSell,
    showSmartValue = true,
    onSwap
}: PitchViewProps) {
    // Helper to find player details
    const getPlayer = (id: number) => elements.find(e => e.id === id);
    const getTeam = (id: number) => teams.find(t => t.id === id);

    // Group picks by position ...
    // Note: picks are sorted 1-15 usually.
    // 1 (GK), 2-5 (Def), 6-10 (Mid), 11 (Fwd) ? No, FPL order depends on formation.
    // We assume input `picks` has correct `position` field.

    // Sort picks by position for rendering logic?
    // Actually, we filter by position.

    const starters = picks.filter(p => p.position <= 11);
    const bench = picks.filter(p => p.position > 11);

    const goalkeepers = starters.filter(p => getPlayer(p.element)?.element_type === 1);
    const defenders = starters.filter(p => getPlayer(p.element)?.element_type === 2);
    const midfielders = starters.filter(p => getPlayer(p.element)?.element_type === 3);
    const forwards = starters.filter(p => getPlayer(p.element)?.element_type === 4);

    const renderPitchPlayer = (pick: Pick) => {
        const player = getPlayer(pick.element);
        if (!player) return null;

        return (
            <PitchPlayer
                key={pick.element}
                pick={pick}
                player={player}
                team={getTeam(player.team)}
                prediction={predictions ? predictions[player.id] : null}
                isOptimizing={isOptimizing}
                isSold={selectedToSell.has(player.id)}
                onToggleSell={onToggleSell}
                onPlayerClick={onPlayerClick}
                showSmartValue={showSmartValue}
                onSwap={onSwap}
            />
        );
    };

    return (
        <div className="pitch-container">
            <div className="pitch">
                <div className="pitch-line row-gkp">
                    {goalkeepers.map(renderPitchPlayer)}
                </div>
                <div className="pitch-line row-def">
                    {defenders.map(renderPitchPlayer)}
                </div>
                <div className="pitch-line row-mid">
                    {midfielders.map(renderPitchPlayer)}
                </div>
                <div className="pitch-line row-fwd">
                    {forwards.map(renderPitchPlayer)}
                </div>
            </div>

            <div className="bench">
                <div className="bench-title">Bench</div>
                <div className="bench-players">
                    {bench.map(renderPitchPlayer)}
                </div>
            </div>
        </div>
    );
}
