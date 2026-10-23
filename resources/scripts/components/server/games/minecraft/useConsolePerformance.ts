import { useCallback, useEffect, useRef, useState } from 'react';
import { ServerContext } from '@/state/server';
import { SocketEvent } from '@/components/server/events';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import { usePermissions } from '@/plugins/usePermissions';
import { registerConsoleFilter, stripFormatting } from '@/lib/consoleFilter';
import { MinecraftMetrics } from '@/api/server/minecraft';

const REFRESH_INTERVAL = 60_000;
// How long after sending the commands their replies are captured and hidden from the console.
const CAPTURE_WINDOW = 5_000;

const TPS_LINE = /TPS from last 1m, 5m, 15m:\s*(.+)$/;
const MSPT_HEADER = /Server tick times \(avg\/min\/max\) from last 5s, 10s, 1m:/;
const MSPT_VALUES = /(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/g;
// Rejected commands are echoed as "<command><--[HERE]"; only react to our own.
const OUR_COMMAND_REJECTED = /(?:^|]:\s*)(?:tps|mspt)<--\[HERE]/;

type Readings = Pick<MinecraftMetrics, 'tps' | 'mspt'>;

/**
 * Measures TPS and tick times by running Paper's tps and mspt commands through the console
 * once a minute, hiding the replies from the console view. Used when TickScope isn't
 * available; the replies still end up in the server's log file.
 */
export default (enabled: boolean) => {
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { connected, instance } = ServerContext.useStoreState((state) => state.socket);
    const [canSendCommands] = usePermissions('control.console');

    const [readings, setReadings] = useState<Readings>({});
    const [unsupported, setUnsupported] = useState(false);
    const capturingUntil = useRef(0);
    const expectingMsptValues = useRef(false);

    const capturing = () => Date.now() < capturingUntil.current;
    const active = enabled && canSendCommands && connected && status === 'running' && !unsupported;

    const refresh = useCallback(() => {
        if (!instance || !connected) return;

        capturingUntil.current = Date.now() + CAPTURE_WINDOW;
        instance.send('send command', 'tps');
        instance.send('send command', 'mspt');
    }, [instance, connected]);

    useEffect(() => {
        if (!active) return;

        // Give the console a moment to replay its log history before sending anything.
        const initial = setTimeout(refresh, 2_000);
        const interval = setInterval(() => document.visibilityState === 'visible' && refresh(), REFRESH_INTERVAL);

        return () => {
            clearTimeout(initial);
            clearInterval(interval);
        };
    }, [active, refresh]);

    useEffect(() => {
        if (status !== 'running') setReadings({});
    }, [status]);

    useEffect(
        () =>
            registerConsoleFilter((raw) => {
                if (!capturing()) return false;
                const line = stripFormatting(raw);

                return (
                    TPS_LINE.test(line) ||
                    MSPT_HEADER.test(line) ||
                    line.includes('◴') ||
                    OUR_COMMAND_REJECTED.test(line)
                );
            }),
        []
    );

    useWebsocketEvent(SocketEvent.CONSOLE_OUTPUT, (raw) => {
        // Only read replies to our own commands; older output replayed from the log is stale.
        if (!capturing()) return;
        const line = stripFormatting(raw);

        const tps = line.match(TPS_LINE);
        if (tps) {
            const [m1, m5, m15] = tps[1].split(',').map((v) => parseFloat(v.replace(/[^\d.]/g, '')));
            if (![m1, m5, m15].some(isNaN)) {
                setReadings((r) => ({ ...r, tps: { '1m': m1, '5m': m5, '15m': m15 } }));
            }
            return;
        }

        if (MSPT_HEADER.test(line)) {
            expectingMsptValues.current = true;
            return;
        }

        if (expectingMsptValues.current) {
            expectingMsptValues.current = false;
            const windows: number[][] = [];
            const pattern = new RegExp(MSPT_VALUES.source, 'g');
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(line)) !== null) {
                windows.push([parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])]);
            }
            // The last window is the past minute.
            const minute = windows[2];
            if (minute) {
                setReadings((r) => ({ ...r, mspt: { avg: minute[0], min: minute[1], max: minute[2] } }));
            }
            return;
        }

        if (OUR_COMMAND_REJECTED.test(line)) {
            setUnsupported(true);
        }
    });

    return { readings, unsupported, canSendCommands, active, refresh };
};
