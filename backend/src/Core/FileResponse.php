<?php
declare(strict_types=1);

namespace App\Core;

/**
 * A binary reply (a picture) instead of JSON. Controllers return one and the
 * Router sends it. The ETag is the picture's SHA-256, so a browser that
 * already has the file gets "304 Not Modified" and no bytes.
 */
final class FileResponse
{
    public function __construct(
        public readonly string $bytes,
        public readonly string $mime,
        public readonly string $etag,
        public readonly string $cacheControl,
        public readonly int $status = 200,
    ) {
    }

    public static function notModified(string $etag, string $cacheControl): self
    {
        return new self('', '', $etag, $cacheControl, 304);
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('Cache-Control: ' . $this->cacheControl);
        header('ETag: "' . $this->etag . '"');
        header('X-Content-Type-Options: nosniff');
        // A picture opened on its own can never run script (matters for SVG).
        header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
        header('Cross-Origin-Resource-Policy: same-origin');
        if ($this->status === 304) {
            return;
        }
        header('Content-Type: ' . $this->mime);
        header('Content-Length: ' . strlen($this->bytes));
        echo $this->bytes;
    }
}
