# 開發指南

本文件說明如何開發、測試與部署 Calendar Scripts。

## 目錄

- [環境設定](#環境設定)
- [開發流程](#開發流程)
- [測試](#測試)
- [新增運動支援](#新增運動支援)
- [常見問題](#常見問題)

---

## 環境設定

### 系統需求

- **Node.js**: v22 或更高
- **npm**: v8 或更高
- **作業系統**: macOS, Linux, Windows (WSL)

### 安裝依賴

```bash
# 安裝所有依賴
npm install

# 僅安裝生產環境依賴
npm install --production
```

### 環境變數設定

建立 `.env` 檔案於專案根目錄：

```bash
# Google Calendar API 認證
GOOGLE_CALENDAR_CREDENTIALS=credentials.json
GOOGLE_CALENDAR_TOKEN=token.json

# API 基礎 URL (可選，預設為 https://the-static-api.vercel.app)
API_BASE_URL=https://the-static-api.vercel.app
```

### Google Calendar 認證設定

1. **取得服務帳戶金鑰**
   - 前往 [Google Cloud Console](https://console.cloud.google.com/)
   - 建立新專案或選擇現有專案
   - 啟用 Google Calendar API
   - 建立服務帳戶
   - 下載 JSON 金鑰，命名為 `credentials.json`

2. **設定日曆權限**
   - 開啟 `credentials.json`
   - 複製 `client_email` 的值（例如: `xxx@xxx.iam.gserviceaccount.com`）
   - 在 Google Calendar 中將此郵箱加入共享，權限設為「管理活動的變更」

3. **測試認證**
   ```bash
   node calendar-scripts/src/index.js
   ```

---

## 開發流程

### 專案結構

```
calendar-scripts/
├── src/
│   ├── index.js              # 主入口
│   ├── adapters/             # 資料適配器
│   ├── clients/              # API 客戶端
│   ├── services/             # 服務層
│   └── utils/                # 工具函式
├── docs/                     # 文件
└── scripts/                  # 輔助腳本
```

### 常用指令

```bash
# 執行日曆同步（所有運動）
npm run cal:start

# 執行特定運動
npm run cal:start bwf

# 開發模式（hot reload）
npm run cal:dev

# Lint 程式碼
npm run cal:lint

# 移除重複事件
npm run cal:remove-duplicates <calendar-id>
```

### Git Workflow

```bash
# 1. 建立功能分支
git checkout -b feature/add-tennis-support

# 2. 開發與測試
# ...

# 3. Commit (遵循 Conventional Commits)
git add .
git commit -m "feat(tennis): add tennis adapter and API client"

# 4. Push 並建立 PR
git push origin feature/add-tennis-support
```

---

## 測試

### 單元測試（目前未配置）

專案目前無測試框架，建議未來加入：

```bash
# 建議使用 Jest
npm install --save-dev jest

# 執行測試
npm test
```

### 手動測試

#### 測試 Adapter

```javascript
// test-adapter.js
import { BwfAdapter } from './src/adapters/bwfAdapter.js';
import fs from 'fs';

const adapter = new BwfAdapter();
const rawData = JSON.parse(fs.readFileSync('test-data.json', 'utf-8'));
const standardized = adapter.standardize(rawData);

console.log('Standardized:', JSON.stringify(standardized, null, 2));
```

```bash
node test-adapter.js
```

#### 測試 API Client

```javascript
// test-client.js
import { BwfApiClient } from './src/clients/bwfApiClient.js';

const client = new BwfApiClient();
const data = await client.fetchTournaments(2025);

console.log('Fetched data:', JSON.stringify(data, null, 2));
```

```bash
node test-client.js
```

#### 測試完整流程

```bash
# 測試單一運動
node calendar-scripts/src/index.js bwf

# 檢查日誌輸出
# ✓ 資料獲取成功
# ✓ 資料標準化成功
# ✓ 日曆建立/更新成功
# ✓ 事件建立成功
```

---

## 新增運動支援

### 步驟概覽

```
1. 建立 Adapter
   ↓
2. 註冊到 Factory
   ↓
3. (可選) 建立專用 Client
   ↓
4. 測試
   ↓
5. 建立文件
```

### 詳細步驟

#### 步驟 1: 建立 Adapter

```javascript
// src/adapters/tennisAdapter.js
/**
 * Tennis 網球賽事資料適配器
 * 將 Tennis API 格式轉換為標準化格式
 */
export class TennisAdapter {
  /**
   * 標準化 Tennis 資料
   * @param {Object} data - 原始 API 資料
   * @returns {Array} 標準化的賽事陣列
   */
  standardize(data) {
    console.log('Tennis Adapter processing data...');

    if (!data || !data.events) {
      console.warn('Invalid Tennis data format');
      return [];
    }

    const tournaments = [];

    for (const event of data.events) {
      tournaments.push({
        id: `tennis-${event.id || Date.now()}`,
        name: event.title,
        location: {
          city: event.city || '',
          country: event.country || '',
          venue: event.venue || ''
        },
        dateStart: new Date(event.startDate).toISOString(),
        dateEnd: new Date(event.endDate).toISOString(),
        category: event.category || 'Tennis Tournament',
        level: event.level || '',
        prize: event.prize || '',
        url: event.url || '',
        description: this._generateDescription(event),
        source: 'Tennis',
        lastUpdated: new Date().toISOString()
      });
    }

    console.log(`Standardized ${tournaments.length} tennis tournaments`);
    return tournaments;
  }

  _generateDescription(event) {
    let desc = `${event.title}\n\n`;
    if (event.category) desc += `${event.category}\n`;
    if (event.prize) desc += `Prize: ${event.prize}\n`;
    if (event.venue) desc += `Venue: ${event.venue}\n`;
    if (event.url) desc += `\nMore info: ${event.url}`;
    return desc;
  }
}
```

#### 步驟 2: 註冊到 Factory

```javascript
// src/adapters/adapterFactory.js
import { BwfAdapter } from './bwfAdapter.js';
import { TennisAdapter } from './tennisAdapter.js';  // 新增

const adapters = {
  'bwf': BwfAdapter,
  'tennis': TennisAdapter  // 新增註冊
};

export function getAdapter(sportId) {
  const AdapterClass = adapters[sportId];

  if (!AdapterClass) {
    console.warn(`No adapter found for sport: ${sportId}`);
    return null;
  }

  return new AdapterClass();
}
```

#### 步驟 3: (可選) 建立專用 Client

若該運動需要特殊處理（如 BWF 需要 Puppeteer），建立專用 Client：

```javascript
// src/clients/tennisApiClient.js
export class TennisApiClient {
  constructor() {
    this.apiUrl = 'https://tennis-api.example.com';
  }

  async fetchTournaments(year) {
    const response = await fetch(`${this.apiUrl}/tournaments?year=${year}`);
    return await response.json();
  }
}
```

並更新 `utils/apiClient.js`：

```javascript
// utils/apiClient.js
import { TennisApiClient } from '../clients/tennisApiClient.js';

export async function fetchTournamentData(sportId) {
  // BWF 特殊處理
  if (sportId === 'bwf') {
    const client = new BwfApiClient();
    return await client.fetchTournaments();
  }

  // Tennis 特殊處理
  if (sportId === 'tennis') {
    const client = new TennisApiClient();
    return await client.fetchTournaments();
  }

  // 其他使用靜態 API
  // ...
}
```

#### 步驟 4: 測試

```bash
# 測試新的 adapter
node calendar-scripts/src/index.js tennis

# 檢查輸出
# ✓ Tennis Adapter processing data...
# ✓ Standardized XX tennis tournaments
# ✓ Calendar created/updated
```

#### 步驟 5: 建立文件

```bash
# 建立運動專屬文件
touch calendar-scripts/docs/sports/TENNIS.md
```

**文件內容範本** (`docs/sports/TENNIS.md`):

```markdown
# Tennis 網球整合說明

## 資料來源

- API 端點: `https://tennis-api.example.com/tournaments`
- 資料格式: JSON
- 更新頻率: 每日

## 資料格式

### API 回應結構
\`\`\`json
{
  "events": [
    {
      "id": 123,
      "title": "Wimbledon 2025",
      "startDate": "2025-07-01",
      "endDate": "2025-07-14",
      ...
    }
  ]
}
\`\`\`

## 核心元件

### TennisAdapter
- 檔案: `src/adapters/tennisAdapter.js`
- 職責: 將 Tennis API 格式轉換為標準格式

## 執行與測試

\`\`\`bash
node calendar-scripts/src/index.js tennis
\`\`\`
```

最後更新 `calendar-scripts/README.md` 索引，加入新文件連結。

---

## 常見問題

### Q1: 如何處理 API Rate Limiting?

**A**: 實作 retry 邏輯與等待機制

```javascript
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        // Rate limited, 等待後重試
        await new Promise(r => setTimeout(r, 5000 * (i + 1)));
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
    }
  }
}
```

### Q2: 如何除錯 Adapter?

**A**: 加入詳細的日誌輸出

```javascript
standardize(data) {
  console.log('Raw data keys:', Object.keys(data));
  console.log('Raw data sample:', JSON.stringify(data).substring(0, 200));

  // 處理邏輯...

  console.log('Standardized count:', result.length);
  console.log('Sample output:', JSON.stringify(result[0], null, 2));

  return result;
}
```

### Q3: 如何處理時區問題?

**A**: 統一使用 ISO 8601 格式並保持 UTC 時區

```javascript
// ✓ 正確
dateStart: new Date(tournament.start_date).toISOString()
// "2025-01-07T00:00:00.000Z"

// ✗ 錯誤
dateStart: tournament.start_date
// "2025-01-07 00:00:00" (缺少時區資訊)
```

### Q4: 如何處理大量資料?

**A**: 批次處理與記憶體管理

```javascript
// 分批建立事件
const BATCH_SIZE = 50;
for (let i = 0; i < events.length; i += BATCH_SIZE) {
  const batch = events.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(event => createEvent(event)));
  // 給 API 喘息時間
  await new Promise(r => setTimeout(r, 1000));
}
```

### Q5: credentials.json 遺失怎麼辦?

**A**: 重新下載服務帳戶金鑰

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. IAM & Admin → Service Accounts
3. 找到對應的服務帳戶
4. Keys → Add Key → Create new key → JSON
5. 下載並命名為 `credentials.json`

---

## 程式碼風格

### ESLint 配置

專案使用 ESLint 確保程式碼品質：

```bash
# 檢查程式碼
npm run cal:lint

# 自動修正
npx eslint calendar-scripts/src/**/*.js --fix
```

### 命名規範

- **檔案名稱**: camelCase (例如: `bwfAdapter.js`)
- **Class 名稱**: PascalCase (例如: `BwfAdapter`)
- **函式名稱**: camelCase (例如: `fetchTournaments`)
- **常數**: UPPER_SNAKE_CASE (例如: `API_BASE_URL`)

### 註解規範

使用 JSDoc 格式：

```javascript
/**
 * 標準化賽事資料
 * @param {Object} data - 原始 API 資料
 * @returns {Array} 標準化的賽事陣列
 */
standardize(data) {
  // 實作...
}
```

---

## 部署

### GitHub Actions

專案使用 GitHub Actions 自動執行：

```yaml
# .github/workflows/action.yml
name: Sports Calendar Creator
on:
  workflow_call:
    inputs:
      sports:
        required: false
        type: string
```

**觸發方式**:

```yaml
# 在其他 repo 中呼叫
uses: your-repo/games-calendar/.github/workflows/action.yml@main
with:
  sports: 'bwf,tennis'
secrets:
  GOOGLE_CALENDAR_CREDENTIALS: ${{ secrets.GOOGLE_CALENDAR_CREDENTIALS }}
```

### 本地排程

使用 cron 定期執行：

```bash
# 編輯 crontab
crontab -e

# 每天凌晨 2 點執行
0 2 * * * cd /path/to/games-calendar && node calendar-scripts/src/index.js
```

---

## 參考資源

- [架構說明](./ARCHITECTURE.md)
- [BWF 整合說明](./sports/BWF.md)
- [Google Calendar API 文件](https://developers.google.com/calendar)
- [Puppeteer 文件](https://pptr.dev/)
