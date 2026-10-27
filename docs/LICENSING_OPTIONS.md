# License options for the Kamino team

**Decision pending. This document does not apply a license.** No root `LICENSE`
or package license declaration has been added. Agree on the choice with the
contributors and resolve the [third-party inventory](THIRD_PARTY.md) before
publishing a licensed release.

| Option | Reuse model | Main obligations | Why choose it |
| --- | --- | --- | --- |
| **MIT** | Permissive, including commercial use and closed-source derivatives | Retain copyright and license notices | Short, familiar terms and minimal reuse friction |
| **Apache-2.0** | Permissive, including commercial use and closed-source derivatives; express contributor patent grant | Include license, preserve applicable notices, identify changed files, carry NOTICE attribution if supplied | Explicit patent terms and a structured fit for reusable engineering tooling |
| **GPL-3.0** | Strong copyleft; commercial use is allowed | Conveyed covered derivatives generally need corresponding source under GPL terms; preserve notices and identify changes | Keep distributed derivatives of the covered program open under the same terms |

**My recommendation for discussion: Apache-2.0** if the team wants broad reuse
with explicit patent terms; **MIT** if simplicity is the main preference.
Choose GPL-3.0 only if keeping distributed derivatives under copyleft is an
intentional team goal. GPL is not a ban on commercial use, and network use alone
does not generally trigger its source-distribution condition.

This is a summary for choosing among standard texts, not a completed compatibility
opinion. A root license must not erase upstream licenses, grant rights to user
uploads, or assume rights in provider-generated assets or third-party branding.

## Decisions to record

1. Team agreement on MIT, Apache-2.0 or GPL-3.0, with the actual copyright holders.
2. Scope for original code, documentation and original synthetic examples.
3. Separate treatment of third-party models, generated meshes, design/media and trademarks.
4. After agreement: add the unmodified standard license with correct notices,
   update package metadata/README, resolve inventory questions and publish a tagged release.

## Primary texts and guidance

- [MIT text](https://choosealicense.com/licenses/mit/).
- [Apache-2.0 text](https://www.apache.org/licenses/LICENSE-2.0), especially sections 3–6.
- [GPL-3.0 text](https://www.gnu.org/licenses/gpl-3.0.html), especially sections 0 and 4–6.
- [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

The source is public now; visibility alone does not grant general reuse rights.
The team can review these options while release-readiness work continues.
