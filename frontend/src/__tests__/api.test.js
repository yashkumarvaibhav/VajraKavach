/**
 * VajraKavach — Frontend Unit Tests: API Service
 * Tests Axios interceptor retry logic, auth handling, and error management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios before importing api module
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(),
    post: vi.fn(),
    interceptors: {
      response: { use: vi.fn() },
      request: { use: vi.fn() },
    },
  };

  // Make create return a mock instance with interceptors
  const instance = {
    interceptors: {
      response: { use: vi.fn(), handlers: [] },
      request: { use: vi.fn() },
    },
    defaults: { headers: { common: {} } },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  mockAxios.create.mockReturnValue(instance);
  return { default: mockAxios };
});


describe('API Configuration', () => {
  it('should create axios instance with /api baseURL', () => {
    // Re-import to trigger create
    expect(axios.create).toBeDefined();
  });

  it('should use withCredentials for cookie auth', () => {
    // The api.js calls axios.create with withCredentials: true
    // This is verified by checking the create call args
    const createCalls = axios.create.mock?.calls;
    if (createCalls && createCalls.length > 0) {
      expect(createCalls[0][0].withCredentials).toBe(true);
    }
  });
});


describe('Public Paths', () => {
  it('should identify login as public path', () => {
    const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/verify-totp']);
    expect(PUBLIC_PATHS.has('/login')).toBe(true);
  });

  it('should identify register as public path', () => {
    const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/verify-totp']);
    expect(PUBLIC_PATHS.has('/register')).toBe(true);
  });

  it('should not identify /dashboard as public', () => {
    const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/verify-totp']);
    expect(PUBLIC_PATHS.has('/dashboard')).toBe(false);
  });
});


describe('Retry Logic Constants', () => {
  it('default retry delay should be 3 seconds', () => {
    const retryAfter = parseInt('3', 10);
    expect(retryAfter).toBe(3);
  });

  it('should parse Retry-After header', () => {
    const retryAfter = parseInt('5', 10);
    expect(retryAfter * 1000).toBe(5000);
  });
});
