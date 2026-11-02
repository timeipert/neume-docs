<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { LOCAL_ID, combineId } from '../../utils/documentation';
import { openDocumentation, peekDocumentation, previewUnpublished, setPreviewUnpublished, useDocumentations } from '../../composables/useDocumentations';
import { findColumn, groupByRegion } from '../../utils/regions';
import { useProjectsStore } from '../../stores/projects';
import { usePersonalTablesStore } from '../../stores/personalTables';

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
// The site can name one documentation as its front page: it is then shown as a title page and a collection.
const homeEndpoint = computed(() => endpoints.value.find(e => e.home) || null);
const homeState = computed(() => (homeEndpoint.value ? peekDocumentation(homeEndpoint.value.id) || { status: 'loading', error: '', index: null } : null));
const homeIndex = computed(() => (homeState.value && homeState.value.status === 'ready' ? homeState.value.index : null));
const regions = computed(() => (homeIndex.value ? groupByRegion(homeIndex.value.manuscripts, homeIndex.value.columns) : []));
/** What the collection holds, in one line: manuscripts, regions, and the centuries their datings name. */
const facts = computed(() => {
    if (!homeIndex.value) return [];
    const ms = homeIndex.value.manuscripts;
    const out = [`${ms.length} manuscript${ms.length === 1 ? '' : 's'}`];
    const known = regions.value.filter(g => g.label !== 'Region not stated').length;
    if (known > 1) out.push(`${known} regions of origin`);
    const dateKey = findColumn(homeIndex.value.columns, /datier|\bdate\b/i);
    const centuries = ms.flatMap(m => [...String(m.meta[dateKey] || '').matchAll(/(\d{1,2})\.\s*(?:Jh|Jahrhundert)/g)].map(x => Number(x[1])));
    if (dateKey && centuries.length) {
        const lo = Math.min(...centuries), hi = Math.max(...centuries);
        const th = (n) => `${n}${n === 11 || n === 12 || n === 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
        out.push(lo === hi ? `${th(lo)} century` : `${th(lo)}–${th(hi)} century`);
    }
    return out;
});
// A front page names the tab after its documentation, not after the list of documentations.
watch(homeIndex, (index) => {
    document.title = index ? (index.info.description ? `${index.info.title} — ${index.info.description}` : index.info.title) : 'Documentations — Neumedocs';
}, { immediate: true });
const collection = ref(null);
const toCollection = () => collection.value && collection.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
// A long text is shown to the same height as the others, with the rest a click away, so the buttons stay in view.
const LONG = 1000;
const opened = ref(new Set());
const isLong = (sec) => sec.text.length > LONG;
function toggleText(i) { const next = new Set(opened.value); if (next.has(i)) next.delete(i); else next.add(i); opened.value = next; }
const LINK_LABELS = { collection: 'Enter the Collection', editor: 'Open the Neumedocs Editor' };
/** The texts of the title page; when none says where its button leads, the first two get the two ways in. */
const texts = computed(() => {
    const list = homeIndex.value ? homeIndex.value.info.sections : [];
    if (list.some(sec => sec.link)) return list;
    return list.map((sec, i) => ({ ...sec, link: ['collection', 'editor'][i] || '' }));
});
const cards = computed(() => endpoints.value.filter(e => !e.home).map(endpoint => ({
    endpoint,
    state: peekDocumentation(endpoint.id) || { status: 'loading', error: '', index: null }
})));
const local = openDocumentation(LOCAL_ID);
// someone who has made something in the editor has their own documentation here, published or not
const projects = useProjectsStore();
const tables = usePersonalTablesStore();
const usesEditor = computed(() => projects.projects.length > 0 || tables.tables.length > 0 || (local.status === 'ready' && local.index.manuscripts.length > 0));
const showLocal = computed(() => usesEditor.value && local.status !== 'error');

// documentations to look at together
const chosen = ref([]);
const toggle = (id) => { chosen.value = chosen.value.includes(id) ? chosen.value.filter(x => x !== id) : [...chosen.value, id]; };
function together() {
    router.push({ name: 'docs_catalogue', params: { endpoint: combineId(chosen.value) } });
}
const localCount = computed(() => (local.status === 'ready' ? local.index.manuscripts.length : 0));

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
// Below a front page, the list of documentations is only for those who have more than the front page to choose from.
const choosable = computed(() => cards.value.length + (showLocal.value ? 1 : 0));
</script>

<template>
<div class="home docs-classic">
    <header v-if="!homeEndpoint" class="bar">
        <RouterLink to="/docs" class="brand" aria-label="Front page">
            <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><ellipse cx="8" cy="8" rx="4.2" ry="3.2" transform="rotate(-18 8 8)" fill="currentColor"/><ellipse cx="16" cy="16" rx="4.2" ry="3.2" transform="rotate(-18 16 16)" fill="currentColor"/></svg></span>
            Neumedocs
        </RouterLink>
        <span class="grow"></span>
        <RouterLink to="/projects" class="ne-btn ne-btn--sm ne-btn--ghost">Editor →</RouterLink>
    </header>

    <section v-if="homeEndpoint" class="landing" aria-labelledby="landing-title">
        <header class="title-page">
            <blockquote v-if="homeIndex && homeIndex.info.motto" class="epigraph">{{ homeIndex.info.motto }}</blockquote>
            <h1 id="landing-title" class="title">{{ homeIndex ? homeIndex.info.title : homeEndpoint.name }}</h1>
            <p v-if="homeIndex && homeIndex.info.description" class="subtitle">{{ homeIndex.info.description }}</p>
            <p v-else-if="homeState && homeState.status === 'loading'" class="subtitle" role="status">Opening…</p>
            <p v-if="homeState && homeState.status === 'error'" class="ne-note ne-note--error">{{ homeState.error }}</p>
            <p v-if="facts.length" class="facts">{{ facts.join(' · ') }}</p>
        </header>

        <div v-if="texts.length" class="columns">
            <article v-for="(sec, i) in texts" :key="i" class="column">
                <h2 v-if="sec.title">{{ sec.title }}</h2>
                <div :id="`column-text-${i}`" class="column-text" :class="{ clamped: isLong(sec) && !opened.has(i) }">
                    <p v-for="(para, j) in sec.text.split(/\n{2,}/)" :key="j">{{ para }}</p>
                </div>
                <button v-if="isLong(sec)" type="button" class="quiet" :aria-expanded="opened.has(i)" :aria-controls="`column-text-${i}`" @click="toggleText(i)">{{ opened.has(i) ? 'Show less' : 'Continue reading' }}</button>
                <p class="way">
                    <button v-if="sec.link === 'collection'" type="button" class="way-link" @click="toCollection">{{ LINK_LABELS.collection }}</button>
                    <RouterLink v-else-if="sec.link === 'editor'" to="/projects" class="way-link">{{ LINK_LABELS.editor }}</RouterLink>
                </p>
            </article>
        </div>
        <p v-else-if="homeIndex" class="ways">
            <button type="button" class="way-link" @click="toCollection">{{ LINK_LABELS.collection }}</button>
            <RouterLink to="/projects" class="way-link">{{ LINK_LABELS.editor }}</RouterLink>
        </p>

        <div v-if="homeIndex" ref="collection" class="collection">
            <h2 class="collection-title">The Collection</h2>
            <p class="collection-lead">
                Each manuscript opens with its neume table, its annotated lines and its neume tree.
                <RouterLink :to="{ name: 'docs_table', params: { endpoint: homeEndpoint.id } }">Compare manuscripts in the synopsis</RouterLink>,
                or <RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: homeEndpoint.id } }">see all of them as a table</RouterLink>.
            </p>
            <section v-for="g in regions" :key="g.label" class="region">
                <h3>{{ g.label }}</h3>
                <ul class="register">
                    <li v-for="e in g.entries" :key="e.id">
                        <RouterLink :to="{ name: 'docs_manuscript', params: { endpoint: homeEndpoint.id, source: e.id } }">
                            <span class="siglum">{{ e.source }}</span>
                            <span class="date">{{ e.date || 'date not stated' }}</span>
                        </RouterLink>
                    </li>
                </ul>
            </section>
        </div>
    </section>

    <nav v-if="homeEndpoint && homeIndex && choosable" class="landing elsewhere" aria-labelledby="elsewhere-title">
        <h2 id="elsewhere-title">Elsewhere</h2>
        <ul>
            <li v-if="showLocal">
                <RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: LOCAL_ID } }">Your own work in this browser</RouterLink>
                <span class="note">{{ localCount }} manuscript{{ localCount === 1 ? '' : 's' }} {{ previewUnpublished ? 'in your work' : 'published in the editor' }}; only you see it.
                    <RouterLink to="/workspace/share?section=publish">Publish it</RouterLink></span>
            </li>
            <li v-for="{ endpoint, state } in cards" :key="endpoint.id">
                <RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: endpoint.id } }">{{ state.status === 'ready' ? state.index.info.title : endpoint.name }}</RouterLink>
                <span class="note">{{ endpoint.kind === 'github' ? `${endpoint.owner}/${endpoint.repo}` : 'web address' }}<template v-if="state.status === 'ready'"> · {{ state.index.manuscripts.length }} manuscripts</template></span>
            </li>
        </ul>
    </nav>

    <main v-if="!homeEndpoint" class="wrap">
        <template v-if="!homeEndpoint">
        <h1>Documentations</h1>
        <p class="lead">Neume tables that others have published. You read them here; nothing you do changes them. Every manuscript, pattern and snippet has an address of its own, and a suggestion for citing it.</p>
        </template>
        <p v-if="hosted.status === 'loading'" class="status" role="status">Reading the list…</p>
        <p v-if="hosted.error" class="ne-note ne-note--warn">{{ hosted.error }}</p>

        <div v-if="choosable + (homeEndpoint ? 1 : 0) > 1" class="together" :class="{ on: chosen.length }" role="status">
            <span v-if="!chosen.length">Tick two or more to look at them <strong>together</strong>: your own work beside a repository's, say, in one table and one neume table.</span>
            <template v-if="chosen.length">
                <span>{{ chosen.length }} chosen</span>
                <button type="button" class="ne-btn ne-btn--primary ne-btn--sm" :disabled="chosen.length < 2" @click="together">Look at them together →</button>
                <button type="button" class="link" @click="chosen = []">Clear</button>
                <span v-if="chosen.length < 2" class="hint">Choose one more.</span>
            </template>
        </div>

        <h2 v-if="cards.length" class="group">From repositories</h2>
        <ul v-if="cards.length" class="cards">
            <li v-for="{ endpoint, state } in cards" :key="endpoint.id" class="card" :class="{ picked: chosen.includes(endpoint.id) }">
                <label class="pick" :title="`Look at ${endpoint.name} together with others`"><input type="checkbox" :checked="chosen.includes(endpoint.id)" :aria-label="`Choose ${endpoint.name} to look at together with others`" @change="toggle(endpoint.id)" /></label>
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
        </ul>

        <template v-if="showLocal">
            <h2 class="group">Your own work <span class="tag">this browser</span></h2>
            <ul class="cards">
                <li class="card card--local" :class="{ picked: chosen.includes(LOCAL_ID) }">
                    <label class="pick" title="Look at your own work together with others"><input type="checkbox" :checked="chosen.includes(LOCAL_ID)" aria-label="Choose your own work to look at together with others" @change="toggle(LOCAL_ID)" /></label>
                    <RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: LOCAL_ID } }" class="card-link">
                        <h2>{{ local.status === 'ready' && local.index.info.title !== 'Untitled documentation' ? local.index.info.title : 'My documentation' }}</h2>
                        <p class="meta">
                            <template v-if="local.status === 'loading'">Looking at your work…</template>
                            <template v-else>{{ localCount }} manuscript{{ localCount === 1 ? '' : 's' }} {{ previewUnpublished ? 'in your work' : 'published in the editor' }}</template>
                        </p>
                        <p class="desc">
                            <template v-if="local.status === 'ready' && !localCount && !previewUnpublished">Nothing is published yet. Tick “also show what is not published” below to look at all your work, or publish a project in the editor.</template>
                            <template v-else>Your own work as readers would see it. Only you see this; it reaches others when you put its files in a repository.</template>
                        </p>
                    </RouterLink>
                    <footer>
                        <label class="ne-check small"><input type="checkbox" :checked="previewUnpublished" @change="setPreviewUnpublished($event.target.checked)" /> Also show what is not published</label>
                        <RouterLink to="/workspace/share?section=publish" class="link">Publish…</RouterLink>
                    </footer>
                </li>
            </ul>
        </template>

        <p v-if="!cards.length && !homeEndpoint && hosted.status === 'ready'" class="ne-note ne-note--info">
            This site offers no documentations of its own yet. Open one from a GitHub repository below.
        </p>

        <section v-if="!homeEndpoint" class="open" aria-labelledby="open-title">
            <h2 id="open-title">Open a repository</h2>
            <p class="hint">Any public GitHub repository that holds a documentation (a <code>neume-docs.json</code> at its top) can be read here.</p>
            <form class="open-form" @submit.prevent="open">
                <input v-model="address" class="ne-input" placeholder="owner/name, or https://github.com/owner/name" aria-label="GitHub repository" />
                <button type="submit" class="ne-btn ne-btn--primary" :disabled="!address.trim()">Open</button>
            </form>
            <p v-if="wrong" class="ne-note ne-note--error">{{ wrong }}</p>
        </section>
    </main>

    <footer v-if="homeEndpoint" class="site-foot">
        <details>
            <summary>Open a documentation from another GitHub repository</summary>
            <form class="open-form" @submit.prevent="open">
                <input v-model="address" class="ne-input" placeholder="owner/name, or https://github.com/owner/name" aria-label="GitHub repository" />
                <button type="submit" class="ne-btn ne-btn--primary" :disabled="!address.trim()">Open</button>
            </form>
            <p v-if="wrong" class="ne-note ne-note--error">{{ wrong }}</p>
        </details>
    </footer>
</div>
</template>

<style scoped>
.home { min-height: 100%; background: var(--color-bg); }
.bar { display: flex; align-items: center; gap: var(--space-4); padding: 0 var(--space-4); min-height: 48px; background: var(--color-nav-bg); }
.brand { display: inline-flex; align-items: center; gap: var(--space-2); color: #fff !important; font-weight: 700; text-decoration: none; }
.mark { display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; border-radius: 7px; background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); color: #fff; }
.grow { flex: 1; }
.bar .ne-btn--ghost { color: var(--color-text-light); }

/* The front page is set like the title page of a printed edition: a book face, hairline rules,
   ink on paper, and one colour — the red of a rubric — for what can be followed. */
.landing {
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    --ink: #1f1d1a; --ink-muted: #5f5a52; --ink-light: #8a847a; --rule: #d9d3c7; --rubric: #9a2a1f;
    max-width: 64rem; margin: 0 auto; padding: 0 var(--space-5); font-family: var(--serif); color: var(--ink);
}
.home:has(.landing) { background: #fbfaf7; }

.title-page { padding: clamp(3rem, 9vh, 6rem) 0 var(--space-6); text-align: center; border-bottom: 1px solid var(--rule); }
.epigraph { margin: 0 auto var(--space-6); max-width: 34rem; font-style: italic; font-size: 0.9rem; line-height: 1.55; color: var(--ink-muted); }
.title { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(2.6rem, 6vw, 3.6rem); letter-spacing: 0.01em; line-height: 1.05; }
.subtitle { margin: var(--space-3) 0 0; font-style: italic; font-size: clamp(1.05rem, 2vw, 1.25rem); color: var(--ink-muted); }
.facts { margin: var(--space-4) 0 0; font-variant: small-caps; letter-spacing: 0.06em; font-size: 0.95rem; color: var(--ink-light); }

.columns { display: grid; grid-template-columns: 1fr 1fr; padding: var(--space-6) 0; border-bottom: 1px solid var(--rule); }
.column { padding: 0 var(--space-6); display: flex; flex-direction: column; }
.column:first-child { padding-left: 0; }
.column:last-child { padding-right: 0; }
.column + .column { border-left: 1px solid var(--rule); }
.column h2 { margin: 0 0 var(--space-3); font-family: var(--serif); font-weight: 400; font-variant: small-caps; letter-spacing: 0.08em; font-size: 1.35rem; }
.column-text p { margin: 0 0 var(--space-3); font-size: 1.02rem; line-height: 1.68; }
.column-text p:last-child { margin-bottom: 0; }
.column-text.clamped { max-height: 23.5em; overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent); mask-image: linear-gradient(to bottom, #000 70%, transparent); }
.quiet { align-self: flex-start; margin-top: var(--space-2); border: none; background: none; padding: 0; font: inherit; font-size: 0.95rem; font-style: italic; color: var(--ink-muted); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--rule); }
.quiet:hover { color: var(--ink); text-decoration-color: currentColor; }
.way { margin: auto 0 0; padding-top: var(--space-4); }
.ways { display: flex; justify-content: center; gap: var(--space-6); margin: 0; padding: var(--space-6) 0; border-bottom: 1px solid var(--rule); }
.way-link { border: none; background: none; padding: 0; font: inherit; font-size: 1.05rem; color: var(--rubric); text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px; cursor: pointer; }
.way-link::after { content: ' →'; }
.way-link:hover { text-decoration-thickness: 2px; }

.collection { padding: var(--space-6) 0 var(--space-7, 3rem); scroll-margin-top: var(--space-4); }
.collection-title { margin: 0; text-align: center; font-family: var(--serif); font-weight: 400; font-size: 1.9rem; }
.collection-lead { margin: var(--space-2) auto var(--space-5); max-width: 40rem; text-align: center; font-size: 1rem; line-height: 1.6; color: var(--ink-muted); }
.collection-lead a { color: var(--rubric); text-underline-offset: 3px; }
.region { margin-top: var(--space-5); }
.region h3 { margin: 0 0 var(--space-2); padding-bottom: var(--space-1); border-bottom: 1px solid var(--rule); font-family: var(--serif); font-weight: 400; font-variant: small-caps; letter-spacing: 0.06em; font-size: 1.12rem; color: var(--ink-muted); }
.register { list-style: none; margin: 0; padding: 0; columns: 3 15rem; column-gap: var(--space-6); }
.register li { break-inside: avoid; }
.register a { display: flex; align-items: baseline; gap: var(--space-2); padding: 0.35em 0; color: var(--ink); text-decoration: none; border-bottom: 1px dotted transparent; }
.register a:hover .siglum, .register a:focus-visible .siglum { color: var(--rubric); text-decoration: underline; text-underline-offset: 3px; }
.siglum { flex: none; min-width: 5.5rem; font-weight: 600; }
.date { font-style: italic; font-size: 0.93rem; color: var(--ink-muted); }

@media (max-width: 760px) {
    .landing { padding: 0 var(--space-4); }
    .columns { grid-template-columns: 1fr; padding: var(--space-4) 0; }
    .column { padding: var(--space-4) 0; }
    .column + .column { border-left: none; border-top: 1px solid var(--rule); }
}
.elsewhere { padding-bottom: var(--space-5); }
.elsewhere h2 { margin: 0 0 var(--space-2); padding-top: var(--space-5); border-top: 1px solid var(--rule); font-family: var(--serif); font-weight: 400; font-variant: small-caps; letter-spacing: 0.06em; font-size: 1.12rem; color: var(--ink-muted); }
.elsewhere ul { list-style: none; margin: 0; padding: 0; }
.elsewhere li { padding: 0.3em 0; }
.elsewhere a { color: var(--rubric); text-underline-offset: 3px; }
.elsewhere .note { margin-left: var(--space-2); font-style: italic; font-size: 0.93rem; color: var(--ink-muted); }
.site-foot { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; max-width: 64rem; margin: 0 auto; padding: var(--space-4) var(--space-5) var(--space-6); border-top: 1px solid #d9d3c7; font-size: 0.9rem; font-style: italic; color: #5f5a52; }
.site-foot summary { cursor: pointer; }
.site-foot .open-form { margin-top: var(--space-3); }
.more { margin: var(--space-4) 0 0; font-size: 1.2rem; }
.wrap { max-width: 62rem; margin: 0 auto; padding: var(--space-6) var(--space-4); }
h1 { margin: 0; font-size: 1.9rem; letter-spacing: -0.01em; }
.lead { max-width: 62ch; color: var(--color-text-muted); }
.status { color: var(--color-text-muted); }

.group { margin: var(--space-5) 0 0; font-size: 1.05rem; display: flex; align-items: center; gap: var(--space-2); }
.together { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-4); padding: var(--space-2) var(--space-3); border: 1px dashed var(--color-border-hover); border-radius: var(--radius-md); font-size: 0.86rem; color: var(--color-text-muted); }
.together.on { border-style: solid; border-color: var(--color-primary-muted); background: var(--color-primary-light); color: var(--color-text); }
.pick { position: absolute; top: 10px; right: 10px; z-index: 1; padding: 4px; cursor: pointer; }
.card { position: relative; }
.card.picked { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); }
.small { font-size: 0.78rem; }
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
