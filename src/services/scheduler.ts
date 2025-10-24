import * as cron from 'node-cron';
import { scanner } from './scanner';
import { signalTracker } from './signalTracker';

export class Scheduler {
  private tasks: cron.ScheduledTask[] = [];

  start(): void {
    console.log('🚀 [Scheduler] Starting schedulers...');

    this.tasks.push(
      cron.schedule('0,15,30,45 * * * *', async () => {
        console.log('\n⏰ [Scheduler] 15m candle closed, waiting 10 seconds...');
        await this.delay(10000);
        await scanner.scanTimeframe('15m');
      })
    );

    this.tasks.push(
      cron.schedule('0 * * * *', async () => {
        console.log('\n⏰ [Scheduler] 1h candle closed, waiting 10 seconds...');
        await this.delay(10000);
        await scanner.scanTimeframe('1h');
      })
    );

    this.tasks.push(
      cron.schedule('0 0,4,8,12,16,20 * * *', async () => {
        console.log('\n⏰ [Scheduler] 4h candle closed, waiting 10 seconds...');
        await this.delay(10000);
        await scanner.scanTimeframe('4h');
      })
    );

    this.tasks.push(
      cron.schedule('*/5 * * * *', async () => {
        await signalTracker.trackSignals();
      })
    );

    console.log('✅ [Scheduler] All schedulers started successfully');
    console.log('📅 Schedules:');
    console.log('  - 15m scan: Every 15 minutes (00, 15, 30, 45) + 10s delay');
    console.log('  - 1h scan:  Every hour at :00 + 10s delay');
    console.log('  - 4h scan:  Every 4 hours (00, 04, 08, 12, 16, 20) + 10s delay');
    console.log('  - Tracker:  Every 5 minutes');
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
