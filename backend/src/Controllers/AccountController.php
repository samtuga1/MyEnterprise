<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Session;
use App\Core\Validator;
use App\Services\OrderService;

/**
 * The signed-in shopper's own records. Every query is scoped to the session's
 * customer_id, so one customer can never read or change another's orders.
 */
final class AccountController
{
    private function me(): int
    {
        return (int) Session::customerId();
    }

    public function profile(Request $request): array
    {
        $dto = AuthController::customerDto($this->me());
        $stats = Db::one("SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status <> 'CANCELLED' THEN totalAmount END), 0) AS spent
                            FROM CustomerOrder WHERE customer_id = ?", [$this->me()]);
        return $dto + ['orders' => (int) $stats['orders'], 'spent' => number_format((float) $stats['spent'], 2, '.', '')];
    }

    public function updateProfile(Request $request): array
    {
        $v = new Validator($request->body());
        $first = $v->string('firstName', 'your first name', 1, 50);
        $last = $v->string('lastName', 'your last name', 1, 50);
        $phone = $v->string('phone', 'a phone number', 7, 20, false);
        $v->done();
        Db::run('UPDATE Customer SET firstName = ?, lastName = ?, phone = ? WHERE customer_id = ?', [$first, $last, $phone, $this->me()]);
        return $this->profile($request);
    }

    public function changePassword(Request $request): array
    {
        $v = new Validator($request->body());
        $current = $request->input('currentPassword');
        $new = $v->password('newPassword', 'a new password');
        $v->done();
        $hash = (string) Db::value('SELECT password_hash FROM Customer WHERE customer_id = ?', [$this->me()]);
        if (!is_string($current) || !password_verify($current, $hash)) {
            throw HttpError::badRequest('Your current password is not correct.', ['currentPassword' => 'This is not your current password.']);
        }
        Db::run('UPDATE Customer SET password_hash = ? WHERE customer_id = ?', [password_hash($new, PASSWORD_DEFAULT), $this->me()]);
        Session::regenerate();
        return ['changed' => true];
    }

    public function orders(Request $request): array
    {
        $rows = Db::all("SELECT o.order_id, o.orderNumber, o.status, o.placedAt, o.totalAmount,
                                (SELECT SUM(quantity) FROM OrderItem WHERE order_id = o.order_id) AS units,
                                (SELECT GROUP_CONCAT(fn_product_image(pv.product_id, pv.color) ORDER BY oi.order_item_id SEPARATOR '|')
                                   FROM OrderItem oi JOIN ProductVariant pv ON pv.variant_id = oi.variant_id
                                  WHERE oi.order_id = o.order_id) AS images
                           FROM CustomerOrder o
                          WHERE o.customer_id = ?
                          ORDER BY o.placedAt DESC", [$this->me()]);
        return array_map([OrderService::class, 'summaryRow'], $rows);
    }

    public function order(Request $request): array
    {
        return OrderService::detail(OrderService::findId($request->param('number'), $this->me()));
    }

    /** Customers may cancel until packing starts (sp_cancel_order, cursor 3). */
    public function cancel(Request $request): array
    {
        $id = OrderService::findId($request->param('number'), $this->me());
        $reason = trim((string) $request->input('reason', '')) ?: 'Cancelled by the customer.';
        Db::call('sp_cancel_order', [$id, 'CUSTOMER', null, mb_substr($reason, 0, 255)], ['units', 'refunded']);
        return OrderService::detail($id);
    }

    /**
     * Return request: header + lines in one transaction. Trigger T2 checks each
     * line (right order, delivered, inside 30 days, not more than bought); if a
     * line fails, the whole request is rolled back.
     */
    public function requestReturn(Request $request): array
    {
        $id = OrderService::findId($request->param('number'), $this->me());
        $v = new Validator($request->body());
        $reason = $v->string('reason', 'a reason for the return', 3, 255);
        $items = $request->input('items');
        if (!is_array($items) || !$items) {
            $v->fail('items', 'Choose at least one item to return.');
        }
        $v->done();

        $lines = [];
        foreach ($items as $item) {
            $orderItemId = (int) ($item['orderItemId'] ?? 0);
            $qty = (int) ($item['quantity'] ?? 0);
            if ($orderItemId < 1 || $qty < 1 || $qty > 10) {
                throw HttpError::badRequest('Choose how many of each item to return.');
            }
            $lines[$orderItemId] = $qty;
        }

        $rmaId = Db::transaction(function () use ($id, $reason, $lines) {
            $rmaId = Db::insert("INSERT INTO ReturnRequest (order_id, customer_id, status, reason) VALUES (?, ?, 'REQUESTED', ?)",
                [$id, $this->me(), $reason]);
            foreach ($lines as $orderItemId => $qty) {
                Db::run('INSERT INTO ReturnItem (return_request_id, order_item_id, quantity) VALUES (?, ?, ?)', [$rmaId, $orderItemId, $qty]);
            }
            return $rmaId;
        });
        return ['created' => true, 'reference' => 'RMA-' . $rmaId, 'order' => OrderService::detail($id)];
    }

    /** Quality-guarantee claim; trigger T5 checks coverage, the dates and duplicates. */
    public function claim(Request $request): array
    {
        $id = OrderService::findId($request->param('number'), $this->me());
        $v = new Validator($request->body());
        $orderItemId = $v->int('orderItemId', 1, PHP_INT_MAX, 'an item');
        $reason = $v->string('reason', 'what is wrong with the item', 10, 255);
        $v->done();

        $warrantyId = Db::value('SELECT MIN(w.warranty_id) FROM OrderItem oi JOIN Warranty w ON w.variant_id = oi.variant_id
                                  WHERE oi.order_item_id = ? AND oi.order_id = ?', [$orderItemId, $id]);
        if ($warrantyId === null) {
            throw HttpError::rule('This item has no quality guarantee.');
        }
        $claimId = Db::insert('INSERT INTO WarrantyClaim (warranty_id, order_item_id, reason) VALUES (?, ?, ?)', [$warrantyId, $orderItemId, $reason]);
        return ['created' => true, 'reference' => 'WC-' . $claimId, 'order' => OrderService::detail($id)];
    }
}
