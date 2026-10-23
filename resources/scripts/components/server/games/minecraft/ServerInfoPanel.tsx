import React from 'react';
import { MinecraftOverview, MinecraftStatus } from '@/api/server/minecraft';
import GamePanel, { Row } from '@/components/server/games/GamePanel';
import Motd from '@/components/server/games/minecraft/Motd';

const yesNo = (value?: string) => (value === undefined ? undefined : value === 'true' ? 'On' : 'Off');
const capitalise = (value?: string) => value && value.charAt(0).toUpperCase() + value.slice(1);

export default ({ status, overview }: { status?: MinecraftStatus; overview?: MinecraftOverview }) => {
    const properties = overview?.properties ?? {};

    const rows: [string, React.ReactNode][] = [
        ['Version', status?.online ? status.version : undefined],
        ['Game mode', capitalise(properties['hardcore'] === 'true' ? 'hardcore' : properties['gamemode'])],
        ['Difficulty', capitalise(properties['difficulty'])],
        ['Whitelist', yesNo(properties['white-list'])],
        ['Online mode', yesNo(properties['online-mode'])],
        ['PvP', yesNo(properties['pvp'])],
        [
            'View / sim distance',
            properties['view-distance'] &&
                `${properties['view-distance']} / ${properties['simulation-distance'] ?? '–'} chunks`,
        ],
        ['Ping', status?.online && status.latency !== undefined ? `${status.latency} ms` : undefined],
    ];

    return (
        <GamePanel title={'Server Info'}>
            <div className={'flex items-start gap-3 mb-2'}>
                {status?.online && status.favicon && (
                    <img
                        src={status.favicon}
                        alt={''}
                        className={'w-12 h-12 rounded flex-shrink-0'}
                        style={{ imageRendering: 'pixelated' }}
                    />
                )}
                <div className={'min-w-0'}>
                    {status?.online && status.motd !== undefined ? (
                        <p className={'text-xs line-clamp-2 bg-gray-800 rounded px-1'}>
                            <Motd motd={status.motd} />
                        </p>
                    ) : (
                        <p className={'text-xs text-gray-400'}>{status ? 'Offline' : 'Loading…'}</p>
                    )}
                </div>
            </div>
            {rows
                .filter(([, value]) => value !== undefined && value !== null && value !== '')
                .map(([label, value]) => (
                    <Row key={label} label={label}>
                        {value}
                    </Row>
                ))}
        </GamePanel>
    );
};
