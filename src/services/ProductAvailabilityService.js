/**
 * Product Availability Service
 * =============================
 * שירות מרכזי לניהול זמינות מוצרים.
 * כל שינוי בזמינות חייב לעבור דרך שירות זה.
 *
 * תכונות:
 * - עדכון זמינות מוצרים וווריאנטים
 * - Cascade logic (מוצר ראשי → כל הווריאנטים)
 * - בדיקת שינויי מחיר
 * - סינכרון עם הזמנות ועגלות
 * - התראות ללקוחות ומנהלים
 * - Audit logging מלא
 * - תמיכה ב-MongoDB Transactions
 */

import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import AuditLog from '../models/AuditLog.js';

class ProductAvailabilityService extends EventEmitter {
  constructor() {
    super();
    this.PRICE_CHANGE_THRESHOLD = 10; // 10% עליה מקסימלית
    this.MAX_PRICE_HISTORY = 50; // שמור רק 50 רשומות אחרונות
  }

  /**
   * 🎯 פונקציה מרכזית: עדכון זמינות מוצר/ווריאנט
   * =============================================
   * זו הפונקציה היחידה שמשנה זמינות במערכת!
   *
   * @param {Object} options
   * @param {string} options.productId - מזהה המוצר
   * @param {string} options.variantSku - SKU ווריאנט (אופציונלי)
   * @param {boolean} options.available - זמינות חדשה
   * @param {string} options.reason - סיבת העדכון
   * @param {string} options.source - מקור העדכון
   * @param {ObjectId} options.triggeredBy - מי ביצע
   * @param {Object} options.metadata - מידע נוסף
   * @param {Session} options.session - MongoDB session
   */
  async updateAvailability({
    productId,
    variantSku = null,
    available,
    reason,
    source, // 'admin_edit', 'inventory_check', 'order_cancellation', 'order_actual_price'
    triggeredBy,
    metadata = {},
    session = null
  }) {
    const useSession = session || await mongoose.startSession();
    const shouldCommit = !session; // רק אם אנחנו יצרנו session

    try {
      if (shouldCommit) await useSession.startTransaction();

      // 1️⃣ שליפת המוצר
      const product = await Product.findById(productId).session(useSession);
      if (!product) {
        throw new Error('מוצר לא נמצא');
      }

      // 2️⃣ שמירת מצב קודם (לפני שינוי)
      const previousState = this._capturePreviousState(product, variantSku);

      // 3️⃣ Validation - בדיקת תקינות
      this._validateAvailabilityUpdate(product, variantSku, available);

      // 4️⃣ החלת Cascade Logic והעדכון
      const cascadeResult = await this._applyCascadeLogic(
        product,
        variantSku,
        available,
        reason
      );

      // 5️⃣ בדיקת שינוי מחיר (אם רלוונטי)
      let priceChangeDetected = null;
      if (metadata.actualPrice) {
        priceChangeDetected = await this._checkPriceChange(
          product,
          metadata.actualPrice,
          triggeredBy,
          useSession
        );
      }

      // 6️⃣ שמירת המוצר
      await product.save({ session: useSession });

      // 7️⃣ סינכרון עם הזמנות פעילות
      const affectedOrders = await this._syncWithActiveOrders(
        productId,
        cascadeResult.affectedVariants,
        available,
        useSession
      );

      // 8️⃣ סינכרון עם עגלות לקוחות
      const affectedCarts = await this._syncWithCarts(
        productId,
        cascadeResult.affectedVariants,
        available,
        useSession
      );

      // 9️⃣ רישום Audit Log
      await this._recordAuditLog({
        action: available ? 'MARK_AVAILABLE' : 'MARK_UNAVAILABLE',
        productId,
        variantSku,
        source,
        triggeredBy,
        previousState,
        newState: this._capturePreviousState(product, variantSku),
        reason,
        metadata: {
          ...metadata,
          cascadeEffect: cascadeResult.cascaded,
          affectedVariantsCount: cascadeResult.affectedVariants.length,
          affectedOrders: affectedOrders.length,
          affectedCarts: affectedCarts.length,
          priceChangeDetected
        },
        session: useSession
      });

      // 🔟 Commit transaction
      if (shouldCommit) {
        await useSession.commitTransaction();

        // התראות (מחוץ לטרנזקציה)
        await this._sendNotifications({
          product,
          variantSku,
          available,
          source,
          affectedOrders,
          affectedCarts,
          priceChangeDetected,
          cascadeResult
        });

        // פרסם אירוע
        this.emit('availabilityChanged', {
          productId,
          variantSku,
          available,
          source,
          cascaded: cascadeResult.cascaded,
          affectedVariants: cascadeResult.affectedVariants.length,
          affectedOrders: affectedOrders.length,
          affectedCarts: affectedCarts.length
        });
      }

      return {
        success: true,
        product,
        previousState,
        cascadeResult,
        affectedOrders: affectedOrders.length,
        affectedCarts: affectedCarts.length,
        priceChangeDetected
      };

    } catch (error) {
      if (shouldCommit) await useSession.abortTransaction();
      throw error;
    } finally {
      if (shouldCommit) useSession.endSession();
    }
  }

