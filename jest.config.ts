// jest.config.ts
// Jest configuration for Eskout — uses ts-jest for TypeScript, path aliases mirror tsconfig
// Default environment is node (server actions, lib); use @jest-environment jsdom docblock for component tests
// RELEVANT FILES: tsconfig.json, package.json, docs/test-strategy.md

import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // server-only throws when imported outside RSC; in Jest (node env) we no-op it
    '^server-only$': '<rootDir>/src/__mocks__/server-only.ts',
  },
  clearMocks: true,
  // Ignore Next.js build output and node_modules
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  // ts-jest config for ESM compatibility
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      // Allow importing .tsx files in tests
      jsx: 'react-jsx',
    }],
  },
};

export default config;
