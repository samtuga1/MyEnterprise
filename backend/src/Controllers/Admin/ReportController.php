<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Support\QueryFile;

/** The seven business questions, run live with the parameters chosen on screen. */
final class ReportController
{
    public function index(Request $request): array
    {
        $out = [];
        foreach (QueryFile::all() as $key => $file) {
            $q = QueryFile::parse($file);
            unset($q['sql']);
            $out[] = ['key' => $key] + $q;
        }
        return $out;
    }

    public function run(Request $request): array
    {
        $key = $request->param('key');
        $files = QueryFile::all();
        if (!isset($files[$key])) {
            throw HttpError::notFound('No such report.');
        }
        $q = QueryFile::parse($files[$key]);

        // Validate each parameter the query declares, then bind it as a session variable.
        $values = [];
        foreach ($q['defaults'] as $name => $default) {
            $raw = $request->queryString($name, $default === null ? '' : (string) $default);
            $values[$name] = match (true) {
                str_starts_with($name, 'date_') => preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) && strtotime($raw)
                    ? $raw : throw HttpError::badRequest('Use dates like 2026-01-31.', [$name => 'Use YYYY-MM-DD.']),
                $name === 'buffer' => max(0, min(50, (int) $raw)),
                $name === 'only_open' => $raw === '1' ? 1 : 0,
                $name === 'as_of' => null,
                default => throw HttpError::badRequest('Unknown parameter ' . $name),
            };
        }
        if (isset($values['date_from'], $values['date_to']) && $values['date_from'] > $values['date_to']) {
            throw HttpError::badRequest('The start date must be before the end date.', ['date_from' => 'Before the end date.']);
        }
        foreach ($values as $name => $value) {
            Db::run("SET @$name = ?", [$value]);
        }

        $started = microtime(true);
        $stmt = Db::pdo()->query($q['sql']);
        $rows = $stmt->fetchAll();
        $ms = round((microtime(true) - $started) * 1000, 1);
        $columns = [];
        for ($i = 0; $i < $stmt->columnCount(); $i++) {
            $meta = $stmt->getColumnMeta($i);
            $columns[] = ['key' => $meta['name'], 'label' => ucfirst(str_replace('_', ' ', $meta['name'])), 'type' => self::kind($meta['name'], $meta['native_type'] ?? '')];
        }
        return $q + ['key' => $key, 'params' => $values, 'columns' => $columns, 'rows' => $rows, 'rowCount' => count($rows), 'durationMs' => $ms];
    }

    /** How the interface should format a column. */
    private static function kind(string $name, string $native): string
    {
        return match (true) {
            str_ends_with($name, '_pct') => 'percent',
            (bool) preg_match('/revenue|spend|cost|refunded|amount|value|price|gross|net_/', $name) => 'money',
            (bool) preg_match('/(_on|_at|_order|until)$/', $name) && !str_contains($name, 'orders') => 'date',
            in_array($native, ['LONG', 'LONGLONG', 'NEWDECIMAL', 'DOUBLE', 'TINY', 'SHORT', 'INT24'], true) => 'number',
            default => 'text',
        };
    }
}
