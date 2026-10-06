import { watch } from 'vue';
import { useProjectsStore } from '../stores/projects';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { useSettingsStore } from '../stores/settings';
import { publicationPlan } from '../utils/projectPublishing';

let started = false;

/**
 * Keeps what the public views read in step with the published projects (see
 * utils/projectPublishing). Started once, by the app shell; it only reacts to the
 * projects, so what it writes does not set it off again.
 */
export function useProjectPublishing() {
    if (started) return;
    started = true;

    const projects = useProjectsStore();
    const tables = usePersonalTablesStore();
    const direct = useDirectSnippetsStore();
    const settings = useSettingsStore();

    function apply() {
        const plan = publicationPlan({
            projects: projects.projects,
            tables: tables.tables,
            collections: direct.collections,
            globalId: (code) => (settings.autoFillIds ? settings.getGlobalId(code) : '')
        });

        for (const change of plan.tables) {
            const id = tables.getOrCreateTableForSource(change.source);
            const patch = { isPublished: change.isPublished, fromProjects: true };
            if (change.rows) {
                patch.rows = change.rows;
                patch.patterns = change.rows.map(r => r.pattern);
            }
            tables.updateTable(id, patch);
        }
        for (const change of plan.collections) direct.updateCollection(change.id, { isPublished: change.isPublished });
    }

    watch(() => projects.projects, apply, { deep: true, immediate: true });
    // The custom collections load a moment after the start: look again once they are there.
    watch(() => direct.loaded, (loaded) => { if (loaded) apply(); });
}
