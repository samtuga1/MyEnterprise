<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Session;
use App\Core\Validator;
use App\Services\OrderService;
use App\Support\Format;

/** Order desk: start packing, ship, confirm delivery, cancel. */
final class OrderController
{
    public function index(Request $request): array
    {
        $where = ['1 = 1'];
        $params = [];
        $status = $request->queryString('status');
        if ($status === 'OPEN') {
            $where[] = "v.status IN ('PLACED', 'PROCESSING', 'SHIPPED')";
        } elseif (in_array($status, ['PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], true)) {
            $where[] = 'v.status = ?';
            $params[] = $status;
        }
        if ($q = $request->queryString('q')) {
            $where[] = '(v.orderNumber LIKE ? OR v.customer_name LIKE ? OR v.customer_email LIKE ?)';
            array_push($params, Format::like($q), Format::like($q), Format::like($q));
        }
        if ($customer = $request->queryInt('customer', 0)) {
            $where[] = 'v.customer_id = ?';
            $params[] = $customer;
        }
        $page = $request->queryInt('page', 1, 1);
        $per = 25;
        $base = 'FROM v_order_overview v WHERE ' . implode(' AND ', $where);
        $total = (int) Db::value("SELECT COUNT(*) $base", $params);
        $rows = Db::all("SELECT v.* $base ORDER BY FIELD(v.status, 'PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'), v.placedAt DESC
                         LIMIT $per OFFSET " . (($page - 1) * $per), $params);
        $counts = Db::all('SELECT status, COUNT(*) AS n FROM CustomerOrder GROUP BY status');
        return [
            'total' => $total, 'page' => $page, 'pages' => max(1, (int) ceil($total / $per)),
            'counts' => array_column(array_map(static fn ($c) => [$c['status'], (int) $c['n']], $counts), 1, 0),
            'items' => array_map(static fn ($o) => [
                'id' => (int) $o['order_id'], 'number' => $o['orderNumber'], 'status' => $o['status'],
                'placedAt' => Format::date($o['placedAt']), 'total' => Format::money($o['totalAmount']),
                'delivery' => $o['deliveryMethod'], 'units' => (int) $o['units'],
                'customer' => ['id' => (int) $o['customer_id'], 'name' => $o['customer_name'], 'email' => $o['customer_email']],
                'refunded' => Format::money($o['refunded']),
            ], $rows),
        ];
    }

    public function show(Request $request): array
    {
        return OrderService::detail($request->intParam('id'));
    }

    /** sp_start_fulfillment: this staff member takes the order. */
    public function start(Request $request): array
    {
        Db::call('sp_start_fulfillment', [$request->intParam('id'), Session::adminId()]);
        return $this->show($request);
    }

    /** sp_ship_order (cursor 4): one parcel per warehouse. */
    public function ship(Request $request): array
    {
        $v = new Validator($request->body());
        $carrier = $v->choice('carrier', ['UPS', 'FedEx', 'USPS', 'DHL'], 'a carrier', 'UPS');
        $v->done();
        $out = Db::call('sp_ship_order', [$request->intParam('id'), Session::adminId(), $carrier], ['shipments']);
        return $this->show($request) + ['parcelsCreated' => (int) $out['shipments']];
    }

    /** Carrier confirmed delivery. Trigger T6 completes the order once every parcel is in. */
    public function deliver(Request $request): array
    {
        $shipmentId = $request->intParam('id');
        $done = Db::run("UPDATE Shipment SET status = 'DELIVERED', deliveredAt = NOW() WHERE shipment_id = ? AND status = 'IN_TRANSIT'", [$shipmentId])->rowCount();
        if (!$done) {
            throw HttpError::rule('This parcel is already marked as delivered.');
        }
        $orderId = (int) Db::value('SELECT f.order_id FROM Shipment s JOIN Fulfillment f ON f.fulfillment_id = s.fulfillment_id WHERE s.shipment_id = ?', [$shipmentId]);
        return OrderService::detail($orderId);
    }

    /** sp_cancel_order (cursor 3) as staff: allowed while placed or being packed. */
    public function cancel(Request $request): array
    {
        $v = new Validator($request->body());
        $reason = $v->string('reason', 'a reason', 3, 255);
        $v->done();
        $out = Db::call('sp_cancel_order', [$request->intParam('id'), 'ADMIN', Session::adminId(), $reason], ['units', 'refunded']);
        return $this->show($request) + ['released' => (int) $out['units'], 'refunded' => Format::money($out['refunded'])];
    }
}
