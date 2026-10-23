<?php

namespace Pterodactyl\Services\Games\Minecraft;

use Illuminate\Support\Str;
use Pterodactyl\Models\Server;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Exceptions\Http\Server\FileSizeTooLargeException;

/**
 * Builds a summary of a Minecraft server's configuration, plugins/mods and worlds by
 * reading its files through Wings.
 */
class MinecraftOverviewService
{
    /**
     * The server.properties keys surfaced to the panel.
     */
    private const PROPERTIES = [
        'motd',
        'level-name',
        'max-players',
        'gamemode',
        'difficulty',
        'hardcore',
        'online-mode',
        'white-list',
        'enforce-whitelist',
        'pvp',
        'view-distance',
        'simulation-distance',
    ];

    private const DIMENSION_LABELS = [
        'minecraft:overworld' => 'Overworld',
        'minecraft:the_nether' => 'Nether',
        'minecraft:the_end' => 'The End',
    ];

    /**
     * Directory listings fetched while building this overview, keyed by path.
     */
    private array $listings = [];

    public function __construct(private DaemonFileRepository $files)
    {
    }

    public function handle(Server $server): array
    {
        $this->files->setServer($server);
        $this->listings = [];

        $properties = $this->properties();
        $level = $properties['level-name'] ?? 'world';

        return [
            'properties' => $properties,
            'plugins' => $this->jars('/plugins'),
            'mods' => $this->jars('/mods'),
            'worlds' => $this->worlds($level),
        ];
    }

    private function properties(): array
    {
        if (!collect($this->list('/'))->contains(fn ($f) => $f['file'] && $f['name'] === 'server.properties')) {
            return [];
        }

        try {
            $contents = $this->files->getContent('server.properties', 64 * 1024);
        } catch (FileSizeTooLargeException) {
            return [];
        }

        $properties = [];
        foreach (preg_split('/\r?\n/', $contents) as $line) {
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);
            if (in_array($key, self::PROPERTIES, true)) {
                // Java properties files escape non-ASCII characters as \uXXXX.
                $properties[$key] = preg_replace_callback(
                    '/\\\\u([0-9a-fA-F]{4})/',
                    fn ($m) => mb_chr(hexdec($m[1]), 'UTF-8'),
                    $value
                );
            }
        }

        return $properties;
    }

    /**
     * Lists the plugin or mod jars in a directory, splitting a trailing version off the filename.
     */
    private function jars(string $directory): array
    {
        return collect($this->list($directory))
            ->filter(fn ($file) => $file['file'] && preg_match('/\.jar(\.disabled)?$/i', $file['name']))
            ->map(function ($file) {
                $enabled = !Str::endsWith(strtolower($file['name']), '.disabled');
                $base = preg_replace('/\.jar(\.disabled)?$/i', '', $file['name']);
                preg_match('/^(.+?)[-_ ]v?(\d[\w.+-]*)$/', $base, $matches);

                return [
                    'name' => $matches[1] ?? $base,
                    'version' => $matches[2] ?? null,
                    'file' => $file['name'],
                    'size' => $file['size'],
                    'enabled' => $enabled,
                ];
            })
            ->sortBy(fn ($jar) => strtolower($jar['name']))
            ->values()
            ->all();
    }

    /**
     * Finds the dimensions for the main level. Newer versions keep every dimension under
     * <level>/dimensions/<namespace>/<name>; older ones use <level>, <level>_nether and
     * <level>_the_end side by side.
     */
    private function worlds(string $level): array
    {
        $root = $this->list("/$level");
        if (empty($root)) {
            return [];
        }

        $modified = collect($root)->firstWhere('name', 'level.dat')['modified'] ?? null;
        $dimensions = [];

        if (collect($root)->contains(fn ($f) => $f['name'] === 'dimensions' && !$f['file'])) {
            foreach ($this->list("/$level/dimensions") as $namespace) {
                if ($namespace['file']) {
                    continue;
                }
                foreach ($this->list("/$level/dimensions/{$namespace['name']}") as $dimension) {
                    if (!$dimension['file']) {
                        $dimensions[] = $this->dimension(
                            "{$namespace['name']}:{$dimension['name']}",
                            "/$level/dimensions/{$namespace['name']}/{$dimension['name']}"
                        );
                    }
                }
            }
        } else {
            $dimensions[] = $this->dimension('minecraft:overworld', "/$level");
            foreach (['minecraft:the_nether' => ["/{$level}_nether", 'DIM-1'], 'minecraft:the_end' => ["/{$level}_the_end", 'DIM1']] as $id => [$path, $dim]) {
                // Vanilla nests the dimension inside the level folder; Bukkit gives each its own folder.
                foreach (["$path/$dim", "/$level/$dim"] as $candidate) {
                    if (!empty($this->list("$candidate/region"))) {
                        $dimensions[] = $this->dimension($id, $candidate);
                        break;
                    }
                }
            }
        }

        // Vanilla dimensions first in their usual order, then any custom ones by name.
        $order = array_flip(array_keys(self::DIMENSION_LABELS));
        usort($dimensions, fn ($a, $b) => [$order[$a['id']] ?? PHP_INT_MAX, $a['name']] <=> [$order[$b['id']] ?? PHP_INT_MAX, $b['name']]);

        return [[
            'name' => $level,
            'modified' => $modified,
            'size' => array_sum(array_column($dimensions, 'size')),
            'dimensions' => $dimensions,
            'datapacks' => $this->datapacks("/$level/datapacks"),
        ]];
    }

    /**
     * Lists a world's datapacks, which are either folders or zip files.
     */
    private function datapacks(string $directory): array
    {
        return collect($this->list($directory))
            ->filter(fn ($file) => !$file['file'] || str_ends_with(strtolower($file['name']), '.zip'))
            ->map(fn ($file) => [
                'name' => $file['file'] ? preg_replace('/\.zip$/i', '', $file['name']) : $file['name'],
                'file' => $file['name'],
                'type' => $file['file'] ? 'zip' : 'folder',
                // Wings only reports real sizes for files, not folders.
                'size' => $file['file'] ? $file['size'] : null,
                // Paper generates this pack itself to hold plugin-registered content.
                'builtin' => !$file['file'] && $file['name'] === 'bukkit',
            ])
            ->sortBy(fn ($pack) => [$pack['builtin'], strtolower($pack['name'])])
            ->values()
            ->all();
    }

    private function dimension(string $id, string $path): array
    {
        $regions = collect($this->list("$path/region"))
            ->filter(fn ($file) => $file['file'] && str_ends_with($file['name'], '.mca'));

        return [
            'id' => $id,
            'name' => self::DIMENSION_LABELS[$id] ?? Str::headline(Str::after($id, ':')),
            'regions' => $regions->count(),
            'size' => $regions->sum('size'),
        ];
    }

    /**
     * Lists a directory, treating a missing one as empty. Wings answers a missing path with
     * the same 500 as a real failure, so existence is checked against the parent's listing
     * first; any error from Wings is then thrown rather than cached as an empty list.
     */
    private function list(string $path): array
    {
        $path = '/' . trim($path, '/');
        if (array_key_exists($path, $this->listings)) {
            return $this->listings[$path];
        }

        if ($path !== '/') {
            $name = basename($path);
            if (!collect($this->list(dirname($path)))->contains(fn ($f) => !$f['file'] && $f['name'] === $name)) {
                return $this->listings[$path] = [];
            }
        }

        return $this->listings[$path] = $this->files->getDirectory($path);
    }
}
