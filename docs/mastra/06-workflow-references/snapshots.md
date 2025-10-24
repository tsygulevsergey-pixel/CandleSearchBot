---
title: "Reference: Snapshots | Workflow State Persistence | Mastra Docs"
description: "Technical reference on snapshots in Mastra - the serialized workflow state that enables suspend and resume functionality"
---

# Snapshots
[EN] Source: https://mastra.ai/en/reference/workflows/snapshots

In Mastra, a snapshot is a serializable representation of a workflow's complete execution state at a specific point in time. Snapshots capture all the information needed to resume a workflow from exactly where it left off, including:

- The current state of each step in the workflow
- The outputs of completed steps
- The execution path taken through the workflow
- Any suspended steps and their metadata
- The remaining retry attempts for each step
- Additional contextual data needed to resume execution

Snapshots are automatically created and managed by Mastra whenever a workflow is suspended, and are persisted to the configured storage system.

## The Role of Snapshots in Suspend and Resume

Snapshots are the key mechanism enabling Mastra's suspend and resume capabilities. When a workflow step calls `await suspend()`:

1. The workflow execution is paused at that exact point
2. The current state of the workflow is captured as a snapshot
3. The snapshot is persisted to storage
4. The workflow step is marked as "suspended" with a status of `'suspended'`
5. Later, when `resume()` is called on the suspended step, the snapshot is retrieved
6. The workflow execution resumes from exactly where it left off

This mechanism provides a powerful way to implement human-in-the-loop workflows, handle rate limiting, wait for external resources, and implement complex branching workflows that may need to pause for extended periods.

## Snapshot Anatomy

A Mastra workflow snapshot consists of several key components:

```typescript
export interface WorkflowRunState {
  // Core state info
  value: Record<string, string>; // Current state machine value
  context: {
    // Workflow context
    [key: string]: Record<
      string,
      | {
          status: "success";
          output: any;
        }
      | {
          status: "failed";
          error: string;
        }
      | {
          status: "suspended";
          payload?: any;
        }
    >;
    input: Record<string, any>; // Initial input data
  };

  activePaths: Array<{
    // Currently active execution paths
    stepPath: string[];
    stepId: string;
    status: string;
  }>;

  // Paths to suspended steps
  suspendedPaths: Record<string, number[]>;

  // Metadata
  runId: string; // Unique run identifier
  timestamp: number; // Time snapshot was created
}
```

## How Snapshots Are Saved and Retrieved

Mastra persists snapshots to the configured storage system. By default, snapshots are saved to a LibSQL database, but can be configured to use other storage providers like Upstash.
The snapshots are stored in the `workflow_snapshots` table and identified uniquely by the `run_id` for the associated run when using libsql.
Utilizing a persistence layer allows for the snapshots to be persisted across workflow runs, allowing for advanced human-in-the-loop functionality.

Read more about [libsql storage](../storage/libsql.mdx) and [upstash storage](../storage/upstash.mdx) here.

### Saving Snapshots

When a workflow is suspended, Mastra automatically persists the workflow snapshot with these steps:

1. The `suspend()` function in a step execution triggers the snapshot process
2. The `WorkflowInstance.suspend()` method records the suspended machine
3. `persistWorkflowSnapshot()` is called to save the current state
4. The snapshot is serialized and stored in the configured database in the `workflow_snapshots` table
5. The storage record includes the workflow name, run ID, and the serialized snapshot

### Retrieving Snapshots

When a workflow is resumed, Mastra retrieves the persisted snapshot with these steps:

1. The `resume()` method is called with a specific step ID
2. The snapshot is loaded from storage using `loadWorkflowSnapshot()`
3. The snapshot is parsed and prepared for resumption
4. The workflow execution is recreated with the snapshot state
5. The suspended step is resumed, and execution continues

## Storage Options for Snapshots

Mastra provides multiple storage options for persisting snapshots.

A `storage` instance is configured on the `Mastra` class, and is used to setup a snapshot persistence layer for all workflows registered on the `Mastra` instance.
This means that storage is shared across all workflows registered with the same `Mastra` instance.

### LibSQL (Default)

The default storage option is LibSQL, a SQLite-compatible database:

```typescript
import { Mastra } from "@mastra/core/mastra";
import { DefaultStorage } from "@mastra/core/storage/libsql";

const mastra = new Mastra({
  storage: new DefaultStorage({
    config: {
      url: "file:storage.db", // Local file-based database
      // For production:
      // url: process.env.DATABASE_URL,
      // authToken: process.env.DATABASE_AUTH_TOKEN,
    },
  }),
  workflows: {
    weatherWorkflow,
    travelWorkflow,
  },
});
```

### Upstash (Redis-Compatible)

For serverless environments:

```typescript
import { Mastra } from "@mastra/core/mastra";
import { UpstashStore } from "@mastra/upstash";

const mastra = new Mastra({
  storage: new UpstashStore({
    url: process.env.UPSTASH_URL,
    token: process.env.UPSTASH_TOKEN,
  }),
  workflows: {
    weatherWorkflow,
    travelWorkflow,
  },
});
```

## Best Practices for Working with Snapshots

1. **Ensure Serializability**: Any data that needs to be included in the snapshot must be serializable (convertible to JSON).

2. **Minimize Snapshot Size**: Avoid storing large data objects directly in the workflow context. Instead, store references to them (like IDs) and retrieve the data when needed.

3. **Handle Resume Context Carefully**: When resuming a workflow, carefully consider what context to provide. This will be merged with the existing snapshot data.

4. **Set Up Proper Monitoring**: Implement monitoring for suspended workflows, especially long-running ones, to ensure they are properly resumed.

5. **Consider Storage Scaling**: For applications with many suspended workflows, ensure your storage solution is appropriately scaled.

## Advanced Snapshot Patterns

### Custom Snapshot Metadata

When suspending a workflow, you can include custom metadata that can help when resuming:

```typescript
await suspend({
  reason: "Waiting for customer approval",
  requiredApprovers: ["manager", "finance"],
  requestedBy: currentUser,
  urgency: "high",
  expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
});
```

This metadata is stored with the snapshot and available when resuming.

### Conditional Resumption

You can implement conditional logic based on the suspend payload when resuming:

```typescript
run.watch(async ({ activePaths }) => {
  const isApprovalStepSuspended =
    activePaths.get("approval")?.status === "suspended";
  if (isApprovalStepSuspended) {
    const payload = activePaths.get("approval")?.suspendPayload;
    if (payload.urgency === "high" && currentUser.role === "manager") {
      await resume({
        stepId: "approval",
        context: { approved: true, approver: currentUser.id },
      });
    }
  }
});
```

## Related

- [Suspend and resume](../../docs/workflows/suspend-and-resume.mdx)
- [Human in the loop example](../../examples/workflows/human-in-the-loop.mdx)
- [Watch Function Reference](./watch.mdx)


