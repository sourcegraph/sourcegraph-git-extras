import { BehaviorSubject, combineLatest, from } from 'rxjs'
import { filter, map, switchMap } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { getBlameDecorations } from './blame'

export interface Settings {
    ['git.blame.decorations']?: 'none' | 'line' | 'file'
}

const decorationType = sourcegraph.app.createDecorationType && sourcegraph.app.createDecorationType()

export function activate(context: sourcegraph.ExtensionContext): void {
    // TODO(lguychard) sourcegraph.configuration is currently not rxjs-compatible.
    // Fix this once it has been made compatible.
    const configurationChanges = new BehaviorSubject<void>(undefined)
    context.subscriptions.add(sourcegraph.configuration.subscribe(() => configurationChanges.next(undefined)))

    if (sourcegraph.app.activeWindowChanges) {
        const selectionChanges = from(sourcegraph.app.activeWindowChanges).pipe(
            filter((window): window is Exclude<typeof window, undefined> => window !== undefined),
            switchMap(window => window.activeViewComponentChanges),
            filter((editor): editor is sourcegraph.CodeEditor => !!editor && editor.type === 'CodeEditor'),
            switchMap(editor => from(editor.selectionsChanges).pipe(map(selections => ({ editor, selections }))))
        )
        // When the configuration or current file changes, publish new decorations.
        context.subscriptions.add(
            combineLatest(configurationChanges, selectionChanges).subscribe(([, { editor, selections }]) =>
                decorate(editor, selections)
            )
        )
    } else {
        // Backcompat: the extension host does not support activeWindowChanges or CodeEditor.selectionsChanges.
        // When configuration changes or onDidOpenTextDocument fires, add decorations for all blame hunks.
        const activeEditor = () => sourcegraph.app.activeWindow && sourcegraph.app.activeWindow.activeViewComponent
        context.subscriptions.add(
            combineLatest(configurationChanges, from(sourcegraph.workspace.openedTextDocuments)).subscribe(async () => {
                const editor = activeEditor()
                if (editor && editor.type === 'CodeEditor') {
                    await decorate(editor, null)
                }
            })
        )
    }

    // TODO: Unpublish decorations on previously (but not currently) open files when settings changes, to avoid a
    // brief flicker of the old state when the file is reopened.
    async function decorate(editor: sourcegraph.CodeEditor, selections: sourcegraph.Selection[] | null): Promise<void> {
        const settings = sourcegraph.configuration.get<Settings>().value
        try {
            editor.setDecorations(
                decorationType,
                await getBlameDecorations({
                    uri: editor.document.uri,
                    now: Date.now(),
                    settings,
                    selections,
                    sourcegraph,
                })
            )
        } catch (err) {
            console.error('Decoration error:', err)
        }
    }

    context.subscriptions.add(
        sourcegraph.commands.registerCommand(
            'git.blame.toggleDecorations',
            (decorations: 'none' | 'line' | 'file', isSourcegraphString: 'true' | 'false') => {
                const isSourcegraph: boolean = JSON.parse(isSourcegraphString)
                const settings = sourcegraph.configuration.get<Settings>()

                if (isSourcegraph) {
                    settings.update(
                        'git.blame.decorations',
                        decorations === 'none' ? 'line' : decorations === 'line' ? 'file' : 'none'
                    )
                } else {
                    // TODO: code host `observeSelections` functions are unused
                    // and/or incomplete, when decorations == 'line', we only decorate lines from
                    // the initial hash. for now, we toggle between 'file' and 'none' on code hosts
                    console.log(
                        'want to update decorations to ',
                        decorations === 'line' || decorations === 'file' ? 'none' : 'file'
                    )
                    settings.update(
                        'git.blame.decorations',
                        decorations === 'line' || decorations === 'file' ? 'none' : 'file'
                    )
                }
            }
        )
    )
}
