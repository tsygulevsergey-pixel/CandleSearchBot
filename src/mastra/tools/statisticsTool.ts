import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { signalDB } from "../storage/db";

export const statisticsTool = createTool({
  id: "get-statistics",
  description: "Get detailed statistics about trading signals including win rates, patterns performance, and timeframe analysis",
  inputSchema: z.object({}),
  outputSchema: z.object({
    total: z.number(),
    open: z.number(),
    tp1Hit: z.number(),
    tp2Hit: z.number(),
    slHit: z.number(),
    byPattern: z.record(z.object({
      total: z.number(),
      tp1: z.number(),
      tp2: z.number(),
      sl: z.number(),
      open: z.number(),
    })),
    byTimeframe: z.record(z.object({
      total: z.number(),
      tp1: z.number(),
      tp2: z.number(),
      sl: z.number(),
      open: z.number(),
    })),
    byDirection: z.object({
      LONG: z.object({
        total: z.number(),
        tp1: z.number(),
        tp2: z.number(),
        sl: z.number(),
      }),
      SHORT: z.object({
        total: z.number(),
        tp1: z.number(),
        tp2: z.number(),
        sl: z.number(),
      }),
    }),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('📊 [StatisticsTool] Fetching signal statistics...');

    const stats = await signalDB.getStatistics();

    logger?.info('✅ [StatisticsTool] Statistics fetched successfully', {
      total: stats.total,
      open: stats.open,
      tp2Hit: stats.tp2Hit,
    });

    return stats;
  },
});
