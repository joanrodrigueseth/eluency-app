/** Bounded requests, including response-body reads. Cancellation still follows the caller. */
export async function requestWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<Response> {
  const controller = new AbortController();
  const external = init.signal;
  let fail: (error: Error) => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => { fail = reject; });
  const abort = () => {
    controller.abort();
    const error = new Error("Request cancelled"); error.name = "AbortError"; fail(error);
  };
  external?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    controller.abort();
    fail(new Error("The request timed out. Check your connection and try again."));
  }, timeoutMs);
  try {
    if (external?.aborted) { const error = new Error("Request cancelled"); error.name = "AbortError"; throw error; }
    return await Promise.race([interrupted, (async () => {
      const response = await fetch(url, { ...init, signal: controller.signal });
      // Fetch resolves at headers; buffer the body before releasing the deadline.
      const body = await response.text();
      return new Response(body || null, { status: response.status, statusText: response.statusText, headers: response.headers });
    })()]);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}

/** A draft is best-effort: final submission already carries the complete answer set. */
export async function waitForDraftSave(draft: Promise<unknown>, timeoutMs = 1500): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([draft.catch(() => {}), new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
