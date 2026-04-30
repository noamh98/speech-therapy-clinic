/**
 * MIGRATION SCRIPT: Migrate existing data to multi-tenancy model
 * 
 * This script stamps ownerId on all existing documents in Firestore.
 * It maps documents to the current user's UID based on therapist_email.
 * 
 * USAGE:
 *   1. Set up Firebase Admin SDK credentials (see below)
 *   2. Update USER_EMAIL_TO_UID_MAP with your user mappings
 *   3. Run: node migrate-to-multitenant.js
 * 
 * IMPORTANT:
 *   - This is a ONE-TIME migration script
 *   - Back up your Firestore database before running
 *   - Test in a staging environment first
 *   - The script is idempotent (safe to run multiple times)
 */

const admin = require('firebase-admin');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Initialize Firebase Admin SDK
// Download your service account key from Firebase Console:
// Project Settings → Service Accounts → Generate New Private Key
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
  path.join(__dirname, '../firebase-service-account.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (err) {
  console.error('❌ Error loading Firebase service account:', err.message);
  console.error('Please set FIREBASE_SERVICE_ACCOUNT_PATH or place firebase-service-account.json in the project root');
  process.exit(1);
}

const db = admin.firestore();

// Map therapist emails to their Firebase UIDs
// Update this with your actual user mappings
const USER_EMAIL_TO_UID_MAP = {
  'noamh98@gmail.com': '3aYsCmvk3wXatp3O6k8uKxDXlsk1', 
  'tiferetba20@gmail.com': 'R9Nc8foJXeSr33G2XTkS75s6zQZ2', // Replace with actual UID from Firebase Console
};

// Collections to migrate
const COLLECTIONS_TO_MIGRATE = [
  'patients',
  'appointments',
  'treatments',
  'templates',
  'notifications',
  'progress',
  'intakeForms',
];

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the UID for a therapist email
 */
function getUidForEmail(email) {
  const uid = USER_EMAIL_TO_UID_MAP[email];
  if (!uid) {
    throw new Error(`No UID mapping found for email: ${email}`);
  }
  return uid;
}

/**
 * Migrate a single collection
 */
async function migrateCollection(collectionName) {
  console.log(`\n📋 Migrating collection: ${collectionName}`);
  
  const snapshot = await db.collection(collectionName).get();
  console.log(`   Found ${snapshot.size} documents`);
  
  if (snapshot.empty) {
    console.log(`   ✓ No documents to migrate`);
    return { total: 0, updated: 0, skipped: 0, errors: 0 };
  }
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Process in batches of 100 for efficiency
  const batch = db.batch();
  let batchSize = 0;
  const BATCH_SIZE = 100;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    try {
      // Skip if already has ownerId
      if (data.ownerId) {
        console.log(`   ⊘ Document ${doc.id} already has ownerId: ${data.ownerId}`);
        skipped++;
        continue;
      }
      
      // Get the therapist email
      const therapistEmail = data.therapist_email || data.created_by;
      if (!therapistEmail) {
        console.warn(`   ⚠ Document ${doc.id} has no therapist_email or created_by field`);
        skipped++;
        continue;
      }
      
      // Get the UID for this email
      const uid = getUidForEmail(therapistEmail);
      
      // Add to batch
      batch.update(doc.ref, {
        ownerId: uid,
        updated_date: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      batchSize++;
      updated++;
      
      // Commit batch when it reaches BATCH_SIZE
      if (batchSize >= BATCH_SIZE) {
        await batch.commit();
        console.log(`   ✓ Committed ${batchSize} updates`);
        batchSize = 0;
      }
    } catch (err) {
      console.error(`   ✗ Error processing document ${doc.id}:`, err.message);
      errors++;
    }
  }
  
  // Commit remaining updates
  if (batchSize > 0) {
    await batch.commit();
    console.log(`   ✓ Committed ${batchSize} final updates`);
  }
  
  return { total: snapshot.size, updated, skipped, errors };
}

/**
 * Verify migration results
 */
async function verifyMigration() {
  console.log(`\n🔍 Verifying migration...`);
  
  let totalDocuments = 0;
  let documentsWithOwnerId = 0;
  let documentsWithoutOwnerId = [];
  
  for (const collectionName of COLLECTIONS_TO_MIGRATE) {
    const snapshot = await db.collection(collectionName).get();
    
    for (const doc of snapshot.docs) {
      totalDocuments++;
      if (doc.data().ownerId) {
        documentsWithOwnerId++;
      } else {
        documentsWithoutOwnerId.push({
          collection: collectionName,
          docId: doc.id,
          therapistEmail: doc.data().therapist_email,
        });
      }
    }
  }
  
  console.log(`   Total documents: ${totalDocuments}`);
  console.log(`   Documents with ownerId: ${documentsWithOwnerId}`);
  console.log(`   Documents without ownerId: ${documentsWithoutOwnerId.length}`);
  
  if (documentsWithoutOwnerId.length > 0) {
    console.log(`\n   ⚠ Documents still missing ownerId:`);
    documentsWithoutOwnerId.forEach(doc => {
      console.log(`     - ${doc.collection}/${doc.docId} (therapist: ${doc.therapistEmail})`);
    });
  }
  
  return {
    totalDocuments,
    documentsWithOwnerId,
    documentsWithoutOwnerId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 MULTI-TENANCY MIGRATION SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  // Validate configuration
  console.log(`\n📝 Configuration:`);
  console.log(`   User mappings: ${Object.keys(USER_EMAIL_TO_UID_MAP).length} email(s) configured`);
  console.log(`   Collections to migrate: ${COLLECTIONS_TO_MIGRATE.length}`);
  
  if (Object.values(USER_EMAIL_TO_UID_MAP).some(uid => uid === 'YOUR_USER_UID_HERE')) {
    console.error('\n❌ ERROR: USER_EMAIL_TO_UID_MAP contains placeholder values!');
    console.error('   Please update the USER_EMAIL_TO_UID_MAP with actual Firebase UIDs');
    console.error('   You can find your UID in Firebase Console → Authentication → Users');
    process.exit(1);
  }
  
  try {
    // Migrate each collection
    const results = {};
    for (const collectionName of COLLECTIONS_TO_MIGRATE) {
      results[collectionName] = await migrateCollection(collectionName);
    }
    
    // Print summary
    console.log(`\n📊 Migration Summary:`);
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (const [collectionName, result] of Object.entries(results)) {
      console.log(`   ${collectionName}: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`);
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    }
    
    console.log(`\n   Total: ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors`);
    
    // Verify migration
    const verification = await verifyMigration();
    
    if (verification.documentsWithoutOwnerId.length === 0) {
      console.log(`\n✅ Migration completed successfully!`);
      console.log(`   All ${verification.documentsWithOwnerId} documents now have ownerId`);
    } else {
      console.log(`\n⚠ Migration completed with warnings`);
      console.log(`   ${verification.documentsWithoutOwnerId.length} documents still missing ownerId`);
    }
    
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Review the migration results above`);
    console.log(`   2. Deploy the updated firestore.rules to Firebase`);
    console.log(`   3. Test the application thoroughly`);
    console.log(`   4. Monitor Firestore for any access issues`);
    
  } catch (err) {
    console.error(`\n❌ Migration failed:`, err.message);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

// Run the migration
main();
