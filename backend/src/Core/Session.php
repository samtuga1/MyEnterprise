<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Server-side session. The browser only holds an opaque, HttpOnly cookie.
 * Customer and admin sign-ins are stored under separate keys, so signing in
 * to /admin never replaces the shopper's session or bag.
 */
final class Session
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        session_name('ME_SESSION');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_start();
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return $_SESSION[$key] ?? $default;
    }

    public static function set(string $key, mixed $value): void
    {
        $_SESSION[$key] = $value;
    }

    public static function forget(string $key): void
    {
        unset($_SESSION[$key]);
    }

    /** New session id after sign-in, so a planted id cannot be reused (session fixation). */
    public static function regenerate(): void
    {
        session_regenerate_id(true);
    }

    public static function csrfToken(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    /** Every request that changes data must echo the token in the X-CSRF-Token header. */
    public static function verifyCsrf(?string $token): void
    {
        if (!is_string($token) || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $token)) {
            // 403 with code "csrf" (not the unofficial 419, which Apache turns into a 500).
            throw new HttpError(403, 'csrf', 'Your session expired. Refresh the page and try again.');
        }
    }

    public static function customerId(): ?int
    {
        $id = $_SESSION['customer_id'] ?? null;
        return is_int($id) ? $id : null;
    }

    public static function adminId(): ?int
    {
        $id = $_SESSION['admin_id'] ?? null;
        if (!is_int($id)) {
            return null;
        }
        $idle = (int) Config::get('admin_idle_minutes', 30) * 60;
        if (time() - (int) ($_SESSION['admin_seen'] ?? 0) > $idle) {
            unset($_SESSION['admin_id'], $_SESSION['admin_role'], $_SESSION['admin_seen']);
            return null;
        }
        $_SESSION['admin_seen'] = time();
        return $id;
    }
}
