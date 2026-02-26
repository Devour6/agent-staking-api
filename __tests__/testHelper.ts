import { stakeMonitoringService } from '../src/services/monitoring';
import { webhookDeliveryService } from '../src/services/webhookDelivery';

export async function setupTests(): Promise<void> {
  // Any global test setup
}

export async function teardownTests(): Promise<void> {
  // Stop any background services to allow clean test exit
  stakeMonitoringService.stopMonitoring();
  
  // Clean up any intervals that might be running
  // Force close any open handles
}

// Jest global setup/teardown
beforeAll(async () => {
  await setupTests();
});

afterAll(async () => {
  await teardownTests();
});