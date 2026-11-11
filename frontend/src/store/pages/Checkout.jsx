import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, ShoppingBag } from 'lucide-react';
import { api } from '../../shared/api.js';
import { money } from '../../shared/format.js';
import { EmptyState, ErrorNotice, Field, ProductImage, Skeleton, useForm, useTitle } from '../../shared/ui/index.jsx';
import { useCart } from '../hooks.js';

const REGIONS = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

export default function Checkout() {
  useTitle('Checkout');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: cart, isLoading } = useCart();
  const { data: defaults } = useQuery({ queryKey: ['account', 'checkout-defaults'], queryFn: () => api.get('/checkout/defaults') });
  const form = useForm({ recipient: '', line1: '', city: '', region: '', postalCode: '', country: 'US', phone: '', deliveryMethod: 'STANDARD', paymentMethod: 'CARD' });
  const { values, errors, set, setValues, fromError } = form;

  useEffect(() => {
    if (defaults) setValues((v) => ({ ...v, ...Object.fromEntries(Object.entries(defaults).filter(([, x]) => x)) }));
  }, [defaults, setValues]);

  const place = useMutation({
    mutationFn: (body) => api.post('/checkout', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['account'] });
      qc.invalidateQueries({ queryKey: ['product'] });
      navigate(`/order/${res.orderNumber}/thanks`, { replace: true });
    },
    onError: fromError,
  });

  if (isLoading) return <div className="wrap page-pad"><Skeleton height={400} /></div>;
  if (!cart?.lines.length && !place.isSuccess) {
    return (
      <div className="wrap page-pad">
        <EmptyState icon={<ShoppingBag />} title="Your bag is empty" action={<Link to="/shop/new-in" className="btn btn--primary">Shop new arrivals</Link>}>
          Add a few pieces, then come back to check out.
        </EmptyState>
      </div>
    );
  }

  const subtotal = Number(cart.subtotal);
  // Same rule as sp_checkout_cart: express 18.00; standard free from 150.00, otherwise 6.00.
  const fee = values.deliveryMethod === 'EXPRESS' ? 18 : subtotal >= 150 ? 0 : 6;
  const submit = (e) => { e.preventDefault(); place.mutate(values); };

  return (
    <div className="wrap page-pad">
      <h1 className="page-title">Checkout</h1>
      <form className="checkout" onSubmit={submit} noValidate>
        <div className="stack" style={{ '--gap': '40px' }}>
          <section aria-labelledby="ship-h">
            <h2 id="ship-h" className="checkout__h"><span className="checkout__step">1</span> Delivery address</h2>
            <div className="form-grid">
              <Field label="Full name" error={errors.recipient} className="span-2"><input className="input" autoComplete="name" value={values.recipient} onChange={set('recipient')} /></Field>
              <Field label="Street address" error={errors.line1} className="span-2"><input className="input" autoComplete="address-line1" value={values.line1} onChange={set('line1')} /></Field>
              <Field label="City" error={errors.city}><input className="input" autoComplete="address-level2" value={values.city} onChange={set('city')} /></Field>
              <Field label="State" error={errors.region}>
                <select className="select" autoComplete="address-level1" value={values.region} onChange={set('region')}>
                  <option value="">Choose a state</option>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="ZIP code" error={errors.postalCode}><input className="input" autoComplete="postal-code" inputMode="numeric" value={values.postalCode} onChange={set('postalCode')} /></Field>
              <Field label="Phone, for the courier" hint="Optional" error={errors.phone}><input className="input" type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} /></Field>
            </div>
          </section>

          <section aria-labelledby="del-h">
            <h2 id="del-h" className="checkout__h"><span className="checkout__step">2</span> Delivery</h2>
            <div className="choice" role="radiogroup" aria-labelledby="del-h">
              {[
                ['STANDARD', 'Standard delivery', '2–5 working days', subtotal >= 150 ? 'Free' : money(6)],
                ['EXPRESS', 'Express delivery', '1–2 working days with FedEx', money(18)],
              ].map(([value, title, meta, price]) => (
                <label key={value} className="choice__option">
                  <input type="radio" name="delivery" value={value} checked={values.deliveryMethod === value} onChange={set('deliveryMethod')} />
                  <span className="choice__body"><span className="choice__title">{title}</span><span className="choice__meta">{meta}</span></span>
                  <span className="price">{price}</span>
                </label>
              ))}
            </div>
          </section>

          <section aria-labelledby="pay-h">
            <h2 id="pay-h" className="checkout__h"><span className="checkout__step">3</span> Payment</h2>
            <div className="choice" role="radiogroup" aria-labelledby="pay-h">
              {[['CARD', 'Card'], ['PAYPAL', 'PayPal'], ['APPLE_PAY', 'Apple Pay']].map(([value, title]) => (
                <label key={value} className="choice__option">
                  <input type="radio" name="payment" value={value} checked={values.paymentMethod === value} onChange={set('paymentMethod')} />
                  <span className="choice__body"><span className="choice__title">{title}</span></span>
                </label>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>The payment is taken when you place the order. Your card details are never stored by MyEnterprise.</p>
          </section>
        </div>

        <aside className="summary">
          <h2 className="summary__title">Your order</h2>
          <ul className="summary__lines">
            {cart.lines.map((l) => (
              <li key={l.variantId}>
                <span className="summary__thumb frame frame--45"><ProductImage src={l.image} alt="" /><span className="summary__qty">{l.quantity}</span></span>
                <span className="grow"><span className="summary__name">{l.name}</span><span className="small muted">{l.color} · {l.size}</span></span>
                <span className="price">{money(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="summary__rows">
            <div><dt>Subtotal</dt><dd className="price">{money(subtotal)}</dd></div>
            <div><dt>Delivery</dt><dd className="price">{fee === 0 ? 'Free' : money(fee)}</dd></div>
            <div className="summary__total"><dt>Total</dt><dd className="price">{money(subtotal + fee)}</dd></div>
          </dl>
          {place.error && !Object.keys(place.error.fields || {}).length && <ErrorNotice error={place.error} />}
          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={place.isPending || !cart.canCheckout}>
            {place.isPending ? <><span className="spinner" /> Placing your order</> : <><Lock size={17} /> Place order · {money(subtotal + fee)}</>}
          </button>
          <p className="small muted">Stock is held for you the moment you place the order.</p>
        </aside>
      </form>
    </div>
  );
}
