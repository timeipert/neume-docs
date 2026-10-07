import JSZip from 'jszip';
import { buildLocalDocumentation, documentationFiles } from './useLocalDocumentation';
import { fileSlug } from '../utils/buildDocumentation';

/**
 * Downloads the documentation of this browser's work as one ZIP: the files to put at the top of a
 * repository (or in a folder of one) so that others can read it in the viewer.
 */

function readme(index, viewerUrl) {
    const title = index.info.title || 'A neume-docs documentation';
    return `# ${title}

${index.info.description ? `${index.info.description}\n\n` : ''}This folder is a documentation made with neume-docs: plain files, read — never changed — by the viewer.

- \`neume-docs.json\` is the index: who made it, the metadata columns, the list of manuscripts.
- \`data/\` has one file for each manuscript: its pattern table and its snippets.
- \`images/\` holds the pictures of snippets that are kept as files.

## Putting it where others can read it

1. Put these files at the top of a public GitHub repository (or in a folder of one) and commit them.
2. Open the repository in the viewer: ${viewerUrl}#/docs/ — then "Open a repository", and give it as \`owner/name\`.
3. To have it listed for everybody on a site, add it to that site's \`endpoints.json\`:

\`\`\`json
{ "endpoints": [ { "name": ${JSON.stringify(title)}, "repo": "owner/name" } ] }
\`\`\`

Made ${index.generated}${index.info.license ? `. Licence: ${index.info.license}` : ''}.
`;
}

/**
 * @returns {Promise<{ manuscripts: number, snippets: number, images: number, name: string }>}
 */
export async function downloadDocumentation() {
    const built = await buildLocalDocumentation({ images: 'files' });
    if (!built.index.manuscripts.length) {
        throw new Error('Nothing is published yet. Publish a project (its settings have the switch) and mark snippets on its pages, then try again.');
    }

    const zip = new JSZip();
    for (const f of documentationFiles(built)) zip.file(f.path, f.text);
    for (const img of built.files) {
        const comma = img.dataUrl.indexOf(',');
        if (comma > 0) zip.file(img.path, img.dataUrl.slice(comma + 1), { base64: true });
    }
    zip.file('README.md', readme(built.index, window.location.href.split('#')[0]));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const name = `neume-docs-${fileSlug(built.index.info.title || 'documentation').toLowerCase()}-${built.index.generated}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);

    return {
        manuscripts: built.index.manuscripts.length,
        snippets: built.index.manuscripts.reduce((n, m) => n + m.snippets, 0),
        images: built.files.length,
        name
    };
}
