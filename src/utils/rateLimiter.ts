export class BinanceRateLimiter {
  private weightUsed: number = 0;
  private weightLimit: number = 1200;
  private lastResetTime: number = Date.now();
  private requestQueue: Array<() => void> = [];
  private isProcessing: boolean = false;

  constructor(weightLimit: number = 1200) {
    this.weightLimit = weightLimit;
  }

  private getCurrentMinute(): number {
    return Math.floor(Date.now() / 60000) * 60000;
  }

  private resetIfNeeded(): void {
    const currentMinute = this.getCurrentMinute();
    const lastResetMinute = Math.floor(this.lastResetTime / 60000) * 60000;

    if (currentMinute > lastResetMinute) {
      console.log(`⏰ [RateLimiter] Resetting weight counter at ${new Date(currentMinute).toISOString()}`);
      this.weightUsed = 0;
      this.lastResetTime = currentMinute;
    }
  }

  async waitForNextMinute(): Promise<void> {
    const now = Date.now();
    const currentMinute = this.getCurrentMinute();
    const nextMinute = currentMinute + 60000;
    const waitTime = nextMinute - now;

    console.log(`⏸️ [RateLimiter] Waiting ${waitTime}ms until next minute reset (${new Date(nextMinute).toISOString()})`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    this.resetIfNeeded();
  }

  updateWeightFromResponse(headers: any): void {
    const usedWeight = headers['x-mbx-used-weight'] || headers['x-mbx-used-weight-1m'];
    if (usedWeight) {
      const newWeight = parseInt(usedWeight, 10);
      console.log(`📊 [RateLimiter] Binance reports weight used: ${newWeight}/${this.weightLimit}`);
      this.weightUsed = newWeight;
    }
  }

  canMakeRequest(requestWeight: number): boolean {
    this.resetIfNeeded();
    const wouldExceed = (this.weightUsed + requestWeight) > this.weightLimit;
    
    if (wouldExceed) {
      console.log(`⚠️ [RateLimiter] Would exceed limit: ${this.weightUsed + requestWeight}/${this.weightLimit}`);
    } else {
      console.log(`✅ [RateLimiter] Request allowed: ${this.weightUsed + requestWeight}/${this.weightLimit}`);
    }
    
    return !wouldExceed;
  }

  async executeRequest<T>(requestWeight: number, requestFn: () => Promise<T>): Promise<T> {
    this.resetIfNeeded();

    while (!this.canMakeRequest(requestWeight)) {
      await this.waitForNextMinute();
    }

    this.weightUsed += requestWeight;
    console.log(`🚀 [RateLimiter] Executing request (weight: ${requestWeight}, total: ${this.weightUsed}/${this.weightLimit})`);

    try {
      const result = await requestFn();
      return result;
    } catch (error: any) {
      if (error.response?.status === 429) {
        console.error('🚨 [RateLimiter] Hit rate limit! Waiting for next minute...');
        this.weightUsed = this.weightLimit;
        await this.waitForNextMinute();
        return this.executeRequest(requestWeight, requestFn);
      }
      throw error;
    }
  }

  getStatus(): { weightUsed: number; weightLimit: number; percentage: number } {
    this.resetIfNeeded();
    return {
      weightUsed: this.weightUsed,
      weightLimit: this.weightLimit,
      percentage: (this.weightUsed / this.weightLimit) * 100,
    };
  }
}

export const binanceRateLimiter = new BinanceRateLimiter();
