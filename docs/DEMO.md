# Local demo startup

This runs the generic component-mesh assembly workflow with real MuJoCo processing.
The photo tab uses a labeled synthetic reconstruction in this isolated mode; it
cannot demonstrate photos-to-geometry. No external API keys or provider calls are
needed. For the live photo pipeline use the normal [environment setup](ENVIRONMENT.md).

## Prepare once

From the repository root, use a separate Python 3.12 environment:

```sh
python3.12 -m venv .venv-sim
source .venv-sim/bin/activate
python -m pip install -e '.[dev,simulation]'
```

Windows: `py -3.12 -m venv .venv-sim`, then use
`.\.venv-sim\Scripts\python.exe` for the Python commands. Keep LeRobot separate.
Intel macOS was verified with Python 3.13.7 and MuJoCo 3.3.7; install with
`python -m pip install -e '.[dev,simulation]' 'mujoco==3.3.7'` in that environment.

With Node and pnpm available:

```sh
cd frontend
pnpm install --frozen-lockfile
```

The browser acceptance used Node 24.19.0 and the committed lockfile. The generated
bundle records the simulator version used for its checks.

## Start two terminals

Terminal 1, repository root with the Python environment active:

```sh
python tools/run_demo.py
```

This binds only to `127.0.0.1:8000`, ignores `.env`, uses mock reconstruction and
prints a temporary application token. Data persists in `outputs/local-demo`.
Only one server may use a data directory at a time. Use `--data-dir outputs/another-demo`
for a separate run; do not delete old evidence to restart.

Terminal 2:

```sh
cd frontend
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

The assembly workbench always calls the backend. Set
`VITE_API_BASE_URL=http://127.0.0.1:8000` in `frontend/.env.local` if local
configuration points elsewhere, then restart Vite. The separate photo tab defaults
to a UI-only mock; set `VITE_API_MODE=live` there to use real backend jobs (still
synthetic reconstruction with this launcher). Open
`http://127.0.0.1:5173/assembly.html`, expand **API access**, and paste the token
from Terminal 1. On backend restart, paste its new token. The page has **Open job**
for continuing a saved job; input geometry and revisions persist on disk.

## Rehearse the generic workflow

Follow the [hinged-panel example](../examples/assemblies/hinged-panel/README.md):
component meshes → guided grouping/joint review → failed tracking → correction →
new revision → passing original/relocated validation → authenticated ZIP download.
The input units are millimetres. Keep **Synthetic fixture** checked.

For SO101 use the existing reviewed candidate/package and its documented collision
policy; see [SO101 API workflow](../examples/assemblies/so101-guided/api-workflow/README.md).
Its CAD/template provenance and pending physical mapping remain visible. The
hinged panel proves the software workflow independently of that physical evidence.

Stop each terminal with Ctrl-C. No cloud deployment is needed for this local demo.
