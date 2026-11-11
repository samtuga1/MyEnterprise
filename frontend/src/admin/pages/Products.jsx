import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, ExternalLink, Pencil, Trash2, Shirt, Save } from 'lucide-react';
import { api, BASE } from '../../shared/api.js';
import { money, priceRange, number, date, plural } from '../../shared/format.js';
import { Field, Modal, useForm, ErrorNotice, EmptyState, Skeleton, useTitle, Spinner, useToast, ConfirmDialog, ProductImage } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, SearchBox, Thumb, TableSkeleton, Switch, ReadOnly } from '../components.jsx';
import { useAction, useCan, useParam } from '../lib.jsx';

const GROUP_LABEL = { DEPARTMENT: 'Department', TYPE: 'Garment type', COLLECTION: 'Collection' };

export function useCategories() {
  return useQuery({ queryKey: ['admin-categories'], queryFn: () => api.get('/admin/categories'), staleTime: 60_000 });
}

export function ProductsList() {
  useTitle('Products', 'MyEnterprise Admin');
  const navigate = useNavigate();
  const can = useCan();
  const [q, setQ] = useParam('q');
  const [status, setStatus] = useParam('status');
  const [category, setCategory] = useParam('category');
  const cats = useCategories();
  const query = useQuery({ queryKey: ['admin-products', q, status, category], queryFn: () => api.get('/admin/products', { q, status, category }), placeholderData: (p) => p });

  return (
    <>
      <PageHeader title="Products" sub="Each product is sold as variants — one size in one colour — with its own SKU, stock and guarantee."
        actions={can.do('catalog') ? <Link className="btn btn--primary" to="/products/new"><Plus size={17} /> New product</Link> : <ReadOnly />} />
      <div className="a-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Name, brand or SKU" label="Search products" />
        <label className="sr-only" htmlFor="p-status">Status</label>
        <select id="p-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All products</option><option value="active">Active</option><option value="archived">Archived</option>
        </select>
        <label className="sr-only" htmlFor="p-cat">Category</label>
        <select id="p-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Every category</option>
          {(cats.data || []).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
        {query.data && <span className="small muted">{number(query.data.length)} products</span>}
      </div>
      <div className="a-panel a-panel--flush" style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
        {query.isLoading ? <TableSkeleton cols={7} /> : query.isError ? <div style={{ padding: 16 }}><ErrorNotice error={query.error} onRetry={query.refetch} /></div>
          : query.data.length === 0 ? <EmptyState icon={<Shirt />} title="No products match" /> : (
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr>
                  <th scope="col">Product</th><th scope="col">Type</th><th scope="col" className="num">Price</th><th scope="col" className="num">Variants</th>
                  <th scope="col" className="num">Available</th><th scope="col" className="num">Units sold</th><th scope="col">Status</th>
                </tr></thead>
                <tbody>
                  {query.data.map((p) => (
                    <tr key={p.id} className={`is-link ${p.isActive ? '' : 'muted-row'}`} onClick={() => navigate(`/products/${p.id}`)}>
                      <td><div className="a-cell-product"><Thumb src={p.image} alt="" /><span><Link className="a-link" to={`/products/${p.id}`} onClick={(e) => e.stopPropagation()}><strong>{p.name}</strong></Link><span className="small">{p.brand}</span></span></div></td>
                      <td className="small">{p.type || '—'}</td>
                      <td className="num">{priceRange(p.minPrice, p.maxPrice)}</td>
                      <td className="num">{p.variants} <span className="muted small">· {p.colors} col.</span></td>
                      <td className="num">{p.available <= 0 ? <span style={{ color: 'var(--danger)' }}>Sold out</span> : number(p.available)}</td>
                      <td className="num">{number(p.unitsSold)}</td>
                      <td><span className={`badge ${p.isActive ? 'badge--ok' : ''}`}>{p.isActive ? 'Active' : 'Archived'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}

/* ----------------------------------------------------- category checkboxes */
function CategoryPicker({ categories, value, onChange, error, disabled }) {
  const groups = ['DEPARTMENT', 'TYPE', 'COLLECTION'];
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="field">
      <div className="a-checkgroups">
        {groups.map((g) => (
          <fieldset key={g} disabled={disabled}>
            <legend>{GROUP_LABEL[g]}</legend>
            {categories.filter((c) => c.group === g).map((c) => (
              <label key={c.id} className="check"><input type="checkbox" checked={value.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}</label>
            ))}
          </fieldset>
        ))}
      </div>
      {error && <span className="field__error">{error}</span>}
    </div>
  );
}

function ProductFields({ form, categories, disabled }) {
  return (
    <div className="form-grid">
      <Field label="Product name" error={form.errors.name}><input className="input" value={form.values.name} onChange={form.set('name')} disabled={disabled} /></Field>
      <Field label="Brand" error={form.errors.brand}><input className="input" value={form.values.brand} onChange={form.set('brand')} disabled={disabled} /></Field>
      <Field className="span-2" label="Description" hint="Shown on the product page. At least 10 characters." error={form.errors.description}>
        <textarea className="textarea" rows={4} value={form.values.description} onChange={form.set('description')} disabled={disabled} />
      </Field>
      <div className="span-2"><CategoryPicker categories={categories} value={form.values.categoryIds} onChange={form.set('categoryIds')} error={form.errors.categoryIds} disabled={disabled} /></div>
      <div className="span-2"><Switch checked={form.values.isActive} onChange={form.set('isActive')} disabled={disabled} label="Sold in the store (archived products stay in order history)" /></div>
    </div>
  );
}

export function NewProduct() {
  useTitle('New product', 'MyEnterprise Admin');
  const navigate = useNavigate();
  const cats = useCategories();
  const form = useForm({ name: '', brand: '', description: '', categoryIds: [], isActive: true });
  const create = useAction((v) => api.post('/admin/products', v), {
    invalidate: [['admin-products']], success: 'Product created. Add its sizes and colours next.',
    onSuccess: (p) => navigate(`/products/${p.id}`, { replace: true }), onError: form.fromError,
  });
  return (
    <>
      <PageHeader back={{ to: '/products', label: 'Products' }} title="New product" sub="Start with the details; sizes, colours and pictures come next." />
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(form.values); }} noValidate>
        <Panel title="Details">{cats.data ? <ProductFields form={form} categories={cats.data} /> : <Skeleton height={200} />}</Panel>
        <div className="a-sticky-actions">
          <Link className="btn btn--secondary" to="/products">Discard</Link>
          <button className="btn btn--primary" type="submit" disabled={create.isPending}>{create.isPending && <Spinner />} Create product</button>
        </div>
      </form>
    </>
  );
}

/* ------------------------------------------------------------ the editor */
export function ProductEditor() {
  const { id } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const editable = can.do('catalog');
  const key = ['admin-product', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/admin/products/${id}`) });
  const cats = useCategories();
  const p = q.data;
  useTitle(p ? p.name : 'Product', 'MyEnterprise Admin');
  const form = useForm({ name: '', brand: '', description: '', categoryIds: [], isActive: true });
  const [loadedFor, setLoadedFor] = useState(null);
  useEffect(() => {
    if (p && loadedFor !== p.id) {
      form.setValues({ name: p.name, brand: p.brand, description: p.description, categoryIds: p.categoryIds, isActive: p.isActive });
      setLoadedFor(p.id);
    }
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = p && loadedFor === p.id && (form.values.name !== p.name || form.values.brand !== p.brand || form.values.description !== p.description
    || form.values.isActive !== p.isActive || [...form.values.categoryIds].sort().join() !== [...p.categoryIds].sort().join());

  const save = useAction((v) => api.patch(`/admin/products/${id}`, v), {
    invalidate: [['admin-products']], success: 'Product saved.',
    onSuccess: (d) => { qc.setQueryData(key, d); form.setValues({ name: d.name, brand: d.brand, description: d.description, categoryIds: d.categoryIds, isActive: d.isActive }); },
    onError: form.fromError,
  });
  const [variantEdit, setVariantEdit] = useState(null);
  const [adding, setAdding] = useState(false);

  if (q.isLoading) return <><Skeleton width={320} height={40} /><div className="a-gap"><TableSkeleton /></div></>;
  if (q.isError) return <ErrorNotice error={q.error} onRetry={q.refetch} />;

  const colors = [...new Map(p.variants.map((v) => [v.color, v])).values()];

  return (
    <>
      <PageHeader back={{ to: '/products', label: 'Products' }} title={p.name}
        sub={<>{p.brand} · maintained by {p.manager} · added {date(p.createdAt)} · <span className={`badge ${p.isActive ? 'badge--ok' : ''}`}>{p.isActive ? 'Active' : 'Archived'}</span></>}
        actions={<>
          {p.isActive && <a className="btn btn--secondary" href={`${BASE}/product/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> View in store</a>}
          {!editable && <ReadOnly />}
        </>} />

      <form onSubmit={(e) => { e.preventDefault(); save.mutate(form.values); }} noValidate>
        <Panel title="Details">{cats.data ? <ProductFields form={form} categories={cats.data} disabled={!editable} /> : <Skeleton height={220} />}</Panel>
        {dirty && editable && (
          <div className="a-sticky-actions">
            <button type="button" className="btn btn--secondary" onClick={() => form.setValues({ name: p.name, brand: p.brand, description: p.description, categoryIds: p.categoryIds, isActive: p.isActive })}>Undo changes</button>
            <button className="btn btn--primary" type="submit" disabled={save.isPending}>{save.isPending ? <Spinner /> : <Save size={16} />} Save product</button>
          </div>
        )}
      </form>

      <PicturesPanel product={p} editable={editable} onUpdated={(d) => qc.setQueryData(key, d)} />

      <Panel className="a-gap" title="Sizes and colours" sub={`${p.variants.length} variants in ${colors.length} colours`} flush
        actions={editable && <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAdding(true)}><Plus size={15} /> Add variant</button>}>
        {colors.length === 0 && <EmptyState title="No variants yet">Add the first size and colour to start selling this product.</EmptyState>}
        {colors.map((c) => (
          <ColorGroup key={c.color} product={p} color={c} editable={editable} onEdit={setVariantEdit} />
        ))}
      </Panel>

      <div className="a-grid a-grid--2 a-gap">
        <Panel title="Quality guarantee">
          <p className="small" style={{ lineHeight: 1.6 }}>{p.warrantyCoverage || <span className="muted">No guarantee recorded.</span>}</p>
        </Panel>
        <Panel title="Style it with" sub="CompatibilityRule rows shown on the product page">
          {p.styleWith.length ? (
            <ul className="rows">{p.styleWith.map((r) => (
              <li key={r.id} className="small"><span className="muted">{r.source} →</span> {r.target} <span className="badge badge--plain" style={{ marginLeft: 6 }}>{r.type.replace('_', ' ').toLowerCase()}</span></li>
            ))}</ul>
          ) : <p className="muted small">No pairings for this product.</p>}
        </Panel>
      </div>

      {variantEdit && <VariantDialog variant={variantEdit} onClose={() => setVariantEdit(null)} onSaved={(d) => { qc.setQueryData(key, d); setVariantEdit(null); }} />}
      <AddVariantDialog open={adding} product={p} onClose={() => setAdding(false)} onSaved={(d) => { qc.setQueryData(key, d); setAdding(false); }} />
    </>
  );
}

/* ------------------------------------------------------------ pictures
   Stored in the ProductImage table as binary data. Uploads are checked, shrunk
   to at most 1200 × 1500 and re-encoded as JPEG by the API before they are saved. */
const MAX_UPLOAD = 12 * 1024 * 1024;
const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function checkFile(file, toast) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error('Choose a JPEG or PNG picture.'); return false; }
  if (file.size > MAX_UPLOAD) { toast.error('The file is larger than 12 MB.'); return false; }
  return true;
}

