// Only the welcome pool is bundled; the rest of the lines are picked on the server.
import welcome from '../../../../content/fermeanie/welcome.ftl'

export { welcome }

/** A random welcome line for the name screen. `rand` is injectable so stories and tests stay deterministic. */
export function pickWelcome(rand: () => number = Math.random): string {
  return welcome[Math.floor(rand() * welcome.length)] ?? ''
}
