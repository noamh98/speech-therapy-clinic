// src/utils/formatters.js

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

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'מזומן' },
  { value: 'credit', label: 'אשראי' },
  { value: 'bank_transfer', label: 'העברה בנקאית' },
  { value: 'check', label: "צ'ק" },
  { value: 'bit', label: 'ביט' },
  { value: 'paybox', label: 'פייבוקס' },
];

export const PAYMENT_STATUSES = [
  { value: 'paid', label: 'שולם' },
  { value: 'unpaid', label: 'טרם שולם' },
  { value: 'partial', label: 'שולם חלקית' },
];

export const APPOINTMENT_STATUSES = {
  scheduled: { label: 'מתוכנן', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'הושלם', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'בוטל', color: 'bg-red-100 text-red-800' },
  missed:    { label: 'החמצה', color: 'bg-orange-100 text-orange-800' },
};

export const PATIENT_STATUSES = [
  { value: 'active', label: 'פעיל' },
  { value: 'inactive', label: 'לא פעיל' },
];

export const PROGRESS_TYPES = [
  { value: 'goal', label: 'יעד', icon: '🎯' },
  { value: 'assessment', label: 'הערכה', icon: '📋' },
  { value: 'observation', label: 'תצפית', icon: '👁️' },
  { value: 'breakthrough', label: 'פריצת דרך', icon: '⭐' },
  { value: 'challenge', label: 'אתגר', icon: '⚡' },
];

export const PROGRESS_DOMAINS = [
  { value: 'speech', label: 'דיבור' },
  { value: 'language', label: 'שפה' },
  { value: 'communication', label: 'תקשורת' },
  { value: 'social', label: 'חברתי' },
  { value: 'cognitive', label: 'קוגניטיבי' },
  { value: 'motor', label: 'מוטורי' },
];

export const TEMPLATE_TYPES = [
  { value: 'treatment_note', label: 'סיכום טיפול' },
  { value: 'intake_form', label: 'שאלון קבלה' },
  { value: 'session_summary', label: 'סיכום מפגש' },
  { value: 'assessment', label: 'הערכה' },
];
