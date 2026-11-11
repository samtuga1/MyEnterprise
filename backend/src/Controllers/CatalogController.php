<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Db;
use App\Core\Request;
use App\Services\CatalogService;
use App\Support\Format;

final class CatalogController
{
    /** GET /api/categories — navigation, with live product counts. */
    public function categories(Request $request): array
    {
        return array_map(static fn ($c) => [
            'id' => (int) $c['category_id'],
            'name' => $c['category_name'],
            'slug' => $c['slug'],
            'group' => $c['category_group'],
            'productCount' => (int) $c['products'],
        ], Db::all('SELECT c.*, (SELECT COUNT(*) FROM ProductCategory pc JOIN Product p ON p.product_id = pc.product_id
                                  WHERE pc.category_id = c.category_id AND p.isActive = 1) AS products
                      FROM Category c ORDER BY c.sortOrder, c.category_name'));
    }

    /** GET /api/products?category=&q=&sizes=&colors=&brands=&min=&max=&inStock=&sort=&page= */
    public function index(Request $request): array
    {
        $list = static fn (string $key) => array_values(array_filter(array_map('trim', explode(',', $request->queryString($key))), 'strlen'));
        $category = $request->queryString('category');
        $sort = $request->queryString('sort', 'featured');
        $min = $request->queryString('min');
        $max = $request->queryString('max');
        $result = CatalogService::list([
            'category' => $category,
            'also' => $request->queryString('also'),
            'q' => mb_substr($request->queryString('q'), 0, 80),
            'sizes' => array_slice($list('sizes'), 0, 20),
            'colors' => array_slice($list('colors'), 0, 20),
            'brands' => array_slice($list('brands'), 0, 20),
            'min' => is_numeric($min) ? (float) $min : null,
            'max' => is_numeric($max) ? (float) $max : null,
            'inStock' => $request->queryString('inStock') === '1',
            'sort' => in_array($sort, CatalogService::SORTS, true) ? $sort : 'featured',
            'page' => $request->queryInt('page', 1, 1, 1000),
            'perPage' => $request->queryInt('perPage', 12, 1, 48),
        ]);
        $result['facets'] = CatalogService::facets($category ?: null);
        if ($category) {
            $c = Db::one('SELECT category_name, category_group FROM Category WHERE slug = ?', [$category]);
            $result['category'] = $c ? ['name' => $c['category_name'], 'slug' => $category, 'group' => $c['category_group']] : null;
        }
        if ($also = $request->queryString('also')) {
            $a = Db::one('SELECT category_name FROM Category WHERE slug = ?', [$also]);
            $result['also'] = $a ? ['name' => $a['category_name'], 'slug' => $also] : null;
        }
        return $result;
    }

    /** GET /api/products/{slug} */
    public function show(Request $request): array
    {
        return CatalogService::detail($request->param('slug'));
    }

    /** GET /api/home — the storefront's opening shelves. */
    public function home(Request $request): array
    {
        $newIn = CatalogService::list(['category' => 'new-in', 'sort' => 'new', 'perPage' => 8]);
        $best = CatalogService::list(['sort' => 'featured', 'perPage' => 8]);
        $outerwear = CatalogService::list(['category' => 'outerwear', 'sort' => 'new', 'perPage' => 4]);
        $stats = Db::one("SELECT (SELECT COUNT(*) FROM Product WHERE isActive = 1) AS products,
                                 (SELECT COUNT(DISTINCT brand) FROM Product WHERE isActive = 1) AS brands,
                                 (SELECT COUNT(*) FROM Warehouse) AS warehouses");
        return [
            'newIn' => $newIn['items'],
            'bestsellers' => $best['items'],
            'outerwear' => $outerwear['items'],
            'stats' => array_map([Format::class, 'int'], $stats ?? []),
        ];
    }
}
