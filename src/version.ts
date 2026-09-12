declare const RECON_VERSION: string
declare const RECON_TARGET: string

export const version = typeof RECON_VERSION === "undefined" ? "development" : RECON_VERSION
export const buildTarget = typeof RECON_TARGET === "undefined" ? "development" : RECON_TARGET

export const docsUrl = (): string =>
  version === "development"
    ? "https://github.com/vestia-dev/recon/blob/main/README.md"
    : `https://github.com/vestia-dev/recon/blob/v${version}/README.md`
