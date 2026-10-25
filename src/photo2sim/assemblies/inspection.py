"""Check generated model geometry/frames/physics against the reviewed assembly."""

import hashlib
from xml.etree import ElementTree as ET

import mujoco
import numpy as np

from photo2sim.assemblies.contracts import joint_force_limit, joint_limits
from photo2sim.assemblies.export import TIMESTEP_S, local_mesh
from photo2sim.physics import (
    collision_parameters,
    contact_attributes,
    friction_parameters,
    inertia_parameters,
)


def require(value, message):
    if not value:
        raise ValueError(message)


def close(actual, expected, label, *, atol=1e-9):
    require(
        np.allclose(actual, expected, rtol=1e-6, atol=atol),
        f"{label} disagrees with reviewed inputs",
    )


def inspect_model(model, record, root, assumptions, scene):
    """Validate compiled frames, physical values and visual bounds; return hinge indices."""
    m = model
    xml = ET.parse(scene).getroot()
    for link in record.links:
        asset = xml.find(f"./asset/mesh[@name='mesh_{link.name}']")
        visual_xml = xml.find(f".//geom[@name='visual_{link.name}']")
        require(
            asset is not None and asset.get("file") == link.visual_mesh,
            "Visual mesh file disagrees with reviewed link",
        )
        require(
            set(asset.attrib) <= {"name", "file", "scale"},
            "Unsupported mesh transforms or attributes",
        )
        close([float(v) for v in asset.get("scale", "1 1 1").split()], [1, 1, 1], "Mesh scale")
        require(
            visual_xml is not None and visual_xml.get("mesh") == f"mesh_{link.name}",
            "Visual geom references wrong mesh asset",
        )
        require(
            assumptions["exported_meshes"][link.name] == link.visual_mesh,
            "Export mesh manifest disagrees with reviewed record",
        )
    mode = assumptions.get("collision_mode", "box")
    require(mode in {"box", "convex_mesh"}, "Unsupported collision mode")
    exclude = assumptions.get("exclude_joint_pairs", False)
    require(isinstance(exclude, bool), "Invalid collision policy")
    expected_pairs = [[j.parent, j.child] for j in record.joints] if exclude else []
    require(
        assumptions.get("excluded_joint_pairs", []) == expected_pairs,
        "Collision policy manifest mismatch",
    )
    actual_pairs = [[e.get("body1"), e.get("body2")] for e in xml.findall("./contact/exclude")]
    require(actual_pairs == expected_pairs, "Unexpected collision exclusions")
    require(not xml.findall("./contact/pair"), "Explicit contact overrides unsupported")
    require(int(m.opt.disableflags) == 0, "Simulation features disabled")
    require(m.ngeom == 2 * len(record.links) + 1, "Unexpected collision/visual geometry count")
    ground = m.geom("ground")
    require(
        int(ground.type[0]) == mujoco.mjtGeom.mjGEOM_PLANE and int(ground.bodyid[0]) == 0,
        "Invalid ground",
    )
    require(int(ground.contype[0]) == int(ground.conaffinity[0]) == 1, "Ground contact disabled")
    close(ground.pos, [0, 0, 0], "Ground position")
    close(abs(float(ground.quat[0])), 1, "Ground orientation")
    hinges = [j for j in record.joints if j.kind != "fixed"]
    driven = [j for j in hinges if j.drive is not None]
    require(
        m.nq == m.nv == len(hinges) and m.nu == len(driven), "Unexpected joint or actuator count"
    )
    coupled = [j for j in hinges if j.coupling is not None]
    require(m.neq == len(coupled), "Unexpected linked joint constraints")
    for j in coupled:
        eq = m.equality(f"linked_{j.name}")
        require(bool(m.eq_active0[eq.id]), "Linked joint equality disabled")
        require(eq.type[0] == mujoco.mjtEq.mjEQ_JOINT, "Expected linked joint equality")
        require(
            eq.obj1id[0] == m.joint(j.name).id
            and eq.obj2id[0] == m.joint(j.coupling.driver_joint).id,
            "Linked joint driver mismatch",
        )
        close(
            eq.data[:5], [j.coupling.offset, j.coupling.ratio, 0, 0, 0], "Linked joint ratio/offset"
        )
    require(m.nbody == len(record.links) + 1, "Unexpected link count")
    close(m.opt.timestep, TIMESTEP_S, "Timestep", atol=1e-12)
    close(m.opt.gravity, [0, 0, -9.81], "Gravity")
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    incoming = {j.child: j for j in record.joints}
    for link in record.links:
        path, mesh = local_mesh(root, link.visual_mesh)
        expected_sha = assumptions["links"][link.name]["source_mesh_sha256"]
        require(
            hashlib.sha256(path.read_bytes()).hexdigest() == expected_sha,
            "Mesh bytes disagree with export manifest",
        )
        body = m.body(link.name)
        joint = incoming.get(link.name)
        pose = joint.origin if joint else record.root_pose
        parent_id = m.body(joint.parent).id if joint else 0
        require(int(body.parentid[0]) == parent_id, "Link parent disagrees with record")
        close(body.pos, pose.position_m, "Link position")
        # q and -q describe the same rotation.
        close(abs(np.dot(body.quat, pose.quaternion_wxyz)), 1, "Link orientation")
        close(body.mass, link.mass_kg.value, "Link mass")
        centre = mesh.bounds.mean(axis=0)
        sides = mesh.extents
        inertia = link.mass_kg.value * (np.sum(sides**2) - sides**2) / 12
        link_mode = mode
        collision_sides, collision_centre = sides, centre
        if link.physics is not None:
            kind, collision_sides, offset = collision_parameters(link.physics, sides)
            if link.physics.collision is not None:
                link_mode = "convex_mesh" if kind == "convex_hull" else "box"
                collision_centre = centre + offset
            inertia_centre, inertia = inertia_parameters(link.physics, link.mass_kg.value, sides)
            expected_centre = (
                inertia_centre
                if link.physics.inertia and link.physics.inertia.mode == "manual"
                else centre + inertia_centre
            )
        else:
            expected_centre = centre
        close(body.ipos, expected_centre, "Inertia centre")
        close(abs(float(body.iquat[0])), 1, "Inertia orientation")
        close(body.inertia, inertia, "Link inertia", atol=1e-14)
        collision = m.geom(f"collision_{link.name}")
        require(int(collision.bodyid[0]) == body.id, "Collision belongs to wrong link")
        expected_type = (
            mujoco.mjtGeom.mjGEOM_BOX if link_mode == "box" else mujoco.mjtGeom.mjGEOM_MESH
        )
        require(int(collision.type[0]) == expected_type, "Collision type disagrees with policy")
        require(
            int(collision.contype[0]) == int(collision.conaffinity[0]) == 1,
            "Collision disabled",
        )
        if link_mode == "box":
            close(collision.pos, collision_centre, "Collision centre")
            close(abs(float(collision.quat[0])), 1, "Collision orientation")
            close(collision.size, collision_sides / 2, "Collision dimensions")
        else:
            visual_mesh = m.geom(f"visual_{link.name}")
            require(
                int(collision.dataid[0]) == int(visual_mesh.dataid[0]),
                "Collision must use visual mesh hull",
            )
            close(
                collision.pos,
                visual_mesh.pos + collision_centre - centre,
                "Collision mesh position",
            )
            close(abs(np.dot(collision.quat, visual_mesh.quat)), 1, "Collision mesh orientation")
        attrs = {"solref": ".02 1", **contact_attributes(link.physics)}
        close(
            collision.solref,
            [float(v) for v in attrs["solref"].split()],
            "Collision contact settings",
        )
        if "solimp" in attrs:
            close(
                collision.solimp, [float(v) for v in attrs["solimp"].split()], "Collision impedance"
            )
        close(collision.priority, int(attrs.get("priority", 0)), "Collision priority")
        friction = link.sliding_friction.value if link.sliding_friction is not None else 0.8
        friction_values, condim = friction_parameters(link.physics, friction)
        close(collision.friction, friction_values, "Friction")
        close(collision.condim, condim, "Contact dimensions")
        visual = m.geom(f"visual_{link.name}")
        require(int(visual.bodyid[0]) == body.id, "Visual belongs to wrong link")
        require(int(visual.type[0]) == mujoco.mjtGeom.mjGEOM_MESH, "Expected visual mesh")
        require(
            int(visual.contype[0]) == int(visual.conaffinity[0]) == 0,
            "Visual mesh must not collide",
        )
        mesh_id = int(visual.dataid[0])
        require(mesh_id == m.mesh(f"mesh_{link.name}").id, "Compiled visual uses wrong mesh")
        # Generated geoms have identity local placement. Only MuJoCo's internal
        # mesh centring/alignment may appear in the compiled transform. Bounds
        # alone cannot detect rotations of asymmetric hulls about their centre.
        close(visual.pos, m.mesh_pos[mesh_id], "Visual mesh position")
        close(abs(np.dot(visual.quat, m.mesh_quat[mesh_id])), 1, "Visual mesh orientation")
        start, count = int(m.mesh_vertadr[mesh_id]), int(m.mesh_vertnum[mesh_id])
        # MuJoCo centres/rotates its internal mesh representation. Undo the
        # compiled geom/world transforms to check vertices in original link space.
        world_vertices = (
            m.mesh_vert[start : start + count] @ d.geom_xmat[visual.id].reshape(3, 3).T
            + d.geom_xpos[visual.id]
        )
        local_vertices = (world_vertices - d.xpos[body.id]) @ d.xmat[body.id].reshape(3, 3)
        close(
            np.array([local_vertices.min(axis=0), local_vertices.max(axis=0)]),
            mesh.bounds,
            "Visual mesh bounds",
            atol=1e-7,
        )
    indices = []
    for j in hinges:
        jid = m.joint(j.name).id
        expected_type = (
            mujoco.mjtJoint.mjJNT_SLIDE if j.kind == "prismatic" else mujoco.mjtJoint.mjJNT_HINGE
        )
        require(m.jnt_type[jid] == expected_type, "Joint type mismatch")
        require(m.jnt_bodyid[jid] == m.body(j.child).id, "Joint belongs to wrong child")
        require(m.jnt_limited[jid], "Required joint limits disabled")
        close(m.jnt_pos[jid], [0, 0, 0], "Joint position")
        close(m.jnt_axis[jid], j.axis, "Joint axis")
        close(m.jnt_range[jid], joint_limits(j), "Joint limits")
        close(m.qpos0[m.jnt_qposadr[jid]], 0, "Joint reference")
        close(m.dof_damping[m.jnt_dofadr[jid]], j.damping.value, "Joint damping")
        close(m.jnt_stiffness[jid], j.spring.stiffness if j.spring else 0, "Spring stiffness")
        close(m.qpos_spring[m.jnt_qposadr[jid]], j.spring.rest if j.spring else 0, "Spring rest")
        if j.drive is None:
            continue
        aid = m.actuator(f"drive_{j.name}").id
        require(
            m.actuator_ctrllimited[aid] and m.actuator_forcelimited[aid],
            "Required drive limits disabled",
        )
        require(m.actuator_trnid[aid, 0] == jid, "Actuator targets wrong joint")
        close(m.actuator_gear[aid], [1, 0, 0, 0, 0, 0], "Actuator gear")
        close(m.actuator_gainprm[aid, :3], [j.drive.kp, 0, 0], "Position gain")
        close(m.actuator_biasprm[aid, :3], [0, -j.drive.kp, 0], "Position bias")
        close(m.actuator_ctrlrange[aid], joint_limits(j), "Control limits")
        close(
            m.actuator_forcerange[aid],
            [-joint_force_limit(j), joint_force_limit(j)],
            "Torque limits",
        )
        indices.append((j, int(m.jnt_qposadr[jid]), aid))
    return indices
