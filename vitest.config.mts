import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // note: e2e tests expect the environment to be node, it fails in jsdom
    environment: 'node',
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
