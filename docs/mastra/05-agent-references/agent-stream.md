---
title: "Reference: Agent.stream() | Streaming | Agents | Mastra Docs"
description: Documentation for the `.stream()` method in Mastra agents, which enables real-time streaming of responses.
---

# `stream()`
[EN] Source: https://mastra.ai/en/reference/agents/stream

The `stream()` method enables real-time streaming of responses from an agent. This method accepts `messages` and an optional `options` object as parameters, similar to `generate()`.

## Parameters

### `messages`

The `messages` parameter can be:

- A single string
- An array of strings
- An array of message objects with `role` and `content` properties

The message object structure:

```typescript
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}
```

### `options` (Optional)

An optional object that can include configuration for output structure, memory management, tool usage, telemetry, and more.

<PropertiesTable
  content={[
    {
      name: "abortSignal",
      type: "AbortSignal",
      isOptional: true,
      description:
        "Signal object that allows you to abort the agent's execution. When the signal is aborted, all ongoing operations will be terminated.",
    },
    {
      name: "context",
      type: "CoreMessage[]",
      isOptional: true,
      description: "Additional context messages to provide to the agent.",
    },
    {
      name: "experimental_output",
      type: "Zod schema | JsonSchema7",
      isOptional: true,
      description:
        "Enables structured output generation alongside text generation and tool calls. The model will generate responses that conform to the provided schema.",
    },
    {
      name: "instructions",
      type: "string",
      isOptional: true,
      description:
        "Custom instructions that override the agent's default instructions for this specific generation. Useful for dynamically modifying agent behavior without creating a new agent instance.",
    },
    {
      name: "memory",
      type: "object",
      isOptional: true,
      description: "Configuration for memory. This is the preferred way to manage memory.",
      properties: [
        {
          parameters: [{
              name: "thread",
              type: "string | { id: string; metadata?: Record<string, any>, title?: string }",
              isOptional: false,
              description: "The conversation thread, as a string ID or an object with an `id` and optional `metadata`."
          }]
        },
        {
          parameters: [{
              name: "resource",
              type: "string",
              isOptional: false,
              description: "Identifier for the user or resource associated with the thread."
          }]
        },
        {
          parameters: [{
              name: "options",
              type: "MemoryConfig",
              isOptional: true,
              description: "Configuration for memory behavior, like message history and semantic recall. See `MemoryConfig` below."
          }]
        }
      ]
    },
    {
      name: "maxSteps",
      type: "number",
      isOptional: true,
      defaultValue: "5",
      description: "Maximum number of steps allowed during streaming.",
    },
    {
      name: "maxRetries",
      type: "number",
      isOptional: true,
      defaultValue: "2",
      description: "Maximum number of retries. Set to 0 to disable retries.",
    },
    {
      name: "memoryOptions",
      type: "MemoryConfig",
      isOptional: true,
      description:
        "**Deprecated.** Use `memory.options` instead. Configuration options for memory management. See MemoryConfig section below for details.",
    },
    {
      name: "onFinish",
      type: "StreamTextOnFinishCallback | StreamObjectOnFinishCallback",
      isOptional: true,
      description: "Callback function called when streaming is complete.",
    },
    {
      name: "onStepFinish",
      type: "GenerateTextOnStepFinishCallback<any> | never",
      isOptional: true,
      description:
        "Callback function called after each step during streaming. Unavailable for structured output",
    },
    {
      name: "output",
      type: "Zod schema | JsonSchema7",
      isOptional: true,
      description:
        "Defines the expected structure of the output. Can be a JSON Schema object or a Zod schema.",
    },
    {
      name: "resourceId",
      type: "string",
      isOptional: true,
      description:
        "**Deprecated.** Use `memory.resource` instead. Identifier for the user or resource interacting with the agent. Must be provided if threadId is provided.",
    },
    {
      name: "telemetry",
      type: "TelemetrySettings",
      isOptional: true,
      description:
        "Settings for telemetry collection during streaming. See TelemetrySettings section below for details.",
    },
    {
      name: "temperature",
      type: "number",
      isOptional: true,
      description:
        "Controls randomness in the model's output. Higher values (e.g., 0.8) make the output more random, lower values (e.g., 0.2) make it more focused and deterministic.",
    },
    {
      name: "threadId",
      type: "string",
      isOptional: true,
      description:
        "**Deprecated.** Use `memory.thread` instead. Identifier for the conversation thread. Allows for maintaining context across multiple interactions. Must be provided if resourceId is provided.",
    },
    {
      name: "toolChoice",
      type: "'auto' | 'none' | 'required' | { type: 'tool'; toolName: string }",
      isOptional: true,
      defaultValue: "'auto'",
      description: "Controls how the agent uses tools during streaming.",
    },
    {
      name: "toolsets",
      type: "ToolsetsInput",
      isOptional: true,
      description:
        "Additional toolsets to make available to the agent during this stream.",
    },
    {
      name: "clientTools",
      type: "ToolsInput",
      isOptional: true,
      description:
        "Tools that are executed on the 'client' side of the request. These tools do not have execute functions in the definition.",
    },
  ]}
/>

#### MemoryConfig

Configuration options for memory management:

