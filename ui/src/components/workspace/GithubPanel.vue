<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Panel from '../ui/Panel.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import { useToast } from '../../composables/useToast';
import { githubConfig, useGithubSessionStore } from '../../stores/githubSession';
import { listBranches, listRepositories, cleanFolder } from '../../utils/githubApi';
import { prepareDocumentation, prepareWorkspace, saveToGithub } from '../../composables/useGithubSave';

/**
 * Sign in to GitHub and save to a repository as the person who signed in. Only repositories the app is
 * installed on, and that this person may write to, are offered. The token stays in this browser.
 */
const toast = useToast();
const session = useGithubSessionStore();

const repos = ref([]);
const branches = ref([]);
const loading = ref('');     // what is being fetched, for the label
const problem = ref('');
const prepared = ref(null);  // what the confirmation is about
const saving = ref(false);
const saveError = ref('');
const lastSave = ref(null);

const chosen = computed(() => repos.value.find(r => r.fullName === session.repo) || null);
const folderClean = computed(() => cleanFolder(session.folder));
const viewerId = computed(() => (session.repo
    ? `gh:${session.repo}${session.branch && session.branch !== 'main' ? `@${session.branch}` : ''}${folderClean.value ? `:${folderClean.value}` : ''}`
    : ''));

/** An expired or revoked sign-in is a reason to sign in again, not a mystery. */
function explain(e) {
    if (e?.status === 401) {
        session.signOut();
        return 'GitHub no longer accepts this sign-in. Please sign in again.';
    }
    return e?.message || 'GitHub could not be reached.';
}

async function loadRepos() {
    problem.value = '';
    loading.value = 'repositories';
    try {
        repos.value = await listRepositories({ token: await session.token() });
        if (!repos.value.some(r => r.fullName === session.repo)) {
            const first = repos.value[0];
            session.setTarget({ repo: first?.fullName || '', branch: first?.defaultBranch || '' });
        }
    } catch (e) {
        problem.value = explain(e);
    } finally {
        loading.value = '';
    }
}

async function loadBranches() {
    branches.value = [];
    if (!session.repo) return;
    loading.value = 'branches';
    try {
        branches.value = await listBranches(session.repo, { token: await session.token() });
        if (!branches.value.includes(session.branch)) session.setTarget({ branch: chosen.value?.defaultBranch || branches.value[0] || '' });
    } catch (e) {
        problem.value = explain(e);
    } finally {
        loading.value = '';
    }
}

watch(() => session.signedIn, (yes) => { if (yes) loadRepos(); else { repos.value = []; branches.value = []; } }, { immediate: true });
watch(() => session.repo, loadBranches, { immediate: true });

function pickRepo(fullName) {
    const r = repos.value.find(x => x.fullName === fullName);
    session.setTarget({ repo: fullName, branch: r?.defaultBranch || '' });
}

async function prepare(kind) {
    problem.value = '';
    saveError.value = '';
    loading.value = 'files';
    try {
        prepared.value = kind === 'workspace' ? prepareWorkspace() : await prepareDocumentation();
    } catch (e) {
        problem.value = e?.message || 'The files could not be made.';
    } finally {
        loading.value = '';
    }
}

async function confirmSave() {
    saving.value = true;
    saveError.value = '';
    try {
        const done = await saveToGithub(prepared.value);
        lastSave.value = { ...done, kind: prepared.value.kind };
        toast.show(done.unchanged ? 'Nothing had changed; GitHub already has this.' : `Saved to ${done.repo}.`, { tone: 'success' });
        prepared.value = null;
    } catch (e) {
        saveError.value = explain(e);
    } finally {
        saving.value = false;
    }
}

function signOutNow() {
    session.signOut();
    lastSave.value = null;
    toast.show('Signed out. To also withdraw the app’s access, remove it in your GitHub settings.', { tone: 'success' });
}
</script>

