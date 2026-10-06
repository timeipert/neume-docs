import { useProjectsStore } from '../stores/projects';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { corpusReady } from './useTranscriptionData';
import { useToast } from './useToast';

/**
 * Make projects of work that was done before projects existed — a neume table per
 * manuscript, a custom collection of screenshots. Called when the project pages
 * are entered; what was adopted once is not adopted again, so it is cheap.
 *
 * @returns {Promise<number>} how many projects were made
 */
export async function adoptLegacyProjects() {
    const projects = useProjectsStore();
    const tables = usePersonalTablesStore();
    const direct = useDirectSnippetsStore();

    // Wait for both, so that a table is not taken for a manuscript outside the
    // corpus only because the corpus has not been read yet.
    const [{ sourceNames }] = await Promise.all([corpusReady(), direct.load()]);

    const made = projects.adoptLegacy({
        tables: tables.tables,
        collections: direct.collections,
        corpusSources: new Set(sourceNames.value)
    });
    if (made) {
        useToast().show(
            `${made} project${made === 1 ? '' : 's'} made from your existing neume tables and custom manuscripts. Their snippets are unchanged.`,
            { tone: 'success', timeout: 9000 }
        );
    }
    return made;
}
