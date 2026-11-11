<?php
declare(strict_types=1);

namespace App\Support;

/** Shapes database values for JSON: money as "58.00" strings, ISO-like dates. */
final class Format
{
    public static function money(mixed $value): string
    {
        return number_format((float) ($value ?? 0), 2, '.', '');
    }

    public static function date(?string $value): ?string
    {
        return $value === null ? null : str_replace(' ', 'T', $value);
    }

    public static function int(mixed $value): int
    {
        return (int) ($value ?? 0);
    }

    public static function bool(mixed $value): bool
    {
        return (bool) (int) $value;
    }

    /** "LEATHER_CHELSEA" → "Leather chelsea" for status labels. */
    public static function label(string $code): string
    {
        return ucfirst(strtolower(str_replace('_', ' ', $code)));
    }

    public static function slug(string $text): string
    {
        $text = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text) ?: $text;
        $text = strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $text) ?? '', '-'));
        return $text !== '' ? $text : 'item';
    }

    /**
     * Web address of a stored picture, relative to the site folder. The key is
     * ProductImage.sha256 (see fn_product_image); NULL = no picture yet.
     */
    public static function image(?string $key): ?string
    {
        return $key ? 'api/images/' . $key : null;
    }

    /** LIKE pattern with %, _ and \ escaped, so a search for "50%" means 50%. */
    public static function like(string $text): string
    {
        return '%' . addcslashes($text, '%_\\') . '%';
    }
}
