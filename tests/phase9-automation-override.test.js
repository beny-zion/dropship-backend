/**
 * Phase 9.3 & 9.5: Auto-Status Update & Manual Override Tests
 *
 * בודק:
 * 1. Auto-status update - עדכון אוטומטי של סטטוס הזמנה על סטטוסי פריטים
 * 2. Manual override - נעילת סטטוס למניעת דריסה אוטומטית
 * 3. Item-level override - נעילת פריט בודד
 * 4. Order-level override - נעילת ההזמנה כולה
 */

import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import {
  calculateAutoOrderStatus,
  shouldUpdateOrderStatus,
  applyAutoStatusUpdate
} from '../src/utils/autoStatusUpdate.js';
import { ORDER_STATUS } from '../src/constants/orderStatuses.js';
import { ITEM_STATUS } from '../src/constants/itemStatuses.js';

// ============================================
// Helper Functions
// ============================================

/**
 * יצירת הזמנה בסיסית לטסטים
 */
function createMockOrder(itemStatuses = [ITEM_STATUS.PENDING], orderStatus = ORDER_STATUS.PENDING) {
  return {
    orderNumber: 'TEST-001',
    user: new mongoose.Types.ObjectId(),
    items: itemStatuses.map((status, index) => ({
      _id: new mongoose.Types.ObjectId(),
      name: `Item ${index + 1}`,
      quantity: 1,
      price: 100,
      itemStatus: status,
      cancellation: { cancelled: false }
    })),
    status: orderStatus,
    pricing: {
      subtotal: 100 * itemStatuses.length,
      total: 100 * itemStatuses.length
    },
    timeline: []
  };
}

// ============================================
// Test Suite 1: Auto-Status Calculation
// ============================================

describe('Auto-Status Calculation Logic', () => {

  test('כל הפריטים pending → order status = pending', () => {
    const items = [
      { itemStatus: ITEM_STATUS.PENDING, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.PENDING, cancellation: { cancelled: false } }
    ];

    const status = calculateAutoOrderStatus(items);
    expect(status).toBe(ORDER_STATUS.PENDING);
  });

  test('כל הפריטים ordered → order status = in_progress', () => {
    const items = [
      { itemStatus: ITEM_STATUS.ORDERED, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.ORDERED, cancellation: { cancelled: false } }
    ];

    const status = calculateAutoOrderStatus(items);
    expect(status).toBe(ORDER_STATUS.IN_PROGRESS);
  });

  test('כל הפריטים in_transit → order status = in_progress', () => {
    const items = [
      { itemStatus: ITEM_STATUS.IN_TRANSIT, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.IN_TRANSIT, cancellation: { cancelled: false } }
    ];

    const status = calculateAutoOrderStatus(items);
    expect(status).toBe(ORDER_STATUS.IN_PROGRESS);
  });

  test('כל הפריטים arrived_israel → order status = ready_to_ship', () => {
    const items = [
      { itemStatus: ITEM_STATUS.ARRIVED_ISRAEL, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.ARRIVED_ISRAEL, cancellation: { cancelled: false } }
    ];

    const status = calculateAutoOrderStatus(items);
    expect(status).toBe(ORDER_STATUS.READY_TO_SHIP);
  });

  test('לפחות פריט אחד shipped_to_customer → order status = shipped', () => {
    const items = [
      { itemStatus: ITEM_STATUS.SHIPPED_TO_CUSTOMER, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.ARRIVED_ISRAEL, cancellation: { cancelled: false } }
    ];

    const status = calculateAutoOrderStatus(items);
    expect(status).toBe(ORDER_STATUS.SHIPPED);
  });

  test('כל הפריטים delivered → order status = delivered', () => {
    const items = [
      { itemStatus: ITEM_STATUS.DELIVERED, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.DELIVERED, cancellation: { cancelled: false } }
    ];

    const status = calculateAutoOrderStatus(items);
    expect(status).toBe(ORDER_STATUS.DELIVERED);
  });

  test('כל הפריטים בוטלו → order status = cancelled', () => {
    const items = [
      { itemStatus: ITEM_STATUS.PENDING, cancellation: { cancelled: true } },
      { itemStatus: ITEM_STATUS.ORDERED, cancellation: { cancelled: true } }
    ];

    const status = calculateAutoOrderStatus(items);
    expect(status).toBe(ORDER_STATUS.CANCELLED);
  });

  test('פריטים מעורבים - אם יש פריט delivered, ההזמנה shipped', () => {
    const items = [
      { itemStatus: ITEM_STATUS.DELIVERED, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.PENDING, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.ORDERED, cancellation: { cancelled: false } }
    ];

    const status = calculateAutoOrderStatus(items);
    // הלוגיקה: אם יש לפחות פריט delivered/shipped → order = shipped
    expect(status).toBe(ORDER_STATUS.SHIPPED);
  });
});

