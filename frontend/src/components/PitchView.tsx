import { useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { Pick, Team, UnifiedPlayer } from '../types/fpl';
import type { PredictionMetadata } from '../types/gameweek';
import './PitchView.css';

interface PitchViewProps {
    picks: Pick[];
    elements: UnifiedPlayer[];
    teams: Team[];
    onPlayerClick: (player: UnifiedPlayer) => void;
    predictions: Record<number, { totalForecast: number; prob_gt_6?: number; projections?: any[] }>;
    isOptimizing?: boolean;
    selectedToSell?: Set<number>;
    onToggleSell?: (id: number) => void;
    onSwap?: (id1: number, id2: number) => void;
    points?: Record<number, number>; // Historical points override
    statuses?: Record<number, string>; // Historical status override
    injuryChances?: Record<number, number>;
    t100Ownership?: Record<number, number>;
    haulingWeeks?: number; // Number of weeks to average haul over (1, 2, or 3)
    gameweekMetadata?: PredictionMetadata | null; // Metadata for gameweek context
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
    onSwap,
    points,
    status,
    injuryChance,
    t100Ownership,
    haulingWeeks = 3,
    gameweekMetadata
}: {
    pick: Pick;
    player: UnifiedPlayer;
    team?: Team;
    prediction: any;
    isOptimizing: boolean;
    isSold: boolean;
    onToggleSell?: (id: number) => void;
    onPlayerClick?: (player: UnifiedPlayer) => void;
    onSwap?: (id1: number, id2: number) => void;
    points?: number;
    status?: string;
    injuryChance?: number;
    t100Ownership?: number;
    haulingWeeks?: number;
    gameweekMetadata?: PredictionMetadata | null;
}) {

    const getImageUrl = (code: number) => `https://resources.premierleague.com/premierleague/photos/players/110x140/p${code}.png`;
    const [imgError, setImgError] = useState(false);

    // Calculate haul based on selected weeks
    const calculateDisplayHaul = (pred: any, weeks: number): number => {
        if (!pred) return 0;
        
        // If we have projections and metadata, use gameweek-aware calculation
        if (pred.projections && pred.projections.length > 0 && gameweekMetadata) {
            const weeksToConsider = Math.min(weeks, pred.projections.length);
            let sum = 0;
            for (let i = 0; i < weeksToConsider; i++) {
                sum += pred.projections[i].prob_gt_6 || 0;
            }
            return weeksToConsider > 0 ? sum / weeksToConsider : 0;
        }
        
        // Fallback: single prob_gt_6 value
        return pred.prob_gt_6 || 0;
    };

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

            {!isSold && ((status && status !== 'a') || (injuryChance === 0)) && (
                <div title="Injured/Unavailable" style={{
                    position: 'absolute', top: '-8px', left: '-8px', width: '24px', height: '24px',
                    alignItems: 'center', justifyContent: 'center', fontSize: '0.9em', fontWeight: 'bold',
                    zIndex: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.5)', border: '2px solid #1a0524',
                    backgroundColor: injuryChance === 0 ? '#ef4444' : '#eab308',
                    color: injuryChance === 0 ? 'white' : 'black'
                }}>
                    {injuryChance === 0 ? '🚑' : '⚠️'}
                </div>
            )}

            {prediction && prediction.prob_gt_6 !== undefined && !isSold && (
                <div className="ai-badge" style={{
                    position: 'absolute', top: '-8px', right: '-10px', background: 'rgba(55, 0, 60, 0.9)',
                    backdropFilter: 'blur(4px)', color: '#00ff87', fontSize: '0.7em', padding: '2px 6px',
                    borderRadius: '12px', border: '1px solid #00ff87', fontWeight: 'bold', zIndex: 10,
                    boxShadow: '0 0 8px rgba(0, 255, 135, 0.3)', minWidth: '35px', textAlign: 'center'
                }}>
                    {(calculateDisplayHaul(prediction, haulingWeeks) * 100).toFixed(0)}%
                </div>
            )}


            <div className="player-info">
                <div className="player-name">{player.web_name}</div>
                <div className="player-meta">
                    <span className="player-team">{team?.short_name}</span>
                    <span className="player-price">£{
                        // If selling_price exists and is < 20, it's already in decimal format (e.g., 5.5)
                        // Otherwise, divide by 10 (FPL API format, e.g., 55 -> 5.5)
                        pick.selling_price && pick.selling_price < 20
                            ? pick.selling_price.toFixed(1)
                            : ((pick.selling_price ?? player.now_cost) / 10).toFixed(1)
                    }</span>
                </div>
                <div className="player-ownership" style={{ fontSize: '0.65em', color: '#00d2ff', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '0px' }}>
                    {t100Ownership !== undefined && (
                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>T100: {t100Ownership.toFixed(0)}%</span>
                    )}
                    <span>Own: {parseFloat(player.selected_by_percent).toFixed(1)}%</span>
                </div>
                <div className="player-points" style={{ fontSize: '0.8em' }}>
                    {points !== undefined ? points : player.event_points} (GW)
                </div>
                <div className="player-form" style={{ fontSize: '0.75em', color: '#fbbf24', marginTop: '2px', fontWeight: 500 }}>
                    Form: {player.form}
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
    onSwap,
    points,
    statuses,
    injuryChances,
    t100Ownership,
    haulingWeeks = 3,
    gameweekMetadata = null
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

    // Sorting Helper
    const sortPicks = (p1: Pick, p2: Pick) => {
        const player1 = getPlayer(p1.element);
        const player2 = getPlayer(p2.element);

        if (!player1 || !player2) return 0;

        // 1. Predicted Haul Probability (Descending)
        const calculateSort = (pred: any): number => {
            if (!pred) return 0;
            if (pred.projections && pred.projections.length > 0) {
                const weeksToConsider = Math.min(haulingWeeks, pred.projections.length);
                let sum = 0;
                for (let i = 0; i < weeksToConsider; i++) {
                    sum += pred.projections[i].prob_gt_6 || 0;
                }
                return weeksToConsider > 0 ? sum / weeksToConsider : 0;
            }
            return pred.prob_gt_6 || 0;
        };
        const xp1 = predictions && predictions[player1.id] ? calculateSort(predictions[player1.id]) : 0;
        const xp2 = predictions && predictions[player2.id] ? calculateSort(predictions[player2.id]) : 0;

        if (xp1 !== xp2) {
            return xp2 - xp1;
        }

        // 2. Selected By Percent (Descending) - Secondary Sort
        const sel1 = parseFloat(player1.selected_by_percent) || 0;
        const sel2 = parseFloat(player2.selected_by_percent) || 0;

        return sel2 - sel1;
    };

    const starters = picks.filter(p => p.position <= 11);
    const bench = picks.filter(p => p.position > 11).sort(sortPicks);

    const goalkeepers = starters.filter(p => getPlayer(p.element)?.element_type === 1).sort(sortPicks);
    const defenders = starters.filter(p => getPlayer(p.element)?.element_type === 2).sort(sortPicks);
    const midfielders = starters.filter(p => getPlayer(p.element)?.element_type === 3).sort(sortPicks);
    const forwards = starters.filter(p => getPlayer(p.element)?.element_type === 4).sort(sortPicks);

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
                points={points ? points[player.id] : undefined}
                status={statuses ? statuses[player.id] : player.status}
                injuryChance={injuryChances ? injuryChances[player.id] : player.chance_of_playing_this_round ?? undefined}
                onSwap={onSwap}
                t100Ownership={t100Ownership ? t100Ownership[player.id] : undefined}
                haulingWeeks={haulingWeeks}
                gameweekMetadata={gameweekMetadata}
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
