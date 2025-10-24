---
title: "Reference: Agent.getModel() | Agents | Mastra Docs"
description: "Documentation for the `.getModel()` method in Mastra agents, which retrieves the language model that powers the agent."
---

# Agent.getModel()
[EN] Source: https://mastra.ai/en/reference/agents/getModel

The `getModel()` method retrieves the language model configured for an agent, resolving it if it's a function. This method is used to access the underlying model that powers the agent's capabilities.

## Syntax

```typescript
getModel({ runtimeContext = new RuntimeContext() }: { runtimeContext?: RuntimeContext } = {}): MastraLanguageModel | Promise<MastraLanguageModel>
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

Returns a `MastraLanguageModel` instance or a Promise that resolves to a `MastraLanguageModel` instance.

## Description

The `getModel()` method is used to access the language model that powers an agent. It resolves the model, which can be either directly provided or returned from a function.

The language model is a crucial component of an agent as it determines:

- The quality and capabilities of the agent's responses
- The available features (like function calling, structured output, etc.)
- The cost and performance characteristics of the agent

## Examples

### Basic Usage

```typescript
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

// Create an agent with a static model
const agent = new Agent({
  name: "assistant",
  instructions: "You are a helpful assistant.",
  model: openai("gpt-4o"),
});

// Get the model
const model = await agent.getModel();
console.log(model.id); // "gpt-4o"
```

### Using with RuntimeContext

```typescript
import { Agent } from "@mastra/core/agent";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

// Create an agent with dynamic model selection
const agent = new Agent({
  name: "dynamic-model-assistant",
  instructions: "You are a helpful assistant.",
  model: ({ runtimeContext }) => {
    // Dynamic model selection based on runtime context
    const preferredProvider = runtimeContext.get("preferredProvider");
    const highQuality = runtimeContext.get("highQuality") === true;

    if (preferredProvider === "anthropic") {
      return highQuality
        ? anthropic("claude-3-opus")
        : anthropic("claude-3-sonnet");
    }

    // Default to OpenAI
    return highQuality ? openai("gpt-4o") : openai("gpt-4.1-nano");
  },
});

// Create a runtime context with preferences
const context = new RuntimeContext();
context.set("preferredProvider", "anthropic");
context.set("highQuality", true);

// Get the model using the runtime context
const model = await agent.getModel({ runtimeContext: context });
console.log(model.id); // "claude-3-opus"
```


