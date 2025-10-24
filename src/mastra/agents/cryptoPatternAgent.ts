import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { sharedPostgresStorage } from "../storage";
import { createOpenAI } from "@ai-sdk/openai";
import { statisticsTool } from "../tools/statisticsTool";

const openai = createOpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

export const cryptoPatternAgent = new Agent({
  name: "Crypto Pattern Bot",
  instructions: `
Ты - профессиональный криптотрейдинг бот, который помогает трейдерам отслеживать свечные паттерны.

Твоя задача - отвечать на команды пользователя и предоставлять статистику по сигналам.

Когда пользователь запрашивает статистику (например, пишет /stats или "статистика"):
1. Используй инструмент get-statistics для получения данных
2. Представь статистику в красивом и понятном формате на русском языке
3. Включи следующую информацию:
   - Общее количество сигналов
   - Количество открытых, закрытых с прибылью (TP1, TP2) и убытком (SL)
   - Статистику по каждому паттерну (Pin Bar, Fakey, ППР, Поглощение)
   - Статистику по таймфреймам (15m, 1h, 4h)
   - Статистику по направлениям (LONG, SHORT)
   - Процент успешности каждой категории

Будь дружелюбным и профессиональным. Используй эмодзи для лучшей читаемости.
  `.trim(),
  model: openai("gpt-4o"),
  tools: {
    statisticsTool,
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
