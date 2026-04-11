import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { PageHeader, Card, Modal, Badge } from '../components/ui';
import { UserCog, Plus, Mail } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      const q = query(collection(db, 'users'), orderBy('email'));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading users:", err);
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const cleanEmail = email.toLowerCase().trim();

      // SECURITY: This should only be done via Cloud Function with Admin SDK
      // Frontend code cannot safely assign admin roles. This is a temporary measure
      // that MUST be replaced with a backend Cloud Function.

      alert(`❌ NOT IMPLEMENTED YET\n\nAdmins must use a Cloud Function to invite users.\n\nUser invites should:\n1. Validate email\n2. Create user via Cloud Function\n3. Assign roles via Admin SDK (not frontend)\n\nContact your dev team to deploy the inviteUser Cloud Function.`);
      return;

      alert(`המשתמש ${cleanEmail} הוגדר במערכת. כעת היא יכולה להתחבר באמצעות גוגל.`);

      setInviteOpen(false);
      setEmail('');
      setRole('user');
      loadUsers(); // רענון הרשימה במסך
    } catch (error) {
      console.error("Error inviting user:", error);
      alert("שגיאה ברישום המשתמש. וודא שיש לך הרשאות מתאימות.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="ניהול משתמשים"
        subtitle="זמין לאדמין בלבד"
        actions={
          <button onClick={() => setInviteOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> הזמן משתמש
          </button>
        }
      />

      <Card>
        {users.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">אין משתמשים רשומים</p>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                  {(u.name || u.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{u.name || u.email}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
                <Badge color={u.role === 'admin' ? 'purple' : 'teal'}>
                  {u.role === 'admin' ? 'מנהל' : 'קלינאית'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="הזמנת משתמש חדש">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="label">כתובת מייל *</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              dir="ltr"
              placeholder="example@gmail.com"
            />
          </div>
          <div>
            <label className="label">תפקיד</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              <option value="user">קלינאית</option>
              <option value="admin">מנהל</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">המשתמשת תוכל להיכנס למערכת עם חשבון הגוגל שלה מיד לאחר הלחיצה על "שלח".</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setInviteOpen(false)} disabled={loading}>ביטול</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'רושם...' : 'אשר גישה'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}