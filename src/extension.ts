import { difference } from 'lodash'
import * as sourcegraph from 'sourcegraph'
import { decorationForLine, getHunks, Hunk } from './blame'

export interface Settings {
    ['git.blame.lineDecorations']?: boolean
}

const decorationType = sourcegraph.app.createDecorationType()

const hunksCache = new Map<string, Hunk[]>()

async function cacheHunks(documents: sourcegraph.TextDocument[]): Promise<void> {
    const currentURIs = documents.map(d => d.uri)
    const previousURIs = [...hunksCache.keys()]
    const closedDocuments = difference(previousURIs, currentURIs)
    const settings = sourcegraph.configuration.get<Settings>().value
    for (const uri of closedDocuments) {
        hunksCache.delete(uri)
    }
    const newDocuments = difference(currentURIs, previousURIs)
    for (const uri of newDocuments) {
        hunksCache.set(uri, await getHunks({ uri, settings }))
    }
}

const editorForUri = (uri: string) =>
    sourcegraph.app.activeWindow && sourcegraph.app.activeWindow.visibleViewComponents.find(editor => editor.document.uri === uri)

export function activate(): void {

    sourcegraph.languages.registerHoverProvider(['*'], {
        provideHover: (document, position) => {
            const hunks = hunksCache.get(document.uri)
            const editor = editorForUri(document.uri)
            if (!hunks || !editor) {
                return null
            }
            const decoration = decorationForLine(position, hunks)
            if (decoration) {
                editor.setDecorations(decorationType, [decoration])
            }
            return null
        }
    })
    sourcegraph.configuration.subscribe(async () => await cacheHunks(sourcegraph.workspace.textDocuments))
    // TODO(sqs): Add a way to get notified when a new editor is opened (because we want to be able to pass an
    // `editor` to `updateDecorations`/`updateContext`, but this subscription just gives us a `doc`).
    sourcegraph.workspace.onDidOpenTextDocument.subscribe(async () => await cacheHunks(sourcegraph.workspace.textDocuments))
}
