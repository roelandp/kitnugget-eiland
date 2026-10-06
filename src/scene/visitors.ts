import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { AnimalState } from './animals'

/**
 * Special visitors that are not built from the animal kit: Papa (a scanned head on a
 * small animated body, arriving by helicopter) and the rainbow plush (fallback shape).
 */

const mats = new Map<string, THREE.MeshLambertMaterial>()
function mat(color: string): THREE.MeshLambertMaterial {
  let m = mats.get(color)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color })
    mats.set(color, m)
  }
  return m
}

function mesh(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color))
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

interface PapaParts {
  rig: THREE.Group
  torso: THREE.Object3D
  head: THREE.Object3D
  armL: THREE.Object3D
  armR: THREE.Object3D
  legL: THREE.Object3D
  legR: THREE.Object3D
}

const SKIN = '#f1c6a8'
const SHIRT = '#7fa8d9'
const JEANS = '#4f5f86'
const SHOES = '#3d3350'

/**
 * Papa: the scanned head (normalised, facing +Z, bottom at y = 0) on a small cartoon body.
 * Without a scan he gets a round head with messy hair. Feet at y = 0, facing +Z, ~0.8 tall.
 */
export function buildPapa(scan: THREE.Object3D | null): THREE.Group {
  const root = new THREE.Group()
  root.name = 'papa'
  const rig = new THREE.Group()
  root.add(rig)

  const legGeo = new THREE.CapsuleGeometry(0.045, 0.16, 4, 8)
  const legL = new THREE.Group()
  legL.position.set(-0.06, 0.24, 0)
  legL.add(mesh(legGeo, JEANS, 0, -0.11, 0))
  legL.add(mesh(new RoundedBoxGeometry(0.09, 0.05, 0.14, 2, 0.02), SHOES, 0, -0.215, 0.025))
  const legR = legL.clone()
  legR.position.x = 0.06
  rig.add(legL, legR)

  const torso = new THREE.Group()
  torso.position.y = 0.24
  torso.add(mesh(new RoundedBoxGeometry(0.24, 0.24, 0.15, 3, 0.06), SHIRT, 0, 0.12, 0))
  // A collar and a belt make it read as a dad in a shirt.
  torso.add(mesh(new RoundedBoxGeometry(0.12, 0.03, 0.09, 2, 0.012), '#ffffff', 0, 0.235, 0.03))
  torso.add(mesh(new RoundedBoxGeometry(0.245, 0.035, 0.155, 2, 0.015), '#6b4a3a', 0, 0.015, 0))
  rig.add(torso)

  const armGeo = new THREE.CapsuleGeometry(0.035, 0.15, 4, 8)
  const makeArm = (side: number) => {
    const arm = new THREE.Group()
    arm.position.set(side * 0.15, 0.46, 0)
    arm.add(mesh(armGeo, SHIRT, 0, -0.09, 0))
    arm.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), SKIN, 0, -0.19, 0))
    return arm
  }
  const armL = makeArm(-1)
  const armR = makeArm(1)
  rig.add(armL, armR)

  const head = new THREE.Group()
  head.position.y = 0.47
  if (scan) {
    head.add(scan)
  } else {
    head.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), SKIN, 0, 0.14, 0))
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const spike = mesh(new THREE.ConeGeometry(0.04, 0.11, 6), '#8a7766', Math.cos(a) * 0.08, 0.25, Math.sin(a) * 0.08)
      spike.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)
      head.add(spike)
    }
    head.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), '#3d3350', -0.045, 0.16, 0.12))
    head.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), '#3d3350', 0.045, 0.16, 0.12))
  }
  rig.add(head)

  const parts: PapaParts = { rig, torso, head, armL, armR, legL, legR }
  root.userData.papa = parts
  root.userData.custom = 'papa'
  return root
}

