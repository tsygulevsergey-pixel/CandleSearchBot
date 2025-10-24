---
title: "Reference: Workflow.foreach() | Building Workflows | Mastra Docs"
description: Documentation for the `.foreach()` method in workflows, which creates a loop that executes a step for each item in an array.
---

# Workflow.foreach()
[EN] Source: https://mastra.ai/en/reference/workflows/foreach

The `.foreach()` method creates a loop that executes a step for each item in an array.

## Usage

```typescript
workflow.foreach(stepOne, { concurrency: 2 });
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "step",
      type: "Step",
      description:
        "The step instance to execute in the loop. The previous step must return an array type.",
      isOptional: false,
    },
    {
      name: "opts",
      type: "object",
      description:
        "Optional configuration for the loop. The concurrency option controls how many iterations can run in parallel (default: 1)",
      isOptional: true,
      properties: [
        {
          name: "concurrency",
          type: "number",
          description:
            "The number of concurrent iterations allowed (default: 1)",
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

- [For each](../../docs/workflows/control-flow.mdx#foreach)


