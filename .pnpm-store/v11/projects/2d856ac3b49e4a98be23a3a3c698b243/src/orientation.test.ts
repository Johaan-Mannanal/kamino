import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { orientationMatrix, makeOrientation } from './orientation'
it('rotates raw +Y pins to +Z with +90 X and uses fixed-axis Rz Ry Rx', () => {
  const rotated = new Vector3(0, 1, 0).applyMatrix4(
    orientationMatrix({ x_deg: 90, y_deg: 0, z_deg: 0 }),
  )
  expect(rotated.z).toBeCloseTo(1)
  expect(rotated.y).toBeCloseTo(0)
  const v = new Vector3(1, 2, 3)
  const angles = { x_deg: 37, y_deg: -25, z_deg: 71 }
  const expected = v
    .clone()
    .applyAxisAngle(new Vector3(1, 0, 0), (37 * Math.PI) / 180)
    .applyAxisAngle(new Vector3(0, 1, 0), (-25 * Math.PI) / 180)
    .applyAxisAngle(new Vector3(0, 0, 1), (71 * Math.PI) / 180)
  expect(v.applyMatrix4(orientationMatrix(angles)).distanceTo(expected)).toBeLessThan(1e-10)
})
it('rejects blank, nonfinite and out of range angles', () => {
  expect(makeOrientation({ x_deg: '90', y_deg: '0', z_deg: '-180' })).toEqual({
    x_deg: 90,
    y_deg: 0,
    z_deg: -180,
  })
  for (const x_deg of ['', 'NaN', 'Infinity', '181'])
    expect(() => makeOrientation({ x_deg, y_deg: '0', z_deg: '0' })).toThrow()
})
