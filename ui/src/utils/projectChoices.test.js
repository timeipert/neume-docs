import { describe, expect, it } from 'vitest';
import { projectCellLocation, projectPageLocation, snippetOptions } from './projectChoices';

describe('the way back to a cell', () => {
    it('is the table the cell was opened in', () => {
        expect(projectCellLocation('p1', { code: '*ud' })).toEqual({ name: 'project_standard', params: { id: 'p1' }, query: { cell: '*ud' } });
        expect(projectCellLocation('p1', { code: '*ud', from: 'extended' }).name).toBe('project_extended');
    });

    it('is the table itself when no cell was open', () => {
        expect(projectCellLocation('p1')).toEqual({ name: 'project_standard', params: { id: 'p1' }, query: {} });
    });
});

describe('the page editor in the frame of a project', () => {
    it('says which folio, which code to look for and where the person came from', () => {
        expect(projectPageLocation('p1', { folio: '12r', code: '*ud', from: 'extended' })).toEqual({
            name: 'project_page', params: { id: 'p1' }, query: { folio: '12r', highlight: '*ud', from: 'extended' }
        });
    });

    it('leaves out what is not needed', () => {
        expect(projectPageLocation('p1', { folio: '12r' }).query).toEqual({ folio: '12r' });
        expect(projectPageLocation('p1').query).toEqual({});
    });

    it('can open a line, or the page as a whole', () => {
        expect(projectPageLocation('p1', { folio: '12r', line: 'r_17' }).query).toEqual({ folio: '12r', line: 'r_17' });
        expect(projectPageLocation('p1', { folio: '12r', line: 'legacy' }).query).toEqual({ folio: '12r', line: 'legacy' });
    });
});

describe('what a snippet is', () => {
    it('is worded for the kind of image', () => {
        expect(snippetOptions('screenshots')[0].label).toBe('A screenshot of the line');
        expect(snippetOptions('iiif')[1].label).toBe('Signs only');
    });
});