  /**
   * 🔍 בדיקות תקינות
   */
  _validateAvailabilityUpdate(product, variantSku, available) {
    // ✅ חוק 1: אם מוצר ראשי לא זמין, לא ניתן לסמן ווריאנט כזמין
    if (variantSku && available && product.stock?.available === false) {
      throw new Error(
        'לא ניתן לסמן ווריאנט כזמין כאשר המוצר הראשי לא זמין. ' +
        'תחילה סמן את המוצר הראשי כזמין.'
      );
    }

    // ✅ חוק 2: אם אין ווריאנטים, עדכון ווריאנט לא אפשרי
    if (variantSku && (!product.variants || product.variants.length === 0)) {
      throw new Error('המוצר אינו כולל ווריאנטים');
    }

    // ✅ חוק 3: ווריאנט חייב להיות קיים
    if (variantSku) {
      const variantExists = product.variants.some(v => v.sku === variantSku);
      if (!variantExists) {
        throw new Error(`ווריאנט ${variantSku} לא קיים במוצר זה`);
      }
    }

    return true;
  }

  /**
   * 🌊 Cascade Logic - הלוגיקה המרכזית
   * חוק: אם מוצר ראשי לא זמין → כל הווריאנטים לא זמינים
   */
  async _applyCascadeLogic(product, variantSku, available, reason) {
    const result = {
      cascaded: false,
      affectedVariants: [],
      originalTarget: variantSku ? 'variant' : 'product',
      messages: []
    };

    // 📍 מקרה 1: עדכון מוצר ראשי
    if (!variantSku) {
      product.stock.available = available;
      product.stock.lastChecked = new Date();

      // 🌊 אם המוצר הראשי נעשה לא זמין → כל הווריאנטים לא זמינים
      if (!available && product.variants && product.variants.length > 0) {
        result.cascaded = true;

        for (const variant of product.variants) {
          // רק אם הווריאנט היה זמין - עדכן אותו
          if (variant.stock?.available !== false) {
            variant.stock = variant.stock || {};
            variant.stock.available = false;
            variant.stock.lastChecked = new Date();

            result.affectedVariants.push({
              sku: variant.sku,
              color: variant.color,
              size: variant.size,
              previouslyAvailable: variant.stock.available !== false
            });
          }
        }

        result.messages.push(
          `המוצר הראשי סומן כלא זמין → ${result.affectedVariants.length} ווריאנטים עודכנו אוטומטית`
        );
      }

      // ✅ אם המוצר הראשי נעשה זמין → לא משנים ווריאנטים!
      if (available) {
        result.messages.push(
          'המוצר הראשי סומן כזמין. ווריאנטים לא שונו (יש לעדכן אותם ידנית במידת הצורך)'
        );
      }

      // עדכון סטטוס מוצר
      if (!available) {
        product.status = 'out_of_stock';
      } else if (product.status === 'out_of_stock') {
        product.status = 'active';
      }
    }

    // 📍 מקרה 2: עדכון ווריאנט ספציפי
    else {
      const variant = product.variants.find(v => v.sku === variantSku);

      if (!variant) {
        throw new Error(`ווריאנט ${variantSku} לא נמצא`);
      }

      // 🔒 בדיקה: האם המוצר הראשי זמין?
      if (!available && product.stock?.available === false) {
        result.messages.push(
          '⚠️ שים לב: המוצר הראשי כבר מסומן כלא זמין, לכן הווריאנט ממילא לא זמין'
        );
      }

      // עדכון הווריאנט
      variant.stock = variant.stock || {};
      const wasAvailable = variant.stock.available !== false;
      variant.stock.available = available;
      variant.stock.lastChecked = new Date();

      result.affectedVariants.push({
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        previouslyAvailable: wasAvailable
      });

      // 🤔 בדיקה: האם כל הווריאנטים לא זמינים עכשיו?
      const allVariantsUnavailable = product.variants.every(
        v => v.stock?.available === false
      );

      if (allVariantsUnavailable && product.stock?.available !== false) {
        result.messages.push(
          `💡 כל הווריאנטים לא זמינים. שקול לסמן גם את המוצר הראשי כלא זמין.`
        );
      }
    }

    return result;
  }

