<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Db;
use App\Core\FileResponse;
use App\Core\HttpError;
use App\Core\Request;

/**
 * Sends product pictures stored in ProductImage.data (MEDIUMBLOB).
 * Public, read-only, and served without a PHP session (see App::run).
 */
final class ImageController
{
    /**
     * GET /api/images/{key}: the picture whose SHA-256 is {key}. The same
     * address always means the same bytes, so browsers keep it for a year.
     */
    public function show(Request $request): FileResponse
    {
        $key = strtolower($request->param('key'));
        if (!preg_match('/^[0-9a-f]{64}$/', $key)) {
            throw HttpError::notFound('No picture has this address.');
        }
        return $this->send($request, $key, 'public, max-age=31536000, immutable');
    }

    /**
     * GET /api/images/products/{slug}?color=Sage: the current main picture of
     * a product colour, for page artwork that names a product rather than a
     * picture. The answer can change when an admin uploads, so it is cached
     * for five minutes only.
     */
    public function product(Request $request): FileResponse
    {
        $color = $request->queryString('color');
        $key = Db::value('SELECT fn_product_image(product_id, ?) FROM Product WHERE slug = ?',
            [$color !== '' ? $color : null, $request->param('slug')]);
        if (!$key) {
            throw HttpError::notFound('This product has no picture yet.');
        }
        return $this->send($request, (string) $key, 'public, max-age=300');
    }

    private function send(Request $request, string $key, string $cache): FileResponse
    {
        $known = trim((string) $request->header('if-none-match'), " \"W/");
        if ($known === $key) {
            return FileResponse::notModified($key, $cache);
        }
        $row = Db::one('SELECT mime_type, data FROM ProductImage WHERE sha256 = ?', [$key]);
        if (!$row) {
            throw HttpError::notFound('No picture has this address.');
        }
        return new FileResponse((string) $row['data'], $row['mime_type'], $key, $cache);
    }
}
