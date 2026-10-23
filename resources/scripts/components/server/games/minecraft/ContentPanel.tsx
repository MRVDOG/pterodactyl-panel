import React, { useState } from 'react';
import classNames from 'classnames';
import { format, formatDistanceToNow } from 'date-fns';
import { bytesToString } from '@/lib/formatters';
import { MinecraftJar, MinecraftOverview } from '@/api/server/minecraft';
import GamePanel, { PanelMessage } from '@/components/server/games/GamePanel';

type Tab = 'plugins' | 'mods' | 'worlds';

const JarList = ({ jars }: { jars: MinecraftJar[] }) => (
    <ul>
        {jars.map((jar) => (
            <li
                key={jar.file}
                title={jar.file}
                className={'flex justify-between gap-3 py-1 border-b border-gray-700 last:border-0'}
            >
                <span className={classNames('truncate', jar.enabled ? 'text-gray-100' : 'text-gray-500 line-through')}>
                    {jar.name}
                </span>
                <span className={'text-gray-400 flex-shrink-0 font-mono text-xs self-center'}>
                    {jar.enabled ? jar.version ?? '' : 'disabled'}
                </span>
            </li>
        ))}
    </ul>
);

export default ({ overview, canRead, error }: { overview?: MinecraftOverview; canRead: boolean; error?: boolean }) => {
    const hasMods = (overview?.mods.length ?? 0) > 0;
    const hasPlugins = (overview?.plugins.length ?? 0) > 0 || !hasMods;
    const [selected, setSelected] = useState<Tab>('plugins');
    const tab: Tab =
        selected === 'mods' && !hasMods ? 'plugins' : selected === 'plugins' && !hasPlugins ? 'mods' : selected;

    const tabs: [Tab, string][] = [
        ...(hasPlugins ? [['plugins', `Plugins (${overview?.plugins.length ?? 0})`] as [Tab, string]] : []),
        ...(hasMods ? [['mods', `Mods (${overview!.mods.length})`] as [Tab, string]] : []),
        ['worlds', 'Worlds'],
    ];

    const action = canRead && overview && (
        <div className={'flex gap-1'}>
            {tabs.map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => setSelected(key)}
                    className={classNames(
                        'px-2 py-0.5 rounded text-xs transition-colors',
                        tab === key ? 'bg-gray-700 text-gray-50' : 'text-gray-400 hover:text-gray-100'
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    );

    let body: React.ReactNode;
    if (!canRead) {
        body = <PanelMessage>Requires permission to read the server&apos;s files.</PanelMessage>;
    } else if (error) {
        body = <PanelMessage>Couldn&apos;t read the server&apos;s files.</PanelMessage>;
    } else if (!overview) {
        body = <PanelMessage>Loading…</PanelMessage>;
    } else if (tab === 'worlds') {
        body =
            overview.worlds.length === 0 ? (
                <PanelMessage>No world has been generated yet.</PanelMessage>
            ) : (
                overview.worlds.map((world) => (
                    <div key={world.name}>
                        <div className={'flex justify-between items-baseline mb-1'}>
                            <span className={'text-gray-50 font-medium'}>{world.name}</span>
                            <span className={'text-gray-300'}>{bytesToString(world.size)}</span>
                        </div>
                        {world.modified && (
                            <p
                                className={'text-xs text-gray-400 mb-2'}
                                title={format(new Date(world.modified), 'PPpp')}
                            >
                                Last saved {formatDistanceToNow(new Date(world.modified), { addSuffix: true })}
                            </p>
                        )}
                        {world.dimensions.map((dimension) => (
                            <div key={dimension.id} className={'mb-2'}>
                                <div className={'flex justify-between text-xs mb-0.5'}>
                                    <span className={'text-gray-200'} title={dimension.id}>
                                        {dimension.name}
                                    </span>
                                    <span className={'text-gray-400'}>
                                        {bytesToString(dimension.size)} · {dimension.regions} regions
                                    </span>
                                </div>
                                <div className={'h-1.5 rounded-full bg-gray-700 overflow-hidden'}>
                                    <div
                                        className={'h-full bg-cyan-400'}
                                        style={{ width: `${world.size ? (dimension.size / world.size) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                        <p className={'text-xs uppercase tracking-wide text-gray-400 mt-3 mb-1'}>
                            Datapacks ({world.datapacks.filter((pack) => !pack.builtin).length})
                        </p>
                        {world.datapacks.length === 0 ? (
                            <p className={'text-gray-400'}>None installed.</p>
                        ) : (
                            <ul>
                                {world.datapacks.map((pack) => (
                                    <li
                                        key={pack.file}
                                        title={pack.file}
                                        className={
                                            'flex justify-between gap-3 py-1 border-b border-gray-700 last:border-0'
                                        }
                                    >
                                        <span
                                            className={classNames(
                                                'truncate',
                                                pack.builtin ? 'text-gray-500' : 'text-gray-100'
                                            )}
                                        >
                                            {pack.name}
                                        </span>
                                        <span className={'text-gray-400 flex-shrink-0 text-xs self-center'}>
                                            {pack.builtin
                                                ? 'built-in'
                                                : pack.size !== null
                                                ? bytesToString(pack.size)
                                                : 'folder'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))
            );
    } else {
        const jars = tab === 'mods' ? overview.mods : overview.plugins;
        body = jars.length === 0 ? <PanelMessage>No {tab} installed.</PanelMessage> : <JarList jars={jars} />;
    }

    return (
        <GamePanel title={tab === 'worlds' ? 'Worlds' : tab === 'mods' ? 'Mods' : 'Plugins'} action={action}>
            {body}
        </GamePanel>
    );
};
