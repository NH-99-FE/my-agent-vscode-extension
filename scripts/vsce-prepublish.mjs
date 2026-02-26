import { execSync } from 'node:child_process';

if (process.env.AGENT_SKIP_PREPUBLISH === '1') {
  console.log('[vsce-prepublish] Skip build because AGENT_SKIP_PREPUBLISH=1');
  process.exit(0);
}

execSync('pnpm build', { stdio: 'inherit' });
