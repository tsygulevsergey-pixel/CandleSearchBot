import "dotenv/config";
import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { MCPServer } from "@mastra/mcp";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { sharedPostgresStorage } from "./storage";
import { inngest, inngestServe } from "./inngest";
import { cryptoPatternWorkflow } from "./workflows/cryptoPatternWorkflow";
import { cryptoPatternAgent } from "./agents/cryptoPatternAgent";
import { scheduler } from "../services/scheduler";
import { statisticsTool } from "./tools/statisticsTool";
import { statusTool } from "./tools/statusTool";
import { helpTool } from "./tools/helpTool";
import { telegramBot } from "../utils/telegramBot";

class ProductionPinoLogger extends MastraLogger {
  protected logger: pino.Logger;

  constructor(
    options: {
      name?: string;
      level?: LogLevel;
    } = {},
  ) {
    super(options);

    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label: string, _number: number) => ({
          level: label,
        }),
      },
      timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    });
  }

  debug(message: string, args: Record<string, any> = {}): void {
    this.logger.debug(args, message);
  }

  info(message: string, args: Record<string, any> = {}): void {
    this.logger.info(args, message);
  }

  warn(message: string, args: Record<string, any> = {}): void {
    this.logger.warn(args, message);
  }

  error(message: string, args: Record<string, any> = {}): void {
    this.logger.error(args, message);
  }
}

export const mastra = new Mastra({
  storage: sharedPostgresStorage,
  workflows: { cryptoPatternWorkflow },
  agents: { cryptoPatternAgent },
  mcpServers: {
    allTools: new MCPServer({
      name: "allTools",
      version: "1.0.0",
      tools: { statisticsTool, statusTool, helpTool },
    }),
  },
  bundler: {
    // A few dependencies are not properly picked up by
    // the bundler if they are not added directly to the
    // entrypoint.
    externals: [
      "@slack/web-api",
      "inngest",
      "inngest/hono",
      "hono",
      "hono/streaming",
    ],
    // sourcemaps are good for debugging.
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    middleware: [
      async (c, next) => {
        const mastra = c.get("mastra");
        const logger = mastra?.getLogger();
        logger?.debug("[Request]", { method: c.req.method, url: c.req.url });
        try {
          await next();
        } catch (error) {
          logger?.error("[Response]", {
            method: c.req.method,
            url: c.req.url,
            error,
          });
          if (error instanceof MastraError) {
            if (error.id === "AGENT_MEMORY_MISSING_RESOURCE_ID") {
              // This is typically a non-retirable error. It means that the request was not
              // setup correctly to pass in the necessary parameters.
              throw new NonRetriableError(error.message, { cause: error });
            }
          } else if (error instanceof z.ZodError) {
            // Validation errors are never retriable.
            throw new NonRetriableError(error.message, { cause: error });
          }

          throw error;
        }
      },
    ],
    apiRoutes: [
      {
        path: "/api/inngest",
        method: "ALL",
        createHandler: async ({ mastra }) => inngestServe({ mastra, inngest }),
      },
    ],
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({
          name: "Mastra",
          level: "info",
        })
      : new PinoLogger({
          name: "Mastra",
          level: "info",
        }),
});

/*  Sanity check 1: Throw an error if there are more than 1 workflows.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getWorkflows()).length > 1) {
  throw new Error(
    "More than 1 workflows found. Currently, more than 1 workflows are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}

/*  Sanity check 2: Throw an error if there are more than 1 agents.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getAgents()).length > 1) {
  throw new Error(
    "More than 1 agents found. Currently, more than 1 agents are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}

scheduler.start();

// Initialize Telegram bot with polling
(async () => {
  try {
    await telegramBot.setCommands();
    await telegramBot.sendStartupMessage();
    await telegramBot.startPolling();
    console.log('✅ [TelegramBot] Polling started successfully');
  } catch (error) {
    console.error('❌ [Mastra] Failed to initialize Telegram bot:', error);
  }
})();

console.log('✅ [Mastra] Crypto pattern scanner initialized successfully');

// ========================================
// АВТОМАТИЧЕСКИЙ РЕСТАРТ ПРИ ОШИБКАХ
// ========================================

// Обработчик необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('💥 [CRITICAL] Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  
  // Логируем в Telegram
  telegramBot.sendMessage(
    `🚨 КРИТИЧЕСКАЯ ОШИБКА!\n\n` +
    `Тип: uncaughtException\n` +
    `Сообщение: ${error.message}\n\n` +
    `Процесс продолжает работу...`
  ).catch(() => {});
  
  // НЕ завершаем процесс - продолжаем работу
  console.log('⚠️ [Process] Process continues running despite error');
});

// Обработчик необработанных промисов
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [CRITICAL] Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  
  // Логируем в Telegram
  telegramBot.sendMessage(
    `🚨 ОШИБКА PROMISE!\n\n` +
    `Тип: unhandledRejection\n` +
    `Причина: ${reason}\n\n` +
    `Процесс продолжает работу...`
  ).catch(() => {});
  
  // НЕ завершаем процесс
  console.log('⚠️ [Process] Process continues running despite rejection');
});

// Обработчик SIGTERM (graceful shutdown)
process.on('SIGTERM', () => {
  console.log('🛑 [Process] SIGTERM received, shutting down gracefully...');
  
  telegramBot.sendMessage('🔴 Бот остановлен (SIGTERM)').catch(() => {});
  
  // Даём время закрыть соединения
  setTimeout(() => {
    process.exit(0);
  }, 5000);
});

// Обработчик SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('🛑 [Process] SIGINT received, shutting down gracefully...');
  
  telegramBot.sendMessage('🔴 Бот остановлен (SIGINT)').catch(() => {});
  
  setTimeout(() => {
    process.exit(0);
  }, 5000);
});

console.log('✅ [Process] Error handlers initialized - bot will auto-recover from errors');
