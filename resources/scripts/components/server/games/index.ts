import { ComponentType, lazy } from 'react';

/**
 * Game-specific panels shown on the console page above the resource graphs. Each key is an
 * egg feature: give an egg that feature to show the panels for its servers. Components are
 * lazy so a game's code only loads for servers that use it.
 */
const games: Record<string, ComponentType> = {
    minecraft: lazy(() => import('@/components/server/games/minecraft/MinecraftPanels')),
};

export default games;
