<?php
/**
 * Every API endpoint, its controller method and who may call it.
 * Access: public | customer | admin | admin:ROLE,ROLE (ADMINISTRATOR always allowed).
 * Non-GET requests also need the X-CSRF-Token header (checked by the Router).
 */
declare(strict_types=1);

use App\Controllers\AccountController;
use App\Controllers\Admin\AdminAuthController;
use App\Controllers\Admin\AfterSalesController;
use App\Controllers\Admin\CustomerController;
use App\Controllers\Admin\DashboardController;
use App\Controllers\Admin\DatabaseController;
use App\Controllers\Admin\InventoryController;
use App\Controllers\Admin\OrderController;
use App\Controllers\Admin\ProcurementController;
use App\Controllers\Admin\ProductController;
use App\Controllers\Admin\ReportController;
use App\Controllers\AuthController;
use App\Controllers\CartController;
use App\Controllers\CatalogController;
use App\Controllers\CheckoutController;
use App\Controllers\ImageController;
use App\Core\Router;

return static function (Router $r): void {
    // ---------------------------------------------------------------- storefront
    $r->get('/api/session', [AuthController::class, 'session']);
    $r->post('/api/auth/register', [AuthController::class, 'register']);
    $r->post('/api/auth/login', [AuthController::class, 'login']);
    $r->post('/api/auth/logout', [AuthController::class, 'logout']);

    $r->get('/api/home', [CatalogController::class, 'home']);
    $r->get('/api/categories', [CatalogController::class, 'categories']);
    $r->get('/api/products', [CatalogController::class, 'index']);
    $r->get('/api/products/{slug}', [CatalogController::class, 'show']);

    // Pictures stored in ProductImage (binary). Served without a session.
    $r->get('/api/images/products/{slug}', [ImageController::class, 'product']);
    $r->get('/api/images/{key}', [ImageController::class, 'show']);

    $r->get('/api/cart', [CartController::class, 'show']);
    $r->post('/api/cart/items', [CartController::class, 'add']);
    $r->patch('/api/cart/items/{variantId}', [CartController::class, 'update']);
    $r->delete('/api/cart/items/{variantId}', [CartController::class, 'remove']);

    $r->get('/api/checkout/defaults', [CheckoutController::class, 'defaults'], 'customer');
    $r->post('/api/checkout', [CheckoutController::class, 'place'], 'customer');

    $r->get('/api/account', [AccountController::class, 'profile'], 'customer');
    $r->patch('/api/account', [AccountController::class, 'updateProfile'], 'customer');
    $r->post('/api/account/password', [AccountController::class, 'changePassword'], 'customer');
    $r->get('/api/account/orders', [AccountController::class, 'orders'], 'customer');
    $r->get('/api/account/orders/{number}', [AccountController::class, 'order'], 'customer');
    $r->post('/api/account/orders/{number}/cancel', [AccountController::class, 'cancel'], 'customer');
    $r->post('/api/account/orders/{number}/returns', [AccountController::class, 'requestReturn'], 'customer');
    $r->post('/api/account/orders/{number}/claims', [AccountController::class, 'claim'], 'customer');

    // --------------------------------------------------------------------- admin
    $r->get('/api/admin/session', [AdminAuthController::class, 'session']);
    $r->post('/api/admin/auth/login', [AdminAuthController::class, 'login']);
    $r->post('/api/admin/auth/logout', [AdminAuthController::class, 'logout']);

    $r->get('/api/admin/dashboard', [DashboardController::class, 'show'], 'admin');

    $r->get('/api/admin/products', [ProductController::class, 'index'], 'admin');
    $r->post('/api/admin/products', [ProductController::class, 'create'], 'admin:CATALOG');
    $r->get('/api/admin/products/{id}', [ProductController::class, 'show'], 'admin');
    $r->patch('/api/admin/products/{id}', [ProductController::class, 'update'], 'admin:CATALOG');
    $r->post('/api/admin/products/{id}/variants', [ProductController::class, 'createVariant'], 'admin:CATALOG');
    $r->post('/api/admin/products/{id}/images', [ProductController::class, 'uploadImage'], 'admin:CATALOG');
    $r->post('/api/admin/images/{id}/main', [ProductController::class, 'makeMainImage'], 'admin:CATALOG');
    $r->delete('/api/admin/images/{id}', [ProductController::class, 'deleteImage'], 'admin:CATALOG');
    $r->patch('/api/admin/variants/{id}', [ProductController::class, 'updateVariant'], 'admin:CATALOG');
    $r->put('/api/admin/variants/{id}/specs', [ProductController::class, 'replaceSpecs'], 'admin:CATALOG');
    $r->get('/api/admin/variants', [ProductController::class, 'variantSearch'], 'admin');
    $r->get('/api/admin/categories', [ProductController::class, 'categories'], 'admin');
    $r->post('/api/admin/categories', [ProductController::class, 'createCategory'], 'admin:CATALOG');
    $r->patch('/api/admin/categories/{id}', [ProductController::class, 'updateCategory'], 'admin:CATALOG');
    $r->delete('/api/admin/categories/{id}', [ProductController::class, 'deleteCategory'], 'admin:CATALOG');

    $r->get('/api/admin/warehouses', [InventoryController::class, 'warehouses'], 'admin');
    $r->get('/api/admin/inventory', [InventoryController::class, 'index'], 'admin');
    $r->post('/api/admin/inventory/adjust', [InventoryController::class, 'adjust'], 'admin:OPERATIONS');
    $r->post('/api/admin/inventory/reorder-level', [InventoryController::class, 'setReorderLevel'], 'admin:OPERATIONS');
    $r->get('/api/admin/inventory/movements', [InventoryController::class, 'movements'], 'admin');

    $r->get('/api/admin/suppliers', [ProcurementController::class, 'suppliers'], 'admin');
    $r->post('/api/admin/suppliers', [ProcurementController::class, 'createSupplier'], 'admin:OPERATIONS');
    $r->get('/api/admin/suppliers/{id}', [ProcurementController::class, 'supplier'], 'admin');
    $r->put('/api/admin/suppliers/{id}/offers/{variantId}', [ProcurementController::class, 'saveOffer'], 'admin:OPERATIONS');
    $r->get('/api/admin/purchase-orders', [ProcurementController::class, 'purchaseOrders'], 'admin');
    $r->post('/api/admin/purchase-orders', [ProcurementController::class, 'createPurchaseOrder'], 'admin:OPERATIONS');
    $r->get('/api/admin/purchase-orders/suggestions', [ProcurementController::class, 'suggestions'], 'admin');
    $r->get('/api/admin/purchase-orders/{id}', [ProcurementController::class, 'purchaseOrder'], 'admin');
    $r->post('/api/admin/purchase-orders/{id}/receive', [ProcurementController::class, 'receive'], 'admin:OPERATIONS');
    $r->post('/api/admin/purchase-orders/{id}/cancel', [ProcurementController::class, 'cancel'], 'admin:OPERATIONS');

    $r->get('/api/admin/orders', [OrderController::class, 'index'], 'admin');
    $r->get('/api/admin/orders/{id}', [OrderController::class, 'show'], 'admin');
    $r->post('/api/admin/orders/{id}/start', [OrderController::class, 'start'], 'admin:OPERATIONS');
    $r->post('/api/admin/orders/{id}/ship', [OrderController::class, 'ship'], 'admin:OPERATIONS');
    $r->post('/api/admin/orders/{id}/cancel', [OrderController::class, 'cancel'], 'admin:OPERATIONS,SUPPORT');
    $r->post('/api/admin/shipments/{id}/deliver', [OrderController::class, 'deliver'], 'admin:OPERATIONS');

    $r->get('/api/admin/returns', [AfterSalesController::class, 'returns'], 'admin');
    $r->post('/api/admin/returns/{id}/approve', [AfterSalesController::class, 'approveReturn'], 'admin:OPERATIONS,SUPPORT');
    $r->post('/api/admin/returns/{id}/reject', [AfterSalesController::class, 'rejectReturn'], 'admin:OPERATIONS,SUPPORT');
    $r->post('/api/admin/returns/{id}/complete', [AfterSalesController::class, 'completeReturn'], 'admin:OPERATIONS');
    $r->get('/api/admin/claims', [AfterSalesController::class, 'claims'], 'admin');
    $r->post('/api/admin/claims/{id}/{action}', [AfterSalesController::class, 'decideClaim'], 'admin:OPERATIONS,SUPPORT');

    $r->get('/api/admin/customers', [CustomerController::class, 'index'], 'admin');
    $r->get('/api/admin/customers/{id}', [CustomerController::class, 'show'], 'admin');

    $r->get('/api/admin/reports', [ReportController::class, 'index'], 'admin');
    $r->get('/api/admin/reports/{key}', [ReportController::class, 'run'], 'admin');

    $r->get('/api/admin/database', [DatabaseController::class, 'overview'], 'admin');
    $r->get('/api/admin/database/invariants', [DatabaseController::class, 'invariants'], 'admin');
};
