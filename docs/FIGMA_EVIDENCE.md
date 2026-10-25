# Figma design and workflow evidence

## Design and implementation

[Kamino Figma design file](https://www.figma.com/design/rSOvF7zmhYyGwLxGqLRgAo/Untitled?node-id=0-1&m=dev)

Atul reported Home, Upload, Creating mesh and Workspace screens with reusable
components and Kamino branding. The corresponding implementation is public in
[the current UI](../prototypes/kamino-ui/src), with shared geometry controls in
[the viewer](../frontend/src/viewer.ts).
The [original UI delivery](https://github.com/Johaan-Mannanal/kamino/commit/9600d529756b9e7294d323c39230bdfb901fe46e)
and [integrated Workspace delivery](https://github.com/Johaan-Mannanal/kamino/commit/2cdc3824a58b4da273d30bd61893828c6962b243)
provide code history; later released changes are documented in [RELEASE.md](RELEASE.md).

**Access check, October 25:** the design and prototype URLs still show “Sign up or
Log in” in a signed-out review browser. Public design/prototype access remains
unverified; no permission setting was changed. The [five-slide workflow deck](https://www.figma.com/slides/wqDC8D4N5ycsDvkgEisqoS)
opened in that signed-out browser. It includes genuine before/after and Figma
workflow images plus prototype, repository and product links. The editor requires
account access to add an interactive prototype embed, so that specific requirement
remains outstanding. The [PNG evidence index](evidence/figma/README.md) and
[stage log](evidence/figma/WORKFLOW_STAGE_LOG.md) are independently reviewable.

## What Atul should supply

- A viewable design/prototype link with “Anyone” access, checked outside the owner's session.
- PNG exports of Home, Upload/Creating mesh and Workspace, plus a components or
  handoff view if used. Keep frame names/captions so each export can be traced to
  the design and implemented screen. Exclude private account details.
- The real workflow stage log: tools used and why, approximate time, usefulness
  rating and what reached the implementation. Mark unused stages/tools honestly;
  do not invent Figma Make or agent usage.
- The Figma Slides link embedding the working prototype/Make artifact and code
  link. Include actual iteration or handoff evidence rather than only final UI.

## Published challenge requirements

The [official challenge document](https://docs.google.com/document/d/1HjzThDGveSLiilIdEPEHq12ZVLZ5eS0T8CQC5_m_-rg/edit?tab=t.0),
linked from [Hive](https://hive.hackberkeley.org/prizes), was read October 25.
It asks for Anyone-accessible Figma files, a demo video of at most three minutes,
a stage log of at most 200 words per stage, and Figma Slides demonstrating the
work and workflow. Slides must embed Make files and/or Figma prototypes and link
the working code; the document also asks for Edu verification.

The four stage headings are ideation, prototyping, handoff and code generation.
Record the actual process, including rework. Make specifically is not universally
required: the document allows Figma prototypes. Screenshots improve repository
accessibility but do not substitute for the required working artifact or Slides.
No submission or eligibility completion is claimed here.
