---
title: "Input Data Mapping with Workflow | Mastra Docs"
description: "Learn how to use workflow input mapping to create more dynamic data flows in your Mastra workflows."
---

# Input Data Mapping
[EN] Source: https://mastra.ai/en/docs/workflows/input-data-mapping

Input data mapping allows explicit mapping of values for the inputs of the next step. These values can come from a number of sources:

- The outputs of a previous step
- The runtime context
- A constant value
- The initial input of the workflow

## Mapping with `.map()`

In this example the `output` from `step1` is transformed to match the `inputSchema` required for the `step2`. The value from `step1` is available using the `inputData` parameter of the `.map` function.

![Mapping with .map()](/image/workflows/workflows-data-mapping-map.jpg)

```typescript {9} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .map(async ({ inputData }) => {
    const { value } = inputData;
    return {
      output: `new ${value}`
    };
  })
  .then(step2)
  .commit();
```

## Using `inputData`

Use `inputData` to access the full output of the previous step:

```typescript {3} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
  .then(step1)
  .map(({ inputData }) => {
    console.log(inputData);
  })
```

## Using `getStepResult()`

Use `getStepResult` to access the full output of a specific step by referencing the step's instance:

```typescript {3} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
  .then(step1)
  .map(async ({ getStepResult }) => {
    console.log(getStepResult(step1));
  })
```

## Using `getInitData()`

Use `getInitData` to access the initial input data provided to the workflow:

```typescript {3} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
  .then(step1)
  .map(async ({ getInitData }) => {
      console.log(getInitData());
  })
```

## Using `mapVariable()`

To use `mapVariable` import the necessary function from the workflows module:

```typescript filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { mapVariable } from "@mastra/core/workflows";
```

### Renaming step with `mapVariable()`

You can rename step outputs using the object syntax in `.map()`. In the example below, the `value` output from `step1` is renamed to `details`:

```typescript {3-6} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
  .then(step1)
  .map({
    details: mapVariable({
      step: step,
      path: "value"
    })
  })
```

### Renaming workflows with `mapVariable()`

You can rename workflow outputs by using **referential composition**. This involves passing the workflow instance as the `initData`.

```typescript {6-9} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
export const testWorkflow = createWorkflow({...});

testWorkflow
  .then(step1)
  .map({
    details: mapVariable({
      initData: testWorkflow,
      path: "value"
    })
  })
```


