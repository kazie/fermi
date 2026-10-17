import { defineConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'

export default defineConfig({
  plugins: [HstVue()],
  // GitHub Pages serves the stories under /<repo>/ (set by .github/workflows/stories.yml)
  vite: { base: process.env.HISTOIRE_BASE ?? '/' },
  setupFile: '/src/histoire.setup.ts',
  storyMatch: ['src/**/*.story.vue'],
  tree: {
    groups: [
      { id: 'screens', title: 'Screens' },
      { id: 'components', title: 'Components' },
    ],
  },
  theme: {
    title: 'Fermi',
    defaultColorScheme: 'dark',
  },
  defaultStoryProps: {
    layout: { type: 'single', iframe: true },
  },
  responsivePresets: [
    { label: 'Phone (390)', width: 390, height: 844 },
    { label: 'Small phone (360)', width: 360, height: 740 },
    { label: 'Tablet (820)', width: 820, height: 1180 },
    { label: 'Desktop (1280)', width: 1280, height: 800 },
    { label: 'TV (1920)', width: 1920, height: 1080 },
  ],
  backgroundPresets: [
    { label: 'App', color: '#0b0e13', contrastColor: '#e8edf2' },
    { label: 'Transparent', color: 'transparent', contrastColor: '#333' },
  ],
})
