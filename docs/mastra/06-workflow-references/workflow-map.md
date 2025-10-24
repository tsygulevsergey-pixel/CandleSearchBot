---
title: "Reference: Workflow.map() | Building Workflows | Mastra Docs"
description: Documentation for the `.map()` method in workflows, which maps output data from a previous step to the input of a subsequent step.
---

# Workflow.map()
[EN] Source: https://mastra.ai/en/reference/workflows/map

The `.map()` method maps output data from a previous step to the input of a subsequent step, allowing you to transform data between steps.

## Usage

```typescript
const step1 = createStep({
  id: "step1",
  inputSchema: z.object({
    inputValue: z.string(),
  }),
  outputSchema: z.object({
    outputValue: z.string(),
  }),
  execute: async ({ inputData }) => {
    return { outputValue: inputData.inputValue };
  },
});

const step2 = createStep({
  id: "step2",
  inputSchema: z.object({
    unexpectedName: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData }) => {
    return { result: inputData.unexpectedName };
  },
});

const workflow = createWorkflow({
  id: "my-workflow",
  steps: [step1, step2],
  inputSchema: z.object({
    inputValue: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
});

workflow
  .then(step1)
  .map({
    unexpectedName: {
      step: step1,
      path: "outputValue",
    },
  })
  .then(step2)
  .commit();
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "mappingConfig",
      type: "object",
      description:
        "Configuration object that defines how data should be mapped between workflow steps, either as a mapping object or a mapping function",
      isOptional: false,
      properties: [
        {
          name: "step",
          type: "Step | Step[]",
          description: "The step(s) to map output from",
          isOptional: true,
        },
        {
          name: "path",
          type: "string",
          description: "Path to the output value in the step result",
          isOptional: true,
        },
        {
          name: "value",
          type: "any",
          description: "Static value to map",
          isOptional: true,
        },
        {
          name: "schema",
          type: "ZodType",
          description: "Schema for validating the mapped value",
          isOptional: true,
        },
        {
          name: "initData",
          type: "Step",
          description: "Step containing initial workflow data to map from",
          isOptional: true,
        },
        {
          name: "runtimeContextPath",
          type: "string",
          description: "Path to value in runtime context",
          isOptional: true,
        },
      ],
    },
  ]}
/>

## Returns

<PropertiesTable
  content={[
    {
      name: "workflow",
      type: "Workflow",
      description: "The workflow instance for method chaining",
    },
  ]}
/>

## Related

- [Input data mapping](../../docs/workflows/input-data-mapping.mdx)


