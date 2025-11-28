# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sports Calendar Creator 是一個自動化的運動賽事日曆管理服務，整合多個運動賽事 API，自動抓取賽事資訊並建立 Google Calendar 事件。專案採用前後端分離架構：

- **Backend (calendar-scripts/)**: Node.js + JavaScript，負責 API 整合與 Google Calendar 管理
- **Frontend (frontend/)**: Vue 3 + TypeScript + Vite，提供公開日曆介面

## Development Commands

### Backend (Calendar Scripts)
```bash
# 執行日曆同步服務
npm run cal:start

# 開發模式（hot reload）
npm run cal:dev

# Lint 後端程式碼
npm run cal:lint

# 移除重複的日曆事件（需提供 calendar-id）
npm run cal:remove-duplicates <calendar-id>

# 指定特定運動 ID 執行
node calendar-scripts/src/index.js bwf
```

### Frontend
```bash
# 開發伺服器
npm run front:dev

# 生產建置
npm run front:build

# 預覽生產建置
npm run front:preview

# 預覽公開日曆介面（靜態檔案）
npm run preview
```

## Architecture

### Backend Architecture

**詳細技術文件**: 請參閱 [`calendar-scripts/README.md`](calendar-scripts/README.md)

**簡要概述**:
```
API Index → API Client → Adapter Factory → Sport-specific Adapter → Data Processor → Calendar Service → Google Calendar
```

核心設計模式：
- **Adapter Pattern**: 統一處理不同 API 的資料格式
- **Factory Pattern**: 動態載入對應運動的適配器
- **Service Account Auth**: 使用 Google 服務帳戶進行無頭環境認證
- **Duplicate Prevention**: 建立事件前查詢相同名稱與日期範圍的事件

### Frontend Structure
- **路徑別名**: `@/` 對應到 `frontend/src/`
- **UI 元件**: 使用 reka-ui（headless UI）+ Tailwind CSS + class-variance-authority
- **主要頁面**: `view/Home.vue`
- **UI 元件庫**: `components/ui/` 包含可重用的基礎元件（Button, Card, Alert 等）

## Backend Development

### 新增運動支援

1. 在 `calendar-scripts/src/adapters/` 建立新的適配器檔案
2. 實作 `standardize(data)` 方法，返回標準格式陣列（見 `calendar-scripts/README.md`）
3. 在 `adapters/adapterFactory.js` 中註冊適配器
4. 確保上游 API 已加入 `https://the-static-api.vercel.app/api/index.json`

詳細步驟與標準格式定義，請參閱 [`calendar-scripts/README.md`](calendar-scripts/README.md)。

### Google Calendar 設定

- 需要 `credentials.json`（服務帳戶金鑰）
- 必須在 Google Calendar 中將服務帳戶郵箱加入日曆共享設定
- 驗證失敗時會返回 mock calendar ID，不中斷執行

完整設定步驟請參閱 [`calendar-scripts/README.md`](calendar-scripts/README.md)。

## Environment Configuration

建立 `.env` 檔案：
```bash
GOOGLE_CALENDAR_CREDENTIALS=credentials.json
GOOGLE_CALENDAR_TOKEN=token.json
API_BASE_URL=https://the-static-api.vercel.app
```

⚠️ `credentials.json` 與 `.env` 已加入 `.gitignore`，切勿提交至版本控制。

## GitHub Actions Integration

`.github/workflows/action.yml` 提供可重用的 workflow，允許外部 repository 觸發日曆同步：

```yaml
uses: your-repo/games-calendar/.github/workflows/action.yml@main
with:
  sports: 'bwf'  # 可選，逗號分隔的運動 ID 列表
secrets:
  GOOGLE_CALENDAR_CREDENTIALS: ${{ secrets.GOOGLE_CALENDAR_CREDENTIALS }}
```

## File Organization

- **Backend entry**: `calendar-scripts/src/index.js`
- **Backend docs**: `calendar-scripts/README.md` - 完整技術文件與開發指南
- **Frontend entry**: `frontend/src/main.ts`
- **Static data**: `public/data/` - 預先產生的日曆資料（`calendars.json`）
- **Build output**: `dist/` - Frontend 建置輸出目錄
- **Config files**:
  - `vite.config.ts` - Vite 配置，root 設為 `./frontend`
  - `tsconfig.json` - TypeScript 路徑映射配置
  - `tailwind.config.js` - Tailwind CSS 配置

