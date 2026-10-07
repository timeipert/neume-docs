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
const isPublic = computed(() => route.path.startsWith('/public'));
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

// A menu left open over the new page is disorienting, so close on navigation.
watch(() => route.path, () => { isMenuOpen.value = false; });
</script>

<template>
  <div class="app-shell">
    <nav v-if="!isPublic && !isSetup" class="top-nav">
      <RouterLink to="/projects" class="nav-brand" aria-label="neume-docs home">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20"><ellipse cx="8" cy="8" rx="4.2" ry="3.2" transform="rotate(-18 8 8)" fill="currentColor"/><ellipse cx="16" cy="16" rx="4.2" ry="3.2" transform="rotate(-18 16 16)" fill="currentColor"/></svg>
        </span>
        <span class="brand-text">neume-docs</span>
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

        <RouterLink to="/workspace" active-class="active" @click="isMenuOpen = false">Workspace</RouterLink>
        <RouterLink to="/settings" active-class="active" @click="isMenuOpen = false">Settings</RouterLink>
        <span class="nav-sep" aria-hidden="true"></span>
        <SaveReminder />
        <a href="manual/index.html" target="_blank" class="nav-util manual-link">Manual</a>
        <a href="#/public" target="_blank" rel="noopener" class="nav-util public-ext-link">Public&nbsp;↗</a>
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

.top-nav {
  flex: 0 0 auto;
  min-height: 58px;
  background: linear-gradient(180deg, #263449 0%, var(--color-nav-bg) 100%);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  gap: var(--space-4);
  justify-content: space-between;
  position: relative;
  z-index: 100;
  box-shadow: 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.18);
}

.nav-brand {
  font-weight: 700;
  font-size: 1.12rem;
  color: var(--color-surface) !important;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  letter-spacing: -0.01em;
  text-decoration: none;
  white-space: nowrap;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(59,130,246,0.35);
}
.nav-brand:hover .brand-mark { transform: translateY(-1px); }
.brand-mark, .nav-brand:hover .brand-mark { transition: transform 0.2s ease; }

.nav-links {
  display: flex;
  align-items: center;
  gap: 2px;
}

.nav-links a {
  position: relative;
  color: var(--color-text-light);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  padding: var(--space-2) 0.5rem;
  border-radius: var(--radius-md);
  transition: color 0.15s ease, background 0.15s ease;
}

.nav-links a:hover {
  color: var(--color-surface);
  background: rgba(255, 255, 255, 0.07);
}

.nav-links a.active {
  color: var(--color-surface);
  background: rgba(255, 255, 255, 0.1);
  font-weight: 600;
}
/* Active underline indicator */
.nav-links a.active::after {
  content: "";
  position: absolute;
  left: 12px; right: 12px; bottom: -1px;
  height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
}

.nav-sep {
  width: 1px; height: 22px;
  background: rgba(255,255,255,0.12);
  margin: 0 var(--space-2);
}

.nav-util {
  color: var(--color-text-light) !important;
  font-size: 0.85rem;
}
.nav-util:hover { color: var(--color-surface) !important; background: rgba(255,255,255,0.07); }

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
.main-content::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }

/* Responsive Nav */
.hamburger-btn {
  display: none;
  background: transparent;
  border: none;
  color: var(--color-surface);
  font-size: 1.5rem;
  padding: 0.5rem;
  cursor: pointer;
}

/* The full bar needs about 960px; below that the menu folds into a column. */
@media (max-width: 980px) {
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
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
    border-bottom: 1px solid rgba(255,255,255,0.05);
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

  .nav-sep { width: 100%; height: 1px; margin: var(--space-2) 0; }
  /* Room to spell the save status out in the opened menu. */
  .nav-links :deep(.pill-label) { display: inline !important; }
  .nav-links :deep(.save-pill) { padding: 6px 12px; }
}
</style>
