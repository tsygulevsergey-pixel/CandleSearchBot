---
title: "Reference: Workflow.dowhile() | Building Workflows | Mastra Docs"
description: Documentation for the `.dowhile()` method in workflows, which creates a loop that executes a step while a condition is met.
---

# Workflow.dowhile()
[EN] Source: https://mastra.ai/en/reference/workflows/dowhile

The `.dowhile()` method creates a loop that executes a step while a condition is met.

## Usage

```typescript
workflow.dowhile(stepOne, async ({ inputData }) => true);
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "step",
      type: "Step",
      description: "The step instance to execute in the loop",
      isOptional: false,
    },
    {
      name: "condition",
      type: "(params : { inputData: any}) => Promise<boolean>",
      description:
        "A function that returns a boolean indicating whether to continue the loop",
      isOptional: false,
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

- [Loops](../../docs/workflows/flow-control.mdx#loops)
- [Loops example](../../examples/workflows/control-flow.mdx)


