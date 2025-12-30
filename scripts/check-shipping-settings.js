import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import SystemSettings from '../src/models/SystemSettings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkShippingSettings() {
  try {
    console.log('🔄 מתחבר למסד הנתונים...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ התחברות הצליחה\n');

    // בדוק אם יש הגדרות
    const settings = await SystemSettings.findById('system-settings');

    if (!settings) {
      console.log('⚠️  לא נמצאו הגדרות מערכת!');
      console.log('   SystemSettings לא קיים במסד הנתונים');
      console.log('   ברירת מחדל: 49₪ / $15 (hardcoded)');
    } else {
      console.log('📊 הגדרות נוכחיות במסד הנתונים:');
      console.log('════════════════════════════════════════');
      console.log('');
      console.log('💰 משלוח:');
      console.log('   ILS:', settings.shipping?.flatRate?.ils, '₪');
      console.log('   USD:', settings.shipping?.flatRate?.usd, '$');
      console.log('   ימי אספקה:', settings.shipping?.estimatedDays || 'לא מוגדר');
      console.log('');
      console.log('🎁 משלוח חינם:');
      console.log('   מופעל:', settings.shipping?.freeShipping?.enabled ? 'כן' : 'לא');
      console.log('   סף ILS:', settings.shipping?.freeShipping?.threshold?.ils, '₪');
      console.log('   סף USD:', settings.shipping?.freeShipping?.threshold?.usd, '$');
      console.log('');
      console.log('📦 הזמנה מינימלית:');
      console.log('   סכום ILS:', settings.order?.minimumAmount?.ils, '₪');
      console.log('   סכום USD:', settings.order?.minimumAmount?.usd, '$');
      console.log('   מספר פריטים:', settings.order?.minimumItemsCount || 0);
      console.log('');
      console.log('════════════════════════════════════════');
      console.log('');

      // בדיקות ולידציה
      const isOK = settings.shipping?.flatRate?.ils === 49 &&
                   settings.shipping?.flatRate?.usd === 15;

      if (isOK) {
        console.log('✅ ההגדרות תקינות! (49₪ / $15)');
      } else {
        console.log('⚠️  ההגדרות שונות מהציפייה!');
        console.log('   ציפייה: 49₪ / $15');
        console.log('   בפועל:', settings.shipping?.flatRate?.ils, '₪ /', settings.shipping?.flatRate?.usd, '$');
        console.log('');
        console.log('💡 כדי לעדכן, הרץ:');
        console.log('   node scripts/update-shipping-settings.js');
      }
    }

    console.log('');
    await mongoose.connection.close();
    console.log('👋 סיום');
    process.exit(0);
  } catch (error) {
    console.error('❌ שגיאה:', error);
    process.exit(1);
  }
}

checkShippingSettings();
