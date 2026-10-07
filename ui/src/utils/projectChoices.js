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

const without = (query) => Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/**
 * Where the table a cell was opened in is: the standard one unless it says otherwise. The page
 * editor and the line editor bring the person back to it.
 */
const tableName = (from) => (from === 'extended' ? 'project_extended' : 'project_standard');

/** The cell of a code, in the table it was opened in. */
export function projectCellLocation(id, { code = '', from = 'standard' } = {}) {
    return { name: tableName(from), params: { id }, query: without({ cell: code }) };
}

/**
 * The page editor, in the frame of the project. `code` is the pattern to draw (it is ready on the
 * palette), `line` a line region's id or `legacy` for the page as a whole, `from` the table the
 * person came from.
 */
export function projectPageLocation(id, { folio = '', code = '', line = '', from = 'standard' } = {}) {
    return { name: 'project_page', params: { id }, query: without({ folio, line, highlight: code, from: from === 'standard' ? '' : from }) };
}
