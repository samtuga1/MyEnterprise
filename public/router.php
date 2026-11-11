<?php
/**
 * Router for PHP's built-in web server, so the shop runs without Apache:
 *   php -S 127.0.0.1:8080 -t public public/router.php     (npm run serve)
 * Apache/XAMPP uses public/.htaccess for the same rules.
 */
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (str_starts_with($path, '/api/')) {
    require __DIR__ . '/api/index.php';
    return true;
}
if ($path !== '/' && is_file(__DIR__ . $path) && !str_ends_with($path, '.php')) {
    return false; // let the server send the static file (JS, CSS, images, fonts)
}
require __DIR__ . '/index.php';
return true;
