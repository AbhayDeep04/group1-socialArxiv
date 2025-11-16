// --- THIS SECTION IS NOW FIXED ---
// Load .env.local variables into process.env
// We use the default import syntax for CommonJS compatibility
import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());
// --- END FIXED SECTION ---

import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Use jest-environment-jsdom as the test environment
  testEnvironment: 'jest-environment-jsdom',

  // Handle module aliases (like @/components)
  moduleNameMapper: {
    // --- THIS IS THE NEW FIX ---
    // Tell Jest to use our mock file whenever 'react-resizable-panels' is imported
    // --- END NEW FIX ---

    // Keep your existing mappers
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
  },

  // Don't test the Vercel deployment folder or node_modules
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],

  // --- WE HAVE REMOVED THE 'transformIgnorePatterns' BLOCK ---
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config)