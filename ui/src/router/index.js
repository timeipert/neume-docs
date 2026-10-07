import { createRouter, createWebHashHistory } from 'vue-router'
import GlobalAnalysisView from '../views/GlobalAnalysisView.vue'
import ManuscriptAnnotationsView from '../views/ManuscriptAnnotationsView.vue'
import SettingsView from '../views/SettingsView.vue'
import WorkspaceView from '../views/WorkspaceView.vue'
import PatternLibraryView from '../views/PatternLibraryView.vue'
import PolygonManagerView from '../views/PolygonManagerView.vue'
import OmmrExplorerView from '../views/OmmrExplorerView.vue'
import PublicManuscriptsView from '../views/PublicManuscriptsView.vue'
import PublicNotationView from '../views/PublicNotationView.vue'
import PublicNeumeTableView from '../views/PublicNeumeTableView.vue'
import PublicCustomManuscriptView from '../views/PublicCustomManuscriptView.vue'
import SetupView from '../views/SetupView.vue'
import CorpusView from '../views/CorpusView.vue'
import ManuscriptMetadataView from '../views/ManuscriptMetadataView.vue'
import IiifSourcesView from '../views/IiifSourcesView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import ProjectWizardView from '../views/ProjectWizardView.vue'
import ProjectShellView from '../views/ProjectShellView.vue'
import ProjectColumnsView from '../views/ProjectColumnsView.vue'
import ProjectTableView from '../views/ProjectTableView.vue'
import ProjectAllView from '../views/ProjectAllView.vue'
import ProjectPageView from '../views/ProjectPageView.vue'
import StartView from '../views/StartView.vue'
import DocsHomeView from '../views/docs/DocsHomeView.vue'
import DocsShellView from '../views/docs/DocsShellView.vue'
import DocsCatalogueView from '../views/docs/DocsCatalogueView.vue'
import DocsManuscriptView from '../views/docs/DocsManuscriptView.vue'
import DocsTableView from '../views/docs/DocsTableView.vue'
import DocsAboutView from '../views/docs/DocsAboutView.vue'

// Import storage for guard
import { useWorkspaceStorage } from '../composables/useWorkspaceStorage';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useProjectsStore } from '../stores/projects';
import { corpusReady } from '../composables/useTranscriptionData';
import { adoptLegacyProjects } from '../composables/useProjectAdoption';
import { getBaseCode } from '../utils/patternCode';
import { projectPageLocation } from '../utils/projectChoices';

/** Where a project is worked on first: choosing its columns, or — once chosen — filling the table. */
function projectHome(id) {
    const project = useProjectsStore().get(id);
    return { name: project && project.columnsChosen ? 'project_standard' : 'project_columns', params: { id } };
}

/** The tab a cell is in: the extended table when the code is only there. */
function projectCellTarget(to) {
    const project = useProjectsStore().get(to.params.id);
    const code = getBaseCode(to.query.code);
    const extendedOnly = !!(project && code && !project.columns.includes(code) && project.extended.includes(code));
    return {
        name: extendedOnly ? 'project_extended' : 'project_standard',
        params: { id: to.params.id },
        query: { cell: code || undefined }
    };
}

/**
 * A page editor address that was made for a project (`return_to=project`, before the editor had a
 * place in the project's frame) leads to the same page inside the project.
 */
function inProjectFrame(to) {
    if (to.query.return_to !== 'project' || !to.query.return_id) return true;
    return projectPageLocation(String(to.query.return_id), {
        folio: String(to.query.folio || ''), code: String(to.query.highlight || ''), line: String(to.query.line || to.query.region || '')
    });
}

