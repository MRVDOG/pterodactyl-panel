import React from 'react';
import classNames from 'classnames';
import { ExternalLinkIcon, RefreshIcon } from '@heroicons/react/outline';
import { ServerContext } from '@/state/server';
import { bytesToString } from '@/lib/formatters';
import { MinecraftMetrics, useMinecraftMetrics } from '@/api/server/minecraft';
import GamePanel, { PanelMessage, Row } from '@/components/server/games/GamePanel';
import useConsolePerformance from '@/components/server/games/minecraft/useConsolePerformance';
import Tooltip from '@/components/elements/tooltip/Tooltip';

const TICKSCOPE_URL = 'https://modrinth.com/plugin/tickscope';

const tpsColor = (tps: number) => (tps >= 19 ? 'text-green-400' : tps >= 15 ? 'text-yellow-400' : 'text-red-400');
const msptColor = (mspt: number) => (mspt <= 40 ? 'text-green-400' : mspt <= 50 ? 'text-yellow-400' : 'text-red-400');

const Big = ({ label, value, className }: { label: string; value?: string; className?: string | false }) => (
    <div>
        <p className={'text-xs uppercase tracking-wide text-gray-400'}>{label}</p>
        <p className={classNames('text-3xl font-header', className)}>{value ?? '–'}</p>
    </div>
);

/**
 * Shows TPS and tick times, plus world load and heap when TickScope provides them.
 */
const Readings = ({ data }: { data: Partial<MinecraftMetrics> }) => {
    const { tps, mspt, heap } = data;
    const worlds = data.worlds ?? [];

    return (
        <>
            <div className={'grid grid-cols-2 gap-2 mb-2'}>
                <Big
                    label={'TPS (1m)'}
                    value={tps?.['1m']?.toFixed(1)}
                    className={tps?.['1m'] !== undefined && tpsColor(tps['1m'])}
                />
                <Big
                    label={'MSPT (avg)'}
                    value={mspt?.avg?.toFixed(1)}
                    className={mspt?.avg !== undefined && msptColor(mspt.avg)}
                />
            </div>
            {tps?.['5m'] !== undefined && (
                <Row label={'TPS 5m / 15m'}>
                    {tps['5m'].toFixed(1)} / {tps['15m']?.toFixed(1) ?? '–'}
                </Row>
            )}
            {mspt?.p95 !== undefined ? (
                <Row label={'Tick p95 / p99 / max'}>
                    {mspt.p95.toFixed(1)} / {mspt.p99?.toFixed(1) ?? '–'} / {mspt.max?.toFixed(1) ?? '–'} ms
                </Row>
            ) : (
                mspt?.min !== undefined && (
                    <Row label={'Tick min / max (1m)'}>
                        {mspt.min.toFixed(1)} / {mspt.max?.toFixed(1) ?? '–'} ms
                    </Row>
                )
            )}
            {worlds.length > 0 && (
                <Row label={'Chunks / entities'}>
                    {worlds.reduce((sum, world) => sum + (world.chunks ?? 0), 0).toLocaleString()} /{' '}
                    {worlds.reduce((sum, world) => sum + (world.entities ?? 0), 0).toLocaleString()}
                </Row>
            )}
            {heap && heap.max > 0 && (
                <Row label={'JVM heap'}>
                    {bytesToString(heap.used)} / {bytesToString(heap.max)}
                </Row>
            )}
        </>
    );
};

// Loaders whose extensions are mods; everything else (Paper, Folia, Spigot…) runs plugins.
const MOD_PLATFORMS = ['fabric', 'quilt', 'forge', 'neoforge'];
const PLATFORM_NAMES: Record<string, string> = { neoforge: 'NeoForge' };

/**
 * Names the plugin or mod the numbers come from.
 */
const SourceNote = ({ source }: { source: NonNullable<MinecraftMetrics['source']> }) => {
    const platform = source.platform?.toLowerCase();
    const kind = platform && MOD_PLATFORMS.includes(platform) ? 'mod' : 'plugin';
    const platformName = platform && (PLATFORM_NAMES[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1));

    return (
        <p className={'truncate'}>
            Measured by{' '}
            <a
                href={TICKSCOPE_URL}
                target={'_blank'}
                rel={'noopener noreferrer'}
                className={'text-gray-400 hover:text-gray-50 underline'}
            >
                {source.name}
                {source.version && ` ${source.version}`}
            </a>{' '}
            · {platformName ? `${platformName} ${kind}` : kind}
        </p>
    );
};

/**
 * Explains where the numbers come from when falling back to the console.
 */
const ConsoleSourceNote = ({ metrics }: { metrics: MinecraftMetrics }) => (
    <p>
        Measured via console.{' '}
        {metrics.state === 'not_installed' ? (
            <a
                href={TICKSCOPE_URL}
                target={'_blank'}
                rel={'noopener noreferrer'}
                className={'inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-50 underline'}
            >
                Get TickScope <ExternalLinkIcon className={'w-3 h-3'} />
            </a>
        ) : metrics.state === 'no_allocation' ? (
            'TickScope needs an allocation on 127.0.0.1 to be used.'
        ) : (
            `TickScope isn't answering on 127.0.0.1:${(metrics.ports ?? []).join(', ')}.`
        )}
    </p>
);

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { data: metrics, error } = useMinecraftMetrics(uuid);

    const usingTickScope = metrics?.state === 'available';
    const fallback = useConsolePerformance(!!metrics && !usingTickScope);

    let body: React.ReactNode;
    let footer: React.ReactNode;
    if (error) {
        body = <PanelMessage>Couldn&apos;t load performance metrics.</PanelMessage>;
    } else if (!metrics) {
        body = <PanelMessage>Loading…</PanelMessage>;
    } else if (status !== 'running') {
        body = <PanelMessage>Available while the server is running.</PanelMessage>;
    } else if (usingTickScope) {
        body = <Readings data={metrics} />;
        footer = <SourceNote source={metrics.source ?? { name: 'TickScope', version: null, platform: null }} />;
    } else {
        const hasReadings = !!(fallback.readings.tps || fallback.readings.mspt);

        body = !fallback.canSendCommands ? (
            <PanelMessage>Requires permission to send console commands.</PanelMessage>
        ) : fallback.unsupported ? (
            <PanelMessage>
                This server doesn&apos;t support the tps/mspt commands (Paper or Spigot required).
            </PanelMessage>
        ) : !hasReadings ? (
            <PanelMessage>Measuring…</PanelMessage>
        ) : (
            <Readings data={fallback.readings} />
        );
        footer = <ConsoleSourceNote metrics={metrics} />;
    }

    const action =
        !usingTickScope && fallback.active ? (
            <Tooltip content={'Refresh now'} placement={'top'}>
                <button onClick={fallback.refresh} className={'text-gray-400 hover:text-gray-50 transition-colors'}>
                    <RefreshIcon className={'w-4 h-4'} />
                </button>
            </Tooltip>
        ) : undefined;

    return (
        <GamePanel title={'Performance'} action={action} footer={footer}>
            {body}
        </GamePanel>
    );
};
