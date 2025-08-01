const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');
const express = require('express');

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN || '8147456024:AAEEoEG3_V2SI2F8iWxlToaWH4JPMunlqx4';
const YOUR_CHAT_ID = process.env.YOUR_CHAT_ID || '5102803347';
const TARGET_SERVERS = [
  'https://assistant-in-singing-tg.onrender.com/ping',
  'https://kruki.onrender.com/',
  'https://keep-alive-bot-j0yl.onrender.com/ping'
].filter(Boolean);
const PING_INTERVAL_MINUTES = parseInt(process.env.PING_INTERVAL_MINUTES) || 5;
const SELF_PING_INTERVAL_MINUTES = 5;
const PORT = process.env.PORT || 3000; // Render автоматически задает PORT

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Флаг для предотвращения дублирования cron
let isCronInitialized = false;

// Middleware для обработки веб-запросов
app.use(express.json());
app.get('/ping', (req, res) => {
  console.log(`✅ Получен запрос на /ping от IP: ${req.ip} в ${new Date().toISOString()}`);
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    server: 'Keep-Alive Bot'
  });
});

// Функция для отправки уведомлений
async function sendNotification(message) {
  try {
    console.log(`Отправка уведомления: ${message}`);
    await bot.telegram.sendMessage(YOUR_CHAT_ID, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`Ошибка отправки уведомления: ${error.message}`);
  }
}

// Функция для самопинга
async function pingSelf() {
  const selfUrl = 'https://keep-alive-bot-j0yl.onrender.com/ping';
  try {
    console.log(`🔄 Начало самопинга: ${selfUrl} в ${new Date().toISOString()}`);
    const start = Date.now();
    const response = await axios.get(selfUrl, { timeout: 8000 });
    const pingTime = Date.now() - start;

    const message = `🔄 <b>Самопинг успешен!</b>\n⏱ Время: ${pingTime}мс\n🔗 Сервер: ${selfUrl}\n🛡 Код: ${response.status}`;
    console.log(message);
    await sendNotification(message);
    return true;
  } catch (error) {
    const message = `⚠️ <b>Ошибка самопинга!</b>\n🔗 Сервер: ${selfUrl}\n❌ Ошибка: ${error.message}`;
    console.error(message);
    await sendNotification(message);
    return false;
  }
}

// Функция для пинга сервера
async function pingServer(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const start = Date.now();
      const response = await axios.get(url, { timeout: 10000 });
      const pingTime = Date.now() - start;

      const message = `✅ <b>Успешный пинг!</b>\n🔗 Сервер: ${url}\n⏱ Время: ${pingTime}мс\n🛡 Код: ${response.status}`;
      console.log(message);
      await sendNotification(message);
      return { success: true, pingTime };
    } catch (error) {
      console.warn(`Попытка ${i + 1}/${retries}: Ошибка пинга ${url} - ${error.message}`);
      if (i === retries - 1) {
        const failMessage = `❌ <b>Пинг неуспешен после ${retries} попыток</b>\n🔗 Сервер: ${url}\n❌ Ошибка: ${error.message}`;
        console.error(failMessage);
        await sendNotification(failMessage);
      }
      if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 5000)); // Увеличена задержка
    }
  }
  return { success: false };
}

// Функция для пинга всех серверов
async function pingAllServers() {
  console.log(`\n=== Начало цикла пинга в ${new Date().toISOString()} ===`);
  await sendNotification(`🔄 <b>Начало цикла пинга</b>\n⏰ ${new Date().toLocaleString()}`);

  const results = await Promise.all(
    TARGET_SERVERS.map(url => pingServer(url))
  );

  const failed = results.filter(r => !r.success).length;
  const success = results.length - failed;

  const summaryMessage = `📊 <b>Итоги пинга:</b>\n✅ Успешно: ${success}\n❌ Ошибки: ${failed}\n⏰ ${new Date().toLocaleString()}`;
  console.log(summaryMessage);
  await sendNotification(summaryMessage);
  return results;
}

