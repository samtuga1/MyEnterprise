<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Maps "METHOD /api/path/{param}" to a controller method, applying the
 * access rules declared with each route:
 *   'customer'                    a signed-in shopper
 *   'admin'                       any signed-in staff member
 *   'admin:OPERATIONS,CATALOG'    staff with one of these roles (ADMINISTRATOR always passes)
 * Every non-GET request must carry a valid CSRF token.
 */
final class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, array $handler, string $access = 'public'): void
    {
        $regex = '#^' . preg_replace('#\{([a-zA-Z]+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler, $access];
    }

    public function get(string $p, array $h, string $a = 'public'): void { $this->add('GET', $p, $h, $a); }
    public function post(string $p, array $h, string $a = 'public'): void { $this->add('POST', $p, $h, $a); }
    public function patch(string $p, array $h, string $a = 'public'): void { $this->add('PATCH', $p, $h, $a); }
    public function put(string $p, array $h, string $a = 'public'): void { $this->add('PUT', $p, $h, $a); }
    public function delete(string $p, array $h, string $a = 'public'): void { $this->add('DELETE', $p, $h, $a); }

    public function dispatch(Request $request): void
    {
        $allowed = [];
        foreach ($this->routes as [$method, $regex, $handler, $access]) {
            if (!preg_match($regex, $request->path, $matches)) {
                continue;
            }
            if ($method !== $request->method) {
                $allowed[] = $method;
                continue;
            }
            $request->params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            if ($request->method !== 'GET') {
                Session::verifyCsrf($request->header('x-csrf-token'));
            }
            $this->authorize($access);
            [$class, $action] = $handler;
            $result = (new $class())->$action($request);
            if ($result instanceof FileResponse) {
                $result->send();
                return;
            }
            Response::json($result, $request->method === 'POST' && is_array($result) && isset($result['created']) ? 201 : 200);
            return;
        }
        if ($allowed) {
            throw new HttpError(405, 'method_not_allowed', 'This action is not available here.');
        }
        throw HttpError::notFound('No API endpoint matches ' . $request->path . '.');
    }

    private function authorize(string $access): void
    {
        if ($access === 'public') {
            return;
        }
        if ($access === 'customer') {
            if (Session::customerId() === null) {
                throw HttpError::unauthorized();
            }
            return;
        }
        if (str_starts_with($access, 'admin')) {
            if (Session::adminId() === null) {
                throw HttpError::unauthorized('Sign in to the admin to continue.');
            }
            $roles = str_contains($access, ':') ? explode(',', substr($access, 6)) : [];
            $role = Session::get('admin_role');
            if ($roles && $role !== 'ADMINISTRATOR' && !in_array($role, $roles, true)) {
                throw HttpError::forbidden();
            }
        }
    }
}
