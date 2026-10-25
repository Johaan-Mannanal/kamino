import type { TargetReview } from './target-review'
export type Source = 'measured' | 'user_supplied' | 'sourced' | 'estimated'
export type JobStatus =
  | 'queued'
  | 'reconstructing'
  | 'awaiting_properties'
  | 'preparing'
  | 'validating'
  | 'completed'
  | 'failed'
export type Scalar = { value: number; source: Source; note?: string | null }
export type Orientation = { x_deg: number; y_deg: number; z_deg: number }
export type Sizing = {
  mode: 'uniform' | 'independent_axes'
  reviewed_orientation: Orientation
  reference?: {
    axis: 'x' | 'y' | 'z'
    length: number
    unit: 'mm' | 'm'
    source: Source
    correspondence: 'full_mesh_extent'
    description: string
  } | null
  acknowledge_distortion?: boolean
}
export type SizingResult = {
  mode: Sizing['mode'] | 'legacy_independent_axes'
  orientation: Orientation
  source_extents_input_units: number[]
  scale_factors: number[]
  resulting_dimensions_m: Properties['dimensions_m']
  reference_extent_input_units: number | null
  geometry_review: string
}
export type SizingPreview = {
  source_mesh_sha256?: string | null
  geometry_context_sha256?: string | null
  dimensions_m: Properties['dimensions_m']
  sizing_result: SizingResult
}
export type Properties = {
  geometry_scope?: 'reviewed_target' | 'whole_reconstruction'
  source_mesh_sha256?: string | null
  geometry_context_sha256?: string | null
  dimensions_m: { x: number; y: number; z: number; source: Source; note?: string | null }
  mass_kg: Scalar
  sliding_friction: Scalar | null
  sizing?: Sizing | null
}
export type Suggestions = {
  dimensions_m: Properties['dimensions_m'] | null
  mass_kg: Scalar | null
  sliding_friction: Scalar | null
  clarifying_questions: string[]
  notes: string[]
}
export type Job = {
  schema_version: '1.0'
  id: string
  status: JobStatus
  provider: 'mock' | 'meshy'
  synthetic: boolean
  created_at: string
  updated_at: string
  progress: number
  source_images: string[]
  provider_task_id: string | null
  mesh_path: string | null
  properties: Properties | null
  asset: {
    asset_id: string
    visual_mesh: string
    properties: Properties
    collision: { kind: 'box' | 'convex_mesh'; mesh_path: string | null }
    synthetic: boolean
    notes: string[]
  } | null
  export_path: string | null
  validation_path: string | null
  bundle_path: string | null
  error: { code: string; message: string } | null
  orientation: Orientation
  geometry_review?: TargetReview | null
  sizing_result?: SizingResult | null
  input_revision?: number
  attempts?: {
    id: string
    status: JobStatus
    inputs_path: string | null
    inputs: { input_revision: number; properties: Properties; orientation: Orientation }
    export_path: string | null
    validation_path: string | null
    bundle_path: string | null
  }[]
}

export type ValidationRun = {
  passed: boolean
  checks?: Record<string, boolean>
  maximum_penetration_m?: number
  steps?: number
}
export type ValidationReport = {
  passed: boolean
  scope?: string
  viewer_inspected?: boolean
  portability_passed?: boolean
  original?: ValidationRun
  relocated?: ValidationRun
  error?: string
}
