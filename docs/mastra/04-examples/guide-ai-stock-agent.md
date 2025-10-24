---
title: "Building an AI Stock Agent | Mastra Agents | Guides"
description: Guide on creating a simple stock agent in Mastra to fetch the last day's closing stock price for a given symbol.
---

import { Steps } from "nextra/components";
import YouTube from "@/components/youtube";

# Stock Agent
[EN] Source: https://mastra.ai/en/guides/guide/stock-agent

We're going to create a simple agent that fetches the last day's closing stock price for a given symbol. This example will show you how to create a tool, add it to an agent, and use the agent to fetch stock prices.

<YouTube id="rIaZ4l7y9wo" />

## Project Structure

```
stock-price-agent/
├── src/
│   ├── agents/
│   │   └── stockAgent.ts
│   ├── tools/
│   │   └── stockPrices.ts
│   └── index.ts
├── package.json
└── .env
```

---

<Steps>
## Initialize the Project and Install Dependencies

First, create a new directory for your project and navigate into it:

```bash
mkdir stock-price-agent
cd stock-price-agent
```

Initialize a new Node.js project and install the required dependencies:

```bash copy
npm init -y
npm install @mastra/core@latest zod @ai-sdk/openai
```

Set Up Environment Variables

Create a `.env` file at the root of your project to store your OpenAI API key.

```bash filename=".env" copy
OPENAI_API_KEY=your_openai_api_key
```

Create the necessary directories and files:

```bash
mkdir -p src/agents src/tools
touch src/agents/stockAgent.ts src/tools/stockPrices.ts src/index.ts
```

---

## Create the Stock Price Tool

Next, we'll create a tool that fetches the last day's closing stock price for a given symbol.

```ts filename="src/tools/stockPrices.ts"
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const getStockPrice = async (symbol: string) => {
  const data = await fetch(
    `https://mastra-stock-data.vercel.app/api/stock-data?symbol=${symbol}`,
  ).then((r) => r.json());
  return data.prices["4. close"];
};

export const stockPrices = createTool({
  id: "Get Stock Price",
  inputSchema: z.object({
    symbol: z.string(),
  }),
  description: `Fetches the last day's closing stock price for a given symbol`,
  execute: async ({ context: { symbol } }) => {
    console.log("Using tool to fetch stock price for", symbol);
    return {
      symbol,
      currentPrice: await getStockPrice(symbol),
    };
  },
});
```

---

## Add the Tool to an Agent

We'll create an agent and add the `stockPrices` tool to it.

```ts filename="src/agents/stockAgent.ts"
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

import * as tools from "../tools/stockPrices";

export const stockAgent = new Agent<typeof tools>({
  name: "Stock Agent",
  instructions:
    "You are a helpful assistant that provides current stock prices. When asked about a stock, use the stock price tool to fetch the stock price.",
  model: openai("gpt-4o-mini"),
  tools: {
    stockPrices: tools.stockPrices,
  },
});
```

---

## Set Up the Mastra Instance

We need to initialize the Mastra instance with our agent and tool.

```ts filename="src/index.ts"
import { Mastra } from "@mastra/core";

import { stockAgent } from "./agents/stockAgent";

export const mastra = new Mastra({
  agents: { stockAgent },
});
```

## Serve the Application

Instead of running the application directly, we'll use the `mastra dev` command to start the server. This will expose your agent via REST API endpoints, allowing you to interact with it over HTTP.

In your terminal, start the Mastra server by running:

```bash
mastra dev --dir src
```

This command will allow you to test your stockPrices tool and your stockAgent within the playground.

This will also start the server and make your agent available at:

```
http://localhost:5000/api/agents/stockAgent/generate
```

---

## Test the Agent with cURL

Now that your server is running, you can test your agent's endpoint using `curl`:

```bash
curl -X POST http://localhost:5000/api/agents/stockAgent/generate \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "What is the current stock price of Apple (AAPL)?" }
    ]
  }'
```

**Expected Response:**

You should receive a JSON response similar to:

```json
{
  "text": "The current price of Apple (AAPL) is $174.55.",
  "agent": "Stock Agent"
}
```

This indicates that your agent successfully processed the request, used the `stockPrices` tool to fetch the stock price, and returned the result.

</Steps>


