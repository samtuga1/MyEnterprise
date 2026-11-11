<?php
/**
 * MyEnterprise API bootstrap: class loading, configuration, error handling.
 * public/api/index.php includes this file; nothing in backend/ is served directly.
 */
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));
define('BACKEND_ROOT', __DIR__);

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'App\\')) {
        $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, 4)) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

$configFile = is_file(__DIR__ . '/config/config.php') ? __DIR__ . '/config/config.php' : __DIR__ . '/config/config.example.php';
App\Core\Config::load(require $configFile);

ini_set('display_errors', '0');
error_reporting(E_ALL);
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false; // silenced with @ on purpose (for example removing a file that may not exist)
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});
