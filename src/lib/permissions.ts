export type AppRole = 'sales' | 'engineer' | 'admin';
export const canViewPricing = (role: unknown): boolean => role === 'engineer' || role === 'admin';
export const canManageUsers = (role: unknown): boolean => role === 'admin';
