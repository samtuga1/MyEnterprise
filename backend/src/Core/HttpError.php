<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/**
 * An error the API reports to the client as JSON:
 *   { "error": { "code": "...", "message": "...", "fields": { ... } } }
 * The message is written for people and can be shown in the interface as-is.
 */
final class HttpError extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $fields = [],
    ) {
        parent::__construct($message);
    }

    public static function badRequest(string $message, array $fields = []): self
    {
        return new self(422, 'invalid', $message, $fields);
    }

    public static function unauthorized(string $message = 'Please sign in to continue.'): self
    {
        return new self(401, 'unauthenticated', $message);
    }

    public static function forbidden(string $message = 'Your role does not allow this action.'): self
    {
        return new self(403, 'forbidden', $message);
    }

    public static function notFound(string $message = 'Not found.'): self
    {
        return new self(404, 'not_found', $message);
    }

    public static function conflict(string $message): self
    {
        return new self(409, 'conflict', $message);
    }

    public static function rule(string $message): self
    {
        return new self(422, 'rule', $message);
    }
}
