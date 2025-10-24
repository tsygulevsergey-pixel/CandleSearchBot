---
title: "Reference: Workflow.execute() | Building Workflows | Mastra Docs"
description: Documentation for the `.execute()` method in workflows, which executes a step with input data and returns the output.
---

# Workflow.execute()
[EN] Source: https://mastra.ai/en/reference/workflows/execute

The `.execute()` method executes a step with input data and returns the output, allowing you to process data within a workflow.

## Usage

```typescript
const inputSchema = z.object({
  inputValue: z.string(),
});

const myStep = createStep({
  id: "my-step",
  description: "Does something useful",
  inputSchema,
  outputSchema: z.object({
    outputValue: z.string(),
  }),
  resumeSchema: z.object({
    resumeValue: z.string(),
  }),
  suspendSchema: z.object({
    suspendValue: z.string(),
  }),
  execute: async ({
    inputData,
    mastra,
    getStepResult,
    getInitData,
    runtimeContext,
  }) => {
    const otherStepOutput = getStepResult(step2);
    const initData = getInitData<typeof inputSchema>(); // typed as the input schema variable (zod schema)
    return {
      outputValue: `Processed: ${inputData.inputValue}, ${initData.startValue} (runtimeContextValue: ${runtimeContext.get("runtimeContextValue")})`,
    };
  },
});
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "params",
      type: "object",
      description: "Configuration object for executing the step",
      isOptional: false,
      properties: [
        {
          name: "inputData",
          type: "z.infer<TInput>",
          description: "Input data matching the step's input schema",
          isOptional: false,
        },
        {
          name: "resumeData",
          type: "ResumeSchema",
          description: "Data for resuming a suspended step",
          isOptional: true,
        },
        {
          name: "suspend",
          type: "(suspendPayload: any) => Promise<void>",
          description: "Function to suspend step execution",
          isOptional: false,
        },
        {
          name: "resume",
          type: "object",
          description: "Configuration for resuming execution",
          isOptional: true,
          properties: [
            {
              name: "steps",
              type: "string[]",
              description: "Steps to resume",
              isOptional: false,
            },
            {
              name: "resumePayload",
              type: "any",
              description: "Payload data for resuming",
              isOptional: false,
            },
            {
              name: "runId",
              type: "string",
              description: "ID of the run to resume",
              isOptional: true,
            },
          ],
        },
        {
          name: "emitter",
          type: "object",
          description: "Event emitter object",
          isOptional: false,
          properties: [
            {
              name: "emit",
              type: "(event: string, data: any) => void",
              description: "Function to emit events",
              isOptional: false,
            },
          ],
        },
        {
          name: "mastra",
          type: "Mastra",
          description: "Mastra instance",
          isOptional: false,
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
      type: "Promise<z.infer<TOutput>>",
      description: "A promise that resolves to the output of the executed step",
    },
  ]}
/>

## Related

- [Running workflows](../../docs/workflows/overview.mdx#running-workflows)


