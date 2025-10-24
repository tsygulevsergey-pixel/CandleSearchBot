---
title: "Reference: Agent.getVoice() | Agents | Mastra Docs"
description: "Documentation for the `.getVoice()` method in Mastra agents, which retrieves the voice provider for speech capabilities."
---

# Agent.getVoice()
[EN] Source: https://mastra.ai/en/reference/agents/getVoice

The `getVoice()` method retrieves the voice provider configured for an agent, resolving it if it's a function. This method is used to access the agent's speech capabilities for text-to-speech and speech-to-text functionality.

## Syntax

```typescript
getVoice({ runtimeContext }: { runtimeContext?: RuntimeContext } = {}): CompositeVoice | Promise<CompositeVoice>
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
        "Runtime context for dependency injection and contextual information. Defaults to a new RuntimeContext instance if not provided.",
    },
  ]}
/>

## Return Value

Returns a `CompositeVoice` instance or a Promise that resolves to a `CompositeVoice` instance. If no voice provider was configured for the agent, it returns a default voice provider.

## Description

The `getVoice()` method is used to access the voice capabilities of an agent. It resolves the voice provider, which can be either directly provided or returned from a function.

The voice provider enables:

- Text-to-speech conversion (speaking)
- Speech-to-text conversion (listening)
- Retrieving available speakers/voices

## Examples

### Basic Usage

```typescript
import { Agent } from "@mastra/core/agent";
import { ElevenLabsVoice } from "@mastra/voice-elevenlabs";
import { openai } from "@ai-sdk/openai";

// Create an agent with a voice provider
const agent = new Agent({
  name: "voice-assistant",
  instructions: "You are a helpful voice assistant.",
  model: openai("gpt-4o"),
  voice: new ElevenLabsVoice({
    apiKey: process.env.ELEVENLABS_API_KEY,
  }),
});

// Get the voice provider
const voice = await agent.getVoice();

// Use the voice provider for text-to-speech
const audioStream = await voice.speak("Hello, how can I help you today?");

// Use the voice provider for speech-to-text
const transcription = await voice.listen(audioStream);

// Get available speakers
const speakers = await voice.getSpeakers();
console.log(speakers);
```

### Using with RuntimeContext

```typescript
import { Agent } from "@mastra/core/agent";
import { ElevenLabsVoice } from "@mastra/voice-elevenlabs";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { openai } from "@ai-sdk/openai";

// Create an agent with a dynamic voice provider
const agent = new Agent({
  name: "voice-assistant",
  instructions: ({ runtimeContext }) => {
    // Dynamic instructions based on runtime context
    const instructions = runtimeContext.get("preferredVoiceInstructions");
    return instructions || "You are a helpful voice assistant.";
  },
  model: openai("gpt-4o"),
  voice: new ElevenLabsVoice({
    apiKey: process.env.ELEVENLABS_API_KEY,
  }),
});

// Create a runtime context with preferences
const context = new RuntimeContext();
context.set("preferredVoiceInstructions", "You are an evil voice assistant");

// Get the voice provider using the runtime context
const voice = await agent.getVoice({ runtimeContext: context });

// Use the voice provider
const audioStream = await voice.speak("Hello, how can I help you today?");
```


