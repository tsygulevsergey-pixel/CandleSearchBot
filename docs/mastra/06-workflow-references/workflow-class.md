---
title: "Reference: Workflow Class | Building Workflows | Mastra Docs"
description: Documentation for the Workflow class in Mastra, which enables you to create state machines for complex sequences of operations with conditional branching and data validation.
---

# Workflow Class
[EN] Source: https://mastra.ai/en/reference/workflows/workflow

The Workflow class enables you to create state machines for complex sequences of operations with conditional branching and data validation.

## Usage

```typescript
const myWorkflow = createWorkflow({
  id: "my-workflow",
  inputSchema: z.object({
    startValue: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  steps: [step1, step2, step3], // Declare steps used in this workflow
})
  .then(step1)
  .then(step2)
  .then(step3)
  .commit();

const mastra = new Mastra({
  workflows: {
    myWorkflow,
  },
});

const run = await mastra.getWorkflow("myWorkflow").createRunAsync();
```

## API Reference

### Constructor

<PropertiesTable
  content={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for the workflow",
    },
    {
      name: "inputSchema",
      type: "z.ZodType<any>",
      description: "Zod schema defining the input structure for the workflow",
    },
    {
      name: "outputSchema",
      type: "z.ZodType<any>",
      description: "Zod schema defining the output structure for the workflow",
    },
    {
      name: "steps",
      type: "Step[]",
      description: "Array of steps to include in the workflow",
    },
  ]}
/>

### Core Methods

#### `then()`

Adds a step to the workflow sequentially. Returns the workflow instance for chaining.

#### `parallel()`

Executes multiple steps concurrently. Takes an array of steps and returns the workflow instance.

#### `branch()`

Creates conditional branching logic. Takes an array of tuples containing condition functions and steps to execute when conditions are met.

#### `dowhile()`

Creates a loop that executes a step repeatedly while a condition remains true. The condition is checked after each execution.

#### `dountil()`

Creates a loop that executes a step repeatedly until a condition becomes true. The condition is checked after each execution.

#### `foreach()`

Iterates over an array and executes a step for each element. Accepts optional concurrency configuration.

#### `map()`

Maps data between steps using either a mapping configuration object or a mapping function. Useful for transforming data between steps.

#### `commit()`

Validates and finalizes the workflow configuration. Must be called after adding all steps.

#### `createRun()`

Deprecated. Creates a new workflow run instance, allowing you to execute the workflow with specific input data. Accepts optional run ID.

#### `createRunAsync()`

Creates a new workflow run instance, allowing you to execute the workflow with specific input data. Accepts optional run ID. Stores a pending workflow run snapshot into storage.

#### `execute()`

Executes the workflow with provided input data. Handles workflow suspension, resumption and emits events during execution.

## Workflow Status

A workflow's status indicates its current execution state. The possible values are:

<PropertiesTable
  content={[
    {
      name: "success",
      type: "string",
      description:
        "All steps finished executing successfully, with a valid result output",
    },
    {
      name: "failed",
      type: "string",
      description:
        "Workflow encountered an error during execution, with error details available",
    },
    {
      name: "suspended",
      type: "string",
      description:
        "Workflow execution is paused waiting for resume, with suspended step information",
    },
  ]}
/>

## Passing Context Between Steps

Steps can access data from previous steps in the workflow through the context object. Each step receives the accumulated context from all previous steps that have executed.

```typescript
workflow
  .then({
    id: "getData",
    execute: async ({ inputData }) => {
      return {
        data: { id: "123", value: "example" },
      };
    },
  })
  .then({
    id: "processData",
    execute: async ({ inputData }) => {
      // Access data from previous step through context.steps
      const previousData = inputData.data;
      // Process previousData.id and previousData.value
    },
  });
```

## Related

- [Control flow](../../docs/workflows/flow-control.mdx)
