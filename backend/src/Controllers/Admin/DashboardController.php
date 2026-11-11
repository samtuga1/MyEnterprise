<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Db;
use App\Core\Request;
use App\Support\Format;

final class DashboardController
{
    /** GET /api/admin/dashboard — the numbers staff check first each morning. */
    public function show(Request $request): array
    {
        $days = $request->queryInt('days', 30, 7, 365);

        $kpi = Db::one("SELECT
                COALESCE(SUM(CASE WHEN placedAt >= NOW() - INTERVAL ? DAY AND status <> 'CANCELLED' THEN totalAmount END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN placedAt >= NOW() - INTERVAL ? DAY AND placedAt < NOW() - INTERVAL ? DAY
                                   AND status <> 'CANCELLED' THEN totalAmount END), 0) AS revenue_prev,
                SUM(placedAt >= NOW() - INTERVAL ? DAY AND status <> 'CANCELLED') AS orders,
                SUM(placedAt >= NOW() - INTERVAL ? DAY AND placedAt < NOW() - INTERVAL ? DAY AND status <> 'CANCELLED') AS orders_prev,
                SUM(status = 'PLACED') AS placed, SUM(status = 'PROCESSING') AS processing, SUM(status = 'SHIPPED') AS shipped
              FROM CustomerOrder", [$days, $days * 2, $days, $days, $days * 2, $days]);

        $refunded = (float) Db::value("SELECT COALESCE(SUM(t.amount), 0) FROM `Transaction` t
                                        WHERE t.transactionType = 'REFUND' AND t.status = 'SUCCESS' AND t.createdAt >= NOW() - INTERVAL ? DAY", [$days]);

        $queues = Db::one("SELECT
                (SELECT COUNT(*) FROM ReturnRequest WHERE status IN ('REQUESTED', 'APPROVED')) AS returns_open,
                (SELECT COUNT(*) FROM WarrantyClaim WHERE status IN ('SUBMITTED', 'APPROVED')) AS claims_open,
                (SELECT COUNT(*) FROM PurchaseOrder WHERE status = 'ORDERED') AS purchase_orders_open,
                (SELECT COUNT(*) FROM Inventory i JOIN ProductVariant pv ON pv.variant_id = i.variant_id
                   JOIN Product p ON p.product_id = pv.product_id AND p.isActive = 1
                  WHERE i.quantity_on_hand - i.quantity_reserved <= i.reorder_level) AS low_stock,
                (SELECT COUNT(*) FROM Customer WHERE createdAt >= NOW() - INTERVAL ? DAY) AS new_customers", [$days]);

        // Daily sales, with empty days filled in by the client.
        $daily = Db::all("SELECT DATE(placedAt) AS day, COUNT(*) AS orders, SUM(totalAmount) AS revenue
                            FROM CustomerOrder
                           WHERE status <> 'CANCELLED' AND placedAt >= CURDATE() - INTERVAL ? DAY
                           GROUP BY DATE(placedAt) ORDER BY day", [$days - 1]);

        $top = Db::all("SELECT p.name, p.slug, fn_product_image(p.product_id, NULL) AS image_key, SUM(oi.quantity) AS units, SUM(oi.quantity * oi.unitPrice) AS revenue
                          FROM OrderItem oi
                          JOIN CustomerOrder o   ON o.order_id = oi.order_id AND o.status <> 'CANCELLED'
                          JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
                          JOIN Product p         ON p.product_id = pv.product_id
                         WHERE o.placedAt >= NOW() - INTERVAL ? DAY
                         GROUP BY p.product_id, p.name, p.slug
                         ORDER BY revenue DESC LIMIT 5", [$days]);

        $recent = Db::all('SELECT order_id, orderNumber, status, placedAt, totalAmount, customer_name, customer_email, customer_id, units
                             FROM v_order_overview ORDER BY placedAt DESC LIMIT 8');

        $warehouses = Db::all('SELECT w.warehouse_id, w.name, w.capacity, COALESCE(SUM(i.quantity_on_hand), 0) AS on_hand,
                                      COALESCE(SUM(i.quantity_reserved), 0) AS reserved
                                 FROM Warehouse w LEFT JOIN Inventory i ON i.warehouse_id = w.warehouse_id
                                GROUP BY w.warehouse_id, w.name, w.capacity ORDER BY w.warehouse_id');

        $orders = (int) $kpi['orders'];
        return [
            'days' => $days,
            'kpis' => [
                'revenue' => Format::money($kpi['revenue']),
                'revenuePrevious' => Format::money($kpi['revenue_prev']),
                'orders' => $orders,
                'ordersPrevious' => (int) $kpi['orders_prev'],
                'averageOrder' => Format::money($orders ? (float) $kpi['revenue'] / $orders : 0),
                'refunded' => Format::money($refunded),
                'newCustomers' => (int) $queues['new_customers'],
            ],
            'pipeline' => ['placed' => (int) $kpi['placed'], 'processing' => (int) $kpi['processing'], 'shipped' => (int) $kpi['shipped']],
            'queues' => [
                'returns' => (int) $queues['returns_open'],
                'claims' => (int) $queues['claims_open'],
                'purchaseOrders' => (int) $queues['purchase_orders_open'],
                'lowStock' => (int) $queues['low_stock'],
            ],
            'daily' => array_map(static fn ($d) => ['day' => $d['day'], 'orders' => (int) $d['orders'], 'revenue' => Format::money($d['revenue'])], $daily),
            'topProducts' => array_map(static fn ($t) => ['name' => $t['name'], 'slug' => $t['slug'], 'image' => Format::image($t['image_key']),
                'units' => (int) $t['units'], 'revenue' => Format::money($t['revenue'])], $top),
            'recentOrders' => array_map(static fn ($o) => [
                'id' => (int) $o['order_id'], 'number' => $o['orderNumber'], 'status' => $o['status'], 'placedAt' => Format::date($o['placedAt']),
                'total' => Format::money($o['totalAmount']), 'customer' => $o['customer_name'], 'units' => (int) $o['units'],
            ], $recent),
            'warehouses' => array_map(static fn ($w) => [
                'id' => (int) $w['warehouse_id'], 'name' => $w['name'], 'capacity' => (int) $w['capacity'],
                'onHand' => (int) $w['on_hand'], 'reserved' => (int) $w['reserved'],
            ], $warehouses),
        ];
    }
}
