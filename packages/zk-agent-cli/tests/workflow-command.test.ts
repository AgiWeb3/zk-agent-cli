import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkflowCommand } from '../src/commands/workflow.ts';

test('workflow command exposes fund as a first-class subcommand', () => {
  const workflow = createWorkflowCommand();
  const names = workflow.commands.map((command) => command.name());

  assert.ok(names.includes('fund'));
});
