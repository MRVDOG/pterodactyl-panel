import { useCallback, useEffect, useRef, useState } from 'react';
import { ServerContext } from '@/state/server';
import { SocketEvent } from '@/components/server/events';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import { usePermissions } from '@/plugins/usePermissions';
import { registerConsoleFilter, stripFormatting } from '@/lib/consoleFilter';

const REFRESH_INTERVAL = 60_000;
// Don't re-run list more often than this, however often the player count changes.
const MIN_INTERVAL = 15_000;
// How long after sending the command its reply is captured and hidden from the console.
const CAPTURE_WINDOW = 5_000;

const LIST_LINE = /There are (\d+) of a max of (\d+) players online:\s*(.*)$/;

/**
 * Gets the full list of online players from the console's list command. The server list
 * ping leaves out players who opted out of server listings, so this is only used while the
 * ping reports more players online than it names.
 */
export default (hiddenPlayers: boolean, online: number | undefined) => {
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { connected, instance } = ServerContext.useStoreState((state) => state.socket);
    const [canSendCommands] = usePermissions('control.console');

    const [names, setNames] = useState<string[] | null>(null);
    const capturingUntil = useRef(0);
    const lastSent = useRef(0);

    const capturing = () => Date.now() < capturingUntil.current;
    const active = hiddenPlayers && canSendCommands && connected && status === 'running';

    const send = useCallback(() => {
        if (!instance || !connected || Date.now() - lastSent.current < MIN_INTERVAL) return;

        lastSent.current = Date.now();
        capturingUntil.current = Date.now() + CAPTURE_WINDOW;
        instance.send('send command', 'list');
    }, [instance, connected]);

    // Re-check whenever the number of players online changes, and once a minute otherwise.
    useEffect(() => {
        if (!active) return;

        const initial = setTimeout(send, 2_000);
        const interval = setInterval(() => document.visibilityState === 'visible' && send(), REFRESH_INTERVAL);

        return () => {
            clearTimeout(initial);
            clearInterval(interval);
        };
    }, [active, online, send]);

    useEffect(() => {
        if (status !== 'running') setNames(null);
    }, [status]);

    useEffect(() => registerConsoleFilter((raw) => capturing() && LIST_LINE.test(stripFormatting(raw))), []);

    useWebsocketEvent(SocketEvent.CONSOLE_OUTPUT, (raw) => {
        // Only read the reply to our own command; older output replayed from the log is stale.
        if (!capturing()) return;

        const match = stripFormatting(raw).match(LIST_LINE);
        if (match) {
            setNames(
                match[3]
                    .split(',')
                    .map((name) => name.trim())
                    .filter(Boolean)
            );
        }
    });

    return active ? names : null;
};
