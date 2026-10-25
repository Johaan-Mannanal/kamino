import { Matrix4, MathUtils } from 'three'
import type { Orientation } from './types'
export function orientationMatrix(orientation: Orientation) {
  const { x_deg, y_deg, z_deg } = orientation
  return new Matrix4()
    .makeRotationZ(MathUtils.degToRad(z_deg))
    .multiply(new Matrix4().makeRotationY(MathUtils.degToRad(y_deg)))
    .multiply(new Matrix4().makeRotationX(MathUtils.degToRad(x_deg)))
}
export function makeOrientation(values: Record<string, string>): Orientation {
  const angle = (key: string) => {
    const raw = values[key]?.trim()
    const value = Number(raw)
    if (!raw || !Number.isFinite(value) || Math.abs(value) > 180)
      throw new Error('Orientation angles must be between -180 and 180 degrees.')
    return value
  }
  return { x_deg: angle('x_deg'), y_deg: angle('y_deg'), z_deg: angle('z_deg') }
}
