<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Db;
use App\Core\Request;
use App\Core\Validator;
use App\Support\Format;

/**
 * Stock by warehouse. Staff never type a new on-hand number: an adjustment is
 * a StockMovement row, and trigger T1 applies it to Inventory (refusing to go
 * below the units reserved for customers).
 */
final class InventoryController
{
    public function warehouses(Request $request): array
    {
        return array_map(static fn ($w) => [
            'id' => (int) $w['warehouse_id'], 'name' => $w['name'], 'location' => $w['location'], 'capacity' => (int) $w['capacity'],
            'onHand' => (int) $w['on_hand'], 'reserved' => (int) $w['reserved'], 'skus' => (int) $w['skus'], 'low' => (int) $w['low'],
        ], Db::all('SELECT w.*, COALESCE(SUM(i.quantity_on_hand), 0) AS on_hand, COALESCE(SUM(i.quantity_reserved), 0) AS reserved,
                           COUNT(i.variant_id) AS skus, COALESCE(SUM(i.quantity_on_hand - i.quantity_reserved <= i.reorder_level), 0) AS low
                      FROM Warehouse w LEFT JOIN Inventory i ON i.warehouse_id = w.warehouse_id
                     GROUP BY w.warehouse_id ORDER BY w.warehouse_id'));
    }

    public function index(Request $request): array
    {
        $where = ['1 = 1'];
        $params = [];
        if ($w = $request->queryInt('warehouse', 0)) {
            $where[] = 'i.warehouse_id = ?';
            $params[] = $w;
        }
        if ($q = $request->queryString('q')) {
            $where[] = '(p.name LIKE ? OR pv.sku LIKE ? OR pv.color LIKE ?)';
            array_push($params, Format::like($q), Format::like($q), Format::like($q));
        }
        if ($request->queryString('low') === '1') {
            $where[] = 'i.quantity_on_hand - i.quantity_reserved <= i.reorder_level';
        }
        $page = $request->queryInt('page', 1, 1);
        $per = 40;
        $base = 'FROM Inventory i
                 JOIN Warehouse w       ON w.warehouse_id = i.warehouse_id
                 JOIN ProductVariant pv ON pv.variant_id = i.variant_id
                 JOIN Product p         ON p.product_id = pv.product_id
                WHERE ' . implode(' AND ', $where);
        $total = (int) Db::value("SELECT COUNT(*) $base", $params);
        $rows = Db::all("SELECT i.*, w.name AS warehouse, pv.sku, pv.configuration, pv.color, pv.color_hex, p.name, p.product_id,
                                fn_product_image(pv.product_id, pv.color) AS image, p.isActive,
                                (SELECT COALESCE(SUM(poi.quantity), 0) FROM PurchaseOrderItem poi
                                   JOIN PurchaseOrder po ON po.purchase_order_id = poi.purchase_order_id
                                  WHERE po.status = 'ORDERED' AND po.warehouse_id = i.warehouse_id AND poi.variant_id = i.variant_id) AS on_order
                         $base ORDER BY (i.quantity_on_hand - i.quantity_reserved - i.reorder_level), p.name, pv.sortOrder
                         LIMIT $per OFFSET " . (($page - 1) * $per), $params);
        return [
            'total' => $total,
            'page' => $page,
            'pages' => max(1, (int) ceil($total / $per)),
            'items' => array_map(static fn ($r) => [
                'warehouseId' => (int) $r['warehouse_id'], 'warehouse' => $r['warehouse'], 'variantId' => (int) $r['variant_id'],
                'productId' => (int) $r['product_id'], 'name' => $r['name'], 'sku' => $r['sku'], 'size' => $r['configuration'],
                'color' => $r['color'], 'colorHex' => $r['color_hex'], 'image' => Format::image($r['image']), 'isActive' => Format::bool($r['isActive']),
                'onHand' => (int) $r['quantity_on_hand'], 'reserved' => (int) $r['quantity_reserved'],
                'available' => (int) $r['quantity_on_hand'] - (int) $r['quantity_reserved'],
                'reorderLevel' => (int) $r['reorder_level'], 'onOrder' => (int) $r['on_order'],
                'updatedAt' => Format::date($r['updatedAt']),
            ], $rows),
        ];
    }

    /** POST /inventory/adjust { warehouseId, variantId, change, reason, note } */
    public function adjust(Request $request): array
    {
        $v = new Validator($request->body());
        $warehouse = $v->int('warehouseId', 1, PHP_INT_MAX, 'a warehouse');
        $variant = $v->int('variantId', 1, PHP_INT_MAX, 'an item');
        $change = $v->int('change', -1000, 1000, 'the change');
        $reason = $v->choice('reason', ['ADJUSTMENT', 'DAMAGE_WRITE_OFF'], 'a reason', 'ADJUSTMENT');
        $note = $v->string('note', 'a note', 2, 50, false);
        if ($change === 0) {
            $v->fail('change', 'Enter a change other than 0.');
        }
        if ($reason === 'DAMAGE_WRITE_OFF' && $change !== null && $change > 0) {
            $v->fail('change', 'A write-off removes stock: use a negative number.');
        }
        $v->done();
        $id = Db::insert('INSERT INTO StockMovement (warehouse_id, variant_id, quantity_change, reason, reference) VALUES (?, ?, ?, ?, ?)',
            [$warehouse, $variant, $change, $reason, $note ?: 'Manual']);
        $row = Db::one('SELECT quantity_on_hand, quantity_reserved FROM Inventory WHERE warehouse_id = ? AND variant_id = ?', [$warehouse, $variant]);
        return ['movementId' => $id, 'onHand' => (int) $row['quantity_on_hand'], 'reserved' => (int) $row['quantity_reserved']];
    }

    public function setReorderLevel(Request $request): array
    {
        $v = new Validator($request->body());
        $warehouse = $v->int('warehouseId', 1, PHP_INT_MAX, 'a warehouse');
        $variant = $v->int('variantId', 1, PHP_INT_MAX, 'an item');
        $level = $v->int('reorderLevel', 0, 500, 'a reorder level');
        $v->done();
        Db::run('UPDATE Inventory SET reorder_level = ? WHERE warehouse_id = ? AND variant_id = ?', [$level, $warehouse, $variant]);
        return ['reorderLevel' => $level];
    }

    public function movements(Request $request): array
    {
        $where = ['1 = 1'];
        $params = [];
        foreach (['warehouse' => 'm.warehouse_id', 'variant' => 'm.variant_id'] as $key => $col) {
            if ($id = $request->queryInt($key, 0)) {
                $where[] = "$col = ?";
                $params[] = $id;
            }
        }
        if (($reason = $request->queryString('reason')) && preg_match('/^[A-Z_]+$/', $reason)) {
            $where[] = 'm.reason = ?';
            $params[] = $reason;
        }
        if ($q = $request->queryString('q')) {
            $where[] = '(pv.sku LIKE ? OR p.name LIKE ? OR m.reference LIKE ?)';
            array_push($params, Format::like($q), Format::like($q), Format::like($q));
        }
        $page = $request->queryInt('page', 1, 1);
        $per = 50;
        $base = 'FROM StockMovement m JOIN Warehouse w ON w.warehouse_id = m.warehouse_id
                 JOIN ProductVariant pv ON pv.variant_id = m.variant_id JOIN Product p ON p.product_id = pv.product_id
                WHERE ' . implode(' AND ', $where);
        $total = (int) Db::value("SELECT COUNT(*) $base", $params);
        $rows = Db::all("SELECT m.*, w.name AS warehouse, pv.sku, pv.configuration, pv.color, p.name $base
                          ORDER BY m.movedAt DESC, m.movement_id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $params);
        return [
            'total' => $total, 'page' => $page, 'pages' => max(1, (int) ceil($total / $per)),
            'items' => array_map(static fn ($m) => [
                'id' => (int) $m['movement_id'], 'warehouse' => $m['warehouse'], 'sku' => $m['sku'], 'name' => $m['name'],
                'size' => $m['configuration'], 'color' => $m['color'], 'change' => (int) $m['quantity_change'],
                'reason' => $m['reason'], 'reference' => $m['reference'], 'at' => Format::date($m['movedAt']),
            ], $rows),
        ];
    }
}
