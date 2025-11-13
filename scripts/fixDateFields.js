// Fix date fields that were corrupted by spread operator
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import HomePage from '../src/models/HomePage.js';
import Order from '../src/models/Order.js';
import User from '../src/models/User.js';

dotenv.config();

// Helper function to check if a value is a corrupted date (object with numeric keys)
const isCorruptedDate = (value) => {
  if (!value || typeof value !== 'object') return false;
  const keys = Object.keys(value);
  // Check if all keys are numeric strings
  return keys.length > 0 && keys.every(key => /^\d+$/.test(key));
};

// Helper function to convert corrupted date object to proper date string
const fixCorruptedDate = (corruptedDate) => {
  if (!isCorruptedDate(corruptedDate)) return corruptedDate;

  try {
    // Convert object with numeric keys back to string
    const dateString = Object.values(corruptedDate).join('');
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return null;
    }

    return date;
  } catch (error) {
    console.error('Error fixing corrupted date:', error);
    return null;
  }
};

// Recursively fix all date fields in an object
const fixDatesInObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  for (const key in obj) {
    const value = obj[key];

    if (isCorruptedDate(value)) {
      console.log(`Fixing corrupted date field: ${key}`);
      obj[key] = fixCorruptedDate(value);
    } else if (Array.isArray(value)) {
      value.forEach(item => fixDatesInObject(item));
    } else if (typeof value === 'object' && value !== null) {
      fixDatesInObject(value);
    }
  }

  return obj;
};

const fixHomePages = async () => {
  console.log('\n=== Fixing HomePage documents ===');

  const homePages = await HomePage.find().lean();
  console.log(`Found ${homePages.length} homepage documents`);

  let fixed = 0;

  for (const homePage of homePages) {
    let needsUpdate = false;

    // Fix analytics.lastViewed
    if (isCorruptedDate(homePage.analytics?.lastViewed)) {
      console.log(`Fixing analytics.lastViewed for homepage: ${homePage.name}`);
      homePage.analytics.lastViewed = fixCorruptedDate(homePage.analytics.lastViewed);
      needsUpdate = true;
    }

    // Fix publishedAt
    if (isCorruptedDate(homePage.publishedAt)) {
      console.log(`Fixing publishedAt for homepage: ${homePage.name}`);
      homePage.publishedAt = fixCorruptedDate(homePage.publishedAt);
      needsUpdate = true;
    }

    // Fix createdAt
    if (isCorruptedDate(homePage.createdAt)) {
      console.log(`Fixing createdAt for homepage: ${homePage.name}`);
      homePage.createdAt = fixCorruptedDate(homePage.createdAt);
      needsUpdate = true;
    }

    // Fix updatedAt
    if (isCorruptedDate(homePage.updatedAt)) {
      console.log(`Fixing updatedAt for homepage: ${homePage.name}`);
      homePage.updatedAt = fixCorruptedDate(homePage.updatedAt);
      needsUpdate = true;
    }

    // Fix categories in sections
    if (homePage.sections) {
      for (const section of homePage.sections) {
        if (section.content?.categoryGrid?.categories) {
          section.content.categoryGrid.categories = section.content.categoryGrid.categories.map(cat => {
            if (isCorruptedDate(cat)) {
              console.log(`Fixing corrupted category ID in section`);
              const fixedId = fixCorruptedDate(cat);
              if (fixedId && typeof fixedId === 'string') {
                return fixedId;
              }
              // If it's a corrupted ObjectId string, reconstruct it
              return Object.values(cat).join('');
            }
            return cat;
          });
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      await HomePage.findByIdAndUpdate(homePage._id, homePage);
      fixed++;
      console.log(`✓ Fixed homepage: ${homePage.name}`);
    }
  }

  console.log(`Fixed ${fixed} homepage documents`);
};

const fixOrders = async () => {
  console.log('\n=== Fixing Order documents ===');

  const orders = await Order.find().lean();
  console.log(`Found ${orders.length} order documents`);

  let fixed = 0;

  for (const order of orders) {
    let needsUpdate = false;

    // Fix all date fields
    const dateFields = ['createdAt', 'updatedAt', 'deliveredAt', 'creditHold.heldAt', 'creditHold.releasedAt'];

    for (const field of dateFields) {
      const keys = field.split('.');
      let current = order;

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
        if (!current) break;
      }

      if (current) {
        const lastKey = keys[keys.length - 1];
        if (isCorruptedDate(current[lastKey])) {
          console.log(`Fixing ${field} for order: ${order.orderNumber}`);
          current[lastKey] = fixCorruptedDate(current[lastKey]);
          needsUpdate = true;
        }
      }
    }

    // Fix timeline timestamps
    if (order.timeline && Array.isArray(order.timeline)) {
      for (const entry of order.timeline) {
        if (isCorruptedDate(entry.timestamp)) {
          entry.timestamp = fixCorruptedDate(entry.timestamp);
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      await Order.findByIdAndUpdate(order._id, order);
      fixed++;
      console.log(`✓ Fixed order: ${order.orderNumber}`);
    }
  }

  console.log(`Fixed ${fixed} order documents`);
};

const main = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    await fixHomePages();
    await fixOrders();

    console.log('\n✓ All documents fixed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing documents:', error);
    process.exit(1);
  }
};

main();
