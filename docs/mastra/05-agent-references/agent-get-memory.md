---
title: "Reference: Agent.getMemory() | Agents | Mastra Docs"
description: "Documentation for the `.getMemory()` method in Mastra agents, which retrieves the memory system associated with the agent."
---

# Agent.getMemory()
[EN] Source: https://mastra.ai/en/reference/agents/getMemory

The `getMemory()` method retrieves the memory system associated with an agent. This method is used to access the agent's memory capabilities for storing and retrieving information across conversations.

## Syntax

```typescript
getMemory(): MastraMemory | undefined
```

## Parameters

This method does not take any parameters.

## Return Value

Returns a `MastraMemory` instance if a memory system is configured for the agent, or `undefined` if no memory system is configured.

## Description

The `getMemory()` method is used to access the memory system associated with an agent. Memory systems allow agents to:

- Store and retrieve information across multiple interactions
- Maintain conversation history
- Remember user preferences and context
- Provide personalized responses based on past interactions

This method is often used in conjunction with `hasOwnMemory()` to check if an agent has a memory system before attempting to use it.

## Examples

### Basic Usage

```typescript
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { openai } from "@ai-sdk/openai";

// Create a memory system
const memory = new Memory();

// Create an agent with memory
const agent = new Agent({
  name: "memory-assistant",
  instructions:
    "You are a helpful assistant that remembers previous conversations.",
  model: openai("gpt-4o"),
  memory,
});

// Get the memory system
const agentMemory = agent.getMemory();

if (agentMemory) {
  // Use the memory system to retrieve thread messages
  const thread = await agentMemory.getThreadById({
    resourceId: "user-123",
    threadId: "conversation-1",
  });

  console.log("Retrieved thread:", thread);
}
```

### Checking for Memory Before Using

```typescript
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

// Create an agent without memory
const agent = new Agent({
  name: "stateless-assistant",
  instructions: "You are a helpful assistant.",
  model: openai("gpt-4o"),
});

// Check if the agent has memory before using it
if (agent.hasOwnMemory()) {
  const memory = agent.getMemory();
  // Use memory...
} else {
  console.log("This agent does not have a memory system.");
}
```

### Using Memory in a Conversation

```typescript
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { openai } from "@ai-sdk/openai";

// Create a memory system
const memory = new Memory();

// Create an agent with memory
const agent = new Agent({
  name: "memory-assistant",
  instructions:
    "You are a helpful assistant that remembers previous conversations.",
  model: openai("gpt-4o"),
  memory,
});

// First interaction - store information
await agent.generate("My name is Alice.", {
  resourceId: "user-123",
  threadId: "conversation-1",
});

// Later interaction - retrieve information
const result = await agent.generate("What's my name?", {
  resourceId: "user-123",
  threadId: "conversation-1",
});

console.log(result.text); // Should mention "Alice"

// Access the memory system directly
const agentMemory = agent.getMemory();
if (agentMemory) {
  // Retrieve messages from the thread
  const { messages } = await agentMemory.query({
    resourceId: "user-123",
    threadId: "conversation-1",
    selectBy: {
      last: 10, // Get the last 10 messages
    },
  });

  console.log("Retrieved messages:", messages);
}
```


