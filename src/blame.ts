import compareDesc from 'date-fns/compareDesc'
import format from 'date-fns/format'
import formatDistanceStrict from 'date-fns/formatDistanceStrict'
import { Selection, StatusBarItem, TextDocumentDecoration } from 'sourcegraph'
import gql from 'tagged-template-noop'
import { Settings } from './extension'
import { resolveURI } from './uri'
import { memoizeAsync } from './util/memoizeAsync'

/**
 * Get display info shared between status bar items and text document decorations.
 */
const getDisplayInfoFromHunk = ({
    hunk: { author, commit, message },
    now,
    settings,
    sourcegraph,
}: {
    hunk: Pick<Hunk, 'author' | 'commit' | 'message'>
    now: number
    settings: Pick<Settings, 'git.blame.showPreciseDate'>
    sourcegraph: typeof import('sourcegraph')
}): { displayName: string; username: string; dateString: string; linkURL: string; hoverMessage: string } => {
    const displayName = truncate(author.person.displayName, 25)
    const username = author.person.user ? `(${author.person.user.username}) ` : ''
    const dateString = settings['git.blame.showPreciseDate']
        ? format(author.date, 'MMM dd, y')
        : formatDistanceStrict(author.date, now, { addSuffix: true })
    const linkURL = new URL(commit.url, sourcegraph.internal.sourcegraphURL.toString()).href
    const hoverMessage = `${author.person.email} • ${truncate(message, 1000)}`

    return {
        displayName,
        username,
        dateString,
        linkURL,
        hoverMessage,
    }
}

/**
 * Get hunks and 0-indexed start lines for the given selections.
 *
 * @param selections If null, returns all hunks
 */
export const getHunksForSelections = (
    hunks: Hunk[],
    selections: Selection[] | null
): { selectionStartLine: number; hunk: Hunk }[] => {
    const hunksForSelections: { selectionStartLine: number; hunk: Hunk }[] = []

    if (!selections) {
        return hunks.map(hunk => ({ hunk, selectionStartLine: hunk.startLine - 1 }))
    }

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
            const selectionStartLine =
                hunkStartLineZeroBased < selection.start.line ? selection.start.line : hunkStartLineZeroBased
            hunksForSelections.push({ selectionStartLine, hunk })
        }
    }

    return hunksForSelections
}

export const getDecorationFromHunk = (
    hunk: Hunk,
    now: number,
    decoratedLine: number,
    settings: Pick<Settings, 'git.blame.showPreciseDate'>,
    sourcegraph: typeof import('sourcegraph')
): TextDocumentDecoration => {
    const { displayName, username, dateString, linkURL, hoverMessage } = getDisplayInfoFromHunk({
        hunk,
        now,
        settings,
        sourcegraph,
    })

    return {
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
            contentText: `${dateString} • ${username}${displayName} [${truncate(hunk.message, 45)}]`,
            hoverMessage,
            linkURL,
        },
    }
}

export const getAllBlameDecorations = (
    hunks: Hunk[],
    now: number,
    settings: Pick<Settings, 'git.blame.showPreciseDate'>,
    sourcegraph: typeof import('sourcegraph')
) => hunks.map(hunk => getDecorationFromHunk(hunk, now, hunk.startLine - 1, settings, sourcegraph))

export const queryBlameHunks = memoizeAsync(
    async ({ uri, sourcegraph }: { uri: string; sourcegraph: typeof import('sourcegraph') }): Promise<Hunk[]> => {
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
                                            email
                                            displayName
                                            user {
                                                username
                                            }
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
 * Returns blame decorations for all provided selections,
 * or for all hunks if `selections` is `null`.
 */
export const getBlameDecorations = ({
    settings,
    now,
    hunks,
    sourcegraph,
}: {
    settings: Settings
    now: number
    hunks: Hunk[]
    sourcegraph: typeof import('sourcegraph')
}): TextDocumentDecoration[] =>
    settings['git.blame.decorations'] === 'file' ? getAllBlameDecorations(hunks, now, settings, sourcegraph) : []

export const getBlameStatusBarItem = ({
    selections,
    hunks,
    now,
    settings,
    sourcegraph,
}: {
    selections: Selection[] | null
    hunks: Hunk[]
    now: number
    settings: Pick<Settings, 'git.blame.showPreciseDate'>
    sourcegraph: typeof import('sourcegraph')
}): StatusBarItem => {
    if (selections && selections.length > 0) {
        const hunksForSelections = getHunksForSelections(hunks, selections)
        if (hunksForSelections[0]) {
            // Display the commit for the first selected hunk in the status bar.
            const { displayName, username, dateString, linkURL, hoverMessage } = getDisplayInfoFromHunk({
                hunk: hunksForSelections[0].hunk,
                now,
                settings,
                sourcegraph,
            })

            return {
                text: `Author: ${username}${displayName}, ${dateString}`,
                command: { id: 'open', args: [linkURL] },
                tooltip: hoverMessage,
            }
        }
    }

    // Since there are no selections, we want to determine the most
    // recent change to this file to display in the status bar.

    // Get all hunks
    const hunksForSelections = getHunksForSelections(hunks, null)
    const mostRecentHunk = hunksForSelections.sort((a, b) => compareDesc(a.hunk.author.date, b.hunk.author.date))[0]
    if (!mostRecentHunk) {
        // Probably a network error
        return {
            text: 'Author: not found',
        }
    }
    const { displayName, username, dateString, linkURL, hoverMessage } = getDisplayInfoFromHunk({
        hunk: mostRecentHunk.hunk,
        now,
        settings,
        sourcegraph,
    })

    return {
        text: `Author: ${username}${displayName}, ${dateString}`,
        command: { id: 'open', args: [linkURL] },
        tooltip: hoverMessage,
    }
}

export interface HunkForSelection {
    hunk: Hunk
    selectionStartLine: number
}

export interface Hunk {
    startLine: number
    endLine: number
    author: {
        person: {
            email: string
            displayName: string
            user: {
                username: string
            } | null
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
