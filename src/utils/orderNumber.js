import Order from '../models/Order.js';

export const generateOrderNumber = async () => {
  const prefix = process.env.ORDER_NUMBER_PREFIX || 'AM';
  const length = parseInt(process.env.ORDER_NUMBER_LENGTH) || 8;
  
  let orderNumber;
  let exists = true;
  
  while (exists) {
    // Generate random number
    const randomNum = Math.floor(Math.random() * Math.pow(10, length));
    const paddedNum = String(randomNum).padStart(length, '0');
    orderNumber = `${prefix}${paddedNum}`;
    
    // Check if exists
    const existing = await Order.findOne({ orderNumber });
    exists = !!existing;
  }
  
  return orderNumber;
};