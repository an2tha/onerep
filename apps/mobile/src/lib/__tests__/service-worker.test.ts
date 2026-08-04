import { describe, expect, test } from "bun:test"
import {
  activateWaitingServiceWorker,
  canUseAppServiceWorker,
  registerAppServiceWorker,
  reloadWhenServiceWorkerControlsPage,
  unregisterAppServiceWorker,
  type AppServiceWorkerContainer,
  type AppServiceWorkerRegistration,
} from "../service-worker"

function withWindow<T>(windowValue: unknown, fn: () => T): T {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  })

  try {
    return fn()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow)
    } else {
      Reflect.deleteProperty(globalThis, "window")
    }
  }
}

function withNavigator<T>(navigatorValue: unknown, fn: () => T): T {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator"
  )
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: navigatorValue,
  })

  try {
    return fn()
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator)
    } else {
      Reflect.deleteProperty(globalThis, "navigator")
    }
  }
}

describe("service worker helpers", () => {
  test("detects support only in secure browser contexts", () => {
    withWindow({ isSecureContext: true }, () => {
      withNavigator({ serviceWorker: { register: async () => ({}) } }, () => {
        expect(canUseAppServiceWorker()).toBe(true)
      })
    })

    withWindow({ isSecureContext: false }, () => {
      withNavigator({ serviceWorker: { register: async () => ({}) } }, () => {
        expect(canUseAppServiceWorker()).toBe(false)
      })
    })

    withWindow({ isSecureContext: true }, () => {
      withNavigator({}, () => {
        expect(canUseAppServiceWorker()).toBe(false)
      })
    })
  })

  test("registers the app service worker and reports an already waiting update", async () => {
    const updates: AppServiceWorkerRegistration[] = []
    const registration: AppServiceWorkerRegistration = {
      waiting: {},
    }
    const serviceWorker: AppServiceWorkerContainer = {
      controller: {},
      register: async (url) => {
        expect(url).toBe("/sw.js")
        return registration
      },
    }

    await withWindow({ isSecureContext: true }, () =>
      withNavigator({ serviceWorker }, () =>
        registerAppServiceWorker({
          onUpdate: (nextRegistration) => updates.push(nextRegistration),
          serviceWorker,
        })
      )
    )

    expect(updates).toEqual([registration])
  })

  test("reports an update when an installing worker reaches installed", async () => {
    let updateFound: (() => void) | null = null
    let stateChange: (() => void) | null = null
    const installing = {
      state: "installing",
      addEventListener: (_type: "statechange", listener: () => void) => {
        stateChange = listener
      },
    }
    const registration: AppServiceWorkerRegistration = {
      installing,
      addEventListener: (_type: "updatefound", listener: () => void) => {
        updateFound = listener
      },
    }
    const serviceWorker: AppServiceWorkerContainer = {
      controller: {},
      register: async () => registration,
    }
    const updates: AppServiceWorkerRegistration[] = []

    await withWindow({ isSecureContext: true }, () =>
      withNavigator({ serviceWorker }, () =>
        registerAppServiceWorker({
          onUpdate: (nextRegistration) => updates.push(nextRegistration),
          serviceWorker,
        })
      )
    )

    updateFound?.()
    installing.state = "installed"
    stateChange?.()

    expect(updates).toEqual([registration])
  })

  test("swallows registration failures and calls onError", async () => {
    const errors: unknown[] = []
    const expectedError = new Error("registration failed")
    const serviceWorker: AppServiceWorkerContainer = {
      register: async () => {
        throw expectedError
      },
    }

    const result = await withWindow({ isSecureContext: true }, () =>
      withNavigator({ serviceWorker }, () =>
        registerAppServiceWorker({
          onError: (error) => errors.push(error),
          serviceWorker,
        })
      )
    )

    expect(result).toBeNull()
    expect(errors).toEqual([expectedError])
  })

  test("activates a waiting worker with skip waiting", () => {
    const messages: unknown[] = []
    activateWaitingServiceWorker({
      waiting: { postMessage: (message) => messages.push(message) },
    })

    expect(messages).toEqual([{ type: "SKIP_WAITING" }])
  })

  test("reloads once when the service worker starts controlling the page", () => {
    let controllerChange: (() => void) | null = null
    let reloadCount = 0
    const serviceWorker: AppServiceWorkerContainer = {
      controller: {},
      register: async () => ({}),
      addEventListener: (_type: "controllerchange", listener: () => void) => {
        controllerChange = listener
      },
    }

    reloadWhenServiceWorkerControlsPage(serviceWorker, () => {
      reloadCount += 1
    })

    controllerChange?.()
    controllerChange?.()

    expect(reloadCount).toBe(1)
  })

  test("does not reload when the first worker claims an uncontrolled page", () => {
    let controllerChange: (() => void) | null = null
    let reloadCount = 0
    const serviceWorker: AppServiceWorkerContainer = {
      controller: null,
      register: async () => ({}),
      addEventListener: (_type: "controllerchange", listener: () => void) => {
        controllerChange = listener
      },
    }

    reloadWhenServiceWorkerControlsPage(serviceWorker, () => {
      reloadCount += 1
    })
    controllerChange?.()

    expect(reloadCount).toBe(0)
  })
})

describe("unregisterAppServiceWorker", () => {
  function fakeCaches(keys: string[]) {
    const deleted: string[] = []
    return {
      deleted,
      storage: {
        keys: async () => keys,
        delete: async (key: string) => {
          deleted.push(key)
          return true
        },
      },
    }
  }

  test("unregisters every worker and drops only our caches", async () => {
    const unregistered: string[] = []
    const serviceWorker = {
      register: async () => ({}),
      getRegistrations: async () => [
        {
          unregister: async () => {
            unregistered.push("app")
            return true
          },
        },
        {
          unregister: async () => {
            unregistered.push("stale")
            return true
          },
        },
      ],
    } as unknown as AppServiceWorkerContainer
    // Anything not prefixed onerep-app- belongs to code we do not control.
    const caches = fakeCaches(["onerep-app-v3", "onerep-app-v2", "other-cache"])

    const removed = await unregisterAppServiceWorker(
      serviceWorker,
      caches.storage
    )

    expect(removed).toBe(true)
    expect(unregistered).toEqual(["app", "stale"])
    expect(caches.deleted).toEqual(["onerep-app-v3", "onerep-app-v2"])
  })

  test("reports nothing removed when there is no worker", async () => {
    const caches = fakeCaches([])
    const removed = await unregisterAppServiceWorker(null, caches.storage)

    expect(removed).toBe(false)
    expect(caches.deleted).toEqual([])
  })

  test("survives a container without getRegistrations", async () => {
    const caches = fakeCaches(["onerep-app-v3"])
    const serviceWorker = {
      register: async () => ({}),
    } as unknown as AppServiceWorkerContainer

    await expect(
      unregisterAppServiceWorker(serviceWorker, caches.storage)
    ).resolves.toBe(true)
    expect(caches.deleted).toEqual(["onerep-app-v3"])
  })
})
