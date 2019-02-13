import {  BehaviorSubject, combineLatest, from } from 'rxjs'
import { filter, map, switchMap } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { getBlameDecorations } from './blame'

export interface Settings {
    ['git.blame.lineDecorations']?: boolean
}

const decorationType = sourcegraph.app.createDecorationType && sourcegraph.app.createDecorationType()

export function activate(context: sourcegraph.ExtensionContext): void {

    const selectionChanges = from(sourcegraph.app.activeWindowChanges).pipe(
        filter((window): window is sourcegraph.Window => window !== undefined),
        switchMap(window => window.activeViewComponentChanges),
        filter((editor): editor is sourcegraph.CodeEditor => editor !== undefined),
        switchMap(editor => from(editor.selectionsChanges).pipe(
            map(selections => ({ editor, selections }))
        )),
    )

    // TODO(lguychard) sourcegraph.configuration is currently not rxjs-compatible.
    // Fix this once it has been made compatible.
    const configurationChanges = new BehaviorSubject<void>(undefined)
    context.subscriptions.add(
        sourcegraph.configuration.subscribe(() => configurationChanges.next())
    )

    // When the configuration or current file changes, publish new decorations.
    context.subscriptions.add(
        combineLatest(configurationChanges, selectionChanges)
            .subscribe(([, {editor, selections}]) => decorate(editor, selections))
    )

    // TODO: Unpublish decorations on previously (but not currently) open files when settings changes, to avoid a
    // brief flicker of the old state when the file is reopened.
    async function decorate(editor: sourcegraph.CodeEditor, selections: sourcegraph.Selection[]): Promise<void> {
        const settings = sourcegraph.configuration.get<Settings>().value
        try {
            editor.setDecorations(decorationType, await getBlameDecorations({ uri: editor.document.uri, settings, selections }))
        } catch (err) {
            console.error('Decoration error:', err)
        }
    }
}
