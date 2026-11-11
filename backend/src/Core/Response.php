<?php
declare(strict_types=1);

namespace App\Core;

final class Response
{
    public static function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode(['data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }

    public static function error(HttpError $error): void
    {
        http_response_code($error->status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        $body = ['code' => $error->errorCode, 'message' => $error->getMessage()];
        if ($error->fields) {
            $body['fields'] = $error->fields;
        }
        echo json_encode(['error' => $body], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
