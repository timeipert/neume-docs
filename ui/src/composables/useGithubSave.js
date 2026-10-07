import { buildLocalDocumentation, documentationFiles } from './useLocalDocumentation';
import { useDataManagement } from './useDataManagement';
import { useGithubSessionStore } from '../stores/githubSession';
import { useSettingsStore } from '../stores/settings';
import { commitFiles } from '../utils/githubApi';

/**
 * Saving to the repository a person chose: the published documentation (the files the viewer reads), or
 * the whole workspace as one backup file. `prepare…` only builds the files, so the person can be told what
 * will be written before it is; `save` writes them in one commit.
 */

/** @returns {Promise<{ kind: 'documentation', files: Array<{path: string, text?: string, base64?: string}>, summary: string }>} */
export async function prepareDocumentation() {
    const built = await buildLocalDocumentation({ images: 'files' });
    if (!built.index.manuscripts.length) {
        throw new Error('Nothing is published yet. Publish a project (its settings have the switch) and mark snippets on its pages, then try again.');
    }
    const files = documentationFiles(built).map(f => ({ path: f.path, text: f.text }));
    for (const img of built.files) {
        const comma = img.dataUrl.indexOf(',');
        if (comma > 0) files.push({ path: img.path, base64: img.dataUrl.slice(comma + 1) });
    }
    const n = built.index.manuscripts.length;
    return {
        kind: 'documentation',
        files,
        summary: `${n} manuscript${n === 1 ? '' : 's'}, ${built.files.length} picture${built.files.length === 1 ? '' : 's'} (${files.length} files)`
    };
}

/** The whole workspace as one backup file: private work, so only for a private repository. */
export function prepareWorkspace() {
    const settings = useSettingsStore();
    const payload = useDataManagement().backupPayload();
    const label = (settings.backupLabel || 'workspace').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'workspace';
    return {
        kind: 'workspace',
        files: [{ path: `neume-docs-${label}.json`, text: JSON.stringify(payload, null, 2) }],
        summary: 'the whole workspace as one backup file'
    };
}

/**
 * @param {{ files: Array<object>, kind: string }} prepared
 * @returns {Promise<{ unchanged: boolean, url: string, repo: string }>}
 */
export async function saveToGithub(prepared, { fetchFn } = {}) {
    const session = useGithubSessionStore();
    if (!session.repo || !session.branch) throw new Error('Choose a repository and a branch first.');
    const token = await session.token({ fetchFn });
    const message = prepared.kind === 'workspace' ? 'Save workspace backup from neume-docs' : 'Update documentation from neume-docs';
    const done = await commitFiles(
        { repo: session.repo, branch: session.branch, folder: session.folder, message, files: prepared.files },
        { token, fetchFn }
    );
    return { ...done, repo: session.repo };
}
