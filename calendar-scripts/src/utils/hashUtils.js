import crypto from 'crypto';

/**
 * 計算事件的 hash 值 (用於快速比對變更)
 * @param {Object} event - 事件物件
 * @returns {string} MD5 hash (前 16 字元)
 */
export function calculateEventHash(event) {
  // 只對會影響 Google Calendar 顯示的欄位計算 hash
  const hashFields = {
    name: event.name || '',
    dateStart: event.dateStart || '',
    dateEnd: event.dateEnd || '',
    location: event.location || {},
    category: event.category || '',
    level: event.level || '',
    prize: event.prize || '',
    url: event.url || ''
  };

  // 排序 key 確保穩定性
  const sortedKeys = Object.keys(hashFields).sort();
  const sortedFields = {};
  for (const key of sortedKeys) {
    sortedFields[key] = hashFields[key];
  }

  const hashInput = JSON.stringify(sortedFields);

  return crypto
    .createHash('md5')
    .update(hashInput)
    .digest('hex')
    .substring(0, 16);
}
