# Calendar Scripts 架構說明

本文件說明 Sports Calendar Creator 後端服務的整體架構設計。

## 目錄

- [設計原則](#設計原則)
- [架構概覽](#架構概覽)
- [核心設計模式](#核心設計模式)
- [資料流程](#資料流程)
- [目錄結構](#目錄結構)

---

## 設計原則

### 關注點分離 (Separation of Concerns)

專案採用模組化設計，將不同職責分離為獨立元件：

- **API Clients**: 負責資料獲取
- **Adapters**: 負責資料格式轉換
- **Data Processor**: 負責資料處理與分組
- **Calendar Service**: 負責 Google Calendar 整合

### 可擴展性 (Extensibility)

- 新增運動支援只需實作對應的 Adapter
- 使用 Factory Pattern 動態載入適配器
- 不影響現有功能

### 容錯性 (Fault Tolerance)

- 單一運動失敗不影響其他運動處理
- 認證失敗時返回 mock calendar ID，不中斷服務
- 完整的錯誤處理與日誌記錄

---

## 架構概覽

```
┌─────────────────────────────────────────────────────────────┐
│                          Entry Point                         │
│                      src/index.js                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
         ┌─────────────────────────────────────┐
         │         API Index Service           │
         │     utils/apiClient.js              │
         │  ┌──────────────┬─────────────┐    │
         │  │ Static API   │  BWF API    │    │
         │  │ (fetch)      │ (Puppeteer) │    │
         │  └──────────────┴─────────────┘    │
         └─────────────────┬───────────────────┘
                           │
                           ↓
         ┌─────────────────────────────────────┐
         │       Adapter Factory               │
         │   adapters/adapterFactory.js        │
         └─────────────────┬───────────────────┘
                           │
              ┌────────────┼────────────┐
              ↓            ↓            ↓
         ┌────────┐  ┌─────────┐  ┌─────────┐
         │ BWF    │  │ Tennis  │  │ Other   │
         │Adapter │  │ Adapter │  │Adapters │
         └────┬───┘  └────┬────┘  └────┬────┘
              │           │            │
              └───────────┼────────────┘
                          ↓
         ┌─────────────────────────────────────┐
         │        Data Processor               │
         │    utils/dataProcessor.js           │
         └─────────────────┬───────────────────┘
                           │
                           ↓
         ┌─────────────────────────────────────┐
         │      Calendar Service               │
         │   services/calendarService.js       │
         │                                     │
         │  ┌──────────────────────────────┐  │
         │  │   Google Calendar API        │  │
         │  │  - Auth (Service Account)    │  │
         │  │  - Create/Update Calendar    │  │
         │  │  - Create Events             │  │
         │  │  - Duplicate Prevention      │  │
         │  └──────────────────────────────┘  │
         └─────────────────────────────────────┘
```

---

## 核心設計模式

### 1. Adapter Pattern

**目的**: 統一不同 API 的資料格式

每個運動實作自己的 Adapter，將原始 API 格式轉換為標準格式：

```javascript
// 各 API 原始格式不同
BWF API    → { results: [{month, tournaments: [...]}] }
Tennis API → { events: [...] }
Other API  → { data: {...} }

// 透過 Adapter 轉換為統一格式
↓

標準格式 → {
  id, name, location, dateStart, dateEnd,
  category, level, prize, url, description,
  source, lastUpdated
}
```

**實作範例**:

```javascript
// adapters/bwfAdapter.js
export class BwfAdapter {
  standardize(data) {
    // 將 BWF 格式轉換為標準格式
    return standardizedData;
  }
}

// adapters/adapterFactory.js
const adapters = {
  'bwf': BwfAdapter,
  'tennis': TennisAdapter
};

export function getAdapter(sportId) {
  const AdapterClass = adapters[sportId];
  return AdapterClass ? new AdapterClass() : null;
}
```

---

### 2. Factory Pattern

**目的**: 動態建立適配器實例

根據 `sportId` 動態決定使用哪個 Adapter：

```javascript
// 主流程
const adapter = getAdapter('bwf');  // 返回 BwfAdapter 實例
const standardized = adapter.standardize(rawData);
```

**優點**:
- 新增運動時只需註冊到 factory
- 主流程不需修改
- 支援執行時期決定

---

### 3. Service-Oriented Architecture

**目的**: 將功能分離為獨立服務

- **API Client Service**: 資料獲取
- **Data Processing Service**: 資料處理
- **Calendar Service**: 日曆管理

每個 Service 獨立運作，透過標準介面溝通。

---

### 4. Strategy Pattern (用於 API Client)

**目的**: 根據不同運動使用不同的資料獲取策略

```javascript
// utils/apiClient.js
export async function fetchTournamentData(sportId) {
  // Strategy 1: BWF 使用 Puppeteer
  if (sportId === 'bwf') {
    const client = new BwfApiClient();
    return await client.fetchTournaments();
  }

  // Strategy 2: 其他運動使用靜態 API
  const apiIndex = await fetchApiIndex();
  const api = apiIndex.apis.find(api => api.id === sportId);
  // ...
}
```

---

## 資料流程

### 完整流程

```
1. 啟動
   └─ main(sportIds)

2. 對每個 sportId:
   ├─ 獲取 Adapter
   │  └─ getAdapter(sportId)
   │
   ├─ 獲取資料
   │  ├─ BWF: BwfApiClient (Puppeteer)
   │  └─ 其他: Static API (fetch)
   │
   ├─ 標準化資料
   │  └─ adapter.standardize(rawData)
   │
   ├─ 處理資料
   │  └─ processData(standardizedData)
   │
   └─ 建立/更新日曆
      ├─ 取得或建立日曆
      ├─ 設定公開權限
      ├─ 建立事件（防重複）
      └─ 返回 Calendar ID
```

### 錯誤處理

```
任一運動失敗 → 記錄錯誤 → 繼續處理下一個運動
              ↓
           不中斷整體流程
```

---

## 目錄結構

```
calendar-scripts/
├── src/
│   ├── index.js              # 主程式入口
│   │
│   ├── adapters/             # 資料適配器
│   │   ├── adapterFactory.js # Adapter 工廠
│   │   ├── bwfAdapter.js     # BWF 適配器
│   │   └── ...               # 其他運動適配器
│   │
│   ├── clients/              # API 客戶端
│   │   ├── bwfApiClient.js   # BWF Puppeteer Client
│   │   └── ...               # 其他專用 Client
│   │
│   ├── services/             # 服務層
│   │   ├── calendarService.js # Google Calendar 服務
│   │   └── authService.js     # 認證服務
│   │
│   └── utils/                # 工具函式
│       ├── apiClient.js      # API 獲取統一介面
│       └── dataProcessor.js  # 資料處理工具
│
├── docs/                     # 文件目錄
│   ├── ARCHITECTURE.md       # 本文件
│   ├── DEVELOPMENT.md        # 開發指南
│   └── sports/               # 各運動專屬文件
│       └── BWF.md            # BWF 說明
│
└── README.md                 # 文件索引
```

---

## 標準資料格式

所有 Adapter 必須輸出此標準格式：

```typescript
interface Tournament {
  id: string;              // 唯一識別碼
  name: string;            // 賽事名稱
  location: {
    city: string;          // 城市
    country: string;       // 國家
    venue: string;         // 場館
  };
  dateStart: string;       // 開始日期 (ISO 8601)
  dateEnd: string;         // 結束日期 (ISO 8601)
  category: string;        // 賽事類別
  level: string;           // 等級
  prize: string;           // 獎金
  url: string;             // 官方連結
  description: string;     // 詳細描述
  source: string;          // 資料來源
  lastUpdated: string;     // 最後更新時間 (ISO 8601)
}
```

---

## Google Calendar 整合

### 認證方式

使用 **Service Account** 進行無頭認證：

```javascript
// 優點
✓ 無需使用者互動
✓ 適合 CI/CD 環境
✓ 穩定可靠

// 設定需求
- credentials.json (服務帳戶金鑰)
- 將服務帳戶加入日曆共享
```

### 重複事件防止

建立事件前查詢相同條件的事件：

```javascript
// 查詢條件
- 事件標題 (summary)
- 時間範圍 (timeMin, timeMax)

// 若存在則跳過，避免重複建立
```

---

## 擴展指南

### 新增運動支援

1. **建立 Adapter**
   ```javascript
   // src/adapters/tennisAdapter.js
   export class TennisAdapter {
     standardize(data) {
       // 實作轉換邏輯
       return standardizedData;
     }
   }
   ```

2. **註冊到 Factory**
   ```javascript
   // src/adapters/adapterFactory.js
   import { TennisAdapter } from './tennisAdapter.js';

   const adapters = {
     'bwf': BwfAdapter,
     'tennis': TennisAdapter  // 新增
   };
   ```

3. **建立專屬文件**
   ```bash
   # docs/sports/TENNIS.md
   ```

4. **(可選) 建立專屬 Client**
   ```javascript
   // 若需要特殊處理 (如 BWF 需要 Puppeteer)
   // src/clients/tennisApiClient.js
   ```

---

## 參考文件

- [開發指南](./DEVELOPMENT.md) - 如何開發與測試
- [BWF 整合說明](./sports/BWF.md) - BWF 特定實作
- [專案 README](../README.md) - 文件總索引
