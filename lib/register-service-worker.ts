export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    })

    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" })
    }

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing
      if (!installing) return

      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          installing.postMessage({ type: "SKIP_WAITING" })
        }
      })
    })

    return registration
  } catch {
    return null
  }
}
