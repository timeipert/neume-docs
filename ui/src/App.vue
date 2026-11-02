<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router'
import SaveReminder from './components/SaveReminder.vue';
import ToastHost from './components/ui/ToastHost.vue';
import MonodiExchangeDialog from './components/workspace/MonodiExchangeDialog.vue';
import LinkAssistantDialog from './components/workspace/LinkAssistantDialog.vue';
import { useProjectPublishing } from './composables/useProjectPublishing';


useProjectPublishing();

const route = useRoute();
// The start page, the documentations and the old public pages stand alone: they have no editor navigation.
const isPublic = computed(() => route.path.startsWith('/public') || !!route.meta.bare);
const isSetup = computed(() => route.path === '/setup');
// The page editor, when a project's cell sent you there, still belongs to that project.
const isProjectPage = computed(() => route.path.startsWith('/projects') || route.query.return_to === 'project');
const isMenuOpen = ref(false);

/**
 * Which top-level item a page belongs to. The page editor and the custom collections are
 * reached from elsewhere: from a project's cell (then they are that project), from the
 * catalogue, or from the workspace.
 */
const fromProject = computed(() => route.query.return_to === 'project');
const inProjects = computed(() => route.path.startsWith('/projects') || fromProject.value);
const inManuscripts = computed(() => !fromProject.value && ['/manuscripts', '/ommr', '/polygons', '/annotations'].some(p => route.path.startsWith(p)));
const inPatterns = computed(() => route.path.startsWith('/patterns'));
const inWorkspace = computed(() => route.path.startsWith('/workspace'));
const inSettings = computed(() => route.path.startsWith('/settings'));

// A menu left open over the new page is disorienting, so close on navigation.
watch(() => route.path, () => { isMenuOpen.value = false; });
</script>

<template>
  <div class="app-shell">
    <nav v-if="!isPublic && !isSetup" class="top-nav">
      <RouterLink to="/" class="nav-brand" aria-label="Neumedocs start">
        <span class="brand-text">Neumedocs</span>
      </RouterLink>
      <button class="hamburger-btn" @click="isMenuOpen = !isMenuOpen" :aria-expanded="isMenuOpen" aria-controls="nav-links" aria-label="Toggle navigation">
        <span v-if="!isMenuOpen">☰</span>
        <span v-else>✕</span>
      </button>
      <div id="nav-links" class="nav-links" :class="{ 'menu-open': isMenuOpen }">
        <!-- Work happens in projects, on manuscripts, with patterns. -->
        <RouterLink to="/projects" :class="{ active: inProjects }" @click="isMenuOpen = false">Projects</RouterLink>
        <RouterLink to="/manuscripts" :class="{ active: inManuscripts }" @click="isMenuOpen = false">Manuscripts</RouterLink>
        <RouterLink to="/patterns" :class="{ active: inPatterns }" @click="isMenuOpen = false">Patterns</RouterLink>

        <span class="nav-sep" aria-hidden="true"></span>

        <RouterLink to="/workspace" :class="{ active: inWorkspace }" @click="isMenuOpen = false">Workspace</RouterLink>
        <RouterLink to="/settings" :class="{ active: inSettings }" @click="isMenuOpen = false">Settings</RouterLink>
        <span class="nav-sep" aria-hidden="true"></span>
        <SaveReminder />
        <a href="manual/index.html" target="_blank" class="nav-util manual-link">Manual</a>
        <RouterLink to="/docs" class="nav-util public-ext-link" @click="isMenuOpen = false">Documentations</RouterLink>
      </div>
    </nav>
    
    <main class="main-content">
      <RouterView />
    </main>

    <!-- Always visible, including on /public and /setup which have no top-nav:
         this app is one piece of the wider Corpus Monodicum infrastructure. -->
    <ToastHost />
    <MonodiExchangeDialog />
    <LinkAssistantDialog />

    <footer class="cm-footer">
      Part of the Corpus Monodicum infrastructure —
      <a href="https://monodi.app" target="_blank" rel="noopener">monodi.app</a>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100vh;
  width: 100%;
  overflow: hidden;
}

/* A running head, as at the top of a printed page: the name, the places, a hairline below. */
.top-nav {
  flex: 0 0 auto;
  min-height: 52px;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  padding: 0 var(--space-5);
  gap: var(--space-4);
  justify-content: space-between;
  position: relative;
  z-index: 100;
}

.nav-brand {
  font-size: 1.15rem;
  color: var(--color-text) !important;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  letter-spacing: 0.01em;
  text-decoration: none;
  white-space: nowrap;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 2px;
}

.nav-links a {
  position: relative;
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 1.05rem;
  font-weight: 400;
  font-variant: small-caps;
  letter-spacing: 0.06em;
  white-space: nowrap;
  padding: var(--space-2) 0.6rem;
  border-radius: var(--radius-md);
}

.nav-links a:hover {
  color: var(--color-text);
}

.nav-links a.active {
  color: var(--color-text);
}
/* The place one is at is marked by a rule in the rubric red under it */
.nav-links a.active::after {
  content: "";
  position: absolute;
  left: 0.6rem; right: 0.6rem; bottom: -1px;
  height: 1px;
  background: var(--color-primary);
}

.nav-sep {
  width: 1px; height: 18px;
  background: var(--color-border);
  margin: 0 var(--space-2);
}

.nav-util {
  color: var(--color-text-muted) !important;
  font-size: 0.95rem !important;
  font-style: italic;
  font-variant: normal !important;
  letter-spacing: 0 !important;
}
.nav-util:hover { color: var(--color-primary) !important; }

.main-content {
  flex: 1;
  overflow: auto; /* Allow scrolling */
  background: var(--color-bg);
  width: 100%;
  min-height: 0; /* let the footer keep its own space in the flex column */
}

.cm-footer {
  flex: 0 0 auto;
  padding: 6px var(--space-5);
  font-size: 0.72rem;
  color: var(--color-text-light);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  text-align: center;
}
.cm-footer a {
  color: var(--color-text-muted);
  font-weight: 600;
  text-decoration: none;
}
.cm-footer a:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

/* Scrollbar styling for Webkit */
.main-content::-webkit-scrollbar { width: 8px; height: 8px; }
.main-content::-webkit-scrollbar-thumb { background: var(--color-border-hover); border-radius: 4px; }

/* Responsive Nav */
.hamburger-btn {
  display: none;
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 1.5rem;
  padding: 0.5rem;
  cursor: pointer;
}

/* The full bar, set in the book face, needs about 1130px; below that the menu folds into a column. */
@media (max-width: 1180px) {
  .hamburger-btn {
    display: block;
  }
  
  .nav-links {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-nav-bg);
    flex-direction: column;
    padding: var(--space-4);
    box-shadow: var(--shadow-lg);
    border-bottom: 1px solid var(--color-border);
    transform: translateY(-150%);
    opacity: 0;
    pointer-events: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .nav-links.menu-open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
  
  .nav-links a, .nav-links .public-ext-link {
    width: 100%;
    text-align: center;
    margin: 0;
  }

  .nav-links a.active::after { display: none; }
  .nav-links a.active { color: var(--color-primary); }
  .nav-sep { width: 100%; height: 1px; margin: var(--space-2) 0; }
  /* Room to spell the save status out in the opened menu. */
  .nav-links :deep(.pill-label) { display: inline !important; }
  .nav-links :deep(.save-pill) { padding: 6px 12px; }
}
</style>