// ============================================
// Test Suite 2: Should Update Logic
// ============================================

describe('Should Update Order Status', () => {

  test('צריך לעדכן כשהסטטוס שונה מהמחושב', () => {
    const order = createMockOrder([ITEM_STATUS.DELIVERED], ORDER_STATUS.PENDING);
    const update = shouldUpdateOrderStatus(order);

    expect(update).not.toBeNull();
    expect(update.shouldUpdate).toBe(true);
    expect(update.from).toBe(ORDER_STATUS.PENDING);
    expect(update.to).toBe(ORDER_STATUS.DELIVERED);
  });

  test('לא צריך לעדכן כשהסטטוס זהה למחושב', () => {
    const order = createMockOrder([ITEM_STATUS.PENDING], ORDER_STATUS.PENDING);
    const update = shouldUpdateOrderStatus(order);

    expect(update).toBeNull();
  });

  test('לא צריך לעדכן סטטוס payment_hold (protected status)', () => {
    const order = createMockOrder([ITEM_STATUS.DELIVERED], 'payment_hold');
    const update = shouldUpdateOrderStatus(order);

    expect(update).toBeNull();
  });

  test('Phase 9.3: לא צריך לעדכן כשההזמנה נעולה (manualStatusOverride)', () => {
    const order = createMockOrder([ITEM_STATUS.DELIVERED], ORDER_STATUS.CANCELLED);
    order.manualStatusOverride = true; // נעול!

    const update = shouldUpdateOrderStatus(order);

    expect(update).toBeNull(); // ✅ האוטומציה לא תגע!
  });
});

// ============================================
// Test Suite 3: Order-Level Manual Override
// ============================================

describe('Order-Level Manual Override', () => {
  // These tests require DB connection
  beforeEach(async () => {
    await Order.deleteMany({});
  }, 30000); // 30 second timeout

  test('נעילת סטטוס הזמנה מונעת דריסה אוטומטית', async () => {
    // צור הזמנה עם פריט delivered
    const order = await Order.create({
      ...createMockOrder([ITEM_STATUS.DELIVERED], ORDER_STATUS.CANCELLED),
      manualStatusOverride: true // 🔒 נעול ל-cancelled
    });

    // נסה לעדכן אוטומטית
    applyAutoStatusUpdate(order);
    await order.save();

    // ודא שהסטטוס נשאר cancelled (לא השתנה ל-delivered)
    expect(order.status).toBe(ORDER_STATUS.CANCELLED);
  });

  test('ללא נעילה, האוטומציה משנה את הסטטוס', async () => {
    // צור הזמנה ללא נעילה
    const order = await Order.create({
      ...createMockOrder([ITEM_STATUS.DELIVERED], ORDER_STATUS.PENDING),
      manualStatusOverride: false // 🔓 לא נעול
    });

    // נסה לעדכן אוטומטית
    applyAutoStatusUpdate(order);
    await order.save();

    // ודא שהסטטוס השתנה ל-delivered
    expect(order.status).toBe(ORDER_STATUS.DELIVERED);
  });

  test('שחרור נעילה מאפשר לאוטומציה לעדכן שוב', async () => {
    // צור הזמנה נעולה
    const order = await Order.create({
      ...createMockOrder([ITEM_STATUS.DELIVERED], ORDER_STATUS.CANCELLED),
      manualStatusOverride: true
    });

    // ודא שהאוטומציה לא משנה (נעול)
    applyAutoStatusUpdate(order);
    await order.save();
    expect(order.status).toBe(ORDER_STATUS.CANCELLED);

    // שחרר נעילה
    order.manualStatusOverride = false;

    // עכשיו האוטומציה צריכה לעבוד
    applyAutoStatusUpdate(order);
    await order.save();
    expect(order.status).toBe(ORDER_STATUS.DELIVERED);
  });
});

// ============================================
// Test Suite 4: Complex Scenarios
// ============================================

