<?php
/**
 * Serves the React app shell for every page address (/, /shop/women,
 * /product/…, /admin/orders …). The storefront and the admin are two separate
 * builds: anything under /admin gets app/admin.html, everything else
 * app/index.html. The folder the site is installed in (for example
 * /MyEnterprise on XAMPP) is detected here and handed to the app.
 */
declare(strict_types=1);

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/');

// Installed in a sub-folder, maybe reached through the project-root rewrite (…/MyEnterprise → …/MyEnterprise/public).
$base = $scriptDir;
if ($base !== '' && !str_starts_with($uri . '/', $base . '/') && str_ends_with($base, '/public')) {
    $base = substr($base, 0, -strlen('/public'));
}
$path = substr($uri, strlen($base)) ?: '/';
$isAdmin = (bool) preg_match('#^/admin(/|$)#', $path);

$shell = __DIR__ . '/app/' . ($isAdmin ? 'admin.html' : 'index.html');
if (!is_file($shell)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "The interface has not been built yet.\nRun:  npm install && npm run build\n(see README.md)";
    exit;
}

$nonce = base64_encode(random_bytes(16));
$config = json_encode(['base' => $base], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$inject = '<base href="' . htmlspecialchars($base . '/app/', ENT_QUOTES) . '">'
    . '<script nonce="' . $nonce . '">window.__ME__=' . $config . ';</script>';

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-$nonce'; style-src 'self' 'unsafe-inline'; "
    . "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'");
header('Cache-Control: no-cache');

echo preg_replace('/<head>/i', '<head>' . $inject, (string) file_get_contents($shell), 1);
