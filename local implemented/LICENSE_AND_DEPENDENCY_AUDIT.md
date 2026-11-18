# Current dependency and license inventory

Observed from `package.json`, `package-lock.json` and installed artifact metadata/notices during the repository reorganization on 17 November 2026. This is an engineering inventory; it does not select the project's license or certify commercial compliance/security.

The lockfile contains **38 package entries**: **19 installed** on this Linux x64 environment and 19 uninstalled platform-specific TypeScript packages. The license identifiers across all locked entries are Apache-2.0 (25), MIT (12) and 0BSD (1). Uninstalled-package identifiers come from lock metadata, not inspection of their full artifacts.

| Packages and exact versions | Scope | Declared license | Installed notice evidence |
| --- | --- | --- | --- |
| `proxy-chain@3.0.3` | Direct runtime | Apache-2.0 | LICENSE |
| `ipaddr.js@2.3.0` | Direct runtime | MIT | LICENSE |
| `agent-base@9.0.0`, `debug@4.4.3`, `ip-address@10.7.6`, `ms@2.1.3`, `smart-buffer@4.2.0`, `socks@2.8.10`, `socks-proxy-agent@10.1.0` | Transitive runtime | MIT | LICENSE or license.md |
| `tslib@2.9.1` | Transitive runtime | 0BSD | LICENSE.txt |
| `@playwright/test@1.65.0`, `playwright@1.65.0`, `playwright-core@1.65.0` | Development/browser testing | Apache-2.0 | LICENSE and NOTICE |
| `typescript@7.0.2`, installed `@typescript/typescript-linux-x64@7.0.2` | Development/compiler | Apache-2.0 | LICENSE and NOTICE.txt |
| Other optional `@typescript/typescript-*` packages at `7.0.2` | Other compiler platforms | Apache-2.0 | Lock metadata only; not installed |
| `@types/chrome@0.3.7`, `@types/node@24.19.2`, `@types/har-format@1.2.16`, `undici-types@7.24.6` | Development/types | MIT | LICENSE |

MIT requires retaining the copyright and permission notice. Apache-2.0 requires its license and applicable notices, and identification of modifications when relevant. 0BSD has no attribution condition; retain its license as provenance. Check actual terms for the artifact and distribution being prepared.

`scripts/packaging/package.mjs` includes installed runtime dependency license texts and any NOTICE files in the private extension archive. Those server dependencies are not bundled as extension executable code. Packaging refuses a missing required installed license file; preserve notices in separate service distributions as well.

Node **24.22.1**, OpenSSL, SQLite, Python, Chromium and other platform tools have their own upstream and bundled third-party terms. They are not licensed by the npm inventory. CI uses checksum-pinned Gitleaks **8.30.1** (MIT); retaining or redistributing that binary requires its own applicable notices. No new paid service or npm dependency is introduced by the reorganization.

Mullvad and Amnezia native archives retain their original licenses and notices separately. They are not integrated into the browser proxy. Their transitive source, binary, submodule and asset licensing needs a new per-artifact audit before native integration or distribution; the root GPL license alone is insufficient. See [LICENSING.md](LICENSING.md).

After a dependency change, use `npm ci --ignore-scripts`, inspect installed metadata/license/NOTICE files and all lockfile additions, run the relevant tests and registry advisory check, and record the results in [STATUS.md](STATUS.md). An `npm audit` or secret scan result is a bounded signal, not a comprehensive security audit. Historic advisory results are not current clearance.

The [full earlier package inventory](../AnalyseFuture/previous-docs/DEPENDENCY_LICENSE_MATRIX.md) and [earlier candidate review](../AnalyseFuture/previous-docs/LICENSE_AND_DEPENDENCY_AUDIT.md) remain available for provenance; version recommendations and status claims there are dated.
