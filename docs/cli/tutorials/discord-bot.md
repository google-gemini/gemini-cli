# Creating a Discord Bot

This tutorial shows you how to create a Discord bot that uses Gemini to answer questions.

## Prerequisites

- A [Discord account](https://discord.com/register)
- A [Discord bot token](https://discord.com/developers/applications)
- [Node.js](https://nodejs.org/) version 18 or higher

## 1. Create a new project

Create a new directory and initialize a new Node.js project:

```bash
mkdir discord-bot
cd discord-bot
npm init -y
```

## 2. Install dependencies

Install the required dependencies:

```bash
npm install discord.js @google/generative-ai
```

## 3. Create the bot

Create a file named `index.js` and add the following code:

```javascript
const { Client, Intents } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async (message) => {
  if (message.author.bot) return;

  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  const result = await model.generateContent(message.content);
  const response = await result.response;
  const text = response.text();

  message.reply(text);
});

client.login(process.env.DISCORD_BOT_TOKEN);
```

## 4. Run the bot

Set your environment variables and run the bot:

```bash
export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
export DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"
node index.js
```

Your bot should now be online and ready to answer questions.
