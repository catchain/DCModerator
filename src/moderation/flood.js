import { config } from '../config.js';

// userId -> массив timestamp (мс) последних сообщений в окне.
const buckets = new Map();

/**
 * Регистрирует сообщение и сообщает, превышен ли лимит флуда.
 *
 * @param {number} userId
 * @returns {boolean} true — если нужно наказать за флуд
 */
export function registerAndCheckFlood(userId) {
  const now = Date.now();
  const windowMs = config.flood.windowSec * 1000;

  const arr = (buckets.get(userId) || []).filter((ts) => now - ts < windowMs);
  arr.push(now);
  buckets.set(userId, arr);

  return arr.length > config.flood.maxMessages;
}

export function clearFlood(userId) {
  buckets.delete(userId);
}