## Documentation Strategy

### 金字塔式文件結構

專案採用分層文件管理，從通用到特定：

```
📄 CLAUDE.md (專案總覽)
  └─ 📁 calendar-scripts/
      ├─ 📄 README.md (文件索引，僅列出文件清單)
      └─ 📁 docs/
          ├─ 📄 ARCHITECTURE.md (通用架構說明)
          ├─ 📄 DEVELOPMENT.md (通用開發指南)
          └─ 📁 sports/
              ├─ 📄 BWF.md (BWF 專屬實作細節)
              ├─ 📄 TENNIS.md (Tennis 專屬實作細節)
              └─ 📄 ...
```

### 文件撰寫原則

#### 1. 頂級文件（README.md）
- **只作為索引**，列出所有可用文件
- **不包含**實作細節或教學內容
- 提供快速開始指令與文件導航

#### 2. 通用文件（docs/*.md）
- `ARCHITECTURE.md`: 系統架構、設計模式、資料流程
- `DEVELOPMENT.md`: 環境設定、開發流程、測試方法
- 包含**所有運動共通**的概念與流程
- 不包含特定運動的細節

#### 3. 專屬文件（docs/sports/*.md）
- 每個運動一個文件（例如 `BWF.md`, `TENNIS.md`）
- 包含該運動的**所有特殊處理方式**：
  - 資料來源與 API 端點
  - 技術挑戰與解決方案
  - 核心元件實作細節
  - 執行與測試方法
  - 故障排除
- 保持文件完整性，讓讀者無需跳轉即可理解該運動的完整實作

### 文件更新政策（強制執行）

**每次開發都必須更新對應文件，這是非常重要的！**

#### 新增運動支援時

1. **建立運動專屬文件**
   ```bash
   touch calendar-scripts/docs/sports/YOUR_SPORT.md
   ```

2. **使用範本撰寫**（參考 `docs/sports/BWF.md` 的結構）：
   - 資料來源
   - 技術挑戰
   - 實作方式
   - 資料格式
   - 核心元件
   - 執行與測試
   - 故障排除

3. **更新索引文件**
   - 在 `calendar-scripts/README.md` 的「支援的運動」表格中新增一行
   - 連結到新建立的專屬文件

#### 修改架構時

1. **更新 `docs/ARCHITECTURE.md`**
   - 修改對應的設計模式說明
   - 更新架構圖
   - 補充新的設計決策

2. **若影響開發流程，同步更新 `docs/DEVELOPMENT.md`**

#### 修改開發流程時

1. **更新 `docs/DEVELOPMENT.md`**
   - 新增或修改對應的章節
   - 更新範例程式碼

#### 修改特定運動實作時

1. **只更新該運動的專屬文件**
   - 例如：修改 BWF Adapter → 更新 `docs/sports/BWF.md`

2. **若涉及通用模式變更，同時更新 `docs/ARCHITECTURE.md`**

### 文件品質要求

- ✅ **完整性**: 讀者無需跳轉即可理解該主題
- ✅ **程式碼範例**: 包含實際可執行的範例
- ✅ **故障排除**: 列出常見問題與解決方案
- ✅ **時效性**: 與程式碼保持同步，避免過時資訊
- ✅ **階層清晰**: 使用適當的標題層級與目錄

### 檢查清單

在提交 PR 前，確認：

- [ ] 新增功能有對應的文件更新
- [ ] 文件範例可正常執行
- [ ] 索引文件（README.md）已更新連結
- [ ] 文件使用繁體中文撰寫
- [ ] 包含目錄與適當的章節劃分

---

## Important Notes

- 專案使用 ES Modules (`"type": "module"` in package.json)
- Backend 使用 JavaScript，Frontend 使用 TypeScript
- Node.js 版本要求：v22 或更高（參考 `.tool-versions`）
- 無測試框架配置（目前無 test 檔案）
- Backend 詳細架構、資料流程、錯誤處理策略等，請參閱 `calendar-scripts/README.md`
- **文件更新是開發流程的必要部分**，不可跳過
