// src/pages/Templates.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../services/templates';
import { PageHeader, Card, Modal, Badge, EmptyState, ConfirmDialog } from '../components/ui';
import { Layout, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { TEMPLATE_TYPES } from '../utils/formatters';

const EMPTY = { name: '', type: 'treatment_note', description: '', default_goals: '', default_description: '', active: true };

export default function Templates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const t = await getTemplates();
    setTemplates(t);
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (editItem) await updateTemplate(editItem.id, form);
    else await createTemplate(form);
    setFormOpen(false);
    load();
  };

  const openEdit = (t) => { setEditItem(t); setForm({ ...EMPTY, ...t }); setFormOpen(true); };
  const openAdd = () => { setEditItem(null); setForm(EMPTY); setFormOpen(true); };

  const toggleActive = async (t) => {
    await updateTemplate(t.id, { active: !t.active });
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="תבניות" subtitle="תבניות מסמך לשימוש חוזר בטיפולים" actions={
        <button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> תבנית חדשה</button>
      } />

      {templates.length === 0 ? (
        <EmptyState icon={Layout} title="אין תבניות" description="צור תבנית ראשונה לשימוש בטיפולים" action={
          <button onClick={openAdd} className="btn-primary">צור תבנית</button>
        } />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {templates.map(t => {
            const typeLabel = TEMPLATE_TYPES.find(x => x.value === t.type)?.label;
            return (
              <Card key={t.id} className={`opacity-${t.active ? '100' : '60'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{t.name}</p>
                    <Badge color="teal">{typeLabel}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleActive(t)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                      {t.active ? <ToggleRight className="w-4 h-4 text-teal-600" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget(t)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {t.description && <p className="text-xs text-gray-500 mt-2">{t.description}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editItem ? 'עריכת תבנית' : 'תבנית חדשה'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="label">שם *</label>
            <input className="input" value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className="label">סוג</label>
            <select className="input" value={form.type} onChange={set('type')}>
              {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">תיאור</label>
            <textarea className="input resize-none" rows={2} value={form.description} onChange={set('description')} />
          </div>
          <div>
            <label className="label">מטרות ברירת מחדל</label>
            <textarea className="input resize-none" rows={2} value={form.default_goals} onChange={set('default_goals')} />
          </div>
          <div>
            <label className="label">תיאור ברירת מחדל</label>
            <textarea className="input resize-none" rows={3} value={form.default_description} onChange={set('default_description')} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={form.active} onChange={set('active')} />
            <label htmlFor="active" className="text-sm">תבנית פעילה</label>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setFormOpen(false)}>ביטול</button>
            <button type="submit" className="btn-primary flex-1">שמור</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { await deleteTemplate(deleteTarget.id); load(); }}
        title="מחיקת תבנית"
        message={`האם למחוק את התבנית "${deleteTarget?.name}"?`}
        confirmLabel="מחק"
        danger
      />
    </div>
  );
}
