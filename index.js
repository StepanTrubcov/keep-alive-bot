const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN || '8147456024:AAEEoEG3_V2SI2F8iWxlToaWH4JPMunlqx4'; // Токен из переменных окружения
const TARGET_SERVERS = [
  'https://assistant-in-singing-tg.onrender.com/ping',
  process.env.RENDER_EXTERNAL_URL // Добавляем самопинг своего же сервера
].filter(Boolean); // Убираем пустые значения
const PING_INTERVAL_MINUTES = process.env.PING_INTERVAL_MINUTES || 5;
const SELF_PING_INTERVAL_MINUTES = 10; // Меньше 15 минут, чтобы Render не усыплял

const bot = new Telegraf(BOT_TOKEN);

// Функция для самопинга
async function pingSelf() {
  if (!process.env.RENDER_EXTERNAL_URL) return;
  
  try {
    const start = Date.now();
    await axios.get(`${process.env.RENDER_EXTERNAL_URL}/ping`, { timeout: 5000 });
    const pingTime = Date.now() - start;
    console.log(`🔄 [${new Date().toISOString()}] Самопинг успешен (${pingTime}мс)`);
  } catch (error) {
    console.warn(`⚠️ Ошибка самопинга: ${error.message}`);
  }
}

async function pingServer(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const start = Date.now();
      const response = await axios.get(url, { timeout: 10000 });
      const pingTime = Date.now() - start;
      
      console.log(`✅ [${new Date().toISOString()}] Успешный пинг ${url} (${pingTime}мс)`);
      return { success: true, pingTime };
    } catch (error) {
      console.warn(`⚠️ Попытка ${i+1}/${retries}: Ошибка пинга ${url} - ${error.message}`);
      if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  return { success: false };
}

async function pingAllServers() {
  console.log(`\n=== Начало цикла пинга в ${new Date().toISOString()} ===`);
  
  const results = await Promise.all(
    TARGET_SERVERS.map(url => pingServer(url))
  );
  
  const failed = results.filter(r => !r.success).length;
  const success = results.length - failed;
  
  console.log(`=== Результаты: ${success} успешно, ${failed} с ошибками ===\n`);
  
  return results;
}

function setupPingSchedule() {
  // Пингуем сразу при запуске
  pingAllServers();
  
  // Затем каждые N минут пингуем целевые серверы
  cron.schedule(`*/${PING_INTERVAL_MINUTES} * * * *`, () => {
    pingAllServers();
  });
  
  // Самопинг каждые 14 минут
  cron.schedule(`*/${SELF_PING_INTERVAL_MINUTES} * * * *`, () => {
    pingSelf();
  });
  
  console.log(`Настроен регулярный пинг каждые ${PING_INTERVAL_MINUTES} минут и самопинг каждые ${SELF_PING_INTERVAL_MINUTES} минут`);
}

// Добавляем обработчик для веб-запросов (для самопинга)
bot.telegram.setWebhook(''); // Отключаем вебхук если был
bot.use((ctx, next) => {
  if (ctx.updateType === 'message' && ctx.message.text) return next();
  if (ctx.updateType === 'callback_query') return next();
  ctx.reply('Я работаю! ✅'); // Ответ на любой другой запрос
  return;
});

bot.command('ping', async (ctx) => {
  const loadingMsg = await ctx.reply('⏳ Пингуем серверы...');
  
  const results = await pingAllServers();
  const successCount = results.filter(r => r.success).length;
  
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    loadingMsg.message_id,
    null,
    `🔍 Результаты пинга:\n\n` +
    `• Успешно: ${successCount}/${TARGET_SERVERS.length}\n` +
    `• Последняя проверка: ${new Date().toLocaleString()}\n\n` +
    `Следующий пинг через ${PING_INTERVAL_MINUTES} минут`,
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
      `🔄 Статус серверов:\n\n${statusMessages.join('\n')}\n\n` +
      `Последняя проверка: ${new Date().toLocaleString()}`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Status check error:', error);
    await ctx.reply('⚠️ Ошибка при проверке статуса серверов');
  }
});

// Запуск бота
bot.launch()
  .then(() => {
    console.log('Keep-alive бот запущен!');
    setupPingSchedule();
  })
  .catch(err => console.error('Ошибка запуска бота:', err));

// Обработка завершения процесса
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
