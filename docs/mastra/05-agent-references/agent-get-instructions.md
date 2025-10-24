---
title: "Reference: Agent.getInstructions() | Agents | Mastra Docs"
description: "Documentation for the `.getInstructions()` method in Mastra agents, which retrieves the instructions that guide the agent's behavior."
---

# Agent.getInstructions()
[EN] Source: https://mastra.ai/en/reference/agents/getInstructions

The `getInstructions()` method retrieves the instructions configured for an agent, resolving them if they're a function. These instructions guide the agent's behavior and define its capabilities and constraints.

## Syntax

```typescript
getInstructions({ runtimeContext }: { runtimeContext?: RuntimeContext } = {}): string | Promise<string>
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

Returns a string or a Promise that resolves to a string containing the agent's instructions.

## Description

The `getInstructions()` method is used to access the instructions that guide an agent's behavior. It resolves the instructions, which can be either directly provided as a string or returned from a function.

Instructions are a critical component of an agent's configuration as they define:

- The agent's role and personality
- Task-specific guidance
- Constraints on the agent's behavior
- Context for handling user requests

## Examples

### Basic Usage

```typescript
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

// Create an agent with static instructions
const agent = new Agent({
  name: "assistant",
  instructions:
    "You are a helpful assistant that provides concise and accurate information.",
  model: openai("gpt-4o"),
});

// Get the instructions
const instructions = await agent.getInstructions();
console.log(instructions); // "You are a helpful assistant that provides concise and accurate information."
```

### Using with RuntimeContext

```typescript
import { Agent } from "@mastra/core/agent";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { openai } from "@ai-sdk/openai";

// Create an agent with dynamic instructions
const agent = new Agent({
  name: "contextual-assistant",
  instructions: ({ runtimeContext }) => {
    // Dynamic instructions based on runtime context
    const userPreference = runtimeContext.get("userPreference");
    const expertise = runtimeContext.get("expertise") || "general";

    if (userPreference === "technical") {
      return `You are a technical assistant specializing in ${expertise}. Provide detailed technical explanations.`;
    }

    return `You are a helpful assistant providing easy-to-understand information about ${expertise}.`;
  },
  model: openai("gpt-4o"),
});

// Create a runtime context with user preferences
const context = new RuntimeContext();
context.set("userPreference", "technical");
context.set("expertise", "machine learning");

// Get the instructions using the runtime context
const instructions = await agent.getInstructions({ runtimeContext: context });
console.log(instructions); // "You are a technical assistant specializing in machine learning. Provide detailed technical explanations."
```


