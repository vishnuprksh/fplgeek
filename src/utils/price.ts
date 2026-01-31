import type { Pick, UnifiedPlayer } from '../types/fpl';

export const calculateSellingPrice = (purchasePrice: number, nowCost: number) => {
    if (nowCost <= purchasePrice) return nowCost;
    return purchasePrice + Math.floor((nowCost - purchasePrice) / 2);
};

export const enrichPicksWithPrices = (
    picks: Pick[],
    elements: UnifiedPlayer[],
    transfersHistory: any[]
): Pick[] => {
    return picks.map(p => {
        const player = elements.find(e => e.id === p.element);
        if (!player) return { ...p, selling_price: 0, purchase_price: 0 };

        // Find latest transfer-in
        const lastTransfer = transfersHistory
            .filter((t: any) => t.element_in === p.element)
            .sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];

        // If no transfer found, assume they were in initial squad (Start Price)
        // cost_change_start = Now - Start => Start = Now - cost_change_start
        const purchasePrice = lastTransfer ? lastTransfer.element_in_cost : (player.now_cost - player.cost_change_start);

        const sellingPrice = calculateSellingPrice(purchasePrice, player.now_cost);

        return {
            ...p,
            purchase_price: purchasePrice,
            selling_price: sellingPrice
        };
    });
};
