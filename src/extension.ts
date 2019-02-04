import {  BehaviorSubject, combineLatest, from } from 'rxjs'
import { filter, map, switchMap } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { getBlameDecorations } from './blame'

export interface Settings {
    ['git.blame.lineDecorations']?: boolean
}

const decorationType = sourcegraph.app.createDecorationType && sourcegraph.app.createDecorationType()

export function activate(): void {

    const selectionChanges = from(sourcegraph.app.activeWindowChanged).pipe(
        filter((window): window is sourcegraph.Window => window !== undefined),
        switchMap(window => window.activeViewComponentChanged),
        filter((editor): editor is sourcegraph.CodeEditor => editor !== undefined),
        switchMap(editor => from(editor.selectionsChanged).pipe(
            map(selections => ({ editor, selections }))
        )),
    )

    const configurationChanges = new BehaviorSubject<void>(undefined)
    sourcegraph.configuration.subscribe(() => configurationChanges.next())

    combineLatest(configurationChanges, selectionChanges)
        .subscribe(([, {editor, selections}]) => decorate(editor, selections))

    // When the configuration or current file changes, publish new decorations.
    //
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
