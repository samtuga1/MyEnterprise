<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Config;
use App\Core\Db;
use App\Core\Request;

/**
 * Database explorer: the live schema, read from information_schema — tables,
 * keys, CHECK constraints, triggers, routines and views — plus the invariant
 * checks of database/08_verify_invariants.sql. Read-only.
 */
final class DatabaseController
{
    /** The 30 tables of the design, grouped as in the diagrams, plus the added ProductImage. */
    public const DOMAINS = [
        'Core' => ['Customer', 'Admin'],
        'Catalog' => ['Product', 'Category', 'ProductCategory', 'ProductVariant', 'ProductSpecification', 'CompatibilityRule', 'ProductImage'],
        'Orders' => ['Cart', 'CartItem', 'CustomerOrder', 'OrderItem'],
        'Inventory' => ['Warehouse', 'Inventory', 'StockMovement'],
        'Procurement' => ['Supplier', 'SupplierProduct', 'PurchaseOrder', 'PurchaseOrderItem'],
        'Finance' => ['Payment', 'Transaction'],
        'Fulfillment' => ['Fulfillment', 'OrderAllocation', 'Shipment', 'OrderCancellation'],
        'After-sales' => ['ReturnRequest', 'ReturnItem', 'Refund', 'Warranty', 'WarrantyClaim'],
    ];

    private static function canonical(string $name): string
    {
        foreach (self::DOMAINS as $tables) {
            foreach ($tables as $t) {
                if (strcasecmp($t, $name) === 0) return $t;
            }
        }
        return $name;
    }

