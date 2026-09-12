import { readFile } from "node:fs/promises"
import { arch, platform } from "node:os"

interface PackageJson {
  readonly version: string
}

const packageJson: PackageJson = JSON.parse(await readFile("package.json", "utf8"))
const targetFlag = process.argv.find((argument) => argument.startsWith("--target="))
const outfileFlag = process.argv.find((argument) => argument.startsWith("--outfile="))
const bunTarget = targetFlag?.slice("--target=".length)
const localTarget = `${platform() === "darwin" ? "darwin" : platform() === "win32" ? "windows" : "linux"}-${arch() === "arm64" ? "arm64" : "x64"}`
const releaseTarget = bunTarget?.replace(/^bun-/, "") ?? localTarget
const outfile = outfileFlag?.slice("--outfile=".length) ?? "dist/recon"

const result = await Bun.build({
  entrypoints: ["src/cli.ts"],
  compile: {
    ...(bunTarget ? { target: bunTarget as Bun.Build.CompileTarget } : {}),
    outfile,
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
  define: {
    RECON_VERSION: JSON.stringify(packageJson.version),
    RECON_TARGET: JSON.stringify(releaseTarget),
  },
  minify: true,
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exitCode = 1
}
