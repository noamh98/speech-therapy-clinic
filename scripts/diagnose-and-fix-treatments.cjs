/**
 * DIAGNOSTIC + MIGRATION: Find and fix treatment documents with ownerId problems
 *
 * This script does TWO things:
 *
 * STEP 1 — DIAGNOSE
 *   Scans all treatments and reports:
 *   - Documents missing ownerId
 *   - Documents with ownerId = '' (empty, caused by auth race)
 *   - Documents created last week (to find the wife's missing treatments)
 *   - Duplicate treatments for the same appointment
 *
 * STEP 2 — FIX (only runs when --fix flag is passed)
 *   Re-stamps ownerId on documents that have empty / missing ownerId,
 *   mapping therapist_email → real UID via Firebase Auth lookup.
 *
 * USAGE:
 *   node scripts/diagnose-and-fix-treatments.cjs          # diagnosis only
 *   node scripts/diagnose-and-fix-treatments.cjs --fix    # diagnose + fix
 *
 * REQUIRES:
 *   firebase-service-account.json at the project root, OR
 *   set FIREBASE_SERVICE_ACCOUNT_PATH env var.
 */

const admin  = require('firebase-admin');
const path   = require('path');

const FIX_MODE = process.argv.includes('--fix');

const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, '../firebase-service-account.json');

admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const db   = admin.firestore();
const auth = admin.auth();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lastWeekRange() {
  const now  = new Date();
  const end  = new Date(now);
  end.setDate(end.getDate() - 0);
  const start = new Date(now);
  start.setDate(start.getDate() - 14); // last 2 weeks to be safe
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  TREATMENT DIAGNOSTIC REPORT');
  console.log(`  Mode: ${FIX_MODE ? '🔧 DIAGNOSE + FIX' : '🔍 DIAGNOSE ONLY'}`);
  console.log('══════════════════════════════════════════════════\n');

  // ── 1. List all Firebase Auth users ──────────────────────────────────────
  console.log('Step 1: Loading all Firebase Auth users...');
  const emailToUid = {};
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const u of result.users) {
      if (u.email) emailToUid[u.email.toLowerCase()] = u.uid;
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`  Found ${Object.keys(emailToUid).length} Auth users:`);
  for (const [email, uid] of Object.entries(emailToUid)) {
    console.log(`    ${email} → ${uid}`);
  }

  // ── 2. Scan all collections ───────────────────────────────────────────────
  const COLLECTIONS = ['treatments', 'appointments', 'payments', 'patients'];
  const { start, end } = lastWeekRange();

  for (const colName of COLLECTIONS) {
    console.log(`\n── ${colName.toUpperCase()} ────────────────────────────────`);
    const snap = await db.collection(colName).get();
    console.log(`  Total documents: ${snap.size}`);

    const missing    = [];  // no ownerId field
    const empty      = [];  // ownerId = ''
    const recentDocs = [];  // created / dated in last 2 weeks
    const apptMap    = {};  // for duplicate-treatment detection

    for (const docSnap of snap.docs) {
      const d = docSnap.data();

      // ownerId checks
      if (d.ownerId === undefined || d.ownerId === null) {
        missing.push({ id: docSnap.id, email: d.therapist_email || d.created_by || '?', data: d });
      } else if (d.ownerId === '') {
        empty.push({ id: docSnap.id, email: d.therapist_email || d.created_by || '?', data: d });
      }

      // recent docs (check date or created_date)
      const docDate = d.date || (d.created_date?.toDate?.()?.toISOString().slice(0, 10));
      if (docDate && docDate >= start && docDate <= end) {
        recentDocs.push({ id: docSnap.id, date: docDate, ownerId: d.ownerId, patient: d.patient_name || d.patient_id });
      }

      // Duplicate appointment links (treatments only)
      if (colName === 'treatments' && d.appointmentId) {
        if (!apptMap[d.appointmentId]) apptMap[d.appointmentId] = [];
        apptMap[d.appointmentId].push(docSnap.id);
      }
    }

    // Report
    if (missing.length > 0) {
      console.log(`\n  ⚠️  MISSING ownerId (${missing.length} docs):`);
      missing.forEach(m => console.log(`      ${m.id} | email: ${m.email}`));
    }
    if (empty.length > 0) {
      console.log(`\n  ⚠️  EMPTY ownerId (${empty.length} docs):`);
      empty.forEach(e => console.log(`      ${e.id} | email: ${e.email}`));
    }
    if (missing.length === 0 && empty.length === 0) {
      console.log(`  ✅  All documents have valid ownerId`);
    }

    console.log(`\n  📅 Documents from last 2 weeks (${start} – ${end}): ${recentDocs.length}`);
    recentDocs.forEach(r =>
      console.log(`      ${r.id} | date: ${r.date} | ownerId: ${r.ownerId || '⚠️ EMPTY'} | patient: ${r.patient}`)
    );

    // Duplicates (treatments only)
    if (colName === 'treatments') {
      const dups = Object.entries(apptMap).filter(([, ids]) => ids.length > 1);
      if (dups.length > 0) {
        console.log(`\n  ⚠️  DUPLICATE treatments for same appointment (${dups.length}):`);
        dups.forEach(([apptId, ids]) =>
          console.log(`      appointment ${apptId} → treatments: ${ids.join(', ')}`)
        );
      }
    }

    // ── FIX: stamp correct ownerId on broken docs ───────────────────────────
    if (FIX_MODE) {
      const toFix = [...missing, ...empty];
      if (toFix.length === 0) {
        console.log(`\n  ✅ Nothing to fix in ${colName}`);
        continue;
      }

      console.log(`\n  🔧 Fixing ${toFix.length} documents in ${colName}...`);
      const batch = db.batch();
      let fixed = 0;
      let skipped = 0;

      for (const item of toFix) {
        const email = (item.email || '').toLowerCase();
        const uid   = emailToUid[email];

        if (!uid) {
          console.log(`      ⚠️ Cannot fix ${item.id}: no Auth user for email "${email}"`);
          skipped++;
          continue;
        }

        batch.update(db.collection(colName).doc(item.id), {
          ownerId: uid,
          updated_date: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`      ✅ Will fix ${item.id}: ownerId = ${uid}`);
        fixed++;
      }

      if (fixed > 0) {
        await batch.commit();
        console.log(`\n  Committed ${fixed} fixes.`);
      }
      if (skipped > 0) {
        console.log(`  Skipped ${skipped} (no email mapping). Add these emails to Firebase Auth.`);
      }
    }
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  DONE');
  if (!FIX_MODE) {
    console.log('  Run with --fix to apply corrections.');
  }
  console.log('══════════════════════════════════════════════════\n');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
