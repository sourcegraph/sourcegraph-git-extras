import formatDistanceStrict from 'date-fns/formatDistanceStrict'
import * as sourcegraph from 'sourcegraph'
import { Settings } from './extension'
import { resolveURI } from './uri'

export async function getBlameDecorations(
    uri: string,
    settings: Settings
): Promise<sourcegraph.TextDocumentDecoration[]> {
    if (!settings['git.blame.lineDecorations']) {
        return []
    }
    const hunks = await queryBlameHunks(uri)
    const now = Date.now()
    return hunks.map(
        hunk =>
            ({
                range: new sourcegraph.Range(hunk.startLine - 1, 0, hunk.startLine - 1, 0),
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
                    hoverMessage: `View commit ${truncate(hunk.rev, 7, '')}: ${truncate(hunk.message, 1000)}`,
                    linkURL: `${
                        sourcegraph.internal.clientApplication === 'sourcegraph'
                            ? ''
                            : sourcegraph.internal.sourcegraphURL
                    }${hunk.commit.url}`,
                },
            } as sourcegraph.TextDocumentDecoration)
    )
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

async function queryBlameHunks(uri: string): Promise<Hunk[]> {
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
}

function truncate(s: string, max: number, omission = '…'): string {
    if (s.length <= max) {
        return s
    }
    return `${s.slice(0, max)}${omission}`
}
