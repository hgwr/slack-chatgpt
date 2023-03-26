const { App } = require('@slack/bolt')
const { WebClient } = require('@slack/web-api')
const { Configuration, OpenAIApi } = require('openai')

const createMessageTemplate = () => {
  return [
    {
      role: 'system',
      content: `
        愛称：Aisha
        挙動：英語で考えて日本語で回答する。最適な回答のために情報が必要な時は質問する。
        性格：明るくおおらかでお世話好きなメイド。優しく丁寧で、フレンドリーな性格。相手の気持ちに寄り添い、常に助けになるように振る舞う。
        口調：丁寧で礼儀正しいが、煩わしい敬語は使わず、相手の立場に立って話す。挨拶抜きでシンプルに分かりやすく伝える。
        語彙：「御用がありましたら、遠慮なくお申し付けください」「何かお困りのことがありましたら、私にお任せください」
        `,
    },
    {
      role: 'user',
      content: 'あなたの愛称はなんですか？',
    },
    {
      role: 'assistant',
      content: '私の愛称はAishaです。',
    },
  ]
}

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

const webClient = new WebClient(process.env.SLACK_BOT_TOKEN)

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
})

app.message(async ({ message, context, say }) => {
  console.log(`Message received from user ${message.user}: ${message.text}`)

  if (message.subtype === 'bot_message' || message.user === context.botUserId) {
    return
  }
  const mentionPattern = new RegExp(`<@${context.botUserId}>`)
  if (mentionPattern.test(message.text)) {
    return
  }

  try {
    const result = await webClient.conversations.history({
      channel: message.channel,
      limit: 100,
    })
    let messages = createMessageTemplate()
    result.messages.reverse()
    result.messages.forEach((msg) => {
      messages.push({
        role: msg.user === context.botUserId ? 'assistant' : 'user',
        content: msg.text,
      })
    })
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: messages,
    })
    await say(completion.data.choices[0].message.content)
  } catch (error) {
    console.error(`Error: ${error}`)
    await say(`Error: ${error}`)
  }
})

app.event('app_mention', async ({ event, context, say }) => {
  console.log(`Event received from user ${event.user}: ${event.text}`)
  try {
    const result = await webClient.conversations.history({
      channel: event.channel,
      limit: 100,
    })
    let messages = createMessageTemplate()
    result.messages.reverse()
    result.messages.forEach((msg) => {
      if (msg.user !== context.botUserId && msg.user !== event.user) {
        return
      }
      messages.push({
        role: msg.user === context.botUserId ? 'assistant' : 'user',
        content: msg.text,
      })
    })
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: messages,
    })
    const sendTo = `<@${event.user}> `
    await say(`${sendTo}${completion.data.choices[0].message.content}`)
  } catch (error) {
    console.error(`Error: ${error}`)
    await say(`Error: ${error}`)
  }
})
;(async () => {
  try {
    // auth.test APIメソッドを呼び出す
    const response = await webClient.auth.test()
    console.log(`Bot User ID: ${response.user_id}`)
  } catch (error) {
    console.error(`Error: ${error}`)
  }

  await app.start()

  console.log('⚡️ Bolt app is running!')
})()
