// PM2 Configuration для автоматического рестарта бота
// Использование: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'crypto-bot',
      script: 'mastra',
      args: 'dev',
      interpreter: 'none', // mastra запускается напрямую
      
      // Автоматический рестарт
      autorestart: true,
      watch: false, // не перезапускать при изменении файлов (только при краше)
      max_memory_restart: '1G', // рестарт если память > 1GB
      
      // Стратегия рестарта
      exp_backoff_restart_delay: 100, // экспоненциальная задержка при краше
      max_restarts: 10, // максимум 10 рестартов за 1 минуту
      min_uptime: '10s', // минимальное время работы перед рестартом
      
      // Логирование
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true, // добавлять timestamp в логи
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Переменные окружения (если нужны)
      env: {
        NODE_ENV: 'production',
      },
      
      // Graceful shutdown
      kill_timeout: 5000, // ждать 5 сек перед SIGKILL
      wait_ready: false,
      listen_timeout: 3000,
      shutdown_with_message: false,
    },
  ],
};