// Настройка расписания пингов
function setupPingSchedule() {
  if (isCronInitialized) {
    console.log(`⚠️ Cron уже инициализирован, пропуск настройки в ${new Date().toISOString()}`);
    return;
  }
  isCronInitialized = true;
  console.log(`⏰ Настройка расписания пингов в ${new Date().toISOString()}...`);

  // Тестовая задача для проверки cron
  cron.schedule('* * * * *', () => {
    console.log(`[Тест] Cron работает! Время: ${new Date().toLocaleTimeString()}`);
  });

  // Основной пинг всех серверов
  cron.schedule(`*/${PING_INTERVAL_MINUTES} * * * *`, async () => {
    console.log(`⏰ Запуск планового пинга серверов в ${new Date().toISOString()}...`);
    await pingAllServers();
  });

  // Альтернативный самопинг через setInterval, если cron не работает
  setInterval(async () => {
    console.log(`🔄 Альтернативный самопинг через setInterval в ${new Date().toISOString()}...`);
    await pingSelf();
  }, SELF_PING_INTERVAL_MINUTES * 60 * 1000);

  // Первый пинг при запуске
  setTimeout(async () => {
    console.log(`🚀 Выполнение первого пинга в ${new Date().toISOString()}...`);
    await pingAllServers();
    await pingSelf();
    await sendNotification(`🤖 <b>Бот полностью запущен!</b>\n📌 Автопинг: каждые ${PING_INTERVAL_MINUTES} мин\n🔁 Самопинг: каждые ${SELF_PING_INTERVAL_MINUTES} мин`);
  }, 5000);
}

// Обработчик команды start
bot.command('start', (ctx) => {
  const welcomeMessage = `
👋 <b>Привет, ${ctx.from.first_name}!</b>
Я - бот для мониторинга серверов. Вот что я умею:
🔹 Автоматически проверять доступность серверов
🔹 Отправлять уведомления о проблемах
🔹 Предоставлять текущий статус серверов
<b>Доступные команды:</b>
/start - Начальное сообщение
/ping - Проверить все серверы сейчас
/status - Текущий статус серверов
⏳ Серверы проверяются каждые ${PING_INTERVAL_MINUTES} минут
🔄 Самопинг каждые ${SELF_PING_INTERVAL_MINUTES} минут
  `;
  ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
});

// Обработчики команд бота
bot.command('ping', async (ctx) => {
  const loadingMsg = await ctx.reply('⏳ Пингуем серверы...');
  const results = await pingAllServers();
  const successCount = results.filter(r => r.success).length;

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    loadingMsg.message_id,
    null,
    `🔍 <b>Результаты пинга:</b>\n\n` +
    `✅ Успешно: ${successCount}/${TARGET_SERVERS.length}\n` +
    `⏰ Время: ${new Date().toLocaleString()}\n\n` +
    `🔄 Следующий пинг через ${PING_INTERVAL_MINUTES} минут`,
    { parse_mode: 'HTML' }
  );
});

bot.command('status', async (ctx) => {
  try {
    const statusMessages = await Promise.all(
      TARGET_SERVERS.map(async url => {
        try {
          const start = Date.now();
          await axios.get(url, { timeout: 5000 });
          const pingTime = Date.now() - start;
          return `✅ ${url} - ONLINE (${pingTime}мс)`;
        } catch (e) {
          return `❌ ${url} - OFFLINE (${e.message})`;
        }
      })
    );

    await ctx.reply(
      `📡 <b>Статус серверов:</b>\n\n${statusMessages.join('\n')}\n\n` +
      `⏰ ${new Date().toLocaleString()}`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error(`Ошибка проверки статуса: ${error.message}`);
    await ctx.reply('⚠️ Ошибка при проверке статуса серверов');
  }
});

// Запуск сервера и бота
app.listen(PORT, async () => {
  console.log(`🚀 HTTP сервер запущен на порту ${PORT} в ${new Date().toISOString()}`);
  try {
    await bot.launch();
    console.log(`🤖 Telegram бот успешно запущен в ${new Date().toISOString()}!`);
    setupPingSchedule();
  } catch (err) {
    console.error(`❌ Ошибка запуска бота: ${err.message}`);
    process.exit(1);
  }
});

// Обработка завершения работы
process.once('SIGINT', () => {
  console.log('🛑 Получен SIGINT. Завершение работы бота...');
  bot.stop('SIGINT');
  process.exit();
});

process.once('SIGTERM', () => {
  console.log('🛑 Получен SIGTERM. Завершение работы бота...');
  bot.stop('SIGTERM');
  process.exit();
});