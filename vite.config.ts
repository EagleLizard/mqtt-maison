
/// <reference types="vitest/config" />
import { defineConfig, UserConfig } from 'vite';

const viteConfig: UserConfig = {
  test: {
    environment: 'node',
    include: [
      './src/**/*.{test,spec}.{js,ts}',
    ],
    reporters: [
      'default',
      'junit',
    ],
    outputFile: {
      junit: './test-reports/junit.xml',
    },
    coverage: {
      include: [
        'src/**/*.{js,ts}',
      ],
      exclude: [

      ],
      // all: true,
      provider: 'istanbul',
      reporter: [
        'text',
        'cobertura',
        'html',
      ]
    }
  },
};

export default defineConfig(viteConfig);
