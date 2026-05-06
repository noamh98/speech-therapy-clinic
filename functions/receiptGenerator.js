const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const path = require('path');

const FONT_REGULAR = path.join(__dirname, 'assets', 'NotoSansHebrew-Regular.ttf');
const FONT_BOLD    = path.join(__dirname, 'assets', 'NotoSansHebrew-Bold.ttf');

const PAGE_W = 595.28; // A4 points
const PAGE_H = 841.89;
const MARGIN  = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Payment method Hebrew labels
const METHOD_LABELS = {
  cash: 'מזומן', credit: 'אשראי', bank_transfer: 'העברה בנקאית',
  check: "צ'ק", bit: 'ביט', paybox: 'פייבוקס', card: 'כרטיס', other: 'אחר',
};

const DOC_TYPE_CONFIG = {
  ORIGINAL:     { titleSuffix: '', subtitle: null,                                 color: null },
  CANCELLATION: { titleSuffix: ' – ביטול',  subtitle: 'מבטל קבלה מס׳ {ref}',     color: '#dc2626' },
  REPLACEMENT:  { titleSuffix: ' – מחליפה', subtitle: 'מחליף קבלה מס׳ {ref}',    color: '#059669' },
};

function computeSHA256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function computeHMAC(buf, secret) {
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

function _buildPDF({ receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber, sha256Hash, hmacValue }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });

    // Register Hebrew fonts if available
    let hasFont = false;
    try {
      require('fs').accessSync(FONT_REGULAR);
      doc.registerFont('Hebrew', FONT_REGULAR);
      doc.registerFont('HebrewBold', FONT_BOLD);
      hasFont = true;
    } catch (_) { /* font not installed — skip */ }

    const fontR = hasFont ? 'Hebrew'     : 'Helvetica';
    const fontB = hasFont ? 'HebrewBold' : 'Helvetica-Bold';

    const docTypeCfg = DOC_TYPE_CONFIG[receipt.doc_type] || DOC_TYPE_CONFIG.ORIGINAL;
    const themeColor = docTypeCfg.color || (profile.pdfStyle?.themeColor || '#2563eb');

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ───────────────────────────────────────────────────────────────
    let headerY = MARGIN;

    // Logo (left side, RTL so visually right)
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN, headerY, { height: 60, fit: [80, 60] });
      } catch (_) { /* ignore bad logo */ }
    }

    // Business details (right-aligned in RTL layout)
    doc.font(fontB).fontSize(14).fillColor('#111827')
       .text(profile.businessName || 'שם העסק', MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
    headerY += 18;

    if (profile.businessId) {
      doc.font(fontR).fontSize(9).fillColor('#6b7280')
         .text(`ח.פ / ע.מ: ${profile.businessId}`, MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
      headerY += 13;
    }
    if (profile.address) {
      doc.font(fontR).fontSize(9).fillColor('#6b7280')
         .text(profile.address, MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
      headerY += 13;
    }
    const contactLine = [profile.phone, profile.email].filter(Boolean).join(' | ');
    if (contactLine) {
      doc.font(fontR).fontSize(9).fillColor('#6b7280')
         .text(contactLine, MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
      headerY += 13;
    }

    // ── Divider ──────────────────────────────────────────────────────────────
    headerY += 8;
    doc.moveTo(MARGIN, headerY).lineTo(PAGE_W - MARGIN, headerY)
       .strokeColor(themeColor).lineWidth(2).stroke();
    headerY += 12;

    // ── Title block ──────────────────────────────────────────────────────────
    const docTitle = `קבלה${docTypeCfg.titleSuffix}`;
    doc.font(fontB).fontSize(22).fillColor(themeColor)
       .text(docTitle, MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
    headerY += 28;

    if (docTypeCfg.subtitle && originalReceiptNumber) {
      const sub = docTypeCfg.subtitle.replace('{ref}', originalReceiptNumber);
      doc.font(fontR).fontSize(10).fillColor('#6b7280')
         .text(sub, MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
      headerY += 16;
    }

    // Receipt number + date row
    const issueDate = receipt.issued_at
      ? new Date(receipt.issued_at.toDate ? receipt.issued_at.toDate() : receipt.issued_at)
          .toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

    doc.font(fontR).fontSize(10).fillColor('#374151')
       .text(`מס׳ קבלה: ${receipt.receipt_number || 'PREVIEW'}    |    תאריך: ${issueDate}`,
             MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
    headerY += 22;

    // ── Payment details table ─────────────────────────────────────────────────
    // Table header
    const ROW_H  = 22;
    const COL = { amt: { x: MARGIN, w: 80 }, desc: { x: MARGIN + 85, w: 230 }, date: { x: MARGIN + 320, w: 90 }, method: { x: MARGIN + 415, w: 100 } };

    doc.rect(MARGIN, headerY, CONTENT_W, ROW_H).fill(themeColor);
    doc.font(fontB).fontSize(9).fillColor('#ffffff');
    doc.text('סכום',      COL.amt.x,    headerY + 6, { width: COL.amt.w,    align: 'right', direction: 'rtl' });
    doc.text('תיאור',     COL.desc.x,   headerY + 6, { width: COL.desc.w,   align: 'right', direction: 'rtl' });
    doc.text('תאריך תשלום', COL.date.x, headerY + 6, { width: COL.date.w,   align: 'right', direction: 'rtl' });
    doc.text('אמצעי תשלום', COL.method.x, headerY + 6, { width: COL.method.w, align: 'right', direction: 'rtl' });
    headerY += ROW_H;

    // Data row
    doc.rect(MARGIN, headerY, CONTENT_W, ROW_H).fill('#f9fafb');
    doc.font(fontR).fontSize(9).fillColor('#111827');

    const amount = receipt.payment_amount ?? payment?.amount ?? 0;
    const amountFormatted = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
    const methodLabel = METHOD_LABELS[receipt.payment_method ?? payment?.payment_method] || (receipt.payment_method ?? payment?.payment_method ?? '');
    const payDate = receipt.payment_date ?? payment?.payment_date ?? '';
    const desc = payment?.notes || 'טיפול קלינאות תקשורת';

    doc.text(amountFormatted,  COL.amt.x,    headerY + 6, { width: COL.amt.w,    align: 'right', direction: 'rtl' });
    doc.text(desc,             COL.desc.x,   headerY + 6, { width: COL.desc.w,   align: 'right', direction: 'rtl' });
    doc.text(payDate,          COL.date.x,   headerY + 6, { width: COL.date.w,   align: 'right', direction: 'rtl' });
    doc.text(methodLabel,      COL.method.x, headerY + 6, { width: COL.method.w, align: 'right', direction: 'rtl' });
    headerY += ROW_H;

    // Tax withholding row (if applicable)
    if (receipt.tax_withholding && receipt.tax_withholding > 0) {
      const withheld = amount * receipt.tax_withholding / 100;
      const net = amount - withheld;
      headerY += 6;
      doc.font(fontR).fontSize(9).fillColor('#374151')
         .text(`ניכוי מס במקור ${receipt.tax_withholding}%: ${new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(withheld)}`,
               MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
      headerY += 14;
      doc.font(fontB).fontSize(10).fillColor('#111827')
         .text(`סכום לתשלום נטו: ${new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(net)}`,
               MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
      headerY += 18;
    } else {
      headerY += 10;
      doc.font(fontB).fontSize(11).fillColor('#111827')
         .text(`סה״כ: ${amountFormatted}`, MARGIN, headerY, { align: 'right', width: CONTENT_W, direction: 'rtl' });
      headerY += 20;
    }

    // ── Signature ─────────────────────────────────────────────────────────────
    if (profile.pdfStyle?.showSignature && signatureBuffer) {
      headerY += 10;
      try {
        doc.image(signatureBuffer, MARGIN, headerY, { height: 50, fit: [120, 50] });
      } catch (_) { /* ignore bad sig */ }
      doc.font(fontR).fontSize(8).fillColor('#6b7280')
         .text('חתימה', MARGIN, headerY + 52, { width: 120, align: 'center', direction: 'rtl' });
      headerY += 70;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const FOOTER_Y = PAGE_H - MARGIN - 55;
    doc.moveTo(MARGIN, FOOTER_Y).lineTo(PAGE_W - MARGIN, FOOTER_Y)
       .strokeColor('#e5e7eb').lineWidth(0.5).stroke();

    const footerText = profile.pdfStyle?.footerText || '';
    if (footerText) {
      doc.font(fontR).fontSize(7).fillColor('#9ca3af')
         .text(footerText, MARGIN, FOOTER_Y + 4, { align: 'right', width: CONTENT_W, direction: 'rtl' });
    }

    // SHA-256 line
    const hashLine = sha256Hash
      ? `SHA-256: ${sha256Hash}`
      : 'SHA-256: [מחושב בסבב השני]';
    doc.font(fontR).fontSize(6).fillColor('#9ca3af')
       .text(hashLine, MARGIN, FOOTER_Y + 18, { align: 'left', width: CONTENT_W });

    if (hmacValue) {
      doc.font(fontR).fontSize(6).fillColor('#9ca3af')
         .text(`HMAC: ${hmacValue}`, MARGIN, FOOTER_Y + 28, { align: 'left', width: CONTENT_W });
    }

    doc.font(fontR).fontSize(7).fillColor('#9ca3af')
       .text('מסמך זה הופק ממוחשב ותקף ללא חתימה וחותמת', MARGIN, FOOTER_Y + 40, { align: 'right', width: CONTENT_W, direction: 'rtl' });

    doc.end();
  });
}

/**
 * Two-pass PDF generation with SHA-256 embedded in footer.
 * Pass 1: generate PDF → compute hash → Pass 2: regenerate with hash in footer.
 */
async function generateReceiptPDF({ receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber, hmacSecret }) {
  // Pass 1 — generate without hash to get the hash
  const pass1 = await _buildPDF({ receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber, sha256Hash: null, hmacValue: null });
  const sha256Hash = computeSHA256(pass1);
  const hmacValue = hmacSecret ? computeHMAC(pass1, hmacSecret) : null;

  // Pass 2 — regenerate with hash in footer
  const pass2 = await _buildPDF({ receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber, sha256Hash, hmacValue });

  return { pdfBuffer: pass2, sha256: sha256Hash, hmac: hmacValue };
}

module.exports = { generateReceiptPDF, computeSHA256, computeHMAC };
