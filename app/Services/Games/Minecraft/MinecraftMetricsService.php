<?php

namespace Pterodactyl\Services\Games\Minecraft;

use Pterodactyl\Models\Server;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;

/**
 * Reads performance metrics from the TickScope plugin, which serves Prometheus metrics over
 * HTTP. Unlike running tps/mspt through the console, this leaves nothing in the server log.
 *
 * TickScope is reached through one of the server's allocations bound to 127.0.0.1. Wings
 * publishes those on its Docker network interface rather than the host's loopback, so the
 * request goes to that address (pterodactyl.minecraft.metrics_host).
 *
 * @see https://modrinth.com/plugin/tickscope
 */
class MinecraftMetricsService
{
    public const NOT_INSTALLED = 'not_installed';
    public const NO_ALLOCATION = 'no_allocation';
    public const UNREACHABLE = 'unreachable';
    public const AVAILABLE = 'available';

    private const TIMEOUT_SECONDS = 2;

    public function __construct(private DaemonFileRepository $files)
    {
    }

    public function handle(Server $server): array
    {
        $this->files->setServer($server);

        if (!$this->isInstalled()) {
            return ['state' => self::NOT_INSTALLED];
        }

        $allocations = $server->allocations->where('ip', '127.0.0.1');
        if ($allocations->isEmpty()) {
            return ['state' => self::NO_ALLOCATION];
        }

        $config = $this->config();
        $host = config('pterodactyl.minecraft.metrics_host');
        foreach ($allocations as $allocation) {
            try {
                $response = Http::timeout(self::TIMEOUT_SECONDS)
                    ->when($config['token'], fn ($request, $token) => $request->withToken($token))
                    ->get("http://$host:{$allocation->port}{$config['path']}");
            } catch (\Throwable) {
                continue;
            }

            if ($response->successful() && str_contains($response->body(), 'mc_tickscope_info')) {
                return ['state' => self::AVAILABLE, 'port' => $allocation->port] + $this->parse($response->body());
            }
        }

        return ['state' => self::UNREACHABLE, 'ports' => $allocations->pluck('port')->values()->all()];
    }

    /**
     * Wings answers a missing folder with the same 500 as a real failure, so the plugins
     * folder is looked for in the root listing first. Any error from Wings is thrown rather
     * than cached and shown as the plugin not being installed.
     */
    private function isInstalled(): bool
    {
        if (!collect($this->files->getDirectory('/'))->contains(fn ($file) => !$file['file'] && $file['name'] === 'plugins')) {
            return false;
        }

        return collect($this->files->getDirectory('/plugins'))
            ->contains(fn ($file) => $file['file'] && preg_match('/^tickscope.*\.jar$/i', $file['name']));
    }

    /**
     * Reads the scrape path and optional bearer token from TickScope's config.
     */
    private function config(): array
    {
        $config = ['path' => '/metrics', 'token' => null];

        try {
            $contents = $this->files->getContent('plugins/TickScope/config.yml', 64 * 1024);
        } catch (\Throwable) {
            return $config;
        }

        if (preg_match('/^path:\s*"?([^"\s#]+)"?/m', $contents, $m)) {
            $config['path'] = '/' . ltrim($m[1], '/');
        }
        if (preg_match('/^auth-token:\s*"([^"]+)"/m', $contents, $m)) {
            $config['token'] = $m[1];
        }

        return $config;
    }

    /**
     * Picks the series the panel displays out of the Prometheus text exposition format.
     */
    private function parse(string $body): array
    {
        $tps = [];
        $tick = [];
        $worlds = [];
        $gauges = [];
        $source = null;

        foreach (preg_split('/\r?\n/', $body) as $line) {
            if (!preg_match('/^(mc_[a-z_]+)(?:\{([^}]*)\})?\s+(\S+)$/', $line, $m)) {
                continue;
            }

            [, $name, $rawLabels, $value] = $m;
            if (!is_numeric($value)) {
                continue;
            }
            $value = (float) $value;

            preg_match_all('/(\w+)="((?:[^"\\\\]|\\\\.)*)"/', $rawLabels, $pairs, PREG_SET_ORDER);
            $labels = collect($pairs)->mapWithKeys(fn ($p) => [$p[1] => stripcslashes($p[2])]);

            switch ($name) {
                case 'mc_tickscope_info':
                    $source = [
                        'name' => 'TickScope',
                        'version' => $labels['version'] ?? null,
                        'platform' => $labels['platform'] ?? null,
                    ];
                    break;
                case 'mc_tps':
                    $tps[$labels['window'] ?? ''] = round($value, 2);
                    break;
                case 'mc_tick_duration_seconds':
                    $tick[$labels['statistic'] ?? ''] = round($value * 1000, 2);
                    break;
                case 'mc_world_chunks':
                case 'mc_world_entities':
                case 'mc_world_tile_entities':
                case 'mc_world_players':
                    $world = $labels['world'] ?? '';
                    $worlds[$world]['name'] = $world;
                    $worlds[$world][substr($name, strlen('mc_world_'))] = (int) $value;
                    break;
                case 'mc_players_online':
                case 'mc_players_max':
                case 'mc_uptime_seconds':
                case 'mc_jvm_memory_used_bytes':
                case 'mc_jvm_memory_max_bytes':
                    // Memory gauges are split by area; the heap is what the -Xmx limit applies to.
                    if (str_starts_with($name, 'mc_jvm_memory') && ($labels['area'] ?? 'heap') !== 'heap') {
                        break;
                    }
                    $gauges[$name] = $value;
                    break;
            }
        }

        return [
            'source' => $source,
            'tps' => $tps ?: null,
            'mspt' => $tick ?: null,
            'worlds' => array_values($worlds),
            'uptime' => isset($gauges['mc_uptime_seconds']) ? (int) $gauges['mc_uptime_seconds'] : null,
            'heap' => isset($gauges['mc_jvm_memory_used_bytes']) ? [
                'used' => (int) $gauges['mc_jvm_memory_used_bytes'],
                'max' => (int) ($gauges['mc_jvm_memory_max_bytes'] ?? 0),
            ] : null,
        ];
    }
}
