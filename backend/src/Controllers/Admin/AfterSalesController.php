<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Validator;
use App\Support\Format;

/** Returns (RMA) and quality-guarantee claims. */
final class AfterSalesController
{
    public function returns(Request $request): array
    {
        $where = '1 = 1';
        $params = [];
        $status = $request->queryString('status');
        if ($status === 'OPEN') {
            $where = "rr.status IN ('REQUESTED', 'APPROVED')";
        } elseif (in_array($status, ['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED'], true)) {
            $where = 'rr.status = ?';
            $params[] = $status;
        }
        return array_map(fn ($r) => $this->returnDto($r), Db::all("SELECT rr.*, o.orderNumber, o.order_id, CONCAT(c.firstName, ' ', c.lastName) AS customer
                FROM ReturnRequest rr JOIN CustomerOrder o ON o.order_id = rr.order_id JOIN Customer c ON c.customer_id = rr.customer_id
               WHERE $where
               ORDER BY FIELD(rr.status, 'REQUESTED', 'APPROVED', 'REFUNDED', 'REJECTED'), rr.requestedAt DESC LIMIT 200", $params));
    }

    private function returnDto(array $r): array
    {
        $items = Db::all('SELECT ri.return_item_id, ri.quantity, oi.unitPrice, pv.sku, pv.configuration, pv.color, p.name,
                                 fn_product_image(pv.product_id, pv.color) AS image, fn_refundable_amount(ri.return_item_id) AS refundable,
                                 (SELECT COALESCE(SUM(amount), 0) FROM Refund WHERE return_item_id = ri.return_item_id AND status = \'COMPLETED\') AS refunded
                            FROM ReturnItem ri JOIN OrderItem oi ON oi.order_item_id = ri.order_item_id
                            JOIN ProductVariant pv ON pv.variant_id = oi.variant_id JOIN Product p ON p.product_id = pv.product_id
                           WHERE ri.return_request_id = ?', [$r['return_request_id']]);
        return [
            'id' => (int) $r['return_request_id'], 'reference' => 'RMA-' . $r['return_request_id'], 'status' => $r['status'],
            'reason' => $r['reason'], 'requestedAt' => Format::date($r['requestedAt']), 'resolvedAt' => Format::date($r['resolvedAt']),
            'order' => ['id' => (int) $r['order_id'], 'number' => $r['orderNumber']], 'customer' => $r['customer'],
            'items' => array_map(static fn ($i) => [
                'id' => (int) $i['return_item_id'], 'name' => $i['name'], 'sku' => $i['sku'], 'size' => $i['configuration'], 'color' => $i['color'],
                'image' => Format::image($i['image']), 'quantity' => (int) $i['quantity'], 'unitPrice' => Format::money($i['unitPrice']),
                'refundable' => Format::money($i['refundable']), 'refunded' => Format::money($i['refunded']),
            ], $items),
            'value' => Format::money(array_sum(array_map(static fn ($i) => (int) $i['quantity'] * (float) $i['unitPrice'], $items))),
        ];
    }

    private function one(int $id): array
    {
        $r = Db::one("SELECT rr.*, o.orderNumber, o.order_id, CONCAT(c.firstName, ' ', c.lastName) AS customer
                        FROM ReturnRequest rr JOIN CustomerOrder o ON o.order_id = rr.order_id JOIN Customer c ON c.customer_id = rr.customer_id
                       WHERE rr.return_request_id = ?", [$id]);
        if (!$r) {
            throw HttpError::notFound('Return not found.');
        }
        return $this->returnDto($r);
    }

    public function approveReturn(Request $request): array
    {
        $id = $request->intParam('id');
        if (!Db::run("UPDATE ReturnRequest SET status = 'APPROVED' WHERE return_request_id = ? AND status = 'REQUESTED'", [$id])->rowCount()) {
            throw HttpError::rule('Only new return requests can be approved.');
        }
        return $this->one($id);
    }

    public function rejectReturn(Request $request): array
    {
        $id = $request->intParam('id');
        if (!Db::run("UPDATE ReturnRequest SET status = 'REJECTED', resolvedAt = NOW() WHERE return_request_id = ? AND status IN ('REQUESTED', 'APPROVED')", [$id])->rowCount()) {
            throw HttpError::rule('This return has already been closed.');
        }
        return $this->one($id);
    }

    /** sp_complete_return: parcel received → optional restock + refunds (trigger T3 checks each). */
    public function completeReturn(Request $request): array
    {
        $id = $request->intParam('id');
        $v = new Validator($request->body());
        $restock = $v->bool('restock', true);
        $out = Db::call('sp_complete_return', [$id, $restock ? 1 : 0], ['refund_total']);
        return $this->one($id) + ['refundTotal' => Format::money($out['refund_total'])];
    }

    // ------------------------------------------------------------------ claims

    public function claims(Request $request): array
    {
        $where = '1 = 1';
        $params = [];
        $status = $request->queryString('status');
        if ($status === 'OPEN') {
            $where = "wc.status IN ('SUBMITTED', 'APPROVED')";
        } elseif (in_array($status, ['SUBMITTED', 'APPROVED', 'REJECTED', 'RESOLVED'], true)) {
            $where = 'wc.status = ?';
            $params[] = $status;
        }
        return array_map(static fn ($c) => [
            'id' => (int) $c['claim_id'], 'reference' => 'WC-' . $c['claim_id'], 'status' => $c['status'], 'reason' => $c['reason'],
            'resolution' => $c['resolution'], 'submittedAt' => Format::date($c['submittedAt']), 'resolvedAt' => Format::date($c['resolvedAt']),
            'product' => $c['name'], 'sku' => $c['sku'], 'size' => $c['configuration'], 'color' => $c['color'], 'image' => Format::image($c['image']),
            'customer' => $c['customer'], 'order' => ['id' => (int) $c['order_id'], 'number' => $c['orderNumber']],
            'months' => (int) $c['duration_months'], 'coveredUntil' => $c['covered_until'],
            'eligible' => $c['covered_until'] !== null && substr((string) $c['submittedAt'], 0, 10) <= $c['covered_until'],
        ], Db::all("SELECT wc.*, p.name, pv.sku, pv.configuration, pv.color, fn_product_image(pv.product_id, pv.color) AS image,
                           CONCAT(c.firstName, ' ', c.lastName) AS customer, o.orderNumber, o.order_id, w.duration_months,
                           fn_warranty_expires_on(wc.order_item_id, wc.warranty_id) AS covered_until
                      FROM WarrantyClaim wc
                      JOIN Warranty w        ON w.warranty_id = wc.warranty_id
                      JOIN OrderItem oi      ON oi.order_item_id = wc.order_item_id
                      JOIN CustomerOrder o   ON o.order_id = oi.order_id
                      JOIN Customer c        ON c.customer_id = o.customer_id
                      JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
                      JOIN Product p         ON p.product_id = pv.product_id
                     WHERE $where
                     ORDER BY FIELD(wc.status, 'SUBMITTED', 'APPROVED', 'RESOLVED', 'REJECTED'), wc.submittedAt DESC LIMIT 200", $params));
    }

    /** POST /claims/{id}/{approve|reject|resolve} { resolution } */
    public function decideClaim(Request $request): array
    {
        $id = $request->intParam('id');
        $action = $request->param('action');
        $v = new Validator($request->body());
        $resolution = $action === 'approve' ? null : $v->string('resolution', 'what was decided', 3, 255);
        $v->done();
        $affected = match ($action) {
            'approve' => Db::run("UPDATE WarrantyClaim SET status = 'APPROVED' WHERE claim_id = ? AND status = 'SUBMITTED'", [$id])->rowCount(),
            'reject'  => Db::run("UPDATE WarrantyClaim SET status = 'REJECTED', resolution = ?, resolvedAt = NOW() WHERE claim_id = ? AND status IN ('SUBMITTED', 'APPROVED')", [$resolution, $id])->rowCount(),
            'resolve' => Db::run("UPDATE WarrantyClaim SET status = 'RESOLVED', resolution = ?, resolvedAt = NOW() WHERE claim_id = ? AND status = 'APPROVED'", [$resolution, $id])->rowCount(),
            default   => throw HttpError::notFound(),
        };
        if (!$affected) {
            throw HttpError::rule($action === 'resolve' ? 'Approve the claim before resolving it.' : 'This claim has already been decided.');
        }
        return ['id' => $id, 'status' => strtoupper($action === 'approve' ? 'APPROVED' : ($action === 'reject' ? 'REJECTED' : 'RESOLVED'))];
    }
}
