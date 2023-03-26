const { App } = require('@slack/bolt');
const { WebClient } = require('@slack/web-api');

const webClient = new WebClient(process.env.SLACK_BOT_TOKEN);
let botUserId;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  // ソケットモードではポートをリッスンしませんが、アプリを OAuth フローに対応させる場合、
  // 何らかのポートをリッスンする必要があります
  port: process.env.PORT || 3000
});

app.message('hello', async ({ message, say }) => {
  if (botUserId && message.user !== botUserId) {
    await say(`Hey there <@${message.user}>!`);
  }
  console.log(message)
});

app.message(async ({ message, context, say }) => {
  console.log(`Message received from user ${message.user}: ${message.text}`)

  if (botUserId && message.user === botUserId) {
    console.log('Message is not from a bot user, ignoring 1')
    return;
  }

  if (message.subtype === 'bot_message' || message.user === context.botUserId) {
    console.log('Message is from a bot user, ignoring 2')
    return;
  }

  const mentionPattern = new RegExp(`<@${context.botUserId}>`);
  if (mentionPattern.test(message.text)) {
    console.log('Message is a mention, ignoring 3')
    return;
  }

  await say(`Hey there <@${message.user}>!`)

  await next();
});

app.event('app_mention', async ({ event, context, say }) => {
  console.log(`Event received from user ${event.user}: ${event.text}`)
  await say(`メンションありがとう。 <@${event.user}>!`)
});

(async () => {
  try {
    // auth.test APIメソッドを呼び出す
    const response = await webClient.auth.test();
    botUserId = response.user_id;
    console.log(`BotのユーザーID: ${botUserId}`);
  } catch (error) {
    console.error(`Error: ${error}`);
  }

  await app.start();

  console.log('⚡️ Bolt app is running!');
})();
