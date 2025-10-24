---
title: "Agent Overview | Agent Documentation | Mastra"
description: Overview of agents in Mastra, detailing their capabilities and how they interact with tools, workflows, and external systems.
---

# Using Agents
[EN] Source: https://mastra.ai/en/docs/agents/overview

**Agents** are one of the core Mastra primitives. Agents use a language model to decide on a sequence of actions. They can call functions (known as _tools_). You can compose them with *workflows* (the other main Mastra primitive), either by giving an agent a workflow as a tool, or by running an agent from within a workflow.

Agents can run autonomously in a loop, run once, or take turns with a user. You can give short-term, long-term, and working memory of their user interactions. They can stream text or return structured output (ie, JSON). They can access third-party APIs, query knowledge bases, and so on.

## 1. Creating an Agent

To create an agent in Mastra, you use the `Agent` class and define its properties:

```ts showLineNumbers filename="src/mastra/agents/index.ts" copy
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

export const myAgent = new Agent({
  name: "My Agent",
  instructions: "You are a helpful assistant.",
  model: openai("gpt-4o-mini"),
});
```

**Note:** Ensure that you have set the necessary environment variables, such as your OpenAI API key, in your `.env` file:

```.env filename=".env" copy
OPENAI_API_KEY=your_openai_api_key
```

Also, make sure you have the `@mastra/core` package installed:

```bash npm2yarn copy
npm install @mastra/core@latest
```

### Registering the Agent

Register your agent with Mastra to enable logging and access to configured tools and integrations:

```ts showLineNumbers filename="src/mastra/index.ts" copy
import { Mastra } from "@mastra/core";
import { myAgent } from "./agents";

export const mastra = new Mastra({
  agents: { myAgent },
});
```

## 2. Generating and streaming text

### Generating text

Use the `.generate()` method to have your agent produce text responses:

```ts showLineNumbers filename="src/mastra/index.ts" copy
const response = await myAgent.generate([
  { role: "user", content: "Hello, how can you assist me today?" },
]);

console.log("Agent:", response.text);
```

For more details about the generate method and its options, see the [generate reference documentation](/reference/agents/generate).

### Streaming responses

For more real-time responses, you can stream the agent's response:

```ts showLineNumbers filename="src/mastra/index.ts" copy
const stream = await myAgent.stream([
  { role: "user", content: "Tell me a story." },
]);

console.log("Agent:");

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

For more details about streaming responses, see the [stream reference documentation](/reference/agents/stream).

## 3. Structured Output

Agents can return structured data by providing a JSON Schema or using a Zod schema.

### Using JSON Schema

```typescript
const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
  required: ["summary", "keywords"],
};

const response = await myAgent.generate(
  [
    {
      role: "user",
      content:
        "Please provide a summary and keywords for the following text: ...",
    },
  ],
  {
    output: schema,
  },
);

console.log("Structured Output:", response.object);
```

### Using Zod

You can also use Zod schemas for type-safe structured outputs.

First, install Zod:

```bash npm2yarn copy
npm install zod
```

Then, define a Zod schema and use it with the agent:

```ts showLineNumbers filename="src/mastra/index.ts" copy
import { z } from "zod";

// Define the Zod schema
const schema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
});

// Use the schema with the agent
const response = await myAgent.generate(
  [
    {
      role: "user",
      content:
        "Please provide a summary and keywords for the following text: ...",
    },
  ],
  {
    output: schema,
  },
);

console.log("Structured Output:", response.object);
```

### Using Tools

If you need to generate structured output alongside tool calls, you'll need to use the `experimental_output` property instead of `output`. Here's how:

```typescript
const schema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
});

const response = await myAgent.generate(
  [
    {
      role: "user",
      content:
        "Please analyze this repository and provide a summary and keywords...",
    },
  ],
  {
    // Use experimental_output to enable both structured output and tool calls
    experimental_output: schema,
  },
);

console.log("Structured Output:", response.object);
```

<br />

This allows you to have strong typing and validation for the structured data returned by the agent.

## 4. Multi-step tool use

Agents can be enhanced with tools - functions that extend their capabilities beyond text generation. Tools allow agents to perform calculations, access external systems, and process data. Agents not only decide whether to call tools they're given, they determine the parameters that should be given to that tool.

For a detailed guide to creating and configuring tools, see the [Adding Tools documentation](/docs/agents/using-tools-and-mcp), but below are the important things to know.

### Using `maxSteps`

The `maxSteps` parameter controls the maximum number of sequential LLM calls an agent can make, particularly important when using tool calls. By default, it is set to 1 to prevent infinite loops in case of misconfigured tools. You can increase this limit based on your use case:

```ts showLineNumbers filename="src/mastra/agents/index.ts" copy
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import * as mathjs from "mathjs";
import { z } from "zod";

export const myAgent = new Agent({
  name: "My Agent",
  instructions: "You are a helpful assistant that can solve math problems.",
  model: openai("gpt-4o-mini"),
  tools: {
    calculate: {
      description: "Calculator for mathematical expressions",
      schema: z.object({ expression: z.string() }),
      execute: async ({ expression }) => mathjs.evaluate(expression),
    },
  },
});

