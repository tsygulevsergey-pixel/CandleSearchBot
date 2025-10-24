---
title: "Reference: Workflow.sendEvent() | Building Workflows | Mastra Docs"
description: Documentation for the `.sendEvent()` method in workflows, which resumes execution when an event is sent.
---

# Workflow.sendEvent()
[EN] Source: https://mastra.ai/en/reference/workflows/sendEvent

The `.sendEvent()` resumes execution when an event is sent.

## Usage

```typescript
workflow.sendEvent('my-event-name', step1);
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "eventName",
      type: "string",
      description: "The name of the event to send",
      isOptional: false,
    },
    {
      name: "step",
      type: "Step",
      description: "The step to resume after the event is sent",
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


