#!/bin/bash
# Qore installer - downloads the latest binary release from GitHub
set -e

REPO="Kodjaoglanian/qore"
INSTALL_DIR="${HOME}/.local/bin"
BINARY_NAME="qore"

echo ""
echo "  Qore - Infrastructure Orchestrator"
echo ""

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux*)  OS="linux" ;;
  darwin*) OS="darwin" ;;
  *) echo "  Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "  Unsupported architecture: $ARCH"; exit 1 ;;
esac

ASSET_NAME="qore-${OS}-${ARCH}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Check if existing install needs update
if [ -f "${INSTALL_DIR}/${BINARY_NAME}" ]; then
  echo "  Existing Qore installation found. Updating..."
fi

# Download the binary
echo "  Downloading Qore for ${OS}/${ARCH}..."
if command -v curl &> /dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "${INSTALL_DIR}/${BINARY_NAME}"
else
  wget -q "$DOWNLOAD_URL" -O "${INSTALL_DIR}/${BINARY_NAME}"
fi

chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

echo ""
echo "  Installed to: ${INSTALL_DIR}/${BINARY_NAME}"
echo ""

# Check if install dir is in PATH
case ":$PATH:" in
  *":${INSTALL_DIR}:"*)
    echo "  Qore is ready. Run: qore"
    ;;
  *)
    echo "  Add ${INSTALL_DIR} to your PATH:"
    echo ""
    echo "    export PATH=\"${INSTALL_DIR}:\$PATH\""
    echo ""
    echo "  Add it permanently by appending that line to your ~/.bashrc or ~/.zshrc"
    ;;
esac

echo ""
echo "  To update later, run: qore update"
echo ""
