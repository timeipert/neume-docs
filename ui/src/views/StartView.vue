<script setup>
import { RouterLink } from 'vue-router';

/**
 * The start of the app: two ways in. Reading what others have documented needs nothing —
 * no folder, no corpus — and changes nothing. Documenting one's own work happens in the editor,
 * in this browser, and ends in files that can be put on a server for others to read.
 */
</script>

<template>
<div class="start">
    <header class="top">
        <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><ellipse cx="8" cy="8" rx="4.2" ry="3.2" transform="rotate(-18 8 8)" fill="currentColor"/><ellipse cx="16" cy="16" rx="4.2" ry="3.2" transform="rotate(-18 16 16)" fill="currentColor"/></svg></span>
        <h1>neume-docs</h1>
        <p class="tag">Documenting the neume shapes of manuscripts against the <em>Corpus Monodicum</em>.</p>
    </header>

    <main class="choices">
        <RouterLink to="/docs" class="choice">
            <span class="eyebrow">For readers</span>
            <h2>View documentations</h2>
            <p>Read neume tables that others have published: browse their manuscripts, filter them by origin or date, compare the shapes side by side. Every manuscript, pattern and snippet has a link of its own and a suggestion for citing it.</p>
            <span class="go">Open the documentations →</span>
        </RouterLink>

        <RouterLink to="/projects" class="choice choice--editor">
            <span class="eyebrow">For researchers</span>
            <h2>Editor</h2>
            <p>Make your own documentation. Load a corpus, mark the neumes on the scans, fill in neume tables — all of it stays in your browser. When it is ready, download it as files and put it in a repository, for others to read here.</p>
            <span class="go">Open the editor →</span>
        </RouterLink>
    </main>

    <footer class="foot">
        <a href="manual/index.html" target="_blank" rel="noopener">Manual</a>
        <span aria-hidden="true">·</span>
        <a href="https://monodi.app" target="_blank" rel="noopener">Part of the Corpus Monodicum infrastructure</a>
    </footer>
</div>
</template>

<style scoped>
.start { min-height: 100%; display: flex; flex-direction: column; align-items: center; padding: var(--space-6) var(--space-4); background: linear-gradient(180deg, var(--color-surface) 0%, var(--color-bg) 60%); }
.top { text-align: center; margin: var(--space-5) 0 var(--space-6); display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.mark { display: inline-flex; width: 46px; height: 46px; align-items: center; justify-content: center; border-radius: 14px; color: #fff; background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); box-shadow: 0 4px 14px rgba(59,130,246,0.35); }
h1 { margin: 0; font-size: 2.2rem; letter-spacing: -0.02em; }
.tag { margin: 0; color: var(--color-text-muted); max-width: 40ch; }
.choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); gap: var(--space-5); width: 100%; max-width: 54rem; }
.choice { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); color: inherit; text-decoration: none; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
.choice:hover, .choice:focus-visible { border-color: var(--color-primary); box-shadow: 0 8px 24px rgba(30,41,59,0.1); transform: translateY(-2px); outline: none; }
.eyebrow { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-primary-hover); }
.choice h2 { margin: 0; font-size: 1.5rem; }
.choice p { margin: 0; flex: 1; color: var(--color-text-muted); }
.go { margin-top: var(--space-2); font-weight: 700; color: var(--color-primary-hover); }
.foot { margin-top: auto; padding-top: var(--space-6); display: flex; gap: var(--space-2); font-size: 0.82rem; color: var(--color-text-light); }
.foot a { color: var(--color-text-muted); }
</style>
