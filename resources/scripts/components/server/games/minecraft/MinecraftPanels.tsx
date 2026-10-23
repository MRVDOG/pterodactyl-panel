import React from 'react';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import { useMinecraftOverview, useMinecraftStatus } from '@/api/server/minecraft';
import PlayersPanel from '@/components/server/games/minecraft/PlayersPanel';
import ServerInfoPanel from '@/components/server/games/minecraft/ServerInfoPanel';
import PerformancePanel from '@/components/server/games/minecraft/PerformancePanel';
import ContentPanel from '@/components/server/games/minecraft/ContentPanel';

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [canReadFiles] = usePermissions('file.read-content');

    const { data: status } = useMinecraftStatus(uuid);
    const { data: overview, error: overviewError } = useMinecraftOverview(uuid, canReadFiles);

    return (
        <div className={'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4 mb-4'}>
            <PlayersPanel status={status} />
            <ServerInfoPanel status={status} overview={overview} />
            <PerformancePanel />
            <ContentPanel overview={overview} canRead={canReadFiles} error={!!overviewError} />
        </div>
    );
};
