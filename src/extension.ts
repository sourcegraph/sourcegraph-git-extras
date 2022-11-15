import { BehaviorSubject, combineLatest, from } from 'rxjs'
import { filter, map, switchMap } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { getBlameDecorations, getBlameStatusBarItem, queryBlameHunks } from './blame'

export interface Settings {
    ['git.blame.decorations']?: 'none' | 'line' | 'file'
    // The following two settings are deprecated, but we will still look for them
    // to 'onboard' users to new setting
    ['git.blame.lineDecorations']?: boolean
    ['git.blame.decorateWholeFile']?: boolean
    ['git.blame.showPreciseDate']?: boolean
}

const decorationType = sourcegraph.app.createDecorationType && sourcegraph.app.createDecorationType()

const statusBarItemType = sourcegraph.app.createStatusBarItemType && sourcegraph.app.createStatusBarItemType()

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
        const decorations = settings['git.blame.decorations'] || 'none'
        const shouldQueryBlameHunks = decorations === 'file' || (decorations === 'line' && selections?.length)

        try {
            const hunks = shouldQueryBlameHunks ? await queryBlameHunks({ uri: editor.document.uri, sourcegraph }) : []
            const now = Date.now()

            // Check if the extension host supports status bar items (Introduced in Sourcegraph version 3.26.0).
            // If so, display blame info for the first selected line in the status bar.
            if ('setStatusBarItem' in editor) {
                editor.setStatusBarItem(
                    statusBarItemType,
                    getBlameStatusBarItem({ selections, hunks, now, settings, sourcegraph })
                )
            }

            editor.setDecorations(
                decorationType,
                getBlameDecorations({
                    hunks,
                    now,
                    settings,
                    selections,
                    sourcegraph,
                })
            )
        } catch (err) {
            console.error('Decoration/status bar error:', err)
        }
    }
}
