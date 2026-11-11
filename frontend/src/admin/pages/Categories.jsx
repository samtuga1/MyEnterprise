import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../shared/api.js';
import { Field, Modal, useForm, ConfirmDialog, ErrorNotice, useTitle, Spinner } from '../../shared/ui/index.jsx';
import { PageHeader, Panel, TableSkeleton, ReadOnly } from '../components.jsx';
import { useAction, useCan } from '../lib.jsx';
import { useCategories } from './Products.jsx';

const GROUPS = [
  ['DEPARTMENT', 'Departments', 'Who it is for. Shown as the top of the store navigation.'],
  ['TYPE', 'Garment types', 'Every product has exactly one type; reports group revenue by it.'],
  ['COLLECTION', 'Collections', 'Editorial edits such as New in. A product can be in several.'],
];

export default function Categories() {
  useTitle('Categories', 'MyEnterprise Admin');
  const can = useCan();
  const editable = can.do('catalog');
  const qc = useQueryClient();
  const q = useCategories();
  const [editing, setEditing] = useState(null); // {id?, name, group}
  const [deleting, setDeleting] = useState(null);
  const form = useForm({ name: '', group: 'TYPE' });
  const refresh = (list) => qc.setQueryData(['admin-categories'], Array.isArray(list) ? list : list.categories);

  const save = useAction((v) => (v.id ? api.patch(`/admin/categories/${v.id}`, v) : api.post('/admin/categories', v)), {
    invalidate: [['admin-products']], success: (_, v) => (v.id ? 'Category renamed.' : 'Category added.'),
    onSuccess: (d) => { refresh(d); setEditing(null); }, onError: form.fromError,
  });
  const remove = useAction((c) => api.delete(`/admin/categories/${c.id}`), {
    success: 'Category deleted. Its products keep their other categories.', onSuccess: (d) => { refresh(d); setDeleting(null); },
    onError: () => setDeleting(null),
  });
  const openEditor = (c) => { form.setValues({ name: c?.name || '', group: c?.group || 'TYPE' }); form.setErrors({}); setEditing(c || {}); };

  return (
    <>
      <PageHeader title="Categories" sub="Products link to categories through ProductCategory, a many-to-many table: a coat can be in Women, Outerwear and New in at once."
        actions={editable ? <button type="button" className="btn btn--primary" onClick={() => openEditor(null)}><Plus size={17} /> New category</button> : <ReadOnly />} />
      {q.isLoading ? <TableSkeleton /> : q.isError ? <ErrorNotice error={q.error} onRetry={q.refetch} /> : (
        <div className="a-grid a-grid--3">
          {GROUPS.map(([g, title, sub]) => (
            <Panel key={g} title={title} sub={sub} flush>
              <ul>
                {q.data.filter((c) => c.group === g).map((c) => (
                  <li key={c.id} className="row row--between" style={{ padding: '10px 20px', borderBottom: '1px solid var(--line)' }}>
                    <span>
                      <Link className="a-link" to={`/products?category=${c.slug}`}>{c.name}</Link>
                      <span className="small muted"> · {c.products} products · /{c.slug}</span>
                    </span>
                    {editable && (
                      <span className="row" style={{ '--gap': '2px' }}>
                        <button type="button" className="btn btn--quiet btn--icon btn--sm" aria-label={`Rename ${c.name}`} onClick={() => openEditor(c)}><Pencil size={15} /></button>
                        <button type="button" className="btn btn--quiet btn--icon btn--sm" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}><Trash2 size={15} /></button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Rename ${editing.name}` : 'New category'}
        footer={<>
          <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate({ ...form.values, id: editing?.id })}>{save.isPending && <Spinner />} Save category</button>
        </>}>
        <div className="stack">
          <Field label="Name" error={form.errors.name}><input className="input" value={form.values.name} onChange={form.set('name')} data-autofocus /></Field>
          <Field label="Group" error={form.errors.group}>
            <select className="select" value={form.values.group} onChange={form.set('group')}>
              {GROUPS.map(([g, t]) => <option key={g} value={g}>{t}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger busy={remove.isPending}
        title={`Delete ${deleting?.name}?`} confirmLabel="Delete category" onConfirm={() => remove.mutate(deleting)}>
        <p>{deleting?.products ? `${deleting.products} products lose this category (the link rows cascade). The products themselves stay.` : 'No products use it.'}</p>
      </ConfirmDialog>
    </>
  );
}