describe('תרחישים מורכבים', () => {
  beforeEach(async () => {
    await Order.deleteMany({});
  }, 30000);

  test('תרחיש 1: לקוח אישר קבלה בטלפון, אדמין נועל ל-delivered', async () => {
    // צור הזמנה עם פריטים שעדיין בדרך
    const order = await Order.create({
      ...createMockOrder([
        ITEM_STATUS.SHIPPED_TO_CUSTOMER,
        ITEM_STATUS.SHIPPED_TO_CUSTOMER
      ], ORDER_STATUS.SHIPPED),
      manualStatusOverride: false
    });

    // אדמין נועל את ההזמנה ל-delivered (לקוח אישר בטלפון)
    order.status = ORDER_STATUS.DELIVERED;
    order.manualStatusOverride = true;
    await order.save();

    // עכשיו פריט מגיע למעקב - האוטומציה לא תשנה חזרה ל-shipped
    order.items[0].itemStatus = ITEM_STATUS.DELIVERED;
    applyAutoStatusUpdate(order);
    await order.save();

    expect(order.status).toBe(ORDER_STATUS.DELIVERED); // נשאר נעול!
  });

  test('תרחיש 2: החלטה עסקית לבטל הזמנה למרות שפריטים בדרך', async () => {
    const order = await Order.create({
      ...createMockOrder([
        ITEM_STATUS.ORDERED,
        ITEM_STATUS.IN_TRANSIT
      ], ORDER_STATUS.IN_PROGRESS)
    });

    // אדמין מבטל את ההזמנה
    order.status = ORDER_STATUS.CANCELLED;
    order.manualStatusOverride = true;
    order.timeline.push({
      status: ORDER_STATUS.CANCELLED,
      message: 'ביטול הזמנה - החלטה עסקית',
      timestamp: new Date(),
      internal: true
    });
    await order.save();

    // פריט נוסף מגיע - האוטומציה לא תשנה בחזרה ל-in_progress
    order.items[1].itemStatus = ITEM_STATUS.ARRIVED_ISRAEL;
    applyAutoStatusUpdate(order);
    await order.save();

    expect(order.status).toBe(ORDER_STATUS.CANCELLED);
  });

  test('תרחיש 3: מעבר בין כל הסטטוסים בסדר הנכון', async () => {
    const order = await Order.create(
      createMockOrder([ITEM_STATUS.PENDING])
    );

    const statusFlow = [
      { itemStatus: ITEM_STATUS.ORDERED, expectedOrder: ORDER_STATUS.IN_PROGRESS },
      { itemStatus: ITEM_STATUS.IN_TRANSIT, expectedOrder: ORDER_STATUS.IN_PROGRESS },
      { itemStatus: ITEM_STATUS.ARRIVED_ISRAEL, expectedOrder: ORDER_STATUS.READY_TO_SHIP },
      { itemStatus: ITEM_STATUS.SHIPPED_TO_CUSTOMER, expectedOrder: ORDER_STATUS.SHIPPED },
      { itemStatus: ITEM_STATUS.DELIVERED, expectedOrder: ORDER_STATUS.DELIVERED }
    ];

    for (const { itemStatus, expectedOrder } of statusFlow) {
      order.items[0].itemStatus = itemStatus;
      applyAutoStatusUpdate(order);
      await order.save();

      expect(order.status).toBe(expectedOrder);
    }
  });

  test('תרחיש 4: הזמנה עם 3 פריטים בשלבים שונים', async () => {
    const order = await Order.create({
      ...createMockOrder([
        ITEM_STATUS.PENDING,           // ממתין
        ITEM_STATUS.ORDERED,           // הוזמן
        ITEM_STATUS.DELIVERED          // נמסר
      ])
    });

    applyAutoStatusUpdate(order);
    await order.save();

    // הסטטוס צריך להיות pending (הפריט הכי פחות מתקדם)
    expect(order.status).toBe(ORDER_STATUS.PENDING);

    // עדכן את הפריט הראשון
    order.items[0].itemStatus = ITEM_STATUS.ORDERED;
    applyAutoStatusUpdate(order);
    await order.save();

    // עכשיו צריך להיות in_progress
    expect(order.status).toBe(ORDER_STATUS.IN_PROGRESS);
  });

  test('תרחיש 5: נעילה חלקית - רק פריט אחד נעול', async () => {
    // בטסט זה, רק הפריט נעול (לא ההזמנה כולה)
    // זה לא משפיע על סטטוס ההזמנה - רק על הפריט עצמו

    const order = await Order.create({
      ...createMockOrder([
        ITEM_STATUS.DELIVERED,
        ITEM_STATUS.PENDING
      ]),
      manualStatusOverride: false // ההזמנה לא נעולה
    });

    // נעל את הפריט השני ב-pending
    order.items[1].manualStatusOverride = true;

    applyAutoStatusUpdate(order);
    await order.save();

    // סטטוס ההזמנה צריך להיות pending (כי פריט 2 עדיין pending)
    expect(order.status).toBe(ORDER_STATUS.PENDING);
  });
});

// ============================================
// Test Suite 5: Edge Cases
// ============================================

