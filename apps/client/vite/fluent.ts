import { basename } from 'node:path'
import type { Plugin } from 'vite'
import { loadStaticLines } from '@fermi/shared/lines'

/**
 * `import lines from '…/content/fermeanie/welcome.ftl'` gives the file's lines as strings, checked like
 * on the server. Only top-level files of categories without variables can be bundled this way.
 */
export function fluentPlugin(): Plugin {
  return {
    name: 'fermi-fluent',
    transform(source, id) {
      if (!id.endsWith('.ftl')) return // also leaves `?raw` and other queried imports alone
      const lines = loadStaticLines({ path: basename(id), source })
      return { code: `export default ${JSON.stringify(lines)}`, map: { mappings: '' } }
    },
  }
}
