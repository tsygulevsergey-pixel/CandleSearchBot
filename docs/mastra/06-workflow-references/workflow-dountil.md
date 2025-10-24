---
title: "Reference: Workflow.dountil() | Building Workflows | Mastra Docs"
description: Documentation for the `.dountil()` method in workflows, which creates a loop that executes a step until a condition is met.
---

# Workflow.dountil()
[EN] Source: https://mastra.ai/en/reference/workflows/dountil

The `.dountil()` method creates a loop that executes a step until a condition is met.

## Usage

```typescript
workflow.dountil(stepOne, async ({ inputData }) => true);
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

- [Loops](../../docs/workflows/control-flow.mdx#loops)
- [Loops example](../../examples/workflows/control-flow.mdx)


