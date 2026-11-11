<?php
declare(strict_types=1);

namespace App\Core;

use PDOException;
use Throwable;

final class App
{
    public static function run(): void
    {
        try {
            $request = Request::fromGlobals();
            // Pictures need no session. Skipping it also avoids PHP's session lock,
            // so a page's pictures download in parallel instead of one by one.
            if (!str_starts_with($request->path, '/api/images/')) {
                Session::start();
            }
            $router = new Router();
            (require BACKEND_ROOT . '/routes.php')($router);
            $router->dispatch($request);
        } catch (HttpError $e) {
            Response::error($e);
        } catch (PDOException $e) {
            Response::error(Db::translate($e));
        } catch (Throwable $e) {
            error_log('[MyEnterprise] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            Response::error(new HttpError(500, 'server_error',
                Config::isDevelopment() ? $e->getMessage() : 'Something went wrong on our side. Please try again.'));
        }
    }
}
