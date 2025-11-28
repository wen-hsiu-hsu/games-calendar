import dotenv from 'dotenv';
import { fetchApiIndex, fetchTournamentData } from './utils/apiClient.js';
import { processData } from './utils/dataProcessor.js';
import { syncWithCalendar } from './services/syncService.js';
import { getAdapter } from './adapters/adapterFactory.js';
import { saveRawTournamentData, loadLocalTournamentData } from './utils/storageManager.js';

// 載入環境變數
dotenv.config();

/**
 * 主程序入口點
 * @param {string[]} sportIds - 要處理的運動 ID 列表 (例如: ['bwf'])
 */
export async function main(sportIds = []) {
  try {
    console.log('Starting calendar creation process...');
    
    // 如果沒有指定運動 ID，則獲取並處理所有可用的運動
    if (sportIds.length === 0) {
      const apiIndex = await fetchApiIndex();
      sportIds = apiIndex.apis.map(api => api.id);
      console.log(`No sport IDs specified, processing all available sports: ${sportIds.join(', ')}`);
    }
    
    // 處理每個運動 ID
    for (const sportId of sportIds) {
      console.log(`Processing ${sportId} tournaments...`);
      
      try {
        // 【階段 1】爬取與儲存
        console.log(`\n=== 階段 1: 爬取與儲存 ===`);
        // 獲取比賽數據 (原始 API 資料)
        const rawTournamentData = await fetchTournamentData(sportId);

        // 儲存原始資料到本地檔案 (按年份分組)
        await saveRawTournamentData(sportId, rawTournamentData);

        // 【階段 2】標準化
        console.log(`\n=== 階段 2: 標準化 ===`);
        // 獲取適配器
        const adapter = getAdapter(sportId);
        if (!adapter) {
          console.warn(`No adapter available for ${sportId}, skipping...`);
          continue;
        }

        // 從本地檔案讀取資料 (包含原始資料 + mapping config)
        const localData = await loadLocalTournamentData(sportId);

        // 使用適配器處理數據 (adapter 會根據 mappingConfig 提取標準欄位)
        const standardizedData = adapter.standardize(localData);

        // 【階段 3】同步到 Google Calendar
        console.log(`\n=== 階段 3: 同步到 Google Calendar ===`);
        // 使用新的同步服務 (整合 sync-state 管理)
        const syncResult = await syncWithCalendar(sportId, standardizedData);
        console.log(`✅ ${sportId} sync completed:`, syncResult);
      } catch (error) {
        console.error(`Error processing ${sportId}: ${error.message}`);
        // 繼續處理其他運動，不中斷整個流程
      }
    }
    
    console.log('Calendar creation process completed successfully!');
    return { success: true };
  } catch (error) {
    console.error('Failed to process tournaments:', error);
    throw error;
  }
}

// 如果直接運行此文件（而非作為模組導入）
if (process.argv[1] === new URL(import.meta.url).pathname) {
  // 從命令行參數獲取運動 ID
  const sportIds = process.argv.slice(2);
  main(sportIds).catch(error => {
    console.error('Application error:', error);
    process.exit(1);
  });
}
