import expect from 'expect'
import {
    getAllBlameDecorations,
    getBlameDecorations,
    getBlameDecorationsForSelections,
    getBlameStatusBarItem,
    getDecorationFromHunk,
    Hunk,
} from './blame'
import { createMockSourcegraphAPI } from './util/stubs'

const FIXTURE_HUNK_1: Hunk = {
    startLine: 1,
    endLine: 2,
    author: {
        person: {
            email: 'email@email.email',
            displayName: 'a',
            user: null,
        },
        date: '2018-09-10T21:52:45Z',
    },
    rev: 'b',
    message: 'c',
    commit: {
        url: 'd',
    },
}

const FIXTURE_HUNK_2: Hunk = {
    startLine: 2,
    endLine: 3,
    author: {
        person: {
            email: 'email@email.email',
            displayName: 'e',
            user: null,
        },
        date: '2018-11-10T21:52:45Z',
    },
    rev: 'f',
    message: 'g',
    commit: {
        url: 'h',
    },
}

const FIXTURE_HUNK_3: Hunk = {
    startLine: 3,
    endLine: 4,
    author: {
        person: {
            email: 'email@email.email',
            displayName: 'i',
            user: null,
        },
        date: '2018-10-10T21:52:45Z',
    },
    rev: 'j',
    message: 'k',
    commit: {
        url: 'l',
    },
}

const FIXTURE_HUNK_4: Hunk = {
    startLine: 4,
    endLine: 5,
    author: {
        person: {
            email: 'email@email.email',
            displayName: 'i',
            user: {
                username: 'testUserName',
            },
        },
        date: '2018-10-10T21:52:45Z',
    },
    rev: 'j',
    message: 'k',
    commit: {
        url: 'l',
    },
}

const NOW = +new Date('2018-12-01T21:52:45Z')

const SOURCEGRAPH = createMockSourcegraphAPI()

describe('getDecorationsFromHunk()', () => {
    it('creates a TextDocumentDecoration from a Hunk', () => {
        expect(
            getDecorationFromHunk(FIXTURE_HUNK_1, NOW, 0, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any)
        ).toEqual({
            after: {
                contentText: '3 months ago • a [c]',
                dark: {
                    backgroundColor: 'rgba(15, 43, 89, 0.65)',
                    color: 'rgba(235, 235, 255, 0.55)',
                },
                hoverMessage: `${FIXTURE_HUNK_1.author.person.email} • ${FIXTURE_HUNK_1.message}`,
                light: {
                    backgroundColor: 'rgba(193, 217, 255, 0.65)',
                    color: 'rgba(0, 0, 25, 0.55)',
                },
                linkURL: 'https://sourcegraph.test/d',
            },
            isWholeLine: true,
            range: {
                end: 0,
                start: 0,
            },
        })
    })

    it('truncates long commit messsages', () => {
        const decoration = getDecorationFromHunk(
            {
                ...FIXTURE_HUNK_1,
                message: 'asdgjdsag asdklgbasdghladg asdgjlhbasdgjlhabsdg asdgilbadsgiobasgd',
            },
            NOW,
            0,
            { 'git.blame.showPreciseDate': false },
            SOURCEGRAPH as any
        )
        expect(decoration.after && decoration.after.contentText).toEqual(
            '3 months ago • a [asdgjdsag asdklgbasdghladg asdgjlhbasdgjlhabs…]'
        )
    })

    it('truncates long display names', () => {
        const decoration = getDecorationFromHunk(
            {
                ...FIXTURE_HUNK_1,
                author: {
                    person: {
                        email: 'email@email.email',
                        displayName: 'asdgjdsag asdklgbasdghladg asdgjlhbasdgjlhabsdg asdgilbadsgiobasgd',
                        user: null,
                    },
                    date: '2018-09-10T21:52:45Z',
                },
            },
            NOW,
            0,
            { 'git.blame.showPreciseDate': false },
            SOURCEGRAPH as any
        )
        expect(decoration.after && decoration.after.contentText).toEqual(
            '3 months ago • asdgjdsag asdklgbasdghlad… [c]'
        )
    })
})