    public function overview(Request $request): array
    {
        $schema = Config::get('db.name');
        $columns = Db::all('SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
                              FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION', [$schema]);
        $keys = Db::all('SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
                                tc.CONSTRAINT_TYPE, rc.DELETE_RULE, rc.UPDATE_RULE
                           FROM information_schema.KEY_COLUMN_USAGE k
                           JOIN information_schema.TABLE_CONSTRAINTS tc
                             ON tc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND tc.TABLE_NAME = k.TABLE_NAME AND tc.CONSTRAINT_NAME = k.CONSTRAINT_NAME
                           LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                             ON rc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND rc.TABLE_NAME = k.TABLE_NAME
                          WHERE k.TABLE_SCHEMA = ? ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION', [$schema]);
        $checks = Db::all('SELECT TABLE_NAME, CONSTRAINT_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS
                            WHERE CONSTRAINT_SCHEMA = ? ORDER BY TABLE_NAME, CONSTRAINT_NAME', [$schema]);
        $tables = Db::all("SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME", [$schema]);

        $byTable = [];
        foreach ($tables as $t) {
            if ($t['TABLE_TYPE'] !== 'BASE TABLE') continue;
            $name = self::canonical($t['TABLE_NAME']);
            $byTable[$name] = [
                'name' => $name,
                'engine' => $t['ENGINE'],
                'comment' => $t['TABLE_COMMENT'],
                'rows' => (int) Db::value('SELECT COUNT(*) FROM `' . str_replace('`', '', $t['TABLE_NAME']) . '`'),
                'columns' => [], 'primaryKey' => [], 'foreignKeys' => [], 'unique' => [], 'checks' => [],
            ];
        }
        foreach ($columns as $c) {
            $name = self::canonical($c['TABLE_NAME']);
            if (!isset($byTable[$name])) continue;
            $byTable[$name]['columns'][] = [
                'name' => $c['COLUMN_NAME'], 'type' => $c['COLUMN_TYPE'], 'nullable' => $c['IS_NULLABLE'] === 'YES',
                'key' => $c['COLUMN_KEY'], 'default' => $c['COLUMN_DEFAULT'], 'extra' => $c['EXTRA'],
            ];
        }
        $fk = [];
        foreach ($keys as $k) {
            $name = self::canonical($k['TABLE_NAME']);
            if (!isset($byTable[$name])) continue;
            if ($k['CONSTRAINT_TYPE'] === 'PRIMARY KEY') {
                $byTable[$name]['primaryKey'][] = $k['COLUMN_NAME'];
            } elseif ($k['CONSTRAINT_TYPE'] === 'UNIQUE') {
                $byTable[$name]['unique'][$k['CONSTRAINT_NAME']][] = $k['COLUMN_NAME'];
            } elseif ($k['CONSTRAINT_TYPE'] === 'FOREIGN KEY') {
                $fk[$name][$k['CONSTRAINT_NAME']] ??= ['name' => $k['CONSTRAINT_NAME'], 'columns' => [], 'references' => self::canonical((string) $k['REFERENCED_TABLE_NAME']),
                    'referencedColumns' => [], 'onDelete' => $k['DELETE_RULE'], 'onUpdate' => $k['UPDATE_RULE']];
                $fk[$name][$k['CONSTRAINT_NAME']]['columns'][] = $k['COLUMN_NAME'];
                $fk[$name][$k['CONSTRAINT_NAME']]['referencedColumns'][] = $k['REFERENCED_COLUMN_NAME'];
            }
        }
        foreach ($fk as $name => $list) {
            $byTable[$name]['foreignKeys'] = array_values($list);
        }
        foreach ($byTable as &$t) {
            $t['unique'] = array_map(static fn ($cols, $n) => ['name' => $n, 'columns' => $cols], $t['unique'], array_keys($t['unique']));
        }
        unset($t);
        foreach ($checks as $c) {
            $name = self::canonical($c['TABLE_NAME']);
            if (isset($byTable[$name])) {
                $byTable[$name]['checks'][] = ['name' => $c['CONSTRAINT_NAME'], 'clause' => $c['CHECK_CLAUSE']];
            }
        }

        $domains = [];
        foreach (self::DOMAINS as $domain => $list) {
            $domains[] = ['name' => $domain, 'tables' => array_values(array_filter(array_map(static fn ($n) => $byTable[$n] ?? null, $list)))];
        }

        $routines = Db::all('SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_COMMENT, ROUTINE_DEFINITION, DTD_IDENTIFIER, CREATED
                               FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_TYPE, ROUTINE_NAME', [$schema]);
        $parameters = Db::all('SELECT SPECIFIC_NAME, PARAMETER_MODE, PARAMETER_NAME, DTD_IDENTIFIER FROM information_schema.PARAMETERS
                                WHERE SPECIFIC_SCHEMA = ? AND PARAMETER_NAME IS NOT NULL ORDER BY SPECIFIC_NAME, ORDINAL_POSITION', [$schema]);
        $triggers = Db::all('SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, EVENT_OBJECT_TABLE, ACTION_STATEMENT
                               FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, TRIGGER_NAME', [$schema]);
        $views = Db::all('SELECT TABLE_NAME, VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [$schema]);

        return [
            'engine' => Db::value('SELECT VERSION()'),
            'database' => $schema,
            'domains' => $domains,
            'totals' => [
                'tables' => count($byTable),
                'rows' => array_sum(array_column($byTable, 'rows')),
                'foreignKeys' => array_sum(array_map(static fn ($t) => count($t['foreignKeys']), $byTable)),
                'checks' => count($checks),
                'triggers' => count($triggers),
                'procedures' => count(array_filter($routines, static fn ($r) => $r['ROUTINE_TYPE'] === 'PROCEDURE')),
                'functions' => count(array_filter($routines, static fn ($r) => $r['ROUTINE_TYPE'] === 'FUNCTION')),
                'views' => count($views),
                'cursors' => array_sum(array_map(static fn ($r) => substr_count(strtoupper((string) $r['ROUTINE_DEFINITION']), 'CURSOR FOR'), $routines)),
            ],
            'routines' => array_map(static fn ($r) => [
                'name' => $r['ROUTINE_NAME'], 'type' => $r['ROUTINE_TYPE'], 'comment' => $r['ROUTINE_COMMENT'], 'returns' => $r['DTD_IDENTIFIER'],
                'cursors' => substr_count(strtoupper((string) $r['ROUTINE_DEFINITION']), 'CURSOR FOR'),
                'parameters' => array_values(array_map(static fn ($p) => ['mode' => $p['PARAMETER_MODE'], 'name' => $p['PARAMETER_NAME'], 'type' => $p['DTD_IDENTIFIER']],
                    array_filter($parameters, static fn ($p) => $p['SPECIFIC_NAME'] === $r['ROUTINE_NAME']))),
                'definition' => $r['ROUTINE_DEFINITION'],
            ], $routines),
            'triggers' => array_map(static fn ($t) => [
                'name' => $t['TRIGGER_NAME'], 'timing' => $t['ACTION_TIMING'], 'event' => $t['EVENT_MANIPULATION'],
                'table' => self::canonical($t['EVENT_OBJECT_TABLE']), 'definition' => $t['ACTION_STATEMENT'],
            ], $triggers),
            'views' => array_map(static fn ($v) => ['name' => $v['TABLE_NAME'], 'definition' => $v['VIEW_DEFINITION']], $views),
        ];
    }

    /** Runs database/08_verify_invariants.sql and returns one row per rule. */
    public function invariants(Request $request): array
    {
        $sql = (string) file_get_contents(APP_ROOT . '/database/08_verify_invariants.sql');
        $sql = trim(preg_replace('/^USE\s+\w+;\s*$/m', '', preg_replace('/^\s*--.*$/m', '', $sql) ?? '') ?? '');
        $started = microtime(true);
        $rows = Db::pdo()->query(rtrim($sql, ';'))->fetchAll();
        return [
            'durationMs' => round((microtime(true) - $started) * 1000, 1),
            'checks' => array_map(static fn ($r) => ['rule' => $r['invariant'], 'violations' => (int) $r['violations'], 'ok' => $r['result'] === 'OK'], $rows),
        ];
    }
}