<template>
<Panel id="github" title="Save to GitHub" description="Sign in with GitHub and save to one of your repositories: the documentation that readers open in the viewer, or the whole workspace as one backup file. Only repositories the app is installed on, and that you may write to, are offered.">
    <p v-if="!session.configured" class="ne-muted note">
        Signing in is not set up on this site. A site owner sets it up once; see <code>auth-proxy/README.md</code> in the repository.
    </p>

    <template v-else-if="!session.signedIn">
        <p class="note">Nothing leaves this browser until you sign in. The app asks GitHub only for write access to the repositories it is installed on — and for nothing else of your account.</p>
        <div class="actions">
            <button class="ne-btn ne-btn--primary" @click="session.startLogin()">Sign in with GitHub</button>
        </div>
    </template>

    <template v-else>
        <p class="who">
            Signed in as <strong>{{ session.login || 'GitHub user' }}</strong>
            <button class="ne-btn ne-btn--sm ne-btn--ghost" @click="signOutNow">Sign out</button>
        </p>

        <p v-if="problem" class="ne-note ne-note--error" role="alert">{{ problem }}</p>

        <div v-if="!repos.length && loading !== 'repositories'" class="empty">
            <p>The app is not installed on any repository you can write to yet.</p>
            <div class="actions">
                <a v-if="githubConfig.appUrl" class="ne-btn ne-btn--primary" :href="githubConfig.appUrl" target="_blank" rel="noopener">Install the app on a repository</a>
                <button class="ne-btn" @click="loadRepos">Check again</button>
            </div>
        </div>

        <template v-else>
            <div class="form">
                <label class="ne-field">
                    <span class="ne-label">Repository</span>
                    <select class="ne-input" :value="session.repo" :disabled="loading === 'repositories'" @change="pickRepo($event.target.value)">
                        <option v-for="r in repos" :key="r.fullName" :value="r.fullName">{{ r.fullName }}{{ r.private ? ' (private)' : '' }}</option>
                    </select>
                </label>
                <label class="ne-field">
                    <span class="ne-label">Branch</span>
                    <select class="ne-input" :value="session.branch" :disabled="loading === 'branches' || !branches.length" @change="session.setTarget({ branch: $event.target.value })">
                        <option v-for="b in branches" :key="b" :value="b">{{ b }}</option>
                    </select>
                </label>
                <label class="ne-field">
                    <span class="ne-label">Folder <span class="opt">(optional — empty is the top of the repository)</span></span>
                    <input class="ne-input" :value="session.folder" placeholder="e.g. docs" autocomplete="off" spellcheck="false" @input="session.setTarget({ folder: $event.target.value })" />
                </label>
            </div>

            <div class="actions">
                <button class="ne-btn ne-btn--primary" :disabled="!session.repo || !session.branch || !!loading" @click="prepare('documentation')">
                    {{ loading === 'files' ? 'Preparing…' : 'Save documentation…' }}
                </button>
                <button class="ne-btn" :disabled="!session.repo || !session.branch || !!loading || !chosen?.private" :title="chosen && !chosen.private ? 'A workspace backup holds all your work, so it is only offered for a private repository.' : ''" @click="prepare('workspace')">
                    Save workspace backup…
                </button>
            </div>
            <p v-if="chosen && !chosen.private" class="ne-muted small">This repository is public: anything saved there can be read by everybody, for good — also in its history. The workspace backup is only offered for private repositories.</p>
            <p v-else-if="chosen" class="ne-muted small">The viewer reads public repositories only; a documentation saved to a private one cannot be opened there.</p>
        </template>

        <p v-if="lastSave" class="ne-note ne-note--success result">
            {{ lastSave.unchanged ? 'Nothing had changed.' : 'Saved.' }}
            <a :href="lastSave.url" target="_blank" rel="noopener">See the commit on GitHub</a>
            <template v-if="lastSave.kind === 'documentation' && chosen && !chosen.private">
                · <RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: viewerId } }">Open it in the viewer</RouterLink> <span class="ne-muted">(GitHub may take a few minutes to show the new files)</span>
            </template>
        </p>

        <p class="ne-muted small foot">
            <a href="https://github.com/settings/installations" target="_blank" rel="noopener">Choose which repositories the app may use</a> ·
            <a href="https://github.com/settings/apps/authorizations" target="_blank" rel="noopener">Withdraw the app’s access</a>
        </p>
    </template>

    <ConfirmDialog :open="!!prepared" title="Save to GitHub?" confirm-label="Save to GitHub" tone="primary" :busy="saving" :error="saveError" @confirm="confirmSave" @cancel="prepared = null">
        <template v-if="prepared">
            <p>This writes <strong>{{ prepared.summary }}</strong> in one commit to:</p>
            <ul>
                <li>Repository <strong>{{ session.repo }}</strong> — {{ chosen?.private ? 'private' : 'public, readable by everybody' }}</li>
                <li>Branch <strong>{{ session.branch }}</strong></li>
                <li>Folder <strong>{{ folderClean || 'top of the repository' }}</strong></li>
            </ul>
            <p>Files with the same name there are replaced by these; other files are left alone. Earlier versions stay in the history.</p>
        </template>
    </ConfirmDialog>
</Panel>
</template>

<style scoped>
.note { margin: 0 0 var(--space-3); font-size: 0.92rem; }
.who { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin: 0 0 var(--space-3); }
.form { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4); }
.opt { font-weight: 400; }
.actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.small { font-size: 0.85rem; margin: var(--space-3) 0 0; }
.result { margin: var(--space-4) 0 0; }
.foot { margin-top: var(--space-4); }
.empty p { margin: 0 0 var(--space-3); }
</style>
