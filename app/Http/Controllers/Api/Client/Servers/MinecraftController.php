<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Carbon\Carbon;
use Pterodactyl\Models\Server;
use Illuminate\Cache\Repository;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\GetServerRequest;
use Pterodactyl\Services\Games\Minecraft\MinecraftPingService;
use Pterodactyl\Services\Games\Minecraft\MinecraftMetricsService;
use Pterodactyl\Services\Games\Minecraft\MinecraftOverviewService;
use Pterodactyl\Http\Requests\Api\Client\Servers\Minecraft\GetMinecraftOverviewRequest;

class MinecraftController extends ClientApiController
{
    public function __construct(
        private Repository $cache,
        private MinecraftPingService $pingService,
        private MinecraftOverviewService $overviewService,
        private MinecraftMetricsService $metricsService,
    ) {
        parent::__construct();
    }

    /**
     * Returns the server's live status as reported by a server list ping. Cached briefly so
     * that several people viewing the console do not each ping the server.
     */
    public function status(GetServerRequest $request, Server $server): array
    {
        $status = $this->cache->remember("minecraft:status:$server->uuid", Carbon::now()->addSeconds(10), function () use ($server) {
            try {
                return ['online' => true, 'error' => null] + $this->pingService->handle($server);
            } catch (DisplayException $exception) {
                return ['online' => false, 'error' => $exception->getMessage()];
            }
        });

        return [
            'object' => 'minecraft_status',
            'attributes' => $status,
        ];
    }

    /**
     * Returns performance metrics from the TickScope plugin, or why they are unavailable.
     */
    public function metrics(GetServerRequest $request, Server $server): array
    {
        $metrics = $this->cache->remember("minecraft:metrics:$server->uuid", Carbon::now()->addSeconds(10), function () use ($server) {
            return $this->metricsService->handle($server);
        });

        return [
            'object' => 'minecraft_metrics',
            'attributes' => $metrics,
        ];
    }

    /**
     * Returns the server's configuration, installed plugins/mods and worlds.
     *
     * @throws \Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException
     */
    public function overview(GetMinecraftOverviewRequest $request, Server $server): array
    {
        $overview = $this->cache->remember("minecraft:overview:$server->uuid", Carbon::now()->addSeconds(60), function () use ($server) {
            return $this->overviewService->handle($server);
        });

        return [
            'object' => 'minecraft_overview',
            'attributes' => $overview,
        ];
    }
}
