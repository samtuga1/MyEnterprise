<?php
/**
 * MyEnterprise configuration — EXAMPLE.
 *
 * Copy this file to config.php (same folder) and edit it for your machine.
 * config.php is ignored by git, so real passwords never reach the repository.
 * If config.php is missing, these defaults are used: they match a fresh
 * XAMPP install (user root, no password), which is only acceptable locally.
 *
 * Every value can also be overridden by an environment variable (ME_DB_HOST …),
 * which is how the automated tests point the API at a test database.
 */
declare(strict_types=1);

return [
    'db' => [
        'host'     => getenv('ME_DB_HOST') ?: '127.0.0.1',
        'port'     => (int) (getenv('ME_DB_PORT') ?: 3306),
        'name'     => getenv('ME_DB_NAME') ?: 'myenterprise',
        'user'     => getenv('ME_DB_USER') ?: 'root',
        'password' => getenv('ME_DB_PASSWORD') !== false ? (string) getenv('ME_DB_PASSWORD') : '',
    ],
    // Shown in the admin header and the page title.
    'store_name' => 'MyEnterprise',
    // 'development' shows SQL error details in API responses; use 'production' otherwise.
    'environment' => getenv('ME_ENV') ?: 'development',
    // Admin sessions end after this many minutes without activity.
    'admin_idle_minutes' => 30,
    // Failed sign-ins allowed per email + address within the window below.
    'login_attempts' => 6,
    'login_window_minutes' => 15,
    // Largest picture file the admin may upload. The API shrinks it to at most
    // 1200 × 1500 pixels and under 512 KB before storing it in ProductImage.
    'upload_max_bytes' => 12 * 1024 * 1024,
];
