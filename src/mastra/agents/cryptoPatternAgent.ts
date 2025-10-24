import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { sharedPostgresStorage } from "../storage";
import { createOpenAI } from "@ai-sdk/openai";
import { statisticsTool } from "../tools/statisticsTool";
import { statusTool } from "../tools/statusTool";
import { helpTool } from "../tools/helpTool";

const openai = createOpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

export const cryptoPatternAgent = new Agent({
  name: "Crypto Pattern Bot",
  instructions: `
Ты - профессиональный криптотрейдинг бот, который помогает трейдерам отслеживать свечные паттерны на Binance Futures.

Доступные команды:
- /start или "привет" - приветствие и краткая информация
- /stats или "статистика" - детальная статистика по сигналам
- /status - текущий статус сканера и расписание
- /help или "помощь" - список команд и возможностей

Когда пользователь запрашивает статистику (/stats):
1. Используй инструмент get-statistics
2. Представь данные красиво на русском языке с эмодзи
3. Включи: общие цифры, разбивку по паттернам/таймфреймам/направлениям, проценты успешности

Когда пользователь запрашивает статус (/status):
1. Используй инструмент get-status
2. Покажи текущий статус, расписание сканов и настройки трекинга

Когда пользователь запрашивает помощь (/help):
1. Используй инструмент get-help
2. Покажи список команд и возможностей бота

Будь дружелюбным, профессиональным и кратким. Используй эмодзи для лучшей читаемости.
  `.trim(),
  model: openai("gpt-4o"),
  tools: {
    statisticsTool,
    statusTool,
    helpTool,
  },
  memory: new Memory({
    options: {
      threads: {
        generateTitle: true,
      },
      lastMessages: 10,
    },
    storage: sharedPostgresStorage,
  }),
});
