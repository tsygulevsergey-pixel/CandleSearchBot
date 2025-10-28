/**
 * Parquet Export Service
 * 
 * Exports ML logging data to Parquet format for offline analysis
 * Runs daily to export near_miss_skips, shadow_evaluations, and signals
 */

import * as fs from 'fs';
import * as path from 'path';
import { nearMissSkipDB, shadowEvaluationDB, signalDB, parquetExportDB } from '../mastra/storage/db';

export class ParquetExportService {
  private exportDir: string = './ml_exports';
  
  /**
   * Export all data for a given date
   */
  async exportDate(date: string): Promise<void> {
    console.log(`📦 [ParquetExport] Starting export for ${date}...`);
    
    // Create export directory if not exists
    this.ensureExportDir();
    
    // Check if already exported
    const hasNearMissExport = await parquetExportDB.hasExportForDate(date, 'near_miss_skips');
    const hasShadowExport = await parquetExportDB.hasExportForDate(date, 'shadow_evaluations');
    const hasSignalsExport = await parquetExportDB.hasExportForDate(date, 'signals');
    
    // Export near-miss skips
    if (!hasNearMissExport) {
      await this.exportNearMissSkips(date);
    } else {
      console.log(`✅ [ParquetExport] Near-miss skips already exported for ${date}`);
    }
    
    // Export shadow evaluations
    if (!hasShadowExport) {
      await this.exportShadowEvaluations(date);
    } else {
      console.log(`✅ [ParquetExport] Shadow evaluations already exported for ${date}`);
    }
    
    // Export signals (TODO: implement signals export)
    // if (!hasSignalsExport) {
    //   await this.exportSignals(date);
    // } else {
    //   console.log(`✅ [ParquetExport] Signals already exported for ${date}`);
    // }
    
    console.log(`✅ [ParquetExport] Export completed for ${date}`);
  }
  
  /**
   * Export near-miss skips
   */
  private async exportNearMissSkips(date: string): Promise<void> {
    try {
      console.log(`📊 [ParquetExport] Exporting near-miss skips for ${date}...`);
      
      const skips = await nearMissSkipDB.getNearMissSkipsByDate(date);
      
      if (skips.length === 0) {
        console.log(`⏭️ [ParquetExport] No near-miss skips for ${date}`);
        return;
      }
      
      // Create date-partitioned directory
      const exportPath = path.join(this.exportDir, 'near_miss', `date=${date}`);
      fs.mkdirSync(exportPath, { recursive: true });
      
      // Export as JSON for now (TODO: convert to Parquet format using apache-arrow)
      const jsonPath = path.join(exportPath, 'data.json');
      fs.writeFileSync(jsonPath, JSON.stringify(skips, null, 2));
      
      // Record export
      await parquetExportDB.recordExport({
        exportDate: date,
        exportType: 'near_miss_skips',
        recordCount: skips.length,
        filePath: jsonPath,
      });
      
      console.log(`✅ [ParquetExport] Exported ${skips.length} near-miss skips to ${jsonPath}`);
    } catch (error: any) {
      console.error(`❌ [ParquetExport] Error exporting near-miss skips:`, error.message);
    }
  }
  
  /**
   * Export shadow evaluations
   */
  private async exportShadowEvaluations(date: string): Promise<void> {
    try {
      console.log(`📊 [ParquetExport] Exporting shadow evaluations for ${date}...`);
      
      const evaluations = await shadowEvaluationDB.getShadowEvaluationsByDate(date);
      
      if (evaluations.length === 0) {
        console.log(`⏭️ [ParquetExport] No shadow evaluations for ${date}`);
        return;
      }
      
      // Create date-partitioned directory
      const exportPath = path.join(this.exportDir, 'shadow', `date=${date}`);
      fs.mkdirSync(exportPath, { recursive: true });
      
      // Export as JSON for now (TODO: convert to Parquet format using apache-arrow)
      const jsonPath = path.join(exportPath, 'data.json');
      fs.writeFileSync(jsonPath, JSON.stringify(evaluations, null, 2));
      
      // Record export
      await parquetExportDB.recordExport({
        exportDate: date,
        exportType: 'shadow_evaluations',
        recordCount: evaluations.length,
        filePath: jsonPath,
      });
      
      console.log(`✅ [ParquetExport] Exported ${evaluations.length} shadow evaluations to ${jsonPath}`);
    } catch (error: any) {
      console.error(`❌ [ParquetExport] Error exporting shadow evaluations:`, error.message);
    }
  }
  
  /**
   * Export signals (entered trades)
   */
  private async exportSignals(date: string): Promise<void> {
    try {
      console.log(`📊 [ParquetExport] Exporting signals for ${date}...`);
      
      // Get signals for date (TODO: add date filter to signalDB)
      const signals = await signalDB.getAllSignals();
      const signalsForDate = signals.filter((s: any) => {
        const createdDate = new Date(s.createdAt).toISOString().split('T')[0];
        return createdDate === date;
      });
      
      if (signalsForDate.length === 0) {
        console.log(`⏭️ [ParquetExport] No signals for ${date}`);
        return;
      }
      
      // Create date-partitioned directory
      const exportPath = path.join(this.exportDir, 'trades', `date=${date}`);
      fs.mkdirSync(exportPath, { recursive: true });
      
      // Export as JSON for now (TODO: convert to Parquet format using apache-arrow)
      const jsonPath = path.join(exportPath, 'data.json');
      fs.writeFileSync(jsonPath, JSON.stringify(signalsForDate, null, 2));
      
      // Record export
      await parquetExportDB.recordExport({
        exportDate: date,
        exportType: 'signals',
        recordCount: signalsForDate.length,
        filePath: jsonPath,
      });
      
      console.log(`✅ [ParquetExport] Exported ${signalsForDate.length} signals to ${jsonPath}`);
    } catch (error: any) {
      console.error(`❌ [ParquetExport] Error exporting signals:`, error.message);
    }
  }
  
  /**
   * Ensure export directory exists
   */
  private ensureExportDir(): void {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
      console.log(`📁 [ParquetExport] Created export directory: ${this.exportDir}`);
    }
  }
  
  /**
   * Export yesterday's data (for daily cron job)
   */
  async exportYesterday(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    await this.exportDate(dateStr);
  }
}

// Export singleton instance
export const parquetExportService = new ParquetExportService();
