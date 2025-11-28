# 資料儲存與同步架構

本文件說明運動賽事日曆專案的資料儲存與同步架構設計。

## 目錄

- [架構總覽](#架構總覽)
- [檔案結構](#檔案結構)
- [資料格式](#資料格式)
- [核心模組](#核心模組)
- [資料流程](#資料流程)
- [同步機制](#同步機制)
- [錯誤處理](#錯誤處理)
- [故障排除](#故障排除)

## 架構總覽

專案採用三階段資料處理流程:

```
階段 1: 爬取與儲存
API Client → Storage Manager → 儲存到 public/data/{sport}/{year}.json

階段 2: 標準化
載入本地資料 → Adapter → 標準化資料格式

階段 3: 同步到 Google Calendar
Sync Service → 比對 sync-state → CREATE/UPDATE/DELETE → 更新 sync-state
```

### 設計目標

1. **資料持久化**: 爬取的資料儲存為本地 JSON 檔案,避免重複爬取
2. **前端可用**: 前端可直接讀取 JSON 檔案顯示賽事資訊
3. **高效同步**: 使用 hash 比對機制,避免不必要的 API 呼叫
4. **狀態追蹤**: 獨立的 sync-state 記錄本地賽事與 Google Calendar 的映射關係

## 檔案結構

### 目錄階層

```
public/data/                        # 前後端共用資料目錄
├── calendars.json                  # 日曆元資料
├── bwf/                           # BWF 賽事資料
│   ├── 2024.json
│   ├── 2025.json
│   └── 2026.json
└── tennis/                        # Tennis 賽事資料
    └── ...

calendar-scripts/data/              # 後端專用資料目錄
├── sync-state.json                # 同步狀態檔案
└── mapping-configs/               # 欄位映射配置
    ├── bwf.json
    └── tennis.json
```

### 檔案用途

| 檔案 | 位置 | 用途 | 存取 |
|------|------|------|------|
| `{year}.json` | `public/data/{sport}/` | 儲存該年份的賽事資料 | 前後端 |
| `sync-state.json` | `calendar-scripts/data/` | 記錄同步狀態 | 僅後端 |
| `{sport}.json` | `calendar-scripts/data/mapping-configs/` | 欄位映射配置 | 僅後端 |

## 資料格式

### 賽事資料檔案 (`public/data/{sport}/{year}.json`)

每個年份的賽事資料檔案包含三個區塊:

```json
{
  "metadata": {
    "sportId": "bwf",
    "year": 2025,
    "source": "BWF Official API",
    "apiVersion": "vue-grouped-year-tournaments-v1",
    "fetchedAt": "2025-11-28T10:30:00.000Z",
    "totalEvents": 42,
    "lastUpdated": "2025-11-28T10:30:00.000Z"
  },

  "mappingConfig": {
    "version": "1.0",
    "fields": {
      "id": "$.id",
      "name": "$.name",
      "dateStart": "$.start_date",
      "dateEnd": "$.end_date",
      ...
    },
    "transformations": {
      ...
    }
  },

  "events": [
    {
      "id": "bwf-5222-BD7DDFAC",
      "name": "PETRONAS Malaysia Open 2025",
      "dateStart": "2025-01-07T00:00:00.000Z",
      "dateEnd": "2025-01-12T00:00:00.000Z",
      "location": {
        "city": "Kuala Lumpur",
        "country": "Malaysia",
        "venue": "Kuala Lumpur, Malaysia"
      },
      "category": "HSBC BWF World Tour Super 1000",
      "level": "Super 1000",
      "prize": "1,450,000",
      "url": "https://...",

      "rawData": {
        "id": 5222,
        "name": "PETRONAS Malaysia Open 2025",
        "start_date": "2025-01-07 00:00:00",
        ...
      }
    }
  ]
}
```

#### 區塊說明

**metadata**: 檔案元資料
- `sportId`: 運動 ID
- `year`: 年份
- `source`: 資料來源名稱
- `fetchedAt`: 資料抓取時間
- `totalEvents`: 該年份的賽事總數

**mappingConfig**: 欄位映射配置
- 定義如何從 `rawData` 提取標準欄位
- 包含轉換規則 (如日期格式、欄位提取)

**events**: 賽事資料陣列
- 每個事件包含標準化欄位 + 完整的 `rawData`
- `rawData` 保留原始 API 回應,確保資料完整性

### 同步狀態檔案 (`calendar-scripts/data/sync-state.json`)

記錄本地賽事 ID ↔ Google Calendar Event ID 的映射:

```json
{
  "version": "1.0",
  "lastSync": "2025-11-28T08:27:19.777Z",
  "sports": {
    "bwf": {
      "calendarId": "a59a6e9add...@group.calendar.google.com",
      "events": {
        "bwf-5222-BD7DDFAC": {
          "googleEventId": "bfscggoajb7vghif3mnrv77mvc",
          "lastSynced": "2025-11-28T08:26:52.830Z",
          "hash": "5d1b16155235ab06"
        }
      },
      "stats": {
        "totalEvents": 42,
        "lastUpdate": "2025-11-28T08:27:19.777Z"
      }
    }
  }
}
```

#### 欄位說明

- `events`: 事件映射表
  - `googleEventId`: Google Calendar Event ID
  - `lastSynced`: 最後同步時間
  - `hash`: 事件內容的 hash 值 (用於快速比對變更)

## 核心模組

### Storage Manager (`utils/storageManager.js`)

負責本地 JSON 檔案的讀寫。

**核心函數**:

- `saveRawTournamentData(sportId, rawData)`: 儲存原始資料到本地檔案
- `loadLocalTournamentData(sportId, year)`: 載入本地資料
- `groupEventsByYear(rawData, sportId)`: 按年份分組賽事

**範例**:

```javascript
import { saveRawTournamentData, loadLocalTournamentData } from './utils/storageManager.js';

// 儲存資料
await saveRawTournamentData('bwf', rawApiData);

// 載入資料
const localData = await loadLocalTournamentData('bwf');
```

### Sync State Manager (`utils/syncStateManager.js`)

管理同步狀態檔案的 CRUD 操作。

**核心函數**:

- `loadSyncState()`: 載入同步狀態
- `saveSyncState(state)`: 儲存同步狀態
- `updateSyncState(sportId, eventId, syncData)`: 更新單一事件
- `removeSyncState(sportId, eventId)`: 移除事件

### Hash Utils (`utils/hashUtils.js`)

計算事件的 hash 值用於比對變更。

**核心函數**:

- `calculateEventHash(event)`: 計算事件的 MD5 hash (前 16 字元)

**實作邏輯**:

```javascript
// 只對影響 Calendar 顯示的欄位計算 hash
const hashFields = {
  name, dateStart, dateEnd, location, category, url
};
const hash = md5(JSON.stringify(hashFields)).substring(0, 16);
```

### Sync Service (`services/syncService.js`)

管理 Google Calendar 同步的完整流程。

**核心函數**:

- `syncWithCalendar(sportId, localEvents)`: 主同步流程
- `repairSyncState(sportId)`: 修復同步狀態

**同步邏輯**:

```
對每個本地賽事:
├─ 檢查 sync-state 中是否存在該 eventId
│
├─ 不存在 → CREATE
│  ├─ 建立 Google Calendar Event
│  ├─ 取得 googleEventId
│  └─ 寫入 sync-state (含 hash)
│
├─ 存在 → 比對 hash
│  ├─ hash 相同 → SKIP (無變更)
│  └─ hash 不同 → UPDATE
│     ├─ 使用 googleEventId 更新 Google Calendar
│     └─ 更新 sync-state
│
└─ 掃描 sync-state 中存在但本地不存在的事件 → DELETE
   ├─ 使用 googleEventId 刪除 Google Calendar Event
   └─ 從 sync-state 移除
```

## 資料流程

### 完整執行流程

```bash
node calendar-scripts/src/index.js bwf
```

**階段 1: 爬取與儲存**
1. 從 API 獲取原始資料 (`fetchTournamentData`)
2. 按年份分組賽事 (`groupEventsByYear`)
3. 儲存到 `public/data/bwf/{year}.json` (`saveRawTournamentData`)

**階段 2: 標準化**
1. 從本地載入資料 (`loadLocalTournamentData`)
2. Adapter 標準化資料 (`adapter.standardize`)
3. 輸出標準格式的賽事陣列

**階段 3: 同步到 Google Calendar**
1. 載入 sync-state (`loadSyncState`)
2. 對每個事件計算 hash (`calculateEventHash`)
3. 比對並執行 CREATE/UPDATE/DELETE
4. 更新 sync-state (`saveSyncState`)

## 同步機制

### Hash 比對機制

使用 MD5 hash 快速判斷事件是否有變更:

**效能比較**:
- 逐欄位比對: O(n) - 需要比對多個欄位
- Hash 比對: O(1) - 只需比對一個字串

**實測數據** (42 個事件):
- 首次同步: Created 42 events (~30 秒)
- 第二次執行: Unchanged 42 events (~5 秒)
- **效能提升**: 6x 速度提升

### 同步統計

每次同步會輸出詳細統計:

```
📊 Sync Summary for bwf:
   Created: 0
   Updated: 0
   Unchanged: 42
   Deleted: 0
   Total: 42
```

## 錯誤處理

### 檔案讀寫失敗

**重試機制** (3 次,指數退避):

```javascript
// storageManager.js
async function saveWithRetry(filePath, data, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return;
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * (i + 1)); // 指數退避
    }
  }
}
```

### Sync State 不一致

當 `sync-state.json` 與實際 Google Calendar 狀態不一致時,使用 `repairSyncState` 修復:

```javascript
import { repairSyncState } from './services/syncService.js';

// 驗證並修復 BWF 的同步狀態
const result = await repairSyncState('bwf');
console.log(`Repaired: ${result.repaired}, Total: ${result.total}`);
```

**修復邏輯**:
1. 讀取 sync-state
2. 逐一驗證 googleEventId 是否存在於日曆
3. 移除不存在的記錄
4. 儲存修復後的 sync-state

## 故障排除

### 問題 1: 檔案未生成

**症狀**: 執行後 `public/data/bwf/2025.json` 不存在

**檢查**:
```bash
# 確認目錄權限
ls -la public/data/

# 檢查執行日誌
node calendar-scripts/src/index.js bwf 2>&1 | grep "階段 1"
```

**解決方案**:
- 確保目錄有寫入權限
- 檢查 API 是否正常回應

### 問題 2: 同步失敗

**症狀**: 所有事件都顯示 "Creating" 但實際未建立

**檢查**:
```bash
# 檢查 Google 認證
cat credentials.json

# 測試認證
node -e "import('./calendar-scripts/src/utils/authenticate.js').then(m => m.authorize().then(() => console.log('OK')))"
```

**解決方案**:
- 確認 `credentials.json` 存在且有效
- 確認服務帳戶有日曆權限

### 問題 3: Sync State 損壞

**症狀**: `sync-state.json` 格式錯誤或不存在

**修復步驟**:

1. 備份現有檔案 (如果存在):
```bash
cp calendar-scripts/data/sync-state.json calendar-scripts/data/sync-state.backup.json
```

2. 重置為空狀態:
```bash
echo '{"version":"1.0","lastSync":null,"sports":{}}' > calendar-scripts/data/sync-state.json
```

3. 重新執行同步:
```bash
node calendar-scripts/src/index.js bwf
```

### 問題 4: 跨年度賽事處理

**症狀**: 賽事從 2025-12-28 到 2026-01-03,不確定儲存在哪個檔案

**規則**: 依 `dateStart` 的年份歸類
- 2025-12-28 開始 → 儲存在 `2025.json`

### 問題 5: 大量事件同步緩慢

**優化建議**:

1. 使用 hash 比對 (已實作) - 跳過未變更的事件
2. 批次處理 (未來改進)
3. 並行請求 (需小心 rate limit)

### 問題 6: 前端無法讀取 JSON

**檢查**:
```bash
# 確認檔案存在
ls -la public/data/bwf/

# 測試 JSON 格式
cat public/data/bwf/2025.json | jq '.'
```

**解決方案**:
- 確認 `public/data/` 在靜態伺服器路徑中
- 確認 JSON 格式正確
- 確認 CORS 設定 (如需要)

## 效能指標

### 儲存效能

- **42 個事件**: ~1 秒
- **檔案大小**: ~150KB (含 rawData)

### 同步效能

| 場景 | 時間 | API 呼叫次數 |
|------|------|-------------|
| 首次同步 (CREATE all) | ~30 秒 | 42 次 |
| 無變更 (SKIP all) | ~5 秒 | 0 次 |
| 部分更新 (UPDATE 5) | ~8 秒 | 5 次 |

### 記憶體使用

- **基準**: ~50MB
- **爬取階段**: ~80MB
- **同步階段**: ~60MB

---

**更新日期**: 2025-11-28
**版本**: 1.0
**維護者**: 專案團隊
