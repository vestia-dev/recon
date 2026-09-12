#!/bin/sh
set -eu

repository="vestia-dev/recon"
release_root="https://github.com/$repository/releases"

if [ -n "${RECON_VERSION:-}" ]; then
  version="${RECON_VERSION#v}"
else
  latest_url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "$release_root/latest")
  version="${latest_url##*/v}"
fi

case "$(uname -s)" in
  Darwin) system="darwin" ;;
  Linux) system="linux" ;;
  *) echo "Recon does not support this operating system." >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) architecture="arm64" ;;
  x86_64|amd64) architecture="x64" ;;
  *) echo "Recon does not support this CPU architecture." >&2; exit 1 ;;
esac

libc=""
if [ "$system" = "linux" ] && ldd --version 2>&1 | grep -qi musl; then
  libc="-musl"
fi

artifact="recon-$system-$architecture$libc"
release="$release_root/download/v$version"
install_dir="${RECON_INSTALL_DIR:-$HOME/.local/bin}"
temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT INT TERM

curl -fsSL "$release/$artifact" -o "$temporary_dir/recon"
curl -fsSL "$release/checksums.txt" -o "$temporary_dir/checksums.txt"
expected=$(awk -v artifact="$artifact" '$2 == artifact { print $1 }' "$temporary_dir/checksums.txt")
if [ -z "$expected" ]; then
  echo "The release does not contain a checksum for $artifact." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$temporary_dir/recon" | awk '{ print $1 }')
else
  actual=$(shasum -a 256 "$temporary_dir/recon" | awk '{ print $1 }')
fi
if [ "$actual" != "$expected" ]; then
  echo "Checksum verification failed for $artifact." >&2
  exit 1
fi

mkdir -p "$install_dir"
chmod 755 "$temporary_dir/recon"
mv "$temporary_dir/recon" "$install_dir/recon"
echo "Installed Recon $version to $install_dir/recon"

case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) echo "Add $install_dir to PATH to run recon from any directory." ;;
esac
