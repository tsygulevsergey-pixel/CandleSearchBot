---
title: "Using Workflows with Agents and Tools | Workflows | Mastra Docs"
description: "Steps in Mastra workflows provide a structured way to manage operations by defining inputs, outputs, and execution logic."
---

# Agents and Tools
[EN] Source: https://mastra.ai/en/docs/workflows/using-with-agents-and-tools

Workflow steps are composable and typically run logic directly within the `execute` function. However, there are cases where calling an agent or tool is more appropriate. This pattern is especially useful when:

- Generating natural language responses from user input using an LLM.
- Abstracting complex or reusable logic into a dedicated tool.
- Interacting with third-party APIs in a structured or reusable way.

Workflows can use Mastra agents or tools directly as steps, for example: `createStep(testAgent)` or `createStep(testTool)`.

## Using agents in workflows

To include an agent in a workflow, define it in the usual way, then either add it directly to the workflow using `createStep(testAgent)` or, invoke it from within a step's `execute` function using `.generate()`.

### Example agent

This agent uses OpenAI to generate a fact about a city, country, and timezone.

```typescript filename="src/mastra/agents/test-agent.ts" showLineNumbers copy
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";

export const testAgent = new Agent({
  name: "test-agent",
  description: "Create facts for a country based on the city",
  instructions: `Return an interesting fact about the country based on the city provided`,
  model: openai("gpt-4o")
});
```

### Adding an agent as a step

In this example, `step1` uses the `testAgent` to generate an interesting fact about the country based on a given city.

The `.map` method transforms the workflow input into a `prompt` string compatible with the `testAgent`.

The step is composed into the workflow using `.then()`, allowing it to receive the mapped input and return the agent's structured output. The workflow is finalized with `.commit()`.


![Agent as step](/image/workflows/workflows-agent-tools-agent-step.jpg)


```typescript {3} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { testAgent } from "../agents/test-agent";

const step1 = createStep(testAgent);

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  description: 'Test workflow',
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  })
})
  .map(({ inputData }) => {
    const { input } = inputData;
    return {
      prompt: `Provide facts about the city: ${input}`
    };
  })
  .then(step1)
  .commit();
```

### Calling an agent with `.generate()`

In this example, the `step1` builds a prompt using the provided `input` and passes it to the `testAgent`, which returns a plain-text response containing facts about the city and its country.

The step is added to the workflow using the sequential `.then()` method, allowing it to receive input from the workflow and return structured output. The workflow is finalized with `.commit()`.

```typescript {1,18, 29} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { testAgent } from "../agents/test-agent";

const step1 = createStep({
  id: "step-1",
  description: "Create facts for a country based on the city",
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  }),

  execute: async ({ inputData }) => {
    const { input } = inputData;

    const  prompt = `Provide facts about the city: ${input}`

    const { text } = await testAgent.generate([
      { role: "user", content: prompt }
    ]);

    return {
      output: text
    };
  }
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

## Using tools in workflows

To use a tool within a workflow, define it in the usual way, then either add it directly to the workflow using `createStep(testTool)` or, invoke it from within a step's `execute` function using `.execute()`.

### Example tool

The example below uses the Open Meteo API to retrieve geolocation details for a city, returning its name, country, and timezone.

```typescript filename="src/mastra/tools/test-tool.ts" showLineNumbers copy
import { createTool } from "@mastra/core";
import { z } from "zod";

