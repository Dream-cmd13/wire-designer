import type { Project } from '@/types/user';

const CACHE_VERSION = 1;
const CACHE_PREFIX = `wh_projects_v${CACHE_VERSION}_`;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEnvelope {
  version: number;
  userId: string;
  projects: Project[];
  cachedAt: number;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Storage access might throw in certain browser/iframe security contexts
  }
  return null;
}

export function getCachedProjects(userId: string, ttlMs: number = DEFAULT_TTL_MS): Project[] | null {
  if (!userId) return null;
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(`${CACHE_PREFIX}${userId}`);
    if (!raw) return null;

    const envelope = JSON.parse(raw) as CacheEnvelope;
    if (
      !envelope
      || envelope.version !== CACHE_VERSION
      || envelope.userId !== userId
      || !Array.isArray(envelope.projects)
    ) {
      storage.removeItem(`${CACHE_PREFIX}${userId}`);
      return null;
    }

    if (Date.now() - envelope.cachedAt > ttlMs) {
      storage.removeItem(`${CACHE_PREFIX}${userId}`);
      return null;
    }

    return envelope.projects;
  } catch {
    return null;
  }
}

export function setCachedProjects(userId: string, projects: Project[]): void {
  if (!userId) return;
  const storage = getStorage();
  if (!storage) return;

  try {
    const sanitizedProjects: Project[] = projects.map((project) => ({
      id: String(project.id),
      userId: String(project.userId),
      name: String(project.name ?? ''),
      description: String(project.description ?? ''),
      createdAt: Number(project.createdAt) || Date.now(),
      updatedAt: Number(project.updatedAt) || Date.now(),
    }));

    const envelope: CacheEnvelope = {
      version: CACHE_VERSION,
      userId,
      projects: sanitizedProjects,
      cachedAt: Date.now(),
    };

    storage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(envelope));
  } catch (error) {
    console.warn('Failed to save projects to local cache:', error);
  }
}

export function clearCachedProjects(userId?: string): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    if (userId) {
      storage.removeItem(`${CACHE_PREFIX}${userId}`);
    } else {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith('wh_projects_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => storage.removeItem(key));
    }
  } catch {
    // ignore cleanup errors
  }
}
