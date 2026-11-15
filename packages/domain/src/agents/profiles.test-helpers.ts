import type { PluginHook, ProfileFacts } from './types.ts';

/** The hooks of the factory's plugins, as their `register()` registers them. */
export const FACTORY_HOOKS: readonly PluginHook[] = [
  {
    plugin: 'coder-guard',
    hook: 'pre_tool_call',
    callback: 'pre_tool',
    source: 'ctx.register_hook("pre_tool_call", pre_tool)',
  },
  {
    plugin: 'coder-guard',
    hook: 'post_tool_call',
    callback: 'post_tool',
    source: 'ctx.register_hook("post_tool_call", post_tool)',
  },
  {
    plugin: 'coder-guard',
    hook: 'pre_llm_call',
    callback: 'inject',
    source: 'ctx.register_hook("pre_llm_call", inject)',
  },
  {
    plugin: 'comment-guard',
    hook: 'pre_tool_call',
    callback: 'guard',
    source: 'ctx.register_hook("pre_tool_call", guard)',
  },
  {
    plugin: 'gate-readonly',
    hook: 'pre_tool_call',
    callback: 'guard',
    source: 'ctx.register_hook("pre_tool_call", guard)',
  },
  {
    plugin: 'merge-guard',
    hook: 'pre_tool_call',
    callback: 'guard',
    source: 'ctx.register_hook("pre_tool_call", guard)',
  },
];

/** The coder's config before the fix of 2026-10-29: no hook delay, 30 s by default. */
export function coderProfile(patch: Partial<ProfileFacts> = {}): ProfileFacts {
  return {
    profile: 'coder',
    hookTimeout: null,
    toolDeadline: null,
    terminalTimeout: 900,
    maxTurns: 400,
    changedAt: Date.parse('2026-10-29T01:21:22Z') / 1000,
    repoHookTimeout: null,
    plugins: ['coder-guard', 'comment-guard', 'factory-notify'],
    hooks: FACTORY_HOOKS,
    ...patch,
  };
}