  /**
   * 💰 בדיקת שינוי מחיר
   */
  async _checkPriceChange(product, actualPrice, triggeredBy, session) {
    const expectedPrice = product.costBreakdown?.baseCost?.ils || 0;

    if (expectedPrice === 0) return null;

    const priceDiff = ((actualPrice - expectedPrice) / expectedPrice) * 100;

    // אתחול priceTracking אם לא קיים
    if (!product.priceTracking) {
      product.priceTracking = {
        lastCheckedPrice: {},
        priceHistory: [],
        priceAlertThreshold: 10
      };
    }

    // עדכן lastCheckedPrice
    product.priceTracking.lastCheckedPrice = {
      ils: actualPrice,
      checkedAt: new Date(),
      checkedBy: triggeredBy
    };

    // הוסף להיסטוריה
    product.priceTracking.priceHistory.push({
      price: { ils: actualPrice },
      recordedAt: new Date(),
      source: 'order_actual_cost',
      recordedBy: triggeredBy
    });

    // שמור רק MAX_PRICE_HISTORY רשומות אחרונות
    if (product.priceTracking.priceHistory.length > this.MAX_PRICE_HISTORY) {
      product.priceTracking.priceHistory =
        product.priceTracking.priceHistory.slice(-this.MAX_PRICE_HISTORY);
    }

    const threshold = product.priceTracking.priceAlertThreshold || this.PRICE_CHANGE_THRESHOLD;

    return {
      expectedPrice,
      actualPrice,
      priceDiff: parseFloat(priceDiff.toFixed(2)),
      isSignificant: Math.abs(priceDiff) > threshold,
      threshold
    };
  }

