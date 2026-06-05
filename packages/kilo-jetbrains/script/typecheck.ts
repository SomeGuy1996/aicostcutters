#!/usr/bin/env bun

import { join } from "node:path"

const root = join(import.meta.dir, "..")

const hasJava = Bun.which("java") !== null || process.env.JAVA_HOME !== undefined

if (!hasJava) {
  console.warn("[jetbrains-typecheck] Java not found (no java in PATH, no JAVA_HOME set). Skipping Gradle typecheck.")
  process.exit(0)
}

const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew"
const args = ["typecheck"]
const cmd = process.platform === "win32" ? ["cmd.exe", "/c", gradlew, ...args] : [gradlew, ...args]

const proc = Bun.spawn(cmd, {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
})

const code = await proc.exited
process.exit(code)
