import formatDistanceStrict from 'date-fns/formatDistanceStrict'
import { Selection, TextDocumentDecoration } from 'sourcegraph'
import gql from 'tagged-template-noop'
import { Settings } from './extension'
import { resolveURI } from './uri'
import { memoizeAsync } from './util/memoizeAsync'

export const getDecorationFromHunk = (hunk: Hunk, now: number, decoratedLine: number, sourcegraph: typeof import('sourcegraph')): TextDocumentDecoration => ({
    range: new sourcegraph.Range(decoratedLine, 0, decoratedLine, 0),
    isWholeLine: true,
    after: {
        light: {
            color: 'rgba(0, 0, 25, 0.55)',
            backgroundColor: 'rgba(193, 217, 255, 0.65)',
        },
        dark: {
            color: 'rgba(235, 235, 255, 0.55)',
            backgroundColor: 'rgba(15, 43, 89, 0.65)',
        },
        contentText: `${truncate(hunk.author.person.displayName, 25)}, ${formatDistanceStrict(hunk.author.date, now, {
            addSuffix: true,
        })}: • ${truncate(hunk.message, 45)}`,
        hoverMessage: `${truncate(hunk.message, 1000)}`,
        linkURL: new URL(hunk.commit.url, sourcegraph.internal.sourcegraphURL.toString()).href,
    },
})

export const getBlameDecorationsForSelections = (hunks: Hunk[], selections: Selection[], now: number, sourcegraph: typeof import('sourcegraph')) => {
    const decorations: TextDocumentDecoration[] = []
    for (const hunk of hunks) {
        // Hunk start and end lines are 1-indexed, but selection lines are zero-indexed
        const hunkStartLineZeroBased = hunk.startLine - 1
        // A Hunk's end line overlaps with the next hunk's start line.
        // -2 here to avoid decorating the same line twice.
        const hunkEndLineZeroBased = hunk.endLine - 2
        for (const selection of selections) {
            if (selection.end.line < hunkStartLineZeroBased || selection.start.line > hunkEndLineZeroBased) {
                continue
            }
            // Decorate the hunk's start line or, if the hunk's start line is
            // outside of the selection's boundaries, the start line of the selection.
            const decoratedLine =
                hunkStartLineZeroBased < selection.start.line ? selection.start.line : hunkStartLineZeroBased
            decorations.push(getDecorationFromHunk(hunk, now, decoratedLine, sourcegraph))
        }
    }
    return decorations
}

export const getAllBlameDecorations = (hunks: Hunk[], now: number, sourcegraph: typeof import('sourcegraph')) =>
    hunks.map(hunk => getDecorationFromHunk(hunk, now, hunk.startLine - 1, sourcegraph))

const queryBlameHunks = memoizeAsync(
    async ({uri, sourcegraph}: {uri: string, sourcegraph: typeof import('sourcegraph')}): Promise<Hunk[]> => {
        const { repo, rev, path } = resolveURI(uri)
        const { data, errors } = await sourcegraph.commands.executeCommand(
            'queryGraphQL',
            gql`
                query GitBlame($repo: String!, $rev: String!, $path: String!) {
                    repository(name: $repo) {
                        commit(rev: $rev) {
                            blob(path: $path) {
                                blame(startLine: 0, endLine: 0) {
                                    startLine
                                    endLine
                                    author {
                                        person {
                                            displayName
                                        }
                                        date
                                    }
                                    message
                                    rev
                                    commit {
                                        url
                                    }
                                }
                            }
                        }
                    }
                }
            `,
            { repo, rev, path }
        )
        if (errors && errors.length > 0) {
            throw new Error(errors.join('\n'))
        }
        if (!data || !data.repository || !data.repository.commit || !data.repository.commit.blob) {
            throw new Error('no blame data is available (repository, commit, or path not found)')
        }
        return data.repository.commit.blob.blame
    },
    ({ uri }) => uri
)

/**
 * Queries the blame hunks for the document at the provided URI,
 * and returns blame decorations for all provided selections,
 * or for all hunks if `selections` is `null`.
 *
 */
export const getBlameDecorations = async ({
    uri,
    settings,
    selections,
    now,
    queryHunks = queryBlameHunks,
    sourcegraph
}: {
    uri: string
    settings: Settings
    selections: Selection[] | null,
    now: number,
    queryHunks?: ({ uri, sourcegraph } : { uri: string, sourcegraph: typeof import('sourcegraph') }) => Promise<Hunk[]>,
    sourcegraph: typeof import('sourcegraph')
}): Promise<TextDocumentDecoration[]> => {
    if (!settings['git.blame.lineDecorations']) {
        return []
    }
    const hunks = await queryHunks({ uri, sourcegraph })
    if (selections !== null) {
        return getBlameDecorationsForSelections(hunks, selections, now, sourcegraph)
    } else {
        return getAllBlameDecorations(hunks, now, sourcegraph)
    }
}

export interface Hunk {
    startLine: number
    endLine: number
    author: {
        person: {
            displayName: string
        }
        date: string
    }
    rev: string
    message: string
    commit: {
        url: string
    }
}

function truncate(s: string, max: number, omission = '…'): string {
    if (s.length <= max) {
        return s
    }
    return `${s.slice(0, max)}${omission}`
}
