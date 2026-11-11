<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Session;
use App\Core\Validator;

/** Staff sign-in for /admin, kept apart from the shopper's session keys. */
final class AdminAuthController
{
    public const PERMISSIONS = [
        'ADMINISTRATOR' => ['catalog', 'inventory', 'procurement', 'orders', 'aftersales', 'customers', 'reports', 'database'],
        'OPERATIONS'    => ['inventory', 'procurement', 'orders', 'aftersales', 'reports', 'database'],
        'CATALOG'       => ['catalog', 'reports', 'database'],
        'SUPPORT'       => ['orders', 'aftersales', 'customers', 'reports'],
    ];

    private function dto(int $id): ?array
    {
        $a = Db::one('SELECT admin_id, email, fullName, role FROM Admin WHERE admin_id = ? AND isActive = 1', [$id]);
        return $a ? [
            'id' => (int) $a['admin_id'],
            'email' => $a['email'],
            'name' => $a['fullName'],
            'role' => $a['role'],
            'can' => self::PERMISSIONS[$a['role']] ?? [],
        ] : null;
    }

    public function session(Request $request): array
    {
        $id = Session::adminId();
        return ['admin' => $id ? $this->dto($id) : null, 'csrfToken' => Session::csrfToken()];
    }

    public function login(Request $request): array
    {
        $v = new Validator($request->body());
        $email = $v->email('email');
        $password = $request->input('password');
        if (!is_string($password) || $password === '') {
            $v->fail('password', 'Enter your password.');
        }
        $v->done();

        RateLimiter::check('admin', $email);
        $a = Db::one('SELECT admin_id, role, password_hash, isActive FROM Admin WHERE email = ?', [$email]);
        $hash = $a['password_hash'] ?? '$2y$10$EWETvAXH9FbVe7bdX2pTQeUzN.PFYyBgYDs0herWcJ7nmrLTd8hq6';
        if (!password_verify($password, $hash) || !$a || !$a['isActive']) {
            RateLimiter::fail('admin', $email);
            throw new HttpError(401, 'invalid_credentials', 'That email and password do not match a staff account.');
        }
        RateLimiter::clear('admin', $email);

        Session::regenerate();
        Session::set('admin_id', (int) $a['admin_id']);
        Session::set('admin_role', $a['role']);
        Session::set('admin_seen', time());
        return $this->session($request);
    }

    public function logout(Request $request): array
    {
        Session::forget('admin_id');
        Session::forget('admin_role');
        Session::forget('admin_seen');
        Session::regenerate();
        return $this->session($request);
    }
}
