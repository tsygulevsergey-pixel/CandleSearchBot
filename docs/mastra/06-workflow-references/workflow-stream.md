---
title: "Reference: Workflow.stream() | Building Workflows | Mastra Docs"
description: Documentation for the `.stream()` method in workflows, which allows you to monitor the execution of a workflow run as a stream.
---

# Run.stream()
[EN] Source: https://mastra.ai/en/reference/workflows/stream

The `.stream()` method allows you to monitor the execution of a workflow run, providing real-time updates on the status of steps.

## Usage

```typescript
const run = await myWorkflow.createRunAsync();

// Add a stream to monitor execution
const result = run.stream({ inputData: {...} });


for (const chunk of stream) {
  // do something with the chunk
}
```

## Messages

<PropertiesTable
  content={[
    {
      name: "start",
      type: "object",
      description: "The workflow starts",
      isOptional: false,
      properties: [
        {
          type: "object",
          parameters: [
            {
              name: "example",
              type: "{ type: 'start', payload: { runId: '1' } }",
              description: "Example message structure",
              isOptional: false,
            },
          ],
        },
      ],
    },
    {
      name: "step-start",
      type: "object",
      description: "The start of a step",
      isOptional: false,
      properties: [
        {
          type: "object",
          parameters: [
            {
              name: "example",
              type: "{ type: 'step-start', payload: { id: 'fetch-weather' } }",
              description: "Example message structure",
              isOptional: false,
            },
          ],
        },
      ],
    },
    {
      name: "tool-call",
      type: "object",
      description: "A tool call has started",
      isOptional: false,
      properties: [
        {
          type: "object",
          parameters: [
            {
              name: "example",
              type: "{ type: 'tool-call', toolCallId: 'weatherAgent', toolName: 'Weather Agent', args: { prompt: 'Based on the following weather forecast for New York, suggest appropriate activities:...' } }",
              description: "Example message structure",
              isOptional: false,
            },
          ],
        },
      ],
    },
    {
      name: "tool-call-streaming-start",
      type: "object",
      description: "A tool call/agent has started",
      isOptional: false,
      properties: [
        {
          type: "object",
          parameters: [
            {
              name: "example",
              type: "{ type: 'tool-call-streaming-start', toolCallId: 'weatherAgent', toolName: 'Weather Agent', args: { prompt: 'Based on the following weather forecast for New York, suggest appropriate activities:...' } }",
              description: "Example message structure",
              isOptional: false,
            },
          ],
        },
      ],
    },
    {
      name: "tool-call-delta",
      type: "object",
      description: "The delta of the tool output",
      isOptional: false,
      properties: [
        {
          type: "object",
          parameters: [
            {
              name: "example",
              type: "{ type: 'tool-call-delta', toolCallId: 'weatherAgent', toolName: 'Weather Agent', args: { prompt: 'Based on the following weather forecast for New York, suggest appropriate activities:\\n' + '            [\\n' + '  {\\n' + '    \"date\": \"2025-05-16\",\\n' + '    \"maxTemp\": 22.2,\\n' + '    \"minTemp\": 16,\\n' + '    \"precipitationChance\": 5,\\n' + '    \"condition\": \"Dense drizzle\",\\n' + '    \"location\": \"New York\"\\n' + '  },\\n' + '            ' }, argsTextDelta: '📅' }",
              description: "Example message structure",
              isOptional: false,
            },
          ],
        },
      ],
    },
    {
      name: "step-result",
      type: "object",
      description: "The result of a step",
      isOptional: false,
      properties: [
        {
          type: "object",
          parameters: [
            {
              name: "example",
              type: "{ type: 'step-result', payload: { id: 'Weather Agent', status: 'success', output: [Object] } }",
              description: "Example message structure",
              isOptional: false,
            },
          ],
        },
      ],
    },
    {
      name: "step-finish",
      type: "object",
      description: "The end of a step",
      isOptional: false,
      properties: [
        {
          type: "object",
          parameters: [
            {
              name: "example",
              type: "{ type: 'step-finish', payload: { id: 'Weather Agent', metadata: {} } }",
              description: "Example message structure",
              isOptional: false,
            },
          ],
        },
      ],
    },
    {
      name: "finish",
      type: "object",
      description: "The end of the workflow",
      isOptional: false,
      properties: [
        {
          type: "object",
          parameters: [
            {
              name: "example",
              type: "{ type: 'finish', payload: { runId: '1' } }",
              description: "Example message structure",
              isOptional: false,
            },
          ],
        },
      ],
    },
  ]}
/>

## Parameters

<PropertiesTable
  content={[
    {
      name: "params",
      type: "object",
      description: "Configuration object for starting the workflow run",
      isOptional: false,
      properties: [
        {
          name: "inputData",
          type: "z.infer<TInput>",
          parameters: [
            {
              name: "z.infer<TInput>",
              type: "inputData",
              description:
                "Runtime context data to use when starting the workflow",
              isOptional: true,
            },
          ],
        },
        {
          name: "runtimeContext",
          type: "RuntimeContext",
          parameters: [
            {
              name: "runtimeContext",
              type: "RuntimeContext",
              description:
                "Runtime context data to use when starting the workflow",
              isOptional: true,
            },
          ],
        },
      ],
    },
  ]}
/>

## Returns

<PropertiesTable
  content={[
    {
      name: "result",
      type: "Promise<WorkflowResult<TOutput, TSteps>>",
      description: "A stream that pipes each step to the stream",
    },
  ]}
/>


