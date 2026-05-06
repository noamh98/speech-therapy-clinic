// src/utils/formatters.js

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function formatCurrency(amount) {
  if (amount == null) return '—';
  return `₪${Number(amount).toLocaleString('he-IL')}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDatetime(dateStr, timeStr) {
  return `${formatDate(dateStr)}${timeStr ? ` ${timeStr}` : ''}`;
}

/**
 * localDateStr — timezone-safe YYYY-MM-DD from the local clock.
 * Never use new Date().toISOString().slice(0,10) — that returns UTC which in
 * Israel shifts to yesterday for any local time before 02:00/03:00 AM.
 */
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Existing constants (unchanged) ──────────────────────────────────────────

export const PAYMENT_METHODS = [
  { value: 'cash',          label: 'מזומן' },
  { value: 'credit',        label: 'אשראי' },
  { value: 'bank_transfer', label: 'העברה בנקאית' },
  { value: 'check',         label: "צ'ק" },
  { value: 'bit',           label: 'ביט' },
  { value: 'paybox',        label: 'פייבוקס' },
];

export const PAYMENT_STATUSES = [
  { value: 'paid',    label: 'שולם' },
  { value: 'unpaid',  label: 'טרם שולם' },
  { value: 'partial', label: 'שולם חלקית' },
];

export const APPOINTMENT_STATUSES = {
  scheduled: { label: 'מתוכנן',  color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'הושלם',   color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'בוטל',    color: 'bg-red-100 text-red-800' },
  missed:    { label: 'החמצה',   color: 'bg-orange-100 text-orange-800' },
};

export const PATIENT_STATUSES = [
  { value: 'active',   label: 'פעיל' },
  { value: 'inactive', label: 'לא פעיל' },
];

export const PROGRESS_TYPES = [
  { value: 'goal',         label: 'יעד',         icon: '🎯' },
  { value: 'assessment',   label: 'הערכה',        icon: '📋' },
  { value: 'observation',  label: 'תצפית',        icon: '👁️' },
  { value: 'breakthrough', label: 'פריצת דרך',    icon: '⭐' },
  { value: 'challenge',    label: 'אתגר',         icon: '⚡' },
];

export const PROGRESS_DOMAINS = [
  { value: 'speech',        label: 'דיבור' },
  { value: 'language',      label: 'שפה' },
  { value: 'communication', label: 'תקשורת' },
  { value: 'social',        label: 'חברתי' },
  { value: 'cognitive',     label: 'קוגניטיבי' },
  { value: 'motor',         label: 'מוטורי' },
];

export const TEMPLATE_TYPES = [
  { value: 'treatment_note',  label: 'סיכום טיפול' },
  { value: 'intake_form',     label: 'שאלון קבלה' },
  { value: 'session_summary', label: 'סיכום מפגש' },
  { value: 'assessment',      label: 'הערכה' },
];

// ─── NEW: Clinical structured fields ─────────────────────────────────────────

export const CLINICAL_DOMAINS = [
  { value: 'speech', label: 'דיבור' },
  { value: 'language', label: 'שפה' },
  { value: 'reading_writing', label: 'קריאה/כתיבה' },
  { value: 'swallowing', label: 'בליעה' },
  { value: 'oral_motor', label: 'תפקודי פה / דחיקת לשון' },
  { value: 'other', label: 'אחר' },
];

export const COOPERATION_LEVELS = [
  { value: 1, label: '1 — נמוך מאוד' },
  { value: 2, label: '2 — נמוך' },
  { value: 3, label: '3 — בינוני' },
  { value: 4, label: '4 — טוב' },
  { value: 5, label: '5 — מצוין' },
];

export const PROGRESS_RATINGS = [
  { value: '',          label: '— בחר —' },
  { value: 'improving', label: '↑ שיפור' },
  { value: 'stable',    label: '→ יציב' },
  { value: 'regressed', label: '↓ נסיגה' },
];

// ─── NEW: Quick note templates ────────────────────────────────────────────────

export const QUICK_NOTE_TEMPLATES = [
  {
    id: 'routine',
    label: 'טיפול שגרתי',
    icon: '🔄',
    goals:       'תרגול מטרות שוטפות לפי תוכנית הטיפול.',
    description: 'מפגש שגרתי. תורגלו מטרות קיימות. המטופל/ת הגיב/ה בהתאם לציפיות.',
    progress:    '',
  },
  {
    id: 'assessment',
    label: 'הערכה',
    icon: '📋',
    goals:       'הערכת מצב נוכחי — רמת תפקוד, חוזקות ואתגרים.',
    description: 'בוצעה הערכה מסודרת. נבחנו: ',
    progress:    'ממצאי ההערכה: ',
  },
  {
    id: 'parent_guidance',
    label: 'הדרכת הורים',
    icon: '👪',
    goals:       'הדרכת הורים / מטפלים לתרגול ביתי.',
    description: 'פגישת הדרכה עם ההורים. הוסברו מטרות הטיפול ודרכי תרגול בבית.',
    progress:    'ההורים הבינו את ההנחיות והראו מוטיבציה גבוהה.',
  },
];
