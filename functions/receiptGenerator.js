const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const path = require('path');

const FONT_REGULAR = path.join(__dirname, 'assets', 'NotoSansHebrew-Regular.ttf');
const FONT_BOLD    = path.join(__dirname, 'assets', 'NotoSansHebrew-Bold.ttf');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M      = 45;          // margin
const CW     = PAGE_W - M * 2; // content width = 505.28

const METHOD_LABELS = {
  cash: 'מזומן', credit: 'אשראי', bank_transfer: 'העברה בנקאית',
  check: "צ'ק", bit: 'ביט', paybox: 'פייבוקס', card: 'כרטיס', other: 'אחר',
};

const DOC_TYPE_CONFIG = {
  ORIGINAL:     { label: 'מקור',    themeOverride: null,      subtitle: null },
  CANCELLATION: { label: 'ביטול',   themeOverride: '#dc2626', subtitle: 'מבטל קבלה מס׳ {ref}' },
  REPLACEMENT:  { label: 'מחליפה',  themeOverride: '#059669', subtitle: 'מחליף קבלה מס׳ {ref}' },
};

function computeSHA256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function computeHMAC(buf, secret) {
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

// Format amount as: ₪ 350.00 (currency symbol to the left)
function fmt(n) {
  const num = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
  return `₪ ${num}`;
}

// Lightweight BiDi helper: force RTL base direction and wrap LTR runs (numbers/ASCII)
function bidiWrap(text) {
  if (!text || typeof text !== 'string') return text || '';
  // Prefix with RLM to set base direction to RTL
  // Wrap numbers/ASCII runs with LRM so they stay left-to-right inside RTL text
  return '\u200F' + text.replace(/([A-Za-z0-9\-\._\/:]+)/g, '\u200E$1\u200E');
}

function rtl(doc, text, x, y, opts = {}) {
  const wrapped = bidiWrap(String(text || ''));
  doc.text(wrapped, x, y, { direction: 'rtl', align: 'right', ...opts });
}

function ltr(doc, text, x, y, opts = {}) {
  doc.text(String(text || ''), x, y, { direction: 'ltr', align: 'left', ...opts });
}

function _buildPDF({ receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber, sha256Hash }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, autoFirstPage: true });

    // Register fonts
    try {
      require('fs').accessSync(FONT_REGULAR);
      doc.registerFont('R', FONT_REGULAR);
      doc.registerFont('B', FONT_BOLD);
    } catch (_) {
      doc.registerFont('R', 'Helvetica');
      doc.registerFont('B', 'Helvetica-Bold');
    }

    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cfg = DOC_TYPE_CONFIG[receipt.doc_type] || DOC_TYPE_CONFIG.ORIGINAL;
    const theme = cfg.themeOverride || (profile.pdfStyle?.themeColor || '#2563eb');
    const issueDate = (() => {
      const d = receipt.issued_at
        ? (receipt.issued_at.toDate ? receipt.issued_at.toDate() : new Date(receipt.issued_at))
        : new Date();
      return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    })();

    // Layout start
    let y = M;

    // Header: split into right (business) and left (document)
    const HEADER_H = 80;
    // Business details on right side
    const businessX = M;
    const businessW = CW / 2;
    const docX = M + CW / 2;
    const docW = CW / 2;

    // Logo (left of header area)
    if (logoBuffer) {
      try { doc.image(logoBuffer, docX, y, { height: 60, fit: [120, 60] }); } catch (_) {}
    }

    // Right side (business details) - aligned right within right half
    doc.font('B').fontSize(15).fillColor('#111827');
    rtl(doc, profile.businessName || 'שם העסק', businessX, y, { width: businessW });
    let hy = y + 20;
    doc.font('R').fontSize(9).fillColor('#555555');
    const idLine = profile.businessId ? `ע.פ / ח.פ: ${profile.businessId}` : null;
    [idLine, profile.phone && `טלפון: ${profile.phone}`, profile.email && `אימייל: ${profile.email}`].filter(Boolean).forEach(line => {
      rtl(doc, line, businessX, hy, { width: businessW });
      hy += 14;
    });

    // Left side (document details) - aligned left
    doc.font('R').fontSize(9).fillColor('#374151');
    ltr(doc, 'מסמך ממוחשב', docX, y, { width: docW });
    doc.font('B').fontSize(16).fillColor('#111827');
    ltr(doc, receipt.receipt_number ? `קבלה ${receipt.receipt_number} (${cfg.label})` : `קבלה (${cfg.label})`, docX, y + 18, { width: docW });
    doc.font('R').fontSize(10).fillColor('#374151');
    ltr(doc, `קבלה: ${receipt.receipt_number || 'PREVIEW'}`, docX, y + 38, { width: docW });
    ltr(doc, `תאריך: ${issueDate}`, docX, y + 52, { width: docW });

    y += HEADER_H;

    // Subtitle for cancellation / replacement
    if (cfg.subtitle && originalReceiptNumber) {
      doc.font('R').fontSize(9).fillColor(theme);
      rtl(doc, cfg.subtitle.replace('{ref}', originalReceiptNumber), M, y, { width: CW });
      y += 16;
    }

    // Divider
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor('#e5e7eb').lineWidth(0.8).stroke();
    y += 10;

    // Patient block on right side
    const patientName  = payment.patientName  || receipt.patientName  || null;
    const patientPhone = payment.patientPhone || receipt.patientPhone || null;

    if (patientName || patientPhone) {
      doc.font('B').fontSize(9).fillColor('#555555');
      rtl(doc, 'עבור:', M + CW/2, y, { width: CW/2 });
      y += 13;

      if (patientName) {
        doc.font('B').fontSize(12).fillColor('#111827');
        rtl(doc, patientName, M + CW/2, y, { width: CW/2 });
        y += 17;
      }
      if (patientPhone) {
        doc.font('R').fontSize(9).fillColor('#555555');
        rtl(doc, `טלפון: ${patientPhone}`, M + CW/2, y, { width: CW/2 });
        y += 14;
      }
      y += 4;
    }

    // Table: columns from right to left: method | details | date | amount
    const colWidths = [125, 185, 90, 90]; // method, desc, date, amt
    const COLS = [];
    let rx = M + CW; // right edge
    ['method', 'desc', 'date', 'amt'].forEach((key, i) => {
      const w = colWidths[i];
      rx -= w;
      COLS.push({ key, x: rx, w, label: ({method:'אמצעי תשלום', desc:'פרטים', date:'תאריך', amt:'סכום'})[key] });
    });

    const ROW_H = 28;

    // Header row
    doc.rect(M, y, CW, ROW_H).fill(theme);
    doc.font('B').fontSize(11).fillColor('#ffffff');
    COLS.forEach(col => rtl(doc, col.label, col.x, y + 8, { width: col.w }));
    y += ROW_H;

    // Data row
    const amount  = Number(receipt.payment_amount ?? payment?.amount ?? 0);
    const method  = receipt.payment_method ?? payment?.payment_method ?? '';
    const payDateVal = receipt.payment_date   ?? payment?.payment_date   ?? '';
    const payDate = (payDateVal && payDateVal.toDate) ? payDateVal.toDate().toLocaleDateString('he-IL') : payDateVal;
    const notes   = payment?.notes || receipt.void_reason || '';
    const desc    = notes || 'טיפול קלינאות תקשורת';

    doc.rect(M, y, CW, ROW_H).fill('#f9fafb');
    doc.font('R').fontSize(10).fillColor('#111827');
    const rowVals = { amt: fmt(amount), date: payDate, desc, method: METHOD_LABELS[method] || method };
    COLS.forEach(col => {
      // Amount should be LTR so render as ltr
      if (col.key === 'amt') {
        ltr(doc, rowVals[col.key], col.x, y + 8, { width: col.w });
      } else {
        rtl(doc, rowVals[col.key], col.x, y + 8, { width: col.w });
      }
    });
    y += ROW_H + 10;

    // Summary (bottom left)
    const TOT_X = M;
    const TOT_W = 240;
    doc.font('R').fontSize(9).fillColor('#374151');

    const tw = Number(receipt.tax_withholding || 0);
    const withheld = tw > 0 ? amount * tw / 100 : 0;
    const netBefore = amount; // spec: show before withholding first
    const totalAfter = amount - withheld;

    // Line 1: "סה"כ לפני ניכוי מס במקור" + amount (left aligned)
    ltr(doc, fmt(netBefore), TOT_X + TOT_W/2, y, { width: TOT_W/2 });
    rtl(doc, 'סה"כ לפני ניכוי מס במקור', TOT_X, y, { width: TOT_W/2 });
    y += 16;
    // Line 2: "ניכוי מס במקור" + amount
    ltr(doc, fmt(withheld), TOT_X + TOT_W/2, y, { width: TOT_W/2 });
    rtl(doc, `ניכוי מס במקור ${tw}%`, TOT_X, y, { width: TOT_W/2 });
    y += 16;
    // Line 3: "סה"כ" + final amount
    ltr(doc, fmt(totalAfter), TOT_X + TOT_W/2, y, { width: TOT_W/2 });
    doc.font('B').fontSize(11).fillColor('#111827');
    rtl(doc, 'סה"כ', TOT_X, y, { width: TOT_W/2 });
    y += 22;

    // Remarks (bottom right)
    const remarks = receipt.remarks || '';
    if (remarks) {
      const remarksX = M + CW/2;
      const remarksW = CW/2;
      doc.font('B').fontSize(9).fillColor('#374151');
      rtl(doc, 'הערות:', remarksX, y, { width: remarksW });
      y += 13;
      doc.font('R').fontSize(9).fillColor('#555555');
      rtl(doc, remarks, remarksX, y, { width: remarksW });
      y += 16;
    }

    // Signature block (right)
    try {
      if (signatureBuffer) doc.image(signatureBuffer, PAGE_W - M - 120, y, { height: 50, fit: [120, 50] });
    } catch (_) {}
    doc.font('R').fontSize(8).fillColor('#9ca3af');
    rtl(doc, 'חתימה: חתום דיגיטלית', PAGE_W - M - 120, y + 54, { width: 120 });

    // Footer
    const FY = PAGE_H - M - 46;
    doc.moveTo(M, FY).lineTo(M + CW, FY).strokeColor('#d1d5db').lineWidth(0.5).stroke();

    doc.font('R').fontSize(7).fillColor('#9ca3af');
    // Left: page number
    rtl(doc, 'דף 1 מתוך 1', M, FY + 6, { width: CW / 2 });
    // Right: signature already rendered above

    // Center: SHA256
    if (sha256Hash) {
      doc.font('R').fontSize(6).fillColor('#c0c0c0');
      ltr(doc, `SHA-256: ${sha256Hash}`, 0, FY + 20, { width: PAGE_W, align: 'center' });
    }

    // Footer note (small)
    const footerNote = profile.pdfStyle?.footerText || 'מסמך זה הופק ממוחשב ותקף ללא חתימה וחותמת';
    doc.font('R').fontSize(7).fillColor('#9ca3af');
    rtl(doc, footerNote, M, FY + 30, { width: CW });

    doc.end();
  });
}

async function generateReceiptPDF({ receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber }) {
  const pass1 = await _buildPDF({ receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber, sha256Hash: null });
  const sha256Hash = computeSHA256(pass1);
  const pass2 = await _buildPDF({ receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber, sha256Hash });
  return { pdfBuffer: pass2, sha256: sha256Hash, hmac: null };
}

module.exports = { generateReceiptPDF, computeSHA256, computeHMAC };