const nothing = { render: () => null };

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/setup',
      name: 'setup',
      component: SetupView,
      meta: { title: 'Workspace Setup' }
    },
    // The start: read documentations, or make your own in the editor.
    {
      path: '/',
      name: 'start',
      component: StartView,
      meta: { title: 'neume-docs', bare: true }
    },
    // Documentations that others have published: read-only, no workspace needed.
    {
      path: '/docs',
      name: 'docs',
      component: DocsHomeView,
      meta: { title: 'Documentations', bare: true }
    },
    {
      path: '/docs/:endpoint',
      component: DocsShellView,
      props: true,
      meta: { bare: true },
      children: [
        { path: '', name: 'docs_catalogue', component: DocsCatalogueView },
        { path: 'm/:source', name: 'docs_manuscript', component: DocsManuscriptView, props: true },
        { path: 'table', name: 'docs_table', component: DocsTableView },
        { path: 'about', name: 'docs_about', component: DocsAboutView }
      ]
    },
    // The manuscripts: their catalogue, their images, and the corpus they come from.
    {
      path: '/manuscripts',
      name: 'metadata',
      component: ManuscriptMetadataView,
      meta: { title: 'Manuscripts', requiresWorkspace: true }
    },
    {
      path: '/manuscripts/images',
      name: 'iiif_sources',
      component: IiifSourcesView,
      meta: { title: 'Manuscript images', requiresWorkspace: true }
    },
    {
      path: '/manuscripts/corpus',
      name: 'corpus',
      component: CorpusView,
      meta: { title: 'Corpus', requiresWorkspace: true }
    },
    { path: '/metadata', redirect: (to) => ({ path: '/manuscripts', query: to.query }) },
    { path: '/metadata/iiif', redirect: (to) => ({ path: '/manuscripts/images', query: to.query }) },
    { path: '/corpus', redirect: (to) => ({ path: '/manuscripts/corpus', query: to.query }) },
    {
      path: '/projects',
      name: 'projects',
      component: ProjectsView,
      meta: { title: 'Projects', requiresWorkspace: true }
    },
    {
      path: '/projects/new',
      name: 'project_new',
      component: ProjectWizardView,
      meta: { title: 'New project', requiresWorkspace: true }
    },
    // The table of all manuscripts is the last tab of a project: go to the one worked on last.
    {
      path: '/projects/all',
      name: 'projects_all',
      redirect: () => {
        const store = useProjectsStore();
        const id = store.lastOpenedId || (store.projects[0] && store.projects[0].id);
        return id ? { name: 'project_all', params: { id } } : { name: 'projects' };
      }
    },
    {
      path: '/projects/:id',
      component: ProjectShellView,
      meta: { requiresWorkspace: true },
      children: [
        { path: '', name: 'project', redirect: (to) => projectHome(to.params.id) },
        { path: 'columns', name: 'project_columns', component: ProjectColumnsView, meta: { title: 'Columns' } },
        { path: 'standard', name: 'project_standard', component: ProjectTableView, props: { scope: 'standard' }, meta: { title: 'Standard table' } },
        { path: 'extended', name: 'project_extended', component: ProjectTableView, props: { scope: 'extended' }, meta: { title: 'Extended table' } },
        { path: 'all', name: 'project_all', component: ProjectAllView, meta: { title: 'All manuscripts' } },
        // The page editor, inside the frame of the project.
        { path: 'page', name: 'project_page', component: ProjectPageView, meta: { title: 'Page', fill: true } },
        // A link to one cell, from wherever the person was working on it.
        { path: 'cell', name: 'project_cell', redirect: projectCellTarget }
      ]
    },
    // The neume tables, the comparison and the table of all manuscripts are the project's tabs now.
    { path: '/table', redirect: '/projects' },
    {
      path: '/table/:source',
      component: nothing,
      beforeEnter: async (to) => {
        await adoptLegacyProjects();
        const source = String(to.params.source);
        const project = useProjectsStore().projects.find(p => p.source === source);
        return project ? { ...projectHome(project.id), replace: true } : { name: 'project_new', query: { source }, replace: true };
      }
    },
    { path: '/compare', redirect: '/projects/all' },
    {
      path: '/patterns',
      name: 'patterns',
      component: PatternLibraryView,
      meta: { title: 'Pattern library', requiresWorkspace: true }
    },
    {
      path: '/patterns/corpus',
      name: 'overview',
      component: GlobalAnalysisView,
      meta: { title: 'Patterns in the corpus', requiresWorkspace: true, requiresCorpus: true }
    },
    { path: '/overview', redirect: (to) => ({ path: '/patterns/corpus', query: to.query }) },
    // The old list of pattern tables: the neume tables replaced it.
    { path: '/equivalents', redirect: '/table' },
    {
      path: '/annotations/:id?',
      name: 'annotations',
      component: ManuscriptAnnotationsView,
      meta: { title: 'Manuscript Annotations', requiresWorkspace: true }
    },
    {
      path: '/ommr',
      name: 'ommr_explorer',
      component: OmmrExplorerView,
      meta: { title: 'Import', requiresWorkspace: true }
    },
    // Collections of screenshots belong to the projects that use them.
    { path: '/custom-manuscripts', redirect: { name: 'projects' } },
    {
      path: '/workspace',
      name: 'workspace',
      component: WorkspaceView,
      meta: { title: 'Workspace', requiresWorkspace: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { title: 'Settings', requiresWorkspace: true }
    },
    {
      path: '/polygons',
      name: 'polygons',
      component: PolygonManagerView,
      beforeEnter: inProjectFrame,
      meta: { title: 'Manuscripts', requiresWorkspace: true }
    },
    // Drawing a line's box is part of the page editor now.
    { path: '/polygons/edit-region', redirect: (to) => ({ name: 'polygons', query: to.query }) },
    {
      path: '/public',
      name: 'public_directory',
      component: PublicManuscriptsView,
      meta: { title: 'Public Directory' }
    },
    {
      path: '/public/table',
      name: 'public_neume_table',
      component: PublicNeumeTableView,
      meta: { title: 'Neume Table' }
    },
    {
      path: '/public/custom/:source',
      name: 'public_custom_manuscript',
      component: PublicCustomManuscriptView,
      meta: { title: 'Custom Manuscript' }
    },
    {
      path: '/public/:source',
      name: 'public_notation',
      component: PublicNotationView,
      meta: { title: 'Public Notation' }
    }
  ]
})

