const Telegraf = require('telegraf');
const rateLimit = require('telegraf-ratelimit');
const Stage = require('telegraf/stage');
const session = require('telegraf/session');
const redis = require('redis');
const MongoInit = require('./utils/mongoDB/mongoInit');
const actions = require('./actions');
const {dlMongoListener, articleMongoListener, addChatMongoListener, userMongoListener} = require('./utils/mongoDB/mongoListener');
const tmzEditor = require('./utils/tmzEditor');
const {etiquette, weatherApp, getArticle, delorian, respect, postme} = require('./handlers');

const redisClient = redis.createClient()
  .on('connect', () => {
  console.log('Соединение с БД "redis" установлено');
  })
  .on('error', (err) => {
    throw err
  })

require('dotenv').config();


const db = new MongoInit(`${process.env.MONGODB_URI}/delorian`);


const bot = new Telegraf(process.env.TELETOKEN_DEV, {channelMode: true} );
const stage = new Stage();

const limitConfig = {
  window: 1000,
  limit: 1,
  onLimitExceeded: (ctx) => {
    if (ctx.callbackQuery) {
      ctx.answerCbQuery('Не надо так часто жать на кнопочку');
      return;
    }
  }
};
bot.use(rateLimit(limitConfig));
bot.use(session());
bot.use(stage.middleware());

actions.sendToRegister.forEach(scene => { //регистрируем сцены из actions.js
  stage.register(scene);
})


bot.use((ctx, next) => {
  ctx.state.redis = redisClient;
  ctx.getChat(ctx.chat.id)
    .then( thisChat => {
      addChatMongoListener(thisChat, ctx)
        .then( msg => console.log(msg));
    });
  userMongoListener(ctx)
  .then( thisUser => {
    if (typeof(thisUser) === 'string') {
      console.log(thisUser);
    }
  })
  .catch( err => {
    console.log(err)
  });
  const start = new Date();  
  return next(ctx).then(() => {
    const ms = new Date() - start;
    console.log('Response time %sms', ms);

  });
});

bot.on('left_chat_member', etiquette);
bot.on('new_chat_members', etiquette);

bot.hears(/(с|С)татья (.+)/, getArticle);
bot.hears(/(п|П)огода [а-яА-Яa-zA-Z-]+/, weatherApp );

bot.command('delorian', ctx => {
  delorian.replys(ctx);
});

bot.hears(/\/postme (.+)/, (ctx) => {
  postme.replys(ctx);

});
bot.command('postme', (ctx) => {
  const messageId = ctx.channelPost ? ctx.channelPost.message_id : ctx.message.message_id;
  const chatInstance = JSON.stringify( { [ctx.chat.id]: messageId });
  redisClient.set("chatsPostme", chatInstance, redis.print);
  postme.replys(ctx);
});
bot.on('message', (ctx, next) => {
  if (ctx.from.id === +process.env.SHEN_VISOR) {
    redisClient.get("currentChat", (err, result) => {
      const parsedResult = JSON.parse(result);
      ctx.state.correctChat = parsedResult;
      postme.getPost(ctx, true);
      redisClient.del('currentChat');
    })
  }
  next();
})

bot.hears(/\/respect (.+)/, (ctx) => {
  respect(ctx, bot);
});
bot.hears(/\/tmz\s(.+)/, (ctx) => {
  tmzEditor(ctx);
});

bot.command('help', ctx => {
  ctx.reply(`
  Многофункциональный бот-помощник <i>Shen</i>🤖.\n
  Если вы используете бота в 🗣группе или 📣канале - не забудьте дать ему права администратора. Это необходимо чтобы бот мог реагировать на ваши команды. Такова политика безопасности <i>Telegram</i>.
  По умолчанию Ваш часовой пояс UTC+3 (г. Москва).  Если вы в другом регионе то воспользуйтесь командой <code>/tmz +\\-число</code>. Корректный часовой пояс важен для работы некоторого функционала бота.\n
  <b>Способности бота:</b>\n
  1. <code>/delorian</code> - отправить сообщение в будущее (напоминалка).\n
  2. <code>/respect</code> <i>текс</i> - лайки и дизлайки к <i>тексту</i>.\n
  3. <code>Статья</code> <i>ресурс</i> - для запроса свежей рандомной статьи (вбей вместо <i>ресурса</i> "список" или "list" – для получения перечня ресурсов).\n
  4. <code>/postme</code> - рандомный контент из доступного списка групп и каналов, в меню настроек можешь добавить свою группу\\канал как источник, тем самым делясь контентом с другими. Для настройки пиши "/postme options". Если у вас приватная группа, то добавьте в нее @shen_visor, он поможет боту отработать корректно!\n
  По всем вопросам и предложениям к @dezamat .
  `, Telegraf.Extra.HTML(true));
})

dlMongoListener(bot);
articleMongoListener();

bot.on('callback_query', actions.callbackQuerys);


bot.catch((err) => {
  console.log('Ooops', err);
});

bot.launch();

