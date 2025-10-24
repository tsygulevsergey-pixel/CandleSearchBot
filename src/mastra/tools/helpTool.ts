import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const helpTool = createTool({
  id: "get-help",
  description: "Get help information about bot commands and features",
  inputSchema: z.object({}),
  outputSchema: z.object({
    commands: z.array(z.object({
      command: z.string(),
      description: z.string(),
    })),
    features: z.array(z.string()),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('❓ [HelpTool] Getting help information...');

    return {
      commands: [
        { command: "/start", description: "Запустить бота и получить приветствие" },
        { command: "/stats", description: "Статистика по всем сигналам (паттерны, направления, таймфреймы)" },
        { command: "/status", description: "Текущий статус сканера и расписание" },
        { command: "/help", description: "Список команд и возможностей" },
      ],
      features: [
        "🔍 Автоматическое сканирование 4 паттернов: Pin Bar, Fakey, ППР, Engulfing",
        "⏱ Мониторинг 3 таймфреймов: 15m, 1h, 4h",
        "📊 Только USDT пары с объемом >20M",
        "🎯 Автоматический расчет Entry, SL, TP1 (1R), TP2 (2R)",
        "🔄 Перенос SL в breakeven после достижения TP1",
        "📱 Мгновенные уведомления о новых паттернах и срабатываниях",
        "📈 Детальная статистика по всем сигналам",
      ],
    };
  },
});
