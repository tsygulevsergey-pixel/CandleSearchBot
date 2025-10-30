import * as cron from 'node-cron';
import { scanner } from './scanner';
import { signalTracker } from './signalTracker';

export class Scheduler {
  private tasks: cron.ScheduledTask[] = [];

  start(): void {
    console.log('🚀 [Scheduler] Starting schedulers...');

    this.tasks.push(
      cron.schedule('0,15,30,45 * * * *', async () => {
        try {
          console.log('\n⏰ [Scheduler] 15m candle closed, waiting 10 seconds...');
          await this.delay(10000);
          console.log('🚀 [Scheduler] Starting 15m scan...');
          await scanner.scanTimeframe('15m');
          console.log('✅ [Scheduler] 15m scan completed');
        } catch (error: any) {
          console.error('❌ [Scheduler] 15m scan failed:', error.message);
          console.error(error.stack);
        }
      })
    );

    this.tasks.push(
      cron.schedule('0 * * * *', async () => {
        try {
          console.log('\n⏰ [Scheduler] 1h candle closed, waiting 10 seconds...');
          await this.delay(10000);
          console.log('🚀 [Scheduler] Starting 1h scan...');
          await scanner.scanTimeframe('1h');
          console.log('✅ [Scheduler] 1h scan completed');
        } catch (error: any) {
          console.error('❌ [Scheduler] 1h scan failed:', error.message);
          console.error(error.stack);
        }
      })
    );

    this.tasks.push(
      cron.schedule('0 0,4,8,12,16,20 * * *', async () => {
        try {
          console.log('\n⏰ [Scheduler] 4h candle closed, waiting 10 seconds...');
          await this.delay(10000);
          console.log('🚀 [Scheduler] Starting 4h scan...');
          await scanner.scanTimeframe('4h');
          console.log('✅ [Scheduler] 4h scan completed');
        } catch (error: any) {
          console.error('❌ [Scheduler] 4h scan failed:', error.message);
          console.error(error.stack);
        }
      })
    );

    this.tasks.push(
      cron.schedule('* * * * *', async () => {
        try {
          await signalTracker.trackSignals();
        } catch (error: any) {
          console.error('❌ [Scheduler] Signal tracker failed:', error.message);
          console.error(error.stack);
        }
      })
    );

    console.log('✅ [Scheduler] All schedulers started successfully');
    console.log('📅 Schedules:');
    console.log('  - 15m scan: Every 15 minutes (00, 15, 30, 45) + 10s delay');
    console.log('  - 1h scan:  Every hour at :00 + 10s delay');
    console.log('  - 4h scan:  Every 4 hours (00, 04, 08, 12, 16, 20) + 10s delay');
    console.log('  - Tracker:  Every 1 minute (improved accuracy)');
  }

  stop(): void {
    console.log('🛑 [Scheduler] Stopping all schedulers...');
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    console.log('✅ [Scheduler] All schedulers stopped');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const scheduler = new Scheduler();
