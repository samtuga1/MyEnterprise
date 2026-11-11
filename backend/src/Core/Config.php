<?php
declare(strict_types=1);

namespace App\Core;

/** Read-only access to backend/config/config.php values: Config::get('db.host'). */
final class Config
{
    private static array $values = [];

    public static function load(array $values): void
    {
        self::$values = $values;
    }

    public static function get(string $path, mixed $default = null): mixed
    {
        $value = self::$values;
        foreach (explode('.', $path) as $key) {
            if (!is_array($value) || !array_key_exists($key, $value)) {
                return $default;
            }
            $value = $value[$key];
        }
        return $value;
    }

    public static function isDevelopment(): bool
    {
        return self::get('environment') === 'development';
    }
}
