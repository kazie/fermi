// What a run's environment changes, shared by the Playwright config and the tests.

/** FERMI_TIME_SCALE=1 to watch a game at real speed; the tests run at 0.25. */
export const TIME_SCALE = Number(process.env.FERMI_TIME_SCALE) || 0.25
/** How many times longer than the tests' default everything takes. */
export const SLOWER = Math.max(1, TIME_SCALE / 0.25)
