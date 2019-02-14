import formatDistanceStrict from 'date-fns/formatDistanceStrict'
import * as sourcegraph from 'sourcegraph'
import { Settings } from './extension'
import { resolveURI } from './uri'
import { memoizeAsync } from './util/memoizeAsync'

const getDecorationFromHunk = (hunk: Hunk, now: number, decoratedLine: number): sourcegraph.TextDocumentDecoration => ({
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
        contentText: `${truncate(hunk.author.person.displayName, 25)}, ${formatDistanceStrict(
            hunk.author.date,
            now,
            {
                addSuffix: true,
            }
        )}: • ${truncate(hunk.message, 45)}`,
        hoverMessage: `${truncate(hunk.message, 1000)}`,
        linkURL: `${
            sourcegraph.internal.clientApplication === 'sourcegraph'
                ? ''
                : sourcegraph.internal.sourcegraphURL
        }${hunk.commit.url}`,
    },
})

const getBlameDecorationsForSelections = (hunks: Hunk[], selections: sourcegraph.Selection[], now: number) => {
    const decorations: sourcegraph.TextDocumentDecoration[] = []
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
            const decoratedLine = hunkStartLineZeroBased < selection.start.line ? selection.start.line : hunkStartLineZeroBased
            decorations.push(getDecorationFromHunk(hunk, now, decoratedLine))
        }
    }
    return decorations
}

const getAllBlameDecorations = (hunks: Hunk[], now: number) => hunks.map(hunk => getDecorationFromHunk(hunk, now, hunk.startLine - 1))


/**
 * Queries the blame hunks for the document at the provided URI,
 * and returns blame decorations for all provided selections,
 * or for all hunks if `selections` is `null`.
 *
 */
export const getBlameDecorations = async ({ uri, settings, selections }: { uri: string; settings: Settings, selections: sourcegraph.Selection[] | null }): Promise<sourcegraph.TextDocumentDecoration[]> => {
    if (!settings['git.blame.lineDecorations']) {
        return []
    }
    const hunks = await queryBlameHunks(uri)
    const now = Date.now()
    if (selections !== null) {
        return getBlameDecorationsForSelections(hunks, selections, now)
    } else {
        return getAllBlameDecorations(hunks, now)
    }
}

interface Hunk {
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

const queryBlameHunks = memoizeAsync(async (uri: string): Promise<Hunk[]> => {
    const { repo, rev, path } = resolveURI(uri)
    const { data, errors } = await sourcegraph.commands.executeCommand(
        'queryGraphQL',
        `
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
}, uri => uri)

function truncate(s: string, max: number, omission = '…'): string {
    if (s.length <= max) {
        return s
    }
    return `${s.slice(0, max)}${omission}`
}