  /**
   * 🔄 סינכרון עם הזמנות פעילות
   */
  async _syncWithActiveOrders(productId, affectedVariants, available, session) {
    const query = {
      'items.product': productId,
      status: { $nin: ['delivered', 'cancelled'] }
    };

    // אם יש ווריאנטים מושפעים, סנן לפיהם
    if (affectedVariants.length > 0) {
      const affectedSkus = affectedVariants.map(v => v.sku);
      query['items.variantSku'] = { $in: affectedSkus };
    }

    const orders = await Order.find(query).session(session);

    for (const order of orders) {
      let needsUpdate = false;

      for (const item of order.items) {
        const isAffected = this._isItemAffected(
          item,
          productId,
          affectedVariants
        );

        if (isAffected && !item.cancellation?.cancelled) {
          if (!item.metadata) item.metadata = {};
          item.metadata.productAvailabilityChanged = {
            available,
            changedAt: new Date(),
            affectedBy: affectedVariants.length > 0 ? 'variants' : 'product'
          };
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        order.computed.needsAttention = true;
        await order.save({ session });
      }
    }

    return orders;
  }

  /**
   * 🛒 סינכרון עם עגלות
   */
  async _syncWithCarts(productId, affectedVariants, available, session) {
    const query = {
      'items.product': productId
    };

    if (affectedVariants.length > 0) {
      const affectedSkus = affectedVariants.map(v => v.sku);
      query['items.variantSku'] = { $in: affectedSkus };
    }

    const carts = await Cart.find(query).session(session);

    if (!available) {
      for (const cart of carts) {
        let cartModified = false;

        for (const item of cart.items) {
          const isAffected = this._isItemAffected(
            item,
            productId,
            affectedVariants
          );

          if (isAffected) {
            if (!item.metadata) item.metadata = {};
            item.metadata.unavailable = true;
            item.metadata.markedUnavailableAt = new Date();
            cartModified = true;
          }
        }

        if (cartModified) {
          await cart.save({ session });
        }
      }
    }

    return carts;
  }

  /**
   * 🎯 בדיקה: האם פריט מושפע משינוי זמינות
   */
  _isItemAffected(item, productId, affectedVariants) {
    if (item.product.toString() !== productId.toString()) {
      return false;
    }

    if (affectedVariants.length === 0) {
      return true;
    }

    if (item.variantSku) {
      return affectedVariants.some(v => v.sku === item.variantSku);
    }

    return affectedVariants.length === 0;
  }

  /**
   * 📝 רישום Audit Log
   */
  async _recordAuditLog({
    action,
    productId,
    variantSku,
    source,
    triggeredBy,
    previousState,
    newState,
    reason,
    metadata,
    session
  }) {
    await AuditLog.create([{
      user: triggeredBy,
      action,
      targetType: 'Product',
      targetId: productId,
      details: {
        variantSku,
        source,
        reason,
        ...metadata
      },
      changes: {
        before: previousState,
        after: newState
      },
      timestamp: new Date()
    }], { session });
  }

  /**
   * 📧 התראות
   */
  async _sendNotifications({
    product,
    variantSku,
    available,
    source,
    affectedOrders,
    affectedCarts,
    priceChangeDetected,
    cascadeResult
  }) {
    const notifications = [];

    // התראה ללקוחות עם המוצר בעגלה
    if (!available && affectedCarts.length > 0) {
      for (const cart of affectedCarts) {
        notifications.push(
          this._sendCartUnavailableEmail(cart, product, cascadeResult)
        );
      }
    }

    // התראה למנהל על הזמנות שצריכות תשומת לב
    if (affectedOrders.length > 0) {
      notifications.push(
        this._sendOrdersAttentionEmail(affectedOrders, product, cascadeResult)
      );
    }

    // התראה מיוחדת על Cascade Effect
    if (cascadeResult.cascaded) {
      notifications.push(
        this._sendCascadeNotification(product, cascadeResult)
      );
    }

    // התראה על שינוי מחיר משמעותי
    if (priceChangeDetected?.isSignificant) {
      notifications.push(
        this._sendPriceChangeEmail(product, priceChangeDetected)
      );
    }

    await Promise.allSettled(notifications);
  }

  async _sendCartUnavailableEmail(cart, product, cascadeResult) {
    console.log(`📧 [Email] Cart unavailable notification - User: ${cart.user}`);
    console.log(`   Product: ${product.name_he}`);
    if (cascadeResult.affectedVariants.length > 0) {
      console.log(`   Affected variants: ${cascadeResult.affectedVariants.length}`);
    }
    // TODO: implement actual email sending with your email service
  }

  async _sendOrdersAttentionEmail(orders, product, cascadeResult) {
    console.log(`📧 [Email] Orders need attention - ${orders.length} orders`);
    console.log(`   Product: ${product.name_he}`);
    // TODO: implement actual email sending
  }

  async _sendCascadeNotification(product, cascadeResult) {
    console.log(`🌊 [Email] Cascade Effect Notification`);
    console.log(`   Product: ${product.name_he}`);
    console.log(`   Affected Variants: ${cascadeResult.affectedVariants.length}`);
    console.log(`   Details:`);
    cascadeResult.affectedVariants.forEach(v => {
      console.log(`     • ${v.color} ${v.size} (SKU: ${v.sku})`);
    });
    console.log(`   Messages:`);
    cascadeResult.messages.forEach(msg => console.log(`     ${msg}`));
    // TODO: implement actual email sending
  }

  async _sendPriceChangeEmail(product, priceChange) {
    console.log(`💰 [Email] Price Change Alert`);
    console.log(`   Product: ${product.name_he}`);
    console.log(`   Expected: ₪${priceChange.expectedPrice}`);
    console.log(`   Actual: ₪${priceChange.actualPrice}`);
    console.log(`   Difference: ${priceChange.priceDiff}%`);
    // TODO: implement actual email sending
  }

  /**
   * 🎬 פונקציות עזר
   */
  _capturePreviousState(product, variantSku) {
    if (variantSku) {
      const variant = product.variants.find(v => v.sku === variantSku);
      return {
        type: 'variant',
        sku: variantSku,
        available: variant?.stock?.available,
        color: variant?.color,
        size: variant?.size
      };
    }
    return {
      type: 'product',
      available: product.stock?.available,
      status: product.status
    };
  }
}

// ייצוא Singleton
export default new ProductAvailabilityService();
