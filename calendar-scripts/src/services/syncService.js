import { google } from 'googleapis';
import { authorize } from '../utils/authenticate.js';
import { loadSyncState, saveSyncState } from '../utils/syncStateManager.js';
import { calculateEventHash } from '../utils/hashUtils.js';
import { updateCalendarInfo } from '../utils/calendarStorage.js';

// 日曆顏色對映
const CALENDAR_COLORS = {
  'bwf': '5',  // 黃色
  'default': '1'  // 藍色
};

/**
 * 同步賽事到 Google Calendar
 * @param {string} sportId - 運動 ID
 * @param {Array} localEvents - 本地標準化的賽事資料
 * @returns {Promise<Object>} 同步結果統計
 */
export async function syncWithCalendar(sportId, localEvents) {
  console.log(`\n🔄 Starting sync for ${sportId}...`);

  try {
    // 1. 取得認證
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    // 2. 取得或建立日曆
    const calendarId = await getOrCreateCalendar(calendar, sportId);

    // 3. 載入同步狀態
    const syncState = await loadSyncState();
    const sportSyncState = syncState.sports[sportId] || {
      calendarId,
      events: {},
      stats: { totalEvents: 0, lastUpdate: new Date().toISOString() }
    };

    // 4. 建立本地事件映射表
    const localEventsMap = new Map();
    for (const event of localEvents) {
      localEventsMap.set(event.id, event);
    }

    // 5. 同步統計
    const stats = {
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0
    };

    // 6. 處理本地事件 (CREATE / UPDATE / SKIP)
    for (const [eventId, event] of localEventsMap.entries()) {
      const existingSync = sportSyncState.events[eventId];
      const eventHash = calculateEventHash(event);

      if (!existingSync) {
        // CREATE: 事件不存在於 sync-state
        console.log(`📝 Creating: ${event.name}`);
        try {
          const googleEventId = await createCalendarEvent(calendar, calendarId, event);

          sportSyncState.events[eventId] = {
            googleEventId,
            lastSynced: new Date().toISOString(),
            hash: eventHash
          };
          stats.created++;
        } catch (error) {
          console.error(`❌ Failed to create ${event.name}:`, error.message);
        }

      } else if (existingSync.hash !== eventHash) {
        // UPDATE: hash 不同,需要更新
        console.log(`🔄 Updating: ${event.name}`);
        try {
          await updateCalendarEvent(calendar, calendarId, existingSync.googleEventId, event);

          existingSync.hash = eventHash;
          existingSync.lastSynced = new Date().toISOString();
          stats.updated++;
        } catch (error) {
          console.error(`❌ Failed to update ${event.name}:`, error.message);
        }

      } else {
        // SKIP: hash 相同,無變更
        console.log(`⏭️  Unchanged: ${event.name}`);
        stats.unchanged++;
      }
    }

    // 7. 刪除不再存在的事件 (DELETE)
    const existingEventIds = Object.keys(sportSyncState.events);
    for (const eventId of existingEventIds) {
      if (!localEventsMap.has(eventId)) {
        console.log(`🗑️  Deleting: ${eventId}`);
        const syncData = sportSyncState.events[eventId];

        try {
          await deleteCalendarEvent(calendar, calendarId, syncData.googleEventId);
          delete sportSyncState.events[eventId];
          stats.deleted++;
        } catch (error) {
          console.error(`❌ Error deleting ${eventId}:`, error.message);
        }
      }
    }

    // 8. 更新同步狀態
    sportSyncState.stats = {
      totalEvents: localEvents.length,
      lastUpdate: new Date().toISOString()
    };

    syncState.sports[sportId] = sportSyncState;
    syncState.lastSync = new Date().toISOString();
    await saveSyncState(syncState);

    // 9. 輸出統計
    console.log(`\n📊 Sync Summary for ${sportId}:`);
    console.log(`   Created: ${stats.created}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Unchanged: ${stats.unchanged}`);
    console.log(`   Deleted: ${stats.deleted}`);
    console.log(`   Total: ${localEvents.length}\n`);

    return {
      success: true,
      calendarId,
      stats
    };

  } catch (error) {
    console.error(`Error syncing ${sportId}:`, error);
    throw error;
  }
}

