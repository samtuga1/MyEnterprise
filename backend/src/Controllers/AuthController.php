<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Session;
use App\Core\Validator;
use App\Services\CartService;

/** Shopper accounts: session state, register, sign in, sign out. */
final class AuthController
{
    public static function customerDto(int $id): ?array
    {
        $c = Db::one('SELECT customer_id, email, firstName, lastName, phone, createdAt FROM Customer WHERE customer_id = ?', [$id]);
        return $c ? [
            'id' => (int) $c['customer_id'],
            'email' => $c['email'],
            'firstName' => $c['firstName'],
            'lastName' => $c['lastName'],
            'phone' => $c['phone'],
            'memberSince' => substr((string) $c['createdAt'], 0, 10),
        ] : null;
    }

    /** GET /api/session — who is signed in, the CSRF token, and the bag count. */
    public function session(Request $request): array
    {
        $id = Session::customerId();
        $customer = $id ? self::customerDto($id) : null;
        if ($id && !$customer) {
            Session::forget('customer_id');
        }
        return [
            'customer' => $customer,
            'csrfToken' => Session::csrfToken(),
            'cartCount' => CartService::count(),
        ];
    }

    public function register(Request $request): array
    {
        $v = new Validator($request->body());
        $first = $v->string('firstName', 'your first name', 1, 50);
        $last = $v->string('lastName', 'your last name', 1, 50);
        $email = $v->email('email');
        $password = $v->password('password');
        $v->done();

        if (Db::value('SELECT 1 FROM Customer WHERE email = ?', [$email])) {
            throw new HttpError(409, 'conflict', 'An account with this email already exists. Sign in instead.', ['email' => 'This email is already registered.']);
        }
        $id = Db::insert('INSERT INTO Customer (email, firstName, lastName, password_hash) VALUES (?, ?, ?, ?)',
            [$email, $first, $last, password_hash($password, PASSWORD_DEFAULT)]);

        Session::regenerate();
        Session::set('customer_id', $id);
        CartService::mergeGuestCart($id);
        return $this->session($request) + ['created' => true];
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

        RateLimiter::check('customer', $email);
        $c = Db::one('SELECT customer_id, password_hash FROM Customer WHERE email = ?', [$email]);
        // password_verify runs even for unknown emails, so timing does not reveal which emails exist.
        $hash = $c['password_hash'] ?? '$2y$10$EWETvAXH9FbVe7bdX2pTQeUzN.PFYyBgYDs0herWcJ7nmrLTd8hq6';
        if (!password_verify($password, $hash) || !$c) {
            RateLimiter::fail('customer', $email);
            throw new HttpError(401, 'invalid_credentials', 'That email and password do not match an account.');
        }
        RateLimiter::clear('customer', $email);
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            Db::run('UPDATE Customer SET password_hash = ? WHERE customer_id = ?', [password_hash($password, PASSWORD_DEFAULT), $c['customer_id']]);
        }

        Session::regenerate();
        Session::set('customer_id', (int) $c['customer_id']);
        CartService::mergeGuestCart((int) $c['customer_id']);
        return $this->session($request);
    }

    public function logout(Request $request): array
    {
        Session::forget('customer_id');
        Session::forget('cart');
        Session::regenerate();
        return $this->session($request);
    }
}
