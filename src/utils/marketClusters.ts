/**
 * Динамическая кластеризация крипто-рынка
 * Монеты делятся по лидерам и секторам для диверсификации рисков
 */

export type MarketLeader = 'BTC' | 'ETH' | 'SOL' | 'BNB' | 'TON' | 'XRP' | 'DOGE';
export type MarketSector = 'L1' | 'L2' | 'DeFi' | 'CEX' | 'Meme' | 'AI' | 'Gaming' | 'RWA' | 'DePIN' | 'Privacy' | 'Other';

export interface CoinCluster {
  symbol: string;
  leader: MarketLeader; // С каким лидером коррелирует
  sector: MarketSector; // Сектор рынка
}

/**
 * Статический маппинг монет по кластерам
 * В будущем можно заменить на динамический расчет корреляции
 */
export const COIN_CLUSTERS: Record<string, CoinCluster> = {
  // ========== BTC ECOSYSTEM ==========
  'BTCUSDT': { symbol: 'BTCUSDT', leader: 'BTC', sector: 'L1' },
  'BCHUSDT': { symbol: 'BCHUSDT', leader: 'BTC', sector: 'L1' },
  'BSVUSDT': { symbol: 'BSVUSDT', leader: 'BTC', sector: 'L1' },
  'STXUSDT': { symbol: 'STXUSDT', leader: 'BTC', sector: 'L2' },
  'ORDIUSDT': { symbol: 'ORDIUSDT', leader: 'BTC', sector: 'Other' },
  'SATSUSDT': { symbol: 'SATSUSDT', leader: 'BTC', sector: 'Meme' },
  
  // ========== ETH ECOSYSTEM ==========
  'ETHUSDT': { symbol: 'ETHUSDT', leader: 'ETH', sector: 'L1' },
  'ETCUSDT': { symbol: 'ETCUSDT', leader: 'ETH', sector: 'L1' },
  
  // ETH L2s
  'ARBUSDT': { symbol: 'ARBUSDT', leader: 'ETH', sector: 'L2' },
  'OPUSDT': { symbol: 'OPUSDT', leader: 'ETH', sector: 'L2' },
  'MATICUSDT': { symbol: 'MATICUSDT', leader: 'ETH', sector: 'L2' },
  'POLYUSDT': { symbol: 'POLYUSDT', leader: 'ETH', sector: 'L2' },
  'POLUSDT': { symbol: 'POLUSDT', leader: 'ETH', sector: 'L2' },
  'METISUSDT': { symbol: 'METISUSDT', leader: 'ETH', sector: 'L2' },
  'STRKUSDT': { symbol: 'STRKUSDT', leader: 'ETH', sector: 'L2' },
  'ZKSYNCUSDT': { symbol: 'ZKSYNCUSDT', leader: 'ETH', sector: 'L2' },
  'ZKUSDT': { symbol: 'ZKUSDT', leader: 'ETH', sector: 'L2' },
  'SCROLLUSDT': { symbol: 'SCROLLUSDT', leader: 'ETH', sector: 'L2' },
  
  // ETH DeFi
  'UNIUSDT': { symbol: 'UNIUSDT', leader: 'ETH', sector: 'DeFi' },
  'AAVEUSDT': { symbol: 'AAVEUSDT', leader: 'ETH', sector: 'DeFi' },
  'MKRUSDT': { symbol: 'MKRUSDT', leader: 'ETH', sector: 'DeFi' },
  'COMPUSDT': { symbol: 'COMPUSDT', leader: 'ETH', sector: 'DeFi' },
  'CRVUSDT': { symbol: 'CRVUSDT', leader: 'ETH', sector: 'DeFi' },
  'SNXUSDT': { symbol: 'SNXUSDT', leader: 'ETH', sector: 'DeFi' },
  'LRCUSDT': { symbol: 'LRCUSDT', leader: 'ETH', sector: 'DeFi' },
  'LDOUSDT': { symbol: 'LDOUSDT', leader: 'ETH', sector: 'DeFi' },
  'PENDLEUSDT': { symbol: 'PENDLEUSDT', leader: 'ETH', sector: 'DeFi' },
  '1INCHUSDT': { symbol: '1INCHUSDT', leader: 'ETH', sector: 'DeFi' },
  
  // ========== SOL ECOSYSTEM ==========
  'SOLUSDT': { symbol: 'SOLUSDT', leader: 'SOL', sector: 'L1' },
  'JUPUSDT': { symbol: 'JUPUSDT', leader: 'SOL', sector: 'DeFi' },
  'RAYUSDT': { symbol: 'RAYUSDT', leader: 'SOL', sector: 'DeFi' },
  'WIFUSDT': { symbol: 'WIFUSDT', leader: 'SOL', sector: 'Meme' },
  'BONKUSDT': { symbol: 'BONKUSDT', leader: 'SOL', sector: 'Meme' },
  'BOMEUSDT': { symbol: 'BOMEUSDT', leader: 'SOL', sector: 'Meme' },
  'MEUSDT': { symbol: 'MEUSDT', leader: 'SOL', sector: 'Meme' },
  'PYUSUSDT': { symbol: 'PYUSUSDT', leader: 'SOL', sector: 'Meme' },
  'MEWUSDT': { symbol: 'MEWUSDT', leader: 'SOL', sector: 'Meme' },
  'POPUSDT': { symbol: 'POPUSDT', leader: 'SOL', sector: 'Meme' },
  'PORTALUSDT': { symbol: 'PORTALUSDT', leader: 'SOL', sector: 'Gaming' },
  'RENDERUSDT': { symbol: 'RENDERUSDT', leader: 'SOL', sector: 'AI' },
  
  // ========== BNB ECOSYSTEM ==========
  'BNBUSDT': { symbol: 'BNBUSDT', leader: 'BNB', sector: 'CEX' },
  'CAKEUSDT': { symbol: 'CAKEUSDT', leader: 'BNB', sector: 'DeFi' },
  'ALPACAUSDT': { symbol: 'ALPACAUSDT', leader: 'BNB', sector: 'DeFi' },
  
  // ========== TON ECOSYSTEM ==========
  'TONUSDT': { symbol: 'TONUSDT', leader: 'TON', sector: 'L1' },
  'NOTUSDT': { symbol: 'NOTUSDT', leader: 'TON', sector: 'Gaming' },
  'DOGSUSDT': { symbol: 'DOGSUSDT', leader: 'TON', sector: 'Meme' },
  
  // ========== XRP ECOSYSTEM ==========
  'XRPUSDT': { symbol: 'XRPUSDT', leader: 'XRP', sector: 'L1' },
  'XLMUSDT': { symbol: 'XLMUSDT', leader: 'XRP', sector: 'L1' },
  
  // ========== DOGE ECOSYSTEM (Meme coins) ==========
  'DOGEUSDT': { symbol: 'DOGEUSDT', leader: 'DOGE', sector: 'Meme' },
  'SHIBUSDT': { symbol: 'SHIBUSDT', leader: 'DOGE', sector: 'Meme' },
  'FLOKIUSDT': { symbol: 'FLOKIUSDT', leader: 'DOGE', sector: 'Meme' },
  'PEPEUSDT': { symbol: 'PEPEUSDT', leader: 'DOGE', sector: 'Meme' },
  'TRUMPUSDT': { symbol: 'TRUMPUSDT', leader: 'DOGE', sector: 'Meme' },
  '1000PEPEUSDT': { symbol: '1000PEPEUSDT', leader: 'DOGE', sector: 'Meme' },
  
  // ========== CEX TOKENS ==========
  'FTMUSDT': { symbol: 'FTMUSDT', leader: 'BNB', sector: 'CEX' },
  'CEXUSDT': { symbol: 'CEXUSDT', leader: 'BNB', sector: 'CEX' },
  
  // ========== AI SECTOR ==========
  'FETUSDT': { symbol: 'FETUSDT', leader: 'ETH', sector: 'AI' },
  'OCEANUSDT': { symbol: 'OCEANUSDT', leader: 'ETH', sector: 'AI' },
  'AGIXUSDT': { symbol: 'AGIXUSDT', leader: 'ETH', sector: 'AI' },
  'GRTUSDT': { symbol: 'GRTUSDT', leader: 'ETH', sector: 'AI' },
  'AIUSDT': { symbol: 'AIUSDT', leader: 'ETH', sector: 'AI' },
  'ARKMUSDT': { symbol: 'ARKMUSDT', leader: 'ETH', sector: 'AI' },
  'NMRUSDT': { symbol: 'NMRUSDT', leader: 'ETH', sector: 'AI' },
  'THETAUSDT': { symbol: 'THETAUSDT', leader: 'ETH', sector: 'AI' },
  
  // ========== GAMING ==========
  'AXSUSDT': { symbol: 'AXSUSDT', leader: 'ETH', sector: 'Gaming' },
  'SANDUSDT': { symbol: 'SANDUSDT', leader: 'ETH', sector: 'Gaming' },
  'MANAUSDT': { symbol: 'MANAUSDT', leader: 'ETH', sector: 'Gaming' },
  'ENJUSDT': { symbol: 'ENJUSDT', leader: 'ETH', sector: 'Gaming' },
  'GMTUSDT': { symbol: 'GMTUSDT', leader: 'SOL', sector: 'Gaming' },
  'GALUSDT': { symbol: 'GALUSDT', leader: 'BNB', sector: 'Gaming' },
  'APECOINUSDT': { symbol: 'APECOINUSDT', leader: 'ETH', sector: 'Gaming' },
  'APEUSDT': { symbol: 'APEUSDT', leader: 'ETH', sector: 'Gaming' },
  'ROSEUSDT': { symbol: 'ROSEUSDT', leader: 'ETH', sector: 'Gaming' },
  'IMXUSDT': { symbol: 'IMXUSDT', leader: 'ETH', sector: 'Gaming' },
  'BEAMXUSDT': { symbol: 'BEAMXUSDT', leader: 'ETH', sector: 'Gaming' },
  
  // ========== PRIVACY ==========
  'XMRUSDT': { symbol: 'XMRUSDT', leader: 'BTC', sector: 'Privacy' },
  'ZECUSDT': { symbol: 'ZECUSDT', leader: 'BTC', sector: 'Privacy' },
  'DASHUSDT': { symbol: 'DASHUSDT', leader: 'BTC', sector: 'Privacy' },
  
  // ========== DEPIN ==========
  'IOTXUSDT': { symbol: 'IOTXUSDT', leader: 'ETH', sector: 'DePIN' },
  'FILUSDT': { symbol: 'FILUSDT', leader: 'ETH', sector: 'DePIN' },
  
  // ========== RWA ==========
  'ONDOUSDT': { symbol: 'ONDOUSDT', leader: 'ETH', sector: 'RWA' },
  
  // ========== OTHER L1s ==========
  'ADAUSDT': { symbol: 'ADAUSDT', leader: 'ETH', sector: 'L1' },
  'DOTUSDT': { symbol: 'DOTUSDT', leader: 'ETH', sector: 'L1' },
  'AVAXUSDT': { symbol: 'AVAXUSDT', leader: 'ETH', sector: 'L1' },
  'ATOMUSDT': { symbol: 'ATOMUSDT', leader: 'ETH', sector: 'L1' },
  'NEARUSDT': { symbol: 'NEARUSDT', leader: 'ETH', sector: 'L1' },
  'ALGOUSDT': { symbol: 'ALGOUSDT', leader: 'ETH', sector: 'L1' },
  'APTUSDT': { symbol: 'APTUSDT', leader: 'ETH', sector: 'L1' },
  'SUIUSDT': { symbol: 'SUIUSDT', leader: 'ETH', sector: 'L1' },
  'SEIUSDT': { symbol: 'SEIUSDT', leader: 'ETH', sector: 'L1' },
  'INJUSDT': { symbol: 'INJUSDT', leader: 'ETH', sector: 'L1' },
  'TIAUSDT': { symbol: 'TIAUSDT', leader: 'ETH', sector: 'L1' },
  'HBARUSDT': { symbol: 'HBARUSDT', leader: 'ETH', sector: 'L1' },
  'ICPUSDT': { symbol: 'ICPUSDT', leader: 'ETH', sector: 'L1' },
  'VETUSDT': { symbol: 'VETUSDT', leader: 'ETH', sector: 'L1' },
  'TRXUSDT': { symbol: 'TRXUSDT', leader: 'ETH', sector: 'L1' },
  'LINKUSDT': { symbol: 'LINKUSDT', leader: 'ETH', sector: 'DeFi' },
  'LTCUSDT': { symbol: 'LTCUSDT', leader: 'BTC', sector: 'L1' },
  
  // ========== OTHER ==========
  'RUNEUSDT': { symbol: 'RUNEUSDT', leader: 'BTC', sector: 'DeFi' },
  'CHZUSDT': { symbol: 'CHZUSDT', leader: 'BNB', sector: 'Other' },
  'FLOWUSDT': { symbol: 'FLOWUSDT', leader: 'ETH', sector: 'Other' },
};

