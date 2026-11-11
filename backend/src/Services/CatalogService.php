<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpError;
use App\Support\Format;

/** Product listings and product pages for the storefront. */
final class CatalogService
{
    public const SORTS = ['featured', 'new', 'price_asc', 'price_desc', 'name'];

    /**
     * Filtered, sorted, paginated listing.
     * @param array{category?:string,q?:string,sizes?:list<string>,colors?:list<string>,brands?:list<string>,min?:?float,max?:?float,inStock?:bool,sort?:string,page?:int,perPage?:int} $f
     */
    public static function list(array $f, bool $includeInactive = false): array
    {
        $where = [];
        $params = [];
        if (!$includeInactive) {
            $where[] = 'p.isActive = 1';
        }
        if (!empty($f['category'])) {
            $where[] = 'EXISTS (SELECT 1 FROM ProductCategory pc JOIN Category c ON c.category_id = pc.category_id
                                 WHERE pc.product_id = p.product_id AND c.slug = ?)';
            $params[] = $f['category'];
        }
        if (!empty($f['also'])) {
            // A second category the product must also belong to: Women + Dresses.
            $where[] = 'EXISTS (SELECT 1 FROM ProductCategory pc2 JOIN Category c2 ON c2.category_id = pc2.category_id
                                 WHERE pc2.product_id = p.product_id AND c2.slug = ?)';
            $params[] = $f['also'];
        }
        if (!empty($f['q'])) {
            $where[] = '(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ?
                         OR EXISTS (SELECT 1 FROM ProductVariant sv WHERE sv.product_id = p.product_id AND (sv.sku LIKE ? OR sv.color LIKE ?)))';
            $like = Format::like($f['q']);
            array_push($params, $like, $like, $like, $like, $like);
        }
        foreach (['sizes' => 'configuration', 'colors' => 'color'] as $key => $column) {
            if (!empty($f[$key])) {
                $marks = implode(',', array_fill(0, count($f[$key]), '?'));
                $where[] = "EXISTS (SELECT 1 FROM ProductVariant fv WHERE fv.product_id = p.product_id AND fv.isActive = 1 AND fv.$column IN ($marks))";
                array_push($params, ...$f[$key]);
            }
        }
        if (!empty($f['brands'])) {
            $where[] = 'p.brand IN (' . implode(',', array_fill(0, count($f['brands']), '?')) . ')';
            array_push($params, ...$f['brands']);
        }
        if (isset($f['min']) && $f['min'] !== null) {
            $where[] = 'l.min_price >= ?';
            $params[] = $f['min'];
        }
        if (isset($f['max']) && $f['max'] !== null) {
            $where[] = 'l.min_price <= ?';
            $params[] = $f['max'];
        }
        if (!empty($f['inStock'])) {
            $where[] = 'l.available > 0';
        }
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $order = match ($f['sort'] ?? 'featured') {
            'new'        => 'p.createdAt DESC, p.product_id DESC',
            'price_asc'  => 'l.min_price ASC, p.name',
            'price_desc' => 'l.min_price DESC, p.name',
            'name'       => 'p.name ASC',
            default      => 'COALESCE(pop.units, 0) DESC, p.createdAt DESC',
        };

        $from = "FROM Product p
                 JOIN v_product_listing l ON l.product_id = p.product_id
                 LEFT JOIN (SELECT pv.product_id, SUM(oi.quantity) AS units
                              FROM OrderItem oi
                              JOIN CustomerOrder o   ON o.order_id = oi.order_id AND o.status <> 'CANCELLED'
                              JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
                             WHERE o.placedAt >= NOW() - INTERVAL 120 DAY
                             GROUP BY pv.product_id) pop ON pop.product_id = p.product_id
                 $whereSql";

        $perPage = max(1, min(48, (int) ($f['perPage'] ?? 12)));
        $total = (int) Db::value("SELECT COUNT(*) $from", $params);
        $pages = max(1, (int) ceil($total / $perPage));
        $page = max(1, min($pages, (int) ($f['page'] ?? 1)));
        $offset = ($page - 1) * $perPage;

        $rows = Db::all("SELECT p.product_id, p.slug, p.name, p.brand, l.image_key, p.isActive, p.createdAt,
                                l.min_price, l.max_price, l.available, COALESCE(pop.units, 0) AS units_sold
                         $from ORDER BY $order LIMIT $perPage OFFSET $offset", $params);

        return [
            'items' => self::cards($rows),
            'total' => $total,
            'page' => $page,
            'pages' => $pages,
            'perPage' => $perPage,
        ];
    }

    /** Listing cards: price range, colour swatches, stock and "new" badge. */
    public static function cards(array $rows): array
    {
        if (!$rows) {
            return [];
        }
        $ids = array_map(static fn ($r) => (int) $r['product_id'], $rows);
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $swatches = [];
        foreach (Db::all("SELECT pv.product_id, pv.color, MAX(pv.color_hex) AS hex, fn_product_image(pv.product_id, pv.color) AS image,
                                 MIN(pv.sortOrder) AS ord, SUM(vs.available) AS available
                            FROM ProductVariant pv
                            JOIN v_variant_stock vs ON vs.variant_id = pv.variant_id
                           WHERE pv.product_id IN ($marks) AND pv.isActive = 1
                           GROUP BY pv.product_id, pv.color
                           ORDER BY ord", $ids) as $s) {
            $swatches[(int) $s['product_id']][] = [
                'name' => $s['color'], 'hex' => $s['hex'], 'image' => Format::image($s['image']), 'available' => (int) $s['available'],
            ];
        }
        return array_map(static fn ($r) => [
            'id' => (int) $r['product_id'],
            'slug' => $r['slug'],
            'name' => $r['name'],
            'brand' => $r['brand'],
            'image' => Format::image($r['image_key']),
            'minPrice' => Format::money($r['min_price']),
            'maxPrice' => Format::money($r['max_price']),
            'available' => (int) $r['available'],
            'isActive' => Format::bool($r['isActive']),
            'isNew' => strtotime((string) $r['createdAt']) > strtotime('-45 days'),
            'colors' => $swatches[(int) $r['product_id']] ?? [],
        ], $rows);
    }

    /** Sizes, colours, brands and price range on offer in a category, for filter controls. */
    public static function facets(?string $category): array
    {
        $join = '';
        $params = [];
        if ($category) {
            $join = 'JOIN ProductCategory pc ON pc.product_id = p.product_id JOIN Category c ON c.category_id = pc.category_id AND c.slug = ?';
            $params[] = $category;
        }
        $base = "FROM ProductVariant pv JOIN Product p ON p.product_id = pv.product_id AND p.isActive = 1 $join WHERE pv.isActive = 1";
        $sizes = Db::all("SELECT pv.configuration AS size, MIN(pv.sortOrder % 20) AS ord $base GROUP BY pv.configuration ORDER BY ord, size", $params);
        return [
            'sizes' => self::sortSizes(array_column($sizes, 'size')),
            'colors' => array_map(static fn ($c) => ['name' => $c['color'], 'hex' => $c['hex']],
                Db::all("SELECT pv.color, MAX(pv.color_hex) AS hex $base GROUP BY pv.color ORDER BY pv.color", $params)),
            'brands' => array_column(Db::all("SELECT DISTINCT p.brand $base ORDER BY p.brand", $params), 'brand'),
            'price' => (function () use ($base, $params) {
                $r = Db::one("SELECT MIN(pv.price) AS lo, MAX(pv.price) AS hi $base", $params);
                return ['min' => Format::money($r['lo'] ?? 0), 'max' => Format::money($r['hi'] ?? 0)];
            })(),
        ];
    }

    /** XS, S, M, L … then waist sizes, shoe sizes, belt lengths, one size. */
    public static function sortSizes(array $sizes): array
    {
        $letters = ['XS' => 1, 'S' => 2, 'M' => 3, 'L' => 4, 'XL' => 5, 'XXL' => 6];
        usort($sizes, static function ($a, $b) use ($letters) {
            $rank = static function (string $s) use ($letters): array {
                if (isset($letters[$s])) return [0, $letters[$s]];
                if (preg_match('/^W(\d+)/', $s, $m)) return [1, (int) $m[1]];
                if (preg_match('/^EU (\d+)/', $s, $m)) return [2, (int) $m[1]];
                if (preg_match('/^(\d+) cm$/', $s, $m)) return [3, (int) $m[1]];
                return [4, 0];
            };
            return $rank($a) <=> $rank($b) ?: strcmp($a, $b);
        });
        return array_values(array_unique($sizes));
    }

    /** Everything the product page needs, in one response. */
    public static function detail(string $slug, bool $includeInactive = false): array
    {
        $p = Db::one('SELECT * FROM Product WHERE slug = ?' . ($includeInactive ? '' : ' AND isActive = 1'), [$slug]);
        if (!$p) {
            throw HttpError::notFound('This product is no longer available.');
        }
        $id = (int) $p['product_id'];

        $variants = Db::all('SELECT pv.*, vs.available
                               FROM ProductVariant pv
                               JOIN v_variant_stock vs ON vs.variant_id = pv.variant_id
                              WHERE pv.product_id = ? AND pv.isActive = 1
                              ORDER BY pv.sortOrder', [$id]);
        $variantIds = array_map(static fn ($v) => (int) $v['variant_id'], $variants);
        $specs = [];
        if ($variantIds) {
            $marks = implode(',', array_fill(0, count($variantIds), '?'));
            foreach (Db::all("SELECT variant_id, spec_name, spec_value, unit FROM ProductSpecification
                               WHERE variant_id IN ($marks) ORDER BY specification_id", $variantIds) as $s) {
                $specs[(int) $s['variant_id']][] = ['name' => $s['spec_name'], 'value' => $s['spec_value'], 'unit' => $s['unit']];
            }
        }

        // Pictures of each colour (its own first, then those made for every colour).
        // Only the metadata is read here; the bytes are sent by GET /api/images/{key}.
        $pictures = Db::all('SELECT color, sha256, width, height, alt_text FROM ProductImage
                              WHERE product_id = ? ORDER BY sortOrder, image_id', [$id]);
        $picturesOf = static function (?string $color) use ($pictures): array {
            $own = array_filter($pictures, static fn ($i) => $i['color'] !== null && strcasecmp($i['color'], (string) $color) === 0);
            $shared = array_filter($pictures, static fn ($i) => $i['color'] === null);
            return array_values(array_map(static fn ($i) => [
                'src' => Format::image($i['sha256']), 'alt' => $i['alt_text'], 'width' => (int) $i['width'], 'height' => (int) $i['height'],
            ], [...$own, ...$shared]));
        };

        $colors = [];
        foreach ($variants as $v) {
            if (!isset($colors[$v['color']])) {
                $images = $picturesOf($v['color']);
                $colors[$v['color']] = ['name' => $v['color'], 'hex' => $v['color_hex'], 'image' => $images[0]['src'] ?? null, 'images' => $images, 'available' => 0];
            }
            $colors[$v['color']]['available'] += (int) $v['available'];
        }
        $mainImage = Format::image(Db::value('SELECT fn_product_image(?, NULL)', [$id]));

        $warranty = $variantIds ? Db::one('SELECT duration_months, coverage FROM Warranty WHERE variant_id = ? ORDER BY warranty_id LIMIT 1', [$variantIds[0]]) : null;

        $styleWith = Db::all("SELECT DISTINCT tp.slug, tp.name, tp.brand, tv.color, tv.color_hex,
                                     fn_product_image(tv.product_id, tv.color) AS image_key, tv.price,
                                     cr.compatibility_type
                                FROM CompatibilityRule cr
                                JOIN ProductVariant sv ON sv.variant_id = cr.source_variant_id
                                JOIN ProductVariant tv ON tv.variant_id = cr.target_variant_id
                                JOIN Product tp        ON tp.product_id = tv.product_id AND tp.isActive = 1
                               WHERE sv.product_id = ?
                               LIMIT 6", [$id]);

        $categories = Db::all('SELECT c.category_name AS name, c.slug, c.category_group AS `group`
                                 FROM ProductCategory pc JOIN Category c ON c.category_id = pc.category_id
                                WHERE pc.product_id = ? ORDER BY c.sortOrder', [$id]);

        $first = $specs[$variantIds[0] ?? 0] ?? [];
        $detail = static function (string $name) use ($first): ?string {
            foreach ($first as $s) {
                if ($s['name'] === $name) return $s['value'];
            }
            return null;
        };

        return [
            'id' => $id,
            'slug' => $p['slug'],
            'name' => $p['name'],
            'brand' => $p['brand'],
            'description' => $p['description'],
            'image' => $mainImage,
            'isActive' => Format::bool($p['isActive']),
            'isNew' => strtotime((string) $p['createdAt']) > strtotime('-45 days'),
            'categories' => $categories,
            'material' => $detail('Material'),
            'care' => $detail('Care'),
            'fit' => $detail('Fit'),
            'sizes' => self::sortSizes(array_values(array_unique(array_column($variants, 'configuration')))),
            'colors' => array_values($colors),
            'variants' => array_map(static fn ($v) => [
                'id' => (int) $v['variant_id'],
                'sku' => $v['sku'],
                'size' => $v['configuration'],
                'color' => $v['color'],
                'colorHex' => $v['color_hex'],
                'image' => $colors[$v['color']]['image'] ?? $mainImage,
                'price' => Format::money($v['price']),
                'available' => (int) $v['available'],
                'specs' => $specs[(int) $v['variant_id']] ?? [],
            ], $variants),
            'warranty' => $warranty ? ['months' => (int) $warranty['duration_months'], 'coverage' => $warranty['coverage']] : null,
            'styleWith' => array_map(static fn ($s) => [
                'slug' => $s['slug'], 'name' => $s['name'], 'brand' => $s['brand'], 'color' => $s['color'],
                'colorHex' => $s['color_hex'], 'image' => Format::image($s['image_key']), 'price' => Format::money($s['price']),
                'type' => $s['compatibility_type'],
            ], $styleWith),
        ];
    }
}
