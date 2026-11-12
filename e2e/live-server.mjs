// factory-live's real server for the « live » e2e (#67), between the live build of the app and the fake
// workflow-core (e2e/fake-api.mjs): LIVE_SOURCE=workflow-core, a temporary base and secrets folder, its
// GitHub answered by the fake core under /github. Nothing of the machine is read.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.env.PORT ?? '4183';
const core = process.env.FAKE_CORE_URL ?? 'http://127.0.0.1:4182';
const root = mkdtempSync(join(tmpdir(), 'factory-live-e2e-'));
const dir = (name) => {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  return path;
};
const secrets = dir('secrets');
writeFileSync(
  join(secrets, 'workflow-core-secret'),
  process.env.FAKE_CORE_SECRET ?? 'secret-du-socle-des-e2e',
);
// The fallback token of ADR 0003: the comment of a gesture goes to the fake GitHub with it.
writeFileSync(join(secrets, 'github-token'), 'jeton-des-e2e');

const server = spawn(process.execPath, ['--conditions=source', 'apps/server/src/main.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port,
    HOST: '127.0.0.1',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
    LIVE_SOURCE: 'workflow-core',
    WORKFLOW_CORE_URL: core,
    GITHUB_API: `${core}/github`,
    SECRETS_DIR: secrets,
    DATA_DIR: dir('data'),
    // Folders of the machine nobody reads on the core's side: empty ones.
    HERMES_HOME: dir('hermes'),
    FACTORY_REPO: dir('factory'),
    CLAUDE_PROJECTS: dir('claude'),
    WEB_DIST: dir('web'),
    WORKFLOWS: '',
    // The live build is served on 4181 and relays /api here (vite preview, changeOrigin).
    PUBLIC_ORIGINS: 'http://127.0.0.1:4181',
  },
});

const stop = () => {
  server.kill('SIGTERM');
  rmSync(root, { recursive: true, force: true });
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => {
  rmSync(root, { recursive: true, force: true });
  process.exit(code ?? 0);
});
