---
title: "Reference: Agent.getWorkflows() | Agents | Mastra Docs"
description: "Documentation for the `.getWorkflows()` method in Mastra agents, which retrieves the workflows that the agent can execute."
---

# Agent.getWorkflows()
[EN] Source: https://mastra.ai/en/reference/agents/getWorkflows

The `getWorkflows()` method retrieves the workflows configured for an agent, resolving them if they're a function. These workflows enable the agent to execute complex, multi-step processes with defined execution paths.

## Syntax

```typescript
getWorkflows({ runtimeContext = new RuntimeContext() }: { runtimeContext?: RuntimeContext } = {}): Record<string, NewWorkflow> | Promise<Record<string, NewWorkflow>>
```

## Parameters

<br />
<PropertiesTable
  content={[
    {
      name: "runtimeContext",
      type: "RuntimeContext",
      isOptional: true,
      description:
        "Runtime context for dependency injection and contextual information.",
    },
  ]}
/>

## Return Value

Returns a `Record<string, NewWorkflow>` object or a Promise that resolves to a `Record<string, NewWorkflow>` object containing the agent's workflows.

## Description

The `getWorkflows()` method is used to access the workflows that an agent can execute. It resolves the workflows, which can be either directly provided as an object or returned from a function that receives runtime context.

## Examples

```typescript
import { Agent } from "@mastra/core/agent";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const generateSuggestionsStep = createStep({
  id: "generate-suggestions",
  inputSchema: z.object({
    topic: z.string().describe("The topic to research"),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const researchAgent = mastra?.getAgent("researchAgent");

    if (!researchAgent) {
      throw new Error("Research agent is not initialized");
    }

    const { topic } = inputData;

    const result = await researchAgent.generate([
      { role: "assistant", content: topic },
    ]);

    return { summary: result.text };
  },
});

const researchWorkflow = createWorkflow({
  id: "research-workflow",
  inputSchema: z.object({
    topic: z.string().describe("The topic to research"),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
});

researchWorkflow.then(generateSuggestionsStep).commit();

// Create an agent with the workflow
const agent = new Agent({
  name: "research-organizer",
  instructions:
    "You are a research organizer that can delegate tasks to gather information and create summaries.",
  model: openai("gpt-4o"),
  workflows: {
    research: researchWorkflow,
  },
});

// Get the workflows
const workflows = await agent.getWorkflows();

console.log(Object.keys(workflows)); // ["research"]
```


