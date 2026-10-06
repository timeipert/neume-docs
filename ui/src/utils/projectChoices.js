/**
 * The three questions that shape a project, and what each answer means. Shared by
 * the wizard that asks them and the settings that change them.
 */

export const FOCUS_OPTIONS = [
    {
        value: 'transcription',
        label: 'The transcription',
        text: 'The corpus says which neumes stand where. The project starts from those places and finds each one on the page images.'
    },
    {
        value: 'manuscript',
        label: 'The manuscript',
        text: 'There is no transcription yet, or it is not the starting point. You look at the manuscript itself and mark the neumes you find.'
    }
];

export const IMAGE_OPTIONS = [
    {
        value: 'iiif',
        label: 'IIIF page images',
        text: 'The pages come from a IIIF manifest. Snippets are cut from the live page images.'
    },
    {
        value: 'screenshots',
        label: 'Screenshots',
        text: 'You paste or upload the images yourself, for example screenshots of a facsimile. They are kept in the editor.'
    }
];

/** What is cut out, worded for the kind of image. */
export function snippetOptions(images) {
    const shots = images === 'screenshots';
    return [
        {
            value: 'lines',
            label: shots ? 'A screenshot of the line' : 'Lines, then signs',
            text: shots
                ? 'Each snippet is a whole text line with its neumes, so the sign is seen in context.'
                : 'Mark each text line first, then the signs on it. Signs stay tied to their line, and can be linked to the transcription.'
        },
        {
            value: 'signs',
            label: shots ? 'A screenshot of the sign' : 'Signs only',
            text: shots
                ? 'Each snippet is one neume, cropped out. Quicker, and nothing else is on the image.'
                : 'Mark each sign on its own, directly on the page. Quicker, and no line is needed.'
        }
    ];
}

const FOCUS_LABEL = { transcription: 'Transcription-centred', manuscript: 'Manuscript-centred' };
const IMAGES_LABEL = { iiif: 'IIIF', screenshots: 'Screenshots' };
const SNIPPETS_LABEL = { lines: 'Line snippets', signs: 'Sign snippets' };

/** Short labels for a project's three choices, for chips. */
export function projectChips(project) {
    return [FOCUS_LABEL[project.focus], IMAGES_LABEL[project.images], SNIPPETS_LABEL[project.snippets]].filter(Boolean);
}

/** The way into the existing page editor for a cell: lines go to the line regions, signs to the whole page. */
export function pageEditorQuery(project, { folio, code }) {
    return {
        source: project.source,
        folio,
        highlight: code || undefined,
        region: project.snippets === 'signs' ? 'legacy' : undefined,
        return_to: 'project',
        return_id: project.id
    };
}
