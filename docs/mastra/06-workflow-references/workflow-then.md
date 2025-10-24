---
title: "Reference: Workflow.then() | Building Workflows | Mastra Docs"
description: Documentation for the `.then()` method in workflows, which creates sequential dependencies between steps.
---

# Workflow.then()
[EN] Source: https://mastra.ai/en/reference/workflows/then

The `.then()` method creates a sequential dependency between workflow steps, ensuring steps execute in a specific order.

## Usage

```typescript
workflow.then(stepOne).then(stepTwo);
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "step",
      type: "Step",
      description:
        "The step instance that should execute after the previous step completes",
      isOptional: false,
    },
  ]}
/>

## Returns

<PropertiesTable
  content={[
    {
      name: "workflow",
      type: "NewWorkflow",
      description: "The workflow instance for method chaining",
    },
  ]}
/>

## Related

- [Control flow](../../docs/workflows/control-flow.mdx)