describe('מקרי קצה', () => {
  beforeEach(async () => {
    await Order.deleteMany({});
  }, 30000);

  test('הזמנה ללא פריטים → status = pending', () => {
    const status = calculateAutoOrderStatus([]);
    expect(status).toBe(ORDER_STATUS.PENDING);
  });

  test('הזמנה עם פריטים null → status = pending', () => {
    const status = calculateAutoOrderStatus(null);
    expect(status).toBe(ORDER_STATUS.PENDING);
  });

  test('פריט עם סטטוס undefined → מטופל כ-pending', () => {
    const items = [
      { itemStatus: undefined, cancellation: { cancelled: false } }
    ];
    const status = calculateAutoOrderStatus(items);
    expect(status).toBe(ORDER_STATUS.PENDING);
  });

  test('פריטים מבוטלים ולא מבוטלים ביחד', () => {
    const items = [
      { itemStatus: ITEM_STATUS.DELIVERED, cancellation: { cancelled: false } },
      { itemStatus: ITEM_STATUS.ORDERED, cancellation: { cancelled: true } },
      { itemStatus: ITEM_STATUS.PENDING, cancellation: { cancelled: false } }
    ];

    const status = calculateAutoOrderStatus(items);
    // מתעלם מהפריט המבוטל, לוקח את הכי פחות מתקדם מהשאר
    expect(status).toBe(ORDER_STATUS.PENDING);
  });

  test('נעילה כפולה - גם הזמנה וגם פריט', async () => {
    const order = await Order.create({
      ...createMockOrder([ITEM_STATUS.DELIVERED], ORDER_STATUS.CANCELLED),
      manualStatusOverride: true // הזמנה נעולה
    });

    order.items[0].manualStatusOverride = true; // פריט נעול

    applyAutoStatusUpdate(order);
    await order.save();

    // שני הנעילות צריכות לעבוד
    expect(order.status).toBe(ORDER_STATUS.CANCELLED);
    expect(order.items[0].itemStatus).toBe(ITEM_STATUS.DELIVERED);
  });
});

// ============================================
// Test Suite 6: Timeline Integration
// ============================================

describe('שילוב עם Timeline', () => {
  beforeEach(async () => {
    await Order.deleteMany({});
  }, 30000);

  test('עדכון אוטומטי מוסיף אירוע ל-timeline', async () => {
    const order = await Order.create(
      createMockOrder([ITEM_STATUS.DELIVERED], ORDER_STATUS.PENDING)
    );

    const timelineBefore = order.timeline.length;

    applyAutoStatusUpdate(order);
    await order.save();

    expect(order.timeline.length).toBeGreaterThan(timelineBefore);

    const lastEvent = order.timeline[order.timeline.length - 1];
    expect(lastEvent.status).toBe(ORDER_STATUS.DELIVERED);
    expect(lastEvent.internal).toBe(true); // אירוע פנימי
  });

  test('נעילה ידנית לא מוסיפה אירוע אוטומטי', async () => {
    const order = await Order.create({
      ...createMockOrder([ITEM_STATUS.DELIVERED], ORDER_STATUS.CANCELLED),
      manualStatusOverride: true
    });

    const timelineBefore = order.timeline.length;

    applyAutoStatusUpdate(order);
    await order.save();

    // לא צריך להוסיף אירוע כי האוטומציה לא פעלה
    expect(order.timeline.length).toBe(timelineBefore);
  });
});

// ============================================
// Test Suite 7: Performance & Stress Tests
// ============================================

describe('ביצועים ולחץ', () => {
  beforeEach(async () => {
    await Order.deleteMany({});
  }, 30000);

  test('הזמנה עם 50 פריטים - חישוב מהיר', () => {
    const items = Array(50).fill(null).map(() => ({
      itemStatus: ITEM_STATUS.ORDERED,
      cancellation: { cancelled: false }
    }));

    const start = Date.now();
    const status = calculateAutoOrderStatus(items);
    const duration = Date.now() - start;

    expect(status).toBe(ORDER_STATUS.IN_PROGRESS);
    expect(duration).toBeLessThan(100); // צריך להיות מהיר מאוד
  });

  test('100 עדכונים רצופים של סטטוס', async () => {
    const order = await Order.create(
      createMockOrder([ITEM_STATUS.PENDING])
    );

    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      order.items[0].itemStatus = i % 2 === 0
        ? ITEM_STATUS.ORDERED
        : ITEM_STATUS.PENDING;

      applyAutoStatusUpdate(order);
      await order.save();
    }

    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000); // 100 עדכונים תוך 5 שניות
  });
});
