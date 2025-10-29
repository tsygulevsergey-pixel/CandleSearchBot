/**
 * Zone Test Tracker Service
 * Tracks how many times price tested each zone in the last 24 hours.
 * Used for zone "freshness" filtering in dynamic S/R system.
 */

import type { Zone } from '../utils/indicators/standardPlan';

interface ZoneTouch {
  symbol: string;
  zoneId: string; // Composite key: type_tf_low_high
  timestamp: Date;
}

class ZoneTestTracker {
  private touches: ZoneTouch[] = [];
  private cleanupIntervalMs = 1000 * 60 * 60; // Cleanup every hour
  private maxAgeMs = 1000 * 60 * 60 * 24; // Keep touches for 24h
  
  constructor() {
    // Auto-cleanup old touches every hour
    setInterval(() => this.cleanup(), this.cleanupIntervalMs);
  }
  
  /**
   * Generate unique zone ID from zone properties
   */
  private getZoneId(zone: Zone): string {
    // Round to 8 decimals to avoid floating point issues
    const low = zone.low.toFixed(8);
    const high = zone.high.toFixed(8);
    return `${zone.type}_${zone.tf}_${low}_${high}`;
  }
  
  /**
   * Check if price is touching/inside a zone
   */
  private isTouchingZone(price: number, zone: Zone, atr15m: number): boolean {
    const tolerance = 0.1 * atr15m; // 0.1 ATR tolerance
    return price >= (zone.low - tolerance) && price <= (zone.high + tolerance);
  }
  
  /**
   * Record that price tested a zone
   */
  recordZoneTouch(symbol: string, zone: Zone): void {
    const zoneId = this.getZoneId(zone);
    const touch: ZoneTouch = {
      symbol,
      zoneId,
      timestamp: new Date(),
    };
    
    this.touches.push(touch);
  }
  
  /**
   * Record touches for all zones that price is currently testing
   */
  recordCurrentTouches(symbol: string, price: number, zones: Zone[], atr15m: number): void {
    for (const zone of zones) {
      if (this.isTouchingZone(price, zone, atr15m)) {
        // Check if we already recorded a touch for this zone in last 15 minutes
        // (to avoid duplicate touches on same bar cluster)
        const recentTouch = this.getRecentTouch(symbol, zone, 15);
        if (!recentTouch) {
          this.recordZoneTouch(symbol, zone);
        }
      }
    }
  }
  
  /**
   * Get most recent touch for a zone (if any)
   */
  private getRecentTouch(symbol: string, zone: Zone, lastMinutes: number): ZoneTouch | undefined {
    const zoneId = this.getZoneId(zone);
    const cutoff = Date.now() - (lastMinutes * 60 * 1000);
    
    return this.touches.find(t => 
      t.symbol === symbol &&
      t.zoneId === zoneId &&
      t.timestamp.getTime() >= cutoff
    );
  }
  
  /**
   * Get number of times zone was tested in last N hours
   */
  getZoneTestCount(symbol: string, zone: Zone, lastHours: number = 24): number {
    const zoneId = this.getZoneId(zone);
    const cutoff = Date.now() - (lastHours * 60 * 60 * 1000);
    
    return this.touches.filter(t =>
      t.symbol === symbol &&
      t.zoneId === zoneId &&
      t.timestamp.getTime() >= cutoff
    ).length;
  }
  
  /**
   * Get test count for the active zone being traded from
   */
  getActiveZoneTestCount(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    zones: Zone[],
    lastHours: number = 24
  ): number {
    // For LONG: count tests of 15m support zone
    // For SHORT: count tests of 15m resistance zone
    const activeZone = zones.find(z => 
      z.tf === '15m' && 
      z.type === (direction === 'LONG' ? 'support' : 'resistance')
    );
    
    if (!activeZone) return 0;
    
    return this.getZoneTestCount(symbol, activeZone, lastHours);
  }
  
  /**
   * Remove touches older than maxAgeMs
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.maxAgeMs;
    const before = this.touches.length;
    
    this.touches = this.touches.filter(t => t.timestamp.getTime() >= cutoff);
    
    const removed = before - this.touches.length;
    if (removed > 0) {
      console.log(`[ZoneTestTracker] Cleaned up ${removed} old zone touches`);
    }
  }
  
  /**
   * Get stats for debugging
   */
  getStats(): { totalTouches: number; oldestTouch: Date | null; newestTouch: Date | null } {
    if (this.touches.length === 0) {
      return { totalTouches: 0, oldestTouch: null, newestTouch: null };
    }
    
    const timestamps = this.touches.map(t => t.timestamp.getTime());
    return {
      totalTouches: this.touches.length,
      oldestTouch: new Date(Math.min(...timestamps)),
      newestTouch: new Date(Math.max(...timestamps)),
    };
  }
}

// Singleton instance
export const zoneTestTracker = new ZoneTestTracker();
