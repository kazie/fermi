import type { FermeanieRelease } from '@fermi/shared'

/** What the speech bubble shows: FerMEANie's version and, from its fifth win, its pie codename. */
export type Release = Pick<FermeanieRelease, 'version' | 'codename'>

/** FerMEANie's version as shown in its speech bubble: `v3.141592… · Cherry Pie`. */
export const versionTag = (f: Release) => (f.codename ? `${f.version} · ${f.codename}` : f.version)
