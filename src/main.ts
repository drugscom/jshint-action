import * as core from '@actions/core'
import * as fs from 'fs'
import * as glob from '@actions/glob'
import * as path from 'path'
import * as utils from '@actions/utils'
import {JSHINT} from 'jshint'
import {issueCommand} from '@actions/core/lib/command'
import stripJsonComments from 'strip-json-comments'

function findFile(
  name: string,
  cwd: string = process.env['GITHUB_WORKSPACE'] ? process.env['GITHUB_WORKSPACE'] : process.cwd()
): string | void {
  const fileName = path.normalize(path.join(cwd, name))

  if (utils.fileExist(fileName)) {
    return fileName
  }

  const parent = path.resolve(cwd, '..')
  if (parent === cwd) {
    return
  }

  return findFile(name, parent)
}

async function run(): Promise<void> {
  try {
    const paths = utils.getInputAsArray('path')
    let config = {}

    core.startGroup('Load jshint configuration')
    const cfgFile = findFile('.jshintrc')
    if (cfgFile) {
      core.debug(`Loading jshint configuration from "${cfgFile}"`)
      config = JSON.parse(stripJsonComments(fs.readFileSync(cfgFile, 'utf8')))
    }
    core.endGroup()

    core.startGroup('Process files')
    for (const searchPath of paths) {
      const files = await (await glob.create(searchPath, {matchDirectories: false, implicitDescendants: false})).glob()

      for (let file of files) {
        file = path.relative(process.env['GITHUB_WORKSPACE'] ? process.env['GITHUB_WORKSPACE'] : process.cwd(), file)

        core.debug(`Processing "${file}"`)
        const data = fs.readFileSync(file, 'utf8')
        if (JSHINT(data, config)) {
          continue
        }

        for (const error of JSHINT.errors) {
          let level = 'info'

          if (error.code.startsWith('W')) {
            level = 'warning'
          } else if (error.code.startsWith('E')) {
            level = 'error'
            process.exitCode = core.ExitCode.Failure
          }

          if (level !== 'info') {
            issueCommand(level, {file, line: error.line, col: error.character}, error.reason)
          }
          core.info(`${file}:${error.line}:${error.character}: ${error.reason} (${error.code})`)
        }
      }
    }
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}

void run()
