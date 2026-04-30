/**
 * Opens a styled print window for a treatment record.
 * Uses the browser's native print dialog — no extra dependencies.
 */

export function generateTreatmentPDF({ treatment, patient, clinicName = '' }) {
  const t  = treatment  || {};
  const p  = patient    || {};

  const domainLabels = {
    speech:     'דיבור ושפה',
    voice:      'קול',
    fluency:    'שטף',
    swallowing: 'בליעה',
    cognition:  'קוגניציה',
    aac:        'תקשורת תומכת (AAC)',
    other:      'אחר',
  };

  const cooperationLabels = {
    excellent: 'מצוין',
    good:      'טוב',
    fair:      'בינוני',
    poor:      'נמוך',
  };

  const progressLabels = {
    significant: 'התקדמות משמעותית',
    moderate:    'התקדמות מתונה',
    minimal:     'התקדמות מינימלית',
    plateau:     'רמה קבועה',
    regression:  'רגרסיה',
  };

  const domains = Array.isArray(t.clinicalDomain)
    ? t.clinicalDomain.map(d => domainLabels[d] || d).join(', ')
    : '';

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>תיעוד טיפול — ${p.full_name || ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      direction: rtl;
      padding: 32px 40px;
      max-width: 800px;
      margin: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .clinic-name { font-size: 18px; font-weight: 700; color: #2563eb; }
    .doc-title   { font-size: 15px; font-weight: 600; color: #374151; margin-top: 2px; }
    .print-date  { font-size: 11px; color: #6b7280; }
    .section { margin-bottom: 16px; }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 3px;
    }
    .row { display: flex; gap: 32px; margin-bottom: 16px; }
    .field { flex: 1; }
    .field label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 2px; }
    .field .value { font-size: 13px; font-weight: 500; }
    .text-block {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px 12px;
      white-space: pre-wrap;
      line-height: 1.6;
      min-height: 40px;
    }
    .pill {
      display: inline-block;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 11px;
      margin: 2px;
    }
    .footer {
      margin-top: 32px;
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
      font-size: 10px;
      color: #9ca3af;
      text-align: center;
    }
    @media print {
      body { padding: 16px 24px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>

<div class="header">
  <div>
    <div class="clinic-name">${clinicName || 'SpeechCare'}</div>
    <div class="doc-title">תיעוד טיפול מס׳ ${t.treatment_number || '—'}</div>
  </div>
  <div class="print-date">הודפס: ${new Date().toLocaleDateString('he-IL')}</div>
</div>

<div class="row">
  <div class="field"><label>מטופל</label><div class="value">${p.full_name || '—'}</div></div>
  <div class="field"><label>תאריך טיפול</label><div class="value">${t.date || '—'}</div></div>
  <div class="field"><label>מס׳ טיפול</label><div class="value">${t.treatment_number || '—'}</div></div>
</div>

${domains ? `
<div class="row">
  <div class="field">
    <label>תחום טיפול</label>
    <div>${domains.split(', ').map(d => `<span class="pill">${d}</span>`).join('')}</div>
  </div>
  <div class="field">
    <label>רמת שיתוף פעולה</label>
    <div class="value">${cooperationLabels[t.cooperationLevel] || t.cooperationLevel || '—'}</div>
  </div>
  <div class="field">
    <label>דירוג התקדמות</label>
    <div class="value">${progressLabels[t.progressRating] || t.progressRating || '—'}</div>
  </div>
</div>
` : ''}

${t.goals ? `
<div class="section">
  <div class="section-title">מטרות הטיפול</div>
  <div class="text-block">${escapeHtml(t.goals)}</div>
</div>
` : ''}

${t.description ? `
<div class="section">
  <div class="section-title">תיאור הטיפול</div>
  <div class="text-block">${escapeHtml(t.description)}</div>
</div>
` : ''}

${t.progress ? `
<div class="section">
  <div class="section-title">התקדמות והערות</div>
  <div class="text-block">${escapeHtml(t.progress)}</div>
</div>
` : ''}

<div class="footer">SpeechCare — מסמך זה הופק באופן אוטומטי</div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('לא ניתן לפתוח חלון הדפסה. ודא שחוסם חלונות קופצים כבוי.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
