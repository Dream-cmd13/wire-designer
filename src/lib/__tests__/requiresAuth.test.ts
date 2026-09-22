import { describe, expect, it } from 'vitest';
import { appRoutes, requiresAuth, shouldKeepRouteAfterLogin } from '@/lib/appRoute';

describe('route auth requirements', () => {
  it('requires login for home, designer and materials routes', () => {
    expect(requiresAuth(appRoutes.home)).toBe(true);
    expect(requiresAuth(appRoutes['designer-design'])).toBe(true);
    expect(requiresAuth(appRoutes['designer-product-image'])).toBe(true);
    expect(requiresAuth(appRoutes.materials)).toBe(true);
  });

  it('allows anonymous access to the standalone drawing workbench', () => {
    expect(requiresAuth(appRoutes['drawing-workbench'])).toBe(false);
  });

  it('keeps the current route after anonymous visitors log in', () => {
    expect(shouldKeepRouteAfterLogin(appRoutes.materials, null)).toBe(true);
    expect(shouldKeepRouteAfterLogin(appRoutes['drawing-workbench'], null)).toBe(true);
    expect(shouldKeepRouteAfterLogin(appRoutes['designer-design'], 'project-1')).toBe(true);
    expect(shouldKeepRouteAfterLogin(appRoutes['designer-design'], null)).toBe(false);
    expect(shouldKeepRouteAfterLogin(appRoutes.home, null)).toBe(false);
  });
});
