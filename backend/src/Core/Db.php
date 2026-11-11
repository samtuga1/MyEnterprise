<?php
declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOException;
use PDOStatement;

/**
 * Thin PDO wrapper. Every query uses real server-side prepared statements
 * (emulation off), so user input is never concatenated into SQL.
 *
 * Business operations that change several tables are stored procedures;
 * they own their transactions. Db::transaction() is used only for small
 * multi-statement edits made directly from PHP (for example a product and
 * its category links).
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                Config::get('db.host'),
                Config::get('db.port'),
                Config::get('db.name'),
            );
            try {
                self::$pdo = new PDO($dsn, Config::get('db.user'), Config::get('db.password'), [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    PDO::ATTR_STRINGIFY_FETCHES  => false,
                ]);
            } catch (PDOException $e) {
                throw new HttpError(503, 'database_unavailable',
                    'The store database is not reachable. Start MySQL in XAMPP and import database/myenterprise_full.sql.');
            }
        }
        return self::$pdo;
    }

    public static function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        if (!array_filter($params, static fn ($p) => $p instanceof Blob)) {
            $stmt->execute($params);
            return $stmt;
        }
        // A picture among the parameters: bind each one with its type, the bytes as a LOB.
        foreach (array_values($params) as $i => $p) {
            match (true) {
                $p instanceof Blob => $stmt->bindValue($i + 1, $p->bytes, PDO::PARAM_LOB),
                $p === null        => $stmt->bindValue($i + 1, null, PDO::PARAM_NULL),
                is_int($p)         => $stmt->bindValue($i + 1, $p, PDO::PARAM_INT),
                default            => $stmt->bindValue($i + 1, (string) $p, PDO::PARAM_STR),
            };
        }
        $stmt->execute();
        return $stmt;
    }

    /** @return list<array<string, mixed>> */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function value(string $sql, array $params = []): mixed
    {
        $value = self::run($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    public static function insert(string $sql, array $params = []): int
    {
        self::run($sql, $params);
        return (int) self::pdo()->lastInsertId();
    }

    /**
     * CALL a stored procedure whose last arguments are OUT parameters and
     * return those OUT values by name.
     *   Db::call('sp_ship_order', [$orderId, $adminId, 'UPS'], ['shipments'])
     */
    public static function call(string $procedure, array $in, array $out = []): array
    {
        if (!preg_match('/^sp_[a-z_]+$/', $procedure)) {
            throw new \InvalidArgumentException('Unknown procedure');
        }
        $placeholders = array_fill(0, count($in), '?');
        foreach ($out as $name) {
            $placeholders[] = '@out_' . $name;
        }
        $stmt = self::run('CALL ' . $procedure . '(' . implode(', ', $placeholders) . ')', array_values($in));
        do {
            $stmt->fetchAll();
        } while ($stmt->nextRowset());
        $stmt->closeCursor();
        if (!$out) {
            return [];
        }
        $select = implode(', ', array_map(static fn ($n) => '@out_' . $n . ' AS `' . $n . '`', $out));
        return self::one('SELECT ' . $select) ?? [];
    }

    public static function transaction(callable $work): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $work();
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Turns a database error into an API error people can read.
     *   45000            SIGNAL from a trigger or procedure: its message is already written for people.
     *   23000 / 1062     duplicate key (an e-mail or SKU already in use).
     *   23000 / 1451/2   a row is still referenced, or a reference is missing.
     *   23000 / 4025     a CHECK constraint failed.
     */
    public static function translate(PDOException $e): HttpError
    {
        $state = $e->errorInfo[0] ?? $e->getCode();
        $driverCode = (int) ($e->errorInfo[1] ?? 0);
        $message = (string) ($e->errorInfo[2] ?? $e->getMessage());

        if ($state === '45000') {
            return HttpError::rule($message);
        }
        if ($driverCode === 1062) {
            return HttpError::conflict(self::duplicateMessage($message));
        }
        if ($driverCode === 1451) {
            return HttpError::conflict('This record is still used elsewhere (orders, stock or purchase history), so it cannot be removed. Archive it instead.');
        }
        if ($driverCode === 1452) {
            return HttpError::badRequest('One of the selected records no longer exists.');
        }
        if ($driverCode === 4025 || str_contains($message, 'CONSTRAINT')) {
            preg_match('/CONSTRAINT `([^`]+)`/', $message, $m);
            return new HttpError(422, 'check_failed', 'A value is outside what the database allows' . (isset($m[1]) ? " ({$m[1]})" : '') . '.');
        }
        if ($driverCode === 1205 || $driverCode === 1213) {
            return new HttpError(409, 'busy', 'The store was busy with the same items. Please try again.');
        }
        return new HttpError(500, 'database_error', Config::isDevelopment() ? $message : 'The database could not complete the request.');
    }

    private static function duplicateMessage(string $message): string
    {
        return match (true) {
            str_contains($message, 'uq_customer_email'), str_contains($message, 'uq_admin_email') => 'An account with this email already exists.',
            str_contains($message, 'uq_variant_sku')      => 'Another variant already uses this SKU.',
            str_contains($message, 'uq_variant_option')   => 'This product already has a variant in that size and colour.',
            str_contains($message, 'uq_product_slug')     => 'Another product already uses this web address.',
            str_contains($message, 'uq_category_name'), str_contains($message, 'uq_category_slug') => 'A category with this name already exists.',
            str_contains($message, 'uq_supplier_name')    => 'A supplier with this name already exists.',
            str_contains($message, 'uq_po_variant')       => 'Each variant can appear only once on a purchase order.',
            str_contains($message, 'uq_image_sha')        => 'This picture is already stored: the same file was uploaded before.',
            default => 'This would create a duplicate record.',
        };
    }
}
