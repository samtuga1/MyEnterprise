<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpError;
use App\Support\Format;

/**
 * Builds the full picture of one order — lines, parcels, money, returns,
 * claims and what can still be done with it. Used by the customer's order
 * page and the admin order page.
 */
final class OrderService
{
    public const RETURN_DAYS = 30;

    public static function findId(string $number, ?int $customerId = null): int
    {
        $sql = 'SELECT order_id FROM CustomerOrder WHERE orderNumber = ?';
        $params = [$number];
        if ($customerId !== null) {
            $sql .= ' AND customer_id = ?';
            $params[] = $customerId;
        }
        $id = Db::value($sql, $params);
        if ($id === null) {
            throw HttpError::notFound('We could not find that order.');
        }
        return (int) $id;
    }

    public static function summaryRow(array $o): array
    {
        return [
            'id' => (int) $o['order_id'],
            'number' => $o['orderNumber'],
            'status' => $o['status'],
            'placedAt' => Format::date($o['placedAt']),
            'total' => Format::money($o['totalAmount']),
            'units' => (int) ($o['units'] ?? 0),
            'customer' => isset($o['customer_name']) ? ['id' => (int) $o['customer_id'], 'name' => $o['customer_name'], 'email' => $o['customer_email']] : null,
            'images' => isset($o['images']) ? array_map([Format::class, 'image'], array_slice(array_values(array_filter(explode('|', (string) $o['images']))), 0, 4)) : [],
        ];
    }