// Onboarding Gate Navigation Guard
router.beforeEach(async (to, from) => {
  if (to.meta.requiresWorkspace) {
    const storage = useWorkspaceStorage(); // safe after pinia is active
    
    // Wait for IDB to finish loading its handle
    await storage.initPromise;
    
    if (!storage.folderName.value && !storage.isStorageBypassed.value) {
      return { name: 'setup', query: { redirect: to.fullPath } };
    }
  }

  // Work from before projects existed becomes projects the first time the project pages are entered.
  if (typeof to.name === 'string' && to.name.startsWith('project')) {
    await adoptLegacyProjects();
  }

  // The editor starts without data: pages that only make sense on a loaded
  // corpus send a first-time visitor to the page where it is loaded.
  if (to.meta.requiresCorpus) {
    const { hasCorpus } = await corpusReady();
    if (!hasCorpus.value) return { name: 'corpus' };
  }
})

router.afterEach((to) => {
  // A documentation names its own pages (see DocsShellView).
  if (to.path.startsWith('/docs/')) return;
  let title = to.meta.title || '';

  if (typeof to.name === 'string' && to.name.startsWith('project') && to.params.id) {
    const project = useProjectsStore().get(to.params.id);
    if (project) title = title ? `${project.name} — ${title}` : project.name;
  } else if (to.params.id) {
    try {
      const tablesStore = usePersonalTablesStore();
      const table = tablesStore.tables.find(t => t.id === to.params.id);
      if (table && table.name) {
        title = `${table.name} — ${title}`;
      } else if (table && table.source) {
        title = `${table.source} — ${title}`;
      } else {
        title = `${to.params.id} — ${title}`;
      }
    } catch (e) {
      title = `${to.params.id} — ${title}`;
    }
  } else if (to.params.source) {
    title = `${to.params.source} — ${title}`;
  }

  if (title) {
    document.title = `${title} — neume-docs`;
  } else {
    document.title = 'neume-docs';
  }
})

export default router
