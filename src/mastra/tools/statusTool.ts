import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const statusTool = createTool({
  id: "get-status",
  description: "Get current scanner status and configuration",
  inputSchema: z.object({}),
  outputSchema: z.object({
    status: z.string(),
    schedules: z.array(z.string()),
    tracking: z.string(),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('📈 [StatusTool] Getting scanner status...');

    return {
      status: "🟢 Активен",
      schedules: [
        "15m: каждые 15 минут (00, 15, 30, 45) + 10сек",
        "1h: каждый час (XX:00) + 10сек",
        "4h: каждые 4 часа (00, 04, 08, 12, 16, 20) + 10сек"
      ],
      tracking: "Каждые 5 минут (автоматический перенос SL в breakeven после TP1)"
    };
  },
});
