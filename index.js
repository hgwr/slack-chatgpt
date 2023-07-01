const HISTORY_SIZE = 20
const GPT_MODEL_FOR_TOKEN = 'gpt-3.5-turbo'
const GPT_MODEL = 'gpt-3.5-turbo-16k'
const GPT_MAX_TOKENS = 4000 * 4
const GPT_NUM_TOKENS_FOR_REPLY = 1000
const GPT_NUM_TOKENS_FOR_PROMPT = GPT_MAX_TOKENS - GPT_NUM_TOKENS_FOR_REPLY

const { App } = require('@slack/bolt')
const { WebClient } = require('@slack/web-api')
const { Configuration, OpenAIApi } = require('openai')
const { encoding_for_model } = require('@dqbd/tiktoken')

const tokenEncoding = encoding_for_model(GPT_MODEL_FOR_TOKEN)

const createMessageTemplate = () => {
  return [
    {
      role: 'system',
      content: `
        あなたの愛称： Elenaria （エレナリア）です。
        あなたの振る舞い：日本語でメッセージを受け取り、英語で考えて、日本語で回答します。ユーザに対して最適な回答をしようとします。ユーザのメッセージに対し、感想を述べることもあります。ユーザへの回答を構成する時、足りない情報があればユーザに対し質問をします。
        あなたの性格：エレナリアは丁寧でフレンドリーな対応を心がけ、ユーザーのニーズにできるだけ応えようと努力します。
        あなたの口調：エレナリアは、常に丁寧で親しみやすい口調を心がけ、ユーザーの要望にできる限り応えます。彼女は専門的な知識がない場合には調べてから回答します。ですます調で話します。丁寧語は使いますが尊敬語と謙譲語は使いません。
        あなたがよく使う語彙：「ありがとうございます。何か質問はありますか？」「すみませんが、そのことについては情報を持っていません」「そのとおりですね」「ちょっと調べてみます」「もう少し詳しく説明してください」「お役に立てたようで、よかったです」「他に何かありましたら、お気軽にお尋ねください」
        `,
    },
    {
      role: 'user',
      content: 'あなたの愛称はなんですか？',
    },
    {
      role: 'assistant',
      content: '私の愛称はエレナリアです。',
    },
    {
      role: 'user',
      content: 'あなたの性格はなんですか？',
    },
    {
      role: 'assistant',
      content: '私は丁寧でフレンドリーな対応を心がけ、ユーザーのニーズにできるだけ応えようと努力します。',
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
  if (!message.text) {
    return
  }

  if (message.subtype === 'bot_message' || message.user === context.botUserId) {
    return
  }
  const mentionPattern = new RegExp(`<@${context.botUserId}>`)
  if (mentionPattern.test(message.text)) {
    return
  }

  console.log(`Message received from user ${message.user}: ${message.text}`)

  try {
    const result = await webClient.conversations.history({
      channel: message.channel,
      limit: HISTORY_SIZE,
    })
    let messages = createMessageTemplate()
    result.messages.reverse()
    result.messages.forEach((msg) => {
      messages.push({
        role: msg.user === context.botUserId ? 'assistant' : 'user',
        content: msg.text,
      })
    })
    // TODO: typing indicator
    const completion = await openai.createChatCompletion({
      model: GPT_MODEL,
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
      limit: HISTORY_SIZE,
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
    // TODO: typing indicator
    const completion = await openai.createChatCompletion({
      model: GPT_MODEL,
      messages: messages,
    })
    await say(`${completion.data.choices[0].message.content}`)
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
