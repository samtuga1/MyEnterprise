<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Validator;
use App\Support\Format;

/** Suppliers, their price lists, and purchase orders. */
final class ProcurementController
{
    public function suppliers(Request $request): array
    {
        return array_map(static fn ($s) => [
            'id' => (int) $s['supplier_id'], 'name' => $s['name'], 'contact' => $s['contact'],
            'offers' => (int) $s['offers'], 'openOrders' => (int) $s['open_orders'], 'spend' => Format::money($s['spend']),
            'avgLeadDays' => $s['avg_lead'] !== null ? round((float) $s['avg_lead'], 1) : null,
        ], Db::all("SELECT s.*,
                           (SELECT COUNT(*) FROM SupplierProduct sp WHERE sp.supplier_id = s.supplier_id) AS offers,
                           (SELECT AVG(sp.lead_time_days) FROM SupplierProduct sp WHERE sp.supplier_id = s.supplier_id) AS avg_lead,
                           (SELECT COUNT(*) FROM PurchaseOrder po WHERE po.supplier_id = s.supplier_id AND po.status = 'ORDERED') AS open_orders,
                           (SELECT COALESCE(SUM(poi.quantity * poi.unit_cost), 0) FROM PurchaseOrder po
                              JOIN PurchaseOrderItem poi ON poi.purchase_order_id = po.purchase_order_id
                             WHERE po.supplier_id = s.supplier_id AND po.status <> 'CANCELLED') AS spend
                      FROM Supplier s ORDER BY s.name"));
    }

    public function supplier(Request $request): array
    {
        $id = $request->intParam('id');
        $s = Db::one('SELECT * FROM Supplier WHERE supplier_id = ?', [$id]);
        if (!$s) {
            throw HttpError::notFound('Supplier not found.');
        }
        return [
            'id' => $id, 'name' => $s['name'], 'contact' => $s['contact'],
            'offers' => array_map(static fn ($o) => [
                'variantId' => (int) $o['variant_id'], 'sku' => $o['sku'], 'name' => $o['name'], 'size' => $o['configuration'],
                'color' => $o['color'], 'unitCost' => Format::money($o['unit_cost']), 'price' => Format::money($o['price']),
                'leadDays' => (int) $o['lead_time_days'], 'minimumOrder' => (int) $o['minimum_order_qty'],
            ], Db::all('SELECT sp.*, pv.sku, pv.configuration, pv.color, pv.price, p.name FROM SupplierProduct sp
                          JOIN ProductVariant pv ON pv.variant_id = sp.variant_id JOIN Product p ON p.product_id = pv.product_id
                         WHERE sp.supplier_id = ? ORDER BY p.name, pv.sortOrder', [$id])),
        ];
    }

    public function createSupplier(Request $request): array
    {
        $v = new Validator($request->body());
        $name = $v->string('name', 'a supplier name', 2, 100);
        $contact = $v->email('contact');
        $v->done();
        $id = Db::insert('INSERT INTO Supplier (name, contact) VALUES (?, ?)', [$name, $contact]);
        return ['created' => true, 'id' => $id];
    }

    /** PUT /suppliers/{id}/offers/{variantId} — add or change one price-list line. */
    public function saveOffer(Request $request): array
    {
        $v = new Validator($request->body());
        $cost = $v->money('unitCost', 'a unit cost');
        $lead = $v->int('leadDays', 1, 180, 'a lead time');
        $moq = $v->int('minimumOrder', 1, 1000, 'a minimum order');
        $v->done();
        Db::run('INSERT INTO SupplierProduct (supplier_id, variant_id, unit_cost, lead_time_days, minimum_order_qty) VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE unit_cost = VALUES(unit_cost), lead_time_days = VALUES(lead_time_days), minimum_order_qty = VALUES(minimum_order_qty)',
            [$request->intParam('id'), $request->intParam('variantId'), $cost, $lead, $moq]);
        return $this->supplier($request);
    }

    public function purchaseOrders(Request $request): array
    {
        $where = '1 = 1';
        $params = [];
        if (in_array($status = $request->queryString('status'), ['ORDERED', 'RECEIVED', 'CANCELLED'], true)) {
            $where = 'po.status = ?';
            $params[] = $status;
        }
        return array_map(static fn ($r) => [
            'id' => (int) $r['purchase_order_id'], 'reference' => 'PO-' . $r['purchase_order_id'], 'status' => $r['status'],
            'supplier' => $r['supplier'], 'warehouse' => $r['warehouse'], 'orderedAt' => Format::date($r['orderedAt']),
            'receivedAt' => Format::date($r['receivedAt']), 'lines' => (int) $r['lines'], 'units' => (int) $r['units'],
            'value' => Format::money($r['value']), 'expectedAt' => Format::date($r['expected']),
        ], Db::all("SELECT po.*, s.name AS supplier, w.name AS warehouse,
                           COUNT(poi.po_item_id) AS `lines`, SUM(poi.quantity) AS units, SUM(poi.quantity * poi.unit_cost) AS value,
                           po.orderedAt + INTERVAL MAX(COALESCE(sp.lead_time_days, 14)) DAY AS expected
                      FROM PurchaseOrder po
                      JOIN Supplier s  ON s.supplier_id = po.supplier_id
                      JOIN Warehouse w ON w.warehouse_id = po.warehouse_id
                      JOIN PurchaseOrderItem poi ON poi.purchase_order_id = po.purchase_order_id
                      LEFT JOIN SupplierProduct sp ON sp.supplier_id = po.supplier_id AND sp.variant_id = poi.variant_id
                     WHERE $where
                     GROUP BY po.purchase_order_id
                     ORDER BY FIELD(po.status, 'ORDERED', 'RECEIVED', 'CANCELLED'), po.orderedAt DESC
                     LIMIT 200", $params));
    }

    public function purchaseOrder(Request $request): array
    {
        $id = $request->intParam('id');
        $po = Db::one('SELECT po.*, s.name AS supplier, s.contact, w.name AS warehouse FROM PurchaseOrder po
                         JOIN Supplier s ON s.supplier_id = po.supplier_id JOIN Warehouse w ON w.warehouse_id = po.warehouse_id
                        WHERE po.purchase_order_id = ?', [$id]);
        if (!$po) {
            throw HttpError::notFound('Purchase order not found.');
        }
        $items = Db::all('SELECT poi.*, pv.sku, pv.configuration, pv.color, p.name, i.quantity_on_hand, i.quantity_reserved
                            FROM PurchaseOrderItem poi
                            JOIN ProductVariant pv ON pv.variant_id = poi.variant_id
                            JOIN Product p ON p.product_id = pv.product_id
                            LEFT JOIN Inventory i ON i.variant_id = poi.variant_id AND i.warehouse_id = ?
                           WHERE poi.purchase_order_id = ? ORDER BY p.name, pv.sortOrder', [$po['warehouse_id'], $id]);
        $movements = Db::all('SELECT movement_id, variant_id, quantity_change, movedAt FROM StockMovement WHERE reference = ? ORDER BY movement_id', ['PO-' . $id]);
        return [
            'id' => $id, 'reference' => 'PO-' . $id, 'status' => $po['status'], 'supplier' => $po['supplier'], 'contact' => $po['contact'],
            'warehouse' => $po['warehouse'], 'orderedAt' => Format::date($po['orderedAt']), 'receivedAt' => Format::date($po['receivedAt']),
            'items' => array_map(static fn ($i) => [
                'id' => (int) $i['po_item_id'], 'variantId' => (int) $i['variant_id'], 'sku' => $i['sku'], 'name' => $i['name'],
                'size' => $i['configuration'], 'color' => $i['color'], 'quantity' => (int) $i['quantity'],
                'unitCost' => Format::money($i['unit_cost']), 'lineTotal' => Format::money((int) $i['quantity'] * (float) $i['unit_cost']),
                'onHand' => $i['quantity_on_hand'] !== null ? (int) $i['quantity_on_hand'] : 0,
            ], $items),
            'total' => Format::money(array_sum(array_map(static fn ($i) => (int) $i['quantity'] * (float) $i['unit_cost'], $items))),
            'movements' => array_map(static fn ($m) => ['id' => (int) $m['movement_id'], 'variantId' => (int) $m['variant_id'],
                'change' => (int) $m['quantity_change'], 'at' => Format::date($m['movedAt'])], $movements),
        ];
    }

    /**
     * POST /purchase-orders { supplierId, warehouseId, items: [{ variantId, quantity }] }
     * Costs come from the supplier's price list, never from the browser.
     */
    public function createPurchaseOrder(Request $request): array
    {
        $v = new Validator($request->body());
        $supplier = $v->int('supplierId', 1, PHP_INT_MAX, 'a supplier');
        $warehouse = $v->int('warehouseId', 1, PHP_INT_MAX, 'a warehouse');
        $items = $request->input('items');
        if (!is_array($items) || !$items || count($items) > 50) {
            $v->fail('items', 'Add between 1 and 50 lines.');
        }
        $v->done();

        $lines = [];
        foreach ($items as $i => $item) {
            $variantId = (int) ($item['variantId'] ?? 0);
            $qty = (int) ($item['quantity'] ?? 0);
            $offer = Db::one('SELECT sp.unit_cost, sp.minimum_order_qty, pv.sku FROM SupplierProduct sp
                                JOIN ProductVariant pv ON pv.variant_id = sp.variant_id
                               WHERE sp.supplier_id = ? AND sp.variant_id = ?', [$supplier, $variantId]);
            if (!$offer) {
                throw HttpError::badRequest('This supplier does not sell one of the chosen items.', ["items.$i" => 'Not on this supplier’s price list.']);
            }
            if ($qty < (int) $offer['minimum_order_qty'] || $qty > 5000) {
                throw HttpError::badRequest("Order at least {$offer['minimum_order_qty']} of {$offer['sku']}.", ["items.$i" => "Minimum {$offer['minimum_order_qty']}."]);
            }
            if (isset($lines[$variantId])) {
                throw HttpError::badRequest("{$offer['sku']} appears twice. Combine the lines.", ["items.$i" => 'Duplicate line.']);
            }
            $lines[$variantId] = [$qty, $offer['unit_cost']];
        }
        $id = Db::transaction(function () use ($supplier, $warehouse, $lines) {
            $id = Db::insert("INSERT INTO PurchaseOrder (supplier_id, warehouse_id, status) VALUES (?, ?, 'ORDERED')", [$supplier, $warehouse]);
            foreach ($lines as $variantId => [$qty, $cost]) {
                Db::run('INSERT INTO PurchaseOrderItem (purchase_order_id, variant_id, quantity, unit_cost) VALUES (?, ?, ?, ?)', [$id, $variantId, $qty, $cost]);
            }
            return $id;
        });
        $request->params['id'] = (string) $id;
        return $this->purchaseOrder($request) + ['created' => true];
    }

    /** POST /purchase-orders/{id}/receive — sp_receive_purchase_order (cursor 2 + trigger T1). */
    public function receive(Request $request): array
    {
        $out = Db::call('sp_receive_purchase_order', [$request->intParam('id')], ['lines', 'units']);
        return $this->purchaseOrder($request) + ['received' => ['lines' => (int) $out['lines'], 'units' => (int) $out['units']]];
    }

    public function cancel(Request $request): array
    {
        $id = $request->intParam('id');
        $done = Db::run("UPDATE PurchaseOrder SET status = 'CANCELLED' WHERE purchase_order_id = ? AND status = 'ORDERED'", [$id])->rowCount();
        if (!$done) {
            throw HttpError::rule('Only purchase orders that have not been received can be cancelled.');
        }
        return $this->purchaseOrder($request);
    }

    /** GET /purchase-orders/suggestions — the low-stock query (Q3), grouped for one-click ordering. */
    public function suggestions(Request $request): array
    {
        $rows = Db::all("SELECT i.warehouse_id, w.name AS warehouse, pv.variant_id, pv.sku, pv.configuration, pv.color, p.name,
                                i.quantity_on_hand - i.quantity_reserved AS available, i.reorder_level,
                                COALESCE(oo.units, 0) AS on_order, bo.supplier_id, bo.supplier, bo.unit_cost, bo.minimum_order_qty, bo.lead_time_days
                           FROM Inventory i
                           JOIN Warehouse w       ON w.warehouse_id = i.warehouse_id
                           JOIN ProductVariant pv ON pv.variant_id = i.variant_id AND pv.isActive = 1
                           JOIN Product p         ON p.product_id = pv.product_id AND p.isActive = 1
                           LEFT JOIN (SELECT po.warehouse_id, poi.variant_id, SUM(poi.quantity) AS units
                                        FROM PurchaseOrder po JOIN PurchaseOrderItem poi ON poi.purchase_order_id = po.purchase_order_id
                                       WHERE po.status = 'ORDERED' GROUP BY po.warehouse_id, poi.variant_id) oo
                                  ON oo.warehouse_id = i.warehouse_id AND oo.variant_id = i.variant_id
                           LEFT JOIN (SELECT sp.*, s.name AS supplier,
                                             ROW_NUMBER() OVER (PARTITION BY sp.variant_id ORDER BY sp.unit_cost, sp.lead_time_days) AS position
                                        FROM SupplierProduct sp JOIN Supplier s ON s.supplier_id = sp.supplier_id) bo
                                  ON bo.variant_id = i.variant_id AND bo.position = 1
                          WHERE i.quantity_on_hand - i.quantity_reserved + COALESCE(oo.units, 0) <= i.reorder_level
                          ORDER BY w.warehouse_id, bo.supplier, p.name, pv.sortOrder");
        return array_map(static fn ($r) => [
            'warehouseId' => (int) $r['warehouse_id'], 'warehouse' => $r['warehouse'], 'variantId' => (int) $r['variant_id'],
            'sku' => $r['sku'], 'name' => $r['name'], 'size' => $r['configuration'], 'color' => $r['color'],
            'available' => (int) $r['available'], 'reorderLevel' => (int) $r['reorder_level'], 'onOrder' => (int) $r['on_order'],
            'supplierId' => $r['supplier_id'] !== null ? (int) $r['supplier_id'] : null, 'supplier' => $r['supplier'],
            'unitCost' => $r['unit_cost'] !== null ? Format::money($r['unit_cost']) : null,
            'suggested' => $r['minimum_order_qty'] !== null
                ? max((int) $r['minimum_order_qty'], (int) $r['reorder_level'] * 3 - (int) $r['available'] - (int) $r['on_order']) : null,
            'leadDays' => $r['lead_time_days'] !== null ? (int) $r['lead_time_days'] : null,
            'minimumOrder' => $r['minimum_order_qty'] !== null ? (int) $r['minimum_order_qty'] : null,
        ], $rows);
    }
}
