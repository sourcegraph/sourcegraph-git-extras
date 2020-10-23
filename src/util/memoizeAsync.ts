/**
 * Creates a function that memoizes the async result of func. If the Promise is rejected, the result will not be
 * cached.
 *
 * @param toKey etermines the cache key for storing the result based on the first argument provided to the memoized
 * function
 */
export function memoizeAsync<P, T>(
    func: (parameters: P) => Promise<T>,
    toKey: (parameters: P) => string
): (parameters: P) => Promise<T> {
    const cache = new Map<string, Promise<T>>()
    return (parameters: P) => {
        const key = toKey(parameters)
        const hit = cache.get(key)
        if (hit) {
            return hit
        }
        const promise = func(parameters)
        promise.then(null, () => cache.delete(key))
        cache.set(key, promise)
        return promise
    }
}
