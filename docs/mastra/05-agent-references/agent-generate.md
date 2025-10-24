---
title: "Reference: Agent.generate() | Agents | Mastra Docs"
description: "Documentation for the `.generate()` method in Mastra agents, which produces text or structured responses."
---

# Agent.generate()
[EN] Source: https://mastra.ai/en/reference/agents/generate

The `generate()` method is used to interact with an agent to produce text or structured responses. This method accepts `messages` and an optional `options` object as parameters.

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
      name: "output",
      type: "Zod schema | JsonSchema7",
      isOptional: true,
      description:
        "Defines the expected structure of the output. Can be a JSON Schema object or a Zod schema.",
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
      description: "Maximum number of execution steps allowed.",
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
      name: "onStepFinish",
      type: "GenerateTextOnStepFinishCallback<any> | never",
      isOptional: true,
      description:
        "Callback function called after each execution step. Receives step details as a JSON string. Unavailable for structured output",
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
        "Settings for telemetry collection during generation. See TelemetrySettings section below for details.",
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
      description: "Controls how the agent uses tools during generation.",
    },
    {
      name: "toolsets",
      type: "ToolsetsInput",
      isOptional: true,
      description:
        "Additional toolsets to make available to the agent during generation.",
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

Settings for telemetry collection during generation:

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

The return value of the `generate()` method depends on the options provided, specifically the `output` option.

### PropertiesTable for Return Values

<PropertiesTable
  content={[
    {
      name: "text",
      type: "string",
      isOptional: true,
      description:
        "The generated text response. Present when output is 'text' (no schema provided).",
    },
    {
      name: "object",
      type: "object",
      isOptional: true,
      description:
        "The generated structured response. Present when a schema is provided via `output` or `experimental_output`.",
    },
    {
      name: "toolCalls",
      type: "Array<ToolCall>",
      isOptional: true,
      description:
        "The tool calls made during the generation process. Present in both text and object modes.",
    },
  ]}
/>

#### ToolCall Structure

<PropertiesTable
  content={[
    {
      name: "toolName",
      type: "string",
      required: true,
      description: "The name of the tool invoked.",
    },
    {
      name: "args",
      type: "any",
      required: true,
      description: "The arguments passed to the tool.",
    },
  ]}
/>

## Related Methods

For real-time streaming responses, see the [`stream()`](./stream.mdx) method documentation.


