import { uniqueId } from 'lodash'
import { Subject, Subscription } from 'rxjs'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import { MarkupKind } from 'vscode-languageserver-types'

const URI = URL
type URI = URL
class Position {
    constructor(public line: number, public character: number) {}
}
class Range {
    constructor(public start: Position, public end: Position) {}
}
class Location {
    constructor(public uri: URI, public range: Range) {}
}
class Selection extends Range {
    constructor(public anchor: Position, public active: Position) {
        super(anchor, active)
    }
}

/**
 * Creates an object that (mostly) implements the Sourcegraph API,
 * with all methods being Sinon spys and all Subscribables being Subjects.
 */
export const createMockSourcegraphAPI = (sourcegraphURL?: string) => {
    const rootChanges = new Subject<void>()
    // const shims: typeof import('sourcegraph') = {
    const openedTextDocuments = new Subject<sourcegraph.TextDocument>()
    return {
        internal: {
            sourcegraphURL: sourcegraphURL || 'https://sourcegraph.test',
        },
        URI,
        Position,
        Range,
        Location,
        Selection,
        MarkupKind,
        workspace: {
            onDidOpenTextDocument: openedTextDocuments,
            openedTextDocuments,
            textDocuments: [] as sourcegraph.TextDocument[],
            onDidChangeRoots: rootChanges,
            rootChanges,
            roots: [] as sourcegraph.WorkspaceRoot[],
        },
        languages: {
            registerHoverProvider: sinon.spy(
                (
                    selector: sourcegraph.DocumentSelector,
                    provider: {
                        provideHover: (
                            textDocument: sourcegraph.TextDocument,
                            position: Position
                        ) => Promise<sourcegraph.Hover | null>
                    }
                ) => new Subscription()
            ),
            registerDefinitionProvider: sinon.spy(
                (
                    selector: sourcegraph.DocumentSelector,
                    provider: {
                        provideDefinition: (
                            textDocument: sourcegraph.TextDocument,
                            position: Position
                        ) => Promise<sourcegraph.Definition>
                    }
                ) => new Subscription()
            ),
            registerLocationProvider: sinon.spy(
                (
                    selector: sourcegraph.DocumentSelector,
                    provider: {
                        provideLocations: (
                            textDocument: sourcegraph.TextDocument,
                            position: Position
                        ) => Promise<sourcegraph.Definition>
                    }
                ) => new Subscription()
            ),
            registerReferenceProvider: sinon.spy(
                (
                    selector: sourcegraph.DocumentSelector,
                    provider: {
                        provideReferences: (
                            textDocument: sourcegraph.TextDocument,
                            position: Position,
                            context: sourcegraph.ReferenceContext
                        ) => Promise<sourcegraph.Location[]>
                    }
                ) => new Subscription()
            ),
            registerTypeDefinitionProvider: sinon.spy(
                (
                    selector: sourcegraph.DocumentSelector,
                    provider: {
                        provideTypeDefinition: (
                            textDocument: sourcegraph.TextDocument,
                            position: Position
                        ) => Promise<sourcegraph.Definition>
                    }
                ) => new Subscription()
            ),
            registerImplementationProvider: sinon.spy(
                (
                    selector: sourcegraph.DocumentSelector,
                    provider: {
                        provideImplementation: (
                            textDocument: sourcegraph.TextDocument,
                            position: Position
                        ) => Promise<sourcegraph.Definition>
                    }
                ) => new Subscription()
            ),
        },
        app: {
            createDecorationType: () => ({ key: uniqueId('decorationType') }),
        },
        configuration: {},
        search: {},
        commands: {},
    }
}
