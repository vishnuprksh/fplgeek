import type { Pick, UnifiedPlayer } from '../types/fpl';

export const isValidFormation = (picks: Pick[], elements: UnifiedPlayer[]) => {
    const starters = picks.filter(p => p.position <= 11);
    const gkps = starters.filter(p => elements.find(e => e.id === p.element)?.element_type === 1).length;
    const defs = starters.filter(p => elements.find(e => e.id === p.element)?.element_type === 2).length;
    const fwds = starters.filter(p => elements.find(e => e.id === p.element)?.element_type === 4).length;

    if (gkps !== 1) return false;
    if (defs < 3) return false;
    if (fwds < 1) return false;
    return true;
};
