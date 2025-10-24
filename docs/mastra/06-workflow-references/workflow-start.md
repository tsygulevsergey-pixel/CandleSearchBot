---
title: "Reference: Workflow.start() | Building Workflows | Mastra Docs"
description: Documentation for the `.start()` method in workflows, which starts a workflow run with input data.
---

# Workflow.start()
[EN] Source: https://mastra.ai/en/reference/workflows/start

The `.start()` method starts a workflow run with input data, allowing you to execute the workflow from the beginning.

## Usage

```typescript
const run = await myWorkflow.createRunAsync();

// Start the workflow with input data
const result = await run.start({
  inputData: {
    startValue: "initial data",
  },
});
```

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
          description: "Input data matching the workflow's input schema",
          isOptional: true,
        },
        {
          name: "runtimeContext",
          type: "RuntimeContext",
          description: "Runtime context data to use when starting the workflow",
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
      name: "result",
      type: "Promise<WorkflowResult<TOutput, TSteps>>",
      description: "A promise that resolves to the result of the workflow run",
    },
  ]}
/>

## Related

- [Running workflows](../../docs/workflows/overview.mdx#running-workflows)
- [Create run reference](./create-run.mdx)


