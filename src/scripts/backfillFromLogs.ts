/**
 * Backfill pattern_score, trend_alignment, clearance_15m from log files
 * 
 * This script parses bot logs to recover missing data that was logged but not saved to DB.
 * 
 * Usage:
 *   npm run backfill-from-logs /path/to/bot.log
 * 
 * Options:
 *   --dry-run: Show what would be updated without writing to DB
 *   --log-dir: Directory containing log files (default: current directory)
 */

import { db } from '../mastra/storage/db.js';
import { signals } from '../mastra/storage/schema.js';
import { eq, and, isNull, or } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { createInterface } from 'readline';

interface ParsedSignalData {
  symbol: string;
  timestamp: Date;
  patternScore?: number;
  trendAlignment?: 'with' | 'against' | 'neutral';
  clearance15m?: number;
  slBufferAtr15?: number;
  swingExtreme?: number;
  trendDirection?: string;
  trendStrength?: number;
  ema20?: number;
  ema50?: number;
}

interface LogMatch {
  signalId?: number;
  symbol: string;
  createdAt: Date;
  data: ParsedSignalData;
}

/**
 * Parse a log line looking for 15m ML Context data
 */
function parseLogLine(line: string): ParsedSignalData | null {
  // Look for: 📊 [15m ML Context] Enriching with analysis data:
  const mlContextMatch = line.match(/📊 \[15m ML Context\] Enriching with analysis data: ({.*})/);
  
  if (!mlContextMatch) {
    return null;
  }
  
  try {
    const jsonStr = mlContextMatch[1];
    const data = JSON.parse(jsonStr);
    
    // Extract timestamp from log line (PM2 format: YYYY-MM-DD HH:MM:SS)
    const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    const timestamp = timestampMatch ? new Date(timestampMatch[1]) : new Date();
    
    // Also look for symbol in surrounding context (usually logged before)
    const symbolMatch = line.match(/symbol[:\s]+(\w+)/i) || line.match(/Processing (\w+USDT)/i);
    const symbol = symbolMatch ? symbolMatch[1] : 'UNKNOWN';
    
    return {
      symbol,
      timestamp,
      patternScore: data.patternScore,
      trendAlignment: data.trendAlignment,
      clearance15m: parseFloat(data.clearance15m),
      slBufferAtr15: parseFloat(data.slBufferAtr15),
      swingExtreme: parseFloat(data.swingExtreme),
    };
  } catch (error) {
    console.warn(`⚠️ Failed to parse JSON from log line:`, error);
    return null;
  }
}

/**
 * Parse trend data from log line
 */
function parseTrendLine(line: string): Partial<ParsedSignalData> | null {
  // Look for: 📊 [15m Trend Filter] Trend detected: UPTREND (strength: 75%)
  const trendMatch = line.match(/Trend detected: (\w+) \(strength: (\d+)%\)/);
  
  if (!trendMatch) {
    return null;
  }
  
  return {
    trendDirection: trendMatch[1],
    trendStrength: parseInt(trendMatch[2]),
  };
}

/**
 * Parse EMA data from log line
 */
function parseEMALine(line: string): Partial<ParsedSignalData> | null {
  // Look for: 📊 EMA20: 0.12345678, EMA50: 0.12340000
  const emaMatch = line.match(/EMA20: ([\d.]+), EMA50: ([\d.]+)/);
  
  if (!emaMatch) {
    return null;
  }
  
  return {
    ema20: parseFloat(emaMatch[1]),
    ema50: parseFloat(emaMatch[2]),
  };
}

/**
 * Read and parse a log file
 */
async function parseLogFile(filePath: string): Promise<ParsedSignalData[]> {
  console.log(`📖 [Parser] Reading log file: ${filePath}`);
  
  const results: ParsedSignalData[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  
  let currentContext: Partial<ParsedSignalData> = {};
  
  for await (const line of rl) {
    // Parse ML Context data (main target)
    const mlData = parseLogLine(line);
    if (mlData) {
      // Merge with current context (trend, EMA data)
      const completeData = { ...currentContext, ...mlData };
      results.push(completeData as ParsedSignalData);
      currentContext = {}; // Reset context
      continue;
    }
    
    // Parse trend data (context for next signal)
    const trendData = parseTrendLine(line);
    if (trendData) {
      currentContext = { ...currentContext, ...trendData };
    }
    
    // Parse EMA data (context for next signal)
    const emaData = parseEMALine(line);
    if (emaData) {
      currentContext = { ...currentContext, ...emaData };
    }
  }
  
  console.log(`✅ [Parser] Found ${results.length} ML context entries in ${path.basename(filePath)}`);
  return results;
}

/**
 * Match parsed log data to database signals
 */
async function matchLogsToSignals(logData: ParsedSignalData[]): Promise<LogMatch[]> {
  console.log(`\n🔍 [Matcher] Matching ${logData.length} log entries to database signals...`);
  
  // Get all 15m signals with NULL pattern_score
  const signalsToUpdate = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.timeframe, '15m'),
        or(
          isNull(signals.patternScore),
          isNull(signals.trendAlignment),
          isNull(signals.clearance15m)
        )
      )
    );
  
  console.log(`📊 [Matcher] Found ${signalsToUpdate.length} signals with missing data`);
  
  const matches: LogMatch[] = [];
  
  for (const signal of signalsToUpdate) {
    // Find log entry that matches this signal
    // Match by: symbol + timestamp (within 5 minutes)
    const signalTime = new Date(signal.createdAt).getTime();
    
    const matchingLog = logData.find(log => {
      const logTime = log.timestamp.getTime();
      const timeDiff = Math.abs(signalTime - logTime);
      const withinTimeWindow = timeDiff < 5 * 60 * 1000; // 5 minutes
      const sameSymbol = log.symbol === signal.symbol;
      
      return sameSymbol && withinTimeWindow;
    });
    
    if (matchingLog) {
      matches.push({
        signalId: signal.id,
        symbol: signal.symbol,
        createdAt: new Date(signal.createdAt),
        data: matchingLog,
      });
      console.log(`   ✅ Matched signal #${signal.id} (${signal.symbol}) to log entry`);
    } else {
      console.log(`   ⚠️ No log match for signal #${signal.id} (${signal.symbol})`);
    }
  }
  
  console.log(`\n📊 [Matcher] Successfully matched ${matches.length}/${signalsToUpdate.length} signals`);
  return matches;
}

