/**
 * Shadow Evaluation Service
 * 
 * Tracks virtual positions for sampled near-miss SKIPs
 * Runs every 1 minute to update tracking_1m_shadow and check for TP/SL hits
 */

import { shadowEvaluationDB, tracking1mShadowDB, nearMissSkipDB } from '../mastra/storage/db';
import { binanceClient } from '../utils/binanceClient';

export class ShadowEvaluationService {
  private intervalMs: number = 60 * 1000; // 1 minute
  private intervalId: NodeJS.Timeout | null = null;
  
  /**
   * Start shadow evaluation tracking
   */
  start() {
    if (this.intervalId) {
      console.log('⚠️ [ShadowEval] Service already running');
      return;
    }
    
    console.log('🎯 [ShadowEval] Starting shadow evaluation service (1min interval)');
    
    // Run immediately
    this.processActiveShadowEvaluations();
    
    // Then run every minute
    this.intervalId = setInterval(() => {
      this.processActiveShadowEvaluations();
    }, this.intervalMs);
  }
  
  /**
   * Stop shadow evaluation tracking
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 [ShadowEval] Stopped shadow evaluation service');
    }
  }
  
  /**
   * Process all active shadow evaluations
   */
  private async processActiveShadowEvaluations() {
    try {
      console.log('🔄 [ShadowEval] Processing active shadow evaluations...');
      
      // Get all active shadow evaluations
      const activeShadows = await shadowEvaluationDB.getActiveShadowEvaluations();
      
      if (activeShadows.length === 0) {
        console.log('✅ [ShadowEval] No active shadow evaluations');
        return;
      }
      
      console.log(`📊 [ShadowEval] Processing ${activeShadows.length} active shadow evaluations`);
      
      // Process each shadow evaluation
      for (const shadow of activeShadows) {
        await this.processShadowEvaluation(shadow);
      }
      
      console.log(`✅ [ShadowEval] Completed processing ${activeShadows.length} shadow evaluations`);
    } catch (error: any) {
      console.error('❌ [ShadowEval] Error processing shadow evaluations:', error.message);
    }
  }
  
  /**
   * Process a single shadow evaluation
   */
  private async processShadowEvaluation(shadow: any) {
    try {
      // Get near-miss skip record for context
      const skip = await nearMissSkipDB.getNearMissSkipBySignalId(shadow.signalId);
      
      if (!skip) {
        console.error(`❌ [ShadowEval] Skip record not found for shadow ${shadow.id}`);
        return;
      }
      
      // Get current price from Binance
      const symbol = skip.symbol;
      const currentPrice = await this.getCurrentPrice(symbol);
      
      if (!currentPrice) {
        console.error(`❌ [ShadowEval] Failed to get current price for ${symbol}`);
        return;
      }
      
      // Calculate virtual position metrics
      const entryPrice = parseFloat(shadow.hypotheticalEntryPrice);
      const direction = skip.side;
      
      // Calculate SL/TP - use simple 1% risk as fallback to avoid division-by-zero
      // TODO: Store candidateSL in near_miss_skips for accurate SL/TP
      const riskPts = entryPrice * 0.01; // Simple 1% risk as safe fallback
      
      let slPrice: number;
      let tp1Price: number;
      
      if (direction === 'LONG') {
        slPrice = entryPrice - riskPts;
        tp1Price = entryPrice + (riskPts * 2); // 2R TP
      } else {
        slPrice = entryPrice + riskPts;
        tp1Price = entryPrice - (riskPts * 2);
      }
      
      // Calculate MFE and MAE
      const priceDiff = currentPrice - entryPrice;
      const priceDiffR = priceDiff / riskPts;
      
      let currentMFE = shadow.currentMfe ? parseFloat(shadow.currentMfe) : 0;
      let currentMAE = shadow.currentMae ? parseFloat(shadow.currentMae) : 0;
      
      if (direction === 'LONG') {
        currentMFE = Math.max(currentMFE, priceDiffR); // Max favorable
        currentMAE = Math.min(currentMAE, priceDiffR); // Min adverse (most negative)
      } else {
        currentMFE = Math.max(currentMFE, -priceDiffR); // Max favorable (price went down)
        currentMAE = Math.min(currentMAE, -priceDiffR); // Min adverse
      }
      
      // Check for TP/SL hits
      let hitEvent: 'tp1' | 'sl' | null = null;
      let shouldClose = false;
      
      if (direction === 'LONG') {
        if (currentPrice >= tp1Price) {
          hitEvent = 'tp1';
          shouldClose = true;
        } else if (currentPrice <= slPrice) {
          hitEvent = 'sl';
          shouldClose = true;
        }
      } else {
        if (currentPrice <= tp1Price) {
          hitEvent = 'tp1';
          shouldClose = true;
        } else if (currentPrice >= slPrice) {
          hitEvent = 'sl';
          shouldClose = true;
        }
      }
      
      // Record 1m snapshot
      await tracking1mShadowDB.createTracking1mShadow({
        shadowEvalId: shadow.id,
        bar1mTs: new Date(),
        high: currentPrice.toString(),
        low: currentPrice.toString(),
      });
      
      // Update shadow evaluation with current MFE/MAE
      await shadowEvaluationDB.updateShadowEvaluation(shadow.id, {
        currentMfe: currentMFE.toFixed(4),
        currentMae: currentMAE.toFixed(4),
      });
      
      // If TP/SL hit - close shadow evaluation
      if (shouldClose) {
        const timeToHitMin = Math.floor(
          (Date.now() - new Date(shadow.hypotheticalEntryTime).getTime()) / (1000 * 60)
        );
        
        const finalPnlR = hitEvent === 'tp1' ? 2.0 : -1.0; // Simplified: 2R win or 1R loss
        
        await shadowEvaluationDB.closeShadowEvaluation(shadow.id, {
          finalPnlR: finalPnlR.toFixed(4),
          finalMfe: currentMFE.toFixed(4),
          finalMae: currentMAE.toFixed(4),
          firstTouch: hitEvent || 'timeout',
          timeToFirstTouchMin: timeToHitMin,
        });
        
        console.log(`🎯 [ShadowEval] Shadow ${shadow.id} closed: ${hitEvent} hit after ${timeToHitMin}min (PnL: ${finalPnlR.toFixed(2)}R)`);
      }
    } catch (error: any) {
      console.error(`❌ [ShadowEval] Error processing shadow ${shadow.id}:`, error.message);
    }
  }
  
  /**
   * Get current price for a symbol
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const klines = await binanceClient.getKlines(symbol, '1m', 1);
      if (klines.length === 0) return null;
      
      return parseFloat(klines[0].close);
    } catch (error: any) {
      console.error(`❌ [ShadowEval] Error fetching price for ${symbol}:`, error.message);
      return null;
    }
  }
}

// Export singleton instance
export const shadowEvaluationService = new ShadowEvaluationService();
