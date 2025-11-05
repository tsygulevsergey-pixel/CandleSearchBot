# 🚀 Запуск бота на своём сервере с автоматическим рестартом

## 📋 Вариант 1: PM2 (рекомендуется)

### Установка PM2
```bash
npm install -g pm2
```

### Запуск бота
```bash
# Создать папку для логов
mkdir -p logs

# Запустить через PM2
pm2 start ecosystem.config.cjs

# Проверить статус
pm2 status

# Посмотреть логи
pm2 logs crypto-bot

# Остановить
pm2 stop crypto-bot

# Перезапустить
pm2 restart crypto-bot

# Удалить из PM2
pm2 delete crypto-bot
```

### Автозапуск при рестарте сервера
```bash
# Сохранить текущую конфигурацию PM2
pm2 save

# Создать systemd/init.d скрипт для автозапуска
pm2 startup

# Следуй инструкциям, которые выведет команда выше
```

### Мониторинг
```bash
# Веб-интерфейс
pm2 plus

# Или простой мониторинг в терминале
pm2 monit
```

---

## 📋 Вариант 2: systemd (для Linux)

### Создать systemd service файл
```bash
sudo nano /etc/systemd/system/crypto-bot.service
```

### Содержимое файла:
```ini
[Unit]
Description=Crypto Trading Bot
After=network.target postgresql.service

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/path/to/your/bot
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10
StandardOutput=append:/var/log/crypto-bot/output.log
StandardError=append:/var/log/crypto-bot/error.log

# Environment variables
Environment=NODE_ENV=production
Environment=DATABASE_URL=your_database_url

[Install]
WantedBy=multi-user.target
```

### Запуск через systemd
```bash
# Создать папку для логов
sudo mkdir -p /var/log/crypto-bot
sudo chown YOUR_USERNAME:YOUR_USERNAME /var/log/crypto-bot

# Перезагрузить systemd
sudo systemctl daemon-reload

# Включить автозапуск
sudo systemctl enable crypto-bot

# Запустить
sudo systemctl start crypto-bot

# Проверить статус
sudo systemctl status crypto-bot

# Посмотреть логи
sudo journalctl -u crypto-bot -f
```

---

## 📋 Вариант 3: Docker (для изоляции)

### Dockerfile (если нужно)
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["npm", "run", "dev"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  crypto-bot:
    build: .
    restart: always
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    volumes:
      - ./logs:/app/logs
    depends_on:
      - postgres
```

### Запуск через Docker
```bash
# Собрать и запустить
docker-compose up -d

# Посмотреть логи
docker-compose logs -f crypto-bot

# Остановить
docker-compose down
```

---

## ⚙️ Что уже сделано в коде

✅ **Обработчики ошибок добавлены** в `src/mastra/index.ts`:
- `uncaughtException` - ловит все необработанные ошибки
- `unhandledRejection` - ловит все упавшие промисы
- `SIGTERM` / `SIGINT` - graceful shutdown

✅ **EPIPE ошибки исправлены** в `src/utils/rateLimiter.ts`:
- Все `console.log` защищены от падения при закрытом stdout

✅ **Уведомления в Telegram**:
- При каждой критической ошибке бот отправит сообщение в Telegram
- Ты сразу узнаешь о проблемах

---

## 🔧 Рекомендуемая настройка

**Для продакшена используй PM2:**

```bash
# 1. Установить PM2 глобально
npm install -g pm2

# 2. Запустить бота
pm2 start ecosystem.config.cjs

# 3. Настроить автозапуск
pm2 save
pm2 startup

# 4. Проверить что всё работает
pm2 status
pm2 logs
```

**Преимущества PM2:**
- ✅ Автоматический рестарт при краше
- ✅ Экспоненциальная задержка (не спамит рестартами)
- ✅ Ограничение по памяти (1GB)
- ✅ Логирование с timestamp
- ✅ Graceful shutdown
- ✅ Автозапуск при рестарте сервера

---

## 📊 Мониторинг

### Проверка статуса
```bash
# PM2
pm2 status
pm2 monit

# systemd
sudo systemctl status crypto-bot

# Docker
docker-compose ps
```

### Просмотр логов
```bash
# PM2
pm2 logs crypto-bot --lines 100

# systemd
sudo journalctl -u crypto-bot -n 100 -f

# Docker
docker-compose logs -f --tail=100 crypto-bot
```

---

## 🚨 Troubleshooting

### Бот не стартует
```bash
# Проверь логи PM2
pm2 logs crypto-bot --err

# Проверь права доступа
ls -la /path/to/bot

# Проверь переменные окружения
pm2 env 0
```

### Бот падает при старте
```bash
# Увеличь min_uptime в ecosystem.config.cjs
min_uptime: '30s'

# Проверь подключение к БД
psql $DATABASE_URL -c "SELECT 1"
```

### Слишком частые рестарты
```bash
# Посмотри логи ошибок
pm2 logs crypto-bot --err --lines 50

# Увеличь exp_backoff_restart_delay
exp_backoff_restart_delay: 500
```

---

**Готово!** Теперь бот будет автоматически перезапускаться при любых ошибках. 🎉
