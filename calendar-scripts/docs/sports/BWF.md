# BWF (羽毛球世界聯合會) 整合說明

本文件說明 BWF 羽球賽事的資料來源、技術實作與特殊處理方式。

## 目錄

- [資料來源](#資料來源)
- [技術挑戰](#技術挑戰)
- [實作方式](#實作方式)
- [資料格式](#資料格式)
- [核心元件](#核心元件)
- [執行與測試](#執行與測試)
- [故障排除](#故障排除)

---

## 資料來源

### 官方 API

- **API 端點**: `POST https://extranet-lv.bwfbadminton.com/api/vue-grouped-year-tournaments`
- **來源網站**: https://bwfbadminton.com/calendar/
- **資料格式**: JSON (按月份分組的賽事陣列)
- **更新頻率**: 即時更新

### 請求參數

```json
{
  "year": 2025,
  "category": [20, 21, 22, 23, 24, 25, 26, 27]
}
```

**Category 對應**:
- 20-27: 不同等級的 BWF World Tour 賽事（Super 1000, Super 750, Super 500 等）

---

## 技術挑戰

### 1. Cloudflare 保護

BWF API 受到 Cloudflare 保護，直接的 HTTP 請求會被攔截（403 Forbidden）：

```
❌ 無法使用: fetch(), axios, curl
✅ 必須使用: Puppeteer 模擬真實瀏覽器
```

### 2. Bearer Token 認證

API 需要 Bearer Token，但 Token 無法單獨使用：

- Token 由前端動態生成
- 必須搭配完整的瀏覽器環境（cookies, TLS fingerprint）
- 無法預先取得或重複使用

### 3. CI/CD 環境限制

必須在 GitHub Actions 無頭環境中執行：

- 需要安裝 Chromium 系統依賴
- 必須使用無沙盒模式
- 需要特殊的記憶體管理設定

---

## 實作方式

### 技術方案：Puppeteer 攔截

使用 **Puppeteer 無頭瀏覽器**模擬真實瀏覽器訪問官網，並攔截 API 請求：

```
啟動 Puppeteer → 訪問官網 → 攔截 API 回應 → 解析資料 → 返回標準格式
```

### 執行流程

```javascript
1. 啟動 Puppeteer 無頭瀏覽器
   ├─ 配置：--no-sandbox, --disable-dev-shm-usage
   ├─ 設定 User-Agent 模擬真實瀏覽器
   └─ 設定 Viewport (1920x1080)

2. 訪問 BWF 日曆頁面
   └─ URL: https://bwfbadminton.com/calendar/

3. 攔截 API 回應
   ├─ 監聽所有網路請求
   ├─ 過濾: url.includes('vue-grouped-year-tournaments')
   └─ 解析 JSON 回應

4. 關閉瀏覽器並返回資料
```

---

## 資料格式

### API 回應結構

```json
{
  "results": [
    {
      "month": "January",
      "monthNo": 1,
      "tournaments": [
        {
          "id": 5222,
          "code": "BD7DDFAC-145A-4865-B58A-C00977D5A3C3",
          "name": "PETRONAS Malaysia Open 2025",
          "start_date": "2025-01-07 00:00:00",
          "end_date": "2025-01-12 00:00:00",
          "location": "Kuala Lumpur, Malaysia",
          "country": "Malaysia",
          "prize_money": "1,450,000",
          "category": "HSBC BWF World Tour Super 1000",
          "url": "https://bwfworldtour.bwfbadminton.com/tournament/5222/...",
          "has_live_scores": true,
          "flag_url": "...",
          "logo": "...",
          "live_status": "post"
        }
      ]
    }
  ],
  "remaining": [...],
  "completed": [...]
}
```

### 標準化轉換

BWF Adapter 會將上述格式轉換為專案標準格式：

```javascript
{
  id: "bwf-5222-BD7DDFAC-145A-4865-B58A-C00977D5A3C3",
  name: "PETRONAS Malaysia Open 2025",
  location: {
    city: "Kuala Lumpur",
    country: "Malaysia",
    venue: "Kuala Lumpur, Malaysia"
  },
  dateStart: "2025-01-07T00:00:00.000Z",
  dateEnd: "2025-01-12T00:00:00.000Z",
  category: "HSBC BWF World Tour Super 1000",
  level: "Super 1000",
  prize: "1,450,000",
  url: "https://bwfworldtour.bwfbadminton.com/...",
  description: "...",
  source: "BWF",
  lastUpdated: "2025-01-28T04:10:35.430Z"
}
```

---

## 核心元件

### 1. BwfApiClient (`src/clients/bwfApiClient.js`)

**職責**: 使用 Puppeteer 從 BWF 官方 API 取得賽事資料

**主要方法**:

#### `fetchTournaments(year)`

取得指定年份的所有賽事資料。

**參數**:
- `year` (number, optional): 年份，預設為當前年份

**返回值**:
```javascript
Promise<Object>  // BWF API 原始回應
```

**範例**:
```javascript
const client = new BwfApiClient();
const data = await client.fetchTournaments(2025);
// data.results 包含 12 個月份的賽事
```

**Puppeteer 配置**:
```javascript
{
  headless: true,
  args: [
    '--no-sandbox',              // CI/CD 必需
    '--disable-setuid-sandbox',  // CI/CD 必需
    '--disable-dev-shm-usage',   // 避免記憶體問題
    '--disable-accelerated-2d-canvas',
    '--disable-gpu'
  ]
}
```

**等待策略**:
```javascript
// 使用 waitForResponse 確保攔截成功
await page.waitForResponse(
  response => response.url().includes('vue-grouped-year-tournaments')
              && response.status() === 200,
  { timeout: 60000 }
)
```

#### `fetchMonthTournaments(year, month)`

取得指定年份和月份的賽事。

**參數**:
- `year` (number): 年份
- `month` (number): 月份 (1-12)

**返回值**:
```javascript
Promise<Array>  // 該月份的賽事陣列
```

---

### 2. BwfAdapter (`src/adapters/bwfAdapter.js`)

**職責**: 將 BWF API 資料標準化為專案統一格式

**主要方法**:

#### `standardize(data)`

將 BWF 官方 API 格式轉換為標準格式。

**支援的輸入格式**:
1. **官方 API 格式** (主要): `{ results: [{month, tournaments}] }`
2. 月份物件格式 (向後兼容): `{ results: {January: {...}} }`
3. 純陣列格式 (向後兼容): `[...]` 或 `{ tournaments: [...] }`

**處理邏輯**:

```javascript
// 1. 格式偵測
if (data.results && Array.isArray(data.results)) {
  // 官方 API 格式
  return _processOfficialApiFormat(data.results);
}

// 2. 遍歷每個月份
for (const monthData of results) {
  for (const tournament of monthData.tournaments) {
    // 3. 標準化每筆賽事
    standardizedTournaments.push({
      id: `bwf-${tournament.id}-${tournament.code}`,
      name: tournament.name,
      location: {
        city: _extractCity(tournament.location),
        country: tournament.country,
        venue: tournament.location
      },
      dateStart: new Date(tournament.start_date).toISOString(),
      dateEnd: new Date(tournament.end_date).toISOString(),
      category: tournament.category,
      level: _extractLevel(tournament.category),
      prize: tournament.prize_money,
      url: tournament.url,
      description: _generateOfficialDescription(tournament),
      source: 'BWF',
      lastUpdated: new Date().toISOString()
    });
  }
}
```

**私有方法**:

- `_processOfficialApiFormat(results)`: 處理官方 API 陣列格式
- `_extractCity(location)`: 從 "城市, 國家" 提取城市名稱
- `_extractLevel(category)`: 從分類中提取賽事等級（如 "Super 1000"）
- `_generateOfficialDescription(tournament)`: 生成完整的賽事描述

**Level 提取邏輯**:
```javascript
"HSBC BWF World Tour Super 1000" → "Super 1000"
"World Championships 2025"        → "World Championships"
```

---

## 執行與測試

### 本地開發

```bash
# 1. 確保已安裝依賴
npm install

# 2. 執行 BWF 同步
node calendar-scripts/src/index.js bwf

# 3. 查看日誌
# ✅ 成功攔截 BWF API 回應
#    收到 12 個月份，共 XX 筆賽事
# BWF Adapter received data structure: results, remaining, completed
# Processing BWF official API format with 12 months
# Standardized XX tournaments from official API format
```

### GitHub Actions

```yaml
- name: Sync BWF Calendar
  run: node calendar-scripts/src/index.js bwf
  env:
    GOOGLE_CALENDAR_CREDENTIALS: credentials.json
```

**系統需求** (已在 workflow 中配置):
```yaml
- Node.js v22+
- Puppeteer 系統依賴:
  - libnss3
  - libatk1.0-0
  - libatk-bridge2.0-0
  - libcups2
  - libdrm2
  - libxkbcommon0
  - libxcomposite1
  - libxdamage1
  - libxfixes3
  - libxrandr2
  - libgbm1
  - libasound2
```

---

## 故障排除

### 問題 1: Puppeteer 無法啟動

**錯誤訊息**:
```
Error: Failed to launch the browser process
```

**解決方案**:
```bash
# Ubuntu/Debian
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libgbm1

# macOS (通常不需要額外安裝)
# Puppeteer 會自動下載 Chromium
```

---

### 問題 2: 攔截超時

**錯誤訊息**:
```
等待 API 回應逾時（60 秒）
```

**可能原因**:
1. 網路連線問題
2. BWF 網站維護中
3. API 端點變更

**除錯步驟**:
```javascript
// 1. 啟用 headless: false 查看瀏覽器行為
const browser = await puppeteer.launch({
  headless: false,  // 開啟視窗觀察
  // ...
});

// 2. 查看所有網路請求
page.on('request', req => console.log('→', req.url()));
page.on('response', res => console.log('←', res.status(), res.url()));

// 3. 延長等待時間
await page.waitForResponse(
  // ...
  { timeout: 120000 }  // 延長至 2 分鐘
);
```

---

### 問題 3: API 格式變更

**錯誤訊息**:
```
Unrecognized BWF data format: xxx
```

**解決方案**:
1. 檢查實際回應格式
2. 更新 `BwfAdapter.standardize()` 方法
3. 新增格式處理邏輯

**範例**:
```javascript
// 在 bwfAdapter.js 中新增格式支援
if (data.newFormat) {
  console.log('Processing BWF new format');
  return this._processNewFormat(data.newFormat);
}
```

---

### 問題 4: CI/CD 環境執行失敗

**錯誤訊息**:
```
Running as root without --no-sandbox is not supported
```

**解決方案**:

已在 `BwfApiClient` 中配置 `--no-sandbox`，確認 workflow 正確：

```yaml
- name: Install system dependencies for Puppeteer
  run: |
    sudo apt-get update
    sudo apt-get install -y libnss3 libatk1.0-0 ...

- name: Install dependencies
  run: npm ci
  env:
    PUPPETEER_SKIP_DOWNLOAD: false  # 確保下載 Chromium
```

---

## 效能考量

### 執行時間

- **本地執行**: 約 30-45 秒
  - Puppeteer 啟動: ~10 秒
  - 頁面載入 + API 攔截: ~15-20 秒
  - 資料處理 + Google Calendar 同步: ~10-15 秒

- **GitHub Actions**: 約 45-60 秒
  - 首次執行需下載 Chromium: +20 秒

### 最佳化建議

1. **快取 Puppeteer**:
   ```yaml
   - uses: actions/cache@v4
     with:
       path: ~/.cache/puppeteer
       key: ${{ runner.os }}-puppeteer
   ```

2. **只在必要時執行**:
   ```yaml
   on:
     schedule:
       - cron: '0 0 * * *'  # 每天執行一次即可
   ```

3. **並行處理其他運動**:
   ```bash
   # BWF 執行時間較長，可分開執行
   node calendar-scripts/src/index.js tennis &
   node calendar-scripts/src/index.js bwf &
   wait
   ```

---

## 維護注意事項

### API 監控

定期檢查以下項目：

1. **API 端點是否變更**
   - 監控: `https://extranet-lv.bwfbadminton.com/api/vue-grouped-year-tournaments`
   - 頻率: 每月檢查一次

2. **資料格式是否變更**
   - 查看 adapter 錯誤日誌
   - 比對新舊資料結構

3. **網站改版**
   - BWF 官網改版可能影響 API 位置
   - 更新 `this.pageUrl` 如有必要

### 相依套件更新

```bash
# 定期更新 Puppeteer
npm update puppeteer

# 檢查是否有重大變更
npx npm-check-updates -u puppeteer
```

---

## 參考資源

- [BWF 官方網站](https://bwfbadminton.com/)
- [BWF Tournament Calendar](https://bwfbadminton.com/calendar/)
- [Puppeteer 官方文件](https://pptr.dev/)
- [專案通用架構說明](../ARCHITECTURE.md)
- [開發指南](../DEVELOPMENT.md)