/**
 * Получить кластер монеты
 */
export function getCoinCluster(symbol: string): CoinCluster {
  const cluster = COIN_CLUSTERS[symbol];
  
  if (!cluster) {
    // Если монеты нет в маппинге, определяем лидера по умолчанию
    // console.warn(`⚠️ [Cluster] Symbol ${symbol} not in cluster map, using default (ETH/Other)`);
    return {
      symbol,
      leader: 'ETH', // По умолчанию ETH ecosystem
      sector: 'Other',
    };
  }
  
  return cluster;
}

/**
 * Получить все монеты из кластера лидера
 */
export function getCoinsByLeader(leader: MarketLeader): CoinCluster[] {
  return Object.values(COIN_CLUSTERS).filter(c => c.leader === leader);
}

/**
 * Получить все монеты из сектора
 */
export function getCoinsBySector(sector: MarketSector): CoinCluster[] {
  return Object.values(COIN_CLUSTERS).filter(c => c.sector === sector);
}

/**
 * Получить все монеты из семейства (лидер + сектор)
 */
export function getCoinsByFamily(leader: MarketLeader, sector: MarketSector): CoinCluster[] {
  return Object.values(COIN_CLUSTERS).filter(c => c.leader === leader && c.sector === sector);
}

/**
 * Получить ID семейства для группировки
 */
export function getFamilyId(cluster: CoinCluster): string {
  return `${cluster.leader}:${cluster.sector}`;
}
