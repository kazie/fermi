{
  description = "Fermi: dev shell (direnv: `use flake`)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      formatter = forAllSystems (pkgs: pkgs.nixfmt);

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_26 # .node-version
            pnpm_12 # package.json's packageManager
            # FerMEANie's voice (FERMI_VOICE=1): the server runs the worker through uv, which pipes through ffmpeg
            uv
            python312 # apps/server/voice/.python-version
            ffmpeg-headless
          ];

          env = {
            # uv uses the Python above rather than downloading its own (those don't run on NixOS)
            UV_PYTHON = "${pkgs.python312}/bin/python3";
            UV_PYTHON_DOWNLOADS = "never";
            # The voice worker's wheels (onnxruntime, numpy) are built for ordinary Linux and need these at runtime
            LD_LIBRARY_PATH = pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux (
              pkgs.lib.makeLibraryPath [
                pkgs.stdenv.cc.cc.lib
                pkgs.zlib
              ]
            );
            # Playwright uses Nix's browsers; `pnpm exec playwright install` isn't needed (and wouldn't run on NixOS)
            # (Chromium only, as in CI: headless runs use its headless shell, --headed the full browser)
            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers.override {
              withFirefox = false;
              withWebkit = false;
            }}";
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          };

          # Nix's browsers only fit the Playwright version they were built for: say so when the two drift apart
          shellHook = ''
            pw_nix=${pkgs.playwright-driver.version}
            pw_npm=$(node -p "require('./node_modules/@playwright/test/package.json').version" 2>/dev/null || true)
            if [ -n "$pw_npm" ] && [ "$pw_npm" != "$pw_nix" ]; then
              echo "fermi: @playwright/test is $pw_npm but Nix's browsers are for $pw_nix; e2e may not find a browser" >&2
              echo "       (nix flake update, or wait for nixpkgs to catch up)" >&2
            fi
          '';
        };
      });
    };
}
