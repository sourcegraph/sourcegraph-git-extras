import * as sourcegraph from 'sourcegraph'
import { getBlameDecorations } from './blame'

export interface Settings {
    ['git.blame.lineDecorations']?: boolean
}

export function activate(): void {
    function activeEditor(): sourcegraph.CodeEditor | undefined {
        return sourcegraph.app.activeWindow ? sourcegraph.app.activeWindow.visibleViewComponents[0] : undefined
    }

    // BACKCOMPAT: Older versions of Sourcegraph accept `null` and do not have
    // `sourcegraph.app.createDecorationType`.
    const fileBlameDecorationType = sourcegraph.app.createDecorationType
        ? sourcegraph.app.createDecorationType()
        : ((null as any) as sourcegraph.TextDocumentDecorationType)

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
            editor.setDecorations(
                fileBlameDecorationType,
                await getBlameDecorations({ uri: editor.document.uri, settings })
            )
        } catch (err) {
            console.error('Decoration error:', err)
        }
    }
    sourcegraph.configuration.subscribe(() => decorate())
    // TODO(sqs): Add a way to get notified when a new editor is opened (because we want to be able to pass an
    // `editor` to `updateDecorations`/`updateContext`, but this subscription just gives us a `doc`).
    sourcegraph.workspace.onDidOpenTextDocument.subscribe(() => decorate())
}
