# Run Kamino locally

The first success condition is a portable synthetic assembly passing motion and
relocation checks. It needs no API server, access code, Meshy/Gemini key or hardware.

## Tested environment

The release-readiness path targets **Intel macOS, Python 3.13, MuJoCo 3.3.7,
Node.js 22.19.0 and pnpm 11.25.0**. The constraints file records the full tested
Python dependency set. Python 3.12/Linux and Windows have earlier release evidence
in [RELEASE.md](RELEASE.md); those are separate results, not this clean-install run.
Do not use this Intel constraint set as a cross-platform lock.

## Install

```sh
git clone https://github.com/Johaan-Mannanal/kamino.git
cd kamino
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install -c constraints/macos-intel-py313.txt -e '.[dev,simulation]'
pnpm --dir frontend install --frozen-lockfile
pnpm --dir prototypes/kamino-ui install --frozen-lockfile
```

Use pnpm 11.25.0 (the packages' `packageManager` field). Keep your robot/LeRobot
environment separate. Installation downloads dependencies; running the example
afterward makes no external provider calls.

## Run the complete example

Follow [the hinged-panel guide](COMPLETE_EXAMPLE.md). Its extraction and validation
commands produce a fresh report and test a relocated copy. `passed: true` means
the saved synthetic assumptions passed those checks, not physical calibration.

## Open the local website

From the repository root with `.venv` active:

```sh
python -m tools.run_demo --frontend-port 5188
```

In a second terminal, from the same checkout:

```sh
pnpm --dir prototypes/kamino-ui dev
```

Open **http://127.0.0.1:5188**. For server jobs, enter the temporary application
token printed by the local launcher in **Generation access**. It ignores `.env`,
uses mock reconstruction and makes no provider calls. The browser's procedural
mug demo is separate and does not generate a validated simulation bundle.

To use Assembly, also run `pnpm --dir frontend dev` and use
[the assembly demo guide](DEMO.md), including the allowed frontend origin.
Real provider setup is documented separately in [ENVIRONMENT.md](ENVIRONMENT.md).

[Contributing and all checks](../CONTRIBUTING.md) · [Documentation index](README.md)
