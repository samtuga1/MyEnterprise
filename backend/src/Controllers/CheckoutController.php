<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Db;
use App\Core\Request;
use App\Core\Session;
use App\Core\Validator;
use App\Services\CartService;

final class CheckoutController
{
    /**
     * POST /api/checkout — places the order.
     * PHP validates the form; the stored procedure sp_checkout_cart (cursor 1)
     * re-checks stock under row locks, writes the order, reserves warehouse
     * stock and records the simulated payment in one transaction. No card
     * details are ever collected.
     */
    public function place(Request $request): array
    {
        $customerId = Session::customerId();
        $v = new Validator($request->body());
        $recipient = $v->string('recipient', 'the recipient’s name', 2, 100);
        $line1 = $v->string('line1', 'a street address', 3, 150);
        $city = $v->string('city', 'a city', 2, 80);
        $region = $v->string('region', 'a state or region', 2, 80);
        $postal = $v->string('postalCode', 'a postal code', 3, 20);
        $country = strtoupper((string) ($request->input('country') ?: 'US'));
        if (!preg_match('/^[A-Z]{2}$/', $country)) {
            $v->fail('country', 'Choose a country.');
        }
        $delivery = $v->choice('deliveryMethod', ['STANDARD', 'EXPRESS'], 'a delivery option', 'STANDARD');
        $payment = $v->choice('paymentMethod', ['CARD', 'PAYPAL', 'APPLE_PAY'], 'a payment method', 'CARD');
        $phone = $v->string('phone', 'a phone number', 7, 20, false);
        $v->done();

        $bag = CartService::get();
        if (!$bag['lines']) {
            throw \App\Core\HttpError::rule('Your bag is empty.');
        }

        $out = Db::call('sp_checkout_cart',
            [$customerId, $delivery, $payment, $recipient, $line1, $city, $region, $postal, $country],
            ['order_id']);
        if ($phone) {
            Db::run('UPDATE Customer SET phone = ? WHERE customer_id = ? AND phone IS NULL', [$phone, $customerId]);
        }
        $order = Db::one('SELECT orderNumber, totalAmount FROM CustomerOrder WHERE order_id = ?', [(int) $out['order_id']]);
        return [
            'created' => true,
            'orderNumber' => $order['orderNumber'],
            'total' => number_format((float) $order['totalAmount'], 2, '.', ''),
        ];
    }

    /** GET /api/checkout/defaults — the last address used, to prefill the form. */
    public function defaults(Request $request): array
    {
        $last = Db::one('SELECT shipRecipient, shipLine1, shipCity, shipRegion, shipPostalCode, shipCountry
                           FROM CustomerOrder WHERE customer_id = ? ORDER BY placedAt DESC LIMIT 1', [Session::customerId()]);
        $c = AuthController::customerDto((int) Session::customerId());
        return [
            'recipient' => $last['shipRecipient'] ?? trim(($c['firstName'] ?? '') . ' ' . ($c['lastName'] ?? '')),
            'line1' => $last['shipLine1'] ?? '',
            'city' => $last['shipCity'] ?? '',
            'region' => $last['shipRegion'] ?? '',
            'postalCode' => $last['shipPostalCode'] ?? '',
            'country' => $last['shipCountry'] ?? 'US',
            'phone' => $c['phone'] ?? '',
        ];
    }
}
