<?php
/**
 * Writes docs/ER_DIAGRAM.md: a Mermaid entity-relationship diagram read from
 * the live database (information_schema), so the diagram always matches the
 * schema that is actually installed. GitHub and most Markdown viewers render it.
 *
 *   php tools/er-diagram.php            (uses backend/config, like the API)
 */
declare(strict_types=1);

require __DIR__ . '/../backend/bootstrap.php';

use App\Controllers\Admin\DatabaseController;
use App\Core\Config;
use App\Core\Db;

$schema = Config::get('db.name');
$canonical = static function (string $name): string {
    foreach (DatabaseController::DOMAINS as $tables) {
        foreach ($tables as $t) {
            if (strcasecmp($t, $name) === 0) return $t;
        }
    }
    return $name;
};

$columns = Db::all('SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, COLUMN_KEY, IS_NULLABLE
                      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION', [$schema]);
$fks = Db::all('SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, CONSTRAINT_NAME
                  FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME', [$schema]);
$fkCols = [];
foreach ($fks as $f) {
    $fkCols[$canonical($f['TABLE_NAME'])][$f['COLUMN_NAME']] = true;
}
$views = array_column(Db::all('SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?', [$schema]), 'TABLE_NAME');

$tableCount = count(array_diff(array_unique(array_map(static fn ($c) => $c['TABLE_NAME'], $columns)), $views));
$out = ["# MyEnterprise — entity-relationship diagram", '',
    "Generated from the installed database by `php tools/er-diagram.php`. $tableCount tables (the 30 of the design plus ProductImage); `||--o{` reads \"one to zero-or-many\".",
    'PK = primary key, FK = foreign key, UK = unique. Columns and the table added to the original design are listed in docs/DATABASE.md.', '',
    '```mermaid', 'erDiagram'];

// Relationships (one line per foreign key constraint).
$seen = [];
foreach ($fks as $f) {
    $child = $canonical($f['TABLE_NAME']);
    $parent = $canonical($f['REFERENCED_TABLE_NAME']);
    $key = $child . $f['CONSTRAINT_NAME'];
    if (isset($seen[$key])) continue;
    $seen[$key] = true;
    $nullable = Db::value('SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [$schema, $f['TABLE_NAME'], $f['COLUMN_NAME']]) === 'YES';
    $out[] = sprintf('    %s %s--o{ %s : "%s"', $parent, $nullable ? '|o' : '||', $child, $f['COLUMN_NAME']);
}

// Entities with their columns.
$byTable = [];
foreach ($columns as $c) {
    if (in_array($c['TABLE_NAME'], $views, true)) continue;
    $byTable[$canonical($c['TABLE_NAME'])][] = $c;
}
foreach (DatabaseController::DOMAINS as $tables) {
    foreach ($tables as $t) {
        if (!isset($byTable[$t])) continue;
        $out[] = "    $t {";
        foreach ($byTable[$t] as $c) {
            $keys = [];
            if ($c['COLUMN_KEY'] === 'PRI') $keys[] = 'PK';
            if (isset($fkCols[$t][$c['COLUMN_NAME']])) $keys[] = 'FK';
            if ($c['COLUMN_KEY'] === 'UNI') $keys[] = 'UK';
            $type = preg_replace('/[^A-Za-z0-9_]/', '_', str_replace([',', ' '], ['_', ''], $c['COLUMN_TYPE']));
            $out[] = sprintf('        %s %s%s', $type, $c['COLUMN_NAME'], $keys ? ' ' . implode(',', $keys) : '');
        }
        $out[] = '    }';
    }
}
$out[] = '```';
file_put_contents(APP_ROOT . '/docs/ER_DIAGRAM.md', implode("\n", $out) . "\n");
echo 'wrote docs/ER_DIAGRAM.md (' . count($byTable) . ' tables, ' . count($seen) . " relationships)\n";
