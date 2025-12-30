import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// טען את משתני הסביבה
dotenv.config({ path: path.join(__dirname, '../.env') });

async function backupDatabase() {
  try {
    console.log('🔄 מתחבר למסד הנתונים...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ התחברות הצליחה');

    const collections = await mongoose.connection.db.listCollections().toArray();
    const backupDate = new Date().toISOString().split('T')[0];
    const backupDir = path.join(__dirname, '../../backups', `pre-migration-${backupDate}`);

    // צור תיקיית גיבוי
    await fs.mkdir(backupDir, { recursive: true });
    console.log(`📁 נוצרה תיקיית גיבוי: ${backupDir}`);

    const backup = {
      date: new Date().toISOString(),
      database: 'amazon-dropship',
      collections: {}
    };

    // גבה כל collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      console.log(`📦 מגבה את ${collectionName}...`);

      const collection = mongoose.connection.db.collection(collectionName);
      const documents = await collection.find({}).toArray();

      backup.collections[collectionName] = {
        count: documents.length,
        documents: documents
      };

      console.log(`   ✅ ${documents.length} מסמכים נשמרו`);
    }

    // שמור את הגיבוי לקובץ JSON
    const backupFile = path.join(backupDir, 'backup.json');
    await fs.writeFile(backupFile, JSON.stringify(backup, null, 2));

    console.log('');
    console.log('✅ גיבוי הושלם בהצלחה!');
    console.log(`📄 הקובץ נשמר ב: ${backupFile}`);
    console.log('');
    console.log('סטטיסטיקות:');
    Object.entries(backup.collections).forEach(([name, data]) => {
      console.log(`   - ${name}: ${data.count} מסמכים`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ שגיאה בגיבוי:', error);
    process.exit(1);
  }
}

backupDatabase();
