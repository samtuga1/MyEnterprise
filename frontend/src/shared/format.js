// Display formatting. Money arrives from the API as "58.00" strings; it is
// only formatted here, never added up in the browser for anything that matters.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('en-US');

export const money = (v) => usd.format(Number(v || 0));
export const moneyShort = (v) => (Number(v) % 1 === 0 ? usd0.format(Number(v || 0)) : usd.format(Number(v || 0)));
export const number = (v) => int.format(Number(v || 0));
export const percent = (v, digits = 1) => `${Number(v || 0).toFixed(digits)}%`;

const toDate = (v) => (v instanceof Date ? v : new Date(String(v).replace(' ', 'T')));
export const date = (v, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => (v ? toDate(v).toLocaleDateString('en-US', opts) : '—');
export const dateShort = (v) => date(v, { month: 'short', day: 'numeric' });
export const dateTime = (v) => (v ? toDate(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export function relative(v) {
  if (!v) return '—';
  const diff = (Date.now() - toDate(v).getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return date(v);
}

export const priceRange = (min, max) => (Number(min) === Number(max) ? moneyShort(min) : `${moneyShort(min)} – ${moneyShort(max)}`);

/** Status codes from the database → words people use, plus a badge tone. */
const STATUS = {
  PLACED: ['Order placed', 'accent'],
  PROCESSING: ['Being packed', 'warn'],
  SHIPPED: ['On its way', 'info'],
  DELIVERED: ['Delivered', 'ok'],
  CANCELLED: ['Cancelled', 'plain'],
  REQUESTED: ['Requested', 'accent'],
  APPROVED: ['Approved', 'warn'],
  REJECTED: ['Declined', 'danger'],
  REFUNDED: ['Refunded', 'ok'],
  SUBMITTED: ['Submitted', 'accent'],
  RESOLVED: ['Resolved', 'ok'],
  ORDERED: ['Ordered', 'info'],
  RECEIVED: ['Received', 'ok'],
  IN_TRANSIT: ['In transit', 'info'],
  RESERVED: ['Reserved', 'warn'],
  RELEASED: ['Released', 'plain'],
  CAPTURED: ['Paid', 'ok'],
  PARTIALLY_REFUNDED: ['Partly refunded', 'warn'],
  PENDING: ['Pending', 'plain'],
  COMPLETED: ['Completed', 'ok'],
  SUCCESS: ['Succeeded', 'ok'],
  FAILED: ['Failed', 'danger'],
  ACTIVE: ['Active', 'ok'],
  ABANDONED: ['Abandoned', 'plain'],
};
export const statusLabel = (code) => (STATUS[code] ? STATUS[code][0] : String(code || '').toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
export const statusTone = (code) => (STATUS[code] ? STATUS[code][1] : 'plain');

export const PAYMENT_LABEL = { CARD: 'Card', PAYPAL: 'PayPal', APPLE_PAY: 'Apple Pay' };
export const ROLE_LABEL = { ADMINISTRATOR: 'Administrator', OPERATIONS: 'Operations', CATALOG: 'Catalog', SUPPORT: 'Customer care' };
export const REASON_LABEL = {
  OPENING_BALANCE: 'Opening balance', PURCHASE_RECEIPT: 'Purchase receipt', SALE_SHIPMENT: 'Shipped to customer',
  RETURN_RESTOCK: 'Return restocked', ADJUSTMENT: 'Adjustment', DAMAGE_WRITE_OFF: 'Damage write-off',
};

export const plural = (n, one, many = `${one}s`) => `${number(n)} ${Number(n) === 1 ? one : many}`;
