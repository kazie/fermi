// Cleanup that runs however a script ends: a normal exit, a crash, or a signal. A signal would otherwise end the process
// without an 'exit' event and skip it, so the first onExit() makes the usual signals exit instead (128 + the signal's
// number), unless the script handles that signal itself (`pnpm grow` does, and decides when to exit).

import { constants } from 'node:os'

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const

/** The exit code a shell reports for a process ended by `signal`. */
export const signalExitCode = (signal: NodeJS.Signals) => 128 + constants.signals[signal]

const cleanups = new Set<() => void>()

/** Runs `fn` (synchronous) when the process exits; returns a function that cancels it. */
export function onExit(fn: () => void): () => void {
  if (!installed) install()
  cleanups.add(fn)
  return () => cleanups.delete(fn)
}

let installed = false
function install() {
  installed = true
  process.on('exit', () => cleanups.forEach((fn) => fn()))
  for (const signal of SIGNALS) {
    process.on(signal, () => {
      if (process.listenerCount(signal) === 1) process.exit(signalExitCode(signal))
    })
  }
}
