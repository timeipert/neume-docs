<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { LOCAL_ID } from '../../utils/documentation';
import { openDocumentation, peekDocumentation, useDocumentations } from '../../composables/useDocumentations';

/**
 * The documentations a reader can open: the ones this site offers, the ones the reader added
 * (a public GitHub repository by its address), and — for someone who also has the editor —
 * what they have published in this browser, as a preview.
 */
const router = useRouter();
const { hosted, endpoints, mine, loadHosted, addRepository, removeRepository } = useDocumentations();

onMounted(loadHosted);

// Each card reads its documentation's index, so it can say what is in it.
watch(endpoints, (list) => list.forEach(e => openDocumentation(e.id)), { immediate: true });
const cards = computed(() => endpoints.value.map(endpoint => ({
    endpoint,
    state: peekDocumentation(endpoint.id) || { status: 'loading', error: '', index: null }
})));
const local = openDocumentation(LOCAL_ID);
const showLocal = computed(() => local.status === 'ready' && local.index.manuscripts.length > 0);

const address = ref('');
const wrong = ref('');

function open() {
    wrong.value = '';
    const id = addRepository(address.value);
    if (!id) { wrong.value = 'That is not the address of a GitHub repository. Write it as owner/name, or paste its address from github.com.'; return; }
    address.value = '';
    router.push({ name: 'docs_catalogue', params: { endpoint: id } });
}

const isMine = (endpoint) => mine.value.includes(endpoint.id);
</script>

<template>
<div class="home">
    <header class="bar">
        <RouterLink to="/" class="brand" aria-label="neume-docs start">
            <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><ellipse cx="8" cy="8" rx="4.2" ry="3.2" transform="rotate(-18 8 8)" fill="currentColor"/><ellipse cx="16" cy="16" rx="4.2" ry="3.2" transform="rotate(-18 16 16)" fill="currentColor"/></svg></span>
            neume-docs
        </RouterLink>
        <span class="grow"></span>
        <RouterLink to="/projects" class="ne-btn ne-btn--sm ne-btn--ghost">Editor →</RouterLink>
    </header>

    <main class="wrap">
        <h1>Documentations</h1>
        <p class="lead">Neume tables that others have published. You read them here; nothing you do changes them. Every manuscript, pattern and snippet has an address of its own, and a suggestion for citing it.</p>

        <p v-if="hosted.status === 'loading'" class="status" role="status">Reading the list…</p>
        <p v-if="hosted.error" class="ne-note ne-note--warn">{{ hosted.error }}</p>

        <ul class="cards">
            <li v-for="{ endpoint, state } in cards" :key="endpoint.id" class="card">
                <RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: endpoint.id } }" class="card-link">
                    <h2>{{ state.status === 'ready' ? state.index.info.title : endpoint.name }}</h2>
                    <p v-if="state.status === 'ready'" class="meta">
                        {{ state.index.manuscripts.length }} manuscript{{ state.index.manuscripts.length === 1 ? '' : 's' }}<template v-if="state.index.info.authors.length"> · {{ state.index.info.authors.join(', ') }}</template><template v-if="state.index.info.year"> · {{ state.index.info.year }}</template>
                    </p>
                    <p v-else-if="state.status === 'loading'" class="meta">Opening…</p>
                    <p v-else class="meta bad">{{ state.error }}</p>
                    <p class="desc">{{ (state.status === 'ready' && state.index.info.description) || endpoint.description }}</p>
                </RouterLink>
                <footer>
                    <span class="source">{{ endpoint.kind === 'github' ? `GitHub · ${endpoint.owner}/${endpoint.repo}` : 'Web address' }}<template v-if="endpoint.kind === 'github' && endpoint.branch !== 'main'"> · {{ endpoint.branch }}</template></span>
                    <button v-if="isMine(endpoint)" type="button" class="link" @click="removeRepository(endpoint.id)">Remove from my list</button>
                </footer>
            </li>

            <li v-if="showLocal" class="card card--local">
                <RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: LOCAL_ID } }" class="card-link">
                    <h2>This browser <span class="tag">preview</span></h2>
                    <p class="meta">{{ local.index.manuscripts.length }} manuscript{{ local.index.manuscripts.length === 1 ? '' : 's' }} published in the editor</p>
                    <p class="desc">What you have published in the editor, as readers would see it. Only you see this.</p>
                </RouterLink>
            </li>
        </ul>

        <p v-if="!cards.length && hosted.status === 'ready'" class="ne-note ne-note--info">
            This site offers no documentations of its own yet. Open one from a GitHub repository below.
        </p>

        <section class="open" aria-labelledby="open-title">
            <h2 id="open-title">Open a repository</h2>
            <p class="hint">Any public GitHub repository that holds a documentation (a <code>neume-docs.json</code> at its top) can be read here.</p>
            <form class="open-form" @submit.prevent="open">
                <input v-model="address" class="ne-input" placeholder="owner/name, or https://github.com/owner/name" aria-label="GitHub repository" />
                <button type="submit" class="ne-btn ne-btn--primary" :disabled="!address.trim()">Open</button>
            </form>
            <p v-if="wrong" class="ne-note ne-note--error">{{ wrong }}</p>
        </section>
    </main>
</div>
</template>

<style scoped>
.home { min-height: 100%; background: var(--color-bg); }
.bar { display: flex; align-items: center; gap: var(--space-4); padding: 0 var(--space-4); min-height: 48px; background: var(--color-nav-bg); }
.brand { display: inline-flex; align-items: center; gap: var(--space-2); color: #fff !important; font-weight: 700; text-decoration: none; }
.mark { display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; border-radius: 7px; background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); color: #fff; }
.grow { flex: 1; }
.bar .ne-btn--ghost { color: var(--color-text-light); }

.wrap { max-width: 62rem; margin: 0 auto; padding: var(--space-6) var(--space-4); }
h1 { margin: 0; font-size: 1.9rem; letter-spacing: -0.01em; }
.lead { max-width: 62ch; color: var(--color-text-muted); }
.status { color: var(--color-text-muted); }

.cards { list-style: none; margin: var(--space-5) 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: var(--space-4); }
.card { display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); overflow: hidden; }
.card:hover { border-color: var(--color-primary-muted); box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.06)); }
.card--local { border-style: dashed; }
.card-link { flex: 1; display: block; padding: var(--space-4); color: inherit; text-decoration: none; }
.card h2 { margin: 0 0 var(--space-1); font-size: 1.1rem; }
.tag { margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: var(--color-warning-light); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; vertical-align: middle; }
.meta { margin: 0; font-size: 0.84rem; color: var(--color-text-muted); }
.meta.bad { color: var(--color-danger); }
.desc { margin: var(--space-2) 0 0; font-size: 0.9rem; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.card footer { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border-top: 1px solid var(--color-surface-muted); font-size: 0.76rem; color: var(--color-text-light); }
.link { border: none; background: none; padding: 0; color: var(--color-primary); font-size: 0.76rem; cursor: pointer; }
.link:hover { text-decoration: underline; }

.open { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border); }
.open h2 { margin: 0; font-size: 1.1rem; }
.hint { margin: var(--space-1) 0 var(--space-3); font-size: 0.86rem; color: var(--color-text-muted); }
.open-form { display: flex; gap: var(--space-2); max-width: 36rem; }
.open-form .ne-input { flex: 1; }
</style>
