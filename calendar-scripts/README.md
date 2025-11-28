# Calendar Scripts 技術說明文件

本文件說明 Sports Calendar Creator 後端服務的架構、實作細節與開發指南。

## 目錄

- [架構設計](#架構設計)
- [資料流程](#資料流程)
- [核心元件](#核心元件)
- [開發指南](#開發指南)
- [環境設定](#環境設定)
- [執行方式](#執行方式)

---

## 架構設計

### 設計原則

本專案採用 **Adapter Pattern** 和 **Service-Oriented Architecture**，將資料獲取、轉換、處理與日曆管理分離為獨立模組：

```
API Index → API Client → Adapter Factory → Sport Adapter → Data Processor → Calendar Service → Google Calendar
                                                                              ↓
                                                                        Calendar Storage
```

### 核心設計模式

1. **Adapter Pattern**: 透過 `adapterFactory.js` 註冊不同運動的適配器，統一處理各 API 的資料格式差異
2. **Factory Pattern**: `getAdapter(sportId)` 根據運動 ID 動態建立對應的適配器實例
3. **Graceful Degradation**: 驗證失敗時返回 mock calendar ID，不中斷服務執行

---

## 資料流程

### 1. API Discovery & Data Fetching

**檔案**: `src/utils/apiClient.js`

```javascript
fetchApiIndex() → 取得 https://the-static-api.vercel.app/api/index.json
                  ↓
fetchTournamentData(sportId) → 從索引中找到對應的 endpoint
                                ↓
                                獲取賽事資料（例如 /api/bwf/tournaments.json）
```

**關鍵實作**:
- 使用環境變數 `API_BASE_URL` 設定 API 基礎 URL（預設: `https://the-static-api.vercel.app`）
- 自動從 API 索引中尋找包含 "tournament" 關鍵字的 endpoint
- 完整的錯誤處理與訊息記錄

### 2. Data Standardization

**檔案**: `src/adapters/bwfAdapter.js`, `src/adapters/adapterFactory.js`

每個運動都需要實作自己的 Adapter，負責將原始 API 資料轉換為標準格式：

```javascript
{
  id: string,              // 唯一識別碼
  name: string,            // 賽事名稱
  location: {
    city: string,
    country: string,
    venue: string
  },
  dateStart: string,       // ISO 8601 格式
  dateEnd: string,         // ISO 8601 格式
  category: string,        // 賽事類別
  level: string,           // 等級（例如 Super 1000）
  prize: string,           // 獎金
  url: string,             // 官方連結
  description: string,     // 詳細描述
  source: string,          // 資料來源（例如 'BWF'）
  lastUpdated: string      // ISO 8601 格式
}
```

**BWF Adapter 支援的資料格式**:
1. 月份分組格式: `{ results: { January: {...}, February: {...} } }`
2. 陣列格式: `{ tournaments: [...] }` 或 `[...]`

**新增 Sport Adapter 步驟**:
1. 在 `src/adapters/` 建立新檔案（例如 `tennisAdapter.js`）
2. 實作 `standardize(data)` 方法，返回標準格式陣列
3. 在 `adapterFactory.js` 中註冊：
   ```javascript
   import { TennisAdapter } from './tennisAdapter.js';

   const adapters = {
     'bwf': BwfAdapter,
     'tennis': TennisAdapter  // 新增
   };
   ```

### 3. Data Processing

**檔案**: `src/utils/dataProcessor.js`

處理標準化後的資料，執行：
- **過濾**: 移除沒有開始/結束日期的賽事
- **排序**: 按開始日期升序排列
- **分組**: 按年月（`YYYY-MM`）分組

**輸出格式**:
```javascript
{
  tournaments: [...],          // 已排序的賽事陣列
  tournamentsByMonth: {        // 按月份分組
    "2025-01": [...],
    "2025-02": [...]
  },
  count: 42,                   // 賽事總數
  processedAt: "2025-11-28T..."
}
```

### 4. Calendar Management

**檔案**: `src/services/calendarService.js`

負責 Google Calendar 的建立、更新與事件管理。

#### 日曆建立流程

```javascript
getOrCreateCalendar(calendar, sportId)
  ↓
  1. 列出所有日曆，尋找名稱相符的現有日曆
  2. 若存在 → 更新權限設定，返回 calendarId
  3. 若不存在 → 建立新日曆
     ↓
     - 設定名稱、描述、時區（UTC）
     - 設定顏色（例如 BWF 為黃色 #5）
     - 設定公開讀取權限（ACL: role=reader, scope=default）
     - 儲存日曆 ID 到 public/data/calendars.json
```

#### 事件建立與去重機制

**關鍵函式**: `createEvents(calendar, calendarId, tournaments, sportId)`

```javascript
for each tournament:
  1. 查詢是否已存在相同名稱且日期範圍重疊的事件
     → calendar.events.list({ q: tournament.name, timeMin, timeMax })

  2. 若不存在 → 建立新事件
     - summary: 賽事名稱
     - location: venue, city, country（逗號分隔）
     - description: 詳細資訊
     - start/end: date 格式（全天事件），時區設為 UTC
     - transparency: 'transparent'（不顯示為忙碌）
     - visibility: 'public'
     - source: 來源連結

  3. 若已存在 → 跳過，記錄 log
```

**重要實作細節**:
- 使用 `date` 欄位而非 `dateTime`，建立全天事件
- `formatDate(dateString, addDay)`: 結束日期需加一天（Google Calendar 全天事件的結束日期為不包含當天）
- 錯誤處理：單個事件失敗不中斷整體流程

#### 日曆權限設定

**函式**: `updateCalendarAccessSettings(calendar, calendarId)`

```javascript
calendar.acl.insert({
  calendarId,
  requestBody: {
    role: "reader",        // 唯讀權限
    scope: {
      type: "default"      // 所有人（公開）
    }
  }
})
```

**權限架構**:
- 服務帳戶（owner）: 完整編輯權限
- 公開使用者（reader）: 僅檢視權限
- 產生訂閱連結:
  - Web: `https://calendar.google.com/calendar/embed?src={calendarId}`
  - iCal: `https://calendar.google.com/calendar/ical/{calendarId}/public/basic.ics`

### 5. Authentication

**檔案**: `src/utils/authenticate.js`

使用 **Google Service Account** 進行無頭環境認證，適用於 CI/CD（GitHub Actions）。

#### 服務帳戶認證流程

```javascript
authorize()
  ↓
  1. 讀取 credentials.json（服務帳戶金鑰）
  2. 建立 GoogleAuth 實例，設定 scopes
  3. 取得認證客戶端（JWT client）
  4. 儲存認證資訊到 token.json
```

**環境變數**:
- `GOOGLE_CALENDAR_CREDENTIALS`: credentials.json 的路徑（預設: `./credentials.json`）
- `GOOGLE_CALENDAR_TOKEN`: token.json 的路徑（預設: `./token.json`）

**設定步驟**:
1. 在 Google Cloud Console 建立專案
2. 啟用 Google Calendar API
3. 建立服務帳戶，下載 JSON 金鑰
4. 將金鑰儲存為 `credentials.json`
5. ⚠️ **重要**: 在 Google Calendar 中，將服務帳戶郵箱（`client_email`）加入日曆的共享設定

### 6. Calendar Storage

**檔案**: `src/utils/calendarStorage.js`

將日曆資訊持久化到 `public/data/calendars.json`，供前端讀取。

**功能**:
- `loadCalendars()`: 讀取並轉換為物件格式
- `saveCalendars(data)`: 轉換為陣列格式並儲存
- `updateCalendarInfo(sportId, calendarId)`: 更新特定運動的日曆 ID
- `getAllCalendars()`: 取得所有日曆並附加訂閱連結

**資料格式**:
```json
[
  {
    "sportId": "bwf",
    "id": "c_1234567890abcdef@group.calendar.google.com",
    "name": "BWF Badminton Tournaments",
    "description": "Badminton World Federation tournament calendar"
  }
]
```

---

## 核心元件

### 主程式入口: `src/index.js`

**執行邏輯**:
```javascript
main(sportIds)
  ↓
  1. 若未指定 sportIds，從 API Index 獲取所有可用運動
  2. for each sportId:
     a. getAdapter(sportId) → 取得適配器
     b. fetchTournamentData(sportId) → 抓取資料
     c. adapter.standardize(data) → 標準化
     d. processData(standardizedData) → 處理
     e. createOrUpdateCalendar(sportId, processedData) → 建立/更新日曆
  3. 錯誤處理：單個運動失敗不影響其他運動
```

**執行方式**:
```bash
# 處理所有運動
node calendar-scripts/src/index.js

# 指定特定運動
node calendar-scripts/src/index.js bwf

# 指定多個運動
node calendar-scripts/src/index.js bwf tennis
```

### 工具腳本: `scripts/removeDuplicateEvents.js`

手動移除日曆中的重複事件。

**去重邏輯**:
- Key: `{summary}-{startDate}-{endDate}`
- 使用 Map 追蹤已見過的事件
- 遇到重複事件時刪除當前事件，保留第一個

**使用方式**:
```bash
node calendar-scripts/scripts/removeDuplicateEvents.js <calendar-id>
```

---

## 開發指南

### 新增運動支援

#### 1. 建立 Adapter

在 `src/adapters/` 建立新檔案，例如 `tennisAdapter.js`:

```javascript
export class TennisAdapter {
  /**
   * 將 Tennis API 資料標準化
   * @param {Object} data - 原始 API 資料
   * @returns {Array} 標準格式的賽事陣列
   */
  standardize(data) {
    // 實作轉換邏輯
    return data.map(tournament => ({
      id: tournament.id,
      name: tournament.name,
      location: {
        city: tournament.city,
        country: tournament.country,
        venue: tournament.venue
      },
      dateStart: new Date(tournament.start).toISOString(),
      dateEnd: new Date(tournament.end).toISOString(),
      category: tournament.category,
      level: tournament.level,
      prize: tournament.prize,
      url: tournament.url,
      description: this._generateDescription(tournament),
      source: 'Tennis',
      lastUpdated: new Date().toISOString()
    }));
  }

  _generateDescription(tournament) {
    // 實作描述生成邏輯
    return `${tournament.name}\n${tournament.category}`;
  }
}
```

#### 2. 註冊 Adapter

編輯 `src/adapters/adapterFactory.js`:

```javascript
import { BwfAdapter } from './bwfAdapter.js';
import { TennisAdapter } from './tennisAdapter.js';

const adapters = {
  'bwf': BwfAdapter,
  'tennis': TennisAdapter  // 新增這行
};
```

#### 3. 設定日曆樣式（可選）

編輯 `src/services/calendarService.js`:

```javascript
const CALENDAR_COLORS = {
  'bwf': '5',     // 黃色
  'tennis': '9',  // 藍色
  'default': '1'
};

// 在 getCalendarName, getCalendarDescription, getSourceName 中加入對應
```

#### 4. 確保 API 端點可用

確認 `https://the-static-api.vercel.app/api/index.json` 包含該運動的 API 資訊：

```json
{
  "apis": [
    {
      "id": "tennis",
      "name": "Tennis",
      "endpoints": [
        {
          "name": "tournaments",
          "url": "/api/tennis/tournaments.json",
          "description": "Tennis tournament data"
        }
      ]
    }
  ]
}
```

### 常見開發任務

#### 測試特定運動的資料抓取

```bash
node -e "
import { fetchTournamentData } from './calendar-scripts/src/utils/apiClient.js';
const data = await fetchTournamentData('bwf');
console.log(JSON.stringify(data, null, 2));
"
```

#### 測試適配器轉換

```javascript
import { getAdapter } from './src/adapters/adapterFactory.js';
import { fetchTournamentData } from './src/utils/apiClient.js';

const data = await fetchTournamentData('bwf');
const adapter = getAdapter('bwf');
const standardized = adapter.standardize(data);
console.log(standardized);
```

#### 本地開發與除錯

使用 nodemon 進行熱重載開發：

```bash
npm run cal:dev
```

這會監控檔案變更並自動重新執行服務。

### 程式碼風格

- 使用 ES Modules (`import/export`)
- JSDoc 註解說明函式參數與返回值
- 完整的錯誤處理與 console.log 記錄
- 單一職責原則：每個函式只做一件事
- 避免深層巢狀，使用 early return

---

## 環境設定

### 必要檔案

#### `.env`
```bash
GOOGLE_CALENDAR_CREDENTIALS=credentials.json
GOOGLE_CALENDAR_TOKEN=token.json
API_BASE_URL=https://the-static-api.vercel.app
```

#### `credentials.json`（服務帳戶金鑰）
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

⚠️ **安全提醒**: `credentials.json` 已加入 `.gitignore`，絕對不要提交到版本控制。

### Google Calendar 設定

1. 在 Google Calendar 中建立新日曆（或使用主要日曆）
2. 點擊日曆設定 → "Share with specific people"
3. 新增服務帳戶郵箱（`client_email`），權限設為 "Make changes to events"
4. 在「Access permissions」中勾選「Make available to public」

---

## 執行方式

### 本地執行

```bash
# 執行一次完整流程
npm run cal:start

# 開發模式（檔案變更時自動重新執行）
npm run cal:dev

# 指定特定運動
node calendar-scripts/src/index.js bwf

# 執行 Lint 檢查
npm run cal:lint

# 移除重複事件
npm run cal:remove-duplicates <calendar-id>
```

### GitHub Actions 執行

專案提供 `.github/workflows/action.yml`，可在 GitHub Actions 中自動執行。

**使用方式**（在其他 repository 中）:

```yaml
name: Update Sports Calendar

on:
  schedule:
    - cron: '0 0 * * *'  # 每天執行
  workflow_dispatch:      # 手動觸發

jobs:
  update-calendar:
    uses: your-username/games-calendar/.github/workflows/action.yml@main
    with:
      sports: 'bwf'  # 可選，不指定則處理所有運動
    secrets:
      GOOGLE_CALENDAR_CREDENTIALS: ${{ secrets.GOOGLE_CALENDAR_CREDENTIALS }}
```

**設定 Secret**:
1. 前往 Repository → Settings → Secrets and variables → Actions
2. 新增 `GOOGLE_CALENDAR_CREDENTIALS`
3. 將 `credentials.json` 的完整內容貼上

---

## 錯誤處理策略

### 1. 驗證失敗

若 Google Calendar 驗證失敗，服務會：
- 記錄警告訊息
- 返回 `mock-calendar-{sportId}`
- 繼續執行（不中斷）

適用於本地開發或測試環境。

### 2. API 抓取失敗

- 記錄錯誤訊息
- 跳過該運動
- 繼續處理其他運動

### 3. 事件建立失敗

- 記錄錯誤訊息（包含賽事名稱）
- 繼續處理下一個事件
- 確保部分失敗不影響整體執行

### 4. 適配器不存在

- 記錄警告訊息
- 跳過該運動
- 繼續處理其他運動

---

## 資料夾結構

```
calendar-scripts/
├── src/
│   ├── index.js                   # 主程式入口
│   ├── adapters/                  # 資料適配器
│   │   ├── adapterFactory.js      # Adapter Factory
│   │   └── bwfAdapter.js          # BWF 適配器
│   ├── services/                  # 核心服務
│   │   └── calendarService.js     # Google Calendar 服務
│   └── utils/                     # 工具函式
│       ├── apiClient.js           # API 客戶端
│       ├── authenticate.js        # Google 認證
│       ├── calendarStorage.js     # 日曆資訊儲存
│       └── dataProcessor.js       # 資料處理
└── scripts/                       # 獨立腳本
    └── removeDuplicateEvents.js   # 移除重複事件
```

---

## 技術棧

- **Runtime**: Node.js 22+
- **語言**: JavaScript (ES Modules)
- **主要依賴**:
  - `googleapis`: Google Calendar API 客戶端
  - `node-fetch`: HTTP 請求
  - `dotenv`: 環境變數管理
- **開發工具**:
  - `nodemon`: 開發模式熱重載
  - `eslint`: 程式碼檢查

---

## 常見問題

### Q: 如何驗證服務帳戶設定是否正確？

執行驗證腳本：
```bash
node calendar-scripts/src/utils/authenticate.js
```

應該會顯示服務帳戶郵箱與認證成功訊息。

### Q: 為什麼事件沒有建立到日曆中？

檢查清單：
1. 服務帳戶是否已加入日曆的共享設定？
2. 權限是否設為「Make changes to events」？
3. `credentials.json` 路徑是否正確？
4. API 回傳的資料是否包含有效的開始/結束日期？

### Q: 如何修改日曆的時區？

編輯 `src/services/calendarService.js` 中的 `getOrCreateCalendar` 函式：
```javascript
timeZone: 'Asia/Taipei'  // 修改為所需時區
```

### Q: 可以同時支援多個 Google 帳戶嗎？

可以。為每個帳戶建立不同的服務帳戶，並使用不同的 `credentials.json` 檔案。透過環境變數切換：
```bash
GOOGLE_CALENDAR_CREDENTIALS=credentials-account1.json node src/index.js
```

---

## 延伸閱讀

- [Google Calendar API 文件](https://developers.google.com/calendar/api/v3/reference)
- [Google Service Account 認證](https://cloud.google.com/iam/docs/service-accounts)
- [Node.js ES Modules](https://nodejs.org/api/esm.html)
