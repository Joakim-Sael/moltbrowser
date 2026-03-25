/**
 * MoltBrowser CLI integration tests.
 *
 * Tests the CLI dispatcher, auth, hub state management, and command routing.
 * Does NOT test actual browser operations (those are covered by the MCP package tests).
 */

import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.join(__dirname, '..', 'moltbrowser.js');

// Create a temporary auth file for tests that need authentication
function setupTestAuth(): { dir: string; env: Record<string, string> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moltbrowser-auth-'));
  const authFile = path.join(dir, 'auth.json');
  fs.writeFileSync(authFile, JSON.stringify({
    apiKey: 'test-key-for-unit-tests',
    username: 'test-user',
    loginAt: new Date().toISOString(),
  }));
  // Point HOME to the temp dir so ~/.moltbrowser/auth.json resolves there
  const moltDir = path.join(dir, '.moltbrowser');
  fs.mkdirSync(moltDir, { recursive: true });
  fs.writeFileSync(path.join(moltDir, 'auth.json'), JSON.stringify({
    apiKey: 'test-key-for-unit-tests',
    username: 'test-user',
    loginAt: new Date().toISOString(),
  }));
  return { dir, env: { HOME: dir, HUB_API_KEY: '' } };
}

function runCli(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): { stdout: string; stderr: string; exitCode: number } {
  try {
    const result = execFileSync(process.execPath, [CLI_PATH, ...args], {
      cwd: options.cwd || os.tmpdir(),
      env: { ...process.env, ...options.env },
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: result.toString(), stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() || '',
      stderr: err.stderr?.toString() || '',
      exitCode: err.status ?? 1,
    };
  }
}

test.describe('auth', () => {
  test('blocks commands without auth', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'moltbrowser-noauth-'));
    const result = runCli(['hub-list'], { env: { HOME: tmpHome, HUB_API_KEY: '' } });
    expect(result.stderr).toContain('Authentication required');
    expect(result.stderr).toContain('moltbrowser login');
    expect(result.exitCode).toBe(1);
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('allows help without auth', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'moltbrowser-noauth-'));
    const result = runCli(['help'], { env: { HOME: tmpHome, HUB_API_KEY: '' } });
    expect(result.stdout).toContain('MoltBrowser CLI');
    expect(result.exitCode).toBe(0);
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('allows login without auth', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'moltbrowser-noauth-'));
    // login with invalid key should fail on verification, not on our auth gate
    const result = runCli(['login', '--api-key=invalid-key'], { env: { HOME: tmpHome, HUB_API_KEY: '' } });
    // Should NOT get our specific auth gate message (the dispatcher gate)
    expect(result.stderr).not.toContain('Run `moltbrowser login` to get started.');
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('allows install without auth', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'moltbrowser-noauth-'));
    const result = runCli(['install'], { env: { HOME: tmpHome, HUB_API_KEY: '' } });
    expect(result.stdout).toContain('--skills');
    expect(result.exitCode).toBe(0);
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('reads key from auth.json', () => {
    const { dir, env } = setupTestAuth();
    const result = runCli(['hub-list'], { cwd: dir, env });
    // Should NOT get auth error (may get "no page loaded" which is fine)
    expect(result.stderr).not.toContain('Authentication required');
    expect(result.stdout).toContain('No page loaded yet');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('accepts HUB_API_KEY env var', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'moltbrowser-envauth-'));
    const result = runCli(['hub-list'], { env: { HOME: tmpHome, HUB_API_KEY: 'some-key' } });
    expect(result.stderr).not.toContain('Authentication required');
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('logout clears auth', () => {
    const { dir, env } = setupTestAuth();
    const authPath = path.join(dir, '.moltbrowser', 'auth.json');
    expect(fs.existsSync(authPath)).toBe(true);

    const result = runCli(['logout'], { env });
    expect(result.stdout).toContain('Logged out');

    expect(fs.existsSync(authPath)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test.describe('CLI help', () => {
  test('shows help text', () => {
    const result = runCli(['help']);
    expect(result.stdout).toContain('MoltBrowser CLI');
    expect(result.stdout).toContain('login');
    expect(result.stdout).toContain('hub-list');
    expect(result.stdout).toContain('hub-execute');
    expect(result.stdout).toContain('contribute-create');
    expect(result.exitCode).toBe(0);
  });

  test('--help flag shows help', () => {
    const result = runCli(['--help']);
    expect(result.stdout).toContain('MoltBrowser CLI');
    expect(result.exitCode).toBe(0);
  });
});

test.describe('hub commands without state', () => {
  let authSetup: { dir: string; env: Record<string, string> };

  test.beforeEach(() => {
    authSetup = setupTestAuth();
  });

  test.afterEach(() => {
    fs.rmSync(authSetup.dir, { recursive: true, force: true });
  });

  test('hub-list says no page loaded', () => {
    const result = runCli(['hub-list'], { cwd: authSetup.dir, env: authSetup.env });
    expect(result.stdout).toContain('No page loaded yet');
    expect(result.exitCode).toBe(0);
  });

  test('hub-execute without args shows usage', () => {
    const result = runCli(['hub-execute'], { cwd: authSetup.dir, env: authSetup.env });
    expect(result.stderr).toContain('Usage');
    expect(result.exitCode).toBe(1);
  });

  test('hub-info without args shows usage', () => {
    const result = runCli(['hub-info'], { cwd: authSetup.dir, env: authSetup.env });
    expect(result.stderr).toContain('Usage');
    expect(result.exitCode).toBe(1);
  });
});

test.describe('hub state', () => {
  let authSetup: { dir: string; env: Record<string, string> };

  test.beforeEach(() => {
    authSetup = setupTestAuth();
  });

  test.afterEach(() => {
    fs.rmSync(authSetup.dir, { recursive: true, force: true });
  });

  test('hub-list reads state file', () => {
    const stateDir = path.join(authSetup.dir, '.moltbrowser');
    const state = {
      url: 'https://example.com',
      domain: 'example.com',
      configs: [{
        _id: 'test-config-1',
        name: 'example-home',
        tools: [
          { name: 'search', description: 'Search for content', inputSchema: { properties: { query: { type: 'string' } } } },
          { name: 'get-links', description: 'Extract all links' },
        ],
      }],
      tools: [],
      timestamp: Date.now(),
    };
    fs.writeFileSync(path.join(stateDir, 'hub-state.json'), JSON.stringify(state));

    const result = runCli(['hub-list'], { cwd: authSetup.dir, env: authSetup.env });
    expect(result.stdout).toContain('example.com');
    expect(result.stdout).toContain('search');
    expect(result.stdout).toContain('get-links');
    expect(result.stdout).toContain('2 available');
    expect(result.exitCode).toBe(0);
  });

  test('hub-info shows tool details', () => {
    const stateDir = path.join(authSetup.dir, '.moltbrowser');
    const state = {
      url: 'https://example.com',
      domain: 'example.com',
      configs: [{
        _id: 'test-config-1',
        name: 'example-home',
        tools: [{
          name: 'search',
          description: 'Search for content on the page',
          inputSchema: { properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
          execution: { fields: [{ name: 'query', selector: '#search', type: 'text' }] },
        }],
      }],
      tools: [],
      timestamp: Date.now(),
    };
    fs.writeFileSync(path.join(stateDir, 'hub-state.json'), JSON.stringify(state));

    const result = runCli(['hub-info', 'search'], { cwd: authSetup.dir, env: authSetup.env });
    expect(result.stdout).toContain('search');
    expect(result.stdout).toContain('Search for content');
    expect(result.stdout).toContain('--query');
    expect(result.stdout).toContain('required');
    expect(result.exitCode).toBe(0);
  });

  test('hub-execute fails for unknown tool', () => {
    const stateDir = path.join(authSetup.dir, '.moltbrowser');
    const state = {
      url: 'https://example.com',
      domain: 'example.com',
      configs: [{ _id: 'c1', name: 'example', tools: [] }],
      tools: [],
      timestamp: Date.now(),
    };
    fs.writeFileSync(path.join(stateDir, 'hub-state.json'), JSON.stringify(state));

    const result = runCli(['hub-execute', 'nonexistent'], { cwd: authSetup.dir, env: authSetup.env });
    expect(result.stderr).toContain('not found');
    expect(result.exitCode).toBe(1);
  });
});

test.describe('contribute commands require auth', () => {
  test('contribute-create blocked without auth', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'moltbrowser-noauth-'));
    const result = runCli(['contribute-create', '--domain=example.com', '--url-pattern=example.com', '--title=Test'], {
      env: { HOME: tmpHome, HUB_API_KEY: '' },
    });
    expect(result.stderr).toContain('Authentication required');
    expect(result.exitCode).toBe(1);
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('contribute-vote validates vote value when authed', () => {
    const { dir, env } = setupTestAuth();
    const result = runCli(['contribute-vote', '--config-id=abc', '--name=test', '--vote=maybe'], { env });
    expect(result.stderr).toContain('up" or "down"');
    expect(result.exitCode).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test.describe('install command', () => {
  test('install --skills copies skill files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moltbrowser-test-'));
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });

    const result = runCli(['install', '--skills'], { cwd: tmpDir });
    expect(result.stdout).toContain('Skills installed');
    expect(result.exitCode).toBe(0);

    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'moltbrowser', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'moltbrowser', 'references', 'hub-tools.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'moltbrowser', 'references', 'contributing.md'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('install without --skills shows usage', () => {
    const result = runCli(['install']);
    expect(result.stdout).toContain('--skills');
    expect(result.exitCode).toBe(0);
  });
});

test.describe('global flags', () => {
  test('--no-hub with --help works without auth', () => {
    const result = runCli(['--no-hub', '--help']);
    expect(result.stdout).toContain('MoltBrowser CLI');
    expect(result.exitCode).toBe(0);
  });
});
