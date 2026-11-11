<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Support\Format;

final class CustomerController
{
    public function index(Request $request): array
    {
        $where = '1 = 1';
        $params = [];
        if ($q = $request->queryString('q')) {
            $where = '(c.firstName LIKE ? OR c.lastName LIKE ? OR c.email LIKE ?)';
            $params = [Format::like($q), Format::like($q), Format::like($q)];
        }
        return array_map(static fn ($c) => [
            'id' => (int) $c['customer_id'], 'name' => $c['firstName'] . ' ' . $c['lastName'], 'email' => $c['email'],
            'phone' => $c['phone'], 'since' => substr((string) $c['createdAt'], 0, 10), 'orders' => (int) $c['orders'],
            'spent' => Format::money($c['spent']), 'lastOrder' => Format::date($c['last_order']), 'hasCart' => (bool) $c['cart_items'],
        ], Db::all("SELECT c.*, COUNT(o.order_id) AS orders,
                           COALESCE(SUM(CASE WHEN o.status <> 'CANCELLED' THEN o.totalAmount END), 0) AS spent,
                           MAX(o.placedAt) AS last_order,
                           (SELECT COUNT(*) FROM Cart k JOIN CartItem ci ON ci.cart_id = k.cart_id
                             WHERE k.customer_id = c.customer_id AND k.status = 'ACTIVE') AS cart_items
                      FROM Customer c LEFT JOIN CustomerOrder o ON o.customer_id = c.customer_id
                     WHERE $where GROUP BY c.customer_id ORDER BY spent DESC LIMIT 200", $params));
    }

    public function show(Request $request): array
    {
        $id = $request->intParam('id');
        $c = Db::one('SELECT * FROM Customer WHERE customer_id = ?', [$id]);
        if (!$c) {
            throw HttpError::notFound('Customer not found.');
        }
        $orders = Db::all('SELECT order_id, orderNumber, status, placedAt, totalAmount, units FROM v_order_overview WHERE customer_id = ? ORDER BY placedAt DESC', [$id]);
        $cart = Db::all("SELECT ci.quantity, ci.unit_price, pv.sku, pv.configuration, pv.color, p.name FROM Cart k
                           JOIN CartItem ci ON ci.cart_id = k.cart_id JOIN ProductVariant pv ON pv.variant_id = ci.variant_id
                           JOIN Product p ON p.product_id = pv.product_id WHERE k.customer_id = ? AND k.status = 'ACTIVE'", [$id]);
        return [
            'id' => $id, 'name' => $c['firstName'] . ' ' . $c['lastName'], 'email' => $c['email'], 'phone' => $c['phone'],
            'since' => substr((string) $c['createdAt'], 0, 10),
            'orders' => array_map(static fn ($o) => ['id' => (int) $o['order_id'], 'number' => $o['orderNumber'], 'status' => $o['status'],
                'placedAt' => Format::date($o['placedAt']), 'total' => Format::money($o['totalAmount']), 'units' => (int) $o['units']], $orders),
            'cart' => array_map(static fn ($i) => ['name' => $i['name'], 'sku' => $i['sku'], 'size' => $i['configuration'], 'color' => $i['color'],
                'quantity' => (int) $i['quantity'], 'unitPrice' => Format::money($i['unit_price'])], $cart),
            'returns' => (int) Db::value('SELECT COUNT(*) FROM ReturnRequest WHERE customer_id = ?', [$id]),
        ];
    }
}
