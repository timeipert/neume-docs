/**
 * Reading the whole workspace out of the stores and putting it back.
 *
 * The workspace is everything the user has made: projects, annotations, neume tables,
 * metadata edits, the pattern library, IIIF links, custom manuscripts and the
 * settings. It is NOT the loaded corpus (that is reloaded from the user's own
 * files and lives in a database of its own).
 *
 * One definition of "the workspace" serves the project-folder autosave, restore
 * points and the "delete everything" actions, so they can never disagree about
 * what is part of it.
 *
 * Every function takes the stores as an argument:
 *   { settings, annotations, tables, iiif, registry, library, meta, direct, projects }
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param {object} stores
 * @param {{ copy?: boolean }} [options] `copy: false` hands out the live values,
 *   for callers that serialise straight away (the autosave).
 */
export function captureWorkspace(stores, { copy = true } = {}) {
    const take = copy ? clone : (v) => v;
    const { settings, annotations, tables, iiif, registry, library, meta, direct, projects } = stores;
    return {
        personalTables: take(tables.tables),
        starredItems: Array.from(tables.starredItems),
        annotations: take(annotations.annotations),
        regions: take(annotations.regions),
        regionItems: take(annotations.regionItems),
        manualLines: take(annotations.manualLines),
        iiifLinks: take(iiif.links),
        iiifRegistry: take(registry.serialize()),
        settings: settings.snapshot(),
        patternLibrary: take(library.serialize()),
        manuscriptMeta: take(meta.serialize()),
        // Older stores in tests and files may not have projects: leave the key out then.
        ...(projects ? { projects: take(projects.serialize()) } : {}),
        // Only once the collections have loaded from their database: a capture
        // taken during startup must not read "no collections" and blank them.
        ...(direct.loaded ? { directSnippets: take(direct.collections) } : {})
    };
}

/**
 * Put a captured workspace back.
 *
 * With `replace`, anything the data does not mention is emptied, so the result
 * is exactly that workspace (a restore). Without it, only what the data mentions
 * is touched (reading an older or partial file). Custom manuscripts are the one
 * exception: they are only replaced when the data carries them.
 */
export function applyWorkspace(stores, data, { replace = false } = {}) {
    if (!data) return;
    const { settings, annotations, tables, iiif, registry, library, meta, direct, projects } = stores;
    const has = (key) => data[key] !== undefined && data[key] !== null;

    if (has('personalTables') || replace) tables.tables = has('personalTables') ? data.personalTables : [];
    if (has('starredItems') || replace) tables.starredItems = new Set(data.starredItems || []);

    if (has('annotations') || replace) annotations.annotations = data.annotations || {};
    if (has('regions') || replace) annotations.regions = data.regions || {};
    if (has('regionItems') || replace) annotations.regionItems = data.regionItems || {};
    if (has('manualLines') || replace) annotations.manualLines = data.manualLines || {};

    if (has('iiifLinks') || replace) iiif.links = data.iiifLinks || {};

    if (has('iiifRegistry')) registry.hydrate(data.iiifRegistry);
    else if (replace) registry.clear();

    if (has('patternLibrary')) library.hydrate(data.patternLibrary);
    else if (replace) library.clear();

    if (has('manuscriptMeta')) {
        // hydrate() leaves out what the data omits, so empty first when replacing.
        if (replace) meta.clear();
        meta.hydrate(data.manuscriptMeta);
    } else if (replace) {
        meta.clear();
    }

    if (projects) {
        if (has('projects')) {
            if (replace) projects.clear();
            projects.hydrate(data.projects);
        } else if (replace) {
            projects.clear();
        }
    }

    if (has('settings')) settings.apply(data.settings, { replace });
    else if (replace) settings.reset();

    // A capture leaves the collections out when they had not loaded yet, so their
    // absence says nothing about whether there should be any: leave them alone.
    if (Array.isArray(data.directSnippets)) direct.replaceAll(data.directSnippets);
}

/** Whether a captured workspace holds nothing at all. */
export function isEmptyWorkspace(data) {
    if (!data) return true;
    const size = (o) => (o ? Object.keys(o).length : 0);
    return !(
        (data.personalTables || []).length
        || size(data.annotations) || size(data.regions) || size(data.regionItems) || size(data.manualLines)
        || size(data.iiifLinks) || (data.iiifRegistry?.entries || []).length || size(data.patternLibrary?.patterns)
        || size(data.manuscriptMeta?.overrides)
        || (data.projects?.projects || []).length
        || (data.directSnippets || []).length
    );
}
