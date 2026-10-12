import { describe, expect, it } from 'vitest';
import { canViewPricing, canManageUsers } from '../permissions';

describe('pricing permissions', () => {
  it('denies unknown and sales roles', () => {
    for (const role of [undefined, null, 'sales', 'owner', '']) {
      expect(canViewPricing(role)).toBe(false);
      expect(canManageUsers(role)).toBe(false);
    }
  });
  it('allows engineers to maintain pricing and only admins to assign roles', () => {
    expect(canViewPricing('engineer')).toBe(true);
    expect(canManageUsers('engineer')).toBe(false);
    expect(canViewPricing('admin')).toBe(true);
    expect(canManageUsers('admin')).toBe(true);
  });
});
