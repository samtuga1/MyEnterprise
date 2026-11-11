<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Reads one business query from database/queries/qN_*.sql.
 *
 * The same file is run by hand in phpMyAdmin and by this API, so the SQL in
 * the paper, the database and the web page can never drift apart. Layout:
 *   -- header comment (title, Business question, Definitions, Tables, Techniques)
 *   SET @param = default;   … one line per parameter
 *   -- @query
 *   SELECT …;
 */
final class QueryFile
{
    public static function dir(): string
    {
        return APP_ROOT . '/database/queries';
    }

    /** @return array<string, string> key => file path, e.g. 'q1' => .../q1_category_revenue.sql */
    public static function all(): array
    {
        $out = [];
        foreach (glob(self::dir() . '/q*_*.sql') ?: [] as $file) {
            if (preg_match('/^(q\d+)_/', basename($file), $m)) {
                $out[$m[1]] = $file;
            }
        }
        ksort($out, SORT_NATURAL);
        return $out;
    }

    public static function parse(string $file): array
    {
        $text = str_replace("\r\n", "\n", (string) file_get_contents($file));
        [$head, $sql] = array_pad(explode("-- @query\n", $text, 2), 2, '');
        $comment = [];
        foreach (explode("\n", $head) as $line) {
            if (str_starts_with($line, '--') && !preg_match('/^-- ?[=\-]{5,}/', $line)) {
                $comment[] = preg_replace('/^-- ?/', '', $line);
            }
        }
        $sections = ['intro' => []];
        $current = 'intro';
        foreach ($comment as $line) {
            if (preg_match('/^(Business question|Definitions)\s*$/', trim($line), $m)) {
                $current = $m[1];
                $sections[$current] = [];
                continue;
            }
            if (preg_match('/^(Tables|Techniques)\b/', trim($line), $m)) {
                $current = $m[1];
                $sections[$current] = [trim($line)];
                continue;
            }
            $sections[$current][] = trim($line);
        }
        $join = static fn (array $lines) => trim(preg_replace('/\s+/', ' ', implode(' ', $lines)) ?? '');

        preg_match('/^(Q\d+)\s*·\s*(.+)$/m', implode("\n", $sections['intro']), $t);
        preg_match_all('/^SET @([a-z_]+)\s*=\s*(.+?);/m', $head, $p, PREG_SET_ORDER);
        $params = [];
        foreach ($p as [, $name, $default]) {
            $default = trim($default);
            $params[$name] = strcasecmp($default, 'NULL') === 0 ? null : trim($default, "'");
        }
        return [
            'code' => $t[1] ?? '',
            'title' => trim($t[2] ?? basename($file)),
            'question' => $join($sections['Business question'] ?? []),
            'definitions' => $join($sections['Definitions'] ?? []),
            'tables' => $join(array_map(static fn ($l) => preg_replace('/^Tables\s*/', '', $l), $sections['Tables'] ?? [])),
            'techniques' => $join(array_map(static fn ($l) => preg_replace('/^Techniques:\s*/', '', $l), $sections['Techniques'] ?? [])),
            'defaults' => $params,
            'sql' => rtrim(trim($sql), ';'),
            'file' => 'database/queries/' . basename($file),
        ];
    }
}
