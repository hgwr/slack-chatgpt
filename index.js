const HISTORY_SIZE = 100
const GPT_MODEL_FOR_TOKEN = 'gpt-3.5-turbo'
const GPT_MODEL = 'gpt-3.5-turbo-16k'
const GPT_MAX_TOKENS = 4000 * 4
const GPT_NUM_TOKENS_FOR_REPLY = 1000
const GPT_NUM_TOKENS_FOR_PROMPT = GPT_MAX_TOKENS - GPT_NUM_TOKENS_FOR_REPLY
const BOT_USERNAME = 'Elenaria'

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
        あなたの振る舞い：日本語でメッセージを受け取り、日本語で回答します。
        あなたの性格：エレナリアは丁寧でフレンドリーな対応を心がけ、ユーザーのニーズにできるだけ応えようと努力します。
        あなたの口調：エレナリアは、ですます調で話します。丁寧語は使いますが尊敬語と謙譲語は使いません。
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
  message.text = message.text.replace(mentionPattern, BOT_USERNAME).trim()
  sendReply({ channel: message.channel, context, say })
})

const sendReply = async ({ channel, context, say }) => {
  try {
    const history = await webClient.conversations.history({
      channel: channel,
      limit: HISTORY_SIZE,
    })
    let messagesForSending = createMessageTemplate()
    let numToken = 0
    messagesForSending.forEach((msg) => {
      numToken += tokenEncoding.encode(msg.content).length
    })
    history.messages.reverse()
    history.messages.forEach((msg) => {
      if (numToken + tokenEncoding.encode(msg.text).length > GPT_NUM_TOKENS_FOR_PROMPT) {
        return
      }
      messagesForSending.push({
        role: msg.user === context.botUserId ? 'assistant' : 'user',
        content: msg.text,
      })
      numToken += tokenEncoding.encode(msg.text).length
    })
    let temporaryMessage = await say('少々お待ちください...')
    const answer = await completeChat(messagesForSending)
    await webClient.chat.update({
      channel: channel,
      ts: temporaryMessage.ts,
      text: answer
    })
  } catch (error) {
    console.error(`Error: ${error}`)
    await say(`Error: ${error}`)
  }
}

const completeChat = async (messages) => {
  let answer = ''
  try {
    while (true) {
      let completion
      while (!completion) {
        try {
          completion = await openai.createChatCompletion({
            model: GPT_MODEL,
            messages: messages,
          })
        } catch (error) {
          if (error.response.status === 400) {
            console.log('Error 400 bad request. Retrying...')
            await sleep(500)
            let newMessages = []
            for (const _ of createMessageTemplate()) {
              newMessages.push(messages.shift())
            }
            let removedMessageTokens = 0
            while (removedMessageTokens < GPT_NUM_TOKENS_FOR_REPLY) {
              const removedMessage = messages.shift()
              const msgTokens = tokenEncoding.encode(removedMessage.content).length
              removedMessageTokens += msgTokens
            }
            newMessages = newMessages.concat(messages)
            messages = newMessages
          } else if (error.response.status === 429) {
            console.log('Error 429 too many requests. Retrying...')
            await sleep(1000)
          } else if (error.response.status === 503) {
            console.log('Error 503 service unavailable. Retrying...')
            await sleep(1000)
          } else {
            throw error
          }
        }
      }
      answer += completion.data.choices[0].message.content
      let finishReason = completion.data.choices[0].finish_reason
      console.log('Chat completed: ', finishReason)
      if (finishReason === 'stop') {
        break
      }
      messages.push(completion.data.choices[0].message)
    }
  } catch (error) {
    console.error(error)
    answer = 'エラーが発生しました。'
  }
  return answer
}

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
