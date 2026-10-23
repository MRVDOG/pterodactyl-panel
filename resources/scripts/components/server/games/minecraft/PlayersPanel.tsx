import React from 'react';
import { MinecraftStatus } from '@/api/server/minecraft';
import GamePanel, { PanelMessage } from '@/components/server/games/GamePanel';
import useConsolePlayers from '@/components/server/games/minecraft/useConsolePlayers';

// Players can opt out of being listed; servers then report them under this placeholder UUID.
const ANONYMOUS_UUID = '00000000-0000-0000-0000-000000000000';

export default ({ status }: { status?: MinecraftStatus }) => {
    const players = status?.online ? status.players : undefined;
    const listed = (players?.sample ?? []).filter((p) => p.uuid !== ANONYMOUS_UUID);

    // The ping only names players who allow server listings; fill in the rest from the console.
    const names = useConsolePlayers(!!players && players.online > listed.length, players?.online);
    const entries = names ? names.map((name) => ({ name, uuid: listed.find((p) => p.name === name)?.uuid })) : listed;
    const unlisted = players ? Math.max(0, players.online - entries.length) : 0;

    return (
        <GamePanel title={'Players'} action={players && `${players.online} / ${players.max}`}>
            {!status ? (
                <PanelMessage>Loading…</PanelMessage>
            ) : !players ? (
                <PanelMessage>Server is offline.</PanelMessage>
            ) : (
                <div className={'flex flex-col h-full'}>
                    <div className={'h-2 rounded-full bg-gray-700 overflow-hidden mb-3 flex-shrink-0'}>
                        <div
                            className={'h-full bg-cyan-400 transition-all duration-500'}
                            style={{
                                width: `${players.max ? Math.min(100, (players.online / players.max) * 100) : 0}%`,
                            }}
                        />
                    </div>
                    {players.online === 0 ? (
                        <PanelMessage>Nobody is online right now.</PanelMessage>
                    ) : (
                        <ul className={'space-y-1'}>
                            {entries.map((player) => (
                                <li key={player.name} className={'flex items-center gap-2'}>
                                    <img
                                        src={`https://mc-heads.net/avatar/${player.uuid ?? player.name}/20`}
                                        alt={''}
                                        className={'w-5 h-5 rounded-sm'}
                                        loading={'lazy'}
                                    />
                                    <span className={'text-gray-100 truncate'}>{player.name}</span>
                                </li>
                            ))}
                            {unlisted > 0 && (
                                <li className={'text-gray-400'}>
                                    {entries.length > 0 ? `+ ${unlisted} more` : `${unlisted} players online`}
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            )}
        </GamePanel>
    );
};
