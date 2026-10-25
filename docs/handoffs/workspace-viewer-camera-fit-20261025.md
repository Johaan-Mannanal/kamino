# Workspace viewer restoration — Master camera-fit correction

Combined source is based on live 936b4ca236d2d1c540bf79c23261ea94ba017b38 plus restoration delivery 05f24259276dc2c4119a2e3ea6b984f6c934ba8b. Latest automatic friction, optional cropping and demo/session copy are preserved. The isolated combination reconciles only the Workspace template and friction-test conflicts. Target-review removal remains separate user-owned work.

## Resolved P2

Initial framing and Reset use the actual viewport aspect and both horizontal and vertical field of view. The centered mesh bounds are enclosed by a sphere with a 10% fit margin; retain the existing wide-view distance when it is already sufficient. Initial fitting runs after canvas dimensions are set. Reset also handles a changed host size before its resize observer fires. Camera restoration during edits still uses retained direction, pan and relative zoom. Existing inertia flushing is unchanged.

The regression failed before the fix: projected X was 1.397 in a 201x427 canvas and 1.012 in a 390x600 canvas (visible bounds are -1 to 1). New tests check all mesh vertices at initial load and after Reset, including resizing to 160 px before the observer callback.

## Verification

- 118 legacy frontend tests + 138 Workspace tests = 256 passed; both TypeScript checks and production builds passed. Existing large-bundle warnings remain.
- Real WebGL browser checks at 390, 760, 761, 1024 and 1440 px: all geometry vertices within projected bounds after Reset, controls reachable, no document horizontal overflow. Studio/Mesh materials, photo enlargement, pointer orbit/Shift-pan/wheel zoom retention through orientation preview and locally replayed orientation Save passed.
- Browser API responses and orientation Save were local fixtures. No provider calls, actual backend writes or deployment. Backend/physical acceptance is not claimed. Existing installed dependencies were reused by symlink, not freshly installed.
- Independent screenshots/results and incremental patch: primary checkout outputs/viewer-camera-fit-fix-20261025. Previous failing review evidence remains unchanged.

This closes the narrow-camera finding from outputs/viewer-master-review-20261025/REVIEW.md. The combined candidate is committed locally, not pushed or deployed. Production and the other checkout's uncommitted backend work are unchanged.