/**
 * Main backfill function
 */
async function backfillFromLogs(options: { dryRun: boolean; logDir: string }) {
  console.log('🔄 [Backfill] Starting log-based backfill...\n');
  
  // Find all log files in directory
  const logFiles = fs.readdirSync(options.logDir)
    .filter(file => file.endsWith('.log') || file.includes('bot') || file.includes('pm2'))
    .map(file => path.join(options.logDir, file));
  
  if (logFiles.length === 0) {
    console.error('❌ No log files found in directory:', options.logDir);
    console.log('💡 Try specifying --log-dir /path/to/logs');
    return;
  }
  
  console.log(`📂 Found ${logFiles.length} log files:`);
  logFiles.forEach(file => console.log(`   - ${path.basename(file)}`));
  console.log('');
  
  // Parse all log files
  const allLogData: ParsedSignalData[] = [];
  for (const logFile of logFiles) {
    try {
      const data = await parseLogFile(logFile);
      allLogData.push(...data);
    } catch (error: any) {
      console.warn(`⚠️ Failed to parse ${path.basename(logFile)}:`, error.message);
    }
  }
  
  if (allLogData.length === 0) {
    console.error('❌ No ML context data found in log files');
    console.log('💡 Make sure logs contain lines like: 📊 [15m ML Context] Enriching...');
    return;
  }
  
  // Match log data to signals
  const matches = await matchLogsToSignals(allLogData);
  
  if (matches.length === 0) {
    console.error('❌ No matches found between logs and database signals');
    return;
  }
  
  // Update database
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN MODE - would update the following signals:\n');
  } else {
    console.log('\n💾 Updating database...\n');
  }
  
  let updated = 0;
  let failed = 0;
  
  for (const match of matches) {
    if (!match.signalId) continue;
    
    const updates: any = {};
    
    if (match.data.patternScore !== undefined) {
      updates.patternScore = match.data.patternScore.toString();
    }
    if (match.data.trendAlignment) {
      updates.trendAlignment = match.data.trendAlignment;
    }
    if (match.data.clearance15m !== undefined) {
      updates.clearance15m = match.data.clearance15m.toString();
    }
    if (match.data.slBufferAtr15 !== undefined) {
      updates.slBufferAtr15 = match.data.slBufferAtr15.toString();
    }
    if (match.data.swingExtreme !== undefined) {
      updates.swingExtremePrice = match.data.swingExtreme.toString();
    }
    
    if (Object.keys(updates).length === 0) {
      console.log(`⚠️ Signal #${match.signalId}: No data to update`);
      continue;
    }
    
    if (options.dryRun) {
      console.log(`🔍 Signal #${match.signalId} (${match.symbol}):`, updates);
      updated++;
    } else {
      try {
        await db
          .update(signals)
          .set(updates)
          .where(eq(signals.id, match.signalId));
        
        console.log(`✅ Signal #${match.signalId} (${match.symbol}) updated`);
        updated++;
      } catch (error: any) {
        console.error(`❌ Failed to update signal #${match.signalId}:`, error.message);
        failed++;
      }
    }
  }
  
  console.log('\n✅ Backfill complete!');
  console.log(`📊 Summary:`);
  console.log(`   Logs parsed: ${logFiles.length} files`);
  console.log(`   ML contexts found: ${allLogData.length}`);
  console.log(`   Signals matched: ${matches.length}`);
  console.log(`   Successfully updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  
  if (options.dryRun) {
    console.log('\n🔍 This was a DRY RUN - no changes were written to DB');
    console.log('💡 Run without --dry-run to apply changes');
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const logDirIndex = args.indexOf('--log-dir');
const logDir = logDirIndex >= 0 ? args[logDirIndex + 1] : process.cwd();

// Run backfill
backfillFromLogs({ dryRun, logDir })
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
