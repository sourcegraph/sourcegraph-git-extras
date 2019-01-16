import * as sourcegraph from 'sourcegraph'
import { getBlameDecorations } from './blame'

export interface Settings {
    ['git.blame.lineDecorations']?: boolean
}

const decorationType = sourcegraph.app.createDecorationType && sourcegraph.app.createDecorationType()

export function activate(): void {
    function activeEditor(): sourcegraph.CodeEditor | undefined {
        return sourcegraph.app.activeWindow ? sourcegraph.app.activeWindow.visibleViewComponents[0] : undefined
    }

    // When the configuration or current file changes, publish new decorations.
    //
    // TODO: Unpublish decorations on previously (but not currently) open files when settings changes, to avoid a
    // brief flicker of the old state when the file is reopened.
    async function decorate(editor: sourcegraph.CodeEditor | undefined = activeEditor()): Promise<void> {
        if (!editor) {
            return
        }
        const settings = sourcegraph.configuration.get<Settings>().value
        try {
            editor.setDecorations(decorationType, await getBlameDecorations({ uri: editor.document.uri, settings }))
        } catch (err) {
            console.error('Decoration error:', err)
        }
    }
    sourcegraph.configuration.subscribe(() => decorate())
    // TODO(sqs): Add a way to get notified when a new editor is opened (because we want to be able to pass an
    // `editor` to `updateDecorations`/`updateContext`, but this subscription just gives us a `doc`).
    sourcegraph.workspace.onDidOpenTextDocument.subscribe(() => decorate())
}
