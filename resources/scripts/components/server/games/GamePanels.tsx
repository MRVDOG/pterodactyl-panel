import React from 'react';
import games from '@/components/server/games';
import Spinner from '@/components/elements/Spinner';

/**
 * Renders the panels for the first game whose feature the server's egg has enabled.
 */
export default ({ enabled }: { enabled: string[] }) => {
    const features = enabled.map((feature) => feature.toLowerCase());
    const key = Object.keys(games).find((game) => features.includes(game.toLowerCase()));

    if (!key) {
        return null;
    }

    const Panels = games[key];

    return (
        <Spinner.Suspense>
            <Panels />
        </Spinner.Suspense>
    );
};