export const testTool = createTool({
  id: "test-tool",
  description: "Gets country for a city",
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    country_name: z.string()
  }),
  execute: async ({ context }) => {
    const { input } = context;
    const geocodingResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${input}`);
    const geocodingData = await geocodingResponse.json();

    const { country } = geocodingData.results[0];

    return {
      country_name: country
    };
  }
});
```

### Adding a tool as a step

In this example, `step1` uses the `testTool`, which performs a geocoding lookup using the provided `city` and returns the resolved `country`.

The step is added to the workflow using the sequential `.then()` method, allowing it to receive input from the workflow and return structured output. The workflow is finalized with `.commit()`.

![Tool as step](/image/workflows/workflows-agent-tools-tool-step.jpg)

```typescript {1,3,6} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { testTool } from "../tools/test-tool";

const step1 = createStep(testTool);

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

### Calling a tool with `.execute()`

In this example, `step1` directly invokes `testTool` using its `.execute()` method. The tool performs a geocoding lookup with the provided `city` and returns the corresponding `country`.

The result is returned as structured output from the step. The step is composed into the workflow using `.then()`, enabling it to process workflow input and produce typed output. The workflow is finalized with `.commit()`

```typescript {3,20,32} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { RuntimeContext } from "@mastra/core/di";

import { testTool } from "../tools/test-tool";

const runtimeContext = new RuntimeContext();

const step1 = createStep({
  id: "step-1",
  description: "Gets country for a city",
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  }),

  execute: async ({ inputData }) => {
    const { input } = inputData;

    const { country_name } = await testTool.execute({
      context: { input },
      runtimeContext
    });

    return {
      output: country_name
    };
  }
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

## Using workflows as tools

In this example the `cityStringWorkflow` workflow has been added to the main Mastra instance.


```typescript {7} filename="src/mastra/index.ts" showLineNumbers copy
import { Mastra } from "@mastra/core/mastra";

import { testWorkflow, cityStringWorkflow } from "./workflows/test-workflow";

export const mastra = new Mastra({
  ...
  workflows: { testWorkflow, cityStringWorkflow },
});
```

Once a workflow has been registered it can be referenced using `getWorkflow` from withing a tool.

```typescript {10,17-27} filename="src/mastra/tools/test-tool.ts" showLineNumbers copy
export const cityCoordinatesTool = createTool({
  id: "city-tool",
  description: "Convert city details",
  inputSchema: z.object({
    city: z.string()
  }),
  outputSchema: z.object({
    outcome: z.string()
  }),
  execute: async ({ context, mastra }) => {
    const { city } = context;
    const geocodingResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${city}`);
    const geocodingData = await geocodingResponse.json();

    const { name, country, timezone } = geocodingData.results[0];

    const workflow = mastra?.getWorkflow("cityStringWorkflow");

    const run = await workflow?.createRunAsync();

    const { result } = await run?.start({
      inputData: {
        city_name: name,
        country_name: country,
        country_timezone: timezone
      }
    });

    return {
      outcome: result.outcome
    };
  }
});
```

## Exposing workflows with `MCPServer`

You can convert your workflows into tools by passing them into an instance of a Mastra `MCPServer`. This allows any MCP-compatible client to access your workflow.

The workflow description becomes the tool description and the input schema becomes the tool's input schema.

When you provide workflows to the server, each workflow is automatically exposed as a callable tool for example:

- `run_testWorkflow`.

```typescript filename="src/test-mcp-server.ts" showLineNumbers copy
import { MCPServer } from "@mastra/mcp";

import { testAgent } from "./mastra/agents/test-agent";
import { testTool } from "./mastra/tools/test-tool";
import { testWorkflow } from "./mastra/workflows/test-workflow";

async function startServer() {
  const server = new MCPServer({
    name: "test-mcp-server",
    version: "1.0.0",
    workflows: {
      testWorkflow
    }
  });

  await server.startStdio();
  console.log("MCPServer started on stdio");
}

startServer().catch(console.error);
```

To verify that your workflow is available on the server, you can connect with an MCPClient.

```typescript filename="src/test-mcp-client.ts" showLineNumbers copy
import { MCPClient } from "@mastra/mcp";

async function main() {
  const mcp = new MCPClient({
    servers: {
      local: {
        command: "npx",
        args: ["tsx", "src/test-mcp-server.ts"]
      }
    }
  });

  const tools = await mcp.getTools();
  console.log(tools);
}

main().catch(console.error);
```

Run the client script to see your workflow tool.

```bash
npx tsx src/test-mcp-client.ts
```

## More resources

- [MCPServer reference documentation](/reference/tools/mcp-server).
- [MCPClient reference documentation](/reference/tools/mcp-client).


