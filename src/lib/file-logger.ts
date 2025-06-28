import dayjs from "dayjs"
import fs from 'fs/promises'

export class FileLogger {
  filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  public async log(...args: any[]) {
    const timestamp = dayjs().format("YYYY-MM-DD_HH-mm-ss")
    const msgs = args.map(arg => arg.toString ? arg.toString() : arg).join(' ')
    await fs.appendFile(this.filePath, `${timestamp} ${msgs}\n`, { encoding: 'utf8' })
  }
}

let fileLogger: FileLogger

export function setupFileLogger(filePath: string) {
  fileLogger = new FileLogger(filePath)
}

export function getFileLogger() {
  return fileLogger
}
