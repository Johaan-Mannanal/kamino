"""Check generated model geometry/frames/physics against the reviewed assembly."""

import hashlib
from xml.etree import ElementTree as ET

import mujoco
import numpy as np

from photo2sim.assemblies.export import TIMESTEP_S, local_mesh


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
    hinges = [j for j in record.joints if j.kind == "revolute"]
    require(m.nq == m.nv == m.nu == len(hinges), "Unexpected joint or actuator count")
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
        close(body.ipos, centre, "Inertia centre")
        close(abs(float(body.iquat[0])), 1, "Inertia orientation")
        close(body.inertia, inertia, "Link inertia", atol=1e-14)
        collision = m.geom(f"collision_{link.name}")
        require(int(collision.bodyid[0]) == body.id, "Collision belongs to wrong link")
        require(int(collision.type[0]) == mujoco.mjtGeom.mjGEOM_BOX, "Expected box collision")
        require(
            int(collision.contype[0]) != 0 and int(collision.conaffinity[0]) != 0,
            "Collision disabled",
        )
        close(collision.pos, centre, "Collision centre")
        close(abs(float(collision.quat[0])), 1, "Collision orientation")
        close(collision.size, sides / 2, "Collision dimensions")
        friction = link.sliding_friction.value if link.sliding_friction is not None else 0.8
        close(collision.friction, [friction, 0.005, 0.0001], "Friction")
        visual = m.geom(f"visual_{link.name}")
        require(int(visual.bodyid[0]) == body.id, "Visual belongs to wrong link")
        require(int(visual.type[0]) == mujoco.mjtGeom.mjGEOM_MESH, "Expected visual mesh")
        require(
            int(visual.contype[0]) == int(visual.conaffinity[0]) == 0,
            "Visual mesh must not collide",
        )
        mesh_id = int(visual.dataid[0])
        require(mesh_id == m.mesh(f"mesh_{link.name}").id, "Compiled visual uses wrong mesh")
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
        aid = m.actuator(f"drive_{j.name}").id
        require(m.jnt_type[jid] == mujoco.mjtJoint.mjJNT_HINGE, "Expected hinge")
        require(m.jnt_bodyid[jid] == m.body(j.child).id, "Joint belongs to wrong child")
        require(
            m.jnt_limited[jid] and m.actuator_ctrllimited[aid] and m.actuator_forcelimited[aid],
            "Required limits disabled",
        )
        close(m.jnt_pos[jid], [0, 0, 0], "Joint position")
        close(m.jnt_axis[jid], j.axis, "Joint axis")
        close(m.jnt_range[jid], j.limits_rad, "Joint limits")
        close(m.qpos0[m.jnt_qposadr[jid]], 0, "Joint reference")
        close(m.dof_damping[m.jnt_dofadr[jid]], j.damping.value, "Joint damping")
        require(m.actuator_trnid[aid, 0] == jid, "Actuator targets wrong joint")
        close(m.actuator_gear[aid], [1, 0, 0, 0, 0, 0], "Actuator gear")
        close(m.actuator_gainprm[aid, :3], [j.drive.kp, 0, 0], "Position gain")
        close(m.actuator_biasprm[aid, :3], [0, -j.drive.kp, 0], "Position bias")
        close(m.actuator_ctrlrange[aid], j.limits_rad, "Control limits")
        close(
            m.actuator_forcerange[aid],
            [-j.drive.force_limit_nm, j.drive.force_limit_nm],
            "Torque limits",
        )
        indices.append((j, int(m.jnt_qposadr[jid]), aid))
    return indices
