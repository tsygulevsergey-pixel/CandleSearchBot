/**
 * Тестовый скрипт для проверки логики определения паттернов
 * Запуск: npx tsx test-pattern-detection.ts
 */

import { binanceClient } from './src/utils/binanceClient';
import { patternDetector } from './src/utils/candleAnalyzer';
import { getCoinCluster, getFamilyId } from './src/utils/marketClusters';

async function testPatternDetection() {
  console.log('🧪 [Test] Starting pattern detection test...\n');

  // Тестовые монеты из разных кластеров
  const testSymbols = [
    'BTCUSDT',   // BTC:L1
    'ETHUSDT',   // ETH:L1
    'SOLUSDT',   // SOL:L1
    'WIFUSDT',   // SOL:Meme
    'ARBUSDT',   // ETH:L2
    'UNIUSDT',   // ETH:DeFi
    'PORT3USDT', // Монета из твоих скринов
    'PUMPUSDT',  // Монета из твоих скринов
  ];

  const timeframe = '15m';

  for (const symbol of testSymbols) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 Testing ${symbol}`);
    console.log(`${'='.repeat(80)}`);

    try {
      // Получаем кластер
      const cluster = getCoinCluster(symbol);
      const familyId = getFamilyId(cluster);
      console.log(`🏷️ Cluster: ${familyId} (Leader: ${cluster.leader}, Sector: ${cluster.sector})\n`);

      // Получаем свечи
      const candles = await binanceClient.getKlines(symbol, timeframe, 200);
      console.log(`📊 Loaded ${candles.length} candles`);

      if (candles.length < 200) {
        console.log(`⚠️ Insufficient candles, skipping\n`);
        continue;
      }

      // Детектируем паттерны
      const patterns = patternDetector.detectAllPatterns(candles, timeframe);

      if (patterns.length === 0) {
        console.log(`❌ No patterns detected\n`);
      } else {
        console.log(`\n✅ Found ${patterns.length} pattern(s):\n`);
        
        for (const pattern of patterns) {
          console.log(`   🎯 Pattern: ${pattern.type}`);
          console.log(`   📊 Direction: ${pattern.direction}`);
          console.log(`   💰 Entry: ${pattern.entryPrice?.toFixed(8)}`);
          console.log(`   💯 Score: ${pattern.score || 'N/A'}`);
          console.log();
        }
      }

      // Небольшая задержка чтобы не перегружать API
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.error(`❌ Error testing ${symbol}:`, error.message);
    }
  }

  console.log('\n✅ [Test] Pattern detection test completed!');
  process.exit(0);
}

// Запуск теста
testPatternDetection().catch(error => {
  console.error('❌ [Test] Fatal error:', error);
  process.exit(1);
});
