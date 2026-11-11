<?php
// Single entry point for the JSON API: /api/... (see backend/routes.php).
declare(strict_types=1);

require dirname(__DIR__, 2) . '/backend/bootstrap.php';

App\Core\App::run();
