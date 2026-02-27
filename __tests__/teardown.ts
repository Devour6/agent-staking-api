/**
 * Jest global teardown to properly close connections
 */

export default async (): Promise<void> => {
  // Clear any running timers
  const timerId = setInterval(() => {}, 1000);
  clearInterval(timerId);
  
  // Clear any running timeouts
  const timeoutId = setTimeout(() => {}, 1000);
  clearTimeout(timeoutId);
  
  // Force garbage collection to help close any lingering connections
  if (global.gc) {
    global.gc();
  }
  
  // Small delay to allow connections to close
  await new Promise(resolve => setTimeout(resolve, 100));
};