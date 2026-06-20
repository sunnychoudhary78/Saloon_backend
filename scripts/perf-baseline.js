'use strict';

/**
 * Lightweight performance baseline for browseSalons.
 *
 * Usage:
 *   node scripts/perf-baseline.js [baseUrl] [limit]
 *
 * Example:
 *   node scripts/perf-baseline.js http://localhost:3011/api/app 10
 *
 * Requires a valid customer JWT in PERF_AUTH_TOKEN when the endpoint is protected.
 */

const axios = require('axios');

const baseUrl = process.argv[2] || 'http://localhost:3011/api/app';
const limit = parseInt(process.argv[3], 10) || 10;
const token = process.env.PERF_AUTH_TOKEN;

async function measureBrowse(iterations = 5) {
  const durations = [];

  for (let i = 0; i < iterations; i += 1) {
    const started = Date.now();
    const response = await axios.get(`${baseUrl}/salons`, {
      params: { limit, offset: 0 },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      validateStatus: () => true,
    });
    const elapsed = Date.now() - started;
    durations.push(elapsed);

    if (response.status !== 200) {
      console.error(`Request failed with status ${response.status}`);
      console.error(response.data);
      process.exit(1);
    }

    const payloadBytes = Buffer.byteLength(JSON.stringify(response.data), 'utf8');
    const salons = response.data?.data?.length ?? 0;
    const previewCount = response.data?.data?.[0]?.preview_images?.length ?? 0;
  }

  durations.sort((a, b) => a - b);
  const p95Index = Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1);

  console.log('browseSalons baseline');
  console.log(`  url: ${baseUrl}/salons?limit=${limit}`);
  console.log(`  iterations: ${iterations}`);
  console.log(`  min_ms: ${durations[0]}`);
  console.log(`  p95_ms: ${durations[p95Index]}`);
  console.log(`  max_ms: ${durations[durations.length - 1]}`);
  console.log('Targets: p95 < 200ms, preview_images length = 3, thumbnails < 50KB each (verify separately)');
}

measureBrowse().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
