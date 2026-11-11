<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Binary data for a query parameter. Db::run() binds it as PDO::PARAM_LOB, so
 * the bytes of a picture reach the MEDIUMBLOB column untouched (never treated
 * as utf8mb4 text).
 */
final class Blob
{
    public function __construct(public readonly string $bytes)
    {
    }
}
