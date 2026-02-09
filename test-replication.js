#!/usr/bin/env node
/**
 * Integration Test for Master-Follower Trade Replication System
 * 
 * Run this to test the complete trade replication flow.
 * Usage: node test-replication.js [base-url] [secret]
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const SECRET = process.argv[3] || process.env.QUANTUM_ALPHA_SECRET || 'test-secret';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, prefix, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

async function test(name, fn) {
  try {
    log(colors.blue, 'TEST', `Running: ${name}`);
    const result = await fn();
    log(colors.green, 'PASS', `✓ ${name}`);
    return result;
  } catch (error) {
    log(colors.red, 'FAIL', `✗ ${name}: ${error.message}`);
    throw error;
  }
}

async function request(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-qa-secret': SECRET,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.message}`);
  }

  return data;
}

async function runTests() {
  console.log('\n' + colors.yellow + '=== Master-Follower Trade Replication Test Suite ===' + colors.reset + '\n');

  const followerId = 'TEST-FOLLOWER-' + Date.now();

  try {
    // Test 1: Add follower credentials
    const credResult = await test('Add Follower Credentials', async () => {
      return request('POST', '/api/followers/credentials', {
        followerId: followerId,
        clientId: 'TEST-CLIENT-123',
        apiKey: 'test-api-key-12345',
        accessToken: 'test-access-token-67890',
        brokerSessionId: 'test-session-123',
      });
    });

    console.log(`  → Credential ID: ${credResult.credentialId}`);

    // Test 2: Configure risk rules
    const riskResult = await test('Configure Risk Rules', async () => {
      return request('POST', '/api/followers/risk-config', {
        followerId: followerId,
        lot_multiplier: 0.5,
        max_quantity: 100,
        max_order_value: 50000,
        max_daily_loss: 10000,
        allowed_instruments: ['SBIN', 'RELIANCE', 'INFY', 'TCS'],
        allowed_product_types: ['MIS', 'CNC'],
        allowed_order_types: ['MARKET', 'LIMIT'],
        enabled: true,
      });
    });

    console.log(`  → Risk Config ID: ${riskResult.configId}`);

    // Test 3: Record consent
    const consentResult = await test('Record Follower Consent', async () => {
      return request('POST', '/api/followers/consent', {
        followerId: followerId,
      });
    });

    console.log(`  → Consent ID: ${consentResult.consentId}`);

    // Test 4: Replicate trade
    const masterOrderId = 'TEST-ORDER-' + Date.now();
    const replicateResult = await test('Replicate Master Trade', async () => {
      return request('POST', '/api/trades/replicate', {
        trade: {
          id: masterOrderId,
          symbol: 'SBIN',
          exchange: 'NSE',
          side: 'BUY',
          quantity: 100,
          price: 500.50,
          product_type: 'MIS',
          order_type: 'MARKET',
        },
        eventType: 'PLACE',
      });
    });

    console.log(`  → Event ID: ${replicateResult.eventId}`);
    console.log(`  → Summary: ${replicateResult.summary.successful} successful, ${replicateResult.summary.failed} failed, ${replicateResult.summary.skipped} skipped`);

    // Test 5: Query replication status
    const statusResult = await test('Query Replication Status', async () => {
      return request('GET', `/api/trades/replicate?masterOrderId=${masterOrderId}`, null);
    });

    console.log(`  → Found ${statusResult.mappings.length} order mappings`);
    if (statusResult.mappings.length > 0) {
      const mapping = statusResult.mappings[0];
      console.log(`    - Follower: ${mapping.follower_id}`);
      console.log(`    - Status: ${mapping.status}`);
      console.log(`    - Quantity: ${mapping.quantity}`);
    }

    // Test 6: Query trade events
    const eventsResult = await test('Query Trade Events', async () => {
      return request('GET', '/api/trades/events?limit=10', null);
    });

    console.log(`  → Found ${eventsResult.pagination.total} total events`);

    // Test 7: Query order mappings
    const mappingsResult = await test('Query Order Mappings', async () => {
      return request('GET', `/api/trades/mappings?followerId=${followerId}&limit=10`, null);
    });

    console.log(`  → Found ${mappingsResult.pagination.total} mappings for this follower`);

    // Test 8: Modify order
    const modifyResult = await test('Modify Follower Orders', async () => {
      return request('POST', '/api/trades/modify', {
        masterOrderId: masterOrderId,
        modification: {
          type: 'STOPLOSS',
          value: 490.00,
        },
      });
    });

    console.log(`  → Modified ${modifyResult.summary.successful} orders successfully`);

    // Test 9: Exit all positions
    const exitResult = await test('Exit All Positions', async () => {
      return request('POST', '/api/trades/exit', {
        masterOrderId: masterOrderId,
      });
    });

    console.log(`  → Exited ${exitResult.summary.successful} positions successfully`);

    // Test 10: Verify exit status
    const finalStatusResult = await test('Verify Exit Status', async () => {
      return request('GET', `/api/trades/replicate?masterOrderId=${masterOrderId}`, null);
    });

    const cancelledCount = finalStatusResult.mappings.filter(m => m.status === 'CANCELLED').length;
    console.log(`  → ${cancelledCount} orders marked as cancelled`);

    console.log('\n' + colors.green + '=== All tests passed! ===' + colors.reset + '\n');

    // Summary
    console.log(colors.yellow + 'Summary:' + colors.reset);
    console.log(`  Test Data:`);
    console.log(`    - Follower ID: ${followerId}`);
    console.log(`    - Master Order ID: ${masterOrderId}`);
    console.log(`  API Endpoint: ${BASE_URL}`);
    console.log(`  Database: Check follower_credentials, follower_risk_config, order_mappings, trade_events tables\n`);

  } catch (error) {
    console.log('\n' + colors.red + `=== Test suite failed: ${error.message} ===` + colors.reset + '\n');
    process.exit(1);
  }
}

// Check if server is reachable
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { method: 'GET' }).catch(() => null);
    return response !== null;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Connecting to: ${BASE_URL}`);
  console.log(`Using secret: ${SECRET.substring(0, 4)}...`);

  const serverReachable = await checkServer();
  if (!serverReachable) {
    log(colors.yellow, 'WARN', `Server may not be reachable at ${BASE_URL}`);
  }

  console.log('');
  await runTests();
}

main().catch(error => {
  console.error(colors.red, error, colors.reset);
  process.exit(1);
});
