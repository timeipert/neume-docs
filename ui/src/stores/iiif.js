import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { iiifParseRules } from '../config/iiifRules';
import { parseManifest } from '../services/iiif/manifestParser';
import { getCachedItem, setCachedItem, deleteCachedItem, clearStore } from '../utils/idb';

export const useIiifStore = defineStore('iiif', () => {
    // State
    const links = ref(JSON.parse(localStorage.getItem('iiifLinks') || '{}'));
    const parsedData = ref({}); // source -> array of { folio, imgUrl }
    const manifestStatus = ref({}); // source -> { status: 'loading' | 'ok' | 'error', error: null }
    // Sources whose pages come from the page images named in the corpus's document
    // metadata rather than from a manifest. Rebuilt on every start, never saved.
    const folioImageSources = ref({});
    
    // In-flight manifest request deduplication
    const inflightFetches = new Map();

    // Persist links
    watch(links, (newLinks) => {
        localStorage.setItem('iiifLinks', JSON.stringify(newLinks));
    }, { deep: true });

    async function loadAllManifests() {
        for (const [source, url] of Object.entries(links.value)) {
            await fetchAndParseManifest(source, url);
        }
    }

    async function addManifest(source, url) {
        const changed = links.value[source] !== url;
        links.value[source] = url;
        if (changed) {
            // Drop stale caches so the new URL fully takes effect.
            await deleteCachedItem('manifests', source);
            delete parsedData.value[source];
            await clearStore('images'); // region crops were keyed to the old service URL
        }
        await fetchAndParseManifest(source, url, true); // force fresh on manual add
    }

    /**
     * Set or clear a source's manifest address without fetching it (it loads when
     * its images are first needed), dropping whatever was cached for the old one.
     * Meant for editing many addresses at once, where fetching each would be wasteful.
     */
    async function setLink(source, url) {
        const next = String(url || '').trim();
        if ((links.value[source] || '') === next) return;
        if (next) links.value[source] = next;
        else delete links.value[source];
        delete parsedData.value[source];
        delete folioImageSources.value[source];
        delete manifestStatus.value[source];
        await deleteCachedItem('manifests', source);
        await clearStore('images'); // region crops were keyed to the old service URL
    }

    /** Forget every manifest link, and what was parsed from them. */
    function clearLinks() {
        links.value = {};
        parsedData.value = {};
        manifestStatus.value = {};
    }

    function removeManifest(source) {
        delete links.value[source];
        delete parsedData.value[source];
    }

    /** Force a fresh fetch of an already-linked manifest, clearing caches. */
    async function refreshManifest(source) {
        const url = links.value[source];
        if (!url) return;
        await deleteCachedItem('manifests', source);
        delete parsedData.value[source];
        await clearStore('images');
        await fetchAndParseManifest(source, url, true);
    }

    async function fetchAndParseManifest(source, url, forceRefresh = false) {
        if (parsedData.value[source] && !folioImageSources.value[source] && !forceRefresh) return;
        
        // If already in flight, reuse promise — but a forced refresh must not
        // piggy-back on a stale in-flight (possibly cache-backed) request.
        if (!forceRefresh && inflightFetches.has(source)) {
            return inflightFetches.get(source);
        }

        const fetchPromise = (async () => {
            manifestStatus.value[source] = { status: 'loading', error: null };
            
            // Check IndexedDB cache first
            if (!forceRefresh) {
                try {
                    const cached = await getCachedItem('manifests', source);
                    if (cached && Array.isArray(cached) && cached.length > 0) {
                        parsedData.value[source] = cached;
                        manifestStatus.value[source] = { status: 'ok', error: null };
                        return;
                    }
                } catch (e) {
                    console.warn(`Cache read failed for ${source}`, e);
                }
            }

            try {
                let attempt = 0;
                const retries = 3;
                const timeout = 15000;
                let res;
                
                while (attempt < retries) {
                    const controller = new AbortController();
                    const id = setTimeout(() => controller.abort(), timeout);
                    try {
                        res = await fetch(url, { signal: controller.signal });
                        clearTimeout(id);
                        if (res.ok || res.status === 404 || res.status === 401 || res.status === 403) {
                            break;
                        }
                        throw new Error(`HTTP ${res.status}`);
                    } catch (e) {
                        clearTimeout(id);
                        attempt++;
                        if (attempt >= retries) {
                            if (e.name === 'AbortError') throw new Error(`Manifest fetch timed out after ${timeout/1000}s`);
                            throw e;
                        }
                        // exponential backoff with jitter
                        await new Promise(r => setTimeout(r, (800 * Math.pow(2, attempt)) + Math.random() * 200));
                    }
                }

            if (!res.ok) {
                 throw new Error(`Failed to load manifest: HTTP ${res.status}`);
            }
            
            const data = await res.json();
            
            // One parser for both manifest versions (services/iiif/manifestParser.js).
            const folios = parseManifest(data, { labelRule: iiifParseRules[source] });

            if (folios.length > 0) {
                parsedData.value[source] = folios;
                delete folioImageSources.value[source];
                manifestStatus.value[source] = { status: 'ok', error: null };
                // Cache parsed manifest data in IndexedDB for fast reloads
                setCachedItem('manifests', source, folios).catch(e => console.warn("Failed caching manifest", e));
            } else {
                const msg = `No canvases found in manifest for ${source}`;
                console.warn(msg);
                manifestStatus.value[source] = { status: 'error', error: msg };
            }
            
        } catch (e) {
            console.error(`Failed to load IIIF manifest for ${source}`, e);
            manifestStatus.value[source] = { status: 'error', error: e.message };
        } finally {
            inflightFetches.delete(source);
        }
        })();

        inflightFetches.set(source, fetchPromise);
        return fetchPromise;
    }

    /**
     * Import manifests from data.json's `manifests` field.
     * Only loads ones not already present in the store.
     */
    async function importFromDataManifests(manifestMap) {
        for (const [source, info] of Object.entries(manifestMap)) {
            const url = (typeof info === 'string' ? info : info.url || '').trim();
            if (!url) continue;
            // Just register the link, don't fetch yet (lazy loading)
            if (!links.value[source]) {
                links.value[source] = url;
            }
        }
    }

    /**
     * Ensure a specific source's manifest is loaded.
     * Called lazily when a source's images are actually needed.
     */
    async function ensureLoaded(source) {
        if (parsedData.value[source] && !folioImageSources.value[source]) return; // Already loaded
        const url = links.value[source];
        if (!url) return; // No URL known
        await fetchAndParseManifest(source, url);
    }

    /**
     * Show a source's pages from the image addresses its documents name.
     *
     * A manifest the user linked wins, and so does anything already loaded from one.
     *
     * @param {string} source
     * @param {Array<[string, string]>} images [normalised folio, IIIF image base address]
     * @returns {boolean} whether the pages were set
     */
    function setFolioImages(source, images) {
        if (!images || images.length === 0) return false;
        if (links.value[source]) return false;
        if (parsedData.value[source] && !folioImageSources.value[source]) return false;

        parsedData.value[source] = images.map(([folio, base]) => ({
            folio,
            // Image API 3 takes "max", older servers "full".
            imgUrl: `${base}/full/${/\/iiif\/3\//.test(base) ? 'max' : 'full'}/0/default.jpg`,
            serviceUrl: base,
            w: 0,
            h: 0,
            originalFolio: folio
        }));
        folioImageSources.value[source] = true;
        manifestStatus.value[source] = { status: 'ok', error: null, fromDocuments: true };
        return true;
    }

    /** Forget pages that were taken from document metadata (the source was removed or re-imported). */
    function clearFolioImages(source) {
        if (!folioImageSources.value[source]) return;
        delete parsedData.value[source];
        delete folioImageSources.value[source];
        delete manifestStatus.value[source];
    }

    // No eager loading — all manifests are loaded lazily via ensureLoaded()

    return {
        links,
        parsedData,
        manifestStatus,
        addManifest,
        setLink,
        removeManifest,
        clearLinks,
        refreshManifest,
        importFromDataManifests,
        ensureLoaded,
        folioImageSources,
        setFolioImages,
        clearFolioImages
    };
});
