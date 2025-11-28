# Calendar Scripts 文件索引

本目錄包含 Sports Calendar Creator 後端服務的完整技術文件。

## 📚 文件結構

### 🏗️ 核心文件

- **[架構說明](docs/ARCHITECTURE.md)** - 系統架構設計、設計模式、資料流程
- **[開發指南](docs/DEVELOPMENT.md)** - 環境設定、開發流程、測試方法

### 🏅 運動專屬文件

各運動的詳細實作說明，包含資料來源、API 整合、特殊處理方式：

- **[BWF 羽球](docs/sports/BWF.md)** - 官方 API 整合、Puppeteer 實作、Cloudflare 繞過方案

### 📖 其他資源

- **[專案總覽](../CLAUDE.md)** - 專案概述、指令列表、檔案組織
- **[GitHub Actions](../.github/workflows/action.yml)** - CI/CD 設定

---

## 🚀 快速開始

### 安裝

```bash
npm install
```

### 設定環境變數

建立 `.env` 檔案：

```bash
GOOGLE_CALENDAR_CREDENTIALS=credentials.json
GOOGLE_CALENDAR_TOKEN=token.json
API_BASE_URL=https://the-static-api.vercel.app
```

### 執行

```bash
# 同步所有運動
npm run cal:start

# 同步特定運動
npm run cal:start bwf

# 開發模式
npm run cal:dev
```

詳細說明請參閱 **[開發指南](docs/DEVELOPMENT.md)**。

---

## 📂 目錄結構

```
calendar-scripts/
├── src/                      # 原始碼
│   ├── index.js              # 主程式入口
│   ├── adapters/             # 資料適配器 (將各 API 格式標準化)
│   │   ├── adapterFactory.js # Adapter 註冊與工廠
│   │   ├── bwfAdapter.js     # BWF 適配器
│   │   └── ...
│   ├── clients/              # API 客戶端 (特殊資料獲取方式)
│   │   ├── bwfApiClient.js   # BWF Puppeteer Client
│   │   └── ...
│   ├── services/             # 服務層
│   │   ├── calendarService.js # Google Calendar 整合
│   │   └── authService.js     # 認證服務
│   └── utils/                # 工具函式
│       ├── apiClient.js      # API 獲取統一介面
│       └── dataProcessor.js  # 資料處理
├── docs/                     # 文件目錄 (本目錄)
│   ├── ARCHITECTURE.md       # 架構說明
│   ├── DEVELOPMENT.md        # 開發指南
│   └── sports/               # 各運動專屬文件
│       └── BWF.md            # BWF 整合說明
├── scripts/                  # 輔助腳本
│   └── removeDuplicateEvents.js
└── README.md                 # 本文件
```

---

## 🔧 支援的運動

| 運動   | Sport ID | 資料來源                | 特殊處理    | 文件連結                       |
| ------ | -------- | ----------------------- | ----------- | ------------------------------ |
| 羽球   | `bwf`    | BWF 官方 API (Puppeteer) | Cloudflare  | [BWF.md](docs/sports/BWF.md)   |

### 新增運動支援

請參閱 **[開發指南 - 新增運動支援](docs/DEVELOPMENT.md#新增運動支援)** 章節。

---

## 📋 標準資料格式

所有運動資料經 Adapter 標準化後，遵循以下格式：

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
  source: string;          // 資料來源 (例如: 'BWF')
  lastUpdated: string;     // 最後更新時間 (ISO 8601)
}
```

詳細說明請參閱 **[架構說明 - 標準資料格式](docs/ARCHITECTURE.md#標準資料格式)**。

---

## 🏗️ 架構概覽

```
API Client → Adapter → Data Processor → Calendar Service → Google Calendar
```

詳細架構設計請參閱 **[架構說明](docs/ARCHITECTURE.md)**。

---

## 🧪 測試

```bash
# Lint 程式碼
npm run cal:lint

# 測試特定運動
node calendar-scripts/src/index.js bwf
```

詳細測試方法請參閱 **[開發指南 - 測試](docs/DEVELOPMENT.md#測試)** 章節。

---

## 🛠️ 維護

### 更新文件

每次新增功能或修改時，必須同步更新對應的文件：

- 新增運動 → 建立 `docs/sports/YOUR_SPORT.md` 並更新本索引
- 修改架構 → 更新 `docs/ARCHITECTURE.md`
- 新增開發流程 → 更新 `docs/DEVELOPMENT.md`

文件撰寫策略請參閱 **[專案 CLAUDE.md](../CLAUDE.md)**。

### 更新依賴

```bash
# 檢查過時的套件
npm outdated

# 更新套件
npm update
```

---

## 📞 支援

- **問題回報**: [GitHub Issues](https://github.com/your-repo/games-calendar/issues)
- **技術文件**: 請參閱上方文件連結
- **貢獻指南**: 請參閱 [開發指南](docs/DEVELOPMENT.md)

---

## 📄 授權

MIT License
