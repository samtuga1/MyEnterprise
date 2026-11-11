<?php
declare(strict_types=1);

namespace App\Core;

/** The incoming HTTP request, with the JSON body decoded once. */
final class Request
{
    public array $params = [];
    private ?array $json = null;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        private readonly string $rawBody,
        public readonly array $files,
        public readonly array $headers,
    ) {
    }

    public static function fromGlobals(): self
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Everything before "/api/" is the folder the site is installed in (e.g. /MyEnterprise).
        $pos = strpos($uri, '/api/');
        $path = $pos === false ? $uri : substr($uri, $pos);
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
            }
        }
        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            rtrim($path, '/') ?: '/',
            $_GET,
            (string) file_get_contents('php://input'),
            $_FILES,
            $headers,
        );
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /** Decoded JSON body (or form fields for multipart uploads). */
    public function body(): array
    {
        if ($this->json === null) {
            if ($this->rawBody === '') {
                $this->json = $_POST ?: [];
            } else {
                $decoded = json_decode($this->rawBody, true);
                if (!is_array($decoded)) {
                    throw HttpError::badRequest('The request body must be JSON.');
                }
                $this->json = $decoded;
            }
        }
        return $this->json;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body()[$key] ?? $default;
    }

    public function param(string $key): string
    {
        return (string) ($this->params[$key] ?? '');
    }

    public function intParam(string $key): int
    {
        $value = $this->param($key);
        if (!ctype_digit($value)) {
            throw HttpError::notFound();
        }
        return (int) $value;
    }

    public function queryString(string $key, string $default = ''): string
    {
        $value = $this->query[$key] ?? $default;
        return is_string($value) ? trim($value) : $default;
    }

    public function queryInt(string $key, int $default, int $min = PHP_INT_MIN, int $max = PHP_INT_MAX): int
    {
        $value = $this->query[$key] ?? null;
        if (!is_string($value) || !preg_match('/^-?\d+$/', $value)) {
            return $default;
        }
        return max($min, min($max, (int) $value));
    }
}
