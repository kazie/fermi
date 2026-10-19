/** FerMEANie's version as shown in its speech bubble: `v3.141592… · Cherry Pie`. */
export const versionTag = (f: { version: string; codename?: string }) => (f.codename ? `${f.version} · ${f.codename}` : f.version)
