/**
 * MIGRATION: Normalize patientId / patient_id on payment documents
 *
 * Old payments may have only one of the two field naming conventions.
 * This script ensures both fields are present and consistent.
 *
 * USAGE:
 *   node scripts/migrate-payment-fields.cjs
 *
 * REQUIRES:
 *   firebase-service-account.json at the project root, OR
 *   set FIREBASE_SERVICE_ACCOUNT_PATH env var to a custom path.
 */

const admin = require('firebase-admin');
const path  = require('path');

const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, '../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();

async function run() {
  const snap = await db.collection('payments').get();
  console.log(`Found ${snap.size} payment documents.`);

  const batch = db.batch();
  let patched = 0;
  let already = 0;

  for (const docSnap of snap.docs) {
    const d  = docSnap.data();
    const ci = d.patientId  ?? null;   // camelCase
    const si = d.patient_id ?? null;   // snake_case

    if (ci !== null && si !== null) {
      already++;
      continue;
    }

    const value = ci ?? si;
    if (value == null) { already++; continue; }

    batch.update(docSnap.ref, { patientId: value, patient_id: value });
    patched++;

    // Firestore batches are limited to 500 writes — flush and restart
    if (patched % 490 === 0) {
      await batch.commit();
      console.log(`  Committed 490 writes...`);
    }
  }

  await batch.commit();
  console.log(`\nDone. Patched: ${patched}, Already consistent: ${already}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
