import { describe, expect, it } from 'vitest';
import { IssueLabel } from './issues.ts';

describe('IssueLabel', () => {
  it('carries the name and the GitHub color, six hex digits without the hash', () => {
    expect(IssueLabel.parse({ name: 'bug', color: 'd73a4a' })).toEqual({
      name: 'bug',
      color: 'd73a4a',
    });
  });

  it('refuses a label without a color, a hash prefix or a short color', () => {
    expect(IssueLabel.safeParse({ name: 'bug' }).success).toBe(false);
    expect(IssueLabel.safeParse({ name: 'bug', color: '#d73a4a' }).success).toBe(false);
    expect(IssueLabel.safeParse({ name: 'bug', color: 'fff' }).success).toBe(false);
  });
});
