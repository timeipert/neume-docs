import { createRouter, createWebHashHistory } from 'vue-router'
import GlobalAnalysisView from '../views/GlobalAnalysisView.vue'
import ManuscriptAnnotationsView from '../views/ManuscriptAnnotationsView.vue'
import SettingsView from '../views/SettingsView.vue'
import WorkspaceView from '../views/WorkspaceView.vue'
import PatternLibraryView from '../views/PatternLibraryView.vue'
import PolygonManagerView from '../views/PolygonManagerView.vue'
import RegionEditorView from '../views/RegionEditorView.vue'
import OmmrExplorerView from '../views/OmmrExplorerView.vue'
import CustomManuscriptsView from '../views/CustomManuscriptsView.vue'
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

// Import storage for guard
import { useWorkspaceStorage } from '../composables/useWorkspaceStorage';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useProjectsStore } from '../stores/projects';
import { corpusReady } from '../composables/useTranscriptionData';
import { adoptLegacyProjects } from '../composables/useProjectAdoption';
import { getBaseCode } from '../utils/patternCode';

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
    {
      path: '/',
      redirect: '/projects'
    },
    {
      path: '/overview',
      name: 'overview',
      component: GlobalAnalysisView,
      meta: { title: 'Corpus overview', requiresWorkspace: true, requiresCorpus: true }
    },
    {
      path: '/corpus',
      name: 'corpus',
      component: CorpusView,
      meta: { title: 'Corpus', requiresWorkspace: true }
    },
    {
      path: '/metadata',
      name: 'metadata',
      component: ManuscriptMetadataView,
      meta: { title: 'Manuscript metadata', requiresWorkspace: true }
    },
    {
      path: '/metadata/iiif',
      name: 'iiif_sources',
      component: IiifSourcesView,
      meta: { title: 'IIIF sources', requiresWorkspace: true }
    },
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
      meta: { title: 'Pattern-Bibliothek', requiresWorkspace: true }
    },
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
    {
      path: '/custom-manuscripts',
      name: 'custom_manuscripts',
      component: CustomManuscriptsView,
      meta: { title: 'Custom Manuscripts', requiresWorkspace: true }
    },
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
      meta: { title: 'Manuscripts', requiresWorkspace: true }
    },
    {
      path: '/polygons/edit-region',
      name: 'region_editor',
      component: RegionEditorView,
      meta: { title: 'Edit Line Region', requiresWorkspace: true }
    },
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