describe('getBlameDecorationsForSelections()', () => {
    it('adds decorations only for hunks that are within the selections', () => {
        const decorations = getBlameDecorationsForSelections(
            [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
            [new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(1, 0), new SOURCEGRAPH.Position(1, 0)) as any],
            NOW,
            { 'git.blame.showPreciseDate': false },
            SOURCEGRAPH as any
        )
        expect(decorations).toEqual([
            getDecorationFromHunk(FIXTURE_HUNK_2, NOW, 1, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
        ])
    })

    it('handles multiple selections', () => {
        const decorations = getBlameDecorationsForSelections(
            [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
            [
                new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(1, 0), new SOURCEGRAPH.Position(1, 0)) as any,
                new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(2, 0), new SOURCEGRAPH.Position(5, 0)) as any,
                new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(6, 0), new SOURCEGRAPH.Position(10, 0)) as any,
            ],
            NOW,
            { 'git.blame.showPreciseDate': false },
            SOURCEGRAPH as any
        )
        expect(decorations).toEqual([
            getDecorationFromHunk(FIXTURE_HUNK_2, NOW, 1, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_3, NOW, 2, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_4, NOW, 3, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
        ])
    })

    it('handles multiple hunks per selection', () => {
        const decorations = getBlameDecorationsForSelections(
            [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
            [new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(0, 0), new SOURCEGRAPH.Position(5, 0)) as any],
            NOW,
            { 'git.blame.showPreciseDate': false },
            SOURCEGRAPH as any
        )
        expect(decorations).toEqual([
            getDecorationFromHunk(FIXTURE_HUNK_1, NOW, 0, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_2, NOW, 1, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_3, NOW, 2, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_4, NOW, 3, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
        ])
    })

    it('decorates the start line of the selection if the start line of the hunk is outside of the selection boundaries', () => {
        const decorations = getBlameDecorationsForSelections(
            [
                {
                    ...FIXTURE_HUNK_1,
                    startLine: 1,
                    endLine: 10,
                },
            ],
            [new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(2, 0), new SOURCEGRAPH.Position(2, 0)) as any],
            NOW,
            { 'git.blame.showPreciseDate': false },
            SOURCEGRAPH as any
        )
        expect(decorations).toEqual([
            getDecorationFromHunk(FIXTURE_HUNK_1, NOW, 2, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
        ])
    })
})

describe('getAllBlameDecorations()', () => {
    it('adds decorations for all hunks', () => {
        expect(
            getAllBlameDecorations(
                [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
                NOW,
                { 'git.blame.showPreciseDate': false },
                SOURCEGRAPH as any
            )
        ).toEqual([
            getDecorationFromHunk(FIXTURE_HUNK_1, NOW, 0, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_2, NOW, 1, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_3, NOW, 2, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_4, NOW, 3, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
        ])
    })
})

describe('getBlameDecorations()', () => {
    it('gets decorations for all hunks if no selections are passed', async () => {
        expect(
            getBlameDecorations({
                settings: {
                    'git.blame.decorations': 'line',
                    'git.blame.showPreciseDate': false,
                },
                now: NOW,
                selections: null,
                hunks: [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
                sourcegraph: SOURCEGRAPH as any,
            })
        ).toEqual([
            getDecorationFromHunk(FIXTURE_HUNK_1, NOW, 0, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_2, NOW, 1, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_3, NOW, 2, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_4, NOW, 3, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
        ])
    })

    it('gets decorations for the selections if selections are passed', async () => {
        expect(
            getBlameDecorations({
                settings: {
                    'git.blame.decorations': 'line',
                },
                now: NOW,
                selections: [
                    new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(3, 0), new SOURCEGRAPH.Position(3, 0)) as any,
                ],
                hunks: [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
                sourcegraph: SOURCEGRAPH as any,
            })
        ).toEqual([
            getDecorationFromHunk(FIXTURE_HUNK_4, NOW, 3, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
        ])
    })

    it('gets no decorations if git.blame.decorations is "none"', async () => {
        expect(
            getBlameDecorations({
                settings: {
                    'git.blame.decorations': 'none',
                },
                now: NOW,
                selections: null,
                hunks: [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
                sourcegraph: SOURCEGRAPH as any,
            })
        ).toEqual([])
    })

    it('gets decorations for all hunks if git.blame.decorations is "file"', async () => {
        expect(
            getBlameDecorations({
                settings: {
                    'git.blame.decorations': 'file',
                },
                now: NOW,
                selections: [
                    new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(3, 0), new SOURCEGRAPH.Position(3, 0)) as any,
                ],
                hunks: [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
                sourcegraph: SOURCEGRAPH as any,
            })
        ).toEqual([
            getDecorationFromHunk(FIXTURE_HUNK_1, NOW, 0, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_2, NOW, 1, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_3, NOW, 2, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
            getDecorationFromHunk(FIXTURE_HUNK_4, NOW, 3, { 'git.blame.showPreciseDate': false }, SOURCEGRAPH as any),
        ])
    })

    it('renders username in decoration content message', async () => {
        expect(
            getDecorationFromHunk(
                FIXTURE_HUNK_4,
                NOW,
                3,
                { 'git.blame.showPreciseDate': false },
                SOURCEGRAPH as any
            ).after!.contentText!.includes(
                `(${FIXTURE_HUNK_4.author.person.user!.username}) ${FIXTURE_HUNK_4.author.person.displayName}`
            )
        ).toBe(true)
        expect(
            getDecorationFromHunk(
                FIXTURE_HUNK_3,
                NOW,
                2,
                { 'git.blame.showPreciseDate': false },
                SOURCEGRAPH as any
            ).after!.contentText!.includes(`${FIXTURE_HUNK_3.author.person.displayName}`)
        ).toBe(true)
    })
})

describe('getBlameStatusBarItem()', () => {
    it('displays the hunk for the first selected line', () => {
        expect(
            getBlameStatusBarItem({
                selections: [
                    new SOURCEGRAPH.Selection(new SOURCEGRAPH.Position(3, 0), new SOURCEGRAPH.Position(3, 0)) as any,
                ],
                hunks: [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
                sourcegraph: SOURCEGRAPH as any,
                settings: { 'git.blame.showPreciseDate': false },
                now: NOW,
            }).text
        ).toBe('Author: (testUserName) i, 2 months ago')
    })

    it('displays the most recent hunk if there are no selections', () => {
        expect(
            getBlameStatusBarItem({
                selections: [],
                hunks: [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
                sourcegraph: SOURCEGRAPH as any,
                settings: { 'git.blame.showPreciseDate': false },
                now: NOW,
            }).text
        ).toBe('Author: e, 21 days ago')

        expect(
            getBlameStatusBarItem({
                selections: null,
                hunks: [FIXTURE_HUNK_1, FIXTURE_HUNK_2, FIXTURE_HUNK_3, FIXTURE_HUNK_4],
                sourcegraph: SOURCEGRAPH as any,
                settings: { 'git.blame.showPreciseDate': false },
                now: NOW,
            }).text
        ).toBe('Author: e, 21 days ago')
    })
})