const response = await myAgent.generate(
  [
    {
      role: "user",
      content:
        "If a taxi driver earns $41 per hour and works 12 hours a day, how much do they earn in one day?",
    },
  ],
  {
    maxSteps: 5, // Allow up to 5 tool usage steps
  },
);
```

### Streaming progress with `onStepFinish`

You can monitor the progress of multi-step operations using the `onStepFinish` callback. This is useful for debugging or providing progress updates to users.

`onStepFinish` is only available when streaming or generating text without structured output.

```ts showLineNumbers filename="src/mastra/agents/index.ts" copy
const response = await myAgent.generate(
  [{ role: "user", content: "Calculate the taxi driver's daily earnings." }],
  {
    maxSteps: 5,
    onStepFinish: ({ text, toolCalls, toolResults }) => {
      console.log("Step completed:", { text, toolCalls, toolResults });
    },
  },
);
```

### Detecting completion with `onFinish`

The `onFinish` callback is available when streaming responses and provides detailed information about the completed interaction. It is called after the LLM has finished generating its response and all tool executions have completed.
This callback receives the final response text, execution steps, token usage statistics, and other metadata that can be useful for monitoring and logging:

```ts showLineNumbers filename="src/mastra/agents/index.ts" copy
const stream = await myAgent.stream(
  [{ role: "user", content: "Calculate the taxi driver's daily earnings." }],
  {
    maxSteps: 5,
    onFinish: ({
      steps,
      text,
      finishReason, // 'complete', 'length', 'tool', etc.
      usage, // token usage statistics
      reasoningDetails, // additional context about the agent's decisions
    }) => {
      console.log("Stream complete:", {
        totalSteps: steps.length,
        finishReason,
        usage,
      });
    },
  },
);
```

## 5. Testing agents locally

Mastra provides a CLI command `mastra dev` to run your agents behind an API. By default, this looks for exported agents in files in the `src/mastra/agents` directory. It generates endpoints for testing your agent (eg `http://localhost:5000/api/agents/myAgent/generate`) and provides a visual playground where you can chat with an agent and view traces.

For more details, see the [Local Dev Playground](/docs/server-db/local-dev-playground) docs.

## Next Steps

- Learn about Agent Memory in the [Agent Memory](./agent-memory.mdx) guide.
- Learn about Agent Tools in the [Agent Tools and MCP](./using-tools-and-mcp.mdx) guide.
- See an example agent in the [Chef Michel](../../guides/guide/chef-michel.mdx) example.


---
title: "Reference: Agent | Agents | Mastra Docs"
description: "Documentation for the Agent class in Mastra, which provides the foundation for creating AI agents with various capabilities."
---

# Agent
[EN] Source: https://mastra.ai/en/reference/agents/agent

The `Agent` class is the foundation for creating AI agents in Mastra. It provides methods for generating responses, streaming interactions, and handling voice capabilities.

## Importing

```typescript
import { Agent } from "@mastra/core/agent";
```

## Constructor

Creates a new Agent instance with the specified configuration.

```typescript
constructor(config: AgentConfig<TAgentId, TTools, TMetrics>)
```

### Parameters

<br />

<PropertiesTable
  content={[
    {
      name: "name",
      type: "string",
      isOptional: false,
      description: "Unique identifier for the agent.",
    },
    {
      name: "description",
      type: "string",
      isOptional: true,
      description:
        "An optional description of the agent\'s purpose and capabilities.",
    },
    {
      name: "instructions",
      type: "string | ({ runtimeContext: RuntimeContext }) => string | Promise<string>",
      isOptional: false,
      description:
        "Instructions that guide the agent's behavior. Can be a static string or a function that returns a string.",
    },
    {
      name: "model",
      type: "MastraLanguageModel | ({ runtimeContext: RuntimeContext }) => MastraLanguageModel | Promise<MastraLanguageModel>",
      isOptional: false,
      description:
        "The language model to use for generating responses. Can be a model instance or a function that returns a model.",
    },
    {
      name: "tools",
      type: "ToolsInput | ({ runtimeContext: RuntimeContext }) => ToolsInput | Promise<ToolsInput>",
      isOptional: true,
      description:
        "Tools that the agent can use. Can be a static object or a function that returns tools.",
    },
    {
      name: "defaultGenerateOptions",
      type: "AgentGenerateOptions",
      isOptional: true,
      description: "Default options to use when calling generate().",
    },
    {
      name: "defaultStreamOptions",
      type: "AgentStreamOptions",
      isOptional: true,
      description: "Default options to use when calling stream().",
    },
    {
      name: "workflows",
      type: "Record<string, NewWorkflow> | ({ runtimeContext: RuntimeContext }) => Record<string, NewWorkflow> | Promise<Record<string, NewWorkflow>>",
      isOptional: true,
      description:
        "Workflows that the agent can execute. Can be a static object or a function that returns workflows.",
    },
    {
      name: "evals",
      type: "Record<string, Metric>",
      isOptional: true,
      description: "Evaluation metrics for assessing agent performance.",
    },
    {
      name: "memory",
      type: "MastraMemory",
      isOptional: true,
      description:
        "Memory system for the agent to store and retrieve information.",
    },
    {
      name: "voice",
      type: "CompositeVoice",
      isOptional: true,
      description:
        "Voice capabilities for speech-to-text and text-to-speech functionality.",
    },
  ]}
/>