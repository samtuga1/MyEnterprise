<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\HttpError;

/**
 * Turns an uploaded picture into what ProductImage stores: a JPEG of at most
 * 1200 × 1500 pixels and 512 KB (chk_image_bytes), with the camera's metadata
 * (EXIF: GPS position, device) removed. Uses PHP's GD extension, which XAMPP
 * enables by default.
 */
final class ImageService
{
    public const MAX_BYTES = 524288;
    private const MAX_WIDTH = 1200;
    private const MAX_HEIGHT = 1500;
    private const MIN_SIDE = 200;
    private const MAX_PIXELS = 40_000_000;
    // Transparent areas of a PNG become the shop's warm white (--bg).
    private const GROUND = [246, 241, 231];

    /** @return array{bytes: string, mime: string, width: int, height: int} */
    public static function prepare(string $path): array
    {
        if (!function_exists('imagecreatefromjpeg')) {
            throw new HttpError(500, 'gd_missing', 'Picture uploads need the PHP GD extension. Enable extension=gd in php.ini.');
        }
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($path);
        $info = @getimagesize($path);
        $readers = ['image/jpeg' => 'imagecreatefromjpeg', 'image/png' => 'imagecreatefrompng'];
        if (self::canReadWebp()) {
            $readers['image/webp'] = 'imagecreatefromwebp';
        }
        if ($mime === 'image/webp' && !isset($readers['image/webp'])) {
            throw HttpError::badRequest('This server cannot read WebP files. Save the picture as JPEG or PNG and upload it again.',
                ['image' => 'Use a JPEG or PNG file.']);
        }
        if (!isset($readers[$mime]) || $info === false || ($info['mime'] ?? '') !== $mime) {
            throw HttpError::badRequest('That file is not a JPEG or PNG picture.', ['image' => 'Choose a JPEG or PNG file.']);
        }
        [$width, $height] = $info;
        if ($width < self::MIN_SIDE || $height < self::MIN_SIDE) {
            throw HttpError::badRequest('The picture is too small. Use one at least 200 × 200 pixels.', ['image' => 'At least 200 × 200 pixels.']);
        }
        if ($width * $height > self::MAX_PIXELS) {
            throw HttpError::badRequest('The picture has too many pixels (over 40 megapixels). Make it smaller first.', ['image' => 'At most 40 megapixels.']);
        }
        $source = @$readers[$mime]($path);
        if (!$source) {
            throw HttpError::badRequest('The picture could not be read. It may be damaged.', ['image' => 'Choose another file.']);
        }
        $source = self::upright($source, $path, $mime);

        $width = imagesx($source);
        $height = imagesy($source);
        $scale = min(1, self::MAX_WIDTH / $width, self::MAX_HEIGHT / $height);
        $w = max(1, (int) round($width * $scale));
        $h = max(1, (int) round($height * $scale));
        $canvas = imagecreatetruecolor($w, $h);
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, ...self::GROUND));
        imagecopyresampled($canvas, $source, 0, 0, 0, 0, $w, $h, $width, $height);
        imageinterlace($canvas, true); // progressive JPEG: a blurred preview appears first

        $bytes = '';
        foreach ([84, 78, 72, 64, 56] as $quality) {
            ob_start();
            imagejpeg($canvas, null, $quality);
            $bytes = (string) ob_get_clean();
            if (strlen($bytes) <= self::MAX_BYTES) {
                break;
            }
        }
        if (strlen($bytes) > self::MAX_BYTES) {
            throw HttpError::badRequest('The picture could not be made small enough to store. Try a simpler or smaller picture.');
        }
        return ['bytes' => $bytes, 'mime' => 'image/jpeg', 'width' => $w, 'height' => $h];
    }

    /** Phone cameras record the rotation in EXIF; apply it, because EXIF is dropped. */
    private static function upright(\GdImage $image, string $path, string $mime): \GdImage
    {
        if ($mime !== 'image/jpeg' || !function_exists('exif_read_data')) {
            return $image;
        }
        $orientation = (int) ((@exif_read_data($path) ?: [])['Orientation'] ?? 1);
        $angle = [3 => 180, 6 => -90, 8 => 90][$orientation] ?? 0;
        return $angle ? (imagerotate($image, $angle, 0) ?: $image) : $image;
    }

    private static function canReadWebp(): bool
    {
        return function_exists('imagecreatefromwebp') && (gd_info()['WebP Support'] ?? false);
    }
}
