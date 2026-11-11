<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Blob;
use App\Core\Config;
use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Session;
use App\Core\Validator;
use App\Services\CatalogService;
use App\Services\ImageService;
use App\Support\Format;

/** Products, variants (size × colour), pictures, specifications, guarantees and categories. */
final class ProductController
{
    public function index(Request $request): array
    {
        $where = [];
        $params = [];
        if ($q = $request->queryString('q')) {
            $where[] = '(p.name LIKE ? OR p.brand LIKE ? OR EXISTS (SELECT 1 FROM ProductVariant v WHERE v.product_id = p.product_id AND v.sku LIKE ?))';
            array_push($params, Format::like($q), Format::like($q), Format::like($q));
        }
        $status = $request->queryString('status');
        if ($status === 'active' || $status === 'archived') {
            $where[] = 'p.isActive = ?';
            $params[] = $status === 'active' ? 1 : 0;
        }
        if ($cat = $request->queryString('category')) {
            $where[] = 'EXISTS (SELECT 1 FROM ProductCategory pc JOIN Category c ON c.category_id = pc.category_id WHERE pc.product_id = p.product_id AND c.slug = ?)';
            $params[] = $cat;
        }
        $rows = Db::all('SELECT p.product_id, p.slug, p.name, p.brand, l.image_key, p.isActive, p.createdAt,
                                l.min_price, l.max_price, l.variant_count, l.color_count, l.available,
                                (SELECT GROUP_CONCAT(c.category_name ORDER BY c.sortOrder SEPARATOR \', \')
                                   FROM ProductCategory pc JOIN Category c ON c.category_id = pc.category_id
                                  WHERE pc.product_id = p.product_id AND c.category_group = \'TYPE\') AS type_name,
                                (SELECT COALESCE(SUM(oi.quantity), 0) FROM OrderItem oi JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
                                   JOIN CustomerOrder o ON o.order_id = oi.order_id AND o.status <> \'CANCELLED\'
                                  WHERE pv.product_id = p.product_id) AS units_sold
                           FROM Product p JOIN v_product_listing l ON l.product_id = p.product_id '
            . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY p.isActive DESC, p.name', $params);
        return array_map(static fn ($r) => [
            'id' => (int) $r['product_id'],
            'slug' => $r['slug'],
            'name' => $r['name'],
            'brand' => $r['brand'],
            'image' => Format::image($r['image_key']),
            'isActive' => Format::bool($r['isActive']),
            'type' => $r['type_name'],
            'minPrice' => Format::money($r['min_price']),
            'maxPrice' => Format::money($r['max_price']),
            'variants' => (int) $r['variant_count'],
            'colors' => (int) $r['color_count'],
            'available' => (int) $r['available'],
            'unitsSold' => (int) $r['units_sold'],
            'createdAt' => Format::date($r['createdAt']),
        ], $rows);
    }

    public function show(Request $request): array
    {
        $id = $request->intParam('id');
        $p = Db::one('SELECT p.*, a.fullName AS manager FROM Product p JOIN Admin a ON a.admin_id = p.admin_id WHERE p.product_id = ?', [$id]);
        if (!$p) {
            throw HttpError::notFound('Product not found.');
        }
        $variants = Db::all('SELECT pv.*, vs.on_hand, vs.reserved, vs.available, fn_product_image(pv.product_id, pv.color) AS image_key,
                                    (SELECT w.warranty_id FROM Warranty w WHERE w.variant_id = pv.variant_id ORDER BY w.warranty_id LIMIT 1) AS warranty_id,
                                    (SELECT w.duration_months FROM Warranty w WHERE w.variant_id = pv.variant_id ORDER BY w.warranty_id LIMIT 1) AS warranty_months,
                                    (SELECT COUNT(*) FROM OrderItem oi WHERE oi.variant_id = pv.variant_id) AS order_lines
                               FROM ProductVariant pv JOIN v_variant_stock vs ON vs.variant_id = pv.variant_id
                              WHERE pv.product_id = ? ORDER BY pv.sortOrder, pv.variant_id', [$id]);
        $specs = [];
        $stock = [];
        if ($variants) {
            $ids = array_map(static fn ($v) => (int) $v['variant_id'], $variants);
            $marks = implode(',', array_fill(0, count($ids), '?'));
            foreach (Db::all("SELECT * FROM ProductSpecification WHERE variant_id IN ($marks) ORDER BY specification_id", $ids) as $s) {
                $specs[(int) $s['variant_id']][] = ['id' => (int) $s['specification_id'], 'name' => $s['spec_name'], 'value' => $s['spec_value'], 'unit' => $s['unit']];
            }
            foreach (Db::all("SELECT i.*, w.name FROM Inventory i JOIN Warehouse w ON w.warehouse_id = i.warehouse_id WHERE i.variant_id IN ($marks) ORDER BY i.warehouse_id", $ids) as $s) {
                $stock[(int) $s['variant_id']][] = ['warehouseId' => (int) $s['warehouse_id'], 'warehouse' => $s['name'],
                    'onHand' => (int) $s['quantity_on_hand'], 'reserved' => (int) $s['quantity_reserved'], 'reorderLevel' => (int) $s['reorder_level']];
            }
        }
        // Picture metadata only: the bytes stay in the database until GET /api/images/{key}.
        $images = Db::all('SELECT i.image_id, i.color, i.sortOrder, i.mime_type, i.width, i.height, i.byte_size, i.sha256,
                                  i.alt_text, i.credit, i.createdAt, a.fullName AS uploaded_by
                             FROM ProductImage i LEFT JOIN Admin a ON a.admin_id = i.uploadedBy
                            WHERE i.product_id = ? ORDER BY i.color IS NULL, i.color, i.sortOrder, i.image_id', [$id]);
        $coverage = $variants ? Db::value('SELECT coverage FROM Warranty WHERE variant_id = ? ORDER BY warranty_id LIMIT 1', [$variants[0]['variant_id']]) : null;
        return [
            'id' => $id,
            'slug' => $p['slug'],
            'name' => $p['name'],
            'brand' => $p['brand'],
            'description' => $p['description'],
            'image' => Format::image(Db::value('SELECT fn_product_image(?, NULL)', [$id])),
            'isActive' => Format::bool($p['isActive']),
            'manager' => $p['manager'],
            'createdAt' => Format::date($p['createdAt']),
            'categoryIds' => array_map('intval', array_column(Db::all('SELECT category_id FROM ProductCategory WHERE product_id = ?', [$id]), 'category_id')),
            'warrantyCoverage' => $coverage,
            'variants' => array_map(static fn ($v) => [
                'id' => (int) $v['variant_id'],
                'sku' => $v['sku'],
                'size' => $v['configuration'],
                'color' => $v['color'],
                'colorHex' => $v['color_hex'],
                'image' => Format::image($v['image_key']),
                'price' => Format::money($v['price']),
                'isActive' => Format::bool($v['isActive']),
                'onHand' => (int) $v['on_hand'],
                'reserved' => (int) $v['reserved'],
                'available' => (int) $v['available'],
                'warrantyMonths' => $v['warranty_months'] !== null ? (int) $v['warranty_months'] : null,
                'orderLines' => (int) $v['order_lines'],
                'specs' => $specs[(int) $v['variant_id']] ?? [],
                'stock' => $stock[(int) $v['variant_id']] ?? [],
            ], $variants),
            'images' => array_map(static fn ($i) => [
                'id' => (int) $i['image_id'],
                'src' => Format::image($i['sha256']),
                'color' => $i['color'],
                'isMain' => (int) $i['sortOrder'] === 0,
                'type' => $i['mime_type'] === 'image/svg+xml' ? 'Drawing' : strtoupper(substr($i['mime_type'], 6)),
                'width' => (int) $i['width'],
                'height' => (int) $i['height'],
                'bytes' => (int) $i['byte_size'],
                'sha256' => $i['sha256'],
                'alt' => $i['alt_text'],
                'credit' => $i['credit'],
                'uploadedBy' => $i['uploaded_by'],
                'createdAt' => Format::date($i['createdAt']),
            ], $images),
            'styleWith' => array_map(static fn ($r) => [
                'id' => (int) $r['rule_id'], 'type' => $r['compatibility_type'],
                'source' => $r['source'], 'target' => $r['target'], 'targetSlug' => $r['slug'],
            ], Db::all("SELECT cr.rule_id, cr.compatibility_type,
                               CONCAT(sv.configuration, ' · ', sv.color) AS source,
                               CONCAT(tp.name, ' — ', tv.color) AS target, tp.slug
                          FROM CompatibilityRule cr
                          JOIN ProductVariant sv ON sv.variant_id = cr.source_variant_id
                          JOIN ProductVariant tv ON tv.variant_id = cr.target_variant_id
                          JOIN Product tp ON tp.product_id = tv.product_id
                         WHERE sv.product_id = ?", [$id])),
        ];
    }

    private function productInput(Request $request, bool $partial): array
    {
        $v = new Validator($request->body());
        $out = [];
        if (!$partial || $request->input('name') !== null) $out['name'] = $v->string('name', 'a product name', 2, 100);
        if (!$partial || $request->input('brand') !== null) $out['brand'] = $v->string('brand', 'a brand', 2, 80);
        if (!$partial || $request->input('description') !== null) $out['description'] = $v->string('description', 'a description', 10, 2000);
        if ($request->input('isActive') !== null) $out['isActive'] = $v->bool('isActive') ? 1 : 0;
        $categoryIds = $request->input('categoryIds');
        if ($categoryIds !== null) {
            if (!is_array($categoryIds) || !$categoryIds) {
                $v->fail('categoryIds', 'Choose at least one category.');
            } else {
                $out['categoryIds'] = array_values(array_unique(array_map('intval', $categoryIds)));
            }
        } elseif (!$partial) {
            $v->fail('categoryIds', 'Choose at least one category.');
        }
        $v->done();
        return $out;
    }

    private function saveCategories(int $productId, array $categoryIds): void
    {
        Db::run('DELETE FROM ProductCategory WHERE product_id = ?', [$productId]);
        foreach ($categoryIds as $cid) {
            Db::run('INSERT INTO ProductCategory (product_id, category_id) VALUES (?, ?)', [$productId, $cid]);
        }
    }

    public function create(Request $request): array
    {
        $in = $this->productInput($request, false);
        $id = Db::transaction(function () use ($in) {
            $slug = Format::slug($in['name']);
            if (Db::value('SELECT 1 FROM Product WHERE slug = ?', [$slug])) {
                $slug .= '-' . substr(bin2hex(random_bytes(3)), 0, 4);
            }
            $id = Db::insert('INSERT INTO Product (admin_id, name, brand, description, isActive, slug) VALUES (?, ?, ?, ?, ?, ?)',
                [Session::adminId(), $in['name'], $in['brand'], $in['description'], $in['isActive'] ?? 1, $slug]);
            $this->saveCategories($id, $in['categoryIds']);
            return $id;
        });
        $request->params['id'] = (string) $id;
        return $this->show($request) + ['created' => true];
    }

    public function update(Request $request): array
    {
        $id = $request->intParam('id');
        $in = $this->productInput($request, true);
        Db::transaction(function () use ($id, $in) {
            $sets = [];
            $params = [];
            foreach (['name', 'brand', 'description', 'isActive'] as $f) {
                if (array_key_exists($f, $in)) {
                    $sets[] = "$f = ?";
                    $params[] = $in[$f];
                }
            }
            if ($sets) {
                $params[] = $id;
                Db::run('UPDATE Product SET ' . implode(', ', $sets) . ' WHERE product_id = ?', $params);
            }
            if (isset($in['categoryIds'])) {
                $this->saveCategories($id, $in['categoryIds']);
            }
        });
        return $this->show($request);
    }

    /** POST /products/{id}/variants — a new size/colour; copies fabric/care and guarantee from a sibling. */
    public function createVariant(Request $request): array
    {
        $productId = $request->intParam('id');
        $v = new Validator($request->body());
        $size = $v->string('size', 'a size', 1, 40);
        $color = $v->string('color', 'a colour', 2, 50);
        $price = $v->money('price', 'a price');
        $hex = $request->input('colorHex');
        if ($hex !== null && $hex !== '' && !preg_match('/^#[0-9A-Fa-f]{6}$/', (string) $hex)) {
            $v->fail('colorHex', 'Use a colour like #9CAF88.');
        }
        $v->done();

        $brandCode = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', (string) Db::value('SELECT brand FROM Product WHERE product_id = ?', [$productId])), 0, 2));
        $sku = sprintf('%s-%03d-%s-%s', $brandCode ?: 'ME', $productId, strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $color), 0, 3)),
            strtoupper(preg_replace('/[^A-Za-z0-9]/', '', str_replace(['EU ', ' cm', 'One size'], ['', '', 'OS'], $size))));

        $id = Db::transaction(function () use ($productId, $size, $color, $price, $hex, $sku) {
            // A new size of an existing colour shows that colour's pictures automatically (ProductImage is per colour).
            $sibling = Db::one('SELECT variant_id, sortOrder FROM ProductVariant WHERE product_id = ? AND color = ? ORDER BY sortOrder DESC LIMIT 1', [$productId, $color])
                ?? Db::one('SELECT variant_id, MAX(sortOrder) AS sortOrder FROM ProductVariant WHERE product_id = ?', [$productId]);
            $id = Db::insert('INSERT INTO ProductVariant (product_id, sku, configuration, color, price, color_hex, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$productId, $sku, $size, $color, $price, $hex ?: null, (int) ($sibling['sortOrder'] ?? 0) + 1]);
            if (!empty($sibling['variant_id'])) {
                Db::run('INSERT INTO ProductSpecification (variant_id, spec_name, spec_value, unit)
                         SELECT ?, spec_name, spec_value, unit FROM ProductSpecification
                          WHERE variant_id = ? AND spec_name IN (\'Material\', \'Care\', \'Fit\')', [$id, $sibling['variant_id']]);
                Db::run('INSERT INTO Warranty (variant_id, duration_months, coverage)
                         SELECT ?, duration_months, coverage FROM Warranty WHERE variant_id = ? ORDER BY warranty_id LIMIT 1', [$id, $sibling['variant_id']]);
            }
            return $id;
        });
        $request->params['id'] = (string) $productId;
        return $this->show($request) + ['created' => true, 'variantId' => $id];
    }

    public function updateVariant(Request $request): array
    {
        $variantId = $request->intParam('id');
        $productId = (int) Db::value('SELECT product_id FROM ProductVariant WHERE variant_id = ?', [$variantId]);
        if (!$productId) {
            throw HttpError::notFound('Variant not found.');
        }
        $v = new Validator($request->body());
        $sets = [];
        $params = [];
        if ($request->input('price') !== null) { $sets[] = 'price = ?'; $params[] = $v->money('price', 'a price'); }
        if ($request->input('size') !== null) { $sets[] = 'configuration = ?'; $params[] = $v->string('size', 'a size', 1, 40); }
        if ($request->input('color') !== null) { $sets[] = 'color = ?'; $params[] = $v->string('color', 'a colour', 2, 50); }
        if ($request->input('colorHex') !== null) {
            $hex = (string) $request->input('colorHex');
            if ($hex !== '' && !preg_match('/^#[0-9A-Fa-f]{6}$/', $hex)) $v->fail('colorHex', 'Use a colour like #9CAF88.');
            $sets[] = 'color_hex = ?'; $params[] = $hex ?: null;
        }
        if ($request->input('isActive') !== null) { $sets[] = 'isActive = ?'; $params[] = $v->bool('isActive') ? 1 : 0; }
        $months = $request->input('warrantyMonths') !== null ? $v->int('warrantyMonths', 1, 60, 'guarantee months') : null;
        $v->done();
        Db::transaction(function () use ($sets, $params, $variantId, $months) {
            if ($sets) {
                Db::run('UPDATE ProductVariant SET ' . implode(', ', $sets) . ' WHERE variant_id = ?', [...$params, $variantId]);
            }
            if ($months !== null) {
                Db::run('UPDATE Warranty SET duration_months = ? WHERE variant_id = ?', [$months, $variantId]);
            }
        });
        $request->params['id'] = (string) $productId;
        return $this->show($request);
    }

    /** PUT /variants/{id}/specs — replaces the variant's specification list. */
    public function replaceSpecs(Request $request): array
    {
        $variantId = $request->intParam('id');
        $productId = (int) Db::value('SELECT product_id FROM ProductVariant WHERE variant_id = ?', [$variantId]);
        if (!$productId) {
            throw HttpError::notFound('Variant not found.');
        }
        $specs = $request->input('specs');
        if (!is_array($specs) || count($specs) > 20) {
            throw HttpError::badRequest('Send up to 20 specifications.');
        }
        $clean = [];
        foreach ($specs as $i => $s) {
            $name = trim((string) ($s['name'] ?? ''));
            $value = trim((string) ($s['value'] ?? ''));
            $unit = trim((string) ($s['unit'] ?? ''));
            if ($name === '' || $value === '' || mb_strlen($name) > 80 || mb_strlen($value) > 150 || mb_strlen($unit) > 30) {
                throw HttpError::badRequest('Each specification needs a name (80) and value (150); the unit is optional (30).', ["specs.$i" => 'Check this row.']);
            }
            $clean[mb_strtolower($name)] = [$name, $value, $unit ?: null];
        }
        Db::transaction(function () use ($variantId, $clean) {
            Db::run('DELETE FROM ProductSpecification WHERE variant_id = ?', [$variantId]);
            foreach ($clean as [$name, $value, $unit]) {
                Db::run('INSERT INTO ProductSpecification (variant_id, spec_name, spec_value, unit) VALUES (?, ?, ?, ?)', [$variantId, $name, $value, $unit]);
            }
        });
        $request->params['id'] = (string) $productId;
        return $this->show($request);
    }

    /**
     * POST /products/{id}/images (multipart: image, optional color, alt, main).
     * The picture is checked, shrunk and re-encoded (ImageService), then stored
     * in ProductImage.data as binary. Without "main", it becomes the colour's
     * main picture when the colour has none yet or only a drawing.
     */
    public function uploadImage(Request $request): array
    {
        $productId = $request->intParam('id');
        $name = Db::value('SELECT name FROM Product WHERE product_id = ?', [$productId]);
        if (!$name) {
            throw HttpError::notFound('Product not found.');
        }
        $file = $request->files['image'] ?? null;
        $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            throw HttpError::badRequest('The file is larger than the server accepts.', ['image' => 'Use a smaller file.']);
        }
        if (!$file || $error !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw HttpError::badRequest('Choose a picture to upload.', ['image' => 'Choose a JPEG or PNG file.']);
        }
        $limit = (int) Config::get('upload_max_bytes', 12 * 1024 * 1024);
        if ($file['size'] > $limit) {
            throw HttpError::badRequest(sprintf('The file is larger than %d MB.', intdiv($limit, 1048576)), ['image' => 'Use a smaller file.']);
        }

        $body = $request->body();
        $color = trim((string) ($body['color'] ?? ''));
        $color = $color === '' ? null : $color;
        if ($color !== null) {
            // ProductImage.color must name a colour this product is sold in (stored spelling).
            $color = Db::value('SELECT color FROM ProductVariant WHERE product_id = ? AND color = ? LIMIT 1', [$productId, $color]);
            if (!$color) {
                throw HttpError::badRequest('This product is not sold in that colour.', ['color' => 'Choose one of the product\'s colours.']);
            }
        }
        $alt = trim((string) ($body['alt'] ?? ''));
        $alt = $alt !== '' ? $alt : $name . ($color !== null ? ' in ' . mb_strtolower($color) : '');
        if (mb_strlen($alt) < 3 || mb_strlen($alt) > 160) {
            throw HttpError::badRequest('Describe the picture in 3 to 160 characters.', ['alt' => 'Between 3 and 160 characters.']);
        }

        $picture = ImageService::prepare($file['tmp_name']);

        Db::transaction(function () use ($productId, $color, $alt, $picture, $body) {
            $current = Db::value('SELECT mime_type FROM ProductImage WHERE product_id = ? AND color <=> ? ORDER BY sortOrder, image_id LIMIT 1', [$productId, $color]);
            $main = isset($body['main']) ? filter_var($body['main'], FILTER_VALIDATE_BOOL) : ($current === null || $current === 'image/svg+xml');
            $next = (int) Db::value('SELECT COALESCE(MAX(sortOrder) + 1, 0) FROM ProductImage WHERE product_id = ? AND color <=> ?', [$productId, $color]);
            $imageId = Db::insert('INSERT INTO ProductImage (product_id, color, sortOrder, mime_type, width, height, alt_text, data, uploadedBy)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$productId, $color, $next, $picture['mime'], $picture['width'], $picture['height'], $alt, new Blob($picture['bytes']), Session::adminId()]);
            if ($main) {
                $this->renumberImages($productId, $color, $imageId);
            }
        });
        return $this->show($request) + ['created' => true];
    }

    /** POST /images/{id}/main: shown first for its colour (sortOrder 0). */
    public function makeMainImage(Request $request): array
    {
        $image = $this->findImage($request->intParam('id'));
        Db::transaction(fn () => $this->renumberImages((int) $image['product_id'], $image['color'], (int) $image['image_id']));
        $request->params['id'] = (string) $image['product_id'];
        return $this->show($request);
    }

    /** DELETE /images/{id}: the next picture of the colour becomes its main one. */
    public function deleteImage(Request $request): array
    {
        $image = $this->findImage($request->intParam('id'));
        Db::transaction(function () use ($image) {
            Db::run('DELETE FROM ProductImage WHERE image_id = ?', [$image['image_id']]);
            $this->renumberImages((int) $image['product_id'], $image['color']);
        });
        $request->params['id'] = (string) $image['product_id'];
        return $this->show($request);
    }

    private function findImage(int $imageId): array
    {
        $image = Db::one('SELECT image_id, product_id, color FROM ProductImage WHERE image_id = ?', [$imageId]);
        if (!$image) {
            throw HttpError::notFound('Picture not found.');
        }
        return $image;
    }

    /** Numbers a colour's pictures 0, 1, 2 … in their current order, optionally moving one to the front. */
    private function renumberImages(int $productId, ?string $color, ?int $first = null): void
    {
        $ids = array_map('intval', array_column(Db::all('SELECT image_id FROM ProductImage WHERE product_id = ? AND color <=> ?
                                                           ORDER BY sortOrder, image_id FOR UPDATE', [$productId, $color]), 'image_id'));
        if ($first !== null) {
            $ids = [$first, ...array_values(array_diff($ids, [$first]))];
        }
        foreach ($ids as $order => $imageId) {
            Db::run('UPDATE ProductImage SET sortOrder = ? WHERE image_id = ?', [$order, $imageId]);
        }
    }

    // ---------------------------------------------------------------- categories

    public function categories(Request $request): array
    {
        return array_map(static fn ($c) => [
            'id' => (int) $c['category_id'], 'name' => $c['category_name'], 'slug' => $c['slug'],
            'group' => $c['category_group'], 'sortOrder' => (int) $c['sortOrder'], 'products' => (int) $c['products'],
        ], Db::all('SELECT c.*, (SELECT COUNT(*) FROM ProductCategory pc WHERE pc.category_id = c.category_id) AS products
                      FROM Category c ORDER BY c.sortOrder, c.category_name'));
    }

    public function createCategory(Request $request): array
    {
        $v = new Validator($request->body());
        $name = $v->string('name', 'a category name', 2, 80);
        $group = $v->choice('group', ['DEPARTMENT', 'TYPE', 'COLLECTION'], 'a group', 'TYPE');
        $v->done();
        $next = (int) Db::value('SELECT COALESCE(MAX(sortOrder), 0) + 1 FROM Category');
        Db::insert('INSERT INTO Category (category_name, slug, category_group, sortOrder) VALUES (?, ?, ?, ?)',
            [$name, Format::slug($name), $group, $next]);
        return ['created' => true, 'categories' => $this->categories($request)];
    }

    public function updateCategory(Request $request): array
    {
        $v = new Validator($request->body());
        $name = $v->string('name', 'a category name', 2, 80);
        $group = $v->choice('group', ['DEPARTMENT', 'TYPE', 'COLLECTION'], 'a group', 'TYPE');
        $v->done();
        Db::run('UPDATE Category SET category_name = ?, category_group = ? WHERE category_id = ?', [$name, $group, $request->intParam('id')]);
        return $this->categories($request);
    }

    public function deleteCategory(Request $request): array
    {
        Db::run('DELETE FROM Category WHERE category_id = ?', [$request->intParam('id')]);
        return $this->categories($request);
    }

    /** Lookup used by the purchase-order and adjustment forms. */
    public function variantSearch(Request $request): array
    {
        $q = $request->queryString('q');
        $supplier = $request->queryInt('supplier', 0);
        $params = [Format::like($q), Format::like($q)];
        $join = '';
        if ($supplier) {
            $join = 'JOIN SupplierProduct sp ON sp.variant_id = pv.variant_id AND sp.supplier_id = ?';
            array_unshift($params, $supplier);
        }
        return array_map(static fn ($r) => [
            'id' => (int) $r['variant_id'], 'sku' => $r['sku'], 'name' => $r['name'], 'size' => $r['configuration'],
            'color' => $r['color'], 'price' => Format::money($r['price']),
            'unitCost' => isset($r['unit_cost']) ? Format::money($r['unit_cost']) : null,
            'minimumOrder' => isset($r['minimum_order_qty']) ? (int) $r['minimum_order_qty'] : null,
            'leadDays' => isset($r['lead_time_days']) ? (int) $r['lead_time_days'] : null,
        ], Db::all("SELECT pv.variant_id, pv.sku, pv.configuration, pv.color, pv.price, p.name"
            . ($supplier ? ', sp.unit_cost, sp.minimum_order_qty, sp.lead_time_days' : '') . "
                      FROM ProductVariant pv JOIN Product p ON p.product_id = pv.product_id $join
                     WHERE (p.name LIKE ? OR pv.sku LIKE ?)
                     ORDER BY p.name, pv.sortOrder LIMIT 30", $params));
    }
}