/**
 * 建立 Google Calendar 事件
 * @param {google.calendar} calendar - Google Calendar API 實例
 * @param {string} calendarId - 日曆 ID
 * @param {Object} event - 事件物件
 * @returns {Promise<string>} Google Event ID
 */
async function createCalendarEvent(calendar, calendarId, event) {
  const eventData = buildEventData(event);

  const response = await calendar.events.insert({
    calendarId,
    requestBody: eventData
  });

  return response.data.id;
}

/**
 * 更新 Google Calendar 事件
 * @param {google.calendar} calendar - Google Calendar API 實例
 * @param {string} calendarId - 日曆 ID
 * @param {string} googleEventId - Google Event ID
 * @param {Object} event - 事件物件
 */
async function updateCalendarEvent(calendar, calendarId, googleEventId, event) {
  const eventData = buildEventData(event);

  await calendar.events.update({
    calendarId,
    eventId: googleEventId,
    requestBody: eventData
  });
}

/**
 * 刪除 Google Calendar 事件
 * @param {google.calendar} calendar - Google Calendar API 實例
 * @param {string} calendarId - 日曆 ID
 * @param {string} googleEventId - Google Event ID
 */
async function deleteCalendarEvent(calendar, calendarId, googleEventId) {
  await calendar.events.delete({
    calendarId,
    eventId: googleEventId
  });
}

/**
 * 建立事件資料結構
 * @param {Object} event - 事件物件
 * @returns {Object} Google Calendar 事件資料
 */
function buildEventData(event) {
  return {
    summary: event.name,
    location: formatLocation(event.location),
    description: event.description || '',
    start: {
      date: formatDate(event.dateStart),
      timeZone: 'UTC'
    },
    end: {
      date: formatDate(event.dateEnd, true),
      timeZone: 'UTC'
    },
    transparency: 'transparent',
    visibility: 'public',
    source: {
      title: `${event.source} Calendar`,
      url: event.url || ''
    }
  };
}

/**
 * 格式化位置資訊
 * @param {Object} location - 位置物件
 * @returns {string} 格式化的位置字串
 */
function formatLocation(location) {
  if (!location) return '';

  return [location.venue, location.city, location.country]
    .filter(Boolean)
    .join(', ');
}

/**
 * 格式化日期為 YYYY-MM-DD 格式
 * @param {string} dateString - ISO 日期字串
 * @param {boolean} isEndDate - 是否為結束日期 (Google Calendar 需要加一天)
 * @returns {string} 格式化的日期
 */
function formatDate(dateString, isEndDate = false) {
  let dateStr = dateString.split('T')[0];

  // Google Calendar 的全天事件結束日期需要是「隔天」
  if (isEndDate) {
    const date = new Date(dateStr + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1);
    dateStr = date.toISOString().split('T')[0];
  }

  return dateStr;
}

/**
 * 取得或建立日曆
 * @param {google.calendar} calendar - Google Calendar API 實例
 * @param {string} sportId - 運動 ID
 * @returns {Promise<string>} 日曆 ID
 */
