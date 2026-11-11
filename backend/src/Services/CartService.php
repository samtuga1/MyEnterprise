<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Session;
use App\Support\Format;

/**
 * The shopping bag.
 *   Guests: kept in the PHP session as [variant_id => quantity].
 *   Signed-in customers: the ACTIVE row in Cart with its CartItem lines.
 * Signing in moves a guest bag into the customer's Cart (quantities add up,
 * capped at 10, the CartItem CHECK limit).
 */
final class CartService
{
    public const MAX_QTY = 10;

    public static function activeCartId(int $customerId, bool $create): ?int
    {
        $id = Db::value("SELECT cart_id FROM Cart WHERE customer_id = ? AND status = 'ACTIVE'", [$customerId]);
        if ($id === null && $create) {
            $id = Db::insert("INSERT INTO Cart (customer_id, status) VALUES (?, 'ACTIVE')", [$customerId]);
        }
        return $id === null ? null : (int) $id;
    }

    /** @return array<int,int> variant_id => quantity */
    private static function quantities(): array
    {
        $customerId = Session::customerId();
        if ($customerId === null) {
            return array_map('intval', Session::get('cart', []));
        }
        $cartId = self::activeCartId($customerId, false);
        if ($cartId === null) {
            return [];
        }
        $out = [];
        foreach (Db::all('SELECT variant_id, quantity FROM CartItem WHERE cart_id = ?', [$cartId]) as $r) {
            $out[(int) $r['variant_id']] = (int) $r['quantity'];
        }
        return $out;
    }

    public static function count(): int
    {
        return array_sum(self::quantities());
    }

    public static function get(): array
    {
        $customerId = Session::customerId();
        if ($customerId !== null && ($cartId = self::activeCartId($customerId, false))) {
            // Prices follow the catalogue until checkout fixes them on OrderItem.
            Db::run('UPDATE CartItem ci JOIN ProductVariant pv ON pv.variant_id = ci.variant_id
                        SET ci.unit_price = pv.price
                      WHERE ci.cart_id = ? AND ci.unit_price <> pv.price', [$cartId]);
        }
        $quantities = self::quantities();
        $lines = [];
        if ($quantities) {
            $ids = array_keys($quantities);
            $marks = implode(',', array_fill(0, count($ids), '?'));
            $rows = Db::all("SELECT pv.variant_id, pv.sku, pv.configuration, pv.color, pv.color_hex, pv.price,
                                    fn_product_image(pv.product_id, pv.color) AS image, (pv.isActive AND p.isActive) AS sellable,
                                    p.name, p.slug, p.brand, vs.available
                               FROM ProductVariant pv
                               JOIN Product p          ON p.product_id = pv.product_id
                               JOIN v_variant_stock vs ON vs.variant_id = pv.variant_id
                              WHERE pv.variant_id IN ($marks)
                              ORDER BY pv.variant_id", $ids);
            foreach ($rows as $r) {
                $qty = $quantities[(int) $r['variant_id']];
                $lines[] = [
                    'variantId' => (int) $r['variant_id'],
                    'sku' => $r['sku'],
                    'name' => $r['name'],
                    'slug' => $r['slug'],
                    'brand' => $r['brand'],
                    'size' => $r['configuration'],
                    'color' => $r['color'],
                    'colorHex' => $r['color_hex'],
                    'image' => Format::image($r['image']),
                    'unitPrice' => Format::money($r['price']),
                    'quantity' => $qty,
                    'lineTotal' => Format::money($qty * (float) $r['price']),
                    'available' => (int) $r['available'],
                    'sellable' => Format::bool($r['sellable']),
                    'problem' => !$r['sellable'] ? 'No longer sold' : ((int) $r['available'] < $qty ? 'Only ' . max(0, (int) $r['available']) . ' left' : null),
                ];
            }
        }
        $subtotal = array_sum(array_map(static fn ($l) => (float) $l['lineTotal'], $lines));
        return [
            'lines' => $lines,
            'count' => array_sum(array_column($lines, 'quantity')),
            'subtotal' => Format::money($subtotal),
            'delivery' => [
                'standard' => Format::money($subtotal >= 150 || $subtotal == 0 ? 0 : 6),
                'express' => Format::money(18),
                'freeFrom' => '150.00',
            ],
            'canCheckout' => $lines && !array_filter($lines, static fn ($l) => $l['problem'] !== null),
        ];
    }

    private static function sellableVariant(int $variantId): array
    {
        $v = Db::one('SELECT pv.variant_id, pv.price, (pv.isActive AND p.isActive) AS sellable, vs.available
                        FROM ProductVariant pv
                        JOIN Product p          ON p.product_id = pv.product_id
                        JOIN v_variant_stock vs ON vs.variant_id = pv.variant_id
                       WHERE pv.variant_id = ?', [$variantId]);
        if (!$v || !$v['sellable']) {
            throw HttpError::rule('This item is no longer available.');
        }
        return $v;
    }

    public static function set(int $variantId, int $quantity, bool $add = false): void
    {
        $v = self::sellableVariant($variantId);
        $current = self::quantities()[$variantId] ?? 0;
        $target = $add ? $current + $quantity : $quantity;
        if ($target < 1) {
            self::remove($variantId);
            return;
        }
        if ($target > self::MAX_QTY) {
            throw HttpError::rule('You can buy up to ' . self::MAX_QTY . ' of one item per order.');
        }
        if ($target > (int) $v['available']) {
            throw HttpError::rule((int) $v['available'] <= 0 ? 'This size is sold out.' : 'Only ' . $v['available'] . ' left in this size.');
        }

        $customerId = Session::customerId();
        if ($customerId === null) {
            $cart = Session::get('cart', []);
            $cart[$variantId] = $target;
            Session::set('cart', $cart);
            return;
        }
        $cartId = self::activeCartId($customerId, true);
        Db::run('INSERT INTO CartItem (cart_id, variant_id, quantity, unit_price) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_price = VALUES(unit_price)',
            [$cartId, $variantId, $target, $v['price']]);
        Db::run('UPDATE Cart SET updatedAt = NOW() WHERE cart_id = ?', [$cartId]);
    }

    public static function remove(int $variantId): void
    {
        $customerId = Session::customerId();
        if ($customerId === null) {
            $cart = Session::get('cart', []);
            unset($cart[$variantId]);
            Session::set('cart', $cart);
            return;
        }
        $cartId = self::activeCartId($customerId, false);
        if ($cartId !== null) {
            Db::run('DELETE FROM CartItem WHERE cart_id = ? AND variant_id = ?', [$cartId, $variantId]);
        }
    }

    /** Called right after sign-in: the guest bag joins the customer's saved bag. */
    public static function mergeGuestCart(int $customerId): void
    {
        $guest = Session::get('cart', []);
        if (!$guest) {
            return;
        }
        $cartId = self::activeCartId($customerId, true);
        foreach ($guest as $variantId => $qty) {
            $v = Db::one('SELECT pv.price FROM ProductVariant pv JOIN Product p ON p.product_id = pv.product_id
                           WHERE pv.variant_id = ? AND pv.isActive = 1 AND p.isActive = 1', [(int) $variantId]);
            if (!$v) {
                continue;
            }
            Db::run('INSERT INTO CartItem (cart_id, variant_id, quantity, unit_price) VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE quantity = LEAST(quantity + VALUES(quantity), ' . self::MAX_QTY . ')',
                [$cartId, (int) $variantId, min((int) $qty, self::MAX_QTY), $v['price']]);
        }
        Session::forget('cart');
    }
}
