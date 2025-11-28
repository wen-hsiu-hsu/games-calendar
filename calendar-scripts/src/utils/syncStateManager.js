import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNC_STATE_FILE = path.join(__dirname, '../../data/sync-state.json');

/**
 * 載入同步狀態
 * @returns {Promise<Object>} 同步狀態物件
 */
export async function loadSyncState() {
  try {
    const data = await fs.readFile(SYNC_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 檔案不存在時返回空狀態
    if (error.code === 'ENOENT') {
      console.log('Sync state file not found, returning empty state');
      return {
        version: '1.0',
        lastSync: null,
        sports: {}
      };
    }
    throw error;
  }
}

/**
 * 儲存同步狀態 (帶重試機制)
 * @param {Object} syncState - 同步狀態物件
 */
export async function saveSyncState(syncState) {
  const retries = 3;

  for (let i = 0; i < retries; i++) {
    try {
      // 確保目錄存在
      await fs.mkdir(path.dirname(SYNC_STATE_FILE), { recursive: true });

      await fs.writeFile(
        SYNC_STATE_FILE,
        JSON.stringify(syncState, null, 2),
        'utf-8'
      );
      return; // 成功,返回
    } catch (error) {
      if (i === retries - 1) {
        console.error('Error saving sync state:', error);
        throw error;
      }
      console.warn(`Sync state save failed (attempt ${i + 1}/${retries}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

/**
 * 更新單一運動的同步狀態
 * @param {string} sportId - 運動 ID
 * @param {string} eventId - 事件 ID
 * @param {Object} syncData - 同步資料 { googleEventId, lastSynced, hash }
 */
export async function updateSyncState(sportId, eventId, syncData) {
  const state = await loadSyncState();

  if (!state.sports[sportId]) {
    state.sports[sportId] = { events: {}, stats: {} };
  }

  state.sports[sportId].events[eventId] = syncData;
  state.lastSync = new Date().toISOString();

  await saveSyncState(state);
}

/**
 * 移除單一事件的同步狀態
 * @param {string} sportId - 運動 ID
 * @param {string} eventId - 事件 ID
 */
export async function removeSyncState(sportId, eventId) {
  const state = await loadSyncState();

  if (state.sports[sportId]?.events[eventId]) {
    delete state.sports[sportId].events[eventId];
    state.lastSync = new Date().toISOString();
    await saveSyncState(state);
  }
}
