/**
 * BWF (羽毛球世界聯合會) 比賽數據適配器
 * 將 BWF 官方 API 格式轉換為標準化的比賽數據格式
 *
 * 資料格式：
 * {
 *   results: [
 *     {
 *       month: "January",
 *       monthNo: 1,
 *       tournaments: [
 *         {
 *           name: "...",
 *           start_date: "2025-01-07 00:00:00",
 *           end_date: "2025-01-12 00:00:00",
 *           location: "Kuala Lumpur, Malaysia",
 *           country: "Malaysia",
 *           prize_money: "1,450,000",
 *           category: "HSBC BWF World Tour Super 1000",
 *           url: "https://...",
 *           ...
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
export class BwfAdapter {
  /**
   * 將 BWF 比賽數據標準化
   * @param {Object} data - 從 BWF 官方 API 獲取的原始數據
   * @returns {Array} 標準化的比賽數據數組
   */
  standardize(data) {
    console.log('BWF Adapter received data structure:', Object.keys(data || {}).join(', '));

    // 檢查數據是否為空或無效
    if (!data) {
      console.warn('Received empty data in BWF adapter');
      return [];
    }

    try {
      // 處理官方 API 格式: {results: [{month: "January", tournaments: [...]}]}
      if (data.results && Array.isArray(data.results)) {
        console.log(`Processing BWF official API format with ${data.results.length} months`);
        return this._processOfficialApiFormat(data.results);
      }
      // 處理舊格式 (向後兼容): {results: {January: {...}, February: {...}, ...}}
      else if (data.results && typeof data.results === 'object') {
        console.log('Processing BWF legacy format with monthly objects');
        return this._processMonthlyResults(data.results);
      }
      // 處理 tournaments 數組格式
      else if (data.tournaments && Array.isArray(data.tournaments)) {
        console.log('Processing BWF data in tournaments array format');
        return this._processTournamentsArray(data.tournaments);
      }
      // 處理純數組格式
      else if (Array.isArray(data)) {
        console.log('Processing BWF data as direct array');
        return this._processTournamentsArray(data);
      }
      // 未知格式
      else {
        console.warn('Unrecognized BWF data format:', Object.keys(data).join(', '));
        return [];
      }
    } catch (error) {
      console.error('Error standardizing BWF tournament data:', error);
      return [];
    }
  }

  /**
   * 處理官方 API 格式 (results 是陣列)
   * @param {Array} results - 月份陣列，每個月份包含 tournaments
   * @returns {Array} 標準化的比賽數據數組
   * @private
   */
  _processOfficialApiFormat(results) {
    const standardizedTournaments = [];

    for (const monthData of results) {
      if (!monthData.tournaments || !Array.isArray(monthData.tournaments)) {
        continue;
      }

      for (const tournament of monthData.tournaments) {
        const standardTournament = {
          id: `bwf-${tournament.id || Date.now()}-${tournament.code || Math.random().toString(36).substr(2, 5)}`,
          name: tournament.name || 'Unnamed Tournament',
          location: {
            city: this._extractCity(tournament.location),
            country: tournament.country || '',
            venue: tournament.location || ''
          },
          dateStart: tournament.start_date ? this._parseDate(tournament.start_date) : null,
          dateEnd: tournament.end_date ? this._parseDate(tournament.end_date) : null,
          category: tournament.category || 'BWF Tournament',
          level: this._extractLevel(tournament.category),
          prize: tournament.prize_money || '',
          url: tournament.url || '',
          description: this._generateOfficialDescription(tournament),
          source: 'BWF',
          lastUpdated: new Date().toISOString()
        };

        // 只添加有開始和結束日期的比賽
        if (standardTournament.dateStart && standardTournament.dateEnd) {
          standardizedTournaments.push(standardTournament);
        }
      }
    }

    console.log(`Standardized ${standardizedTournaments.length} tournaments from official API format`);
    return standardizedTournaments;
  }

  /**
   * 解析日期字串為 ISO 格式（避免時區問題）
   * BWF API 返回格式: "2025-12-17 00:00:00"
   * @param {string} dateString - 日期字串
   * @returns {string} ISO 8601 格式日期字串
   * @private
   */
  _parseDate(dateString) {
    if (!dateString) return null;

    // BWF API 格式: "2025-12-17 00:00:00"
    // 提取日期部分 "2025-12-17"
    const datePart = dateString.split(' ')[0];

    // 將日期視為 UTC 時間，避免本地時區影響
    // 格式: "2025-12-17T00:00:00.000Z"
    return `${datePart}T00:00:00.000Z`;
  }

  /**
   * 從 location 字串中提取城市名稱
   * 例如: "Kuala Lumpur, Malaysia" -> "Kuala Lumpur"
   * @param {string} location - 位置字串
   * @returns {string} 城市名稱
   * @private
   */
  _extractCity(location) {
    if (!location) return '';
    const parts = location.split(',');
    return parts[0]?.trim() || '';
  }

  /**
   * 從 category 中提取賽事等級
   * 例如: "HSBC BWF World Tour Super 1000" -> "Super 1000"
   * @param {string} category - 賽事分類
   * @returns {string} 賽事等級
   * @private
   */
  _extractLevel(category) {
    if (!category) return '';

    const levelMatch = category.match(/Super \d+/i);
    if (levelMatch) {
      return levelMatch[0];
    }

    if (category.includes('World Championships')) return 'World Championships';
    if (category.includes('Grand Prix')) return 'Grand Prix';

    return '';
  }

  /**
   * 為官方 API 格式生成描述
   * @param {Object} tournament - 賽事資料
   * @returns {string} 描述文字
   * @private
   */
  _generateOfficialDescription(tournament) {
    let description = '';

    if (tournament.name) {
      description += `${tournament.name}\n\n`;
    }

    if (tournament.category) {
      description += `${tournament.category}\n`;
    }

    if (tournament.prize_money) {
      description += `Prize Money: $${tournament.prize_money}\n`;
    }

    if (tournament.location) {
      description += `Location: ${tournament.location}\n`;
    }

    if (tournament.date) {
      description += `Date: ${tournament.date}\n`;
    }

    if (tournament.url) {
      description += `\nMore info: ${tournament.url}\n`;
    }

    description += `\nSource: BWF Official API`;

    return description;
  }
  
  /**
   * 處理按月份組織的比賽數據
   * @param {Object} monthlyResults - 按月份組織的比賽數據
   * @returns {Array} 標準化的比賽數據數組
   * @private
   */
  _processMonthlyResults(monthlyResults) {
    const standardizedTournaments = [];
    
    // 遍歷所有月份
    for (const month in monthlyResults) {
      const monthData = monthlyResults[month];
      
      // 檢查月份數據是否為對象
      if (!monthData || typeof monthData !== 'object') continue;
      
      // 遍歷月份內的所有比賽
      for (const tournamentIndex in monthData) {
        const tournament = monthData[tournamentIndex];
        
        if (!tournament || typeof tournament !== 'object') continue;
        
        // 創建標準化比賽對象
        const standardTournament = {
          id: `bwf-${month}-${tournamentIndex}-${Date.now()}`,
          name: tournament.name || 'Unnamed Tournament',
          location: {
            city: tournament.city || '',
            country: tournament.country || '',
            venue: tournament.venue || ''
          },
          dateStart: tournament.start_date ? new Date(tournament.start_date).toISOString() : null,
          dateEnd: tournament.end_date ? new Date(tournament.end_date).toISOString() : null,
          category: tournament.category || tournament.level || 'BWF Tournament',
          level: tournament.grade || tournament.tier || '',
          prize: tournament.prize || '',
          url: tournament.url || '',
          description: this._generateDescription(tournament),
          source: 'BWF',
          lastUpdated: new Date().toISOString()
        };
        
        // 只添加有開始和結束日期的比賽
        if (standardTournament.dateStart && standardTournament.dateEnd) {
          standardizedTournaments.push(standardTournament);
        }
      }
    }
    
    console.log(`Standardized ${standardizedTournaments.length} tournaments from monthly format`);
    return standardizedTournaments;
  }
  
  /**
   * 處理比賽數組格式
   * @param {Array} tournaments - 比賽數據數組
   * @returns {Array} 標準化的比賽數據數組
   * @private
   */
  _processTournamentsArray(tournaments) {
    const standardizedTournaments = [];
    
    for (const tournament of tournaments) {
      const standardTournament = {
        id: tournament.id || `bwf-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: tournament.name || tournament.title || 'Unnamed Tournament',
        location: {
          city: this._getNestedProperty(tournament, 'location.city') || tournament.city || '',
          country: this._getNestedProperty(tournament, 'location.country') || tournament.country || '',
          venue: this._getNestedProperty(tournament, 'location.venue') || tournament.venue || ''
        },
        dateStart: this._getDate(tournament, 'start') || null,
        dateEnd: this._getDate(tournament, 'end') || null,
        category: tournament.category || 'BWF Tournament',
        level: tournament.level || tournament.grade || '',
        prize: tournament.prize || '',
        url: tournament.url || '',
        description: this._generateDescription(tournament),
        source: 'BWF',
        lastUpdated: new Date().toISOString()
      };
      
      // 只添加有開始和結束日期的比賽
      if (standardTournament.dateStart && standardTournament.dateEnd) {
        standardizedTournaments.push(standardTournament);
      }
    }
    
    console.log(`Standardized ${standardizedTournaments.length} tournaments from array format`);
    return standardizedTournaments;
  }
  
  /**
   * 根據比賽數據生成描述文本
   * @param {Object} tournament - 比賽數據
   * @returns {string} 描述文本
   * @private
   */
  _generateDescription(tournament) {
    let description = '';
    
    if (tournament.name) {
      description += `${tournament.name}\n\n`;
    }
    
    if (tournament.level || tournament.category) {
      description += `${tournament.level || ''} ${tournament.category || ''}\n`;
    }
    
    if (tournament.prize) {
      description += `Prize: ${tournament.prize}\n`;
    }
    
    if (tournament.location) {
      const locationParts = [
        tournament.location.venue,
        tournament.location.city,
        tournament.location.country
      ].filter(Boolean);
      
      if (locationParts.length > 0) {
        description += `Location: ${locationParts.join(', ')}\n`;
      }
    }
    
    if (tournament.url) {
      description += `\nMore info: ${tournament.url}\n`;
    }
    
    description += `\nSource: BWF Tournament Calendar`;
    
    return description;
  }
  
  _getNestedProperty(obj, path) {
    return path.split('.').reduce((acc, current) => acc && acc[current], obj);
  }
  
  _getDate(tournament, type) {
    if (tournament.dates && tournament.dates[type]) {
      return new Date(tournament.dates[type]).toISOString();
    } else if (tournament[type]) {
      return new Date(tournament[type]).toISOString();
    } else {
      return null;
    }
  }
}