/** Papa moves like a strict but loving dad: hands on hips, a wagging finger, arms up when happy. */
export function animatePapa(group: THREE.Object3D, state: AnimalState, t: number): void {
  const P = group.userData.papa as PapaParts | undefined
  if (!P) return
  P.rig.position.set(0, 0, 0)
  P.rig.rotation.set(0, 0, 0)
  P.head.rotation.set(0, 0, 0)
  P.torso.scale.set(1, 1 + 0.02 * Math.sin(t * 2.2), 1)
  P.legL.rotation.set(0, 0, 0)
  P.legR.rotation.set(0, 0, 0)
  // Hands on the hips, the strict default.
  P.armL.rotation.set(0, 0, -0.75)
  P.armR.rotation.set(0, 0, 0.75)
  switch (state) {
    case 'talk': {
      // One finger up, wagging: "Opletten!"
      P.armR.rotation.set(-2.6, 0, 0.25 + 0.25 * Math.sin(t * 9))
      P.head.rotation.x = 0.08 * Math.sin(t * 5)
      P.head.rotation.y = 0.1 * Math.sin(t * 1.3)
      break
    }
    case 'happy': {
      const b = Math.abs(Math.sin(t * 7))
      P.rig.position.y = 0.08 * b
      P.armL.rotation.set(0, 0, -2.6 - 0.2 * Math.sin(t * 9))
      P.armR.rotation.set(0, 0, 2.6 + 0.2 * Math.sin(t * 9))
      P.head.rotation.z = 0.12 * Math.sin(t * 7)
      break
    }
    case 'walk': {
      P.legL.rotation.x = 0.6 * Math.sin(t * 10)
      P.legR.rotation.x = -0.6 * Math.sin(t * 10)
      P.armL.rotation.set(-0.5 * Math.sin(t * 10), 0, -0.2)
      P.armR.rotation.set(0.5 * Math.sin(t * 10), 0, 0.2)
      P.rig.position.y = 0.02 * Math.abs(Math.sin(t * 10))
      break
    }
    default:
      P.head.rotation.y = 0.15 * Math.sin(t * 0.6)
  }
}

/** A cheerful pastel helicopter, ~1.3 long, nose at +Z. userData.seat is where Papa sits. */
export function buildHelicopter(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'helicopter'
  const body = mesh(new THREE.SphereGeometry(0.34, 18, 14), '#ffd27d', 0, 0.42, 0.05)
  body.scale.set(1, 0.85, 1.25)
  g.add(body)
  const glass = mesh(new THREE.SphereGeometry(0.25, 16, 12), '#bfe3f7', 0, 0.48, 0.23)
  glass.scale.set(1.05, 0.8, 0.8)
  glass.material = new THREE.MeshLambertMaterial({ color: '#cfeefc', transparent: true, opacity: 0.55 })
  g.add(glass)
  const boom = mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 10), '#ffd27d', 0, 0.5, -0.62)
  boom.rotation.x = Math.PI / 2
  g.add(boom)
  g.add(mesh(new RoundedBoxGeometry(0.04, 0.22, 0.16, 2, 0.02), '#f28b82', 0, 0.6, -0.95))
  const tail = new THREE.Group()
  tail.position.set(0.045, 0.6, -0.95)
  const tb = mesh(new RoundedBoxGeometry(0.015, 0.24, 0.04, 1, 0.006), '#ffffff')
  tail.add(tb)
  g.add(tail)
  // Skids.
  for (const side of [-1, 1]) {
    const skid = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 8), '#9aa0b0', side * 0.24, 0.04, 0.05)
    skid.rotation.x = Math.PI / 2
    g.add(skid)
    for (const z of [-0.18, 0.25]) g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), '#9aa0b0', side * 0.2, 0.12, z))
  }
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), '#9aa0b0', 0, 0.78, 0.02))
  const rotor = new THREE.Group()
  rotor.position.set(0, 0.85, 0.02)
  for (const a of [0, Math.PI / 2]) {
    const blade = mesh(new RoundedBoxGeometry(1.5, 0.02, 0.09, 1, 0.01), '#f28b82')
    blade.rotation.y = a
    rotor.add(blade)
  }
  rotor.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), '#ffffff'))
  g.add(rotor)
  const seat = new THREE.Object3D()
  seat.position.set(0, 0.18, 0.05)
  g.add(seat)
  g.userData.rotor = rotor
  g.userData.tail = tail
  g.userData.seat = seat
  return g
}

export function animateHelicopter(heli: THREE.Object3D, t: number): void {
  const rotor = heli.userData.rotor as THREE.Object3D | undefined
  const tail = heli.userData.tail as THREE.Object3D | undefined
  if (rotor) rotor.rotation.y = t * 22
  if (tail) tail.rotation.x = t * 30
}

/** A soft rainbow plush made from striped capsules, for when the scan is missing. */
export function buildPlushFallback(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'knuffel'
  // Built lying along Z, then stood up: balls on the ground, face to the front.
  const g = new THREE.Group()
  g.rotation.x = -Math.PI / 2
  g.position.y = 0.45
  root.add(g)
  const colors = ['#ff6b6b', '#ffb36b', '#ffe36b', '#7fd67f', '#6bb6ff', '#a98bff']
  colors.forEach((c, i) => {
    const seg = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 14), c, 0, 0.12, -0.24 + i * 0.09)
    seg.rotation.x = Math.PI / 2
    g.add(seg)
  })
  g.add(mesh(new THREE.SphereGeometry(0.13, 14, 10), '#ff6b6b', 0, 0.13, 0.3))
  g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), '#3d3350', -0.05, 0.01, 0.34))
  g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), '#3d3350', 0.05, 0.01, 0.34))
  g.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), '#a98bff', -0.08, 0.1, -0.34))
  g.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), '#6bb6ff', 0.08, 0.1, -0.34))
  return root
}
