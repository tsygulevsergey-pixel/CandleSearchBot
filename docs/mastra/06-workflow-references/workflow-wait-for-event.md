---
title: "Reference: Workflow.waitForEvent() | Building Workflows | Mastra Docs"
description: Documentation for the `.waitForEvent()` method in workflows, which pauses execution until an event is received.
---

# Workflow.waitForEvent()
[EN] Source: https://mastra.ai/en/reference/workflows/waitForEvent

The `.waitForEvent()` method pauses execution until an event is received.

## Usage

```typescript
workflow.waitForEvent('my-event-name', step1);
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "eventName",
      type: "string",
      description: "The name of the event to wait for",
      isOptional: false,
    },
    {
      name: "step",
      type: "Step",
      description: "The step to resume after the event is received",
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

- [Sleep & Events](../../docs/workflows/pausing-execution.mdx)


