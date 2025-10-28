/**
 * Standard Plan Calculator
 * 
 * Calculates standardized SL/TP levels for fair comparison
 * Used to compute free_path_R for both ENTER and SKIP signals
 */

export interface Zone {
  type: 'support' | 'resistance';
  low: number;
  high: number;
  tf: '15m' | '1h' | '4h';
  touches?: number; // Optional: number of touches (from S/R analysis)
  strength?: string; // Optional: zone strength
}

export interface StandardPlanInput {
  entryPrice: number;
  direction: 'LONG' | 'SHORT';
  zones: Zone[]; // All nearby zones (15m, 1h, 4h)
  atr15m: number;
  atr4h: number;
  patternExtreme: number; // Pattern high/low (C0 or C1 for PPR)
  inH4Zone: boolean;
  nearH4Zone: boolean;
  h4ZoneEdge?: number; // H4 zone boundary if in/near zone
}

export interface StandardPlanOutput {
  candidateSL: number;
  candidateTP1: number;
  candidateTP2: number;
  riskR: number; // Entry to SL distance
  freePathR: number; // Entry to nearest opposing 15m zone in R units
  freePathPts: number; // In price points
  freePathAtr15: number; // In ATR15 units
  slMode: 'htf_anchor' | 'swing_priority';
}

/**
 * Calculate standard plan for a signal
 */
export function calculateStandardPlan(input: StandardPlanInput): StandardPlanOutput {
  const { 
    entryPrice, 
    direction, 
    zones, 
    atr15m, 
    atr4h,
    patternExtreme, 
    inH4Zone, 
    nearH4Zone, 
    h4ZoneEdge 
  } = input;
  
  let candidateSL: number;
  let slMode: 'htf_anchor' | 'swing_priority';
  
  // --- SL Calculation ---
  // If inside/near HTF zone (H1/H4): use htf_anchor
  // Else: use swing_priority
  
  if ((inH4Zone || nearH4Zone) && h4ZoneEdge !== undefined) {
    // HTF Anchor mode
    slMode = 'htf_anchor';
    const buffer = 0.35 * atr15m; // Standard buffer for HTF anchor
    
    if (direction === 'LONG') {
      // SL below H4 support zone
      candidateSL = h4ZoneEdge - buffer;
    } else {
      // SL above H4 resistance zone
      candidateSL = h4ZoneEdge + buffer;
    }
  } else {
    // Swing Priority mode
    slMode = 'swing_priority';
    const buffer = 0.30 * atr15m; // Standard buffer for swing
    
    if (direction === 'LONG') {
      // SL below pattern low
      candidateSL = patternExtreme - buffer;
    } else {
      // SL above pattern high
      candidateSL = patternExtreme + buffer;
    }
  }
  
  // Risk in price points
  const riskPts = Math.abs(entryPrice - candidateSL);
  const riskR = 1.0; // By definition, risk = 1R
  
  // --- TP Calculation ---
  
  // TP1: Nearest 15m opposing zone OR 1R (whichever is closer)
  const opposing15mZones = zones.filter(z => {
    if (direction === 'LONG') {
      return z.type === 'resistance' && z.tf === '15m' && z.low > entryPrice;
    } else {
      return z.type === 'support' && z.tf === '15m' && z.high < entryPrice;
    }
  }).sort((a, b) => {
    if (direction === 'LONG') {
      return a.low - b.low; // Closest resistance
    } else {
      return b.high - a.high; // Closest support
    }
  });
  
  const tp1_1R = direction === 'LONG' 
    ? entryPrice + riskPts 
    : entryPrice - riskPts;
  
  let candidateTP1: number;
  if (opposing15mZones.length > 0) {
    const nearestZonePrice = direction === 'LONG' 
      ? opposing15mZones[0].low 
      : opposing15mZones[0].high;
    
    // Take minimum distance (closest to entry)
    candidateTP1 = direction === 'LONG'
      ? Math.min(tp1_1R, nearestZonePrice)
      : Math.max(tp1_1R, nearestZonePrice);
  } else {
    candidateTP1 = tp1_1R;
  }
  
  // TP2: Nearest 1h opposing zone OR 2R (whichever is closer)
  const opposing1hZones = zones.filter(z => {
    if (direction === 'LONG') {
      return z.type === 'resistance' && z.tf === '1h' && z.low > entryPrice;
    } else {
      return z.type === 'support' && z.tf === '1h' && z.high < entryPrice;
    }
  }).sort((a, b) => {
    if (direction === 'LONG') {
      return a.low - b.low;
    } else {
      return b.high - a.high;
    }
  });
  
  const tp2_2R = direction === 'LONG' 
    ? entryPrice + (2 * riskPts) 
    : entryPrice - (2 * riskPts);
  
  let candidateTP2: number;
  if (opposing1hZones.length > 0) {
    const nearestZonePrice = direction === 'LONG' 
      ? opposing1hZones[0].low 
      : opposing1hZones[0].high;
    
    candidateTP2 = direction === 'LONG'
      ? Math.min(tp2_2R, nearestZonePrice)
      : Math.max(tp2_2R, nearestZonePrice);
  } else {
    candidateTP2 = tp2_2R;
  }
  
  // --- Free Path Calculation ---
  // Distance from entry to nearest opposing 15m zone
  let freePathPts: number;
  
  if (opposing15mZones.length > 0) {
    const nearestZoneEdge = direction === 'LONG' 
      ? opposing15mZones[0].low 
      : opposing15mZones[0].high;
    
    freePathPts = Math.abs(nearestZoneEdge - entryPrice);
  } else {
    // No opposing zone found - assume very large free path
    freePathPts = 10 * riskPts; // Placeholder: 10R
  }
  
  const freePathAtr15 = freePathPts / atr15m;
  const freePathR = freePathPts / riskPts;
  
  return {
    candidateSL,
    candidateTP1,
    candidateTP2,
    riskR,
    freePathR,
    freePathPts,
    freePathAtr15,
    slMode,
  };
}

/**
 * Get nearest opposing zone edge
 * Helper for quick free path calculation
 */
export function getNearestOpposingZone(
  entryPrice: number,
  direction: 'LONG' | 'SHORT',
  zones: Zone[],
  timeframe: '15m' | '1h' | '4h'
): number | null {
  const opposingZones = zones.filter(z => {
    if (direction === 'LONG') {
      return z.type === 'resistance' && z.tf === timeframe && z.low > entryPrice;
    } else {
      return z.type === 'support' && z.tf === timeframe && z.high < entryPrice;
    }
  }).sort((a, b) => {
    if (direction === 'LONG') {
      return a.low - b.low;
    } else {
      return b.high - a.high;
    }
  });
  
  if (opposingZones.length === 0) return null;
  
  return direction === 'LONG' 
    ? opposingZones[0].low 
    : opposingZones[0].high;
}
