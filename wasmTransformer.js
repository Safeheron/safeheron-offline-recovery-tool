const path = require('path')
const fs = require('fs')

module.exports = {
  process(filename) {
    const wasmPath = path.join(process.cwd(), filename)

    const buffer = fs.readFileSync(wasmPath)

    return buffer
  }
}
