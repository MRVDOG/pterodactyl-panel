<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Minecraft;

use Pterodactyl\Models\Permission;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class GetMinecraftOverviewRequest extends ClientApiRequest
{
    /**
     * The overview is built from the server's files, so it requires the same access as
     * opening them in the file manager.
     */
    public function permission(): string
    {
        return Permission::ACTION_FILE_READ_CONTENT;
    }
}
