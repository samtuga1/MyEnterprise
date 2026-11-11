<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Slows down password guessing: after N failed sign-ins for one email from one
 * address within the window, further attempts are refused until it passes.
 * Counters are small files in backend/storage/ratelimit (no schema change).
 */
final class RateLimiter
{
    private static function file(string $scope, string $email): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
        return BACKEND_ROOT . '/storage/ratelimit/' . hash('sha256', $scope . '|' . strtolower($email) . '|' . $ip) . '.json';
    }

    private static function attempts(string $file): array
    {
        $window = (int) Config::get('login_window_minutes', 15) * 60;
        $list = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
        return array_values(array_filter($list, static fn ($t) => is_int($t) && $t > time() - $window));
    }

    public static function check(string $scope, string $email): void
    {
        if (count(self::attempts(self::file($scope, $email))) >= (int) Config::get('login_attempts', 6)) {
            throw new HttpError(429, 'too_many_attempts',
                'Too many sign-in attempts. Wait ' . Config::get('login_window_minutes', 15) . ' minutes and try again.');
        }
    }

    public static function fail(string $scope, string $email): void
    {
        $file = self::file($scope, $email);
        $list = self::attempts($file);
        $list[] = time();
        @file_put_contents($file, json_encode($list), LOCK_EX);
    }

    public static function clear(string $scope, string $email): void
    {
        @unlink(self::file($scope, $email));
    }
}
