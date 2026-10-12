import { defineConfig } from 'vite';

export default defineConfig({
  // Custom domain (game.easycandle.app) is served at the site root.
  base: '/',
  envPrefix: ['VITE_', 'GA_'],
});
