import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import SystemSettings from '../src/models/SystemSettings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function updateShippingSettings() {
  try {
    console.log('🔄 מתחבר למסד הנתונים...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ התחברות הצליחה\n');

    // קבל או צור הגדרות מערכת
    let settings = await SystemSettings.findById('system-settings');

    if (!settings) {
      console.log('📦 יוצר הגדרות מערכת חדשות...');
      settings = new SystemSettings({
        _id: 'system-settings'
      });
    }

    console.log('📊 הגדרות נוכחיות:');
    console.log('   משלוח ILS:', settings.shipping?.flatRate?.ils || 'לא מוגדר');
    console.log('   משלוח USD:', settings.shipping?.flatRate?.usd || 'לא מוגדר');
    console.log('');

    // עדכן להגדרות חדשות
    settings.shipping = {
      flatRate: {
        ils: 49,
        usd: 15
      },
      estimatedDays: 14,
      freeShipping: {
        enabled: false,
        threshold: {
          ils: 0,
          usd: 0
        }
      }
    };

    await settings.save();

    console.log('✅ הגדרות עודכנו בהצלחה!');
    console.log('');
    console.log('📊 הגדרות חדשות:');
    console.log('   משלוח ILS: 49₪ קבוע');
    console.log('   משלוח USD: $15 קבוע');
    console.log('   זמן אספקה משוער: 14 ימים');
    console.log('   משלוח חינם: כבוי');
    console.log('');

    await mongoose.connection.close();
    console.log('👋 סיום');
    process.exit(0);
  } catch (error) {
    console.error('❌ שגיאה:', error);
    process.exit(1);
  }
}

updateShippingSettings();
