import { describe, expect, it } from 'vitest';
import { appRoutes, getRouteByPath, requiresAuth, shouldKeepRouteAfterLogin } from '@/lib/appRoute';

describe('route auth requirements', () => {
  it('exposes only the primary auto quote route on dev', () => {
    expect(getRouteByPath('/auto-quote')).toBe(appRoutes['auto-quote']);
    for (const version of [2, 3, 4, 5]) {
      expect(getRouteByPath(`/auto-quote-${version}`)).toBe(appRoutes.home);
    }
  });

  it('requires login for home, designer, materials and DWG viewer routes', () => {
    expect(requiresAuth(appRoutes.home)).toBe(true);
    expect(requiresAuth(appRoutes['designer-design'])).toBe(true);
    expect(requiresAuth(appRoutes['designer-product-image'])).toBe(true);
    expect(requiresAuth(appRoutes.materials)).toBe(true);
    expect(requiresAuth(appRoutes['dwg-viewer'])).toBe(true);
    expect(requiresAuth(appRoutes['auto-quote'])).toBe(true);
  });

  it('allows anonymous access to the standalone drawing workbench only', () => {
    expect(requiresAuth(appRoutes['drawing-workbench'])).toBe(false);
  });

  it('keeps the current route after anonymous visitors log in', () => {
    expect(shouldKeepRouteAfterLogin(appRoutes.materials, null)).toBe(true);
    expect(shouldKeepRouteAfterLogin(appRoutes['drawing-workbench'], null)).toBe(true);
    expect(shouldKeepRouteAfterLogin(appRoutes['dwg-viewer'], null)).toBe(true);
    expect(shouldKeepRouteAfterLogin(appRoutes['auto-quote'], null)).toBe(true);
    expect(shouldKeepRouteAfterLogin(appRoutes['designer-design'], 'project-1')).toBe(true);
    expect(shouldKeepRouteAfterLogin(appRoutes['designer-design'], null)).toBe(false);
    expect(shouldKeepRouteAfterLogin(appRoutes.home, null)).toBe(false);
  });
});