async function getOrCreateCalendar(calendar, sportId) {
  try {
    // 查找現有的日曆
    const calendarListResponse = await calendar.calendarList.list();
    const calendarList = calendarListResponse.data.items;

    const calendarName = getCalendarName(sportId);
    const calendarDesc = getCalendarDescription(sportId);

    // 查找現有的日曆
    const existingCalendar = calendarList.find(cal => cal.summary === calendarName);

    if (existingCalendar) {
      console.log(`Found existing calendar for ${sportId}: ${existingCalendar.id}`);

      // 更新日曆 ID 到儲存中
      await updateCalendarInfo(sportId, existingCalendar.id);

      // 確保現有日曆的權限設置是正確的
      await updateCalendarAccessSettings(calendar, existingCalendar.id);

      return existingCalendar.id;
    }

    // 沒有找到現有日曆，創建新的
    console.log(`Creating new calendar for ${sportId}...`);
    const newCalendar = await calendar.calendars.insert({
      requestBody: {
        summary: calendarName,
        description: calendarDesc,
        timeZone: 'UTC'
      }
    });

    const calendarId = newCalendar.data.id;

    // 儲存日曆 ID
    await updateCalendarInfo(sportId, calendarId);

    // 設置日曆顏色
    const colorId = CALENDAR_COLORS[sportId] || CALENDAR_COLORS.default;
    await calendar.calendarList.update({
      calendarId: calendarId,
      requestBody: {
        colorId
      }
    });

    // 設置日曆為公開可見
    await updateCalendarAccessSettings(calendar, calendarId);

    console.log(`Created new calendar for ${sportId}: ${calendarId}`);
    return calendarId;
  } catch (error) {
    console.error(`Error getting/creating calendar for ${sportId}:`, error);
    throw error;
  }
}

/**
 * 更新日曆的訪問權限設置
 * @param {google.calendar} calendar - Google Calendar API 實例
 * @param {string} calendarId - 日曆 ID
 */
async function updateCalendarAccessSettings(calendar, calendarId) {
  try {
    console.log(`Setting public access for calendar ${calendarId}...`);

    await calendar.acl.insert({
      calendarId: calendarId,
      requestBody: {
        role: 'reader',
        scope: {
          type: 'default'
        }
      }
    });

    console.log('Calendar access settings updated successfully.');
  } catch (error) {
    // ACL 可能已存在,繼續處理
    if (error.code !== 409) {
      console.error('Error updating calendar access settings:', error.message);
    }
  }
}

/**
 * 獲取日曆名稱
 * @param {string} sportId - 運動 ID
 * @returns {string} 日曆名稱
 */
function getCalendarName(sportId) {
  const names = {
    'bwf': 'BWF Badminton Tournaments'
  };

  return names[sportId] || `${sportId.toUpperCase()} Tournaments`;
}

/**
 * 獲取日曆描述
 * @param {string} sportId - 運動 ID
 * @returns {string} 日曆描述
 */
function getCalendarDescription(sportId) {
  const descriptions = {
    'bwf': 'Badminton World Federation tournament calendar'
  };

  return descriptions[sportId] || `${sportId.toUpperCase()} tournament calendar`;
}

/**
 * 修復同步狀態 (驗證 sync-state 中的 googleEventId 是否仍存在於日曆)
 * @param {string} sportId - 運動 ID
 * @returns {Promise<Object>} 修復結果
 */
export async function repairSyncState(sportId) {
  console.log(`\n🔧 Repairing sync state for ${sportId}...`);

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const syncState = await loadSyncState();
    const sportState = syncState.sports[sportId];

    if (!sportState) {
      console.log('No sync state found, nothing to repair.');
      return { repaired: 0, total: 0 };
    }

    const calendarId = sportState.calendarId;
    let repairedCount = 0;
    let totalCount = Object.keys(sportState.events).length;

    // 驗證每個 googleEventId
    for (const [eventId, syncData] of Object.entries(sportState.events)) {
      try {
        // 嘗試取得事件
        await calendar.events.get({
          calendarId,
          eventId: syncData.googleEventId
        });
        // 事件存在,OK
      } catch (error) {
        if (error.code === 404) {
          // 事件不存在,從 sync-state 移除
          console.log(`❌ Event ${eventId} not found in calendar, removing from sync state`);
          delete sportState.events[eventId];
          repairedCount++;
        } else {
          console.error(`Error checking event ${eventId}:`, error.message);
        }
      }
    }

    if (repairedCount > 0) {
      await saveSyncState(syncState);
      console.log(`✅ Repaired ${repairedCount} entries in sync state (Total: ${totalCount})`);
    } else {
      console.log('✅ Sync state is consistent');
    }

    return { repaired: repairedCount, total: totalCount };
  } catch (error) {
    console.error('Error repairing sync state:', error);
    throw error;
  }
}
