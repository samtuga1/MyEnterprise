<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Validator;
use App\Services\CartService;

final class CartController
{
    public function show(Request $request): array
    {
        return CartService::get();
    }

    /** POST /api/cart/items { variantId, quantity } — adds to what is already in the bag. */
    public function add(Request $request): array
    {
        $v = new Validator($request->body());
        $variantId = $v->int('variantId', 1, PHP_INT_MAX, 'a size');
        $quantity = $v->int('quantity', 1, CartService::MAX_QTY, 'a quantity');
        $v->done();
        CartService::set($variantId, $quantity, true);
        return CartService::get();
    }

    /** PATCH /api/cart/items/{variantId} { quantity } — sets the quantity. */
    public function update(Request $request): array
    {
        $v = new Validator($request->body());
        $quantity = $v->int('quantity', 0, CartService::MAX_QTY, 'a quantity');
        $v->done();
        CartService::set($request->intParam('variantId'), $quantity);
        return CartService::get();
    }

    public function remove(Request $request): array
    {
        CartService::remove($request->intParam('variantId'));
        return CartService::get();
    }
}
