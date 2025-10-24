import axios from 'axios';
import { signalDB } from '../mastra/storage/db';

export class TelegramBot {
  private botToken: string;
  private chatId: string;
  private offset: number = 0;
  private isPolling: boolean = false;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
  }

  async sendMessage(message: string, chatId?: string): Promise<void> {
    const targetChatId = chatId || this.chatId;
    
    if (!this.botToken || !targetChatId) {
      console.warn('⚠️ [TelegramBot] Credentials not configured, skipping message send');
      return;
    }

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: targetChatId,
        text: message,
        parse_mode: 'HTML',
      });
      console.log('✅ [TelegramBot] Message sent successfully');
    } catch (error: any) {
      console.error('❌ [TelegramBot] Failed to send message:', error.message);
    }
  }

  async setCommands(): Promise<void> {
    if (!this.botToken) {
      console.warn('⚠️ [TelegramBot] Bot token not configured, skipping commands setup');
      return;
    }

    const commands = [
      { command: 'start', description: '🚀 Запустить бота' },
      { command: 'stats', description: '📊 Статистика сигналов' },
      { command: 'help', description: '❓ Помощь' },
      { command: 'status', description: '📈 Статус сканера' },
    ];

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/setMyCommands`, {
        commands,
      });
      console.log('✅ [TelegramBot] Menu commands set successfully');
    } catch (error: any) {
      console.error('❌ [TelegramBot] Failed to set commands:', error.message);
    }
  }

  async sendStartupMessage(): Promise<void> {
    const message = `
🚀 <b>БОТ ЗАПУЩЕН</b> 🚀

✅ Система сканирования паттернов активна

📊 <b>Настройки сканирования:</b>
• Таймфреймы: 15m, 1h, 4h
• Паттерны: Pin Bar, Fakey, ППР, Engulfing
• Минимальный объем: 20M USDT
• Только USDT пары

⏱ <b>Расписание сканов:</b>
• 15m: каждые 15 минут (00, 15, 30, 45) + 10сек
• 1h: каждый час (XX:00) + 10сек
• 4h: каждые 4 часа (00, 04, 08, 12, 16, 20) + 10сек
• Трекинг: каждые 5 минут

🎯 <b>Автоматический трекинг:</b>
• SL → breakeven после TP1
• Уведомления о всех срабатываниях

📱 <b>Доступные команды:</b>
/stats - Статистика по сигналам
/status - Статус сканера
/help - Помощь

Жду новых паттернов! 📈
    `.trim();

    await this.sendMessage(message);
  }

  private async handleCommand(command: string, chatId: string): Promise<void> {
    console.log(`📨 [TelegramBot] Handling command: ${command}`);

    try {
      switch (command) {
        case '/start':
          await this.handleStartCommand(chatId);
          break;
        case '/help':
          await this.handleHelpCommand(chatId);
          break;
        case '/status':
          await this.handleStatusCommand(chatId);
          break;
        case '/stats':
          await this.handleStatsCommand(chatId);
          break;
        default:
          await this.sendMessage('❓ Неизвестная команда. Используйте /help', chatId);
      }
    } catch (error: any) {
      console.error(`❌ [TelegramBot] Error handling command ${command}:`, error.message);
      await this.sendMessage('❌ Произошла ошибка при обработке команды', chatId);
    }
  }

  private async handleStartCommand(chatId: string): Promise<void> {
    const message = `
🤖 <b>Добро пожаловать в Crypto Pattern Scanner Bot!</b>

Я автоматически сканирую рынок криптовалют и нахожу паттерны для торговли.

📊 <b>Что я умею:</b>
• Поиск 4 паттернов: Pin Bar, Fakey, ППР, Engulfing
• Мониторинг таймфреймов: 15m, 1h, 4h
• Автоматический расчет Entry, SL, TP1, TP2
• Перенос SL в breakeven после TP1
• Уведомления обо всех событиях

📱 <b>Команды:</b>
/stats - Статистика сигналов
/status - Статус сканера
/help - Подробная помощь

Используйте команды для управления ботом! 🚀
    `.trim();

    await this.sendMessage(message, chatId);
  }

  private async handleHelpCommand(chatId: string): Promise<void> {
    const message = `
📚 <b>СПРАВКА</b>

📱 <b>Команды:</b>
/start - Приветственное сообщение
/stats - Детальная статистика по сигналам
/status - Текущий статус и расписание
/help - Эта справка

🔍 <b>Функции бота:</b>
• Автоматическое сканирование 4 паттернов: Pin Bar, Fakey, ППР, Engulfing
• Мониторинг 3 таймфреймов: 15m, 1h, 4h
• Только USDT пары с объемом >20M
• Автоматический расчет Entry, SL, TP1 (1R), TP2 (2R)
• Перенос SL в breakeven после достижения TP1
• Мгновенные уведомления о новых паттернах
• Детальная статистика по всем сигналам

📊 <b>Расписание сканирования:</b>
• 15m: каждые 15 минут (00, 15, 30, 45) + 10 сек задержка
• 1h: каждый час (XX:00) + 10 сек задержка
• 4h: каждые 4 часа (00, 04, 08, 12, 16, 20) + 10 сек задержка
• Трекинг: каждые 5 минут

🎯 <b>Формат сигнала:</b>
При обнаружении паттерна вы получите сообщение с:
• Название паттерна и направление (LONG/SHORT)
• Символ и таймфрейм
• Entry (цена входа)
• SL (стоп-лосс)
• TP1 и TP2 (цели прибыли)

Удачной торговли! 📈
    `.trim();

    await this.sendMessage(message, chatId);
  }

  private async handleStatusCommand(chatId: string): Promise<void> {
    const message = `
📈 <b>СТАТУС СКАНЕРА</b>

🟢 <b>Статус:</b> Активен

⏱ <b>Расписание сканирования:</b>
• <b>15m:</b> каждые 15 минут (00, 15, 30, 45) + 10сек
• <b>1h:</b> каждый час (XX:00) + 10сек
• <b>4h:</b> каждые 4 часа (00, 04, 08, 12, 16, 20) + 10сек

🔄 <b>Трекинг сигналов:</b>
Каждые 5 минут проверяю открытые сигналы и автоматически переношу SL в breakeven после достижения TP1.

📊 <b>Настройки:</b>
• Паттерны: Pin Bar, Fakey, ППР, Engulfing
• Таймфреймы: 15m, 1h, 4h
• Минимальный объем: 20M USDT
• Только USDT пары

✅ Бот работает в нормальном режиме!
    `.trim();

    await this.sendMessage(message, chatId);
  }

  private async handleStatsCommand(chatId: string): Promise<void> {
    console.log('📊 [TelegramBot] Fetching statistics...');
    
    const stats = await signalDB.getStatistics();

    if (stats.total === 0) {
      const message = `
📊 <b>СТАТИСТИКА СИГНАЛОВ</b>

📭 Пока нет сигналов.

Бот активно сканирует рынок и отправит уведомление при обнаружении паттерна!

⏱ Следующее сканирование согласно расписанию.
      `.trim();
      
      await this.sendMessage(message, chatId);
      return;
    }

    const closedSignals = stats.tp1Hit + stats.tp2Hit + stats.slHit;
    const winRate1 = closedSignals > 0 
      ? ((stats.tp1Hit + stats.tp2Hit) / closedSignals * 100).toFixed(1)
      : '0.0';
    const winRate2 = closedSignals > 0
      ? (stats.tp2Hit / closedSignals * 100).toFixed(1)
      : '0.0';

    let message = `
📊 <b>СТАТИСТИКА СИГНАЛОВ</b>

📈 <b>Общая статистика:</b>
• Всего сигналов: ${stats.total}
• Открыто: ${stats.open}
• Закрыто: ${closedSignals}
• TP1 достигнут: ${stats.tp1Hit}
• TP2 достигнут: ${stats.tp2Hit}
• SL сработал: ${stats.slHit}
• Win rate (TP1+): ${winRate1}%
• Win rate (TP2): ${winRate2}%

`;

    // Statistics by pattern
    if (Object.keys(stats.byPattern).length > 0) {
      message += `📊 <b>По паттернам:</b>\n`;
      for (const [pattern, pStatsRaw] of Object.entries(stats.byPattern)) {
        const pStats = pStatsRaw as { total: number; tp1: number; tp2: number; sl: number; open: number };
        const pClosedSignals = pStats.tp1 + pStats.tp2 + pStats.sl;
        const pWinRate = pClosedSignals > 0
          ? (((pStats.tp1 + pStats.tp2) / pClosedSignals) * 100).toFixed(1)
          : '0.0';
        message += `\n<b>${pattern}:</b>\n`;
        message += `  • Всего: ${pStats.total} | Закрыто: ${pClosedSignals} | TP1: ${pStats.tp1} | TP2: ${pStats.tp2} | SL: ${pStats.sl}\n`;
        message += `  • Win rate: ${pWinRate}%\n`;
      }
      message += '\n';
    }

    // Statistics by timeframe
    if (Object.keys(stats.byTimeframe).length > 0) {
      message += `⏱ <b>По таймфреймам:</b>\n`;
      for (const [tf, tfStatsRaw] of Object.entries(stats.byTimeframe)) {
        const tfStats = tfStatsRaw as { total: number; tp1: number; tp2: number; sl: number; open: number };
        const tfClosedSignals = tfStats.tp1 + tfStats.tp2 + tfStats.sl;
        const tfWinRate = tfClosedSignals > 0
          ? (((tfStats.tp1 + tfStats.tp2) / tfClosedSignals) * 100).toFixed(1)
          : '0.0';
        message += `\n<b>${tf}:</b>\n`;
        message += `  • Всего: ${tfStats.total} | Закрыто: ${tfClosedSignals} | TP1: ${tfStats.tp1} | TP2: ${tfStats.tp2} | SL: ${tfStats.sl}\n`;
        message += `  • Win rate: ${tfWinRate}%\n`;
      }
      message += '\n';
    }

    // Statistics by direction
    const longClosedSignals = stats.byDirection.LONG.tp1 + stats.byDirection.LONG.tp2 + stats.byDirection.LONG.sl;
    const shortClosedSignals = stats.byDirection.SHORT.tp1 + stats.byDirection.SHORT.tp2 + stats.byDirection.SHORT.sl;
    const longWinRate = longClosedSignals > 0
      ? (((stats.byDirection.LONG.tp1 + stats.byDirection.LONG.tp2) / longClosedSignals) * 100).toFixed(1)
      : '0.0';
    const shortWinRate = shortClosedSignals > 0
      ? (((stats.byDirection.SHORT.tp1 + stats.byDirection.SHORT.tp2) / shortClosedSignals) * 100).toFixed(1)
      : '0.0';

    message += `
🎯 <b>По направлениям:</b>

<b>LONG:</b>
  • Всего: ${stats.byDirection.LONG.total} | Закрыто: ${longClosedSignals}
  • TP1: ${stats.byDirection.LONG.tp1} | TP2: ${stats.byDirection.LONG.tp2} | SL: ${stats.byDirection.LONG.sl}
  • Win rate: ${longWinRate}%

<b>SHORT:</b>
  • Всего: ${stats.byDirection.SHORT.total} | Закрыто: ${shortClosedSignals}
  • TP1: ${stats.byDirection.SHORT.tp1} | TP2: ${stats.byDirection.SHORT.tp2} | SL: ${stats.byDirection.SHORT.sl}
  • Win rate: ${shortWinRate}%
`;

    await this.sendMessage(message.trim(), chatId);
  }

  async startPolling(): Promise<void> {
    if (!this.botToken) {
      console.error('❌ [TelegramBot] Cannot start polling: bot token not configured');
      return;
    }

    if (this.isPolling) {
      console.warn('⚠️ [TelegramBot] Polling is already running');
      return;
    }

    this.isPolling = true;
    console.log('🔄 [TelegramBot] Starting polling...');

    // Delete webhook to enable polling
    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/deleteWebhook`);
      console.log('✅ [TelegramBot] Webhook deleted, polling enabled');
    } catch (error: any) {
      console.error('❌ [TelegramBot] Failed to delete webhook:', error.message);
    }

    this.poll();
  }

  private async poll(): Promise<void> {
    while (this.isPolling) {
      try {
        const response = await axios.get(
          `https://api.telegram.org/bot${this.botToken}/getUpdates`,
          {
            params: {
              offset: this.offset,
              timeout: 30, // Long polling timeout
              allowed_updates: ['message'],
            },
            timeout: 35000, // Slightly longer than Telegram timeout
          }
        );

        const updates = response.data.result;

        for (const update of updates) {
          this.offset = update.update_id + 1;

          if (update.message && update.message.text) {
            const chatId = update.message.chat.id.toString();
            const text = update.message.text;
            
            console.log(`📨 [TelegramBot] Received message from ${chatId}: ${text}`);

            // Handle commands
            if (text.startsWith('/')) {
              await this.handleCommand(text, chatId);
            }
          }
        }
      } catch (error: any) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          // Timeout is normal for long polling, continue
          continue;
        }
        console.error('❌ [TelegramBot] Polling error:', error.message);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
      }
    }
  }

  stopPolling(): void {
    console.log('🛑 [TelegramBot] Stopping polling...');
    this.isPolling = false;
  }
}

export const telegramBot = new TelegramBot();
