<?php

namespace Pterodactyl\Services\Games\Minecraft;

use Pterodactyl\Models\Server;
use Pterodactyl\Exceptions\DisplayException;

/**
 * Queries a Minecraft server using the Server List Ping protocol, the same request the
 * multiplayer screen makes. Works for any Java edition server without plugins.
 *
 * @see https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping
 */
class MinecraftPingService
{
    private const TIMEOUT_SECONDS = 3;

    // Status responses are a few KiB (most of it the favicon); anything larger is not a game server.
    private const MAX_RESPONSE_BYTES = 1024 * 1024;

    /**
     * @throws DisplayException
     */
    public function handle(Server $server): array
    {
        $allocation = $server->allocation;
        $host = $this->resolveHost($allocation->ip);

        $started = microtime(true);
        $socket = @fsockopen($host, $allocation->port, $errno, $error, self::TIMEOUT_SECONDS);
        if ($socket === false) {
            throw new DisplayException('Unable to connect to the server to query its status.');
        }

        try {
            stream_set_timeout($socket, self::TIMEOUT_SECONDS);

            // Handshake: protocol version -1 (status probe), address, port, next state 1 (status).
            $handshake = "\x00" . $this->varInt(-1) . $this->string($host) . pack('n', $allocation->port) . $this->varInt(1);
            fwrite($socket, $this->varInt(strlen($handshake)) . $handshake);
            // Status request.
            fwrite($socket, "\x01\x00");

            $this->readVarInt($socket); // packet length
            if ($this->readVarInt($socket) !== 0x00) {
                throw new DisplayException('Received an unexpected response from the server.');
            }

            $length = $this->readVarInt($socket);
            if ($length > self::MAX_RESPONSE_BYTES) {
                throw new DisplayException('Received an oversized status response from the server.');
            }

            $json = $this->readBytes($socket, $length);
            $latency = (int) round((microtime(true) - $started) * 1000);
        } finally {
            fclose($socket);
        }

        $data = json_decode($json, true);
        if (!is_array($data)) {
            throw new DisplayException('Received an invalid status response from the server.');
        }

        return [
            'version' => $data['version']['name'] ?? null,
            'protocol' => $data['version']['protocol'] ?? null,
            'motd' => $data['description'] ?? '',
            'favicon' => $data['favicon'] ?? null,
            'players' => [
                'online' => $data['players']['online'] ?? 0,
                'max' => $data['players']['max'] ?? 0,
                'sample' => collect($data['players']['sample'] ?? [])
                    ->filter(fn ($player) => isset($player['name'], $player['id']))
                    ->map(fn ($player) => ['name' => $player['name'], 'uuid' => $player['id']])
                    ->values()
                    ->all(),
            ],
            'latency' => $latency,
        ];
    }

    /**
     * Allocations bound to all interfaces cannot be dialled directly, so query them over
     * loopback. This assumes the panel runs on the same host as the node's Wings.
     */
    private function resolveHost(string $ip): string
    {
        return in_array($ip, ['0.0.0.0', '::'], true) ? '127.0.0.1' : $ip;
    }

    private function varInt(int $value): string
    {
        $value &= 0xFFFFFFFF;
        $bytes = '';
        do {
            $byte = $value & 0x7F;
            $value >>= 7;
            $bytes .= chr($byte | ($value !== 0 ? 0x80 : 0));
        } while ($value !== 0);

        return $bytes;
    }

    private function string(string $value): string
    {
        return $this->varInt(strlen($value)) . $value;
    }

    /**
     * @param resource $socket
     *
     * @throws DisplayException
     */
    private function readVarInt($socket): int
    {
        $value = 0;
        for ($i = 0; $i < 5; ++$i) {
            $byte = ord($this->readBytes($socket, 1));
            $value |= ($byte & 0x7F) << (7 * $i);
            if (($byte & 0x80) === 0) {
                return $value;
            }
        }

        throw new DisplayException('Received a malformed response from the server.');
    }

    /**
     * @param resource $socket
     *
     * @throws DisplayException
     */
    private function readBytes($socket, int $length): string
    {
        $data = '';
        while (strlen($data) < $length) {
            $chunk = fread($socket, $length - strlen($data));
            if ($chunk === false || $chunk === '') {
                throw new DisplayException('The server stopped responding while being queried.');
            }
            $data .= $chunk;
        }

        return $data;
    }
}
