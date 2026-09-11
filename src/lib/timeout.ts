/** Bound read-only requests; never use this to retry or cancel a wallet mutation. */
export async function withReadTimeout<T>(read: Promise<T>, ms = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([read, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Read timed out. Refresh the wallet or retry verification.')), ms)
    })])
  } finally { clearTimeout(timer) }
}
