/**
 * Standalone provider verification CLI.
 *
 *   npm run verify:providers
 *
 * Exits non-zero if any *configured* external provider (storage/email/sms) or a
 * critical dependency (database/redis) fails its connectivity check. Console
 * drivers always pass. Use this in CD before cutting traffic to a new release.
 */
import 'dotenv/config';
import { deepHealth } from '../src/lib/health';
import { disconnectDatabase } from '../src/lib/prisma';
import { disconnectRedis } from '../src/lib/redis';
import { closeQueue } from '../src/adapters/queue';

async function main(): Promise<void> {
  const report = await deepHealth(true);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));

  const failed = Object.entries(report.checks).filter(([, c]) => !c.ok);
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`\nProvider verification FAILED: ${failed.map(([n]) => n).join(', ')}`);
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log('\nAll configured providers and dependencies are reachable.');
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueue().catch(() => undefined);
    await disconnectRedis().catch(() => undefined);
    await disconnectDatabase().catch(() => undefined);
  });
