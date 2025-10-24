---
title: "Reference: Agent.getTools() | Agents | Mastra Docs"
description: "Documentation for the `.getTools()` method in Mastra agents, which retrieves the tools that the agent can use."
---

# Agent.getTools()
[EN] Source: https://mastra.ai/en/reference/agents/getTools

The `getTools()` method retrieves the tools configured for an agent, resolving them if they're a function. These tools extend the agent's capabilities, allowing it to perform specific actions or access external systems.

## Syntax

```typescript
getTools({ runtimeContext = new RuntimeContext() }: { runtimeContext?: RuntimeContext } = {}): ToolsInput | Promise<ToolsInput>
```

## Parameters

<br />
<PropertiesTable
  content={[
    {
      name: "runtimeContext",
      type: "RuntimeContext",
      isOptional: true,
      description:
        "Runtime context for dependency injection and contextual information.",
    },
  ]}
/>

## Return Value

Returns a `ToolsInput` object or a Promise that resolves to a `ToolsInput` object containing the agent's tools.

## Description

The `getTools()` method is used to access the tools that an agent can use. It resolves the tools, which can be either directly provided as an object or returned from a function.

Tools are a key component of an agent's capabilities, allowing it to:

- Perform specific actions (like fetching data or making calculations)
- Access external systems and APIs
- Execute code or commands
- Interact with databases or other services

## Examples

### Basic Usage

```typescript
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// Create tools using createTool
const addTool = createTool({
  id: "add",
  description: "Add two numbers",
  inputSchema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
  outputSchema: z.number(),
  execute: async ({ context }) => {
    return context.a + context.b;
  },
});

const multiplyTool = createTool({
  id: "multiply",
  description: "Multiply two numbers",
  inputSchema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
  outputSchema: z.number(),
  execute: async ({ context }) => {
    return context.a * context.b;
  },
});

// Create an agent with the tools
const agent = new Agent({
  name: "calculator",
  instructions:
    "You are a calculator assistant that can perform mathematical operations.",
  model: openai("gpt-4o"),
  tools: {
    add: addTool,
    multiply: multiplyTool,
  },
});

// Get the tools
const tools = await agent.getTools();
console.log(Object.keys(tools)); // ["add", "multiply"]
```

### Using with RuntimeContext

```typescript
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// Create an agent with dynamic tools
const agent = new Agent({
  name: "weather-assistant",
  instructions:
    "You are a weather assistant that can provide weather information.",
  model: openai("gpt-4o"),
  tools: ({ runtimeContext }) => {
    // Get API key from runtime context
    const apiKey = runtimeContext.get("weatherApiKey");

    // Create a weather tool with the API key from context
    const weatherTool = createTool({
      id: "getWeather",
      description: "Get the current weather for a location",
      inputSchema: z.object({
        location: z.string().describe("City name"),
      }),
      outputSchema: z.object({
        temperature: z.number(),
        conditions: z.string(),
        humidity: z.number(),
        windSpeed: z.number(),
      }),
      execute: async ({ context }) => {
        // Use the API key from runtime context
        const response = await fetch(
          `https://api.weather.com/current?location=${context.location}&apiKey=${apiKey}`,
        );
        return response.json();
      },
    });

    return {
      getWeather: weatherTool,
    };
  },
});

// Create a runtime context with API key
const context = new RuntimeContext();
context.set("weatherApiKey", "your-api-key");

// Get the tools using the runtime context
const tools = await agent.getTools({ runtimeContext: context });
console.log(Object.keys(tools)); // ["getWeather"]
```


