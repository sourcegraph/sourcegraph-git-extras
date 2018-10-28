/**
 * Resolve a URI of the forms git://github.com/owner/repo?rev#path and file:///path to an absolute reference, using
 * the given base (root) URI.
 */
export function resolveURI(uri: string): { repo: string; rev: string; path: string } {
    const url = new URL(uri)
    if (url.protocol === 'git:') {
        return {
            repo: (url.host + url.pathname).replace(/^\/*/, '').toLowerCase(),
            rev: url.search.slice(1).toLowerCase(),
            path: url.hash.slice(1),
        }
    }
    throw new Error(`unrecognized URI: ${JSON.stringify(uri)} (supported URI schemes: git)`)
}
