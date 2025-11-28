import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DATA_DIR = path.join(__dirname, '../../../public/data');
const MAPPING_CONFIGS_DIR = path.join(__dirname, '../../data/mapping-configs');

/**
 * 儲存原始賽事資料到本地檔案
 * @param {string} sportId - 運動 ID
 * @param {Object} rawData - 原始 API 資料
 */
export async function saveRawTournamentData(sportId, rawData) {
  try {
    console.log(`Saving raw tournament data for ${sportId}...`);

    // 確保目錄存在
    const sportDir = path.join(PUBLIC_DATA_DIR, sportId);
    await fs.mkdir(sportDir, { recursive: true });

    // 從原始資料中提取年份並分組
    const eventsByYear = await groupEventsByYear(rawData, sportId);

    // 載入映射配置
    const mappingConfig = await loadMappingConfig(sportId);

    // 為每個年份儲存一個檔案
    for (const [year, events] of Object.entries(eventsByYear)) {
      const filePath = path.join(sportDir, `${year}.json`);

      // 建立資料檔案結構
      const dataFile = {
        metadata: {
          sportId,
          year: parseInt(year),
          source: getSourceName(sportId),
          apiVersion: getApiVersion(sportId),
          fetchedAt: new Date().toISOString(),
          totalEvents: events.length,
          lastUpdated: new Date().toISOString()
        },
        mappingConfig,
        events: events.map(event => ({
          // 基本欄位 (從 rawData 提取)
          id: extractId(event, sportId),
          name: event.name || 'Unnamed Tournament',
          dateStart: event.start_date ? parseDate(event.start_date) : null,
          dateEnd: event.end_date ? parseDate(event.end_date) : null,
          location: {
            city: extractCity(event.location || ''),
            country: event.country || '',
            venue: event.location || ''
          },
          category: event.category || '',
          level: extractLevel(event.category || ''),
          prize: event.prize_money || '',
          url: event.url || '',

          // 保留完整原始資料
          rawData: event
        }))
      };

      await saveWithRetry(filePath, dataFile);
      console.log(`✅ Saved ${events.length} events to ${filePath}`);
    }

    console.log(`Successfully saved tournament data for ${sportId}`);
  } catch (error) {
    console.error(`Error saving tournament data for ${sportId}:`, error);
    throw error;
  }
}

/**
 * 從原始資料中按年份分組賽事
 * @param {Object} rawData - 原始 API 資料
 * @param {string} sportId - 運動 ID
 * @returns {Object} 按年份分組的賽事 { '2025': [...], '2026': [...] }
 */
async function groupEventsByYear(rawData, sportId) {
  const eventsByYear = {};

  // 根據不同運動的 API 格式提取賽事
  let allEvents = [];

  if (sportId === 'bwf') {
    // BWF 格式: { results: [{month, tournaments: [...]}] }
    if (rawData.results && Array.isArray(rawData.results)) {
      for (const monthData of rawData.results) {
        if (monthData.tournaments && Array.isArray(monthData.tournaments)) {
          allEvents.push(...monthData.tournaments);
        }
      }
    }
  } else {
    // 其他運動格式 (可擴展)
    // 假設是直接的賽事陣列
    if (Array.isArray(rawData)) {
      allEvents = rawData;
    } else if (rawData.tournaments && Array.isArray(rawData.tournaments)) {
      allEvents = rawData.tournaments;
    }
  }

  // 按年份分組
  for (const event of allEvents) {
    // 從 start_date 提取年份
    const startDate = event.start_date || event.dateStart;
    if (!startDate) {
      console.warn(`Event missing start_date, skipping:`, event.name || event);
      continue;
    }

    const year = new Date(startDate).getFullYear();
    if (!eventsByYear[year]) {
      eventsByYear[year] = [];
    }

    eventsByYear[year].push(event);
  }

  return eventsByYear;
}

/**
 * 載入本地賽事資料
 * @param {string} sportId - 運動 ID
 * @param {number} year - 年份 (可選,預設載入所有年份)
 * @returns {Promise<Array>} 賽事資料陣列
 */