<PropertiesTable
  content={[
    {
      name: "lastMessages",
      type: "number | false",
      isOptional: true,
      description:
        "Number of most recent messages to include in context. Set to false to disable.",
    },
    {
      name: "semanticRecall",
      type: "boolean | object",
      isOptional: true,
      description:
        "Configuration for semantic memory recall. Can be boolean or detailed config.",
      properties: [
        {
          type: "number",
          parameters: [
            {
              name: "topK",
              type: "number",
              isOptional: true,
              description:
                "Number of most semantically similar messages to retrieve.",
            },
          ],
        },
        {
          type: "number | object",
          parameters: [
            {
              name: "messageRange",
              type: "number | { before: number; after: number }",
              isOptional: true,
              description:
                "Range of messages to consider for semantic search. Can be a single number or before/after configuration.",
            },
          ],
        },
      ],
    },
    {
      name: "workingMemory",
      type: "object",
      isOptional: true,
      description: "Configuration for working memory.",
      properties: [
        {
          type: "boolean",
          parameters: [
            {
              name: "enabled",
              type: "boolean",
              isOptional: true,
              description: "Whether to enable working memory.",
            },
          ],
        },
        {
          type: "string",
          parameters: [
            {
              name: "template",
              type: "string",
              isOptional: true,
              description: "Template to use for working memory.",
            },
          ],
        },
      ],
    },
    {
      name: "threads",
      type: "object",
      isOptional: true,
      description: "Thread-specific memory configuration.",
      properties: [
        {
          type: "boolean | object",
          parameters: [
            {
              name: "generateTitle",
              type: "boolean | { model: LanguageModelV1 | ((ctx: RuntimeContext) => LanguageModelV1 | Promise<LanguageModelV1>), instructions: string | ((ctx: RuntimeContext) => string | Promise<string>) }",
              isOptional: true,
              description:
                `Controls automatic thread title generation from the user's first message. Can be a boolean to enable/disable using the agent's model, or an object specifying a custom model and/or custom instructions for title generation (useful for cost optimization or title customization).
Example: { model: openai('gpt-4.1-nano'), instructions: 'Generate a concise title based on the initial user message.' }`,
            },
          ],
        },
      ],
    },
  ]}
/>

#### TelemetrySettings

Settings for telemetry collection during streaming:

<PropertiesTable
  content={[
    {
      name: "isEnabled",
      type: "boolean",
      isOptional: true,
      defaultValue: "false",
      description:
        "Enable or disable telemetry. Disabled by default while experimental.",
    },
    {
      name: "recordInputs",
      type: "boolean",
      isOptional: true,
      defaultValue: "true",
      description:
        "Enable or disable input recording. You might want to disable this to avoid recording sensitive information, reduce data transfers, or increase performance.",
    },
    {
      name: "recordOutputs",
      type: "boolean",
      isOptional: true,
      defaultValue: "true",
      description:
        "Enable or disable output recording. You might want to disable this to avoid recording sensitive information, reduce data transfers, or increase performance.",
    },
    {
      name: "functionId",
      type: "string",
      isOptional: true,
      description:
        "Identifier for this function. Used to group telemetry data by function.",
    },
    {
      name: "metadata",
      type: "Record<string, AttributeValue>",
      isOptional: true,
      description:
        "Additional information to include in the telemetry data. AttributeValue can be string, number, boolean, array of these types, or null.",
    },
    {
      name: "tracer",
      type: "Tracer",
      isOptional: true,
      description:
        "A custom OpenTelemetry tracer instance to use for the telemetry data. See OpenTelemetry documentation for details.",
    },
  ]}
/>

## Returns

The return value of the `stream()` method depends on the options provided, specifically the `output` option.

### PropertiesTable for Return Values

<PropertiesTable
  content={[
    {
      name: "textStream",
      type: "AsyncIterable<string>",
      isOptional: true,
      description:
        "Stream of text chunks. Present when output is 'text' (no schema provided) or when using `experimental_output`.",
    },
    {
      name: "objectStream",
      type: "AsyncIterable<object>",
      isOptional: true,
      description:
        "Stream of structured data. Present only when using `output` option with a schema.",
    },
    {
      name: "partialObjectStream",
      type: "AsyncIterable<object>",
      isOptional: true,
      description:
        "Stream of structured data. Present only when using `experimental_output` option.",
    },
    {
      name: "object",
      type: "Promise<object>",
      isOptional: true,
      description:
        "Promise that resolves to the final structured output. Present when using either `output` or `experimental_output` options.",
    },
  ]}
/>

## Examples

### Basic Text Streaming

```typescript
const stream = await myAgent.stream([
  { role: "user", content: "Tell me a story." },
]);

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

### Structured Output Streaming with Thread Context

```typescript
const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    nextSteps: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "nextSteps"],
};

const response = await myAgent.stream("What should we do next?", {
  output: schema,
  threadId: "project-123",
  onFinish: (text) => console.log("Finished:", text),
});

for await (const chunk of response.textStream) {
  console.log(chunk);
}

const result = await response.object;
console.log("Final structured result:", result);
```

The key difference between Agent's `stream()` and LLM's `stream()` is that Agents maintain conversation context through `threadId`, can access tools, and integrate with the agent's memory system.



