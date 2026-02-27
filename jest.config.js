module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: [
    '**/__tests__/**/*.test.(ts|js)',
    '**/*.(test|spec).(ts|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  globalTeardown: '<rootDir>/__tests__/teardown.ts',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30000,
  verbose: true,
  clearMocks: true,
  detectOpenHandles: false, // Temporarily disabled while we focus on feature completion
  detectLeaks: false,
};