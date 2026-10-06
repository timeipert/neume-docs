import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "neume-docs",
  description: "User Manual & Documentation",
  base: '/manual/',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/docs/getting-started' }
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/docs/getting-started' },
          { text: 'Loading Data', link: '/docs/loading-data' },
          { text: 'Conventions & Terminology', link: '/docs/conventions' },
          { text: 'Core Workflow', link: '/docs/workflow' }
        ]
      },
      {
        text: 'Features & Usage',
        items: [
          { text: 'Manuscript Metadata', link: '/docs/manuscript-metadata' },
          { text: 'IIIF Sources & MMMO', link: '/docs/iiif-sources' },
          { text: 'Projects', link: '/docs/projects' },
          { text: 'The Neume Table', link: '/docs/neume-table' },
          { text: 'Pattern Editor & Ref IDs', link: '/docs/equivalents' },
          { text: 'Manuscript Annotation', link: '/docs/annotation' },
          { text: 'Workspace & Backup', link: '/docs/workspace' },
          { text: 'Settings', link: '/docs/settings' },
          { text: 'Public Documentation', link: '/docs/public-view' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/timeipert/neume-docs' }
    ]
  }
})
