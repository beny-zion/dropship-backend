import NodeCache from 'node-cache';

// ⚡ In-memory cache to reduce MongoDB queries
//
// HOW IT WORKS:
// 1. Cache is GLOBAL - shared across ALL users on this server instance
// 2. When user A requests a product, it's fetched from DB and cached
// 3. When user B requests the SAME product, it's served from cache (instant!)
// 4. Cache expires after TTL (Time To Live) and is automatically deleted
//
// CACHE TIMES:
// - Products: 5 minutes (300s) - products don't change often
// - Categories: 10 minutes (600s) - rarely change
// - Cart: NO CACHE - prices can change, must always be fresh!
//
// MEMORY USAGE:
// - ~1KB per product in cache
// - With 1000 products cached = ~1MB memory
// - Cache auto-cleans expired items every 60 seconds
//
// SCALING:
// - For multi-server setup, use Redis instead of node-cache
// - node-cache is per-server only (not shared across servers)
const cache = new NodeCache({
  stdTTL: 300, // Default: 5 minutes
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false // Better performance, but be careful with mutations
});

// Cache keys
export const CACHE_KEYS = {
  PRODUCT: (id) => `product:${id}`,
  PRODUCTS_LIST: (query) => `products:${JSON.stringify(query)}`,
  CART: (userId) => `cart:${userId}`,
  CATEGORIES: 'categories'
};

// Helper functions
export const cacheGet = (key) => {
  const value = cache.get(key);
  if (value) {
    console.log(`✅ Cache HIT: ${key}`);
  } else {
    console.log(`❌ Cache MISS: ${key}`);
  }
  return value;
};

export const cacheSet = (key, value, ttl) => {
  cache.set(key, value, ttl);
  console.log(`💾 Cache SET: ${key} (TTL: ${ttl || 'default'}s)`);
};

export const cacheDel = (key) => {
  cache.del(key);
  console.log(`🗑️ Cache DELETE: ${key}`);
};

export const cacheFlush = () => {
  cache.flushAll();
  console.log('🗑️ Cache FLUSH ALL');
};

// Delete all keys matching a pattern
export const cacheDelPattern = (pattern) => {
  const keys = cache.keys();
  const matchingKeys = keys.filter(key => key.includes(pattern));
  matchingKeys.forEach(key => cache.del(key));
  console.log(`🗑️ Cache DELETE pattern: ${pattern} (${matchingKeys.length} keys)`);
};

export default cache;
