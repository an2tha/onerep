#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir/../ios/App"

# Bundler 4 requires Ruby 3.2 or newer. macOS still supplies Ruby 2.6.
supports_bundler() {
  "$1" -e 'exit(Gem::Version.new(RUBY_VERSION) >= Gem::Version.new("3.2") ? 0 : 1)' 2>/dev/null
}

if ! supports_bundler ruby; then
  ruby_prefix=""
  if command -v brew >/dev/null 2>&1; then
    ruby_prefix="$(brew --prefix ruby 2>/dev/null || true)"
  fi
  for ruby_bin in "${ruby_prefix:+$ruby_prefix/bin}" /opt/homebrew/opt/ruby/bin /usr/local/opt/ruby/bin; do
    if [[ -n "$ruby_bin" ]] && supports_bundler "$ruby_bin/ruby"; then
      export PATH="$ruby_bin:$PATH"
      break
    fi
  done
fi

if ! supports_bundler ruby; then
  echo "Screenshot automation requires Ruby 3.2 or newer. Install it with: brew install ruby" >&2
  exit 1
fi

bundler_version="$(awk '/^BUNDLED WITH$/ { getline; gsub(/[[:space:]]/, ""); print; exit }' Gemfile.lock)"
if ! bundle "_${bundler_version}_" --version >/dev/null 2>&1; then
  echo "Install the locked Bundler with the selected Ruby:" >&2
  echo "  $(command -v ruby) -S gem install bundler -v $bundler_version" >&2
  exit 1
fi

exec bundle "_${bundler_version}_" exec fastlane ios screenshots "$@"