function PicturesPanel({ product, editable, onUpdated }) {
  const colors = [...new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()];
  const groups = [
    ...colors.map(([name, hex]) => ({ key: name, color: name, hex, label: name })),
    { key: '*', color: null, label: 'Every colour' },
  ];
  const bytes = product.images.reduce((sum, i) => sum + i.bytes, 0);
  return (
    <Panel className="a-gap" title="Pictures" flush
      sub={product.images.length ? `${plural(product.images.length, 'picture')}, ${kb(bytes)}, stored in the database` : 'Stored in the database. Add the first one for each colour.'}>
      {groups.map((g) => (
        <PictureRow key={g.key} product={product} group={g} editable={editable} onUpdated={onUpdated}
          images={product.images.filter((i) => (g.color === null ? i.color === null : i.color === g.color))} />
      ))}
      <p className="small muted a-pictures__note">JPEG or PNG up to 12 MB. The store shrinks it to at most 1200 × 1500 pixels and removes camera data (location, device). The main picture of a colour is the one shoppers see first; pictures under “Every colour” follow each colour’s own.</p>
    </Panel>
  );
}

function PictureRow({ product, group, images, editable, onUpdated }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const run = async (what, work, done) => {
    setBusy(what);
    try {
      onUpdated(await work());
      if (done) toast(done);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally { setBusy(null); }
  };
  const upload = (file) => {
    if (!file || !checkFile(file, toast)) return;
    const data = new FormData();
    data.append('image', file);
    if (group.color) data.append('color', group.color);
    run('upload', () => api.upload(`/admin/products/${product.id}/images`, data), `Picture added to ${group.color ? group.color : 'every colour'}.`);
  };
  return (
    <div className="a-pictures">
      <div className="a-pictures__label">
        {group.color && <span className="swatch" style={{ '--sw': group.hex || '#ccc', width: 18, height: 18 }} aria-hidden="true" />}
        <strong>{group.label}</strong>
        <span className="small muted">{images.length ? plural(images.length, 'picture') : group.color ? 'No picture yet' : 'Optional'}</span>
      </div>
      <ul className="a-pictures__list">
        {images.map((img) => (
          <li key={img.id} className="a-picture" title={img.credit || undefined}>
            <span className="a-picture__img"><ProductImage src={img.src} alt={img.alt} /></span>
            {img.isMain && <span className="badge badge--ok a-picture__main">Main</span>}
            <span className="a-picture__meta"><span>{img.type}</span><span>{img.width} × {img.height} · {kb(img.bytes)}</span></span>
            {editable && (
              <span className="a-picture__actions">
                {!img.isMain && (
                  <button type="button" className="btn btn--quiet btn--sm" disabled={!!busy}
                    onClick={() => run(img.id, () => api.post(`/admin/images/${img.id}/main`), `Main picture for ${group.color || 'every colour'} changed.`)}>
                    {busy === img.id ? <Spinner /> : null} Make main
                  </button>
                )}
                <button type="button" className="btn btn--quiet btn--icon btn--sm" aria-label={`Delete picture: ${img.alt}`} disabled={!!busy} onClick={() => setDeleting(img)}><Trash2 size={15} /></button>
              </span>
            )}
          </li>
        ))}
        {editable && (
          <li>
            <label className={`a-picture a-picture--add ${busy === 'upload' ? 'is-busy' : ''}`}>
              {busy === 'upload' ? <Spinner /> : <Upload size={18} aria-hidden="true" />}
              <span>{busy === 'upload' ? 'Uploading' : 'Add picture'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy === 'upload'}
                aria-label={`Add a picture for ${group.color || 'every colour'}`}
                onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </li>
        )}
      </ul>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger busy={busy === deleting?.id} confirmLabel="Delete picture"
        title="Delete this picture?"
        onConfirm={async () => { if (await run(deleting.id, () => api.delete(`/admin/images/${deleting.id}`), 'Picture deleted.')) setDeleting(null); }}>
        <p>{deleting?.alt}. It is removed from the database{deleting?.isMain && images.length > 1 ? '; the next picture becomes the main one' : ''}.</p>
      </ConfirmDialog>
    </div>
  );
}

function ColorGroup({ product, color, editable, onEdit }) {
  const variants = product.variants.filter((v) => v.color === color.color);
  const image = variants.find((v) => v.image)?.image || product.image;

  return (
    <div className="a-color-group">
      <div className="a-color-group__head">
        <Thumb src={image} alt={`${product.name} in ${color.color}`} large />
        <span className="swatch" style={{ '--sw': color.colorHex || '#ccc', width: 22, height: 22 }} aria-hidden="true" />
        <h3>{color.color}</h3>
        <span className="small muted">{plural(variants.length, 'size')} · {number(variants.reduce((s, v) => s + v.available, 0))} available</span>
      </div>
      <div className="a-table-wrap">
        <table className="a-table a-table--compact">
          <thead><tr>
            <th scope="col">Size</th><th scope="col">SKU</th><th scope="col" className="num">Price</th><th scope="col" className="num">Guarantee</th>
            <th scope="col">Stock by warehouse</th><th scope="col" className="num">Available</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} className={v.isActive ? '' : 'muted-row'}>
                <td><strong style={{ fontWeight: 500 }}>{v.size}</strong></td>
                <td className="a-mono">{v.sku}</td>
                <td className="num">{money(v.price)}</td>
                <td className="num">{v.warrantyMonths ? `${v.warrantyMonths} mo` : '—'}</td>
                <td className="small">{v.stock.length ? v.stock.map((s) => `${s.warehouse.split(' ')[0]} ${s.onHand}${s.reserved ? ` (${s.reserved} res.)` : ''}`).join(' · ') : <span className="muted">No stock record</span>}</td>
                <td className="num">{v.available}</td>
                <td><span className={`badge ${v.isActive ? 'badge--ok' : ''}`}>{v.isActive ? 'On sale' : 'Retired'}</span></td>
                <td className="num">{editable && <button type="button" className="btn btn--quiet btn--sm" onClick={() => onEdit(v)} aria-label={`Edit ${v.size} ${v.color}`}><Pencil size={15} /> Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VariantDialog({ variant, onClose, onSaved }) {
  const toast = useToast();
  const form = useForm({ price: variant.price, size: variant.size, colorHex: variant.colorHex || '', warrantyMonths: variant.warrantyMonths ?? '', isActive: variant.isActive });
  const [specs, setSpecs] = useState(variant.specs.map((s) => ({ name: s.name, value: s.value, unit: s.unit || '' })));
  const [busy, setBusy] = useState(false);
  const specsChanged = JSON.stringify(specs) !== JSON.stringify(variant.specs.map((s) => ({ name: s.name, value: s.value, unit: s.unit || '' })));

  const submit = async () => {
    setBusy(true);
    try {
      const body = { price: form.values.price, size: form.values.size, colorHex: form.values.colorHex, isActive: form.values.isActive };
      if (form.values.warrantyMonths !== '' && variant.warrantyMonths !== null) body.warrantyMonths = form.values.warrantyMonths;
      let data = await api.patch(`/admin/variants/${variant.id}`, body);
      if (specsChanged) data = await api.put(`/admin/variants/${variant.id}/specs`, { specs: specs.filter((s) => s.name.trim() || s.value.trim()) });
      toast(`${variant.size} · ${variant.color} saved.`);
      onSaved(data);
    } catch (e) {
      form.fromError(e);
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} wide title={`${variant.size} · ${variant.color}`} description={`SKU ${variant.sku}. ${variant.orderLines ? `Sold on ${plural(variant.orderLines, 'order line')} — past orders keep the price they were sold at.` : 'Not sold yet.'}`}
      footer={<>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>{busy && <Spinner />} Save variant</button>
      </>}>
      <div className="form-grid">
        <Field label="Price (USD)" error={form.errors.price}><input className="input" inputMode="decimal" value={form.values.price} onChange={form.set('price')} /></Field>
        <Field label="Size label" error={form.errors.size}><input className="input" value={form.values.size} onChange={form.set('size')} /></Field>
        <Field label="Swatch colour" hint="Hex, like #9CAF88" error={form.errors.colorHex}>
          <div className="row" style={{ '--gap': '8px', flexWrap: 'nowrap' }}>
            <input type="color" aria-label="Pick swatch colour" value={/^#[0-9a-f]{6}$/i.test(form.values.colorHex) ? form.values.colorHex : '#cccccc'} onChange={form.set('colorHex')} style={{ width: 48, height: 48, border: 0, background: 'none', padding: 0 }} />
            <input className="input" value={form.values.colorHex} onChange={form.set('colorHex')} />
          </div>
        </Field>
        <Field label="Guarantee (months)" hint={variant.warrantyMonths === null ? 'No guarantee on this variant' : '1 to 60'} error={form.errors.warrantyMonths}>
          <input className="input" inputMode="numeric" value={form.values.warrantyMonths} onChange={form.set('warrantyMonths')} disabled={variant.warrantyMonths === null} />
        </Field>
        <div className="span-2"><Switch checked={form.values.isActive} onChange={form.set('isActive')} label="On sale in this size and colour" /></div>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 4px' }}>Specifications</h3>
      <p className="small muted" style={{ marginBottom: 12 }}>Fabric, care and size-specific measurements (ProductSpecification).</p>
      <div className="stack" style={{ '--gap': '8px' }}>
        {specs.map((s, i) => (
          <div className="a-spec-row" key={i}>
            <input className="input" aria-label={`Specification ${i + 1} name`} placeholder="Name" value={s.name} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className="input" aria-label={`Specification ${i + 1} value`} placeholder="Value" value={s.value} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <input className="input" aria-label={`Specification ${i + 1} unit`} placeholder="Unit" value={s.unit} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
            <button type="button" className="btn btn--quiet btn--icon btn--sm" aria-label={`Remove specification ${s.name || i + 1}`} onClick={() => setSpecs(specs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className="btn btn--secondary btn--sm" style={{ width: 'max-content' }} onClick={() => setSpecs([...specs, { name: '', value: '', unit: '' }])}><Plus size={15} /> Add specification</button>
      </div>
    </Modal>
  );
}

function AddVariantDialog({ open, product, onClose, onSaved }) {
  const toast = useToast();
  const colors = useMemo(() => [...new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()], [product]);
  const form = useForm({ size: '', color: colors[0]?.[0] || '', colorHex: colors[0]?.[1] || '', price: product.variants[0]?.price || '' });
  const [file, setFile] = useState(null);
  useEffect(() => { if (open) { form.setErrors({}); setFile(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const newColor = form.values.color.trim() !== '' && !colors.some(([c]) => c.toLowerCase() === form.values.color.trim().toLowerCase());
  const add = useAction(async (v) => {
    let data = await api.post(`/admin/products/${product.id}/variants`, v);
    if (file && newColor) {
      // The variant exists now; a failed picture upload must not undo it, so report it separately.
      const upload = new FormData();
      upload.append('image', file);
      upload.append('color', v.color.trim());
      try { data = await api.upload(`/admin/products/${product.id}/images`, upload); } catch (e) { toast.error(`The variant was added, but the picture was not: ${e.message}`); }
    }
    return data;
  }, {
    invalidate: [['admin-products']], success: 'Variant added. It starts with no stock — receive a purchase order to stock it.',
    onSuccess: onSaved, onError: form.fromError,
  });
  const pickColor = (name) => {
    const known = colors.find(([c]) => c.toLowerCase() === name.toLowerCase());
    form.setValues((s) => ({ ...s, color: name, colorHex: known ? known[1] || '' : s.colorHex }));
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a variant" description="A new size in an existing colour, or a new colour. Fabric, care and guarantee are copied from the same colour."
      footer={<>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn--primary" onClick={() => add.mutate(form.values)} disabled={add.isPending}>{add.isPending && <Spinner />} Add variant</button>
      </>}>
      <div className="form-grid">
        <Field label="Size" hint="For example M, W30, EU 41, One size" error={form.errors.size}><input className="input" value={form.values.size} onChange={form.set('size')} data-autofocus /></Field>
        <Field label="Price (USD)" error={form.errors.price}><input className="input" inputMode="decimal" value={form.values.price} onChange={form.set('price')} /></Field>
        <Field label="Colour" error={form.errors.color}>
          <input className="input" list="variant-colors" value={form.values.color} onChange={(e) => pickColor(e.target.value)} />
        </Field>
        <datalist id="variant-colors">{colors.map(([c]) => <option key={c} value={c} />)}</datalist>
        <Field label="Swatch colour" hint="Hex, like #9CAF88" error={form.errors.colorHex}><input className="input" value={form.values.colorHex} onChange={form.set('colorHex')} /></Field>
        {newColor && (
          <Field className="span-2" label={`Picture of the ${form.values.color.trim()} colour (optional)`} hint={file ? `${file.name} · ${kb(file.size)}` : 'JPEG or PNG up to 12 MB. You can also add it later under Pictures.'}>
            <input className="input" type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(e) => { const f = e.target.files?.[0] || null; const ok = !!f && checkFile(f, toast); setFile(ok ? f : null); if (!ok) e.target.value = ''; }} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
