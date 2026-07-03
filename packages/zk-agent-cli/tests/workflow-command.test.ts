import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkflowCommand } from '../src/commands/workflow.ts';

test('workflow command exposes fund and auto as first-class subcommands', () => {
  const workflow = createWorkflowCommand();
  const names = workflow.commands.map((command) => command.name());

  assert.ok(names.includes('fund'));
  assert.ok(names.includes('auto'));
});
