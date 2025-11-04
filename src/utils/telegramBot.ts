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
      { command: 'stats', description: '📊 Статистика (все сигналы)' },
      { command: 'stats_date', description: '📅 Статистика по датам' },
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
      // Check for /stats_date command with parameters
      if (command.startsWith('/stats_date')) {
        await this.handleStatsDateCommand(command, chatId);
        return;
      }

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

    const closedSignals = stats.tp1Hit + stats.tp2Hit + stats.tp3Hit + stats.breakevenHit + stats.slHit;
    const winRate1 = closedSignals > 0 
      ? ((stats.tp1Hit + stats.tp2Hit + stats.tp3Hit + stats.breakevenHit) / closedSignals * 100).toFixed(1)
      : '0.0';
    const winRate2 = closedSignals > 0
      ? ((stats.tp2Hit + stats.tp3Hit) / closedSignals * 100).toFixed(1)
      : '0.0';
    
    // Средний PnL на сделку
    const avgPnl = closedSignals > 0 ? (stats.pnlNet / closedSignals).toFixed(2) : '0.00';
    const pnlEmoji = stats.pnlNet > 0 ? '✅' : stats.pnlNet < 0 ? '❌' : '⚪';
    const avgPnlEmoji = parseFloat(avgPnl) >= 1.5 ? '🎯' : parseFloat(avgPnl) > 0 ? '✅' : '❌';

    let message = `
📊 <b>СТАТИСТИКА СИГНАЛОВ</b>

📈 <b>Общая статистика:</b>
• Всего сигналов: ${stats.total}
• Открыто: ${stats.open}
• Закрыто: ${closedSignals}

🎯 <b>Результаты закрытых:</b>
• TP1 достигнут: ${stats.tp1Hit}
• TP2 достигнут: ${stats.tp2Hit}
• TP3 достигнут: ${stats.tp3Hit}
• Breakeven: ${stats.breakevenHit} ⚖️
• SL сработал: ${stats.slHit}

📊 <b>Win Rate:</b>
• Win rate (TP1+TP2+TP3+BE): ${winRate1}%
• Win rate (TP2+TP3): ${winRate2}%

💰 <b>PnL:</b>
${pnlEmoji} <b>Net PnL: ${stats.pnlNet >= 0 ? '+' : ''}${stats.pnlNet.toFixed(2)}%</b>
${avgPnlEmoji} <b>Средний PnL: ${parseFloat(avgPnl) >= 0 ? '+' : ''}${avgPnl}%</b> (цель: +1.5%+)
• PnL+: ${stats.pnlPositive.toFixed(2)}%
• PnL-: ${stats.pnlNegative.toFixed(2)}%

`;

    // Statistics by pattern
    if (Object.keys(stats.byPattern).length > 0) {
      message += `📊 <b>По паттернам:</b>\n`;
      for (const [pattern, pStatsRaw] of Object.entries(stats.byPattern)) {
        const pStats = pStatsRaw as { total: number; tp1: number; tp2: number; tp3: number; breakeven: number; sl: number; open: number; pnlPositive: number; pnlNegative: number; pnlNet: number };
        const pClosedSignals = pStats.tp1 + pStats.tp2 + pStats.tp3 + pStats.breakeven + pStats.sl;
        const pWinRate = pClosedSignals > 0
          ? (((pStats.tp1 + pStats.tp2 + pStats.tp3 + pStats.breakeven) / pClosedSignals) * 100).toFixed(1)
          : '0.0';
        message += `\n<b>${pattern}:</b>\n`;
        message += `  • Всего: ${pStats.total} | Закрыто: ${pClosedSignals}\n`;
        message += `  • TP1: ${pStats.tp1} | TP2: ${pStats.tp2} | TP3: ${pStats.tp3} | BE: ${pStats.breakeven} | SL: ${pStats.sl}\n`;
        message += `  • Win rate: ${pWinRate}%\n`;
        message += `  • PnL: ${pStats.pnlNet >= 0 ? '+' : ''}${pStats.pnlNet.toFixed(2)}% (${pStats.pnlPositive.toFixed(2)}% / ${pStats.pnlNegative.toFixed(2)}%)\n`;
      }
      message += '\n';
    }

    // Statistics by timeframe
    if (Object.keys(stats.byTimeframe).length > 0) {
      message += `⏱ <b>По таймфреймам:</b>\n`;
      for (const [tf, tfStatsRaw] of Object.entries(stats.byTimeframe)) {
        const tfStats = tfStatsRaw as { total: number; tp1: number; tp2: number; tp3: number; breakeven: number; sl: number; open: number; pnlPositive: number; pnlNegative: number; pnlNet: number };
        const tfClosedSignals = tfStats.tp1 + tfStats.tp2 + tfStats.tp3 + tfStats.breakeven + tfStats.sl;
        const tfWinRate = tfClosedSignals > 0
          ? (((tfStats.tp1 + tfStats.tp2 + tfStats.tp3 + tfStats.breakeven) / tfClosedSignals) * 100).toFixed(1)
          : '0.0';
        message += `\n<b>${tf}:</b>\n`;
        message += `  • Всего: ${tfStats.total} | Закрыто: ${tfClosedSignals}\n`;
        message += `  • TP1: ${tfStats.tp1} | TP2: ${tfStats.tp2} | TP3: ${tfStats.tp3} | BE: ${tfStats.breakeven} | SL: ${tfStats.sl}\n`;
        message += `  • Win rate: ${tfWinRate}%\n`;
        message += `  • PnL: ${tfStats.pnlNet >= 0 ? '+' : ''}${tfStats.pnlNet.toFixed(2)}% (${tfStats.pnlPositive.toFixed(2)}% / ${tfStats.pnlNegative.toFixed(2)}%)\n`;
      }
      message += '\n';
    }

    // Statistics by direction
    const longClosedSignals = stats.byDirection.LONG.tp1 + stats.byDirection.LONG.tp2 + stats.byDirection.LONG.tp3 + stats.byDirection.LONG.breakeven + stats.byDirection.LONG.sl;
    const shortClosedSignals = stats.byDirection.SHORT.tp1 + stats.byDirection.SHORT.tp2 + stats.byDirection.SHORT.tp3 + stats.byDirection.SHORT.breakeven + stats.byDirection.SHORT.sl;
    const longWinRate = longClosedSignals > 0
      ? (((stats.byDirection.LONG.tp1 + stats.byDirection.LONG.tp2 + stats.byDirection.LONG.tp3 + stats.byDirection.LONG.breakeven) / longClosedSignals) * 100).toFixed(1)
      : '0.0';
    const shortWinRate = shortClosedSignals > 0
      ? (((stats.byDirection.SHORT.tp1 + stats.byDirection.SHORT.tp2 + stats.byDirection.SHORT.tp3 + stats.byDirection.SHORT.breakeven) / shortClosedSignals) * 100).toFixed(1)
      : '0.0';

    message += `
🎯 <b>По направлениям:</b>

<b>LONG:</b>
  • Всего: ${stats.byDirection.LONG.total} | Закрыто: ${longClosedSignals}
  • TP1: ${stats.byDirection.LONG.tp1} | TP2: ${stats.byDirection.LONG.tp2} | TP3: ${stats.byDirection.LONG.tp3} | BE: ${stats.byDirection.LONG.breakeven} | SL: ${stats.byDirection.LONG.sl}
  • Win rate: ${longWinRate}%
  • PnL: ${stats.byDirection.LONG.pnlNet >= 0 ? '+' : ''}${stats.byDirection.LONG.pnlNet.toFixed(2)}% (${stats.byDirection.LONG.pnlPositive.toFixed(2)}% / ${stats.byDirection.LONG.pnlNegative.toFixed(2)}%)

<b>SHORT:</b>
  • Всего: ${stats.byDirection.SHORT.total} | Закрыто: ${shortClosedSignals}
  • TP1: ${stats.byDirection.SHORT.tp1} | TP2: ${stats.byDirection.SHORT.tp2} | TP3: ${stats.byDirection.SHORT.tp3} | BE: ${stats.byDirection.SHORT.breakeven} | SL: ${stats.byDirection.SHORT.sl}
  • Win rate: ${shortWinRate}%
  • PnL: ${stats.byDirection.SHORT.pnlNet >= 0 ? '+' : ''}${stats.byDirection.SHORT.pnlNet.toFixed(2)}% (${stats.byDirection.SHORT.pnlPositive.toFixed(2)}% / ${stats.byDirection.SHORT.pnlNegative.toFixed(2)}%)
`;

    await this.sendMessage(message.trim(), chatId);
  }

  private async handleStatsDateCommand(command: string, chatId: string): Promise<void> {
    console.log('📅 [TelegramBot] Fetching statistics by dates...');
    
    // Parse command: /stats_date 2025-11-01,2025-11-04
    // or: /stats_date Пятница,Понедельник
    const params = command.replace('/stats_date', '').trim();
    
    if (!params) {
      const helpMessage = `
📅 <b>СТАТИСТИКА ПО ДАТАМ</b>

<b>Формат команды:</b>
/stats_date ДАТЫ

<b>Примеры использования:</b>

1️⃣ <b>По конкретным датам:</b>
/stats_date 2025-11-01,2025-11-04
(Статистика за 1 и 4 ноября)

/stats_date 2025-11-01
(Статистика только за 1 ноября)

2️⃣ <b>По дням недели (сегодня/вчера):</b>
/stats_date пятница,понедельник
(Пятница и понедельник этой недели)

/stats_date сегодня
(Только сегодня)

/stats_date вчера
(Только вчера)

<b>Форматы дат:</b>
• YYYY-MM-DD (2025-11-01)
• Названия дней: понедельник, вторник, среда, четверг, пятница, суббота, воскресенье
• Ключевые слова: сегодня, вчера

<b>Несколько дат:</b> Разделяйте запятой без пробелов
      `.trim();
      
      await this.sendMessage(helpMessage, chatId);
      return;
    }

    // Parse dates
    const dateStrings = params.split(',').map(d => d.trim().toLowerCase());
    const parsedDates: string[] = [];
    
    for (const dateStr of dateStrings) {
      const parsed = this.parseDate(dateStr);
      if (parsed) {
        parsedDates.push(parsed);
      } else {
        await this.sendMessage(`❌ Неверный формат даты: "${dateStr}"\n\nИспользуйте /stats_date без параметров для справки.`, chatId);
        return;
      }
    }

    if (parsedDates.length === 0) {
      await this.sendMessage('❌ Не удалось распознать ни одной даты. Используйте /stats_date для справки.', chatId);
      return;
    }

    console.log(`📅 [TelegramBot] Parsed dates: ${parsedDates.join(', ')}`);

    // Fetch statistics
    const stats = await signalDB.getStatisticsByDates(parsedDates);

    if (stats.total === 0) {
      const message = `
📅 <b>СТАТИСТИКА ПО ДАТАМ</b>

📆 <b>Даты:</b> ${parsedDates.join(', ')}

📭 Нет сигналов за указанные даты.
      `.trim();
      
      await this.sendMessage(message, chatId);
      return;
    }

    // Format and send statistics (reuse same formatting logic as /stats)
    const closedSignals = stats.tp1Hit + stats.tp2Hit + stats.tp3Hit + stats.breakevenHit + stats.slHit;
    const winRate1 = closedSignals > 0 
      ? ((stats.tp1Hit + stats.tp2Hit + stats.tp3Hit + stats.breakevenHit) / closedSignals * 100).toFixed(1)
      : '0.0';
    const winRate2 = closedSignals > 0
      ? ((stats.tp2Hit + stats.tp3Hit) / closedSignals * 100).toFixed(1)
      : '0.0';
    
    const avgPnl = closedSignals > 0 ? (stats.pnlNet / closedSignals).toFixed(2) : '0.00';
    const pnlEmoji = stats.pnlNet > 0 ? '✅' : stats.pnlNet < 0 ? '❌' : '⚪';
    const avgPnlEmoji = parseFloat(avgPnl) >= 1.5 ? '🎯' : parseFloat(avgPnl) > 0 ? '✅' : '❌';

    let message = `
📅 <b>СТАТИСТИКА ПО ДАТАМ</b>

📆 <b>Даты:</b> ${parsedDates.join(', ')}

📈 <b>Общая статистика:</b>
• Всего сигналов: ${stats.total}
• Открыто: ${stats.open}
• Закрыто: ${closedSignals}

🎯 <b>Результаты закрытых:</b>
• TP1 достигнут: ${stats.tp1Hit}
• TP2 достигнут: ${stats.tp2Hit}
• TP3 достигнут: ${stats.tp3Hit}
• Breakeven: ${stats.breakevenHit} ⚖️
• SL сработал: ${stats.slHit}

📊 <b>Win Rate:</b>
• Win rate (TP1+TP2+TP3+BE): ${winRate1}%
• Win rate (TP2+TP3): ${winRate2}%

💰 <b>PnL:</b>
${pnlEmoji} <b>Net PnL: ${stats.pnlNet >= 0 ? '+' : ''}${stats.pnlNet.toFixed(2)}%</b>
${avgPnlEmoji} <b>Средний PnL: ${parseFloat(avgPnl) >= 0 ? '+' : ''}${avgPnl}%</b> (цель: +1.5%+)
• PnL+: ${stats.pnlPositive.toFixed(2)}%
• PnL-: ${stats.pnlNegative.toFixed(2)}%

`;

    // Add pattern breakdown (simplified - just top patterns)
    if (Object.keys(stats.byPattern).length > 0) {
      message += `📊 <b>По паттернам:</b>\n`;
      for (const [pattern, pStatsRaw] of Object.entries(stats.byPattern)) {
        const pStats = pStatsRaw as { total: number; tp1: number; tp2: number; tp3: number; breakeven: number; sl: number; open: number; pnlPositive: number; pnlNegative: number; pnlNet: number };
        const pClosedSignals = pStats.tp1 + pStats.tp2 + pStats.tp3 + pStats.breakeven + pStats.sl;
        const pWinRate = pClosedSignals > 0
          ? (((pStats.tp1 + pStats.tp2 + pStats.tp3 + pStats.breakeven) / pClosedSignals) * 100).toFixed(1)
          : '0.0';
        message += `\n<b>${pattern}:</b> ${pStats.total} сигналов | Win rate: ${pWinRate}% | PnL: ${pStats.pnlNet >= 0 ? '+' : ''}${pStats.pnlNet.toFixed(2)}%\n`;
      }
    }

    await this.sendMessage(message.trim(), chatId);
  }

  /**
   * Parse date string into YYYY-MM-DD format
   * Supports:
   * - Exact dates: 2025-11-01
   * - Day names: понедельник, вторник, среда, четверг, пятница, суббота, воскресенье
   * - Keywords: сегодня, вчера
   */
  private parseDate(input: string): string | null {
    const trimmed = input.toLowerCase().trim();
    
    // Check if it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const now = new Date();
    
    // Keywords
    if (trimmed === 'сегодня' || trimmed === 'today') {
      return this.formatDate(now);
    }
    
    if (trimmed === 'вчера' || trimmed === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return this.formatDate(yesterday);
    }

    // Day names (for current week)
    const dayMap: { [key: string]: number } = {
      'понедельник': 1, 'monday': 1,
      'вторник': 2, 'tuesday': 2,
      'среда': 3, 'wednesday': 3,
      'четверг': 4, 'thursday': 4,
      'пятница': 5, 'friday': 5,
      'суббота': 6, 'saturday': 6,
      'воскресенье': 0, 'sunday': 0,
    };

    if (trimmed in dayMap) {
      const targetDay = dayMap[trimmed];
      const currentDay = now.getDay();
      const diff = targetDay - currentDay;
      
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + diff);
      
      return this.formatDate(targetDate);
    }

    return null;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