export async function loadLocalTournamentData(sportId, year = null) {
  try {
    const sportDir = path.join(PUBLIC_DATA_DIR, sportId);

    // 如果指定年份,只載入該年份
    if (year) {
      const filePath = path.join(sportDir, `${year}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const jsonData = JSON.parse(data);
      return jsonData.events || [];
    }

    // 否則載入所有年份
    const files = await fs.readdir(sportDir);
    const yearFiles = files.filter(f => f.endsWith('.json') && /^\d{4}\.json$/.test(f));

    const allData = [];
    for (const file of yearFiles) {
      const filePath = path.join(sportDir, file);
      const data = await fs.readFile(filePath, 'utf-8');
      const jsonData = JSON.parse(data);
      if (jsonData.events && Array.isArray(jsonData.events)) {
        allData.push(...jsonData.events);
      }
    }

    console.log(`Loaded ${allData.length} events from local storage for ${sportId}`);
    return allData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`No local tournament data found for ${sportId}`);
      return [];
    }
    console.error(`Error loading tournament data for ${sportId}:`, error);
    throw error;
  }
}

/**
 * 載入欄位映射配置
 * @param {string} sportId - 運動 ID
 * @returns {Promise<Object>} 映射配置
 */
async function loadMappingConfig(sportId) {
  try {
    const configPath = path.join(MAPPING_CONFIGS_DIR, `${sportId}.json`);
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.warn(`No mapping config found for ${sportId}, using default`);
    return getDefaultMappingConfig();
  }
}

/**
 * 取得預設映射配置
 */
function getDefaultMappingConfig() {
  return {
    version: '1.0',
    fields: {
      id: '$.id',
      name: '$.name',
      dateStart: '$.start_date',
      dateEnd: '$.end_date',
      location: {
        city: '$.city',
        country: '$.country',
        venue: '$.venue'
      },
      category: '$.category',
      url: '$.url'
    }
  };
}

/**
 * 取得來源名稱
 */
function getSourceName(sportId) {
  const sources = {
    'bwf': 'BWF Official API',
    'tennis': 'Tennis API'
  };
  return sources[sportId] || `${sportId.toUpperCase()} API`;
}

/**
 * 取得 API 版本
 */
function getApiVersion(sportId) {
  const versions = {
    'bwf': 'vue-grouped-year-tournaments-v1'
  };
  return versions[sportId] || 'v1';
}

/**
 * 從賽事資料提取 ID
 */
function extractId(event, sportId) {
  if (sportId === 'bwf') {
    return `bwf-${event.id || Date.now()}-${(event.code || '').substring(0, 8) || Math.random().toString(36).substr(2, 5)}`;
  }
  return `${sportId}-${event.id || Date.now()}`;
}

/**
 * 從位置字串提取城市
 */
function extractCity(locationString) {
  if (!locationString) return '';
  // 提取逗號前的部分作為城市
  const match = locationString.match(/^([^,]+)/);
  return match ? match[1].trim() : locationString;
}

/**
 * 從類別字串提取等級
 */
function extractLevel(categoryString) {
  if (!categoryString) return '';
  // 提取 "Super 1000", "World Championships" 等
  const match = categoryString.match(/(Super \d+|World Championships|Grand Prix)/i);
  return match ? match[1] : '';
}

/**
 * 解析日期為 ISO 8601 格式 (UTC)
 */
function parseDate(dateString) {
  if (!dateString) return null;

  try {
    // 處理 "YYYY-MM-DD HH:mm:ss" 格式 (BWF 使用)
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
      const date = new Date(dateString.replace(' ', 'T') + 'Z'); // 假設為 UTC
      return date.toISOString();
    }

    // 處理標準 ISO 格式
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date string: ${dateString}`);
      return null;
    }

    return date.toISOString();
  } catch (error) {
    console.error(`Error parsing date: ${dateString}`, error);
    return null;
  }
}

/**
 * 帶重試機制的檔案寫入
 * @param {string} filePath - 檔案路徑
 * @param {Object} data - 要寫入的資料
 * @param {number} retries - 重試次數
 */
async function saveWithRetry(filePath, data, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Write failed (attempt ${i + 1}/${retries}), retrying...`);
      await sleep(1000 * (i + 1)); // 指數退避
    }
  }
}

/**
 * 延遲函數
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
