import useSWR from 'swr';
import http from '@/api/http';

export type ChatComponent =
    | string
    | {
          text?: string;
          color?: string;
          bold?: boolean;
          italic?: boolean;
          underlined?: boolean;
          strikethrough?: boolean;
          extra?: ChatComponent[];
      };

export interface MinecraftPlayer {
    name: string;
    uuid: string;
}

export interface MinecraftStatus {
    online: boolean;
    error: string | null;
    version?: string | null;
    protocol?: number | null;
    motd?: ChatComponent;
    favicon?: string | null;
    players?: { online: number; max: number; sample: MinecraftPlayer[] };
    latency?: number;
}

export interface MinecraftJar {
    name: string;
    version: string | null;
    file: string;
    size: number;
    enabled: boolean;
}

export interface MinecraftDimension {
    id: string;
    name: string;
    regions: number;
    size: number;
}

export interface MinecraftDatapack {
    name: string;
    file: string;
    type: 'zip' | 'folder';
    size: number | null;
    builtin: boolean;
}

export interface MinecraftWorld {
    name: string;
    modified: string | null;
    size: number;
    dimensions: MinecraftDimension[];
    datapacks: MinecraftDatapack[];
}

export interface MinecraftOverview {
    properties: Record<string, string>;
    plugins: MinecraftJar[];
    mods: MinecraftJar[];
    worlds: MinecraftWorld[];
}

export const useMinecraftStatus = (uuid: string, enabled = true) =>
    useSWR<MinecraftStatus>(
        enabled ? [uuid, '/minecraft/status'] : null,
        async () => {
            const { data } = await http.get(`/api/client/servers/${uuid}/minecraft/status`);

            return data.attributes;
        },
        { refreshInterval: 15000, revalidateOnFocus: false }
    );

export const useMinecraftOverview = (uuid: string, enabled = true) =>
    useSWR<MinecraftOverview>(
        enabled ? [uuid, '/minecraft/overview'] : null,
        async () => {
            const { data } = await http.get(`/api/client/servers/${uuid}/minecraft/overview`);

            return data.attributes;
        },
        { refreshInterval: 60000, revalidateOnFocus: false }
    );

export type MinecraftMetricsState = 'not_installed' | 'no_allocation' | 'unreachable' | 'available';

export interface MinecraftMetrics {
    state: MinecraftMetricsState;
    port?: number;
    ports?: number[];
    source?: { name: string; version: string | null; platform: string | null } | null;
    tps?: Partial<Record<'1m' | '5m' | '15m', number>> | null;
    mspt?: Partial<Record<'avg' | 'min' | 'max' | 'p50' | 'p95' | 'p99', number>> | null;
    worlds?: { name: string; chunks?: number; entities?: number; tile_entities?: number; players?: number }[];
    uptime?: number | null;
    heap?: { used: number; max: number } | null;
}

export const useMinecraftMetrics = (uuid: string, enabled = true) =>
    useSWR<MinecraftMetrics>(
        enabled ? [uuid, '/minecraft/metrics'] : null,
        async () => {
            const { data } = await http.get(`/api/client/servers/${uuid}/minecraft/metrics`);

            return data.attributes;
        },
        { refreshInterval: 10000, revalidateOnFocus: false }
    );
