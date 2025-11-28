/**
 * BWF API Client - 使用 Puppeteer 取得官方賽事資料
 * 這個 client 會模擬瀏覽器訪問 BWF 官方網站，攔截 API 請求來取得賽事資料
 */

import puppeteer from 'puppeteer';

export class BwfApiClient {
  constructor() {
    this.apiEndpoint = 'https://extranet-lv.bwfbadminton.com/api/vue-grouped-year-tournaments';
    this.pageUrl = 'https://bwfbadminton.com/calendar/';
  }

  /**
   * 從 BWF 官方 API 取得賽事資料
   * @param {number} year - 年份 (預設為當前年份)
   * @returns {Promise<Object>} BWF API 回應資料
   */
  async fetchTournaments(year = new Date().getFullYear()) {
    console.log(`正在從 BWF 官方 API 取得 ${year} 年賽事資料...`);

    let browser = null;

    try {
      // 啟動無頭瀏覽器（GitHub Actions 環境配置）
      browser = await puppeteer.launch({
        headless: true, // 在 CI/CD 環境中必須使用無頭模式
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // 解決共享記憶體問題
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();

      // 設定 User-Agent 和 viewport 來模擬真實瀏覽器
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 訪問 BWF 日曆頁面，同時等待 API 回應
      console.log('正在訪問 BWF 官方日曆頁面...');

      const [response] = await Promise.all([
        // 等待特定的 API 回應
        page.waitForResponse(
          response => response.url().includes('vue-grouped-year-tournaments') && response.status() === 200,
          { timeout: 60000 }
        ),
        // 訪問頁面
        page.goto(this.pageUrl, {
          waitUntil: 'networkidle2',
          timeout: 60000
        })
      ]);

      console.log(`✅ 成功攔截 BWF API 回應`);

      // 取得並解析回應資料
      const apiResponse = await response.json();

      if (apiResponse.results) {
        const totalTournaments = apiResponse.results.reduce((sum, month) => {
          return sum + (month.tournaments?.length || 0);
        }, 0);
        console.log(`   收到 ${apiResponse.results.length} 個月份，共 ${totalTournaments} 筆賽事`);
      }

      return apiResponse;

    } catch (error) {
      console.error('BWF API Client 錯誤:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * 取得指定年份和月份的賽事
   * @param {number} year - 年份
   * @param {number} month - 月份 (1-12)
   * @returns {Promise<Array>} 賽事陣列
   */
  async fetchMonthTournaments(year, month) {
    const data = await this.fetchTournaments(year);

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    // 找到對應月份的資料（monthNo 是 1-12）
    const monthData = data.results.find(m => m.monthNo === month);
    return monthData?.tournaments || [];
  }
}
