/* eslint-disable no-console */
import Bun from 'bun'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const target = process.argv.slice(2)[0] ?? 'node'
if (process.env['DEBUG']) {
  console.log(`Target: ${target}`)
}

const getTsRecursive = (path: string) => {
  const files = readdirSync(path)

  // eslint-disable-next-line functional/prefer-readonly-type
  let tsFiles: string[] = []

  // eslint-disable-next-line no-restricted-syntax
  for (const file of files) {
    const filepath = join(path, file)
    const tat = statSync(filepath)

    if (tat.isDirectory()) {
      tsFiles = [...tsFiles, ...getTsRecursive(filepath)]
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts')) {
      tsFiles = [...tsFiles, filepath]
    }
  }

  return tsFiles
}

void Bun.build({
  entrypoints: getTsRecursive(process.cwd()),
  target: 'bun',
  outdir: '.',
}).then((stdout) => {
  if (stdout.logs.length > 0) {
    console.log(stdout.logs)
  }
  if (process.env['DEBUG']) {
    if (stdout.success) {
      console.log('success!')
    }
    if (stdout.outputs.length > 0) {
      console.log(stdout.outputs.map((output) => output.path.replace(process.cwd(), '')).join('\n'))
    }
  }
}, (err) => {
  console.error(err)
})
