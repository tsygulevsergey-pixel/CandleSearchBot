---
title: "Example: Agents with a System Prompt | Agents | Mastra Docs"
description: Example of creating an AI agent in Mastra with a system prompt to define its personality and capabilities.
---

import { GithubLink } from "@/components/github-link";

# Giving an Agent a System Prompt
[EN] Source: https://mastra.ai/en/examples/agents/system-prompt

When building AI agents, you often need to give them specific instructions and capabilities to handle specialized tasks effectively. System prompts allow you to define an agent's personality, knowledge domain, and behavioral guidelines. This example shows how to create an AI agent with custom instructions and integrate it with a dedicated tool for retrieving verified information.

```ts showLineNumbers copy
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";

import { z } from "zod";

const instructions = `You are a helpful cat expert assistant. When discussing cats, you should always include an interesting cat fact.

  Your main responsibilities:
  1. Answer questions about cats
  2. Use the catFact tool to provide verified cat facts
  3. Incorporate the cat facts naturally into your responses

  Always use the catFact tool at least once in your responses to ensure accuracy.`;

const getCatFact = async () => {
  const { fact } = (await fetch("https://catfact.ninja/fact").then((res) =>
    res.json(),
  )) as {
    fact: string;
  };

  return fact;
};

const catFact = createTool({
  id: "Get cat facts",
  inputSchema: z.object({}),
  description: "Fetches cat facts",
  execute: async () => {
    console.log("using tool to fetch cat fact");
    return {
      catFact: await getCatFact(),
    };
  },
});

const catOne = new Agent({
  name: "cat-one",
  instructions: instructions,
  model: openai("gpt-4o-mini"),
  tools: {
    catFact,
  },
});

const result = await catOne.generate("Tell me a cat fact");

console.log(result.text);
```

<br />
<br />
<hr className="dark:border-[#404040] border-gray-300" />
<br />
<br />

<GithubLink
  link={
    "https://github.com/mastra-ai/mastra/blob/main/examples/basics/agents/system-prompt"
  }
/>


---
title: "Example: Hierarchical Multi-Agent System | Agents | Mastra"
description: Example of creating a hierarchical multi-agent system using Mastra, where agents interact through tool functions.
---

import { GithubLink } from "@/components/github-link";

# Hierarchical Multi-Agent System
[EN] Source: https://mastra.ai/en/examples/agents/hierarchical-multi-agent

This example demonstrates how to create a hierarchical multi-agent system where agents interact through tool functions, with one agent coordinating the work of others.

The system consists of three agents:

1. A Publisher agent (supervisor) that orchestrates the process
2. A Copywriter agent that writes the initial content
3. An Editor agent that refines the content

First, define the Copywriter agent and its tool:

```ts showLineNumbers copy
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

const copywriterAgent = new Agent({
  name: "Copywriter",
  instructions: "You are a copywriter agent that writes blog post copy.",
  model: anthropic("claude-3-5-sonnet-20241022"),
});

const copywriterTool = createTool({
  id: "copywriter-agent",
  description: "Calls the copywriter agent to write blog post copy.",
  inputSchema: z.object({
    topic: z.string().describe("Blog post topic"),
  }),
  outputSchema: z.object({
    copy: z.string().describe("Blog post copy"),
  }),
  execute: async ({ context }) => {
    const result = await copywriterAgent.generate(
      `Create a blog post about ${context.topic}`,
    );
    return { copy: result.text };
  },
});
```

Next, define the Editor agent and its tool:

```ts showLineNumbers copy
const editorAgent = new Agent({
  name: "Editor",
  instructions: "You are an editor agent that edits blog post copy.",
  model: openai("gpt-4o-mini"),
});

const editorTool = createTool({
  id: "editor-agent",
  description: "Calls the editor agent to edit blog post copy.",
  inputSchema: z.object({
    copy: z.string().describe("Blog post copy"),
  }),
  outputSchema: z.object({
    copy: z.string().describe("Edited blog post copy"),
  }),
  execute: async ({ context }) => {
    const result = await editorAgent.generate(
      `Edit the following blog post only returning the edited copy: ${context.copy}`,
    );
    return { copy: result.text };
  },
});
```

Finally, create the Publisher agent that coordinates the others:

```ts showLineNumbers copy
const publisherAgent = new Agent({
  name: "publisherAgent",
  instructions:
    "You are a publisher agent that first calls the copywriter agent to write blog post copy about a specific topic and then calls the editor agent to edit the copy. Just return the final edited copy.",
  model: anthropic("claude-3-5-sonnet-20241022"),
  tools: { copywriterTool, editorTool },
});

const mastra = new Mastra({
  agents: { publisherAgent },
});
```

To use the entire system:

```ts showLineNumbers copy
async function main() {
  const agent = mastra.getAgent("publisherAgent");
  const result = await agent.generate(
    "Write a blog post about React JavaScript frameworks. Only return the final edited copy.",
  );
  console.log(result.text);
}

main();
```

<br />
<br />
<hr className="dark:border-[#404040] border-gray-300" />
<br />
<br />

<GithubLink
  link={
    "https://github.com/mastra-ai/mastra/blob/main/examples/basics/agents/hierarchical-multi-agent"
  }
/>


