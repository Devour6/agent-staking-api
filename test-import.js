// Test prom-client imports
console.log('Testing prom-client imports...');

try {
  const promClient = require('prom-client');
  console.log('Default import:', !!promClient);
  console.log('Registry available:', !!promClient.Registry);
  
  const { Registry } = require('prom-client');
  console.log('Named import Registry:', !!Registry);
  
  const registry = new Registry();
  console.log('Can create Registry instance:', !!registry);
} catch (error) {
  console.error('Error:', error.message);
}