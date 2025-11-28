import fetch from 'node-fetch';
import { BwfApiClient } from '../clients/bwfApiClient.js';

const API_BASE_URL = process.env.API_BASE_URL || 'https://the-static-api.vercel.app';
const API_INDEX_PATH = '/api/index.json';

/**
 * 獲取API索引，包含所有可用的體育賽事API
 * @returns {Promise<Object>} API索引資料
 */
export async function fetchApiIndex() {
  try {
    const response = await fetch(`${API_BASE_URL}${API_INDEX_PATH}`);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching API index:', error);
    throw error;
  }
}

/**
 * 根據體育ID獲取比賽數據
 * BWF 使用官方 API (需要 Puppeteer)，其他運動使用靜態 API
 * @param {string} sportId - 體育ID (例如: 'bwf')
 * @returns {Promise<Object>} 比賽數據
 */
export async function fetchTournamentData(sportId) {
  try {
    // BWF 特殊處理：使用官方 API
    if (sportId === 'bwf') {
      console.log('Using BWF Official API (Puppeteer-based)');
      const bwfClient = new BwfApiClient();
      return await bwfClient.fetchTournaments();
    }

    // 其他運動：使用靜態 API 索引
    // 先獲取API索引以找到正確的端點
    const apiIndex = await fetchApiIndex();

    // 尋找對應的API
    const api = apiIndex.apis.find(api => api.id === sportId);
    if (!api) {
      throw new Error(`API for sport ${sportId} not found in the API index`);
    }

    // 尋找賽事數據端點
    const tournamentEndpoint = api.endpoints.find(
      endpoint => endpoint.name.toLowerCase().includes('tournament') ||
                  endpoint.description.toLowerCase().includes('tournament')
    );

    if (!tournamentEndpoint) {
      throw new Error(`Tournament endpoint for ${sportId} not found`);
    }

    // 獲取比賽數據
    const response = await fetch(`${API_BASE_URL}${tournamentEndpoint.url}`);

    if (!response.ok) {
      throw new Error(`Tournament data request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${sportId} tournament data:`, error);
    throw error;
  }
}
