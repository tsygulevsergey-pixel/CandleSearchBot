---
title: "Runtime context | Agents | Mastra Docs"
description: Learn how to use Mastra's dependency injection system to provide runtime configuration to agents and tools.
---

# Agent Runtime Context
[EN] Source: https://mastra.ai/en/docs/agents/runtime-variables

Mastra provides runtime context, which is a system based on dependency injection that enables you to configure your agents and tools with runtime variables. If you find yourself creating several different agents that do very similar things, runtime context allows you to combine them into one agent.

## Overview

The dependency injection system allows you to:

1. Pass runtime configuration variables to agents through a type-safe runtimeContext
2. Access these variables within tool execution contexts
3. Modify agent behavior without changing the underlying code
4. Share configuration across multiple tools within the same agent

## Basic Usage

```typescript
const agent = mastra.getAgent("weatherAgent");

// Define your runtimeContext's type structure
type WeatherRuntimeContext = {
  "temperature-scale": "celsius" | "fahrenheit"; // Fixed typo in "fahrenheit"
};

const runtimeContext = new RuntimeContext<WeatherRuntimeContext>();
runtimeContext.set("temperature-scale", "celsius");

const response = await agent.generate("What's the weather like today?", {
  runtimeContext,
});

console.log(response.text);
```

## Using with REST API

Here's how to dynamically set temperature units based on a user's location using the Cloudflare `CF-IPCountry` header:

```typescript filename="src/index.ts"
import { Mastra } from "@mastra/core";
import { RuntimeContext } from "@mastra/core/di";
import { agent as weatherAgent } from "./agents/weather";

// Define RuntimeContext type with clear, descriptive types
type WeatherRuntimeContext = {
  "temperature-scale": "celsius" | "fahrenheit";
};

export const mastra = new Mastra({
  agents: {
    weather: weatherAgent,
  },
  server: {
    middleware: [
      async (c, next) => {
        const country = c.req.header("CF-IPCountry");
        const runtimeContext = c.get<WeatherRuntimeContext>("runtimeContext");

        // Set temperature scale based on country
        runtimeContext.set(
          "temperature-scale",
          country === "US" ? "fahrenheit" : "celsius",
        );

        await next(); // Don't forget to call next()
      },
    ],
  },
});
```

## Creating Tools with Variables

Tools can access runtimeContext variables and must conform to the agent's runtimeContext type:

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const weatherTool = createTool({
  id: "getWeather",
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The location to get weather for"),
  }),
  execute: async ({ context, runtimeContext }) => {
    // Type-safe access to runtimeContext variables
    const temperatureUnit = runtimeContext.get("temperature-scale");

    const weather = await fetchWeather(context.location, {
      temperatureUnit,
    });

    return { result: weather };
  },
});

async function fetchWeather(
  location: string,
  { temperatureUnit }: { temperatureUnit: "celsius" | "fahrenheit" },
): Promise<WeatherResponse> {
  // Implementation of weather API call
  const response = await weatherApi.fetch(location, temperatureUnit);

  return {
    location,
    temperature: "72°F",
    conditions: "Sunny",
    unit: temperatureUnit,
  };
}
```


