import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { cryptoPatternAgent } from "../agents/cryptoPatternAgent";
import axios from "axios";

const useAgent = createStep({
  id: "use-agent",
  description: "Process message using crypto pattern agent",
  inputSchema: z.object({
    message: z.string(),
    threadId: z.string(),
  }),
  outputSchema: z.object({
    response: z.string(),
    chatId: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('🤖 [Workflow] Using agent to process message', {
      message: inputData.message.substring(0, 100),
    });

    const parsedPayload = JSON.parse(inputData.message);
    const userMessage = parsedPayload.message?.text || parsedPayload.message?.caption || '';
    const chatId = parsedPayload.message?.chat?.id?.toString() || '';

    const { text } = await cryptoPatternAgent.generate([
      { role: "user", content: userMessage }
    ], {
      resourceId: "bot",
      threadId: inputData.threadId,
      maxSteps: 5,
    });

    logger?.info('✅ [Workflow] Agent response generated', {
      responseLength: text.length,
    });

    return {
      response: text,
      chatId,
    };
  },
});

const sendReply = createStep({
  id: "send-reply",
  description: "Send reply to Telegram",
  inputSchema: z.object({
    response: z.string(),
    chatId: z.string(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info('📤 [Workflow] Sending reply to Telegram', {
      chatId: inputData.chatId,
    });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      logger?.warn('⚠️ [Workflow] TELEGRAM_BOT_TOKEN not configured');
      return { sent: false };
    }

    try {
      await axios.post(`https://api.telegram.com/bot${botToken}/sendMessage`, {
        chat_id: inputData.chatId,
        text: inputData.response,
        parse_mode: 'HTML',
      });

      logger?.info('✅ [Workflow] Reply sent successfully');
      return { sent: true };
    } catch (error: any) {
      logger?.error('❌ [Workflow] Failed to send reply', {
        error: error.message,
      });
      return { sent: false };
    }
  },
});

export const cryptoPatternWorkflow = createWorkflow({
  id: "crypto-pattern-workflow",
  inputSchema: z.object({
    message: z.string(),
    threadId: z.string(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
  }),
})
  .then(useAgent)
  .then(sendReply)
  .commit();
