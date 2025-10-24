import axios from 'axios';

export class TelegramBot {
  private botToken: string;
  private chatId: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.botToken || !this.chatId) {
      console.warn('⚠️ [TelegramBot] Credentials not configured, skipping message send');
      return;
    }

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
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
}

export const telegramBot = new TelegramBot();