    public static function detail(int $orderId): array
    {
        $o = Db::one('SELECT o.*, c.firstName, c.lastName, c.email, c.phone, f.fulfillment_id, f.status AS fulfillment_status,
                             f.admin_id, a.fullName AS packer
                        FROM CustomerOrder o
                        JOIN Customer c    ON c.customer_id = o.customer_id
                        JOIN Fulfillment f ON f.order_id = o.order_id
                        LEFT JOIN Admin a  ON a.admin_id = f.admin_id
                       WHERE o.order_id = ?', [$orderId]);
        if (!$o) {
            throw HttpError::notFound('We could not find that order.');
        }

        $items = Db::all('SELECT oi.order_item_id, oi.variant_id, oi.quantity, oi.unitPrice, pv.sku, pv.configuration, pv.color,
                                 pv.color_hex, fn_product_image(pv.product_id, pv.color) AS image, p.name, p.slug, p.brand,
                                 fn_returnable_quantity(oi.order_item_id) AS returnable,
                                 w.warranty_id, w.duration_months,
                                 fn_warranty_expires_on(oi.order_item_id, w.warranty_id) AS warranty_ends,
                                 (SELECT MAX(s.deliveredAt) FROM OrderAllocation oa JOIN Shipment s ON s.shipment_id = oa.shipment_id
                                   WHERE oa.order_item_id = oi.order_item_id AND s.status = \'DELIVERED\') AS delivered_at,
                                 (SELECT COUNT(*) FROM WarrantyClaim wc WHERE wc.order_item_id = oi.order_item_id
                                   AND wc.status IN (\'SUBMITTED\', \'APPROVED\')) AS open_claims
                            FROM OrderItem oi
                            JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
                            JOIN Product p         ON p.product_id = pv.product_id
                            LEFT JOIN Warranty w   ON w.warranty_id = (SELECT MIN(w2.warranty_id) FROM Warranty w2 WHERE w2.variant_id = oi.variant_id)
                           WHERE oi.order_id = ?
                           ORDER BY oi.order_item_id', [$orderId]);

        $allocations = Db::all('SELECT oa.allocation_id, oa.order_item_id, oa.allocated_qty, oa.status, oa.shipment_id,
                                       w.name AS warehouse, w.warehouse_id
                                  FROM OrderAllocation oa JOIN Warehouse w ON w.warehouse_id = oa.warehouse_id
                                 WHERE oa.fulfillment_id = ? ORDER BY oa.allocation_id', [$o['fulfillment_id']]);

        $shipments = Db::all('SELECT s.*, (SELECT MIN(w.name) FROM OrderAllocation oa JOIN Warehouse w ON w.warehouse_id = oa.warehouse_id
                                             WHERE oa.shipment_id = s.shipment_id) AS warehouse,
                                    (SELECT SUM(oa.allocated_qty) FROM OrderAllocation oa WHERE oa.shipment_id = s.shipment_id) AS units
                                FROM Shipment s WHERE s.fulfillment_id = ? ORDER BY s.shipment_id', [$o['fulfillment_id']]);

        $transactions = Db::all('SELECT t.transaction_id, t.transactionType, t.amount, t.status, t.reference, t.createdAt, p.method
                                   FROM Payment p JOIN `Transaction` t ON t.payment_id = p.payment_id
                                  WHERE p.order_id = ? ORDER BY t.transaction_id', [$orderId]);
        $payment = Db::one('SELECT payment_id, amount, status, method FROM Payment WHERE order_id = ? ORDER BY payment_id LIMIT 1', [$orderId]);

        $returns = Db::all('SELECT rr.*, (SELECT COALESCE(SUM(r.amount), 0) FROM Refund r JOIN ReturnItem ri ON ri.return_item_id = r.return_item_id
                                           WHERE ri.return_request_id = rr.return_request_id AND r.status = \'COMPLETED\') AS refunded
                              FROM ReturnRequest rr WHERE rr.order_id = ? ORDER BY rr.return_request_id', [$orderId]);
        $returnItems = Db::all('SELECT ri.return_request_id, ri.order_item_id, ri.quantity FROM ReturnItem ri
                                  JOIN ReturnRequest rr ON rr.return_request_id = ri.return_request_id WHERE rr.order_id = ?', [$orderId]);
        $claims = Db::all('SELECT wc.*, oi.order_item_id FROM WarrantyClaim wc JOIN OrderItem oi ON oi.order_item_id = wc.order_item_id
                            WHERE oi.order_id = ? ORDER BY wc.claim_id', [$orderId]);
        $cancellation = Db::one('SELECT oc.*, a.fullName FROM OrderCancellation oc LEFT JOIN Admin a ON a.admin_id = oc.cancelledBy
                                  WHERE oc.order_id = ?', [$orderId]);

        $today = date('Y-m-d');
        $itemDtos = array_map(static function ($i) use ($allocations, $o, $today) {
            $deliveredAt = $i['delivered_at'];
            $returnUntil = $deliveredAt ? date('Y-m-d', strtotime($deliveredAt . ' +' . self::RETURN_DAYS . ' days')) : null;
            $canReturn = $o['status'] === 'DELIVERED' && $returnUntil !== null && $today <= $returnUntil && (int) $i['returnable'] > 0;
            $canClaim = $i['warranty_id'] !== null && $i['warranty_ends'] !== null && $today <= $i['warranty_ends'] && (int) $i['open_claims'] === 0;
            return [
                'id' => (int) $i['order_item_id'],
                'variantId' => (int) $i['variant_id'],
                'name' => $i['name'],
                'slug' => $i['slug'],
                'brand' => $i['brand'],
                'sku' => $i['sku'],
                'size' => $i['configuration'],
                'color' => $i['color'],
                'colorHex' => $i['color_hex'],
                'image' => Format::image($i['image']),
                'quantity' => (int) $i['quantity'],
                'unitPrice' => Format::money($i['unitPrice']),
                'lineTotal' => Format::money((int) $i['quantity'] * (float) $i['unitPrice']),
                'returnable' => (int) $i['returnable'],
                'returnUntil' => $returnUntil,
                'canReturn' => $canReturn,
                'warranty' => $i['warranty_id'] ? [
                    'id' => (int) $i['warranty_id'],
                    'months' => (int) $i['duration_months'],
                    'endsOn' => $i['warranty_ends'],
                    'canClaim' => $canClaim,
                ] : null,
                'allocations' => array_values(array_map(static fn ($a) => [
                    'warehouse' => $a['warehouse'], 'quantity' => (int) $a['allocated_qty'], 'status' => $a['status'],
                    'shipmentId' => $a['shipment_id'] !== null ? (int) $a['shipment_id'] : null,
                ], array_filter($allocations, static fn ($a) => (int) $a['order_item_id'] === (int) $i['order_item_id']))),
            ];
        }, $items);

        $refunded = array_sum(array_map(static fn ($t) => $t['transactionType'] === 'REFUND' && $t['status'] === 'SUCCESS' ? (float) $t['amount'] : 0, $transactions));
        $subtotal = (float) $o['totalAmount'] - (float) $o['shippingFee'];

        return [
            'id' => (int) $o['order_id'],
            'number' => $o['orderNumber'],
            'status' => $o['status'],
            'placedAt' => Format::date($o['placedAt']),
            'customer' => [
                'id' => (int) $o['customer_id'],
                'name' => $o['firstName'] . ' ' . $o['lastName'],
                'email' => $o['email'],
                'phone' => $o['phone'],
            ],
            'shipping' => [
                'recipient' => $o['shipRecipient'],
                'line1' => $o['shipLine1'],
                'city' => $o['shipCity'],
                'region' => $o['shipRegion'],
                'postalCode' => $o['shipPostalCode'],
                'country' => $o['shipCountry'],
                'method' => $o['deliveryMethod'],
            ],
            'money' => [
                'subtotal' => Format::money($subtotal),
                'shipping' => Format::money($o['shippingFee']),
                'total' => Format::money($o['totalAmount']),
                'refunded' => Format::money($refunded),
                'paymentMethod' => $payment['method'] ?? null,
                'paymentStatus' => $payment['status'] ?? null,
            ],
            'fulfillment' => [
                'id' => (int) $o['fulfillment_id'],
                'status' => $o['fulfillment_status'],
                'packer' => $o['packer'],
            ],
            'items' => $itemDtos,
            'shipments' => array_map(static fn ($s) => [
                'id' => (int) $s['shipment_id'],
                'tracking' => $s['trackingNumber'],
                'carrier' => $s['carrier'],
                'status' => $s['status'],
                'warehouse' => $s['warehouse'],
                'units' => (int) $s['units'],
                'shippedAt' => Format::date($s['shippedAt']),
                'deliveredAt' => Format::date($s['deliveredAt']),
            ], $shipments),
            'transactions' => array_map(static fn ($t) => [
                'id' => (int) $t['transaction_id'],
                'type' => $t['transactionType'],
                'amount' => Format::money($t['amount']),
                'status' => $t['status'],
                'reference' => $t['reference'],
                'at' => Format::date($t['createdAt']),
                'method' => $t['method'],
            ], $transactions),
            'returns' => array_map(static fn ($r) => [
                'id' => (int) $r['return_request_id'],
                'reference' => 'RMA-' . $r['return_request_id'],
                'status' => $r['status'],
                'reason' => $r['reason'],
                'requestedAt' => Format::date($r['requestedAt']),
                'resolvedAt' => Format::date($r['resolvedAt']),
                'refunded' => Format::money($r['refunded']),
                'items' => array_values(array_map(static fn ($ri) => ['orderItemId' => (int) $ri['order_item_id'], 'quantity' => (int) $ri['quantity']],
                    array_filter($returnItems, static fn ($ri) => (int) $ri['return_request_id'] === (int) $r['return_request_id']))),
            ], $returns),
            'claims' => array_map(static fn ($c) => [
                'id' => (int) $c['claim_id'],
                'reference' => 'WC-' . $c['claim_id'],
                'orderItemId' => (int) $c['order_item_id'],
                'status' => $c['status'],
                'reason' => $c['reason'],
                'resolution' => $c['resolution'],
                'submittedAt' => Format::date($c['submittedAt']),
                'resolvedAt' => Format::date($c['resolvedAt']),
            ], $claims),
            'cancellation' => $cancellation ? [
                'reason' => $cancellation['reason'],
                'at' => Format::date($cancellation['cancelledAt']),
                'by' => $cancellation['initiatedBy'],
                'staff' => $cancellation['fullName'],
            ] : null,
            'can' => [
                'cancel' => $o['status'] === 'PLACED',
                'return' => (bool) array_filter($itemDtos, static fn ($i) => $i['canReturn']),
                'claim' => (bool) array_filter($itemDtos, static fn ($i) => $i['warranty']['canClaim'] ?? false),
            ],
        ];
    }
}
