import { createAPI, available, STORAGE_KEY } from "./api.js?v=auth-20261029-3";
import * as shop from "./customer.js?v=auth-20261029-3";
import * as admin from "./admin.js?v=auth-20261029-3";
import {
  esc,
  money,
  icon,
  btn,
  link,
  input,
  select,
  textarea,
  empty,
  form,
  hidden,
} from "./ui.js?v=auth-20261029-3";
const app = document.querySelector("#app"),
  modal = document.querySelector("#modal"),
  toast = document.querySelector("#toast");
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
}
const adminEntry = document.body.dataset.area === "admin";
const storeURL = new URL("./", document.baseURI).href;
const adminURL = new URL("admin/", storeURL).href;
let api = createAPI(storage, undefined, { admin: adminEntry }),
  toastTimer,
  pendingConfirmation;
const route = () => {
  const [requested, query = ""] = (location.hash.slice(1) || "/").split("?");
  const path = adminEntry && !requested.startsWith("/admin")
    ? `/admin/${requested === "/" ? "dashboard" : requested.slice(1)}`
    : requested;
  return {
    path,
    parts: path.split("/").filter(Boolean),
    params: new URLSearchParams(query),
  };
};
const go = (path) => {
  if (path.startsWith("/admin") !== adminEntry) {
    location.href = `${path.startsWith("/admin") ? adminURL : storeURL}#${path}`;
    return;
  }
  if (location.hash === `#${path}`) render();
  else location.hash = path;
};
function notify(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `visible ${error ? "error" : ""}`;
  toast.setAttribute("role", error ? "alert" : "status");
  toastTimer = setTimeout(() => (toast.className = ""), 6000);
}
function header(s, isAdmin) {
  if (isAdmin) return `<header class="admin-topbar"><a href="${adminURL}" class="brand" aria-label="MyEnterprise administration"><img src="assets/images/mark.svg?v=auth-20261029-3" alt=""><span>MyEnterprise<span class="brand-dot">.</span></span></a><span class="admin-title">Administration</span><a href="${storeURL}" class="inline-link">View store ${icon("arrow")}</a>${api.isAdminAuthenticated()?btn("Sign out","admin-logout","","text-btn"):""}</header>`;
  const count = s.cart.reduce((n, i) => n + i.quantity, 0);
  return `<header class="site-header"><div class="header-main"><a href="#/" class="brand" aria-label="MyEnterprise home"><img src="assets/images/mark.svg?v=auth-20261029-3" alt=""><span>MyEnterprise<span class="brand-dot">.</span></span></a><form data-form="search" class="header-search"><label class="sr-only" for="header-search">Search the collection</label>${icon("search")}<input id="header-search" name="q" type="search" placeholder="What are you looking for?" value="${esc(route().params.get("q") || "")}"><button aria-label="Search">${icon("arrow")}</button></form><div class="header-actions"><a href="#/orders" aria-label="My orders" class="account-link">${icon("user")}<span>${s.session?.role === "customer" ? esc(s.session.name.split(" ")[0]) : "My account"}</span></a><a class="cart-link" href="#/cart" aria-label="Shopping cart, ${count} items">${icon("cart")}<span>Cart</span><b>${count}</b></a>${s.session?.role === "customer" ? btn('Sign out','logout','','text-btn signout-link') : ''}</div></div><nav class="main-nav" aria-label="Main navigation"><div><a href="#/" ${route().path === "/" ? 'aria-current="page"' : ""}>Home</a><a href="#/catalog" ${route().path.startsWith("/catalog") ? 'aria-current="page"' : ""}>Shop all</a>${s.categories.slice(0,6).map(c=>`<a href="#/catalog?category=${c.id}">${esc(c.name)}</a>`).join('')}</div></nav></header>`;
}
function footer() {
  return `<footer><div><a href="#/" class="brand"><img src="assets/images/mark.svg?v=auth-20261029-3" alt="">MyEnterprise.</a><p>Thoughtfully selected style.<br>For everything you do next.</p></div><div><strong>Explore</strong><a href="#/catalog">The collection</a><a href="#/orders">Your orders</a></div><div><strong>Your account</strong><a href="#/login">Sign in</a><a href="#/register">Create an account</a></div><div class="footer-note"><strong>Everyday style. Your way.</strong><p>Clothes, shoes, and accessories<br>chosen for your everyday.</p><span>© 2026 MyEnterprise</span></div></footer>`;
}
function adminDestination(value) {
  return /^\/admin\/(dashboard|products|product|categories|inventory|suppliers|purchases|orders|order|returns|warranties|reports)(?:[/?]|$)/.test(value||'') ? value : '/admin/dashboard';
}
function render(focus = false) {
  const s = api.snapshot(),
    { parts, params, path } = route(),
    isAdmin = adminEntry;
  // Keep old bookmarked admin hashes working, but serve them from the dedicated entry point.
  if (!adminEntry && parts[0] === "admin") {
    location.replace(`${adminURL}${location.hash}`);
    return;
  }
  // A bookmarked checkout URL uses the same dialog as the cart button.
  if (parts[0] === "checkout" && s.cart.length && s.session?.role !== "customer") {
    history.replaceState(null, "", "#/cart");
    render(focus);
    openCheckoutPrompt();
    return;
  }
  let content = "";
  if (isAdmin) {
    if (!api.isAdminAuthenticated() && parts[1] !== 'login') {
      history.replaceState(null,'',`${adminURL}#/admin/login?${new URLSearchParams({next:path+(params.size?'?'+params:'')})}`);
      render(focus);
      return;
    }
    if (parts[1] === 'login') {
      if(api.isAdminAuthenticated()){go(adminDestination(params.get('next')));return;}
      content=admin.login(params);
    } else {
      const section = parts[1] || "dashboard";
      const views = {
        dashboard: () => admin.dashboard(s),
        products: () => admin.products(s, params),
        product: () => admin.variants(s, parts[2]),
        categories: () => admin.categories(s),
        inventory: () => admin.inventory(s, params),
        suppliers: () => admin.suppliers(s),
        purchases: () => admin.purchases(s),
        orders: () => admin.adminOrders(s, params),
        order: () => shop.orderDetails(s, parts[2], false, true),
        returns: () => admin.returns(s),
        warranties: () => admin.warranties(s),
        reports: () => admin.reportPage(s, params),
      };
      content = admin.adminShell(
        s,
        section === "product"
          ? "products"
          : section === "order"
            ? "orders"
            : section,
        views[section]?.() ||
          empty(
            "Page not found",
            "Choose a page from the workspace navigation.",
            "/admin/dashboard",
            "Overview",
          ),
      );
    }
  } else {
    switch (parts[0]) {
      case undefined:
        content = shop.home(s);
        break;
      case "catalog":
        content = shop.catalog(s, params);
        break;
      case "product":
        content = shop.product(s, parts[1], params);
        break;
      case "cart":
        content = shop.cart(s);
        break;
      case "checkout":
        content = shop.checkout(s);
        break;
      case "login":
        content = shop.auth(s, false, params);
        break;
      case "register":
        content = shop.auth(s, true, params);
        break;
      case "orders":
        content = shop.orders(s);
        break;
      case "order":
        content = shop.orderDetails(s, parts[1]);
        break;
      case "confirmation":
        content = shop.orderDetails(s, parts[1], true);
        break;
      default:
        content = empty(
          "A small detour.",
          "We could not find that page. Let’s get you back to the collection.",
        );
    }
  }
  app.innerHTML = `${header(s, isAdmin)}<main id="main" tabindex="-1" class="${isAdmin ? "admin-main" : "container"}">${api.warning() ? `<div class="notice error-text" role="alert">${esc(api.warning())}</div>` : ""}${content}</main>${isAdmin ? "" : footer()}`;
  for (const anchor of app.querySelectorAll('a[href^="#/"]')) {
    const target = anchor.getAttribute("href").slice(1);
    anchor.href = `${target.startsWith("/admin") ? adminURL : storeURL}#${target}`;
  }
  document.title = `${isAdmin ? "Admin workspace" : parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "Thoughtfully selected style"} · MyEnterprise`;
  if (focus) {
    document.querySelector("#main").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}
function open(html, { role = "dialog", description } = {}) {
  modal.innerHTML = html;
  modal.setAttribute("role", role);
  if (description) modal.setAttribute("aria-describedby", description);
  else modal.removeAttribute("aria-describedby");
  modal.showModal();
}
function openCheckoutPrompt() {
  open(
    `<div class="dialog-head"><h2 id="dialog-title">An account is required to check out</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon("close")}</button></div>
    <p id="checkout-account-message">Please create an account or sign in before continuing to checkout. Your items will stay in your cart.</p>
    <div class="form-actions checkout-account-actions">${btn("Continue shopping", "close-modal")}${btn("Sign in", "checkout-login")}${btn("Create account", "checkout-register", "", "primary")}</div>`,
    { role: "alertdialog", description: "checkout-account-message" },
  );
}
function confirmAction(title, body, callback, label = "Confirm") {
  pendingConfirmation = callback;
  open(form(title, `<p>${body}</p>`, "confirm", "", label));
}
const optionsVariants = (s) =>
  s.variants.map((v) => ({
    id: v.id,
    name: `${s.products.find((p) => p.id === v.productId).name} · ${v.sku}`,
  }));
function openAction(action, d) {
  const s = api.snapshot(),
    get = (rows, id) => rows.find((x) => x.id === Number(id));
  switch (action) {
    case "product-form": {
      const p = get(s.products, d.id) || {};
      open(
        form(
          p.id ? "Edit product" : "Add product",
          input(
            "Product name",
            "name",
            p.name,
            "text",
            'required maxlength="100"',
          ) +
            input(
              "Brand",
              "brand",
              p.brand,
              "text",
              'required maxlength="80"',
            ) +
            select("Category", "categoryId", s.categories, p.categoryIds?.[0]) +
            textarea(
              "Description",
              "description",
              p.description,
              'required maxlength="2000"',
            ) +
            `<label class="check-field"><input type="checkbox" name="active" ${p.active !== false ? "checked" : ""}> Active in storefront</label>`,
          "product",
          hidden("id", p.id || ""),
        ),
      );
      break;
    }
    case "category-form": {
      const c = get(s.categories, d.id) || {};
      open(
        form(
          c.id ? "Rename category" : "Add category",
          input(
            "Category name",
            "name",
            c.name,
            "text",
            'required maxlength="80"',
          ),
          "category",
          hidden("id", c.id || ""),
        ),
      );
      break;
    }
    case "variant-form": {
      const v = get(s.variants, d.id) || {};
      open(
        form(
          v.id ? "Edit variant" : "Add variant",
          `<div class="form-grid">${input("SKU", "sku", v.sku, "text", 'required maxlength="80"')}${input("Price (USD)", "price", v.price ? v.price / 100 : "", "number", 'required min="0.01" step="0.01" max="999999.99"')}${input("Size / fit", "configuration", v.configuration, "text", 'required maxlength="150"')}${input("Color", "color", v.color, "text", 'required maxlength="50"')}${input("Warranty months", "warrantyMonths", v.warrantyMonths || 12, "number", 'required min="1" max="120"')}</div>${textarea("Warranty coverage", "coverage", v.coverage || "Manufacturer defects. Accidental damage excluded.", 'required maxlength="1000"')}`,
          "variant",
          hidden("id", v.id || "") + hidden("productId", d.product),
        ),
      );
      break;
    }
    case "spec-form": {
      const v = get(s.variants, d.variant),
        sp = v.specs[Number(d.index)] || {};
      open(
        form(
          d.index !== undefined ? "Edit specification" : "Add specification",
          input(
            "Specification name",
            "name",
            sp.name,
            "text",
            'required maxlength="80"',
          ) +
            input(
              "Value",
              "value",
              sp.value,
              "text",
              'required maxlength="150"',
            ) +
            input("Unit (optional)", "unit", sp.unit, "text", 'maxlength="30"'),
          "spec",
          hidden("variantId", v.id) + hidden("index", d.index ?? ""),
        ),
      );
      break;
    }
    case "inventory-form": {
      const row = s.inventory.find(
        (i) =>
          i.variantId === Number(d.variant) &&
          i.warehouseId === Number(d.warehouse),
      );
      open(
        form(
          "Adjust stock on hand",
          `<p>Reserved stock: ${row.reserved}. The new balance must be at least this amount.</p>` +
            input(
              "New stock on hand",
              "onHand",
              row.onHand,
              "number",
              `required min="${row.reserved}" max="1000000"`,
            ) +
            textarea("Adjustment reason", "reason"),
          "inventory",
          hidden("variantId", row.variantId) +
            hidden("warehouseId", row.warehouseId),
        ),
      );
      break;
    }
    case "supplier-form": {
      const p = get(s.suppliers, d.id) || {};
      open(
        form(
          p.id ? "Edit supplier" : "Add supplier",
          input(
            "Supplier name",
            "name",
            p.name,
            "text",
            'required maxlength="100"',
          ) +
            input(
              "Contact",
              "contact",
              p.contact,
              "text",
              'required maxlength="100"',
            ),
          "supplier",
          hidden("id", p.id || ""),
        ),
      );
      break;
    }
    case "offer-form":
      open(
        form(
          "Supplier offer",
          select("Supplier", "supplierId", s.suppliers) +
            select("Variant", "variantId", optionsVariants(s)) +
            `<div class="form-grid">${input("Unit cost (USD)", "cost", "", "number", 'required min="0.01" max="999999.99" step="0.01"')}${input("Quoted lead time (days)", "leadDays", 5, "number", 'required min="1" max="365"')}${input("Minimum quantity", "minimum", 2, "number", 'required min="1" max="999"')}</div><p class="small">Saving an existing supplier / variant pair updates its quoted terms.</p>`,
          "offer",
        ),
      );
      break;
    case "purchase-form":
      open(
        form(
          "Create purchase order",
          select("Supplier", "supplierId", s.suppliers) +
            select("Variant", "variantId", optionsVariants(s)) +
            select("Destination warehouse", "warehouseId", s.warehouses) +
            input(
              "Quantity",
              "quantity",
              2,
              "number",
              'required min="1" max="999"',
            ) +
            '<p class="small">The supplier must have an offer for this variant. Unit cost and minimum quantity come from that offer. Demo orders contain one line and are received in full.</p>',
          "purchase",
          "",
          "Create purchase order",
        ),
      );
      break;
    case "cancel-form":
      open(
        form(
          "Cancel this order?",
          `<div class="notice">This releases reserved stock and records a full refund.</div>${textarea("Cancellation reason", "reason")}`,
          "cancel",
          hidden("id", d.id),
          "Cancel order",
        ),
      );
      break;
    case "return-form":
    case "claim-form": {
      const o = get(s.orders, d.order),
        i = o.items.find((i) => i.id === d.item);
      open(
        form(
          action === "return-form"
            ? "Request a return"
            : "Submit a warranty claim",
          `<p>${esc(i.name)} · ${esc(i.configuration)}</p>${action === "return-form" ? input("Quantity to return", "quantity", 1, "number", `required min="1" max="${i.quantity}"`) : '<p class="small">Coverage starts on the order date. Describe the manufacturer defect below.</p>'}${textarea("Reason", "reason")}`,
          action === "return-form" ? "return" : "claim",
          hidden("orderId", o.id) + hidden("itemId", i.id),
          "Submit request",
        ),
      );
      break;
    }
    case "ship-form":
      open(
        form(
          "Create shipment",
          input(
            "Demo tracking number",
            "tracking",
            `DEMO-${d.id}`,
            "text",
            'required maxlength="100"',
          ) +
            "<p>Shipping deducts the allocated quantities from on-hand and reserved inventory.</p>",
          "ship",
          hidden("id", d.id),
          "Mark as shipped",
        ),
      );
      break;
  }
}
app.addEventListener("click", clickHandler);
modal.addEventListener("click", clickHandler);
function clickHandler(event) {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const d = el.dataset;
  try {
    if (d.action.endsWith("-form")) {
      openAction(d.action, d);
      return;
    }
    switch (d.action) {
      case "checkout":
        if (api.snapshot().session?.role === "customer") go("/checkout");
        else openCheckoutPrompt();
        break;
      case "checkout-login":
      case "checkout-register":
        modal.close();
        go(d.action === "checkout-register" ? "/register?next=checkout" : "/login?next=checkout");
        break;
      case "close-modal":
        modal.close();
        break;
      case "toggle-password": {
        const field=document.getElementById(d.target);
        const show=field.type==='password';
        field.type=show?'text':'password';
        el.textContent=show?'Hide':'Show';
        el.setAttribute('aria-pressed',String(show));
        el.setAttribute('aria-label',`${show?'Hide':'Show'} ${field.name==='confirmPassword'?'confirm password':'password'}`);
        break;
      }
      case "admin-logout":
        api.logoutAdmin();
        go('/admin/login');
        notify('You have signed out of administration.');
        break;
      case "logout":
        api.logout();
        go("/");
        notify("You have signed out.");
        break;
      case "add-cart":
        api.addToCart(d.id);
        render();
        notify("Added to your cart.");
        break;
      case "remove-cart":
        api.updateCart(d.id, 0);
        render();
        notify("Item removed from your cart.");
        break;
      case "remove-spec":
        confirmAction(
          "Remove specification?",
          "Remove this specification from the variant?",
          () => api.removeSpec(d.variant, d.index),
          "Remove",
        );
        break;
      case "receive":
        confirmAction(
          "Receive purchase order?",
          "Confirm full receipt. This adds all ordered units to the destination warehouse exactly once.",
          () => api.receivePurchase(d.id),
          "Receive stock",
        );
        break;
      case "fulfill":
        api.fulfill(d.id);
        render();
        notify("Order allocated and ready to ship.");
        break;
      case "deliver":
        confirmAction(
          "Mark order delivered?",
          "Confirm delivery and enable return and warranty requests.",
          () => api.deliver(d.id),
          "Mark delivered",
        );
        break;
      case "return-status":
        confirmAction(
          `${d.status === "Refunded" ? "Issue refund" : d.status + " return"}?`,
          d.status === "Refunded"
            ? "Record the return value as refunded."
            : "Update the return workflow to " + esc(d.status) + ".",
          () => api.reviewReturn(d.id, d.status),
          d.status === "Refunded" ? "Issue refund" : "Confirm",
        );
        break;
      case "claim-status":
        confirmAction(
          "Update warranty claim?",
          `Set this claim to ${esc(d.status)}.`,
          () => api.reviewClaim(d.id, d.status),
        );
        break;
    }
  } catch (error) {
    notify(error.message, true);
  }
}
app.addEventListener("submit", submitHandler);
modal.addEventListener("submit", submitHandler);
async function submitHandler(event) {
  const f = event.target;
  if (!f.dataset.form) return;
  event.preventDefault();
  if(f.dataset.busy==='true')return;
  const authForm=['login','register','admin-login'].includes(f.dataset.form);
  const d = Object.fromEntries(new FormData(f));
  const submit=f.querySelector('button[type="submit"], button:not([type])');
  const submitLabel=submit?.textContent;
  if(authForm){f.dataset.busy='true';f.setAttribute('aria-busy','true');submit.disabled=true;submit.textContent=f.dataset.form==='register'?'Creating account…':'Signing in…';}
  let message = "Changes saved.";
  try {
    switch (f.dataset.form) {
      case "search":
        go("/catalog?" + new URLSearchParams({ q: d.q }));
        return;
      case "filters":
        go("/catalog?" + new URLSearchParams(d));
        return;
      case "admin-search":
        go("/admin/products?" + new URLSearchParams(d));
        return;
      case "inventory-filter":
        go("/admin/inventory?" + new URLSearchParams(d));
        return;
      case "orders-filter":
        go("/admin/orders?" + new URLSearchParams(d));
        return;
      case "reports-filter":
        if (d.start > d.end)
          throw Error("The start date must be on or before the end date.");
        go("/admin/reports?" + new URLSearchParams(d));
        return;
      case "add-cart":
        api.addToCart(d.variantId, d.quantity);
        message = "Added to your cart.";
        break;
      case "cart-quantity":
        api.updateCart(d.variantId, d.quantity);
        message = "Cart updated.";
        break;
      case "checkout": {
        const id = api.checkout(d, "approved");
        go("/confirmation/" + id);
        notify("Your order has been placed.");
        return;
      }
      case "login":
        await api.login(d.email,d.password);
        go(d.next === "checkout" ? "/checkout" : "/orders");
        notify("Welcome back.");
        return;
      case "admin-login":
        await api.loginAdmin(d.email,d.password);
        go(adminDestination(d.next));
        notify('Welcome back.');
        return;
      case "register":
        await api.register(d);
        go(d.next === "checkout" ? "/checkout" : "/orders");
        notify("Your account has been created.");
        return;
      case "product":
        api.saveProduct({ ...d, active: d.active === "on" });
        break;
      case "category":
        api.saveCategory(d);
        break;
      case "variant":
        api.saveVariant({ ...d, price: Math.round(Number(d.price) * 100) });
        break;
      case "spec":
        api.saveSpec(d.variantId, d);
        break;
      case "inventory":
        api.adjustInventory(d.variantId, d.warehouseId, d.onHand, d.reason);
        break;
      case "supplier":
        api.saveSupplier(d);
        break;
      case "offer":
        api.saveOffer({ ...d, cost: Math.round(Number(d.cost) * 100) });
        break;
      case "purchase":
        api.createPurchase(d);
        break;
      case "cancel":
        api.cancel(d.id, d.reason);
        message =
          "Order cancelled. Reserved stock released and refund recorded.";
        break;
      case "return":
        api.requestReturn(d.orderId, d.itemId, d.quantity, d.reason);
        message = "Return request submitted for review.";
        break;
      case "claim":
        api.claim(d.orderId, d.itemId, d.reason);
        message = "Warranty claim submitted for review.";
        break;
      case "ship":
        api.ship(d.id, d.tracking);
        message = "Simulated shipment created. Stock updated.";
        break;
      case "confirm":
        pendingConfirmation?.();
        pendingConfirmation = null;
        break;
    }
    if (modal.open) modal.close();
    render();
    notify(message);
  } catch (error) {
    let node = f.querySelector(".form-error");
    if (!node) {
      node = document.createElement("div");
      node.className = "form-error";
      node.setAttribute("role", "alert");
      node.tabIndex = -1;
      f.prepend(node);
    }
    node.hidden = false;
    node.textContent = error.message;
    node.focus();
  } finally {
    if(authForm){delete f.dataset.busy;f.removeAttribute('aria-busy');if(submit){submit.disabled=false;submit.textContent=submitLabel;}}
  }
}
app.addEventListener("change", (event) => {
  const el = event.target;
  try {
    if (el.dataset.variantProduct)
      go(`/product/${el.dataset.variantProduct}?variant=${el.value}`);
  } catch (error) {
    render();
    notify(error.message, true);
  }
});
// Local assets are self-contained; missing or invalid image paths get one reliable fallback.
document.addEventListener(
  "error",
  (event) => {
    const el = event.target;
    if (el instanceof HTMLImageElement && el.hasAttribute("data-fallback")) {
      el.removeAttribute("data-fallback");
      el.src = "assets/images/fallback.svg";
    }
  },
  true,
);
window.addEventListener("hashchange", () => {
  if (modal.open) modal.close();
  render(true);
});
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    api.refresh();
    render();
    notify("Changes from another tab loaded.");
  }
});
render();

document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#main").focus();
  document.querySelector("#main").scrollIntoView();
});
