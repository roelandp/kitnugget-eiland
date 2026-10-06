// For heavy scans whose UVs are cut into many islands: bake the texture into vertex colours,
// merge vertices by position (seams disappear), simplify the clean mesh, write a GLB with
// smooth normals and vertex colours. No texture, so no seams can show.
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const [input, output, targetTris, errArg] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)
await MeshoptSimplifier.ready
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0]
const mat = prim.getMaterial()
const tex = mat.getBaseColorTexture()
const img = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: TW, height: TH } = img.info
const pix = img.data
const pos = prim.getAttribute('POSITION').getArray()
const uv = prim.getAttribute('TEXCOORD_0').getArray()
const idx = prim.getIndices().getArray()
const n = pos.length / 3
console.log('verts', n, 'tris', idx.length / 3, 'tex', TW, TH)
// Merge by quantised position, averaging the sampled colour (sRGB, as in the texture).
let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
for (let i = 0; i < n; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
  if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z
  if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z
}
const q = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 200000
const key = new Map()
const remap = new Uint32Array(n)
const outPos = []
const sum = []
const cnt = []
for (let i = 0; i < n; i++) {
  const k = `${Math.round(pos[i * 3] / q)},${Math.round(pos[i * 3 + 1] / q)},${Math.round(pos[i * 3 + 2] / q)}`
  let id = key.get(k)
  if (id === undefined) {
    id = cnt.length
    key.set(k, id)
    outPos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
    sum.push(0, 0, 0)
    cnt.push(0)
  }
  remap[i] = id
  const u = uv[i * 2] - Math.floor(uv[i * 2])
  const v = uv[i * 2 + 1] - Math.floor(uv[i * 2 + 1])
  const px = Math.min(TW - 1, Math.max(0, Math.floor(u * TW)))
  const py = Math.min(TH - 1, Math.max(0, Math.floor(v * TH)))
  const o = (py * TW + px) * 3
  sum[id * 3] += pix[o]; sum[id * 3 + 1] += pix[o + 1]; sum[id * 3 + 2] += pix[o + 2]
  cnt[id]++
}
const m = cnt.length
console.log('merged verts', m)
const positions = new Float32Array(outPos)
let indices = new Uint32Array(idx.length)
let w = 0
for (let t = 0; t < idx.length; t += 3) {
  const a = remap[idx[t]], b = remap[idx[t + 1]], c = remap[idx[t + 2]]
  if (a === b || b === c || a === c) continue
  indices[w++] = a; indices[w++] = b; indices[w++] = c
}
indices = indices.slice(0, w)
const [simp, err] = MeshoptSimplifier.simplify(indices, positions, 3, Number(targetTris) * 3, Number(errArg ?? 0.05), [])
console.log('simplified', simp.length / 3, 'error', err.toFixed(4))
// Compact the vertices that are still used.
const used = new Int32Array(m).fill(-1)
const P = [], C = []
const I = new Uint32Array(simp.length)
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
for (let i = 0; i < simp.length; i++) {
  const v = simp[i]
  if (used[v] < 0) {
    used[v] = P.length / 3
    P.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
    // glTF vertex colours are linear.
    C.push(lin(sum[v * 3] / cnt[v]), lin(sum[v * 3 + 1] / cnt[v]), lin(sum[v * 3 + 2] / cnt[v]))
  }
  I[i] = used[v]
}
// Smooth normals.
const N = new Float32Array(P.length)
for (let t = 0; t < I.length; t += 3) {
  const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
  const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz }
}
for (let i = 0; i < N.length; i += 3) {
  const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1
  N[i] /= l; N[i + 1] /= l; N[i + 2] /= l
}
const out = new Document()
const buf = out.createBuffer()
const material = out.createMaterial('baked').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.85)
const p = out.createPrimitive()
  .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
  .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(N).setBuffer(buf))
  .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(C)).setBuffer(buf))
  .setIndices(out.createAccessor().setType('SCALAR').setArray(I).setBuffer(buf))
  .setMaterial(material)
const mesh = out.createMesh('baked').addPrimitive(p)
const node = out.createNode('baked').setMesh(mesh)
out.createScene().addChild(node)
await new NodeIO().write(output, out)
console.log(output, 'tris', I.length / 3, 'verts', P.length / 3)
