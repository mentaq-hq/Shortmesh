export function defaultMaterialSlot(name = 'Material') {
  return {
    name,
    color: '#ffffff',
    emissive: '#000000',
    emissiveStrength: 1,
    metalness: 0.04,
    roughness: 0.36,
    opacity: 1,
    uvRepeat: 1
  };
}
export function cloneMaterialSlot(slot) {
  return {
    ...slot
  };
}
export function cloneMesh(mesh) {
  return {
    vertices: mesh.vertices.map(v => [v[0], v[1], v[2]]),
    faces: mesh.faces.map(f => [...f]),
    edges: mesh.edges.map(e => [e[0], e[1]]),
    radius: mesh.radius,
    normals: mesh.normals?.map(n => [n[0], n[1], n[2]]),
    colors: mesh.colors ? [...mesh.colors] : undefined,
    mask: mesh.mask ? [...mesh.mask] : undefined,
    uvs: mesh.uvs?.map(uv => [uv[0], uv[1]]),
    smooth: mesh.smooth,
    slots: (mesh.slots ?? []).map(cloneMaterialSlot),
    faceSlot: [...(mesh.faceSlot ?? [])],
    groups: (mesh.groups ?? []).map(group => ({
      ...group
    }))
  };
}
export function buildGroups(mesh) {
  const groups = [];
  let triangleIndex = 0;
  let current = null;
  mesh.faces.forEach((face, faceIndex) => {
    const slot = mesh.faceSlot?.[faceIndex] ?? 0;
    const triangles = Math.max(0, face.length - 2);
    if (current && current.materialIndex === slot) {
      current.count += triangles * 3;
    } else {
      if (current) groups.push(current);
      current = {
        start: triangleIndex * 3,
        count: triangles * 3,
        materialIndex: slot
      };
    }
    triangleIndex += triangles;
  });
  if (current) groups.push(current);
  return groups;
}
export function addGroup(mesh, faceIndex, materialIndex) {
  if (faceIndex < 0 || faceIndex >= mesh.faces.length) return mesh;
  const slots = (mesh.slots ?? []).map(cloneMaterialSlot);
  while (slots.length <= materialIndex) slots.push(defaultMaterialSlot(`Slot ${slots.length}`));
  const faceSlot = [...(mesh.faceSlot ?? mesh.faces.map(() => 0))];
  while (faceSlot.length < mesh.faces.length) faceSlot.push(0);
  faceSlot[faceIndex] = materialIndex;
  const next = {
    ...mesh,
    slots,
    faceSlot
  };
  next.groups = buildGroups(next);
  return next;
}
export function assignFacesToSlot(mesh, faceIndices, materialIndex) {
  let next = mesh;
  for (const faceIndex of faceIndices) next = addGroup(next, faceIndex, materialIndex);
  return next;
}
export function toNonIndexed(mesh) {
  const vertices = [];
  const faces = [];
  const faceSlot = [];
  const normals = mesh.normals;
  const nextNormals = [];
  const colors = mesh.colors;
  const nextColors = [];
  mesh.faces.forEach((face, faceIndex) => {
    const base = vertices.length;
    for (let i = 1; i < face.length - 1; i++) {
      for (const index of [face[0], face[i], face[i + 1]]) {
        const v = mesh.vertices[index];
        vertices.push([v[0], v[1], v[2]]);
        if (normals) {
          const n = normals[index] ?? [0, 1, 0];
          nextNormals.push([n[0], n[1], n[2]]);
        }
        if (colors) {
          nextColors.push(colors[index * 3] ?? 1, colors[index * 3 + 1] ?? 1, colors[index * 3 + 2] ?? 1);
        }
      }
      faces.push([base, base + 1, base + 2]);
      faceSlot.push(mesh.faceSlot?.[faceIndex] ?? 0);
    }
  });
  const next = {
    vertices,
    faces,
    edges: buildEdges(faces),
    radius: computeRadius(vertices),
    smooth: mesh.smooth,
    slots: (mesh.slots ?? []).map(cloneMaterialSlot),
    faceSlot,
    groups: []
  };
  if (nextNormals.length === vertices.length) next.normals = nextNormals;
  if (nextColors.length === vertices.length * 3) next.colors = nextColors;
  next.groups = buildGroups(next);
  return next;
}
export function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
export function buildEdges(faces) {
  const seen = new Set();
  const edges = [];
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = edgeKey(a, b);
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([a, b]);
      }
    }
  }
  return edges;
}
export function computeRadius(vertices) {
  let maxR2 = 0.25;
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    const r2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    if (r2 > maxR2) maxR2 = r2;
  }
  return Math.sqrt(maxR2);
}
export function computeVertexNormals(mesh) {
  const normals = mesh.vertices.map(() => [0, 0, 0]);
  for (const face of mesh.faces) {
    const fLen = face.length;
    if (fLen < 3) continue;
    const fn = faceNormal(mesh, face);
    for (let i = 0; i < fLen; i++) {
      const target = normals[face[i]];
      target[0] += fn[0];
      target[1] += fn[1];
      target[2] += fn[2];
    }
  }
  for (const normal of normals) {
    const len = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    normal[0] /= len;
    normal[1] /= len;
    normal[2] /= len;
  }
  return normals;
}
export function faceNormal(mesh, face) {
  if (face.length < 3) return [0, 1, 0];
  // Newell's method handles arbitrary polygons and quads robustly without collinear corner issues
  let nx = 0,
    ny = 0,
    nz = 0;
  for (let i = 0; i < face.length; i++) {
    const curr = mesh.vertices[face[i]];
    const next = mesh.vertices[face[(i + 1) % face.length]];
    nx += (curr[1] - next[1]) * (curr[2] + next[2]);
    ny += (curr[2] - next[2]) * (curr[0] + next[0]);
    nz += (curr[0] - next[0]) * (curr[1] + next[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
export function faceCenter(mesh, face) {
  let x = 0,
    y = 0,
    z = 0;
  for (const index of face) {
    x += mesh.vertices[index][0];
    y += mesh.vertices[index][1];
    z += mesh.vertices[index][2];
  }
  const inv = 1 / face.length;
  return [x * inv, y * inv, z * inv];
}
export function finalizeMesh(mesh, smooth = false) {
  const result = {
    vertices: mesh.vertices.map(v => [v[0], v[1], v[2]]),
    faces: mesh.faces.map(f => [...f]),
    edges: mesh.edges && mesh.edges.length ? mesh.edges.map(e => [e[0], e[1]]) : buildEdges(mesh.faces),
    radius: computeRadius(mesh.vertices),
    smooth,
    slots: (mesh.slots ?? []).map(cloneMaterialSlot),
    faceSlot: [...(mesh.faceSlot ?? [])],
    groups: []
  };
  if (mesh.colors && mesh.colors.length >= result.vertices.length * 3) {
    result.colors = mesh.colors.slice(0, result.vertices.length * 3);
  }
  if (mesh.uvs && mesh.uvs.length === result.vertices.length) {
    result.uvs = mesh.uvs.map(uv => [uv[0], uv[1]]);
  }
  if (mesh.normals && mesh.normals.length === result.vertices.length) {
    result.normals = mesh.normals.map(n => [n[0], n[1], n[2]]);
  } else if (smooth) {
    result.normals = computeVertexNormals(result);
  }
  while (result.faceSlot.length < result.faces.length) result.faceSlot.push(0);
  result.faceSlot.length = result.faces.length;
  result.groups = buildGroups(result);
  return result;
}
function build(vertices, faces, smooth = false, normals) {
  return finalizeMesh({
    vertices,
    faces,
    edges: buildEdges(faces),
    radius: computeRadius(vertices),
    normals
  }, smooth);
}
export function cubeMesh(sizeX = 1, sizeY = 1, sizeZ = 1) {
  const hx = Math.max(0.05, sizeX) * 0.5;
  const hy = Math.max(0.05, sizeY) * 0.5;
  const hz = Math.max(0.05, sizeZ) * 0.5;
  const vertices = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
  return build(vertices, faces, false);
}
export function sphereMesh(segments = 48, rings = 24, radius = 0.5) {
  const segs = Math.max(8, Math.floor(segments));
  const rngs = Math.max(4, Math.floor(rings));
  const rad = Math.max(0.05, radius);
  const vertices = [];
  const normals = [];

  // North pole (index 0)
  vertices.push([0, rad, 0]);
  normals.push([0, 1, 0]);

  // Intermediate rings (1 .. rngs - 1)
  for (let r = 1; r < rngs; r++) {
    const phi = r / rngs * Math.PI;
    const ny = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    for (let s = 0; s < segs; s++) {
      const theta = s / segs * Math.PI * 2;
      const nx = Math.cos(theta) * sinPhi;
      const nz = Math.sin(theta) * sinPhi;
      vertices.push([nx * rad, ny * rad, nz * rad]);
      normals.push([nx, ny, nz]);
    }
  }

  // South pole
  const south = vertices.length;
  vertices.push([0, -rad, 0]);
  normals.push([0, -1, 0]);
  const faces = [];
  // North pole triangle fan (outward CCW)
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    faces.push([0, 1 + next, 1 + s]);
  }
  // Quad strips between intermediate rings (outward CCW)
  for (let r = 1; r < rngs - 1; r++) {
    const row = 1 + (r - 1) * segs;
    const nextRow = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      faces.push([row + s, row + next, nextRow + next, nextRow + s]);
    }
  }
  // South pole triangle fan (outward CCW)
  const lastRow = 1 + (rngs - 2) * segs;
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    faces.push([lastRow + s, lastRow + next, south]);
  }
  return build(vertices, faces, true, normals);
}
export function cylinderMesh(segments = 48, innerRadius = 0, height = 1, outerRadius = 0.5) {
  const segs = Math.max(8, Math.floor(segments));
  const rad = Math.max(0.05, outerRadius);
  const vertices = [];
  const half = height / 2;
  for (let s = 0; s < segs; s++) {
    const theta = s / segs * Math.PI * 2;
    vertices.push([Math.cos(theta) * rad, -half, Math.sin(theta) * rad]);
  }
  for (let s = 0; s < segs; s++) {
    const theta = s / segs * Math.PI * 2;
    vertices.push([Math.cos(theta) * rad, half, Math.sin(theta) * rad]);
  }
  if (innerRadius > 0) {
    for (let s = 0; s < segs; s++) {
      const theta = s / segs * Math.PI * 2;
      vertices.push([Math.cos(theta) * innerRadius, -half, Math.sin(theta) * innerRadius]);
    }
    for (let s = 0; s < segs; s++) {
      const theta = s / segs * Math.PI * 2;
      vertices.push([Math.cos(theta) * innerRadius, half, Math.sin(theta) * innerRadius]);
    }
  }
  const faces = [];
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    if (innerRadius > 0) {
      const bi = segs * 2;
      const ti = segs * 3;
      // Outer wall (outward CCW)
      faces.push([s, segs + s, segs + next, next]);
      // Inner wall (inward toward hole axis CCW)
      faces.push([bi + s, bi + next, ti + next, ti + s]);
      // Bottom annular quad (downward CCW)
      faces.push([s, next, bi + next, bi + s]);
      // Top annular quad (upward CCW)
      faces.push([segs + s, ti + s, ti + next, segs + next]);
    } else {
      // Outer wall (outward CCW)
      faces.push([s, segs + s, segs + next, next]);
    }
  }
  if (innerRadius <= 0) {
    const bottom = Array.from({
      length: segs
    }, (_, i) => i);
    const top = Array.from({
      length: segs
    }, (_, i) => segs + (segs - 1 - i));
    faces.push(bottom, top);
  }
  return build(vertices, faces, true);
}
export function coneMesh(segments = 48, radius = 0.5, height = 1) {
  const segs = Math.max(8, Math.floor(segments));
  const rad = Math.max(0.05, radius);
  const half = Math.max(0.05, height) * 0.5;
  const vertices = [];
  for (let s = 0; s < segs; s++) {
    const theta = s / segs * Math.PI * 2;
    vertices.push([Math.cos(theta) * rad, -half, Math.sin(theta) * rad]);
  }
  vertices.push([0, half, 0]);
  const apex = vertices.length - 1;
  const faces = [];
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    // Outward CCW side triangle
    faces.push([s, apex, next]);
  }
  // Outward downward bottom cap
  faces.push(Array.from({
    length: segs
  }, (_, i) => i));
  return build(vertices, faces, true);
}
export function torusMesh(segments = 48, sides = 24, radius = 0.35, tube = 0.15) {
  const segs = Math.max(8, Math.floor(segments));
  const sds = Math.max(6, Math.floor(sides));
  const vertices = [];
  const normals = [];
  for (let i = 0; i < segs; i++) {
    const u = i / segs * Math.PI * 2;
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    for (let j = 0; j < sds; j++) {
      const v = j / sds * Math.PI * 2;
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      const r = radius + tube * cosV;
      vertices.push([cosU * r, tube * sinV, sinU * r]);
      normals.push([cosU * cosV, sinV, sinU * cosV]);
    }
  }
  const faces = [];
  for (let i = 0; i < segs; i++) {
    const ni = (i + 1) % segs;
    for (let j = 0; j < sds; j++) {
      const nj = (j + 1) % sds;
      // Outward CCW quad
      faces.push([i * sds + j, i * sds + nj, ni * sds + nj, ni * sds + j]);
    }
  }
  return build(vertices, faces, true, normals);
}
export function planeMesh() {
  const vertices = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]];
  // Outward upward normal [0, +1, 0]
  return build(vertices, [[0, 3, 2, 1]], false);
}
export function mediaPlaneMesh() {
  const mesh = planeMesh();
  mesh.uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
  return mesh;
}
export function coinMesh(segments = 48) {
  return cylinderMesh(segments, 0, 0.12);
}
export function boneMesh() {
  const rawVertices = [[0, -0.2, 0], [0.09, -0.06, 0.09], [-0.09, -0.06, 0.09], [-0.09, -0.06, -0.09], [0.09, -0.06, -0.09], [0, 0.25, 0]];
  // Octahedral studio bone with 8 outward CCW faces
  const faces = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]];
  return build(rawVertices, faces, false);
}
export function icoSphereMesh(subdivisions = 1, radius = 0.5) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const baseVerts = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]];
  const scale = radius / Math.sqrt(1 + phi * phi);
  let vertices = baseVerts.map(v => [v[0] * scale, v[1] * scale, v[2] * scale]);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const subs = Math.min(3, Math.max(0, Math.floor(subdivisions)));
  for (let s = 0; s < subs; s++) {
    const midCache = new Map();
    const getMid = (p1, p2) => {
      const key = p1 < p2 ? p1 + '_' + p2 : p2 + '_' + p1;
      if (midCache.has(key)) return midCache.get(key);
      const v1 = vertices[p1];
      const v2 = vertices[p2];
      const mx = (v1[0] + v2[0]) / 2;
      const my = (v1[1] + v2[1]) / 2;
      const mz = (v1[2] + v2[2]) / 2;
      const len = Math.hypot(mx, my, mz) || 1;
      const idx = vertices.length;
      vertices.push([mx / len * radius, my / len * radius, mz / len * radius]);
      midCache.set(key, idx);
      return idx;
    };
    const nextFaces = [];
    for (const f of faces) {
      const a = f[0],
        b = f[1],
        c = f[2];
      const ab = getMid(a, b);
      const bc = getMid(b, c);
      const ca = getMid(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }
  const normals = vertices.map(v => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  });
  return build(vertices, faces, true, normals);
}
export function circleMesh(segments = 32, radius = 0.5) {
  const segs = Math.max(6, Math.floor(segments));
  const vertices = [[0, 0, 0]];
  for (let s = 0; s < segs; s++) {
    const theta = s / segs * Math.PI * 2;
    vertices.push([Math.cos(theta) * radius, 0, Math.sin(theta) * radius]);
  }
  const faces = [];
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs + 1;
    faces.push([0, next, s + 1]);
  }
  return build(vertices, faces, false);
}
export function gridMesh(subdivX = 4, subdivY = 4, sizeX = 2, sizeY = 2) {
  const sx = Math.max(1, Math.floor(subdivX));
  const sy = Math.max(1, Math.floor(subdivY));
  const vertices = [];
  for (let y = 0; y <= sy; y++) {
    for (let x = 0; x <= sx; x++) {
      const px = (x / sx - 0.5) * sizeX;
      const pz = (y / sy - 0.5) * sizeY;
      vertices.push([px, 0, pz]);
    }
  }
  const faces = [];
  for (let y = 0; y < sy; y++) {
    for (let x = 0; x < sx; x++) {
      const i0 = y * (sx + 1) + x;
      const i1 = i0 + 1;
      const i2 = (y + 1) * (sx + 1) + x + 1;
      const i3 = (y + 1) * (sx + 1) + x;
      faces.push([i0, i3, i2, i1]);
    }
  }
  return build(vertices, faces, false);
}
export function pyramidMesh(sides = 4, radius = 0.5, height = 1) {
  const sds = Math.max(3, Math.floor(sides));
  const half = height / 2;
  const vertices = [[0, half, 0]];
  for (let s = 0; s < sds; s++) {
    const theta = s / sds * Math.PI * 2;
    vertices.push([Math.cos(theta) * radius, -half, Math.sin(theta) * radius]);
  }
  const baseCenter = vertices.length;
  vertices.push([0, -half, 0]);
  const faces = [];
  for (let s = 0; s < sds; s++) {
    const curr = s + 1;
    const next = (s + 1) % sds + 1;
    faces.push([0, curr, next]);
  }
  for (let s = 0; s < sds; s++) {
    const curr = s + 1;
    const next = (s + 1) % sds + 1;
    faces.push([baseCenter, next, curr]);
  }
  return build(vertices, faces, false);
}
export function tubeMesh(segments = 24, innerRadius = 0.3, outerRadius = 0.5, height = 1) {
  const segs = Math.max(8, Math.floor(segments));
  const inR = Math.max(0.05, Math.min(innerRadius, outerRadius - 0.05));
  const outR = Math.max(inR + 0.05, outerRadius);
  const half = height / 2;
  const vertices = [];
  for (let s = 0; s < segs; s++) {
    const th = s / segs * Math.PI * 2;
    vertices.push([Math.cos(th) * outR, half, Math.sin(th) * outR]);
  }
  for (let s = 0; s < segs; s++) {
    const th = s / segs * Math.PI * 2;
    vertices.push([Math.cos(th) * outR, -half, Math.sin(th) * outR]);
  }
  for (let s = 0; s < segs; s++) {
    const th = s / segs * Math.PI * 2;
    vertices.push([Math.cos(th) * inR, half, Math.sin(th) * inR]);
  }
  for (let s = 0; s < segs; s++) {
    const th = s / segs * Math.PI * 2;
    vertices.push([Math.cos(th) * inR, -half, Math.sin(th) * inR]);
  }
  const faces = [];
  const N = segs;
  for (let s = 0; s < N; s++) {
    const nxt = (s + 1) % N;
    faces.push([s, s + N, nxt + N, nxt]);
    faces.push([s, nxt, 2 * N + nxt, 2 * N + s]);
    faces.push([s + N, 3 * N + s, 3 * N + nxt, nxt + N]);
    faces.push([2 * N + s, 2 * N + nxt, 3 * N + nxt, 3 * N + s]);
  }
  return build(vertices, faces, true);
}
export function capsuleMesh(segments = 20, rings = 6, radius = 0.25, height = 0.6) {
  const segs = Math.max(8, Math.floor(segments));
  const rngs = Math.max(3, Math.floor(rings));
  const halfH = height / 2;
  const vertices = [];
  const normals = [];
  vertices.push([0, halfH + radius, 0]);
  normals.push([0, 1, 0]);
  for (let r = 1; r <= rngs; r++) {
    const phi = r / rngs * (Math.PI / 2);
    const y = halfH + Math.cos(phi) * radius;
    const rRing = Math.sin(phi) * radius;
    for (let s = 0; s < segs; s++) {
      const th = s / segs * Math.PI * 2;
      vertices.push([Math.cos(th) * rRing, y, Math.sin(th) * rRing]);
      normals.push([Math.cos(th) * Math.sin(phi), Math.cos(phi), Math.sin(th) * Math.sin(phi)]);
    }
  }
  for (let r = 0; r < rngs; r++) {
    const phi = Math.PI / 2 + r / rngs * (Math.PI / 2);
    const y = -halfH + Math.cos(phi) * radius;
    const rRing = Math.sin(phi) * radius;
    for (let s = 0; s < segs; s++) {
      const th = s / segs * Math.PI * 2;
      vertices.push([Math.cos(th) * rRing, y, Math.sin(th) * rRing]);
      normals.push([Math.cos(th) * Math.sin(phi), Math.cos(phi), Math.sin(th) * Math.sin(phi)]);
    }
  }
  const southPole = vertices.length;
  vertices.push([0, -halfH - radius, 0]);
  normals.push([0, -1, 0]);
  const faces = [];
  for (let s = 0; s < segs; s++) {
    const nxt = (s + 1) % segs;
    faces.push([0, 1 + s, 1 + nxt]);
  }
  const totalRings = rngs * 2;
  for (let r = 0; r < totalRings - 1; r++) {
    const row = 1 + r * segs;
    const nxtRow = 1 + (r + 1) * segs;
    for (let s = 0; s < segs; s++) {
      const nxt = (s + 1) % segs;
      faces.push([row + s, nxtRow + s, nxtRow + nxt, row + nxt]);
    }
  }
  const lastRow = 1 + (totalRings - 1) * segs;
  for (let s = 0; s < segs; s++) {
    const nxt = (s + 1) % segs;
    faces.push([southPole, lastRow + nxt, lastRow + s]);
  }
  return build(vertices, faces, true, normals);
}
export function bezierCurveMesh() {
  const steps = 24;
  const segs = 8;
  const r = 0.05;
  const vertices = [];
  const faces = [];
  const p0 = [-0.8, -0.4, 0];
  const p1 = [-0.3, 0.6, 0.4];
  const p2 = [0.3, -0.6, -0.4];
  const p3 = [0.8, 0.4, 0];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const it = 1 - t;
    const px = it * it * it * p0[0] + 3 * it * it * t * p1[0] + 3 * it * t * t * p2[0] + t * t * t * p3[0];
    const py = it * it * it * p0[1] + 3 * it * it * t * p1[1] + 3 * it * t * t * p2[1] + t * t * t * p3[1];
    const pz = it * it * it * p0[2] + 3 * it * it * t * p1[2] + 3 * it * t * t * p2[2] + t * t * t * p3[2];
    const tx = 3 * it * it * (p1[0] - p0[0]) + 6 * it * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
    const ty = 3 * it * it * (p1[1] - p0[1]) + 6 * it * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
    const tz = 3 * it * it * (p1[2] - p0[2]) + 6 * it * t * (p2[2] - p1[2]) + 3 * t * t * (p3[2] - p2[2]);
    const tLen = Math.hypot(tx, ty, tz) || 1;
    const up = [0, 1, 0];
    let nx = up[1] * (tz / tLen) - up[2] * (ty / tLen);
    let ny = up[2] * (tx / tLen) - up[0] * (tz / tLen);
    let nz = up[0] * (ty / tLen) - up[1] * (tx / tLen);
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;
    const bx = ty / tLen * nz - tz / tLen * ny;
    const by = tz / tLen * nx - tx / tLen * nz;
    const bz = tx / tLen * ny - ty / tLen * nx;
    for (let s = 0; s < segs; s++) {
      const th = s / segs * Math.PI * 2;
      const c = Math.cos(th) * r;
      const sn = Math.sin(th) * r;
      vertices.push([px + nx * c + bx * sn, py + ny * c + by * sn, pz + nz * c + bz * sn]);
    }
  }
  for (let i = 0; i < steps; i++) {
    const row = i * segs;
    const nxtRow = (i + 1) * segs;
    for (let s = 0; s < segs; s++) {
      const nxt = (s + 1) % segs;
      faces.push([row + s, nxtRow + s, nxtRow + nxt, row + nxt]);
    }
  }
  return build(vertices, faces, true);
}
export function bezierCircleMesh() {
  return torusMesh(32, 12, 0.5, 0.04);
}
export function pathCurveMesh() {
  return cylinderMesh(16, 0.05, 1.2);
}
export function nurbsCurveMesh() {
  return bezierCurveMesh();
}
export function pointLightMesh() {
  return build([[0, 0.25, 0], [0.2, 0, 0], [0, 0, 0.2], [-0.2, 0, 0], [0, 0, -0.2], [0, -0.25, 0]], [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]], false);
}
export function sunLightMesh() {
  return cylinderMesh(16, 0, 0.08);
}
export function spotLightMesh() {
  return coneMesh(24);
}
export function areaLightMesh() {
  return planeMesh();
}
export function perspectiveCameraMesh() {
  const verts = [[-0.2, -0.15, 0.1], [0.2, -0.15, 0.1], [0.2, 0.15, 0.1], [-0.2, 0.15, 0.1], [-0.2, -0.15, 0.35], [0.2, -0.15, 0.35], [0.2, 0.15, 0.35], [-0.2, 0.15, 0.35], [-0.28, -0.2, -0.3], [0.28, -0.2, -0.3], [0.28, 0.2, -0.3], [-0.28, 0.2, -0.3]];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4], [0, 1, 9, 8], [1, 2, 10, 9], [2, 3, 11, 10], [3, 0, 8, 11], [8, 9, 10, 11]];
  return build(verts, faces, false);
}
export function orthoCameraMesh() {
  return perspectiveCameraMesh();
}
export function emptyAxesMesh() {
  const v = [[0, 0, 0], [0.8, 0, 0], [0.8, 0.03, 0], [0, 0.03, 0], [0, 0, 0], [0, 0.8, 0], [0.03, 0.8, 0], [0.03, 0, 0], [0, 0, 0], [0, 0, 0.8], [0, 0.03, 0.8], [0, 0.03, 0]];
  return build(v, [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]], false);
}
export function emptyArrowsMesh() {
  return emptyAxesMesh();
}
export function emptyCubeMesh() {
  return cubeMesh();
}
export function emptySphereMesh() {
  return torusMesh(24, 6, 0.5, 0.02);
}
export function emptyCircleMesh() {
  return circleMesh(32, 0.5);
}
export function emptyImageMesh() {
  return mediaPlaneMesh();
}
export function text3dMesh(text = 'TEXT', depth = 0.15, bevel = 0.02) {
  const len = Math.max(1, (text || 'TEXT').trim().length);
  const width = Math.min(3.2, Math.max(0.6, len * 0.28));
  return cubeMesh(width, 0.5 + bevel * 2, Math.max(0.05, depth));
}
export function metaballMesh(shape = 'ball') {
  return sphereMesh(32, 16);
}
export function latticeMesh() {
  return cubeMesh();
}
export function forceFieldMesh() {
  return torusMesh(32, 8, 0.6, 0.03);
}
export function speakerMesh() {
  const verts = [[-0.3, -0.4, -0.25], [0.3, -0.4, -0.25], [0.3, 0.4, -0.25], [-0.3, 0.4, -0.25], [-0.3, -0.4, 0.25], [0.3, -0.4, 0.25], [0.3, 0.4, 0.25], [-0.3, 0.4, 0.25]];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
  return build(verts, faces, false);
}
export function suzanneMesh() {
  const verts = [[-0.4, 0.5, -0.2], [0.4, 0.5, -0.2], [0.4, 0.5, 0.2], [-0.4, 0.5, 0.2], [-0.5, 0.2, -0.3], [0.5, 0.2, -0.3], [0.5, 0.2, 0.3], [-0.5, 0.2, 0.3], [-0.35, 0.15, 0.45], [0.35, 0.15, 0.45], [-0.2, 0.05, 0.4], [0.2, 0.05, 0.4], [-0.2, -0.15, 0.55], [0.2, -0.15, 0.55], [-0.15, -0.35, 0.5], [0.15, -0.35, 0.5], [-0.25, -0.4, 0.1], [0.25, -0.4, 0.1], [-0.3, -0.2, -0.4], [0.3, -0.2, -0.4], [-0.7, 0.2, 0.0], [-0.7, -0.1, 0.0], [0.7, 0.2, 0.0], [0.7, -0.1, 0.0]];
  const faces = [[0, 1, 2, 3], [0, 4, 5, 1], [1, 5, 6, 2], [3, 2, 6, 7], [0, 3, 7, 4], [7, 6, 9, 8], [8, 9, 11, 10], [10, 11, 13, 12], [12, 13, 15, 14], [14, 15, 17, 16], [4, 7, 18], [5, 19, 6], [18, 19, 5, 4], [16, 17, 19, 18], [4, 20, 21, 7], [6, 23, 22, 5]];
  return build(verts, faces, true);
}
export function treeMesh() {
  const verts = [];
  const faces = [];
  const sides = 6;
  for (let s = 0; s < sides; s++) {
    const th = s / sides * Math.PI * 2;
    verts.push([Math.cos(th) * 0.12, -0.5, Math.sin(th) * 0.12]);
  }
  for (let s = 0; s < sides; s++) {
    const th = s / sides * Math.PI * 2;
    verts.push([Math.cos(th) * 0.1, 0.0, Math.sin(th) * 0.1]);
  }
  for (let s = 0; s < sides; s++) {
    const nxt = (s + 1) % sides;
    faces.push([s, nxt, nxt + sides, s + sides]);
  }
  const t1_base = verts.length;
  for (let s = 0; s < sides; s++) {
    const th = s / sides * Math.PI * 2;
    verts.push([Math.cos(th) * 0.55, 0.0, Math.sin(th) * 0.55]);
  }
  const t1_apex = verts.length;
  verts.push([0, 0.45, 0]);
  for (let s = 0; s < sides; s++) {
    const nxt = (s + 1) % sides;
    faces.push([t1_apex, t1_base + s, t1_base + nxt]);
  }
  const t2_base = verts.length;
  for (let s = 0; s < sides; s++) {
    const th = s / sides * Math.PI * 2;
    verts.push([Math.cos(th) * 0.38, 0.3, Math.sin(th) * 0.38]);
  }
  const t2_apex = verts.length;
  verts.push([0, 0.75, 0]);
  for (let s = 0; s < sides; s++) {
    const nxt = (s + 1) % sides;
    faces.push([t2_apex, t2_base + s, t2_base + nxt]);
  }
  return build(verts, faces, false);
}
export function carMesh() {
  const verts = [[-0.45, -0.15, -0.9], [0.45, -0.15, -0.9], [0.45, 0.1, -0.9], [-0.45, 0.1, -0.9], [-0.45, -0.15, 0.9], [0.45, -0.15, 0.9], [0.45, 0.1, 0.9], [-0.45, 0.1, 0.9], [-0.38, 0.1, -0.4], [0.38, 0.1, -0.4], [0.32, 0.4, -0.2], [-0.32, 0.4, -0.2], [-0.38, 0.1, 0.35], [0.38, 0.1, 0.35], [0.32, 0.4, 0.25], [-0.32, 0.4, 0.25]];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5], [8, 9, 10, 11], [12, 15, 14, 13], [11, 10, 14, 15], [8, 11, 15, 12], [9, 13, 14, 10]];
  return build(verts, faces, false);
}
export function characterMesh() {
  const verts = [[-0.15, 0.5, -0.15], [0.15, 0.5, -0.15], [0.15, 0.75, -0.15], [-0.15, 0.75, -0.15], [-0.15, 0.5, 0.15], [0.15, 0.5, 0.15], [0.15, 0.75, 0.15], [-0.15, 0.75, 0.15], [-0.22, 0.05, -0.12], [0.22, 0.05, -0.12], [0.26, 0.45, -0.12], [-0.26, 0.45, -0.12], [-0.22, 0.05, 0.12], [0.22, 0.05, 0.12], [0.26, 0.45, 0.12], [-0.26, 0.45, 0.12], [-0.2, -0.5, -0.09], [-0.04, -0.5, -0.09], [-0.04, -0.5, 0.09], [-0.2, -0.5, 0.09], [0.04, -0.5, -0.09], [0.2, -0.5, -0.09], [0.2, -0.5, 0.09], [0.04, -0.5, 0.09]];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4], [8, 11, 10, 9], [12, 13, 14, 15], [8, 12, 15, 11], [9, 10, 14, 13], [11, 15, 14, 10], [8, 9, 13, 12], [16, 17, 18, 19], [8, 16, 19, 12], [20, 21, 22, 23], [9, 13, 22, 21]];
  return build(verts, faces, false);
}
export function chairMesh() {
  const verts = [[-0.3, 0.0, -0.3], [0.3, 0.0, -0.3], [0.3, 0.08, -0.3], [-0.3, 0.08, -0.3], [-0.3, 0.0, 0.3], [0.3, 0.0, 0.3], [0.3, 0.08, 0.3], [-0.3, 0.08, 0.3], [-0.3, 0.55, -0.3], [0.3, 0.55, -0.3], [0.3, 0.55, -0.24], [-0.3, 0.55, -0.24]];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4], [2, 3, 8, 9], [9, 8, 11, 10], [2, 9, 10, 6], [3, 7, 11, 8]];
  return build(verts, faces, false);
}
const cache = new Map();
export function meshFor(type, params) {
  if (!params && cache.has(type)) return cache.get(type) ?? null;
  let mesh = null;
  switch (type) {
    case 'cube':
      mesh = cubeMesh(params?.sizeX, params?.sizeY, params?.sizeZ);
      break;
    case 'sphere':
      mesh = sphereMesh(params?.segments, params?.rings, params?.radius);
      break;
    case 'icosphere':
      mesh = icoSphereMesh(params?.subdivisions, params?.radius);
      break;
    case 'cylinder':
      mesh = cylinderMesh(params?.segments, params?.innerRadius, params?.height, params?.radius);
      break;
    case 'cone':
      mesh = coneMesh(params?.segments, params?.radius, params?.height);
      break;
    case 'torus':
      mesh = torusMesh(params?.segments, params?.sides, params?.radius, params?.tube);
      break;
    case 'plane':
      if (params && (params.subdivisions && params.subdivisions > 1 || params.sizeX && params.sizeX !== 2.4)) {
        const sub = Math.max(1, Math.round(params.subdivisions ?? params.subdivX ?? 1));
        const sz = params.sizeX ?? 1;
        mesh = sub > 1 ? gridMesh(sub, sub, sz, params.sizeZ ?? sz) : gridMesh(1, 1, sz, params.sizeZ ?? sz);
      } else {
        mesh = planeMesh();
      }
      break;
    case 'circle':
      mesh = circleMesh(params?.segments, params?.radius);
      break;
    case 'grid':
      {
        const gx = params?.subdivisions ?? params?.subdivX ?? 4;
        const gy = params?.subdivisions ?? params?.subdivY ?? 4;
        const sx = params?.sizeX ?? 2;
        const sy = params?.sizeY ?? params?.sizeX ?? 2;
        mesh = gridMesh(gx, gy, sx, sy);
        break;
      }
    case 'pyramid':
      mesh = pyramidMesh(params?.sides, params?.radius, params?.height);
      break;
    case 'tube':
      mesh = tubeMesh(params?.segments, params?.innerRadius, params?.outerRadius, params?.height);
      break;
    case 'capsule':
      mesh = capsuleMesh(params?.segments, params?.rings, params?.radius, params?.height);
      break;
    case 'curve_bezier':
      mesh = bezierCurveMesh();
      break;
    case 'curve_circle':
      mesh = bezierCircleMesh();
      break;
    case 'curve_path':
      mesh = pathCurveMesh();
      break;
    case 'curve_nurbs':
      mesh = nurbsCurveMesh();
      break;
    case 'light':
    case 'light_point':
      mesh = pointLightMesh();
      break;
    case 'light_sun':
      mesh = sunLightMesh();
      break;
    case 'light_spot':
      mesh = spotLightMesh();
      break;
    case 'light_area':
      mesh = areaLightMesh();
      break;
    case 'camera':
    case 'camera_perspective':
      mesh = perspectiveCameraMesh();
      break;
    case 'camera_ortho':
      mesh = orthoCameraMesh();
      break;
    case 'empty_axes':
      mesh = emptyAxesMesh();
      break;
    case 'empty_arrows':
      mesh = emptyArrowsMesh();
      break;
    case 'empty_cube':
      mesh = emptyCubeMesh();
      break;
    case 'empty_sphere':
      mesh = emptySphereMesh();
      break;
    case 'empty_circle':
      mesh = emptyCircleMesh();
      break;
    case 'empty_image':
      mesh = emptyImageMesh();
      break;
    case 'text':
    case 'image':
      mesh = mediaPlaneMesh();
      break;
    case 'text_3d':
      mesh = text3dMesh(params?.text, params?.depth, params?.bevel);
      break;
    case 'coin':
      mesh = coinMesh();
      break;
    case 'bone':
    case 'armature':
      mesh = boneMesh();
      break;
    case 'metaball':
      mesh = metaballMesh(params?.shape);
      break;
    case 'lattice':
      mesh = latticeMesh();
      break;
    case 'forcefield':
      mesh = forceFieldMesh();
      break;
    case 'speaker':
      mesh = speakerMesh();
      break;
    case 'asset_suzanne':
      mesh = suzanneMesh();
      break;
    case 'asset_tree':
      mesh = treeMesh();
      break;
    case 'asset_car':
      mesh = carMesh();
      break;
    case 'asset_character':
      mesh = characterMesh();
      break;
    case 'asset_chair':
      mesh = chairMesh();
      break;
  }
  if (!params && mesh) cache.set(type, mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Editing & Modifier Operations
// ---------------------------------------------------------------------------

export function subdivide(mesh, smooth = true) {
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  const facePoints = mesh.faces.map(face => faceCenter(mesh, face));
  const edgePoints = new Map();
  const edgeFaces = new Map();
  const faceEdges = [];
  mesh.faces.forEach((face, faceIndex) => {
    const edges = [];
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = edgeKey(a, b);
      edges.push([a, b]);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key)?.push(faceIndex);
    }
    faceEdges.push(edges);
  });
  for (const [key, faces] of edgeFaces) {
    const [a, b] = key.split(':').map(Number);
    let midpoint;
    if (smooth && faces.length === 2) {
      const fp0 = facePoints[faces[0]];
      const fp1 = facePoints[faces[1]];
      midpoint = [(mesh.vertices[a][0] + mesh.vertices[b][0] + fp0[0] + fp1[0]) / 4, (mesh.vertices[a][1] + mesh.vertices[b][1] + fp0[1] + fp1[1]) / 4, (mesh.vertices[a][2] + mesh.vertices[b][2] + fp0[2] + fp1[2]) / 4];
    } else {
      midpoint = [(mesh.vertices[a][0] + mesh.vertices[b][0]) / 2, (mesh.vertices[a][1] + mesh.vertices[b][1]) / 2, (mesh.vertices[a][2] + mesh.vertices[b][2]) / 2];
    }
    edgePoints.set(key, vertices.length);
    vertices.push(midpoint);
  }
  if (smooth) {
    const neighbourFaces = new Map();
    const neighbourEdges = new Map();
    mesh.faces.forEach((face, faceIndex) => {
      for (const index of face) {
        if (!neighbourFaces.has(index)) neighbourFaces.set(index, []);
        neighbourFaces.get(index)?.push(faceIndex);
      }
    });
    for (const [key, pointIndex] of edgePoints) {
      const [a, b] = key.split(':').map(Number);
      for (const index of [a, b]) {
        if (!neighbourEdges.has(index)) neighbourEdges.set(index, []);
        neighbourEdges.get(index)?.push(pointIndex);
      }
    }
    mesh.vertices.forEach((vertex, index) => {
      const faces = neighbourFaces.get(index) || [];
      const edges = neighbourEdges.get(index) || [];
      if (!faces.length || !edges.length) return;
      const n = faces.length;
      let fx = 0,
        fy = 0,
        fz = 0;
      for (const faceIndex of faces) {
        fx += facePoints[faceIndex][0];
        fy += facePoints[faceIndex][1];
        fz += facePoints[faceIndex][2];
      }
      fx /= n;
      fy /= n;
      fz /= n;
      let rx = 0,
        ry = 0,
        rz = 0;
      for (const pointIndex of edges) {
        rx += (vertices[pointIndex][0] + vertex[0]) / 2;
        ry += (vertices[pointIndex][1] + vertex[1]) / 2;
        rz += (vertices[pointIndex][2] + vertex[2]) / 2;
      }
      rx /= edges.length;
      ry /= edges.length;
      rz /= edges.length;
      vertices[index] = [(fx + 2 * rx + (n - 3) * vertex[0]) / n, (fy + 2 * ry + (n - 3) * vertex[1]) / n, (fz + 2 * rz + (n - 3) * vertex[2]) / n];
    });
  }
  const facePointStart = vertices.length;
  for (const fp of facePoints) vertices.push(fp);
  const faces = [];
  const faceSlots = [];
  mesh.faces.forEach((face, faceIndex) => {
    const fp = facePointStart + faceIndex;
    const edges = faceEdges[faceIndex];
    for (let i = 0; i < face.length; i++) {
      const prev = edges[(i - 1 + edges.length) % edges.length];
      const next = edges[i];
      faces.push([face[i], edgePoints.get(edgeKey(next[0], next[1])), fp, edgePoints.get(edgeKey(prev[0], prev[1]))]);
      faceSlots.push(mesh.faceSlot?.[faceIndex] ?? 0);
    }
  });
  return finalizeMesh({
    vertices,
    faces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: faceSlots
  }, mesh.smooth ?? true);
}
export function deleteFaces(mesh, faceIndices) {
  const remove = new Set(faceIndices);
  const faces = [];
  const faceSlot = [];
  mesh.faces.forEach((face, index) => {
    if (remove.has(index)) return;
    faces.push([...face]);
    faceSlot.push(mesh.faceSlot?.[index] ?? 0);
  });
  return compactMesh(mesh.vertices, faces, mesh.smooth, faceSlot, mesh.slots ?? []);
}
export function flipNormals(mesh) {
  const faces = mesh.faces.map(f => [...f].reverse());
  return finalizeMesh({
    vertices: mesh.vertices.map(v => [v[0], v[1], v[2]]),
    faces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: [...(mesh.faceSlot ?? [])]
  }, mesh.smooth);
}
export function mergeByDistance(mesh, threshold = 0.0001) {
  const vertices = [];
  const remap = [];
  const lookup = new Map();
  const step = Math.max(1e-6, threshold);
  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i];
    const key = `${Math.round(v[0] / step)}:${Math.round(v[1] / step)}:${Math.round(v[2] / step)}`;
    const existing = lookup.get(key);
    if (existing !== undefined) {
      remap[i] = existing;
    } else {
      const index = vertices.length;
      vertices.push([v[0], v[1], v[2]]);
      lookup.set(key, index);
      remap[i] = index;
    }
  }
  const faces = [];
  const faceSlot = [];
  mesh.faces.forEach((face, faceIndex) => {
    const mapped = [];
    for (const index of face) {
      const value = remap[index];
      if (mapped[mapped.length - 1] !== value && mapped[0] !== value) mapped.push(value);
    }
    if (mapped.length < 3) return;
    faces.push(mapped);
    faceSlot.push(mesh.faceSlot?.[faceIndex] ?? 0);
  });
  return compactMesh(vertices, faces, mesh.smooth, faceSlot, mesh.slots ?? []);
}
function compactMesh(vertices, faces, smooth, faceSlot = [], slots = []) {
  const used = new Map();
  const nextVertices = [];
  const remap = index => {
    if (used.has(index)) return used.get(index);
    const target = nextVertices.length;
    nextVertices.push(vertices[index]);
    used.set(index, target);
    return target;
  };
  const nextFaces = faces.map(face => face.map(remap));
  return finalizeMesh({
    vertices: nextVertices,
    faces: nextFaces,
    edges: [],
    radius: 0,
    slots,
    faceSlot
  }, smooth);
}
export function extrudeFaces(mesh, faceIndices, distance = 0.35) {
  if (!faceIndices.length) return cloneMesh(mesh);
  const selected = new Set(faceIndices);
  const result = cloneMesh(mesh);
  let nx = 0,
    ny = 0,
    nz = 0;
  for (const index of faceIndices) {
    const fn = faceNormal(mesh, mesh.faces[index]);
    nx += fn[0];
    ny += fn[1];
    nz += fn[2];
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  const vertexCopy = new Map();
  const copyVertex = index => {
    if (vertexCopy.has(index)) return vertexCopy.get(index);
    const v = result.vertices[index];
    const target = result.vertices.length;
    result.vertices.push([v[0] + nx * distance, v[1] + ny * distance, v[2] + nz * distance]);
    vertexCopy.set(index, target);
    return target;
  };
  const boundaryEdges = new Map();
  for (const faceIndex of faceIndices) {
    const face = mesh.faces[faceIndex];
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = edgeKey(a, b);
      let shared = 0;
      for (const other of faceIndices) {
        const otherFace = mesh.faces[other];
        for (let j = 0; j < otherFace.length; j++) {
          if (edgeKey(otherFace[j], otherFace[(j + 1) % otherFace.length]) === key) shared++;
        }
      }
      if (shared < 2) boundaryEdges.set(key, [a, b]);
    }
  }
  const nextFaces = [];
  const nextFaceSlot = [];
  mesh.faces.forEach((face, index) => {
    if (!selected.has(index)) {
      nextFaces.push([...face]);
      nextFaceSlot.push(mesh.faceSlot?.[index] ?? 0);
      return;
    }
    nextFaces.push(face.map(vertexIndex => copyVertex(vertexIndex)));
    nextFaceSlot.push(mesh.faceSlot?.[index] ?? 0);
  });
  const wallSlot = mesh.faceSlot?.[faceIndices[0]] ?? 0;
  for (const [, [a, b]] of boundaryEdges) {
    nextFaces.push([a, b, copyVertex(b), copyVertex(a)]);
    nextFaceSlot.push(wallSlot);
  }
  return finalizeMesh({
    vertices: result.vertices,
    faces: nextFaces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: nextFaceSlot
  }, mesh.smooth);
}
export function insetFaces(mesh, faceIndices, amount = 0.18) {
  if (!faceIndices.length) return cloneMesh(mesh);
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  const nextFaces = [];
  for (const face of mesh.faces) nextFaces.push([...face]);
  const indexByPosition = new Map();
  const addVertex = v => {
    const key = `${v[0].toFixed(5)}:${v[1].toFixed(5)}:${v[2].toFixed(5)}`;
    const existing = indexByPosition.get(key);
    if (existing !== undefined) return existing;
    const target = vertices.length;
    vertices.push([v[0], v[1], v[2]]);
    indexByPosition.set(key, target);
    return target;
  };
  const extras = [];
  for (const faceIndex of faceIndices) {
    const face = mesh.faces[faceIndex];
    const center = faceCenter(mesh, face);
    const inner = face.map(vertexIndex => {
      const v = mesh.vertices[vertexIndex];
      return addVertex([v[0] + (center[0] - v[0]) * amount, v[1] + (center[1] - v[1]) * amount, v[2] + (center[2] - v[2]) * amount]);
    });
    nextFaces[faceIndex] = inner;
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      extras.push([a, b, inner[(i + 1) % inner.length], inner[i]]);
    }
  }
  const nextFaceSlot = [];
  mesh.faces.forEach((_, index) => {
    nextFaceSlot.push(mesh.faceSlot?.[index] ?? 0);
  });
  const rimSlot = mesh.faceSlot?.[faceIndices[0]] ?? 0;
  for (let i = 0; i < extras.length; i++) nextFaceSlot.push(rimSlot);
  return finalizeMesh({
    vertices,
    faces: [...nextFaces, ...extras],
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: nextFaceSlot
  }, mesh.smooth);
}

/**
 * Array Modifier: creates `count` copies of the mesh offset along [ox, oy, oz].
 */
export function arrayMesh(mesh, count = 3, offset = [1.25, 0, 0]) {
  const safeCount = Math.min(12, Math.max(2, Math.floor(count)));
  const vertices = [];
  const faces = [];
  const faceSlot = [];
  const vCount = mesh.vertices.length;
  for (let c = 0; c < safeCount; c++) {
    const base = c * vCount;
    const dx = offset[0] * c;
    const dy = offset[1] * c;
    const dz = offset[2] * c;
    for (let i = 0; i < vCount; i++) {
      const v = mesh.vertices[i];
      vertices.push([v[0] + dx, v[1] + dy, v[2] + dz]);
    }
    mesh.faces.forEach((face, fIdx) => {
      faces.push(face.map(idx => idx + base));
      faceSlot.push(mesh.faceSlot?.[fIdx] ?? 0);
    });
  }
  return finalizeMesh({
    vertices,
    faces,
    slots: mesh.slots,
    faceSlot
  }, mesh.smooth);
}

/**
 * Solidify Modifier: adds shell thickness along vertex normals and bridges open boundary edges.
 */
export function solidifyMesh(mesh, thickness = 0.12) {
  const normals = computeVertexNormals(mesh);
  const vCount = mesh.vertices.length;
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  for (let i = 0; i < vCount; i++) {
    const v = mesh.vertices[i];
    const n = normals[i];
    vertices.push([v[0] - n[0] * thickness, v[1] - n[1] * thickness, v[2] - n[2] * thickness]);
  }
  const faces = [];
  const faceSlot = [];
  mesh.faces.forEach((face, idx) => {
    const slot = mesh.faceSlot?.[idx] ?? 0;
    faces.push([...face]);
    faceSlot.push(slot);
    faces.push([...face].reverse().map(vIdx => vIdx + vCount));
    faceSlot.push(slot);
  });
  // Bridge boundary edges
  const edgeCount = new Map();
  mesh.faces.forEach((face, idx) => {
    const slot = mesh.faceSlot?.[idx] ?? 0;
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const k = edgeKey(a, b);
      const entry = edgeCount.get(k);
      if (entry) entry.count++;else edgeCount.set(k, {
        a,
        b,
        count: 1,
        slot
      });
    }
  });
  for (const entry of edgeCount.values()) {
    if (entry.count === 1) {
      faces.push([entry.a, entry.b, entry.b + vCount, entry.a + vCount]);
      faceSlot.push(entry.slot);
    }
  }
  return finalizeMesh({
    vertices,
    faces,
    slots: mesh.slots,
    faceSlot
  }, mesh.smooth);
}

/**
 * Laplacian Smooth Modifier: relaxes vertex positions toward their edge neighbours.
 */
export function smoothMeshVertices(mesh, iterations = 2, factor = 0.5) {
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  const adj = new Map();
  for (const [a, b] of mesh.edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  for (let iter = 0; iter < iterations; iter++) {
    const next = vertices.map(v => [v[0], v[1], v[2]]);
    for (let i = 0; i < vertices.length; i++) {
      const neighbours = adj.get(i);
      if (!neighbours || !neighbours.length) continue;
      let ax = 0,
        ay = 0,
        az = 0;
      for (const n of neighbours) {
        ax += vertices[n][0];
        ay += vertices[n][1];
        az += vertices[n][2];
      }
      ax /= neighbours.length;
      ay /= neighbours.length;
      az /= neighbours.length;
      next[i][0] = vertices[i][0] + (ax - vertices[i][0]) * factor;
      next[i][1] = vertices[i][1] + (ay - vertices[i][1]) * factor;
      next[i][2] = vertices[i][2] + (az - vertices[i][2]) * factor;
    }
    for (let i = 0; i < vertices.length; i++) vertices[i] = next[i];
  }
  return finalizeMesh({
    ...mesh,
    vertices
  }, mesh.smooth);
}

/**
 * UV Unwrap Projections: box, planar, cylindrical, spherical.
 */
export function unwrapMeshUV(mesh, mode = 'box', scale = 1) {
  const uvs = [];
  const normals = computeVertexNormals(mesh);
  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i];
    const n = normals[i] ?? [0, 1, 0];
    let u = 0.5;
    let t = 0.5;
    if (mode === 'planar') {
      u = (v[0] + 0.5) * scale;
      t = (v[2] + 0.5) * scale;
    } else if (mode === 'cylindrical') {
      u = (Math.atan2(v[2], v[0]) / (Math.PI * 2) + 0.5) * scale;
      t = (v[1] + 0.5) * scale;
    } else if (mode === 'spherical') {
      const r = Math.hypot(v[0], v[1], v[2]) || 1;
      u = (Math.atan2(v[2], v[0]) / (Math.PI * 2) + 0.5) * scale;
      t = (0.5 - Math.asin(Math.max(-1, Math.min(1, v[1] / r))) / Math.PI) * scale;
    } else {
      const ax = Math.abs(n[0]),
        ay = Math.abs(n[1]),
        az = Math.abs(n[2]);
      if (ax >= ay && ax >= az) {
        u = (v[2] + 0.5) * scale;
        t = (v[1] + 0.5) * scale;
      } else if (ay >= az) {
        u = (v[0] + 0.5) * scale;
        t = (v[2] + 0.5) * scale;
      } else {
        u = (v[0] + 0.5) * scale;
        t = (v[1] + 0.5) * scale;
      }
    }
    uvs.push([u, t]);
  }
  const result = cloneMesh(mesh);
  result.uvs = uvs;
  return result;
}

/**
 * Bakes procedural lighting / Ambient Occlusion / Curvature / Height Gradient into per-vertex colors.
 */
export function bakeMeshVertexColors(mesh, mode = 'ao') {
  const result = cloneMesh(mesh);
  const normals = computeVertexNormals(result);
  const vCount = result.vertices.length;
  const colors = new Array(vCount * 3);
  const adj = new Map();
  for (const [a, b] of result.edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  let minY = Infinity,
    maxY = -Infinity;
  for (const v of result.vertices) {
    if (v[1] < minY) minY = v[1];
    if (v[1] > maxY) maxY = v[1];
  }
  const spanY = Math.max(0.001, maxY - minY);
  for (let i = 0; i < vCount; i++) {
    const v = result.vertices[i];
    const n = normals[i] ?? [0, 1, 0];
    let r = 1,
      g = 1,
      b = 1;
    if (mode === 'ao') {
      const list = adj.get(i) ?? [];
      let cavity = 0;
      for (const nb of list) {
        const nv = result.vertices[nb];
        const dx = nv[0] - v[0],
          dy = nv[1] - v[1],
          dz = nv[2] - v[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        cavity += (dx * n[0] + dy * n[1] + dz * n[2]) / len;
      }
      const avg = list.length ? cavity / list.length : 0;
      const shade = Math.min(1, Math.max(0.18, 0.72 - avg * 0.65 + (v[1] - minY) / spanY * 0.22));
      r = shade;
      g = shade;
      b = shade * 1.03;
    } else if (mode === 'light') {
      const ndl = Math.max(0, n[0] * -0.45 + n[1] * 0.82 + n[2] * 0.45);
      const warm = 0.25 + ndl * 0.75;
      r = Math.min(1, warm * 1.06);
      g = Math.min(1, warm * 0.98);
      b = Math.min(1, 0.32 + ndl * 0.62);
    } else if (mode === 'gradient') {
      const t = (v[1] - minY) / spanY;
      r = 0.2 + t * 0.75;
      g = 0.35 + t * 0.6;
      b = 0.55 + (1 - t) * 0.4;
    } else {
      const list = adj.get(i) ?? [];
      let lapX = 0,
        lapY = 0,
        lapZ = 0;
      for (const nb of list) {
        lapX += result.vertices[nb][0] - v[0];
        lapY += result.vertices[nb][1] - v[1];
        lapZ += result.vertices[nb][2] - v[2];
      }
      const curv = list.length ? Math.min(1, Math.hypot(lapX, lapY, lapZ) / list.length * 3.5) : 0.5;
      r = 0.25 + curv * 0.75;
      g = 0.3 + curv * 0.68;
      b = 0.45 + (1 - curv) * 0.45;
    }
    colors[i * 3] = Math.min(1, Math.max(0, r));
    colors[i * 3 + 1] = Math.min(1, Math.max(0, g));
    colors[i * 3 + 2] = Math.min(1, Math.max(0, b));
  }
  result.colors = colors;
  return result;
}
export function transformVertices(mesh, indices, fn) {
  const result = cloneMesh(mesh);
  for (const index of indices) {
    if (index < 0 || index >= result.vertices.length) continue;
    result.vertices[index] = fn(result.vertices[index]);
  }
  return finalizeMesh(result, mesh.smooth);
}
export function triangulate(mesh) {
  const positions = [];
  const indices = [];
  for (const face of mesh.faces) {
    const base = positions.length / 3;
    for (const index of face) {
      const v = mesh.vertices[index];
      positions.push(v[0], v[1], v[2]);
    }
    for (let i = 1; i < face.length - 1; i++) indices.push(base, base + i, base + i + 1);
  }
  return {
    positions,
    indices
  };
}
export function bridgeEdgeLoops(mesh, loop1, loop2) {
  if (!loop1.length || !loop2.length) return mesh;
  const faces = mesh.faces.map(f => [...f]);
  const faceSlots = [...(mesh.faceSlot ?? [])];
  const n = Math.min(loop1.length, loop2.length);
  for (let i = 0; i < n; i++) {
    const nextI = (i + 1) % n;
    const a = loop1[i];
    const b = loop1[nextI];
    const c = loop2[nextI];
    const d = loop2[i];
    faces.push([a, b, c, d]);
    faceSlots.push(0);
  }
  return finalizeMesh({
    vertices: mesh.vertices.map(v => [v[0], v[1], v[2]]),
    faces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: faceSlots
  }, mesh.smooth);
}
export function mergeVertices(mesh, vertexIndices, mode = 'center', threshold = 0.001) {
  if (!vertexIndices.length) return mesh;
  if (mode === 'distance') {
    const vertices = [];
    const remap = new Map();
    mesh.vertices.forEach((v, idx) => {
      if (!vertexIndices.includes(idx)) {
        remap.set(idx, vertices.length);
        vertices.push([...v]);
        return;
      }
      let found = -1;
      for (let i = 0; i < vertices.length; i++) {
        const existing = vertices[i];
        if (Math.hypot(v[0] - existing[0], v[1] - existing[1], v[2] - existing[2]) <= threshold) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        remap.set(idx, found);
      } else {
        remap.set(idx, vertices.length);
        vertices.push([...v]);
      }
    });
    const faces = [];
    const faceSlots = [];
    mesh.faces.forEach((face, fIdx) => {
      const remapped = face.map(vi => remap.get(vi) ?? vi);
      const unique = remapped.filter((v, i, arr) => arr.indexOf(v) === i);
      if (unique.length >= 3) {
        faces.push(unique);
        faceSlots.push(mesh.faceSlot?.[fIdx] ?? 0);
      }
    });
    return finalizeMesh({
      vertices,
      faces,
      edges: [],
      radius: 0,
      slots: mesh.slots ?? [],
      faceSlot: faceSlots
    }, mesh.smooth);
  }
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  let targetPos;
  let targetIdx;
  if (mode === 'first') {
    targetIdx = vertexIndices[0];
    targetPos = [...vertices[targetIdx]];
  } else if (mode === 'last') {
    targetIdx = vertexIndices[vertexIndices.length - 1];
    targetPos = [...vertices[targetIdx]];
  } else {
    let sx = 0,
      sy = 0,
      sz = 0;
    for (const vi of vertexIndices) {
      sx += vertices[vi][0];
      sy += vertices[vi][1];
      sz += vertices[vi][2];
    }
    targetPos = [sx / vertexIndices.length, sy / vertexIndices.length, sz / vertexIndices.length];
    targetIdx = vertexIndices[0];
  }
  vertices[targetIdx] = targetPos;
  const remap = new Map();
  for (const vi of vertexIndices) {
    remap.set(vi, targetIdx);
  }
  const faces = [];
  const faceSlots = [];
  mesh.faces.forEach((face, fIdx) => {
    const remapped = face.map(vi => remap.get(vi) ?? vi);
    const collapsed = [];
    for (let i = 0; i < remapped.length; i++) {
      const prev = collapsed[collapsed.length - 1];
      if (remapped[i] !== prev) {
        collapsed.push(remapped[i]);
      }
    }
    if (collapsed.length > 2 && collapsed[0] === collapsed[collapsed.length - 1]) {
      collapsed.pop();
    }
    const unique = new Set(collapsed);
    if (unique.size >= 3) {
      faces.push(collapsed);
      faceSlots.push(mesh.faceSlot?.[fIdx] ?? 0);
    }
  });
  const used = new Map();
  const nextVertices = [];
  const compactRemap = idx => {
    if (used.has(idx)) return used.get(idx);
    const nIdx = nextVertices.length;
    nextVertices.push(vertices[idx]);
    used.set(idx, nIdx);
    return nIdx;
  };
  const nextFaces = faces.map(f => f.map(compactRemap));
  return finalizeMesh({
    vertices: nextVertices,
    faces: nextFaces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: faceSlots
  }, mesh.smooth);
}
export function deleteGeometry(mesh, kind, indices) {
  if (!indices.length) return mesh;
  const indexSet = new Set(indices);
  let remainingFaces = [];
  let faceSlots = [];
  if (kind === 'face') {
    mesh.faces.forEach((f, idx) => {
      if (!indexSet.has(idx)) {
        remainingFaces.push([...f]);
        faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
      }
    });
  } else if (kind === 'vertex') {
    mesh.faces.forEach((f, idx) => {
      const hasVertex = f.some(vi => indexSet.has(vi));
      if (!hasVertex) {
        remainingFaces.push([...f]);
        faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
      }
    });
  } else if (kind === 'edge') {
    const deletedEdges = indices.map(i => mesh.edges[i]).filter(Boolean);
    const edgeSet = new Set(deletedEdges.map(e => e[0] < e[1] ? `${e[0]}_${e[1]}` : `${e[1]}_${e[0]}`));
    mesh.faces.forEach((f, idx) => {
      let containsDeletedEdge = false;
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        const b = f[(i + 1) % f.length];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (edgeSet.has(k)) {
          containsDeletedEdge = true;
          break;
        }
      }
      if (!containsDeletedEdge) {
        remainingFaces.push([...f]);
        faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
      }
    });
  }
  if (!remainingFaces.length) {
    return finalizeMesh({
      vertices: [],
      faces: [],
      edges: [],
      radius: 0,
      slots: mesh.slots ?? []
    }, mesh.smooth);
  }
  const used = new Map();
  const nextVertices = [];
  const compactRemap = idx => {
    if (used.has(idx)) return used.get(idx);
    const nIdx = nextVertices.length;
    nextVertices.push(mesh.vertices[idx]);
    used.set(idx, nIdx);
    return nIdx;
  };
  const nextFaces = remainingFaces.map(f => f.map(compactRemap));
  return finalizeMesh({
    vertices: nextVertices,
    faces: nextFaces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: faceSlots
  }, mesh.smooth);
}
export function dissolveGeometry(mesh, kind, indices) {
  if (!indices.length) return mesh;
  if (kind === 'face') {
    const faceSet = new Set(indices);
    if (faceSet.size <= 1) return mesh;
    const edgeCounts = new Map();
    for (const fIdx of indices) {
      const face = mesh.faces[fIdx];
      if (!face) continue;
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        const entry = edgeCounts.get(k) || {
          a,
          b,
          count: 0
        };
        entry.count++;
        edgeCounts.set(k, entry);
      }
    }
    const boundaryEdges = [];
    for (const entry of edgeCounts.values()) {
      if (entry.count === 1) {
        boundaryEdges.push([entry.a, entry.b]);
      }
    }
    if (boundaryEdges.length < 3) return mesh;
    const adj = new Map();
    for (const [a, b] of boundaryEdges) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
    const mergedFace = [];
    let start = boundaryEdges[0][0];
    let current = start;
    let prev = -1;
    const visited = new Set();
    for (let step = 0; step < boundaryEdges.length; step++) {
      mergedFace.push(current);
      visited.add(current);
      const neighbors = adj.get(current) || [];
      const next = neighbors.find(n => n !== prev && (!visited.has(n) || n === start));
      if (next === undefined || next === start) break;
      prev = current;
      current = next;
    }
    if (mergedFace.length < 3) return mesh;
    const faces = [];
    const faceSlots = [];
    mesh.faces.forEach((f, idx) => {
      if (!faceSet.has(idx)) {
        faces.push([...f]);
        faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
      }
    });
    faces.push(mergedFace);
    faceSlots.push(mesh.faceSlot?.[indices[0]] ?? 0);
    return finalizeMesh({
      vertices: mesh.vertices.map(v => [v[0], v[1], v[2]]),
      faces,
      edges: [],
      radius: 0,
      slots: mesh.slots ?? [],
      faceSlot: faceSlots
    }, mesh.smooth);
  }
  if (kind === 'edge') {
    const edge = mesh.edges[indices[0]];
    if (!edge) return mesh;
    const [ea, eb] = edge;
    const sharingFaces = [];
    mesh.faces.forEach((f, idx) => {
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        const b = f[(i + 1) % f.length];
        if (a === ea && b === eb || a === eb && b === ea) {
          sharingFaces.push(idx);
          break;
        }
      }
    });
    if (sharingFaces.length === 2) {
      return dissolveGeometry(mesh, 'face', sharingFaces);
    }
    return deleteGeometry(mesh, 'face', sharingFaces);
  }
  if (kind === 'vertex') {
    const vi = indices[0];
    const sharingFaces = [];
    mesh.faces.forEach((f, idx) => {
      if (f.includes(vi)) sharingFaces.push(idx);
    });
    if (sharingFaces.length >= 2) {
      return dissolveGeometry(mesh, 'face', sharingFaces);
    }
    return deleteGeometry(mesh, 'face', sharingFaces);
  }
  return mesh;
}
export function duplicateMeshGeometry(mesh, kind, indices) {
  if (!indices.length) return {
    mesh,
    newVertexIndices: [],
    newFaceIndices: []
  };
  let facesToDup = [];
  if (kind === 'face') {
    facesToDup = [...indices];
  } else if (kind === 'vertex') {
    const vSet = new Set(indices);
    mesh.faces.forEach((f, idx) => {
      if (f.some(vi => vSet.has(vi))) facesToDup.push(idx);
    });
  } else if (kind === 'edge') {
    const eSet = new Set(indices.map(i => mesh.edges[i]).filter(Boolean).map(e => `${e[0]}_${e[1]}`));
    mesh.faces.forEach((f, idx) => {
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        const b = f[(i + 1) % f.length];
        if (eSet.has(`${a}_${b}`) || eSet.has(`${b}_${a}`)) {
          facesToDup.push(idx);
          break;
        }
      }
    });
  }
  if (!facesToDup.length) return {
    mesh,
    newVertexIndices: [],
    newFaceIndices: []
  };
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  const faces = mesh.faces.map(f => [...f]);
  const faceSlots = [...(mesh.faceSlot ?? [])];
  const vRemap = new Map();
  const newVertexIndices = [];
  for (const fIdx of facesToDup) {
    const f = mesh.faces[fIdx];
    for (const vi of f) {
      if (!vRemap.has(vi)) {
        const nVi = vertices.length;
        vertices.push([...mesh.vertices[vi]]);
        vRemap.set(vi, nVi);
        newVertexIndices.push(nVi);
      }
    }
  }
  const newFaceIndices = [];
  for (const fIdx of facesToDup) {
    const oldFace = mesh.faces[fIdx];
    const nFace = oldFace.map(vi => vRemap.get(vi));
    newFaceIndices.push(faces.length);
    faces.push(nFace);
    faceSlots.push(mesh.faceSlot?.[fIdx] ?? 0);
  }
  const nextMesh = finalizeMesh({
    vertices,
    faces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: faceSlots
  }, mesh.smooth);
  return {
    mesh: nextMesh,
    newVertexIndices,
    newFaceIndices
  };
}
export function separateGeometry(mesh, faceIndices) {
  const faceSet = new Set(faceIndices);
  const sepFaces = [];
  const sepFaceSlots = [];
  const remFaces = [];
  const remFaceSlots = [];
  mesh.faces.forEach((f, idx) => {
    if (faceSet.has(idx)) {
      sepFaces.push([...f]);
      sepFaceSlots.push(mesh.faceSlot?.[idx] ?? 0);
    } else {
      remFaces.push([...f]);
      remFaceSlots.push(mesh.faceSlot?.[idx] ?? 0);
    }
  });
  const usedSep = new Map();
  const sepVerts = [];
  const compactSepRemap = idx => {
    if (usedSep.has(idx)) return usedSep.get(idx);
    const n = sepVerts.length;
    sepVerts.push(mesh.vertices[idx]);
    usedSep.set(idx, n);
    return n;
  };
  const finalSepFaces = sepFaces.map(f => f.map(compactSepRemap));
  const separatedMesh = finalizeMesh({
    vertices: sepVerts,
    faces: finalSepFaces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: sepFaceSlots
  }, mesh.smooth);
  const usedRem = new Map();
  const remVerts = [];
  const compactRemRemap = idx => {
    if (usedRem.has(idx)) return usedRem.get(idx);
    const n = remVerts.length;
    remVerts.push(mesh.vertices[idx]);
    usedRem.set(idx, n);
    return n;
  };
  const finalRemFaces = remFaces.map(f => f.map(compactRemRemap));
  const remainingMesh = finalizeMesh({
    vertices: remVerts,
    faces: finalRemFaces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: remFaceSlots
  }, mesh.smooth);
  return {
    remainingMesh,
    separatedMesh
  };
}
export function mirrorMesh(mesh, axis, weldThreshold = 0.001) {
  const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  const faces = mesh.faces.map(f => [...f]);
  const faceSlots = [...(mesh.faceSlot ?? [])];
  const vRemap = new Map();
  mesh.vertices.forEach((v, idx) => {
    if (Math.abs(v[axisIdx]) <= weldThreshold) {
      vRemap.set(idx, idx);
    } else {
      const nVi = vertices.length;
      const mirrored = [v[0], v[1], v[2]];
      mirrored[axisIdx] = -mirrored[axisIdx];
      vertices.push(mirrored);
      vRemap.set(idx, nVi);
    }
  });
  mesh.faces.forEach((f, idx) => {
    const mirroredFace = f.map(vi => vRemap.get(vi)).reverse();
    faces.push(mirroredFace);
    faceSlots.push(mesh.faceSlot?.[idx] ?? 0);
  });
  return finalizeMesh({
    vertices,
    faces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: faceSlots
  }, mesh.smooth);
}
export function decimateMesh(mesh, ratio = 0.5) {
  const targetFaces = Math.max(4, Math.floor(mesh.faces.length * Math.max(0.05, Math.min(1, ratio))));
  if (mesh.faces.length <= targetFaces) return mesh;
  let currentMesh = mesh;
  let attempts = 0;
  while ((currentMesh.faces.length > targetFaces || currentMesh.vertices.length > targetFaces + 2) && attempts < 100) {
    attempts++;
    let shortestLen = Infinity;
    let bestEdge = null;
    for (const edge of currentMesh.edges) {
      const v0 = currentMesh.vertices[edge[0]];
      const v1 = currentMesh.vertices[edge[1]];
      if (!v0 || !v1) continue;
      const dist = Math.hypot(v0[0] - v1[0], v0[1] - v1[1], v0[2] - v1[2]);
      if (dist < shortestLen) {
        shortestLen = dist;
        bestEdge = edge;
      }
    }
    if (!bestEdge) break;
    const next = mergeVertices(currentMesh, [bestEdge[0], bestEdge[1]], 'center');
    if (next.vertices.length >= currentMesh.vertices.length) break;
    currentMesh = next;
  }
  return currentMesh;
}
export function screwSpinMesh(mesh, axis = 'z', angleDeg = 360, steps = 16, screwPitch = 0) {
  if (!mesh.vertices.length) return mesh;
  const angleRad = angleDeg * Math.PI / 180;
  const totalSteps = Math.max(3, steps);
  const baseVerts = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  const numBase = baseVerts.length;
  const vertices = [];
  const faces = [];
  const faceSlots = [];
  for (let s = 0; s <= totalSteps; s++) {
    const frac = s / totalSteps;
    const a = frac * angleRad;
    const pitchOffset = frac * screwPitch;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    for (let vi = 0; vi < numBase; vi++) {
      const p = baseVerts[vi];
      let x = p[0],
        y = p[1],
        z = p[2];
      if (axis === 'z') {
        const nx = x * cosA - y * sinA;
        const ny = x * sinA + y * cosA;
        vertices.push([nx, ny, z + pitchOffset]);
      } else if (axis === 'y') {
        const nx = x * cosA + z * sinA;
        const nz = -x * sinA + z * cosA;
        vertices.push([nx, y + pitchOffset, nz]);
      } else {
        const ny = y * cosA - z * sinA;
        const nz = y * sinA + z * cosA;
        vertices.push([x + pitchOffset, ny, nz]);
      }
    }
  }
  for (let s = 0; s < totalSteps; s++) {
    const ringA = s * numBase;
    const ringB = (s + 1) * numBase;
    for (const edge of mesh.edges) {
      const a = ringA + edge[0];
      const b = ringA + edge[1];
      const c = ringB + edge[1];
      const d = ringB + edge[0];
      faces.push([a, b, c, d]);
      faceSlots.push(0);
    }
  }
  return finalizeMesh({
    vertices,
    faces,
    edges: [],
    radius: 0,
    slots: mesh.slots ?? [],
    faceSlot: faceSlots
  }, mesh.smooth);
}
function rayTriIntersection(orig, dir, v0, v1, v2) {
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
  const h = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
  const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  if (Math.abs(a) < 1e-6) return false;
  const fInv = 1.0 / a;
  const s = [orig[0] - v0[0], orig[1] - v0[1], orig[2] - v0[2]];
  const u = fInv * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
  if (u < 0.0 || u > 1.0) return false;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = fInv * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]);
  if (v < 0.0 || u + v > 1.0) return false;
  const t = fInv * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
  return t > 1e-5;
}
export function isPointInsideMesh(pt, mesh) {
  const dir = [0.904, 0.208, 0.373];
  let hits = 0;
  for (const f of mesh.faces) {
    for (let i = 1; i < f.length - 1; i++) {
      if (rayTriIntersection(pt, dir, mesh.vertices[f[0]], mesh.vertices[f[i]], mesh.vertices[f[i + 1]])) {
        hits++;
      }
    }
  }
  return hits % 2 === 1;
}
export function booleanMesh(meshA, meshB, op = 'difference') {
  const faces = [];
  const faceSlots = [];
  const vertices = meshA.vertices.map(v => [v[0], v[1], v[2]]);
  const bVertStart = vertices.length;
  meshB.vertices.forEach(v => vertices.push([v[0], v[1], v[2]]));
  meshA.faces.forEach((f, idx) => {
    const c = faceCenter(meshA, f);
    const inside = isPointInsideMesh(c, meshB);
    if (op === 'union' && !inside) {
      faces.push([...f]);
      faceSlots.push(meshA.faceSlot?.[idx] ?? 0);
    } else if (op === 'difference' && !inside) {
      faces.push([...f]);
      faceSlots.push(meshA.faceSlot?.[idx] ?? 0);
    } else if (op === 'intersect' && inside) {
      faces.push([...f]);
      faceSlots.push(meshA.faceSlot?.[idx] ?? 0);
    }
  });
  const slotOffsetB = (meshA.slots ?? []).length;
  meshB.faces.forEach((f, idx) => {
    const c = faceCenter(meshB, f);
    const inside = isPointInsideMesh(c, meshA);
    const mapped = f.map(v => v + bVertStart);
    const bSlot = (meshB.faceSlot?.[idx] ?? 0) + slotOffsetB;
    if (op === 'union' && !inside) {
      faces.push(mapped);
      faceSlots.push(bSlot);
    } else if (op === 'difference' && inside) {
      faces.push([...mapped].reverse());
      faceSlots.push(bSlot);
    } else if (op === 'intersect' && inside) {
      faces.push(mapped);
      faceSlots.push(bSlot);
    }
  });
  return finalizeMesh({
    vertices,
    faces,
    edges: [],
    radius: 0,
    slots: [...(meshA.slots ?? []), ...(meshB.slots ?? [])],
    faceSlot: faceSlots
  }, meshA.smooth);
}
export function joinMeshes(items) {
  if (!items.length) return cubeMesh();
  const vertices = [];
  const faces = [];
  const faceSlots = [];
  const slots = [];
  for (const item of items) {
    const m = item.mesh;
    const offset = vertices.length;
    const slotOffset = slots.length;
    const pos = item.position ?? [0, 0, 0];
    const scl = item.scale ?? [1, 1, 1];
    for (const v of m.vertices) {
      vertices.push([v[0] * scl[0] + pos[0], v[1] * scl[1] + pos[1], v[2] * scl[2] + pos[2]]);
    }
    for (let fi = 0; fi < m.faces.length; fi++) {
      faces.push(m.faces[fi].map(vi => vi + offset));
      faceSlots.push((m.faceSlot?.[fi] ?? 0) + slotOffset);
    }
    if (m.slots && m.slots.length) {
      for (const s of m.slots) slots.push({
        ...s
      });
    } else {
      slots.push(defaultMaterialSlot());
    }
  }
  return finalizeMesh({
    vertices,
    faces,
    edges: [],
    radius: 0,
    slots,
    faceSlot: faceSlots
  });
}
export function decimateLocal(mesh, center, radius) {
  const r2 = radius * radius;
  const candidates = [];
  for (const [a, b] of mesh.edges) {
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    if (!va || !vb) continue;
    if (mesh.mask && ((mesh.mask[a] ?? 0) >= 0.95 || (mesh.mask[b] ?? 0) >= 0.95)) continue;
    const da = (va[0] - center[0]) ** 2 + (va[1] - center[1]) ** 2 + (va[2] - center[2]) ** 2;
    const db = (vb[0] - center[0]) ** 2 + (vb[1] - center[1]) ** 2 + (vb[2] - center[2]) ** 2;
    if (da <= r2 && db <= r2) candidates.push([a, b]);
  }
  if (!candidates.length) return mesh;
  candidates.sort((e1, e2) => {
    const a1 = mesh.vertices[e1[0]],
      b1 = mesh.vertices[e1[1]];
    const a2 = mesh.vertices[e2[0]],
      b2 = mesh.vertices[e2[1]];
    return Math.hypot(a1[0] - b1[0], a1[1] - b1[1], a1[2] - b1[2]) - Math.hypot(a2[0] - b2[0], a2[1] - b2[1], a2[2] - b2[2]);
  });
  let current = mesh;
  for (let i = 0; i < Math.min(3, candidates.length); i++) {
    const pair = candidates[i];
    if (pair[0] >= current.vertices.length || pair[1] >= current.vertices.length) continue;
    const next = mergeVertices(current, [pair[0], pair[1]], 'center');
    if (next.vertices.length < current.vertices.length) current = next;
  }
  return current;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsibWVzaC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IFZlYzMgfSBmcm9tICcuL21hdGgzZCc7XG5cbmV4cG9ydCB0eXBlIEZhY2UgPSBudW1iZXJbXTtcblxuZXhwb3J0IGludGVyZmFjZSBNYXRlcmlhbFNsb3Qge1xuXHRuYW1lOiBzdHJpbmc7XG5cdGNvbG9yOiBzdHJpbmc7XG5cdGVtaXNzaXZlOiBzdHJpbmc7XG5cdGVtaXNzaXZlU3RyZW5ndGg6IG51bWJlcjtcblx0bWV0YWxuZXNzOiBudW1iZXI7XG5cdHJvdWdobmVzczogbnVtYmVyO1xuXHRvcGFjaXR5OiBudW1iZXI7XG5cdHV2UmVwZWF0OiBudW1iZXI7XG5cdHByZXNldElkPzogc3RyaW5nO1xuXHRpbWFnZVVybD86IHN0cmluZztcblx0cm91Z2huZXNzVXJsPzogc3RyaW5nO1xuXHRub3JtYWxVcmw/OiBzdHJpbmc7XG5cdG1ldGFsbGljVXJsPzogc3RyaW5nO1xuXHRlbWlzc2lvblVybD86IHN0cmluZztcblx0c3BlY3VsYXI/OiBudW1iZXI7XG5cdG5vcm1hbFN0cmVuZ3RoPzogbnVtYmVyO1xuXHRibGVuZE1vZGU/OiAnb3BhcXVlJyB8ICdibGVuZCcgfCAnY2xpcCc7XG5cdHV2U2NhbGVZPzogbnVtYmVyO1xuXHR1dk9mZnNldFg/OiBudW1iZXI7XG5cdHV2T2Zmc2V0WT86IG51bWJlcjtcblx0dXZSb3RhdGlvbj86IG51bWJlcjtcblx0dGV4TWFwcGluZz86IG51bWJlcjtcblx0dGV4U3RyZW5ndGg/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2VvbWV0cnlHcm91cCB7XG5cdHN0YXJ0OiBudW1iZXI7XG5cdGNvdW50OiBudW1iZXI7XG5cdG1hdGVyaWFsSW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNZXNoIHtcblx0dmVydGljZXM6IFZlYzNbXTtcblx0ZmFjZXM6IEZhY2VbXTtcblx0ZWRnZXM6IFtudW1iZXIsIG51bWJlcl1bXTtcblx0cmFkaXVzOiBudW1iZXI7XG5cdG5vcm1hbHM/OiBWZWMzW107XG5cdGNvbG9ycz86IG51bWJlcltdO1xuXHRtYXNrPzogbnVtYmVyW107XG5cdHV2cz86IFtudW1iZXIsIG51bWJlcl1bXTtcblx0c21vb3RoPzogYm9vbGVhbjtcblx0c2xvdHM6IE1hdGVyaWFsU2xvdFtdO1xuXHRmYWNlU2xvdDogbnVtYmVyW107XG5cdGdyb3VwczogR2VvbWV0cnlHcm91cFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdE1hdGVyaWFsU2xvdChuYW1lID0gJ01hdGVyaWFsJyk6IE1hdGVyaWFsU2xvdCB7XG5cdHJldHVybiB7XG5cdFx0bmFtZSxcblx0XHRjb2xvcjogJyNmZmZmZmYnLFxuXHRcdGVtaXNzaXZlOiAnIzAwMDAwMCcsXG5cdFx0ZW1pc3NpdmVTdHJlbmd0aDogMSxcblx0XHRtZXRhbG5lc3M6IDAuMDQsXG5cdFx0cm91Z2huZXNzOiAwLjM2LFxuXHRcdG9wYWNpdHk6IDEsXG5cdFx0dXZSZXBlYXQ6IDEsXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZU1hdGVyaWFsU2xvdChzbG90OiBNYXRlcmlhbFNsb3QpOiBNYXRlcmlhbFNsb3Qge1xuXHRyZXR1cm4geyAuLi5zbG90IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZU1lc2gobWVzaDogTWVzaCk6IE1lc2gge1xuXHRyZXR1cm4ge1xuXHRcdHZlcnRpY2VzOiBtZXNoLnZlcnRpY2VzLm1hcCgodikgPT4gW3ZbMF0sIHZbMV0sIHZbMl1dIGFzIFZlYzMpLFxuXHRcdGZhY2VzOiBtZXNoLmZhY2VzLm1hcCgoZikgPT4gWy4uLmZdKSxcblx0XHRlZGdlczogbWVzaC5lZGdlcy5tYXAoKGUpID0+IFtlWzBdLCBlWzFdXSBhcyBbbnVtYmVyLCBudW1iZXJdKSxcblx0XHRyYWRpdXM6IG1lc2gucmFkaXVzLFxuXHRcdG5vcm1hbHM6IG1lc2gubm9ybWFscz8ubWFwKChuKSA9PiBbblswXSwgblsxXSwgblsyXV0gYXMgVmVjMyksXG5cdFx0Y29sb3JzOiBtZXNoLmNvbG9ycyA/IFsuLi5tZXNoLmNvbG9yc10gOiB1bmRlZmluZWQsXG5cdFx0bWFzazogbWVzaC5tYXNrID8gWy4uLm1lc2gubWFza10gOiB1bmRlZmluZWQsXG5cdFx0dXZzOiBtZXNoLnV2cz8ubWFwKCh1dikgPT4gW3V2WzBdLCB1dlsxXV0gYXMgW251bWJlciwgbnVtYmVyXSksXG5cdFx0c21vb3RoOiBtZXNoLnNtb290aCxcblx0XHRzbG90czogKG1lc2guc2xvdHMgPz8gW10pLm1hcChjbG9uZU1hdGVyaWFsU2xvdCksXG5cdFx0ZmFjZVNsb3Q6IFsuLi4obWVzaC5mYWNlU2xvdCA/PyBbXSldLFxuXHRcdGdyb3VwczogKG1lc2guZ3JvdXBzID8/IFtdKS5tYXAoKGdyb3VwKSA9PiAoeyAuLi5ncm91cCB9KSksXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEdyb3VwcyhtZXNoOiBNZXNoKTogR2VvbWV0cnlHcm91cFtdIHtcblx0Y29uc3QgZ3JvdXBzOiBHZW9tZXRyeUdyb3VwW10gPSBbXTtcblx0bGV0IHRyaWFuZ2xlSW5kZXggPSAwO1xuXHRsZXQgY3VycmVudDogR2VvbWV0cnlHcm91cCB8IG51bGwgPSBudWxsO1xuXHRtZXNoLmZhY2VzLmZvckVhY2goKGZhY2UsIGZhY2VJbmRleCkgPT4ge1xuXHRcdGNvbnN0IHNsb3QgPSBtZXNoLmZhY2VTbG90Py5bZmFjZUluZGV4XSA/PyAwO1xuXHRcdGNvbnN0IHRyaWFuZ2xlcyA9IE1hdGgubWF4KDAsIGZhY2UubGVuZ3RoIC0gMik7XG5cdFx0aWYgKGN1cnJlbnQgJiYgY3VycmVudC5tYXRlcmlhbEluZGV4ID09PSBzbG90KSB7XG5cdFx0XHRjdXJyZW50LmNvdW50ICs9IHRyaWFuZ2xlcyAqIDM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChjdXJyZW50KSBncm91cHMucHVzaChjdXJyZW50KTtcblx0XHRcdGN1cnJlbnQgPSB7IHN0YXJ0OiB0cmlhbmdsZUluZGV4ICogMywgY291bnQ6IHRyaWFuZ2xlcyAqIDMsIG1hdGVyaWFsSW5kZXg6IHNsb3QgfTtcblx0XHR9XG5cdFx0dHJpYW5nbGVJbmRleCArPSB0cmlhbmdsZXM7XG5cdH0pO1xuXHRpZiAoY3VycmVudCkgZ3JvdXBzLnB1c2goY3VycmVudCk7XG5cdHJldHVybiBncm91cHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRHcm91cChtZXNoOiBNZXNoLCBmYWNlSW5kZXg6IG51bWJlciwgbWF0ZXJpYWxJbmRleDogbnVtYmVyKTogTWVzaCB7XG5cdGlmIChmYWNlSW5kZXggPCAwIHx8IGZhY2VJbmRleCA+PSBtZXNoLmZhY2VzLmxlbmd0aCkgcmV0dXJuIG1lc2g7XG5cdGNvbnN0IHNsb3RzID0gKG1lc2guc2xvdHMgPz8gW10pLm1hcChjbG9uZU1hdGVyaWFsU2xvdCk7XG5cdHdoaWxlIChzbG90cy5sZW5ndGggPD0gbWF0ZXJpYWxJbmRleCkgc2xvdHMucHVzaChkZWZhdWx0TWF0ZXJpYWxTbG90KGBTbG90ICR7c2xvdHMubGVuZ3RofWApKTtcblx0Y29uc3QgZmFjZVNsb3QgPSBbLi4uKG1lc2guZmFjZVNsb3QgPz8gbWVzaC5mYWNlcy5tYXAoKCkgPT4gMCkpXTtcblx0d2hpbGUgKGZhY2VTbG90Lmxlbmd0aCA8IG1lc2guZmFjZXMubGVuZ3RoKSBmYWNlU2xvdC5wdXNoKDApO1xuXHRmYWNlU2xvdFtmYWNlSW5kZXhdID0gbWF0ZXJpYWxJbmRleDtcblx0Y29uc3QgbmV4dDogTWVzaCA9IHsgLi4ubWVzaCwgc2xvdHMsIGZhY2VTbG90IH07XG5cdG5leHQuZ3JvdXBzID0gYnVpbGRHcm91cHMobmV4dCk7XG5cdHJldHVybiBuZXh0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXNzaWduRmFjZXNUb1Nsb3QobWVzaDogTWVzaCwgZmFjZUluZGljZXM6IG51bWJlcltdLCBtYXRlcmlhbEluZGV4OiBudW1iZXIpOiBNZXNoIHtcblx0bGV0IG5leHQgPSBtZXNoO1xuXHRmb3IgKGNvbnN0IGZhY2VJbmRleCBvZiBmYWNlSW5kaWNlcykgbmV4dCA9IGFkZEdyb3VwKG5leHQsIGZhY2VJbmRleCwgbWF0ZXJpYWxJbmRleCk7XG5cdHJldHVybiBuZXh0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9Ob25JbmRleGVkKG1lc2g6IE1lc2gpOiBNZXNoIHtcblx0Y29uc3QgdmVydGljZXM6IFZlYzNbXSA9IFtdO1xuXHRjb25zdCBmYWNlczogbnVtYmVyW11bXSA9IFtdO1xuXHRjb25zdCBmYWNlU2xvdDogbnVtYmVyW10gPSBbXTtcblx0Y29uc3Qgbm9ybWFscyA9IG1lc2gubm9ybWFscztcblx0Y29uc3QgbmV4dE5vcm1hbHM6IFZlYzNbXSA9IFtdO1xuXHRjb25zdCBjb2xvcnMgPSBtZXNoLmNvbG9ycztcblx0Y29uc3QgbmV4dENvbG9yczogbnVtYmVyW10gPSBbXTtcblxuXHRtZXNoLmZhY2VzLmZvckVhY2goKGZhY2UsIGZhY2VJbmRleCkgPT4ge1xuXHRcdGNvbnN0IGJhc2UgPSB2ZXJ0aWNlcy5sZW5ndGg7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBmYWNlLmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdFx0Zm9yIChjb25zdCBpbmRleCBvZiBbZmFjZVswXSwgZmFjZVtpXSwgZmFjZVtpICsgMV1dKSB7XG5cdFx0XHRcdGNvbnN0IHYgPSBtZXNoLnZlcnRpY2VzW2luZGV4XTtcblx0XHRcdFx0dmVydGljZXMucHVzaChbdlswXSwgdlsxXSwgdlsyXV0gYXMgVmVjMyk7XG5cdFx0XHRcdGlmIChub3JtYWxzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbiA9IG5vcm1hbHNbaW5kZXhdID8/IFswLCAxLCAwXTtcblx0XHRcdFx0XHRuZXh0Tm9ybWFscy5wdXNoKFtuWzBdLCBuWzFdLCBuWzJdXSBhcyBWZWMzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29sb3JzKSB7XG5cdFx0XHRcdFx0bmV4dENvbG9ycy5wdXNoKGNvbG9yc1tpbmRleCAqIDNdID8/IDEsIGNvbG9yc1tpbmRleCAqIDMgKyAxXSA/PyAxLCBjb2xvcnNbaW5kZXggKiAzICsgMl0gPz8gMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZhY2VzLnB1c2goW2Jhc2UsIGJhc2UgKyAxLCBiYXNlICsgMl0pO1xuXHRcdFx0ZmFjZVNsb3QucHVzaChtZXNoLmZhY2VTbG90Py5bZmFjZUluZGV4XSA/PyAwKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbnN0IG5leHQ6IE1lc2ggPSB7XG5cdFx0dmVydGljZXMsXG5cdFx0ZmFjZXMsXG5cdFx0ZWRnZXM6IGJ1aWxkRWRnZXMoZmFjZXMpLFxuXHRcdHJhZGl1czogY29tcHV0ZVJhZGl1cyh2ZXJ0aWNlcyksXG5cdFx0c21vb3RoOiBtZXNoLnNtb290aCxcblx0XHRzbG90czogKG1lc2guc2xvdHMgPz8gW10pLm1hcChjbG9uZU1hdGVyaWFsU2xvdCksXG5cdFx0ZmFjZVNsb3QsXG5cdFx0Z3JvdXBzOiBbXSxcblx0fTtcblx0aWYgKG5leHROb3JtYWxzLmxlbmd0aCA9PT0gdmVydGljZXMubGVuZ3RoKSBuZXh0Lm5vcm1hbHMgPSBuZXh0Tm9ybWFscztcblx0aWYgKG5leHRDb2xvcnMubGVuZ3RoID09PSB2ZXJ0aWNlcy5sZW5ndGggKiAzKSBuZXh0LmNvbG9ycyA9IG5leHRDb2xvcnM7XG5cdG5leHQuZ3JvdXBzID0gYnVpbGRHcm91cHMobmV4dCk7XG5cdHJldHVybiBuZXh0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZWRnZUtleShhOiBudW1iZXIsIGI6IG51bWJlcik6IHN0cmluZyB7XG5cdHJldHVybiBhIDwgYiA/IGAke2F9OiR7Yn1gIDogYCR7Yn06JHthfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEVkZ2VzKGZhY2VzOiBGYWNlW10pOiBbbnVtYmVyLCBudW1iZXJdW10ge1xuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGVkZ2VzOiBbbnVtYmVyLCBudW1iZXJdW10gPSBbXTtcblx0Zm9yIChjb25zdCBmYWNlIG9mIGZhY2VzKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmYWNlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBhID0gZmFjZVtpXTtcblx0XHRcdGNvbnN0IGIgPSBmYWNlWyhpICsgMSkgJSBmYWNlLmxlbmd0aF07XG5cdFx0XHRjb25zdCBrZXkgPSBlZGdlS2V5KGEsIGIpO1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHNlZW4uYWRkKGtleSk7XG5cdFx0XHRcdGVkZ2VzLnB1c2goW2EsIGJdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGVkZ2VzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZVJhZGl1cyh2ZXJ0aWNlczogVmVjM1tdKTogbnVtYmVyIHtcblx0bGV0IG1heFIyID0gMC4yNTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0aWNlcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHYgPSB2ZXJ0aWNlc1tpXTtcblx0XHRjb25zdCByMiA9IHZbMF0gKiB2WzBdICsgdlsxXSAqIHZbMV0gKyB2WzJdICogdlsyXTtcblx0XHRpZiAocjIgPiBtYXhSMikgbWF4UjIgPSByMjtcblx0fVxuXHRyZXR1cm4gTWF0aC5zcXJ0KG1heFIyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVWZXJ0ZXhOb3JtYWxzKG1lc2g6IE1lc2gpOiBWZWMzW10ge1xuXHRjb25zdCBub3JtYWxzOiBWZWMzW10gPSBtZXNoLnZlcnRpY2VzLm1hcCgoKSA9PiBbMCwgMCwgMF0pO1xuXHRmb3IgKGNvbnN0IGZhY2Ugb2YgbWVzaC5mYWNlcykge1xuXHRcdGNvbnN0IGZMZW4gPSBmYWNlLmxlbmd0aDtcblx0XHRpZiAoZkxlbiA8IDMpIGNvbnRpbnVlO1xuXHRcdGNvbnN0IGZuID0gZmFjZU5vcm1hbChtZXNoLCBmYWNlKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZMZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbm9ybWFsc1tmYWNlW2ldXTtcblx0XHRcdHRhcmdldFswXSArPSBmblswXTtcblx0XHRcdHRhcmdldFsxXSArPSBmblsxXTtcblx0XHRcdHRhcmdldFsyXSArPSBmblsyXTtcblx0XHR9XG5cdH1cblx0Zm9yIChjb25zdCBub3JtYWwgb2Ygbm9ybWFscykge1xuXHRcdGNvbnN0IGxlbiA9IE1hdGguaHlwb3Qobm9ybWFsWzBdLCBub3JtYWxbMV0sIG5vcm1hbFsyXSkgfHwgMTtcblx0XHRub3JtYWxbMF0gLz0gbGVuO1xuXHRcdG5vcm1hbFsxXSAvPSBsZW47XG5cdFx0bm9ybWFsWzJdIC89IGxlbjtcblx0fVxuXHRyZXR1cm4gbm9ybWFscztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZhY2VOb3JtYWwobWVzaDogTWVzaCwgZmFjZTogRmFjZSk6IFZlYzMge1xuXHRpZiAoZmFjZS5sZW5ndGggPCAzKSByZXR1cm4gWzAsIDEsIDBdO1xuXHQvLyBOZXdlbGwncyBtZXRob2QgaGFuZGxlcyBhcmJpdHJhcnkgcG9seWdvbnMgYW5kIHF1YWRzIHJvYnVzdGx5IHdpdGhvdXQgY29sbGluZWFyIGNvcm5lciBpc3N1ZXNcblx0bGV0IG54ID0gMCwgbnkgPSAwLCBueiA9IDA7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZmFjZS5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGN1cnIgPSBtZXNoLnZlcnRpY2VzW2ZhY2VbaV1dO1xuXHRcdGNvbnN0IG5leHQgPSBtZXNoLnZlcnRpY2VzW2ZhY2VbKGkgKyAxKSAlIGZhY2UubGVuZ3RoXV07XG5cdFx0bnggKz0gKGN1cnJbMV0gLSBuZXh0WzFdKSAqIChjdXJyWzJdICsgbmV4dFsyXSk7XG5cdFx0bnkgKz0gKGN1cnJbMl0gLSBuZXh0WzJdKSAqIChjdXJyWzBdICsgbmV4dFswXSk7XG5cdFx0bnogKz0gKGN1cnJbMF0gLSBuZXh0WzBdKSAqIChjdXJyWzFdICsgbmV4dFsxXSk7XG5cdH1cblx0Y29uc3QgbGVuID0gTWF0aC5oeXBvdChueCwgbnksIG56KSB8fCAxO1xuXHRyZXR1cm4gW254IC8gbGVuLCBueSAvIGxlbiwgbnogLyBsZW5dO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmFjZUNlbnRlcihtZXNoOiBNZXNoLCBmYWNlOiBGYWNlKTogVmVjMyB7XG5cdGxldCB4ID0gMCwgeSA9IDAsIHogPSAwO1xuXHRmb3IgKGNvbnN0IGluZGV4IG9mIGZhY2UpIHtcblx0XHR4ICs9IG1lc2gudmVydGljZXNbaW5kZXhdWzBdO1xuXHRcdHkgKz0gbWVzaC52ZXJ0aWNlc1tpbmRleF1bMV07XG5cdFx0eiArPSBtZXNoLnZlcnRpY2VzW2luZGV4XVsyXTtcblx0fVxuXHRjb25zdCBpbnYgPSAxIC8gZmFjZS5sZW5ndGg7XG5cdHJldHVybiBbeCAqIGludiwgeSAqIGludiwgeiAqIGludl07XG59XG5cbmV4cG9ydCB0eXBlIE1lc2hJbnB1dCA9IFBpY2s8TWVzaCwgJ3ZlcnRpY2VzJyB8ICdmYWNlcyc+ICZcblx0UGFydGlhbDxPbWl0PE1lc2gsICd2ZXJ0aWNlcycgfCAnZmFjZXMnPj4gJiB7IHJhZGl1cz86IG51bWJlciB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZmluYWxpemVNZXNoKG1lc2g6IE1lc2hJbnB1dCwgc21vb3RoID0gZmFsc2UpOiBNZXNoIHtcblx0Y29uc3QgcmVzdWx0OiBNZXNoID0ge1xuXHRcdHZlcnRpY2VzOiBtZXNoLnZlcnRpY2VzLm1hcCgodikgPT4gW3ZbMF0sIHZbMV0sIHZbMl1dIGFzIFZlYzMpLFxuXHRcdGZhY2VzOiBtZXNoLmZhY2VzLm1hcCgoZikgPT4gWy4uLmZdKSxcblx0XHRlZGdlczogbWVzaC5lZGdlcyAmJiBtZXNoLmVkZ2VzLmxlbmd0aCA/IG1lc2guZWRnZXMubWFwKChlKSA9PiBbZVswXSwgZVsxXV0gYXMgW251bWJlciwgbnVtYmVyXSkgOiBidWlsZEVkZ2VzKG1lc2guZmFjZXMpLFxuXHRcdHJhZGl1czogY29tcHV0ZVJhZGl1cyhtZXNoLnZlcnRpY2VzKSxcblx0XHRzbW9vdGgsXG5cdFx0c2xvdHM6IChtZXNoLnNsb3RzID8/IFtdKS5tYXAoY2xvbmVNYXRlcmlhbFNsb3QpLFxuXHRcdGZhY2VTbG90OiBbLi4uKG1lc2guZmFjZVNsb3QgPz8gW10pXSxcblx0XHRncm91cHM6IFtdLFxuXHR9O1xuXHRpZiAobWVzaC5jb2xvcnMgJiYgbWVzaC5jb2xvcnMubGVuZ3RoID49IHJlc3VsdC52ZXJ0aWNlcy5sZW5ndGggKiAzKSB7XG5cdFx0cmVzdWx0LmNvbG9ycyA9IG1lc2guY29sb3JzLnNsaWNlKDAsIHJlc3VsdC52ZXJ0aWNlcy5sZW5ndGggKiAzKTtcblx0fVxuXHRpZiAobWVzaC51dnMgJiYgbWVzaC51dnMubGVuZ3RoID09PSByZXN1bHQudmVydGljZXMubGVuZ3RoKSB7XG5cdFx0cmVzdWx0LnV2cyA9IG1lc2gudXZzLm1hcCgodXYpID0+IFt1dlswXSwgdXZbMV1dIGFzIFtudW1iZXIsIG51bWJlcl0pO1xuXHR9XG5cdGlmIChtZXNoLm5vcm1hbHMgJiYgbWVzaC5ub3JtYWxzLmxlbmd0aCA9PT0gcmVzdWx0LnZlcnRpY2VzLmxlbmd0aCkge1xuXHRcdHJlc3VsdC5ub3JtYWxzID0gbWVzaC5ub3JtYWxzLm1hcCgobikgPT4gW25bMF0sIG5bMV0sIG5bMl1dIGFzIFZlYzMpO1xuXHR9IGVsc2UgaWYgKHNtb290aCkge1xuXHRcdHJlc3VsdC5ub3JtYWxzID0gY29tcHV0ZVZlcnRleE5vcm1hbHMocmVzdWx0KTtcblx0fVxuXHR3aGlsZSAocmVzdWx0LmZhY2VTbG90Lmxlbmd0aCA8IHJlc3VsdC5mYWNlcy5sZW5ndGgpIHJlc3VsdC5mYWNlU2xvdC5wdXNoKDApO1xuXHRyZXN1bHQuZmFjZVNsb3QubGVuZ3RoID0gcmVzdWx0LmZhY2VzLmxlbmd0aDtcblx0cmVzdWx0Lmdyb3VwcyA9IGJ1aWxkR3JvdXBzKHJlc3VsdCk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkKHZlcnRpY2VzOiBWZWMzW10sIGZhY2VzOiBGYWNlW10sIHNtb290aCA9IGZhbHNlLCBub3JtYWxzPzogVmVjM1tdKTogTWVzaCB7XG5cdHJldHVybiBmaW5hbGl6ZU1lc2goeyB2ZXJ0aWNlcywgZmFjZXMsIGVkZ2VzOiBidWlsZEVkZ2VzKGZhY2VzKSwgcmFkaXVzOiBjb21wdXRlUmFkaXVzKHZlcnRpY2VzKSwgbm9ybWFscyB9LCBzbW9vdGgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3ViZU1lc2goc2l6ZVggPSAxLCBzaXplWSA9IDEsIHNpemVaID0gMSk6IE1lc2gge1xuXHRjb25zdCBoeCA9IE1hdGgubWF4KDAuMDUsIHNpemVYKSAqIDAuNTtcblx0Y29uc3QgaHkgPSBNYXRoLm1heCgwLjA1LCBzaXplWSkgKiAwLjU7XG5cdGNvbnN0IGh6ID0gTWF0aC5tYXgoMC4wNSwgc2l6ZVopICogMC41O1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gW1xuXHRcdFstaHgsIC1oeSwgLWh6XSxcblx0XHRbaHgsIC1oeSwgLWh6XSxcblx0XHRbaHgsIGh5LCAtaHpdLFxuXHRcdFstaHgsIGh5LCAtaHpdLFxuXHRcdFstaHgsIC1oeSwgaHpdLFxuXHRcdFtoeCwgLWh5LCBoel0sXG5cdFx0W2h4LCBoeSwgaHpdLFxuXHRcdFstaHgsIGh5LCBoel0sXG5cdF07XG5cdGNvbnN0IGZhY2VzID0gW1xuXHRcdFswLCAzLCAyLCAxXSxcblx0XHRbNCwgNSwgNiwgN10sXG5cdFx0WzAsIDQsIDcsIDNdLFxuXHRcdFsxLCAyLCA2LCA1XSxcblx0XHRbMywgNywgNiwgMl0sXG5cdFx0WzAsIDEsIDUsIDRdLFxuXHRdO1xuXHRyZXR1cm4gYnVpbGQodmVydGljZXMsIGZhY2VzLCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzcGhlcmVNZXNoKHNlZ21lbnRzID0gNDgsIHJpbmdzID0gMjQsIHJhZGl1cyA9IDAuNSk6IE1lc2gge1xuXHRjb25zdCBzZWdzID0gTWF0aC5tYXgoOCwgTWF0aC5mbG9vcihzZWdtZW50cykpO1xuXHRjb25zdCBybmdzID0gTWF0aC5tYXgoNCwgTWF0aC5mbG9vcihyaW5ncykpO1xuXHRjb25zdCByYWQgPSBNYXRoLm1heCgwLjA1LCByYWRpdXMpO1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gW107XG5cdGNvbnN0IG5vcm1hbHM6IFZlYzNbXSA9IFtdO1xuXG5cdC8vIE5vcnRoIHBvbGUgKGluZGV4IDApXG5cdHZlcnRpY2VzLnB1c2goWzAsIHJhZCwgMF0pO1xuXHRub3JtYWxzLnB1c2goWzAsIDEsIDBdKTtcblxuXHQvLyBJbnRlcm1lZGlhdGUgcmluZ3MgKDEgLi4gcm5ncyAtIDEpXG5cdGZvciAobGV0IHIgPSAxOyByIDwgcm5nczsgcisrKSB7XG5cdFx0Y29uc3QgcGhpID0gKHIgLyBybmdzKSAqIE1hdGguUEk7XG5cdFx0Y29uc3QgbnkgPSBNYXRoLmNvcyhwaGkpO1xuXHRcdGNvbnN0IHNpblBoaSA9IE1hdGguc2luKHBoaSk7XG5cdFx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzZWdzOyBzKyspIHtcblx0XHRcdGNvbnN0IHRoZXRhID0gKHMgLyBzZWdzKSAqIE1hdGguUEkgKiAyO1xuXHRcdFx0Y29uc3QgbnggPSBNYXRoLmNvcyh0aGV0YSkgKiBzaW5QaGk7XG5cdFx0XHRjb25zdCBueiA9IE1hdGguc2luKHRoZXRhKSAqIHNpblBoaTtcblx0XHRcdHZlcnRpY2VzLnB1c2goW254ICogcmFkLCBueSAqIHJhZCwgbnogKiByYWRdKTtcblx0XHRcdG5vcm1hbHMucHVzaChbbngsIG55LCBuel0pO1xuXHRcdH1cblx0fVxuXG5cdC8vIFNvdXRoIHBvbGVcblx0Y29uc3Qgc291dGggPSB2ZXJ0aWNlcy5sZW5ndGg7XG5cdHZlcnRpY2VzLnB1c2goWzAsIC1yYWQsIDBdKTtcblx0bm9ybWFscy5wdXNoKFswLCAtMSwgMF0pO1xuXG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXTtcblx0Ly8gTm9ydGggcG9sZSB0cmlhbmdsZSBmYW4gKG91dHdhcmQgQ0NXKVxuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNlZ3M7IHMrKykge1xuXHRcdGNvbnN0IG5leHQgPSAocyArIDEpICUgc2Vncztcblx0XHRmYWNlcy5wdXNoKFswLCAxICsgbmV4dCwgMSArIHNdKTtcblx0fVxuXHQvLyBRdWFkIHN0cmlwcyBiZXR3ZWVuIGludGVybWVkaWF0ZSByaW5ncyAob3V0d2FyZCBDQ1cpXG5cdGZvciAobGV0IHIgPSAxOyByIDwgcm5ncyAtIDE7IHIrKykge1xuXHRcdGNvbnN0IHJvdyA9IDEgKyAociAtIDEpICogc2Vncztcblx0XHRjb25zdCBuZXh0Um93ID0gMSArIHIgKiBzZWdzO1xuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gKHMgKyAxKSAlIHNlZ3M7XG5cdFx0XHRmYWNlcy5wdXNoKFtyb3cgKyBzLCByb3cgKyBuZXh0LCBuZXh0Um93ICsgbmV4dCwgbmV4dFJvdyArIHNdKTtcblx0XHR9XG5cdH1cblx0Ly8gU291dGggcG9sZSB0cmlhbmdsZSBmYW4gKG91dHdhcmQgQ0NXKVxuXHRjb25zdCBsYXN0Um93ID0gMSArIChybmdzIC0gMikgKiBzZWdzO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNlZ3M7IHMrKykge1xuXHRcdGNvbnN0IG5leHQgPSAocyArIDEpICUgc2Vncztcblx0XHRmYWNlcy5wdXNoKFtsYXN0Um93ICsgcywgbGFzdFJvdyArIG5leHQsIHNvdXRoXSk7XG5cdH1cblxuXHRyZXR1cm4gYnVpbGQodmVydGljZXMsIGZhY2VzLCB0cnVlLCBub3JtYWxzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGN5bGluZGVyTWVzaChzZWdtZW50cyA9IDQ4LCBpbm5lclJhZGl1cyA9IDAsIGhlaWdodCA9IDEsIG91dGVyUmFkaXVzID0gMC41KTogTWVzaCB7XG5cdGNvbnN0IHNlZ3MgPSBNYXRoLm1heCg4LCBNYXRoLmZsb29yKHNlZ21lbnRzKSk7XG5cdGNvbnN0IHJhZCA9IE1hdGgubWF4KDAuMDUsIG91dGVyUmFkaXVzKTtcblx0Y29uc3QgdmVydGljZXM6IFZlYzNbXSA9IFtdO1xuXHRjb25zdCBoYWxmID0gaGVpZ2h0IC8gMjtcblx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzZWdzOyBzKyspIHtcblx0XHRjb25zdCB0aGV0YSA9IChzIC8gc2VncykgKiBNYXRoLlBJICogMjtcblx0XHR2ZXJ0aWNlcy5wdXNoKFtNYXRoLmNvcyh0aGV0YSkgKiByYWQsIC1oYWxmLCBNYXRoLnNpbih0aGV0YSkgKiByYWRdKTtcblx0fVxuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNlZ3M7IHMrKykge1xuXHRcdGNvbnN0IHRoZXRhID0gKHMgLyBzZWdzKSAqIE1hdGguUEkgKiAyO1xuXHRcdHZlcnRpY2VzLnB1c2goW01hdGguY29zKHRoZXRhKSAqIHJhZCwgaGFsZiwgTWF0aC5zaW4odGhldGEpICogcmFkXSk7XG5cdH1cblx0aWYgKGlubmVyUmFkaXVzID4gMCkge1xuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0XHRjb25zdCB0aGV0YSA9IChzIC8gc2VncykgKiBNYXRoLlBJICogMjtcblx0XHRcdHZlcnRpY2VzLnB1c2goW01hdGguY29zKHRoZXRhKSAqIGlubmVyUmFkaXVzLCAtaGFsZiwgTWF0aC5zaW4odGhldGEpICogaW5uZXJSYWRpdXNdKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzZWdzOyBzKyspIHtcblx0XHRcdGNvbnN0IHRoZXRhID0gKHMgLyBzZWdzKSAqIE1hdGguUEkgKiAyO1xuXHRcdFx0dmVydGljZXMucHVzaChbTWF0aC5jb3ModGhldGEpICogaW5uZXJSYWRpdXMsIGhhbGYsIE1hdGguc2luKHRoZXRhKSAqIGlubmVyUmFkaXVzXSk7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXTtcblx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzZWdzOyBzKyspIHtcblx0XHRjb25zdCBuZXh0ID0gKHMgKyAxKSAlIHNlZ3M7XG5cdFx0aWYgKGlubmVyUmFkaXVzID4gMCkge1xuXHRcdFx0Y29uc3QgYmkgPSBzZWdzICogMjtcblx0XHRcdGNvbnN0IHRpID0gc2VncyAqIDM7XG5cdFx0XHQvLyBPdXRlciB3YWxsIChvdXR3YXJkIENDVylcblx0XHRcdGZhY2VzLnB1c2goW3MsIHNlZ3MgKyBzLCBzZWdzICsgbmV4dCwgbmV4dF0pO1xuXHRcdFx0Ly8gSW5uZXIgd2FsbCAoaW53YXJkIHRvd2FyZCBob2xlIGF4aXMgQ0NXKVxuXHRcdFx0ZmFjZXMucHVzaChbYmkgKyBzLCBiaSArIG5leHQsIHRpICsgbmV4dCwgdGkgKyBzXSk7XG5cdFx0XHQvLyBCb3R0b20gYW5udWxhciBxdWFkIChkb3dud2FyZCBDQ1cpXG5cdFx0XHRmYWNlcy5wdXNoKFtzLCBuZXh0LCBiaSArIG5leHQsIGJpICsgc10pO1xuXHRcdFx0Ly8gVG9wIGFubnVsYXIgcXVhZCAodXB3YXJkIENDVylcblx0XHRcdGZhY2VzLnB1c2goW3NlZ3MgKyBzLCB0aSArIHMsIHRpICsgbmV4dCwgc2VncyArIG5leHRdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gT3V0ZXIgd2FsbCAob3V0d2FyZCBDQ1cpXG5cdFx0XHRmYWNlcy5wdXNoKFtzLCBzZWdzICsgcywgc2VncyArIG5leHQsIG5leHRdKTtcblx0XHR9XG5cdH1cblx0aWYgKGlubmVyUmFkaXVzIDw9IDApIHtcblx0XHRjb25zdCBib3R0b20gPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBzZWdzIH0sIChfLCBpKSA9PiBpKTtcblx0XHRjb25zdCB0b3AgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBzZWdzIH0sIChfLCBpKSA9PiBzZWdzICsgKHNlZ3MgLSAxIC0gaSkpO1xuXHRcdGZhY2VzLnB1c2goYm90dG9tLCB0b3ApO1xuXHR9XG5cdHJldHVybiBidWlsZCh2ZXJ0aWNlcywgZmFjZXMsIHRydWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uZU1lc2goc2VnbWVudHMgPSA0OCwgcmFkaXVzID0gMC41LCBoZWlnaHQgPSAxKTogTWVzaCB7XG5cdGNvbnN0IHNlZ3MgPSBNYXRoLm1heCg4LCBNYXRoLmZsb29yKHNlZ21lbnRzKSk7XG5cdGNvbnN0IHJhZCA9IE1hdGgubWF4KDAuMDUsIHJhZGl1cyk7XG5cdGNvbnN0IGhhbGYgPSBNYXRoLm1heCgwLjA1LCBoZWlnaHQpICogMC41O1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gW107XG5cdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0Y29uc3QgdGhldGEgPSAocyAvIHNlZ3MpICogTWF0aC5QSSAqIDI7XG5cdFx0dmVydGljZXMucHVzaChbTWF0aC5jb3ModGhldGEpICogcmFkLCAtaGFsZiwgTWF0aC5zaW4odGhldGEpICogcmFkXSk7XG5cdH1cblx0dmVydGljZXMucHVzaChbMCwgaGFsZiwgMF0pO1xuXHRjb25zdCBhcGV4ID0gdmVydGljZXMubGVuZ3RoIC0gMTtcblx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNlZ3M7IHMrKykge1xuXHRcdGNvbnN0IG5leHQgPSAocyArIDEpICUgc2Vncztcblx0XHQvLyBPdXR3YXJkIENDVyBzaWRlIHRyaWFuZ2xlXG5cdFx0ZmFjZXMucHVzaChbcywgYXBleCwgbmV4dF0pO1xuXHR9XG5cdC8vIE91dHdhcmQgZG93bndhcmQgYm90dG9tIGNhcFxuXHRmYWNlcy5wdXNoKEFycmF5LmZyb20oeyBsZW5ndGg6IHNlZ3MgfSwgKF8sIGkpID0+IGkpKTtcblx0cmV0dXJuIGJ1aWxkKHZlcnRpY2VzLCBmYWNlcywgdHJ1ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3J1c01lc2goc2VnbWVudHMgPSA0OCwgc2lkZXMgPSAyNCwgcmFkaXVzID0gMC4zNSwgdHViZSA9IDAuMTUpOiBNZXNoIHtcblx0Y29uc3Qgc2VncyA9IE1hdGgubWF4KDgsIE1hdGguZmxvb3Ioc2VnbWVudHMpKTtcblx0Y29uc3Qgc2RzID0gTWF0aC5tYXgoNiwgTWF0aC5mbG9vcihzaWRlcykpO1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gW107XG5cdGNvbnN0IG5vcm1hbHM6IFZlYzNbXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHNlZ3M7IGkrKykge1xuXHRcdGNvbnN0IHUgPSAoaSAvIHNlZ3MpICogTWF0aC5QSSAqIDI7XG5cdFx0Y29uc3QgY29zVSA9IE1hdGguY29zKHUpO1xuXHRcdGNvbnN0IHNpblUgPSBNYXRoLnNpbih1KTtcblx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHNkczsgaisrKSB7XG5cdFx0XHRjb25zdCB2ID0gKGogLyBzZHMpICogTWF0aC5QSSAqIDI7XG5cdFx0XHRjb25zdCBjb3NWID0gTWF0aC5jb3Modik7XG5cdFx0XHRjb25zdCBzaW5WID0gTWF0aC5zaW4odik7XG5cdFx0XHRjb25zdCByID0gcmFkaXVzICsgdHViZSAqIGNvc1Y7XG5cdFx0XHR2ZXJ0aWNlcy5wdXNoKFtjb3NVICogciwgdHViZSAqIHNpblYsIHNpblUgKiByXSk7XG5cdFx0XHRub3JtYWxzLnB1c2goW2Nvc1UgKiBjb3NWLCBzaW5WLCBzaW5VICogY29zVl0pO1xuXHRcdH1cblx0fVxuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgc2VnczsgaSsrKSB7XG5cdFx0Y29uc3QgbmkgPSAoaSArIDEpICUgc2Vncztcblx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHNkczsgaisrKSB7XG5cdFx0XHRjb25zdCBuaiA9IChqICsgMSkgJSBzZHM7XG5cdFx0XHQvLyBPdXR3YXJkIENDVyBxdWFkXG5cdFx0XHRmYWNlcy5wdXNoKFtpICogc2RzICsgaiwgaSAqIHNkcyArIG5qLCBuaSAqIHNkcyArIG5qLCBuaSAqIHNkcyArIGpdKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGJ1aWxkKHZlcnRpY2VzLCBmYWNlcywgdHJ1ZSwgbm9ybWFscyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFuZU1lc2goKTogTWVzaCB7XG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBbXG5cdFx0Wy0wLjUsIDAsIC0wLjVdLFxuXHRcdFswLjUsIDAsIC0wLjVdLFxuXHRcdFswLjUsIDAsIDAuNV0sXG5cdFx0Wy0wLjUsIDAsIDAuNV0sXG5cdF07XG5cdC8vIE91dHdhcmQgdXB3YXJkIG5vcm1hbCBbMCwgKzEsIDBdXG5cdHJldHVybiBidWlsZCh2ZXJ0aWNlcywgW1swLCAzLCAyLCAxXV0sIGZhbHNlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1lZGlhUGxhbmVNZXNoKCk6IE1lc2gge1xuXHRjb25zdCBtZXNoID0gcGxhbmVNZXNoKCk7XG5cdG1lc2gudXZzID0gW1xuXHRcdFswLCAxXSxcblx0XHRbMSwgMV0sXG5cdFx0WzEsIDBdLFxuXHRcdFswLCAwXSxcblx0XTtcblx0cmV0dXJuIG1lc2g7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2luTWVzaChzZWdtZW50cyA9IDQ4KTogTWVzaCB7XG5cdHJldHVybiBjeWxpbmRlck1lc2goc2VnbWVudHMsIDAsIDAuMTIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYm9uZU1lc2goKTogTWVzaCB7XG5cdGNvbnN0IHJhd1ZlcnRpY2VzOiBWZWMzW10gPSBbXG5cdFx0WzAsIC0wLjIsIDBdLFxuXHRcdFswLjA5LCAtMC4wNiwgMC4wOV0sXG5cdFx0Wy0wLjA5LCAtMC4wNiwgMC4wOV0sXG5cdFx0Wy0wLjA5LCAtMC4wNiwgLTAuMDldLFxuXHRcdFswLjA5LCAtMC4wNiwgLTAuMDldLFxuXHRcdFswLCAwLjI1LCAwXSxcblx0XTtcblx0Ly8gT2N0YWhlZHJhbCBzdHVkaW8gYm9uZSB3aXRoIDggb3V0d2FyZCBDQ1cgZmFjZXNcblx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtcblx0XHRbMCwgMSwgMl0sXG5cdFx0WzAsIDIsIDNdLFxuXHRcdFswLCAzLCA0XSxcblx0XHRbMCwgNCwgMV0sXG5cdFx0WzUsIDIsIDFdLFxuXHRcdFs1LCAzLCAyXSxcblx0XHRbNSwgNCwgM10sXG5cdFx0WzUsIDEsIDRdLFxuXHRdO1xuXHRyZXR1cm4gYnVpbGQocmF3VmVydGljZXMsIGZhY2VzLCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpY29TcGhlcmVNZXNoKHN1YmRpdmlzaW9ucyA9IDEsIHJhZGl1cyA9IDAuNSk6IE1lc2gge1xuXHRjb25zdCBwaGkgPSAoMSArIE1hdGguc3FydCg1KSkgLyAyO1xuXHRjb25zdCBiYXNlVmVydHM6IFZlYzNbXSA9IFtcblx0XHRbLTEsIHBoaSwgMF0sIFsxLCBwaGksIDBdLCBbLTEsIC1waGksIDBdLCBbMSwgLXBoaSwgMF0sXG5cdFx0WzAsIC0xLCBwaGldLCBbMCwgMSwgcGhpXSwgWzAsIC0xLCAtcGhpXSwgWzAsIDEsIC1waGldLFxuXHRcdFtwaGksIDAsIC0xXSwgW3BoaSwgMCwgMV0sIFstcGhpLCAwLCAtMV0sIFstcGhpLCAwLCAxXVxuXHRdO1xuXHRjb25zdCBzY2FsZSA9IHJhZGl1cyAvIE1hdGguc3FydCgxICsgcGhpICogcGhpKTtcblx0bGV0IHZlcnRpY2VzOiBWZWMzW10gPSBiYXNlVmVydHMubWFwKHYgPT4gW3ZbMF0gKiBzY2FsZSwgdlsxXSAqIHNjYWxlLCB2WzJdICogc2NhbGVdIGFzIFZlYzMpO1xuXHRsZXQgZmFjZXM6IEZhY2VbXSA9IFtcblx0XHRbMCwgMTEsIDVdLCBbMCwgNSwgMV0sIFswLCAxLCA3XSwgWzAsIDcsIDEwXSwgWzAsIDEwLCAxMV0sXG5cdFx0WzEsIDUsIDldLCBbNSwgMTEsIDRdLCBbMTEsIDEwLCAyXSwgWzEwLCA3LCA2XSwgWzcsIDEsIDhdLFxuXHRcdFszLCA5LCA0XSwgWzMsIDQsIDJdLCBbMywgMiwgNl0sIFszLCA2LCA4XSwgWzMsIDgsIDldLFxuXHRcdFs0LCA5LCA1XSwgWzIsIDQsIDExXSwgWzYsIDIsIDEwXSwgWzgsIDYsIDddLCBbOSwgOCwgMV1cblx0XTtcblx0Y29uc3Qgc3VicyA9IE1hdGgubWluKDMsIE1hdGgubWF4KDAsIE1hdGguZmxvb3Ioc3ViZGl2aXNpb25zKSkpO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHN1YnM7IHMrKykge1xuXHRcdGNvbnN0IG1pZENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRjb25zdCBnZXRNaWQgPSAocDE6IG51bWJlciwgcDI6IG51bWJlcik6IG51bWJlciA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSBwMSA8IHAyID8gKHAxICsgJ18nICsgcDIpIDogKHAyICsgJ18nICsgcDEpO1xuXHRcdFx0aWYgKG1pZENhY2hlLmhhcyhrZXkpKSByZXR1cm4gbWlkQ2FjaGUuZ2V0KGtleSkhO1xuXHRcdFx0Y29uc3QgdjEgPSB2ZXJ0aWNlc1twMV07XG5cdFx0XHRjb25zdCB2MiA9IHZlcnRpY2VzW3AyXTtcblx0XHRcdGNvbnN0IG14ID0gKHYxWzBdICsgdjJbMF0pIC8gMjtcblx0XHRcdGNvbnN0IG15ID0gKHYxWzFdICsgdjJbMV0pIC8gMjtcblx0XHRcdGNvbnN0IG16ID0gKHYxWzJdICsgdjJbMl0pIC8gMjtcblx0XHRcdGNvbnN0IGxlbiA9IE1hdGguaHlwb3QobXgsIG15LCBteikgfHwgMTtcblx0XHRcdGNvbnN0IGlkeCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0XHRcdHZlcnRpY2VzLnB1c2goWyhteCAvIGxlbikgKiByYWRpdXMsIChteSAvIGxlbikgKiByYWRpdXMsIChteiAvIGxlbikgKiByYWRpdXNdKTtcblx0XHRcdG1pZENhY2hlLnNldChrZXksIGlkeCk7XG5cdFx0XHRyZXR1cm4gaWR4O1xuXHRcdH07XG5cdFx0Y29uc3QgbmV4dEZhY2VzOiBGYWNlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGYgb2YgZmFjZXMpIHtcblx0XHRcdGNvbnN0IGEgPSBmWzBdLCBiID0gZlsxXSwgYyA9IGZbMl07XG5cdFx0XHRjb25zdCBhYiA9IGdldE1pZChhLCBiKTtcblx0XHRcdGNvbnN0IGJjID0gZ2V0TWlkKGIsIGMpO1xuXHRcdFx0Y29uc3QgY2EgPSBnZXRNaWQoYywgYSk7XG5cdFx0XHRuZXh0RmFjZXMucHVzaChbYSwgYWIsIGNhXSwgW2IsIGJjLCBhYl0sIFtjLCBjYSwgYmNdLCBbYWIsIGJjLCBjYV0pO1xuXHRcdH1cblx0XHRmYWNlcyA9IG5leHRGYWNlcztcblx0fVxuXHRjb25zdCBub3JtYWxzID0gdmVydGljZXMubWFwKHYgPT4ge1xuXHRcdGNvbnN0IGxlbiA9IE1hdGguaHlwb3QodlswXSwgdlsxXSwgdlsyXSkgfHwgMTtcblx0XHRyZXR1cm4gW3ZbMF0gLyBsZW4sIHZbMV0gLyBsZW4sIHZbMl0gLyBsZW5dIGFzIFZlYzM7XG5cdH0pO1xuXHRyZXR1cm4gYnVpbGQodmVydGljZXMsIGZhY2VzLCB0cnVlLCBub3JtYWxzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNpcmNsZU1lc2goc2VnbWVudHMgPSAzMiwgcmFkaXVzID0gMC41KTogTWVzaCB7XG5cdGNvbnN0IHNlZ3MgPSBNYXRoLm1heCg2LCBNYXRoLmZsb29yKHNlZ21lbnRzKSk7XG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBbWzAsIDAsIDBdXTtcblx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzZWdzOyBzKyspIHtcblx0XHRjb25zdCB0aGV0YSA9IChzIC8gc2VncykgKiBNYXRoLlBJICogMjtcblx0XHR2ZXJ0aWNlcy5wdXNoKFtNYXRoLmNvcyh0aGV0YSkgKiByYWRpdXMsIDAsIE1hdGguc2luKHRoZXRhKSAqIHJhZGl1c10pO1xuXHR9XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXTtcblx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzZWdzOyBzKyspIHtcblx0XHRjb25zdCBuZXh0ID0gKChzICsgMSkgJSBzZWdzKSArIDE7XG5cdFx0ZmFjZXMucHVzaChbMCwgbmV4dCwgcyArIDFdKTtcblx0fVxuXHRyZXR1cm4gYnVpbGQodmVydGljZXMsIGZhY2VzLCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBncmlkTWVzaChzdWJkaXZYID0gNCwgc3ViZGl2WSA9IDQsIHNpemVYID0gMiwgc2l6ZVkgPSAyKTogTWVzaCB7XG5cdGNvbnN0IHN4ID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihzdWJkaXZYKSk7XG5cdGNvbnN0IHN5ID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihzdWJkaXZZKSk7XG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBbXTtcblx0Zm9yIChsZXQgeSA9IDA7IHkgPD0gc3k7IHkrKykge1xuXHRcdGZvciAobGV0IHggPSAwOyB4IDw9IHN4OyB4KyspIHtcblx0XHRcdGNvbnN0IHB4ID0gKHggLyBzeCAtIDAuNSkgKiBzaXplWDtcblx0XHRcdGNvbnN0IHB6ID0gKHkgLyBzeSAtIDAuNSkgKiBzaXplWTtcblx0XHRcdHZlcnRpY2VzLnB1c2goW3B4LCAwLCBwel0pO1xuXHRcdH1cblx0fVxuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGZvciAobGV0IHkgPSAwOyB5IDwgc3k7IHkrKykge1xuXHRcdGZvciAobGV0IHggPSAwOyB4IDwgc3g7IHgrKykge1xuXHRcdFx0Y29uc3QgaTAgPSB5ICogKHN4ICsgMSkgKyB4O1xuXHRcdFx0Y29uc3QgaTEgPSBpMCArIDE7XG5cdFx0XHRjb25zdCBpMiA9ICh5ICsgMSkgKiAoc3ggKyAxKSArIHggKyAxO1xuXHRcdFx0Y29uc3QgaTMgPSAoeSArIDEpICogKHN4ICsgMSkgKyB4O1xuXHRcdFx0ZmFjZXMucHVzaChbaTAsIGkzLCBpMiwgaTFdKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGJ1aWxkKHZlcnRpY2VzLCBmYWNlcywgZmFsc2UpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHlyYW1pZE1lc2goc2lkZXMgPSA0LCByYWRpdXMgPSAwLjUsIGhlaWdodCA9IDEpOiBNZXNoIHtcblx0Y29uc3Qgc2RzID0gTWF0aC5tYXgoMywgTWF0aC5mbG9vcihzaWRlcykpO1xuXHRjb25zdCBoYWxmID0gaGVpZ2h0IC8gMjtcblx0Y29uc3QgdmVydGljZXM6IFZlYzNbXSA9IFtbMCwgaGFsZiwgMF1dO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNkczsgcysrKSB7XG5cdFx0Y29uc3QgdGhldGEgPSAocyAvIHNkcykgKiBNYXRoLlBJICogMjtcblx0XHR2ZXJ0aWNlcy5wdXNoKFtNYXRoLmNvcyh0aGV0YSkgKiByYWRpdXMsIC1oYWxmLCBNYXRoLnNpbih0aGV0YSkgKiByYWRpdXNdKTtcblx0fVxuXHRjb25zdCBiYXNlQ2VudGVyID0gdmVydGljZXMubGVuZ3RoO1xuXHR2ZXJ0aWNlcy5wdXNoKFswLCAtaGFsZiwgMF0pO1xuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGZvciAobGV0IHMgPSAwOyBzIDwgc2RzOyBzKyspIHtcblx0XHRjb25zdCBjdXJyID0gcyArIDE7XG5cdFx0Y29uc3QgbmV4dCA9ICgocyArIDEpICUgc2RzKSArIDE7XG5cdFx0ZmFjZXMucHVzaChbMCwgY3VyciwgbmV4dF0pO1xuXHR9XG5cdGZvciAobGV0IHMgPSAwOyBzIDwgc2RzOyBzKyspIHtcblx0XHRjb25zdCBjdXJyID0gcyArIDE7XG5cdFx0Y29uc3QgbmV4dCA9ICgocyArIDEpICUgc2RzKSArIDE7XG5cdFx0ZmFjZXMucHVzaChbYmFzZUNlbnRlciwgbmV4dCwgY3Vycl0pO1xuXHR9XG5cdHJldHVybiBidWlsZCh2ZXJ0aWNlcywgZmFjZXMsIGZhbHNlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHR1YmVNZXNoKHNlZ21lbnRzID0gMjQsIGlubmVyUmFkaXVzID0gMC4zLCBvdXRlclJhZGl1cyA9IDAuNSwgaGVpZ2h0ID0gMSk6IE1lc2gge1xuXHRjb25zdCBzZWdzID0gTWF0aC5tYXgoOCwgTWF0aC5mbG9vcihzZWdtZW50cykpO1xuXHRjb25zdCBpblIgPSBNYXRoLm1heCgwLjA1LCBNYXRoLm1pbihpbm5lclJhZGl1cywgb3V0ZXJSYWRpdXMgLSAwLjA1KSk7XG5cdGNvbnN0IG91dFIgPSBNYXRoLm1heChpblIgKyAwLjA1LCBvdXRlclJhZGl1cyk7XG5cdGNvbnN0IGhhbGYgPSBoZWlnaHQgLyAyO1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gW107XG5cdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0Y29uc3QgdGggPSAocyAvIHNlZ3MpICogTWF0aC5QSSAqIDI7XG5cdFx0dmVydGljZXMucHVzaChbTWF0aC5jb3ModGgpICogb3V0UiwgaGFsZiwgTWF0aC5zaW4odGgpICogb3V0Ul0pO1xuXHR9XG5cdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0Y29uc3QgdGggPSAocyAvIHNlZ3MpICogTWF0aC5QSSAqIDI7XG5cdFx0dmVydGljZXMucHVzaChbTWF0aC5jb3ModGgpICogb3V0UiwgLWhhbGYsIE1hdGguc2luKHRoKSAqIG91dFJdKTtcblx0fVxuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNlZ3M7IHMrKykge1xuXHRcdGNvbnN0IHRoID0gKHMgLyBzZWdzKSAqIE1hdGguUEkgKiAyO1xuXHRcdHZlcnRpY2VzLnB1c2goW01hdGguY29zKHRoKSAqIGluUiwgaGFsZiwgTWF0aC5zaW4odGgpICogaW5SXSk7XG5cdH1cblx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzZWdzOyBzKyspIHtcblx0XHRjb25zdCB0aCA9IChzIC8gc2VncykgKiBNYXRoLlBJICogMjtcblx0XHR2ZXJ0aWNlcy5wdXNoKFtNYXRoLmNvcyh0aCkgKiBpblIsIC1oYWxmLCBNYXRoLnNpbih0aCkgKiBpblJdKTtcblx0fVxuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGNvbnN0IE4gPSBzZWdzO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IE47IHMrKykge1xuXHRcdGNvbnN0IG54dCA9IChzICsgMSkgJSBOO1xuXHRcdGZhY2VzLnB1c2goW3MsIHMgKyBOLCBueHQgKyBOLCBueHRdKTtcblx0XHRmYWNlcy5wdXNoKFtzLCBueHQsIDIgKiBOICsgbnh0LCAyICogTiArIHNdKTtcblx0XHRmYWNlcy5wdXNoKFtzICsgTiwgMyAqIE4gKyBzLCAzICogTiArIG54dCwgbnh0ICsgTl0pO1xuXHRcdGZhY2VzLnB1c2goWzIgKiBOICsgcywgMiAqIE4gKyBueHQsIDMgKiBOICsgbnh0LCAzICogTiArIHNdKTtcblx0fVxuXHRyZXR1cm4gYnVpbGQodmVydGljZXMsIGZhY2VzLCB0cnVlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhcHN1bGVNZXNoKHNlZ21lbnRzID0gMjAsIHJpbmdzID0gNiwgcmFkaXVzID0gMC4yNSwgaGVpZ2h0ID0gMC42KTogTWVzaCB7XG5cdGNvbnN0IHNlZ3MgPSBNYXRoLm1heCg4LCBNYXRoLmZsb29yKHNlZ21lbnRzKSk7XG5cdGNvbnN0IHJuZ3MgPSBNYXRoLm1heCgzLCBNYXRoLmZsb29yKHJpbmdzKSk7XG5cdGNvbnN0IGhhbGZIID0gaGVpZ2h0IC8gMjtcblx0Y29uc3QgdmVydGljZXM6IFZlYzNbXSA9IFtdO1xuXHRjb25zdCBub3JtYWxzOiBWZWMzW10gPSBbXTtcblx0dmVydGljZXMucHVzaChbMCwgaGFsZkggKyByYWRpdXMsIDBdKTtcblx0bm9ybWFscy5wdXNoKFswLCAxLCAwXSk7XG5cdGZvciAobGV0IHIgPSAxOyByIDw9IHJuZ3M7IHIrKykge1xuXHRcdGNvbnN0IHBoaSA9IChyIC8gcm5ncykgKiAoTWF0aC5QSSAvIDIpO1xuXHRcdGNvbnN0IHkgPSBoYWxmSCArIE1hdGguY29zKHBoaSkgKiByYWRpdXM7XG5cdFx0Y29uc3QgclJpbmcgPSBNYXRoLnNpbihwaGkpICogcmFkaXVzO1xuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0XHRjb25zdCB0aCA9IChzIC8gc2VncykgKiBNYXRoLlBJICogMjtcblx0XHRcdHZlcnRpY2VzLnB1c2goW01hdGguY29zKHRoKSAqIHJSaW5nLCB5LCBNYXRoLnNpbih0aCkgKiByUmluZ10pO1xuXHRcdFx0bm9ybWFscy5wdXNoKFtNYXRoLmNvcyh0aCkgKiBNYXRoLnNpbihwaGkpLCBNYXRoLmNvcyhwaGkpLCBNYXRoLnNpbih0aCkgKiBNYXRoLnNpbihwaGkpXSk7XG5cdFx0fVxuXHR9XG5cdGZvciAobGV0IHIgPSAwOyByIDwgcm5nczsgcisrKSB7XG5cdFx0Y29uc3QgcGhpID0gKE1hdGguUEkgLyAyKSArIChyIC8gcm5ncykgKiAoTWF0aC5QSSAvIDIpO1xuXHRcdGNvbnN0IHkgPSAtaGFsZkggKyBNYXRoLmNvcyhwaGkpICogcmFkaXVzO1xuXHRcdGNvbnN0IHJSaW5nID0gTWF0aC5zaW4ocGhpKSAqIHJhZGl1cztcblx0XHRmb3IgKGxldCBzID0gMDsgcyA8IHNlZ3M7IHMrKykge1xuXHRcdFx0Y29uc3QgdGggPSAocyAvIHNlZ3MpICogTWF0aC5QSSAqIDI7XG5cdFx0XHR2ZXJ0aWNlcy5wdXNoKFtNYXRoLmNvcyh0aCkgKiByUmluZywgeSwgTWF0aC5zaW4odGgpICogclJpbmddKTtcblx0XHRcdG5vcm1hbHMucHVzaChbTWF0aC5jb3ModGgpICogTWF0aC5zaW4ocGhpKSwgTWF0aC5jb3MocGhpKSwgTWF0aC5zaW4odGgpICogTWF0aC5zaW4ocGhpKV0pO1xuXHRcdH1cblx0fVxuXHRjb25zdCBzb3V0aFBvbGUgPSB2ZXJ0aWNlcy5sZW5ndGg7XG5cdHZlcnRpY2VzLnB1c2goWzAsIC1oYWxmSCAtIHJhZGl1cywgMF0pO1xuXHRub3JtYWxzLnB1c2goWzAsIC0xLCAwXSk7XG5cblx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNlZ3M7IHMrKykge1xuXHRcdGNvbnN0IG54dCA9IChzICsgMSkgJSBzZWdzO1xuXHRcdGZhY2VzLnB1c2goWzAsIDEgKyBzLCAxICsgbnh0XSk7XG5cdH1cblx0Y29uc3QgdG90YWxSaW5ncyA9IHJuZ3MgKiAyO1xuXHRmb3IgKGxldCByID0gMDsgciA8IHRvdGFsUmluZ3MgLSAxOyByKyspIHtcblx0XHRjb25zdCByb3cgPSAxICsgciAqIHNlZ3M7XG5cdFx0Y29uc3Qgbnh0Um93ID0gMSArIChyICsgMSkgKiBzZWdzO1xuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0XHRjb25zdCBueHQgPSAocyArIDEpICUgc2Vncztcblx0XHRcdGZhY2VzLnB1c2goW3JvdyArIHMsIG54dFJvdyArIHMsIG54dFJvdyArIG54dCwgcm93ICsgbnh0XSk7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IGxhc3RSb3cgPSAxICsgKHRvdGFsUmluZ3MgLSAxKSAqIHNlZ3M7XG5cdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0Y29uc3Qgbnh0ID0gKHMgKyAxKSAlIHNlZ3M7XG5cdFx0ZmFjZXMucHVzaChbc291dGhQb2xlLCBsYXN0Um93ICsgbnh0LCBsYXN0Um93ICsgc10pO1xuXHR9XG5cdHJldHVybiBidWlsZCh2ZXJ0aWNlcywgZmFjZXMsIHRydWUsIG5vcm1hbHMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYmV6aWVyQ3VydmVNZXNoKCk6IE1lc2gge1xuXHRjb25zdCBzdGVwcyA9IDI0O1xuXHRjb25zdCBzZWdzID0gODtcblx0Y29uc3QgciA9IDAuMDU7XG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBbXTtcblx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRjb25zdCBwMDogVmVjMyA9IFstMC44LCAtMC40LCAwXTtcblx0Y29uc3QgcDE6IFZlYzMgPSBbLTAuMywgMC42LCAwLjRdO1xuXHRjb25zdCBwMjogVmVjMyA9IFswLjMsIC0wLjYsIC0wLjRdO1xuXHRjb25zdCBwMzogVmVjMyA9IFswLjgsIDAuNCwgMF07XG5cdGZvciAobGV0IGkgPSAwOyBpIDw9IHN0ZXBzOyBpKyspIHtcblx0XHRjb25zdCB0ID0gaSAvIHN0ZXBzO1xuXHRcdGNvbnN0IGl0ID0gMSAtIHQ7XG5cdFx0Y29uc3QgcHggPSBpdCppdCppdCpwMFswXSArIDMqaXQqaXQqdCpwMVswXSArIDMqaXQqdCp0KnAyWzBdICsgdCp0KnQqcDNbMF07XG5cdFx0Y29uc3QgcHkgPSBpdCppdCppdCpwMFsxXSArIDMqaXQqaXQqdCpwMVsxXSArIDMqaXQqdCp0KnAyWzFdICsgdCp0KnQqcDNbMV07XG5cdFx0Y29uc3QgcHogPSBpdCppdCppdCpwMFsyXSArIDMqaXQqaXQqdCpwMVsyXSArIDMqaXQqdCp0KnAyWzJdICsgdCp0KnQqcDNbMl07XG5cdFx0Y29uc3QgdHggPSAzKml0Kml0KihwMVswXS1wMFswXSkgKyA2Kml0KnQqKHAyWzBdLXAxWzBdKSArIDMqdCp0KihwM1swXS1wMlswXSk7XG5cdFx0Y29uc3QgdHkgPSAzKml0Kml0KihwMVsxXS1wMFsxXSkgKyA2Kml0KnQqKHAyWzFdLXAxWzFdKSArIDMqdCp0KihwM1sxXS1wMlsxXSk7XG5cdFx0Y29uc3QgdHogPSAzKml0Kml0KihwMVsyXS1wMFsyXSkgKyA2Kml0KnQqKHAyWzJdLXAxWzJdKSArIDMqdCp0KihwM1syXS1wMlsyXSk7XG5cdFx0Y29uc3QgdExlbiA9IE1hdGguaHlwb3QodHgsIHR5LCB0eikgfHwgMTtcblx0XHRjb25zdCB1cDogVmVjMyA9IFswLCAxLCAwXTtcblx0XHRsZXQgbnggPSB1cFsxXSoodHovdExlbikgLSB1cFsyXSoodHkvdExlbik7XG5cdFx0bGV0IG55ID0gdXBbMl0qKHR4L3RMZW4pIC0gdXBbMF0qKHR6L3RMZW4pO1xuXHRcdGxldCBueiA9IHVwWzBdKih0eS90TGVuKSAtIHVwWzFdKih0eC90TGVuKTtcblx0XHRjb25zdCBuTGVuID0gTWF0aC5oeXBvdChueCwgbnksIG56KSB8fCAxO1xuXHRcdG54IC89IG5MZW47IG55IC89IG5MZW47IG56IC89IG5MZW47XG5cdFx0Y29uc3QgYnggPSAodHkvdExlbikqbnogLSAodHovdExlbikqbnk7XG5cdFx0Y29uc3QgYnkgPSAodHovdExlbikqbnggLSAodHgvdExlbikqbno7XG5cdFx0Y29uc3QgYnogPSAodHgvdExlbikqbnkgLSAodHkvdExlbikqbng7XG5cdFx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzZWdzOyBzKyspIHtcblx0XHRcdGNvbnN0IHRoID0gKHMgLyBzZWdzKSAqIE1hdGguUEkgKiAyO1xuXHRcdFx0Y29uc3QgYyA9IE1hdGguY29zKHRoKSAqIHI7XG5cdFx0XHRjb25zdCBzbiA9IE1hdGguc2luKHRoKSAqIHI7XG5cdFx0XHR2ZXJ0aWNlcy5wdXNoKFtweCArIG54ICogYyArIGJ4ICogc24sIHB5ICsgbnkgKiBjICsgYnkgKiBzbiwgcHogKyBueiAqIGMgKyBieiAqIHNuXSk7XG5cdFx0fVxuXHR9XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgc3RlcHM7IGkrKykge1xuXHRcdGNvbnN0IHJvdyA9IGkgKiBzZWdzO1xuXHRcdGNvbnN0IG54dFJvdyA9IChpICsgMSkgKiBzZWdzO1xuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgc2VnczsgcysrKSB7XG5cdFx0XHRjb25zdCBueHQgPSAocyArIDEpICUgc2Vncztcblx0XHRcdGZhY2VzLnB1c2goW3JvdyArIHMsIG54dFJvdyArIHMsIG54dFJvdyArIG54dCwgcm93ICsgbnh0XSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBidWlsZCh2ZXJ0aWNlcywgZmFjZXMsIHRydWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYmV6aWVyQ2lyY2xlTWVzaCgpOiBNZXNoIHtcblx0cmV0dXJuIHRvcnVzTWVzaCgzMiwgMTIsIDAuNSwgMC4wNCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXRoQ3VydmVNZXNoKCk6IE1lc2gge1xuXHRyZXR1cm4gY3lsaW5kZXJNZXNoKDE2LCAwLjA1LCAxLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbnVyYnNDdXJ2ZU1lc2goKTogTWVzaCB7XG5cdHJldHVybiBiZXppZXJDdXJ2ZU1lc2goKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBvaW50TGlnaHRNZXNoKCk6IE1lc2gge1xuXHRyZXR1cm4gYnVpbGQoW1xuXHRcdFswLCAwLjI1LCAwXSwgWzAuMiwgMCwgMF0sIFswLCAwLCAwLjJdLCBbLTAuMiwgMCwgMF0sIFswLCAwLCAtMC4yXSwgWzAsIC0wLjI1LCAwXVxuXHRdLCBbXG5cdFx0WzAsIDEsIDJdLCBbMCwgMiwgM10sIFswLCAzLCA0XSwgWzAsIDQsIDFdLFxuXHRcdFs1LCAyLCAxXSwgWzUsIDMsIDJdLCBbNSwgNCwgM10sIFs1LCAxLCA0XVxuXHRdLCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdW5MaWdodE1lc2goKTogTWVzaCB7XG5cdHJldHVybiBjeWxpbmRlck1lc2goMTYsIDAsIDAuMDgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3BvdExpZ2h0TWVzaCgpOiBNZXNoIHtcblx0cmV0dXJuIGNvbmVNZXNoKDI0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFyZWFMaWdodE1lc2goKTogTWVzaCB7XG5cdHJldHVybiBwbGFuZU1lc2goKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBlcnNwZWN0aXZlQ2FtZXJhTWVzaCgpOiBNZXNoIHtcblx0Y29uc3QgdmVydHM6IFZlYzNbXSA9IFtcblx0XHRbLTAuMiwgLTAuMTUsIDAuMV0sIFswLjIsIC0wLjE1LCAwLjFdLCBbMC4yLCAwLjE1LCAwLjFdLCBbLTAuMiwgMC4xNSwgMC4xXSxcblx0XHRbLTAuMiwgLTAuMTUsIDAuMzVdLCBbMC4yLCAtMC4xNSwgMC4zNV0sIFswLjIsIDAuMTUsIDAuMzVdLCBbLTAuMiwgMC4xNSwgMC4zNV0sXG5cdFx0Wy0wLjI4LCAtMC4yLCAtMC4zXSwgWzAuMjgsIC0wLjIsIC0wLjNdLCBbMC4yOCwgMC4yLCAtMC4zXSwgWy0wLjI4LCAwLjIsIC0wLjNdXG5cdF07XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXG5cdFx0WzAsIDMsIDIsIDFdLCBbNCwgNSwgNiwgN10sIFswLCA0LCA3LCAzXSwgWzEsIDIsIDYsIDVdLCBbMywgNywgNiwgMl0sIFswLCAxLCA1LCA0XSxcblx0XHRbMCwgMSwgOSwgOF0sIFsxLCAyLCAxMCwgOV0sIFsyLCAzLCAxMSwgMTBdLCBbMywgMCwgOCwgMTFdLCBbOCwgOSwgMTAsIDExXVxuXHRdO1xuXHRyZXR1cm4gYnVpbGQodmVydHMsIGZhY2VzLCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcnRob0NhbWVyYU1lc2goKTogTWVzaCB7XG5cdHJldHVybiBwZXJzcGVjdGl2ZUNhbWVyYU1lc2goKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVtcHR5QXhlc01lc2goKTogTWVzaCB7XG5cdGNvbnN0IHY6IFZlYzNbXSA9IFtcblx0XHRbMCwgMCwgMF0sIFswLjgsIDAsIDBdLCBbMC44LCAwLjAzLCAwXSwgWzAsIDAuMDMsIDBdLFxuXHRcdFswLCAwLCAwXSwgWzAsIDAuOCwgMF0sIFswLjAzLCAwLjgsIDBdLCBbMC4wMywgMCwgMF0sXG5cdFx0WzAsIDAsIDBdLCBbMCwgMCwgMC44XSwgWzAsIDAuMDMsIDAuOF0sIFswLCAwLjAzLCAwXVxuXHRdO1xuXHRyZXR1cm4gYnVpbGQodiwgW1swLCAxLCAyLCAzXSwgWzQsIDUsIDYsIDddLCBbOCwgOSwgMTAsIDExXV0sIGZhbHNlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVtcHR5QXJyb3dzTWVzaCgpOiBNZXNoIHtcblx0cmV0dXJuIGVtcHR5QXhlc01lc2goKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVtcHR5Q3ViZU1lc2goKTogTWVzaCB7XG5cdHJldHVybiBjdWJlTWVzaCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW1wdHlTcGhlcmVNZXNoKCk6IE1lc2gge1xuXHRyZXR1cm4gdG9ydXNNZXNoKDI0LCA2LCAwLjUsIDAuMDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW1wdHlDaXJjbGVNZXNoKCk6IE1lc2gge1xuXHRyZXR1cm4gY2lyY2xlTWVzaCgzMiwgMC41KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVtcHR5SW1hZ2VNZXNoKCk6IE1lc2gge1xuXHRyZXR1cm4gbWVkaWFQbGFuZU1lc2goKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRleHQzZE1lc2godGV4dCA9ICdURVhUJywgZGVwdGggPSAwLjE1LCBiZXZlbCA9IDAuMDIpOiBNZXNoIHtcblx0Y29uc3QgbGVuID0gTWF0aC5tYXgoMSwgKHRleHQgfHwgJ1RFWFQnKS50cmltKCkubGVuZ3RoKTtcblx0Y29uc3Qgd2lkdGggPSBNYXRoLm1pbigzLjIsIE1hdGgubWF4KDAuNiwgbGVuICogMC4yOCkpO1xuXHRyZXR1cm4gY3ViZU1lc2god2lkdGgsIDAuNSArIGJldmVsICogMiwgTWF0aC5tYXgoMC4wNSwgZGVwdGgpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ldGFiYWxsTWVzaChzaGFwZSA9ICdiYWxsJyk6IE1lc2gge1xuXHRyZXR1cm4gc3BoZXJlTWVzaCgzMiwgMTYpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGF0dGljZU1lc2goKTogTWVzaCB7XG5cdHJldHVybiBjdWJlTWVzaCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9yY2VGaWVsZE1lc2goKTogTWVzaCB7XG5cdHJldHVybiB0b3J1c01lc2goMzIsIDgsIDAuNiwgMC4wMyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzcGVha2VyTWVzaCgpOiBNZXNoIHtcblx0Y29uc3QgdmVydHM6IFZlYzNbXSA9IFtcblx0XHRbLTAuMywgLTAuNCwgLTAuMjVdLCBbMC4zLCAtMC40LCAtMC4yNV0sIFswLjMsIDAuNCwgLTAuMjVdLCBbLTAuMywgMC40LCAtMC4yNV0sXG5cdFx0Wy0wLjMsIC0wLjQsICAwLjI1XSwgWzAuMywgLTAuNCwgIDAuMjVdLCBbMC4zLCAwLjQsICAwLjI1XSwgWy0wLjMsIDAuNCwgIDAuMjVdXG5cdF07XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXG5cdFx0WzAsIDMsIDIsIDFdLCBbNCwgNSwgNiwgN10sIFswLCA0LCA3LCAzXSwgWzEsIDIsIDYsIDVdLCBbMywgNywgNiwgMl0sIFswLCAxLCA1LCA0XVxuXHRdO1xuXHRyZXR1cm4gYnVpbGQodmVydHMsIGZhY2VzLCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdXphbm5lTWVzaCgpOiBNZXNoIHtcblx0Y29uc3QgdmVydHM6IFZlYzNbXSA9IFtcblx0XHRbLTAuNCwgMC41LCAtMC4yXSwgWzAuNCwgMC41LCAtMC4yXSwgWzAuNCwgMC41LCAwLjJdLCBbLTAuNCwgMC41LCAwLjJdLFxuXHRcdFstMC41LCAwLjIsIC0wLjNdLCBbMC41LCAwLjIsIC0wLjNdLCBbMC41LCAwLjIsIDAuM10sIFstMC41LCAwLjIsIDAuM10sXG5cdFx0Wy0wLjM1LCAwLjE1LCAwLjQ1XSwgWzAuMzUsIDAuMTUsIDAuNDVdLFxuXHRcdFstMC4yLCAwLjA1LCAwLjRdLCBbMC4yLCAwLjA1LCAwLjRdLFxuXHRcdFstMC4yLCAtMC4xNSwgMC41NV0sIFswLjIsIC0wLjE1LCAwLjU1XSxcblx0XHRbLTAuMTUsIC0wLjM1LCAwLjVdLCBbMC4xNSwgLTAuMzUsIDAuNV0sXG5cdFx0Wy0wLjI1LCAtMC40LCAwLjFdLCBbMC4yNSwgLTAuNCwgMC4xXSxcblx0XHRbLTAuMywgLTAuMiwgLTAuNF0sIFswLjMsIC0wLjIsIC0wLjRdLFxuXHRcdFstMC43LCAwLjIsIDAuMF0sIFstMC43LCAtMC4xLCAwLjBdLFxuXHRcdFswLjcsIDAuMiwgMC4wXSwgWzAuNywgLTAuMSwgMC4wXSxcblx0XTtcblx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtcblx0XHRbMCwgMSwgMiwgM10sIFswLCA0LCA1LCAxXSwgWzEsIDUsIDYsIDJdLCBbMywgMiwgNiwgN10sIFswLCAzLCA3LCA0XSxcblx0XHRbNywgNiwgOSwgOF0sIFs4LCA5LCAxMSwgMTBdLCBbMTAsIDExLCAxMywgMTJdLCBbMTIsIDEzLCAxNSwgMTRdLCBbMTQsIDE1LCAxNywgMTZdLFxuXHRcdFs0LCA3LCAxOF0sIFs1LCAxOSwgNl0sIFsxOCwgMTksIDUsIDRdLCBbMTYsIDE3LCAxOSwgMThdLFxuXHRcdFs0LCAyMCwgMjEsIDddLCBbNiwgMjMsIDIyLCA1XSxcblx0XTtcblx0cmV0dXJuIGJ1aWxkKHZlcnRzLCBmYWNlcywgdHJ1ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmVlTWVzaCgpOiBNZXNoIHtcblx0Y29uc3QgdmVydHM6IFZlYzNbXSA9IFtdO1xuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGNvbnN0IHNpZGVzID0gNjtcblx0Zm9yIChsZXQgcyA9IDA7IHMgPCBzaWRlczsgcysrKSB7XG5cdFx0Y29uc3QgdGggPSAocyAvIHNpZGVzKSAqIE1hdGguUEkgKiAyO1xuXHRcdHZlcnRzLnB1c2goW01hdGguY29zKHRoKSAqIDAuMTIsIC0wLjUsIE1hdGguc2luKHRoKSAqIDAuMTJdKTtcblx0fVxuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNpZGVzOyBzKyspIHtcblx0XHRjb25zdCB0aCA9IChzIC8gc2lkZXMpICogTWF0aC5QSSAqIDI7XG5cdFx0dmVydHMucHVzaChbTWF0aC5jb3ModGgpICogMC4xLCAwLjAsIE1hdGguc2luKHRoKSAqIDAuMV0pO1xuXHR9XG5cdGZvciAobGV0IHMgPSAwOyBzIDwgc2lkZXM7IHMrKykge1xuXHRcdGNvbnN0IG54dCA9IChzICsgMSkgJSBzaWRlcztcblx0XHRmYWNlcy5wdXNoKFtzLCBueHQsIG54dCArIHNpZGVzLCBzICsgc2lkZXNdKTtcblx0fVxuXHRjb25zdCB0MV9iYXNlID0gdmVydHMubGVuZ3RoO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNpZGVzOyBzKyspIHtcblx0XHRjb25zdCB0aCA9IChzIC8gc2lkZXMpICogTWF0aC5QSSAqIDI7XG5cdFx0dmVydHMucHVzaChbTWF0aC5jb3ModGgpICogMC41NSwgMC4wLCBNYXRoLnNpbih0aCkgKiAwLjU1XSk7XG5cdH1cblx0Y29uc3QgdDFfYXBleCA9IHZlcnRzLmxlbmd0aDtcblx0dmVydHMucHVzaChbMCwgMC40NSwgMF0pO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNpZGVzOyBzKyspIHtcblx0XHRjb25zdCBueHQgPSAocyArIDEpICUgc2lkZXM7XG5cdFx0ZmFjZXMucHVzaChbdDFfYXBleCwgdDFfYmFzZSArIHMsIHQxX2Jhc2UgKyBueHRdKTtcblx0fVxuXHRjb25zdCB0Ml9iYXNlID0gdmVydHMubGVuZ3RoO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNpZGVzOyBzKyspIHtcblx0XHRjb25zdCB0aCA9IChzIC8gc2lkZXMpICogTWF0aC5QSSAqIDI7XG5cdFx0dmVydHMucHVzaChbTWF0aC5jb3ModGgpICogMC4zOCwgMC4zLCBNYXRoLnNpbih0aCkgKiAwLjM4XSk7XG5cdH1cblx0Y29uc3QgdDJfYXBleCA9IHZlcnRzLmxlbmd0aDtcblx0dmVydHMucHVzaChbMCwgMC43NSwgMF0pO1xuXHRmb3IgKGxldCBzID0gMDsgcyA8IHNpZGVzOyBzKyspIHtcblx0XHRjb25zdCBueHQgPSAocyArIDEpICUgc2lkZXM7XG5cdFx0ZmFjZXMucHVzaChbdDJfYXBleCwgdDJfYmFzZSArIHMsIHQyX2Jhc2UgKyBueHRdKTtcblx0fVxuXHRyZXR1cm4gYnVpbGQodmVydHMsIGZhY2VzLCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYXJNZXNoKCk6IE1lc2gge1xuXHRjb25zdCB2ZXJ0czogVmVjM1tdID0gW1xuXHRcdFstMC40NSwgLTAuMTUsIC0wLjldLCBbMC40NSwgLTAuMTUsIC0wLjldLCBbMC40NSwgMC4xLCAtMC45XSwgWy0wLjQ1LCAwLjEsIC0wLjldLFxuXHRcdFstMC40NSwgLTAuMTUsICAwLjldLCBbMC40NSwgLTAuMTUsICAwLjldLCBbMC40NSwgMC4xLCAgMC45XSwgWy0wLjQ1LCAwLjEsICAwLjldLFxuXHRcdFstMC4zOCwgMC4xLCAtMC40XSwgWzAuMzgsIDAuMSwgLTAuNF0sIFswLjMyLCAwLjQsIC0wLjJdLCBbLTAuMzIsIDAuNCwgLTAuMl0sXG5cdFx0Wy0wLjM4LCAwLjEsICAwLjM1XSwgWzAuMzgsIDAuMSwgIDAuMzVdLCBbMC4zMiwgMC40LCAgMC4yNV0sIFstMC4zMiwgMC40LCAgMC4yNV0sXG5cdF07XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXG5cdFx0WzAsIDMsIDIsIDFdLCBbNCwgNSwgNiwgN10sIFswLCAxLCA1LCA0XSwgWzMsIDcsIDYsIDJdLCBbMCwgNCwgNywgM10sIFsxLCAyLCA2LCA1XSxcblx0XHRbOCwgOSwgMTAsIDExXSwgWzEyLCAxNSwgMTQsIDEzXSwgWzExLCAxMCwgMTQsIDE1XSwgWzgsIDExLCAxNSwgMTJdLCBbOSwgMTMsIDE0LCAxMF0sXG5cdF07XG5cdHJldHVybiBidWlsZCh2ZXJ0cywgZmFjZXMsIGZhbHNlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNoYXJhY3Rlck1lc2goKTogTWVzaCB7XG5cdGNvbnN0IHZlcnRzOiBWZWMzW10gPSBbXG5cdFx0Wy0wLjE1LCAwLjUsIC0wLjE1XSwgWzAuMTUsIDAuNSwgLTAuMTVdLCBbMC4xNSwgMC43NSwgLTAuMTVdLCBbLTAuMTUsIDAuNzUsIC0wLjE1XSxcblx0XHRbLTAuMTUsIDAuNSwgIDAuMTVdLCBbMC4xNSwgMC41LCAgMC4xNV0sIFswLjE1LCAwLjc1LCAgMC4xNV0sIFstMC4xNSwgMC43NSwgIDAuMTVdLFxuXHRcdFstMC4yMiwgMC4wNSwgLTAuMTJdLCBbMC4yMiwgMC4wNSwgLTAuMTJdLCBbMC4yNiwgMC40NSwgLTAuMTJdLCBbLTAuMjYsIDAuNDUsIC0wLjEyXSxcblx0XHRbLTAuMjIsIDAuMDUsICAwLjEyXSwgWzAuMjIsIDAuMDUsICAwLjEyXSwgWzAuMjYsIDAuNDUsICAwLjEyXSwgWy0wLjI2LCAwLjQ1LCAgMC4xMl0sXG5cdFx0Wy0wLjIsIC0wLjUsIC0wLjA5XSwgWy0wLjA0LCAtMC41LCAtMC4wOV0sIFstMC4wNCwgLTAuNSwgMC4wOV0sIFstMC4yLCAtMC41LCAwLjA5XSxcblx0XHRbMC4wNCwgLTAuNSwgLTAuMDldLCBbMC4yLCAtMC41LCAtMC4wOV0sIFswLjIsIC0wLjUsIDAuMDldLCBbMC4wNCwgLTAuNSwgMC4wOV0sXG5cdF07XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXG5cdFx0WzAsIDMsIDIsIDFdLCBbNCwgNSwgNiwgN10sIFswLCA0LCA3LCAzXSwgWzEsIDIsIDYsIDVdLCBbMywgNywgNiwgMl0sIFswLCAxLCA1LCA0XSxcblx0XHRbOCwgMTEsIDEwLCA5XSwgWzEyLCAxMywgMTQsIDE1XSwgWzgsIDEyLCAxNSwgMTFdLCBbOSwgMTAsIDE0LCAxM10sIFsxMSwgMTUsIDE0LCAxMF0sIFs4LCA5LCAxMywgMTJdLFxuXHRcdFsxNiwgMTcsIDE4LCAxOV0sIFs4LCAxNiwgMTksIDEyXSxcblx0XHRbMjAsIDIxLCAyMiwgMjNdLCBbOSwgMTMsIDIyLCAyMV0sXG5cdF07XG5cdHJldHVybiBidWlsZCh2ZXJ0cywgZmFjZXMsIGZhbHNlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNoYWlyTWVzaCgpOiBNZXNoIHtcblx0Y29uc3QgdmVydHM6IFZlYzNbXSA9IFtcblx0XHRbLTAuMywgMC4wLCAtMC4zXSwgWzAuMywgMC4wLCAtMC4zXSwgWzAuMywgMC4wOCwgLTAuM10sIFstMC4zLCAwLjA4LCAtMC4zXSxcblx0XHRbLTAuMywgMC4wLCAgMC4zXSwgWzAuMywgMC4wLCAgMC4zXSwgWzAuMywgMC4wOCwgIDAuM10sIFstMC4zLCAwLjA4LCAgMC4zXSxcblx0XHRbLTAuMywgMC41NSwgLTAuM10sIFswLjMsIDAuNTUsIC0wLjNdLCBbMC4zLCAwLjU1LCAtMC4yNF0sIFstMC4zLCAwLjU1LCAtMC4yNF1cblx0XTtcblx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtcblx0XHRbMCwgMywgMiwgMV0sIFs0LCA1LCA2LCA3XSwgWzAsIDQsIDcsIDNdLCBbMSwgMiwgNiwgNV0sIFszLCA3LCA2LCAyXSwgWzAsIDEsIDUsIDRdLFxuXHRcdFsyLCAzLCA4LCA5XSwgWzksIDgsIDExLCAxMF0sIFsyLCA5LCAxMCwgNl0sIFszLCA3LCAxMSwgOF1cblx0XTtcblx0cmV0dXJuIGJ1aWxkKHZlcnRzLCBmYWNlcywgZmFsc2UpO1xufVxuXG5cblxuY29uc3QgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgTWVzaD4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIG1lc2hGb3IodHlwZTogc3RyaW5nLCBwYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogTWVzaCB8IG51bGwge1xuXHRpZiAoIXBhcmFtcyAmJiBjYWNoZS5oYXModHlwZSkpIHJldHVybiBjYWNoZS5nZXQodHlwZSkgPz8gbnVsbDtcblx0bGV0IG1lc2g6IE1lc2ggfCBudWxsID0gbnVsbDtcblx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSAnY3ViZSc6XG5cdFx0XHRtZXNoID0gY3ViZU1lc2gocGFyYW1zPy5zaXplWCwgcGFyYW1zPy5zaXplWSwgcGFyYW1zPy5zaXplWik7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdzcGhlcmUnOlxuXHRcdFx0bWVzaCA9IHNwaGVyZU1lc2gocGFyYW1zPy5zZWdtZW50cywgcGFyYW1zPy5yaW5ncywgcGFyYW1zPy5yYWRpdXMpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnaWNvc3BoZXJlJzpcblx0XHRcdG1lc2ggPSBpY29TcGhlcmVNZXNoKHBhcmFtcz8uc3ViZGl2aXNpb25zLCBwYXJhbXM/LnJhZGl1cyk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdjeWxpbmRlcic6XG5cdFx0XHRtZXNoID0gY3lsaW5kZXJNZXNoKHBhcmFtcz8uc2VnbWVudHMsIHBhcmFtcz8uaW5uZXJSYWRpdXMsIHBhcmFtcz8uaGVpZ2h0LCBwYXJhbXM/LnJhZGl1cyk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdjb25lJzpcblx0XHRcdG1lc2ggPSBjb25lTWVzaChwYXJhbXM/LnNlZ21lbnRzLCBwYXJhbXM/LnJhZGl1cywgcGFyYW1zPy5oZWlnaHQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAndG9ydXMnOlxuXHRcdFx0bWVzaCA9IHRvcnVzTWVzaChwYXJhbXM/LnNlZ21lbnRzLCBwYXJhbXM/LnNpZGVzLCBwYXJhbXM/LnJhZGl1cywgcGFyYW1zPy50dWJlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ3BsYW5lJzpcblx0XHRcdGlmIChwYXJhbXMgJiYgKChwYXJhbXMuc3ViZGl2aXNpb25zICYmIHBhcmFtcy5zdWJkaXZpc2lvbnMgPiAxKSB8fCAocGFyYW1zLnNpemVYICYmIHBhcmFtcy5zaXplWCAhPT0gMi40KSkpIHtcblx0XHRcdFx0Y29uc3Qgc3ViID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChwYXJhbXMuc3ViZGl2aXNpb25zID8/IHBhcmFtcy5zdWJkaXZYID8/IDEpKTtcblx0XHRcdFx0Y29uc3Qgc3ogPSBwYXJhbXMuc2l6ZVggPz8gMTtcblx0XHRcdFx0bWVzaCA9IHN1YiA+IDEgPyBncmlkTWVzaChzdWIsIHN1Yiwgc3osIHBhcmFtcy5zaXplWiA/PyBzeikgOiBncmlkTWVzaCgxLCAxLCBzeiwgcGFyYW1zLnNpemVaID8/IHN6KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1lc2ggPSBwbGFuZU1lc2goKTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2NpcmNsZSc6XG5cdFx0XHRtZXNoID0gY2lyY2xlTWVzaChwYXJhbXM/LnNlZ21lbnRzLCBwYXJhbXM/LnJhZGl1cyk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdncmlkJzoge1xuXHRcdFx0Y29uc3QgZ3ggPSBwYXJhbXM/LnN1YmRpdmlzaW9ucyA/PyBwYXJhbXM/LnN1YmRpdlggPz8gNDtcblx0XHRcdGNvbnN0IGd5ID0gcGFyYW1zPy5zdWJkaXZpc2lvbnMgPz8gcGFyYW1zPy5zdWJkaXZZID8/IDQ7XG5cdFx0XHRjb25zdCBzeCA9IHBhcmFtcz8uc2l6ZVggPz8gMjtcblx0XHRcdGNvbnN0IHN5ID0gcGFyYW1zPy5zaXplWSA/PyBwYXJhbXM/LnNpemVYID8/IDI7XG5cdFx0XHRtZXNoID0gZ3JpZE1lc2goZ3gsIGd5LCBzeCwgc3kpO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ3B5cmFtaWQnOlxuXHRcdFx0bWVzaCA9IHB5cmFtaWRNZXNoKHBhcmFtcz8uc2lkZXMsIHBhcmFtcz8ucmFkaXVzLCBwYXJhbXM/LmhlaWdodCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICd0dWJlJzpcblx0XHRcdG1lc2ggPSB0dWJlTWVzaChwYXJhbXM/LnNlZ21lbnRzLCBwYXJhbXM/LmlubmVyUmFkaXVzLCBwYXJhbXM/Lm91dGVyUmFkaXVzLCBwYXJhbXM/LmhlaWdodCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdjYXBzdWxlJzpcblx0XHRcdG1lc2ggPSBjYXBzdWxlTWVzaChwYXJhbXM/LnNlZ21lbnRzLCBwYXJhbXM/LnJpbmdzLCBwYXJhbXM/LnJhZGl1cywgcGFyYW1zPy5oZWlnaHQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnY3VydmVfYmV6aWVyJzpcblx0XHRcdG1lc2ggPSBiZXppZXJDdXJ2ZU1lc2goKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2N1cnZlX2NpcmNsZSc6XG5cdFx0XHRtZXNoID0gYmV6aWVyQ2lyY2xlTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnY3VydmVfcGF0aCc6XG5cdFx0XHRtZXNoID0gcGF0aEN1cnZlTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnY3VydmVfbnVyYnMnOlxuXHRcdFx0bWVzaCA9IG51cmJzQ3VydmVNZXNoKCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdsaWdodCc6XG5cdFx0Y2FzZSAnbGlnaHRfcG9pbnQnOlxuXHRcdFx0bWVzaCA9IHBvaW50TGlnaHRNZXNoKCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdsaWdodF9zdW4nOlxuXHRcdFx0bWVzaCA9IHN1bkxpZ2h0TWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnbGlnaHRfc3BvdCc6XG5cdFx0XHRtZXNoID0gc3BvdExpZ2h0TWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnbGlnaHRfYXJlYSc6XG5cdFx0XHRtZXNoID0gYXJlYUxpZ2h0TWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnY2FtZXJhJzpcblx0XHRjYXNlICdjYW1lcmFfcGVyc3BlY3RpdmUnOlxuXHRcdFx0bWVzaCA9IHBlcnNwZWN0aXZlQ2FtZXJhTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnY2FtZXJhX29ydGhvJzpcblx0XHRcdG1lc2ggPSBvcnRob0NhbWVyYU1lc2goKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2VtcHR5X2F4ZXMnOlxuXHRcdFx0bWVzaCA9IGVtcHR5QXhlc01lc2goKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2VtcHR5X2Fycm93cyc6XG5cdFx0XHRtZXNoID0gZW1wdHlBcnJvd3NNZXNoKCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdlbXB0eV9jdWJlJzpcblx0XHRcdG1lc2ggPSBlbXB0eUN1YmVNZXNoKCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdlbXB0eV9zcGhlcmUnOlxuXHRcdFx0bWVzaCA9IGVtcHR5U3BoZXJlTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnZW1wdHlfY2lyY2xlJzpcblx0XHRcdG1lc2ggPSBlbXB0eUNpcmNsZU1lc2goKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2VtcHR5X2ltYWdlJzpcblx0XHRcdG1lc2ggPSBlbXB0eUltYWdlTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAndGV4dCc6XG5cdFx0Y2FzZSAnaW1hZ2UnOlxuXHRcdFx0bWVzaCA9IG1lZGlhUGxhbmVNZXNoKCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICd0ZXh0XzNkJzpcblx0XHRcdG1lc2ggPSB0ZXh0M2RNZXNoKHBhcmFtcz8udGV4dCwgcGFyYW1zPy5kZXB0aCwgcGFyYW1zPy5iZXZlbCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdjb2luJzpcblx0XHRcdG1lc2ggPSBjb2luTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnYm9uZSc6XG5cdFx0Y2FzZSAnYXJtYXR1cmUnOlxuXHRcdFx0bWVzaCA9IGJvbmVNZXNoKCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdtZXRhYmFsbCc6XG5cdFx0XHRtZXNoID0gbWV0YWJhbGxNZXNoKHBhcmFtcz8uc2hhcGUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnbGF0dGljZSc6XG5cdFx0XHRtZXNoID0gbGF0dGljZU1lc2goKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2ZvcmNlZmllbGQnOlxuXHRcdFx0bWVzaCA9IGZvcmNlRmllbGRNZXNoKCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdzcGVha2VyJzpcblx0XHRcdG1lc2ggPSBzcGVha2VyTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnYXNzZXRfc3V6YW5uZSc6XG5cdFx0XHRtZXNoID0gc3V6YW5uZU1lc2goKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2Fzc2V0X3RyZWUnOlxuXHRcdFx0bWVzaCA9IHRyZWVNZXNoKCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdhc3NldF9jYXInOlxuXHRcdFx0bWVzaCA9IGNhck1lc2goKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2Fzc2V0X2NoYXJhY3Rlcic6XG5cdFx0XHRtZXNoID0gY2hhcmFjdGVyTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnYXNzZXRfY2hhaXInOlxuXHRcdFx0bWVzaCA9IGNoYWlyTWVzaCgpO1xuXHRcdFx0YnJlYWs7XG5cdH1cblx0aWYgKCFwYXJhbXMgJiYgbWVzaCkgY2FjaGUuc2V0KHR5cGUsIG1lc2gpO1xuXHRyZXR1cm4gbWVzaDtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBFZGl0aW5nICYgTW9kaWZpZXIgT3BlcmF0aW9uc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBmdW5jdGlvbiBzdWJkaXZpZGUobWVzaDogTWVzaCwgc21vb3RoID0gdHJ1ZSk6IE1lc2gge1xuXHRjb25zdCB2ZXJ0aWNlcyA9IG1lc2gudmVydGljZXMubWFwKCh2KSA9PiBbdlswXSwgdlsxXSwgdlsyXV0gYXMgVmVjMyk7XG5cdGNvbnN0IGZhY2VQb2ludHM6IFZlYzNbXSA9IG1lc2guZmFjZXMubWFwKChmYWNlKSA9PiBmYWNlQ2VudGVyKG1lc2gsIGZhY2UpKTtcblxuXHRjb25zdCBlZGdlUG9pbnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Y29uc3QgZWRnZUZhY2VzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcltdPigpO1xuXHRjb25zdCBmYWNlRWRnZXM6IFtudW1iZXIsIG51bWJlcl1bXVtdID0gW107XG5cblx0bWVzaC5mYWNlcy5mb3JFYWNoKChmYWNlLCBmYWNlSW5kZXgpID0+IHtcblx0XHRjb25zdCBlZGdlczogW251bWJlciwgbnVtYmVyXVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmYWNlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBhID0gZmFjZVtpXTtcblx0XHRcdGNvbnN0IGIgPSBmYWNlWyhpICsgMSkgJSBmYWNlLmxlbmd0aF07XG5cdFx0XHRjb25zdCBrZXkgPSBlZGdlS2V5KGEsIGIpO1xuXHRcdFx0ZWRnZXMucHVzaChbYSwgYl0pO1xuXHRcdFx0aWYgKCFlZGdlRmFjZXMuaGFzKGtleSkpIGVkZ2VGYWNlcy5zZXQoa2V5LCBbXSk7XG5cdFx0XHRlZGdlRmFjZXMuZ2V0KGtleSk/LnB1c2goZmFjZUluZGV4KTtcblx0XHR9XG5cdFx0ZmFjZUVkZ2VzLnB1c2goZWRnZXMpO1xuXHR9KTtcblxuXHRmb3IgKGNvbnN0IFtrZXksIGZhY2VzXSBvZiBlZGdlRmFjZXMpIHtcblx0XHRjb25zdCBbYSwgYl0gPSBrZXkuc3BsaXQoJzonKS5tYXAoTnVtYmVyKTtcblx0XHRsZXQgbWlkcG9pbnQ6IFZlYzM7XG5cdFx0aWYgKHNtb290aCAmJiBmYWNlcy5sZW5ndGggPT09IDIpIHtcblx0XHRcdGNvbnN0IGZwMCA9IGZhY2VQb2ludHNbZmFjZXNbMF1dO1xuXHRcdFx0Y29uc3QgZnAxID0gZmFjZVBvaW50c1tmYWNlc1sxXV07XG5cdFx0XHRtaWRwb2ludCA9IFtcblx0XHRcdFx0KG1lc2gudmVydGljZXNbYV1bMF0gKyBtZXNoLnZlcnRpY2VzW2JdWzBdICsgZnAwWzBdICsgZnAxWzBdKSAvIDQsXG5cdFx0XHRcdChtZXNoLnZlcnRpY2VzW2FdWzFdICsgbWVzaC52ZXJ0aWNlc1tiXVsxXSArIGZwMFsxXSArIGZwMVsxXSkgLyA0LFxuXHRcdFx0XHQobWVzaC52ZXJ0aWNlc1thXVsyXSArIG1lc2gudmVydGljZXNbYl1bMl0gKyBmcDBbMl0gKyBmcDFbMl0pIC8gNCxcblx0XHRcdF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1pZHBvaW50ID0gW1xuXHRcdFx0XHQobWVzaC52ZXJ0aWNlc1thXVswXSArIG1lc2gudmVydGljZXNbYl1bMF0pIC8gMixcblx0XHRcdFx0KG1lc2gudmVydGljZXNbYV1bMV0gKyBtZXNoLnZlcnRpY2VzW2JdWzFdKSAvIDIsXG5cdFx0XHRcdChtZXNoLnZlcnRpY2VzW2FdWzJdICsgbWVzaC52ZXJ0aWNlc1tiXVsyXSkgLyAyLFxuXHRcdFx0XTtcblx0XHR9XG5cdFx0ZWRnZVBvaW50cy5zZXQoa2V5LCB2ZXJ0aWNlcy5sZW5ndGgpO1xuXHRcdHZlcnRpY2VzLnB1c2gobWlkcG9pbnQpO1xuXHR9XG5cblx0aWYgKHNtb290aCkge1xuXHRcdGNvbnN0IG5laWdoYm91ckZhY2VzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXHRcdGNvbnN0IG5laWdoYm91ckVkZ2VzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZmFjZSwgZmFjZUluZGV4KSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGZhY2UpIHtcblx0XHRcdFx0aWYgKCFuZWlnaGJvdXJGYWNlcy5oYXMoaW5kZXgpKSBuZWlnaGJvdXJGYWNlcy5zZXQoaW5kZXgsIFtdKTtcblx0XHRcdFx0bmVpZ2hib3VyRmFjZXMuZ2V0KGluZGV4KT8ucHVzaChmYWNlSW5kZXgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGZvciAoY29uc3QgW2tleSwgcG9pbnRJbmRleF0gb2YgZWRnZVBvaW50cykge1xuXHRcdFx0Y29uc3QgW2EsIGJdID0ga2V5LnNwbGl0KCc6JykubWFwKE51bWJlcik7XG5cdFx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIFthLCBiXSkge1xuXHRcdFx0XHRpZiAoIW5laWdoYm91ckVkZ2VzLmhhcyhpbmRleCkpIG5laWdoYm91ckVkZ2VzLnNldChpbmRleCwgW10pO1xuXHRcdFx0XHRuZWlnaGJvdXJFZGdlcy5nZXQoaW5kZXgpPy5wdXNoKHBvaW50SW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRtZXNoLnZlcnRpY2VzLmZvckVhY2goKHZlcnRleCwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGZhY2VzID0gbmVpZ2hib3VyRmFjZXMuZ2V0KGluZGV4KSB8fCBbXTtcblx0XHRcdGNvbnN0IGVkZ2VzID0gbmVpZ2hib3VyRWRnZXMuZ2V0KGluZGV4KSB8fCBbXTtcblx0XHRcdGlmICghZmFjZXMubGVuZ3RoIHx8ICFlZGdlcy5sZW5ndGgpIHJldHVybjtcblx0XHRcdGNvbnN0IG4gPSBmYWNlcy5sZW5ndGg7XG5cdFx0XHRsZXQgZnggPSAwLCBmeSA9IDAsIGZ6ID0gMDtcblx0XHRcdGZvciAoY29uc3QgZmFjZUluZGV4IG9mIGZhY2VzKSB7XG5cdFx0XHRcdGZ4ICs9IGZhY2VQb2ludHNbZmFjZUluZGV4XVswXTtcblx0XHRcdFx0ZnkgKz0gZmFjZVBvaW50c1tmYWNlSW5kZXhdWzFdO1xuXHRcdFx0XHRmeiArPSBmYWNlUG9pbnRzW2ZhY2VJbmRleF1bMl07XG5cdFx0XHR9XG5cdFx0XHRmeCAvPSBuOyBmeSAvPSBuOyBmeiAvPSBuO1xuXHRcdFx0bGV0IHJ4ID0gMCwgcnkgPSAwLCByeiA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IHBvaW50SW5kZXggb2YgZWRnZXMpIHtcblx0XHRcdFx0cnggKz0gKHZlcnRpY2VzW3BvaW50SW5kZXhdWzBdICsgdmVydGV4WzBdKSAvIDI7XG5cdFx0XHRcdHJ5ICs9ICh2ZXJ0aWNlc1twb2ludEluZGV4XVsxXSArIHZlcnRleFsxXSkgLyAyO1xuXHRcdFx0XHRyeiArPSAodmVydGljZXNbcG9pbnRJbmRleF1bMl0gKyB2ZXJ0ZXhbMl0pIC8gMjtcblx0XHRcdH1cblx0XHRcdHJ4IC89IGVkZ2VzLmxlbmd0aDsgcnkgLz0gZWRnZXMubGVuZ3RoOyByeiAvPSBlZGdlcy5sZW5ndGg7XG5cdFx0XHR2ZXJ0aWNlc1tpbmRleF0gPSBbKGZ4ICsgMiAqIHJ4ICsgKG4gLSAzKSAqIHZlcnRleFswXSkgLyBuLCAoZnkgKyAyICogcnkgKyAobiAtIDMpICogdmVydGV4WzFdKSAvIG4sIChmeiArIDIgKiByeiArIChuIC0gMykgKiB2ZXJ0ZXhbMl0pIC8gbl07XG5cdFx0fSk7XG5cdH1cblxuXHRjb25zdCBmYWNlUG9pbnRTdGFydCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0Zm9yIChjb25zdCBmcCBvZiBmYWNlUG9pbnRzKSB2ZXJ0aWNlcy5wdXNoKGZwKTtcblxuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGNvbnN0IGZhY2VTbG90czogbnVtYmVyW10gPSBbXTtcblx0bWVzaC5mYWNlcy5mb3JFYWNoKChmYWNlLCBmYWNlSW5kZXgpID0+IHtcblx0XHRjb25zdCBmcCA9IGZhY2VQb2ludFN0YXJ0ICsgZmFjZUluZGV4O1xuXHRcdGNvbnN0IGVkZ2VzID0gZmFjZUVkZ2VzW2ZhY2VJbmRleF07XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmYWNlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwcmV2ID0gZWRnZXNbKGkgLSAxICsgZWRnZXMubGVuZ3RoKSAlIGVkZ2VzLmxlbmd0aF07XG5cdFx0XHRjb25zdCBuZXh0ID0gZWRnZXNbaV07XG5cdFx0XHRmYWNlcy5wdXNoKFtmYWNlW2ldLCBlZGdlUG9pbnRzLmdldChlZGdlS2V5KG5leHRbMF0sIG5leHRbMV0pKSBhcyBudW1iZXIsIGZwLCBlZGdlUG9pbnRzLmdldChlZGdlS2V5KHByZXZbMF0sIHByZXZbMV0pKSBhcyBudW1iZXJdKTtcblx0XHRcdGZhY2VTbG90cy5wdXNoKG1lc2guZmFjZVNsb3Q/LltmYWNlSW5kZXhdID8/IDApO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIGZpbmFsaXplTWVzaCh7IHZlcnRpY2VzLCBmYWNlcywgZWRnZXM6IFtdLCByYWRpdXM6IDAsIHNsb3RzOiBtZXNoLnNsb3RzID8/IFtdLCBmYWNlU2xvdDogZmFjZVNsb3RzIH0sIG1lc2guc21vb3RoID8/IHRydWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlRmFjZXMobWVzaDogTWVzaCwgZmFjZUluZGljZXM6IG51bWJlcltdKTogTWVzaCB7XG5cdGNvbnN0IHJlbW92ZSA9IG5ldyBTZXQoZmFjZUluZGljZXMpO1xuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGNvbnN0IGZhY2VTbG90OiBudW1iZXJbXSA9IFtdO1xuXHRtZXNoLmZhY2VzLmZvckVhY2goKGZhY2UsIGluZGV4KSA9PiB7XG5cdFx0aWYgKHJlbW92ZS5oYXMoaW5kZXgpKSByZXR1cm47XG5cdFx0ZmFjZXMucHVzaChbLi4uZmFjZV0pO1xuXHRcdGZhY2VTbG90LnB1c2gobWVzaC5mYWNlU2xvdD8uW2luZGV4XSA/PyAwKTtcblx0fSk7XG5cdHJldHVybiBjb21wYWN0TWVzaChtZXNoLnZlcnRpY2VzLCBmYWNlcywgbWVzaC5zbW9vdGgsIGZhY2VTbG90LCBtZXNoLnNsb3RzID8/IFtdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZsaXBOb3JtYWxzKG1lc2g6IE1lc2gpOiBNZXNoIHtcblx0Y29uc3QgZmFjZXMgPSBtZXNoLmZhY2VzLm1hcCgoZikgPT4gWy4uLmZdLnJldmVyc2UoKSk7XG5cdHJldHVybiBmaW5hbGl6ZU1lc2goXG5cdFx0eyB2ZXJ0aWNlczogbWVzaC52ZXJ0aWNlcy5tYXAoKHYpID0+IFt2WzBdLCB2WzFdLCB2WzJdXSBhcyBWZWMzKSwgZmFjZXMsIGVkZ2VzOiBbXSwgcmFkaXVzOiAwLCBzbG90czogbWVzaC5zbG90cyA/PyBbXSwgZmFjZVNsb3Q6IFsuLi4obWVzaC5mYWNlU2xvdCA/PyBbXSldIH0sXG5cdFx0bWVzaC5zbW9vdGgsXG5cdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUJ5RGlzdGFuY2UobWVzaDogTWVzaCwgdGhyZXNob2xkID0gMC4wMDAxKTogTWVzaCB7XG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBbXTtcblx0Y29uc3QgcmVtYXA6IG51bWJlcltdID0gW107XG5cdGNvbnN0IGxvb2t1cCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdGNvbnN0IHN0ZXAgPSBNYXRoLm1heCgxZS02LCB0aHJlc2hvbGQpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IG1lc2gudmVydGljZXMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCB2ID0gbWVzaC52ZXJ0aWNlc1tpXTtcblx0XHRjb25zdCBrZXkgPSBgJHtNYXRoLnJvdW5kKHZbMF0gLyBzdGVwKX06JHtNYXRoLnJvdW5kKHZbMV0gLyBzdGVwKX06JHtNYXRoLnJvdW5kKHZbMl0gLyBzdGVwKX1gO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gbG9va3VwLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZW1hcFtpXSA9IGV4aXN0aW5nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0XHRcdHZlcnRpY2VzLnB1c2goW3ZbMF0sIHZbMV0sIHZbMl1dIGFzIFZlYzMpO1xuXHRcdFx0bG9va3VwLnNldChrZXksIGluZGV4KTtcblx0XHRcdHJlbWFwW2ldID0gaW5kZXg7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXTtcblx0Y29uc3QgZmFjZVNsb3Q6IG51bWJlcltdID0gW107XG5cdG1lc2guZmFjZXMuZm9yRWFjaCgoZmFjZSwgZmFjZUluZGV4KSA9PiB7XG5cdFx0Y29uc3QgbWFwcGVkOiBudW1iZXJbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaW5kZXggb2YgZmFjZSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSByZW1hcFtpbmRleF07XG5cdFx0XHRpZiAobWFwcGVkW21hcHBlZC5sZW5ndGggLSAxXSAhPT0gdmFsdWUgJiYgbWFwcGVkWzBdICE9PSB2YWx1ZSkgbWFwcGVkLnB1c2godmFsdWUpO1xuXHRcdH1cblx0XHRpZiAobWFwcGVkLmxlbmd0aCA8IDMpIHJldHVybjtcblx0XHRmYWNlcy5wdXNoKG1hcHBlZCk7XG5cdFx0ZmFjZVNsb3QucHVzaChtZXNoLmZhY2VTbG90Py5bZmFjZUluZGV4XSA/PyAwKTtcblx0fSk7XG5cdHJldHVybiBjb21wYWN0TWVzaCh2ZXJ0aWNlcywgZmFjZXMsIG1lc2guc21vb3RoLCBmYWNlU2xvdCwgbWVzaC5zbG90cyA/PyBbXSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RNZXNoKHZlcnRpY2VzOiBWZWMzW10sIGZhY2VzOiBGYWNlW10sIHNtb290aD86IGJvb2xlYW4sIGZhY2VTbG90OiBudW1iZXJbXSA9IFtdLCBzbG90czogTWF0ZXJpYWxTbG90W10gPSBbXSk6IE1lc2gge1xuXHRjb25zdCB1c2VkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcblx0Y29uc3QgbmV4dFZlcnRpY2VzOiBWZWMzW10gPSBbXTtcblx0Y29uc3QgcmVtYXAgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdGlmICh1c2VkLmhhcyhpbmRleCkpIHJldHVybiB1c2VkLmdldChpbmRleCkgYXMgbnVtYmVyO1xuXHRcdGNvbnN0IHRhcmdldCA9IG5leHRWZXJ0aWNlcy5sZW5ndGg7XG5cdFx0bmV4dFZlcnRpY2VzLnB1c2godmVydGljZXNbaW5kZXhdKTtcblx0XHR1c2VkLnNldChpbmRleCwgdGFyZ2V0KTtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9O1xuXHRjb25zdCBuZXh0RmFjZXMgPSBmYWNlcy5tYXAoKGZhY2UpID0+IGZhY2UubWFwKHJlbWFwKSk7XG5cdHJldHVybiBmaW5hbGl6ZU1lc2goeyB2ZXJ0aWNlczogbmV4dFZlcnRpY2VzLCBmYWNlczogbmV4dEZhY2VzLCBlZGdlczogW10sIHJhZGl1czogMCwgc2xvdHMsIGZhY2VTbG90IH0sIHNtb290aCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRydWRlRmFjZXMobWVzaDogTWVzaCwgZmFjZUluZGljZXM6IG51bWJlcltdLCBkaXN0YW5jZSA9IDAuMzUpOiBNZXNoIHtcblx0aWYgKCFmYWNlSW5kaWNlcy5sZW5ndGgpIHJldHVybiBjbG9uZU1lc2gobWVzaCk7XG5cdGNvbnN0IHNlbGVjdGVkID0gbmV3IFNldChmYWNlSW5kaWNlcyk7XG5cdGNvbnN0IHJlc3VsdCA9IGNsb25lTWVzaChtZXNoKTtcblx0bGV0IG54ID0gMCwgbnkgPSAwLCBueiA9IDA7XG5cdGZvciAoY29uc3QgaW5kZXggb2YgZmFjZUluZGljZXMpIHtcblx0XHRjb25zdCBmbiA9IGZhY2VOb3JtYWwobWVzaCwgbWVzaC5mYWNlc1tpbmRleF0pO1xuXHRcdG54ICs9IGZuWzBdO1xuXHRcdG55ICs9IGZuWzFdO1xuXHRcdG56ICs9IGZuWzJdO1xuXHR9XG5cdGNvbnN0IGxlbiA9IE1hdGguaHlwb3QobngsIG55LCBueikgfHwgMTtcblx0bnggLz0gbGVuOyBueSAvPSBsZW47IG56IC89IGxlbjtcblxuXHRjb25zdCB2ZXJ0ZXhDb3B5ID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcblx0Y29uc3QgY29weVZlcnRleCA9IChpbmRleDogbnVtYmVyKTogbnVtYmVyID0+IHtcblx0XHRpZiAodmVydGV4Q29weS5oYXMoaW5kZXgpKSByZXR1cm4gdmVydGV4Q29weS5nZXQoaW5kZXgpIGFzIG51bWJlcjtcblx0XHRjb25zdCB2ID0gcmVzdWx0LnZlcnRpY2VzW2luZGV4XTtcblx0XHRjb25zdCB0YXJnZXQgPSByZXN1bHQudmVydGljZXMubGVuZ3RoO1xuXHRcdHJlc3VsdC52ZXJ0aWNlcy5wdXNoKFt2WzBdICsgbnggKiBkaXN0YW5jZSwgdlsxXSArIG55ICogZGlzdGFuY2UsIHZbMl0gKyBueiAqIGRpc3RhbmNlXSk7XG5cdFx0dmVydGV4Q29weS5zZXQoaW5kZXgsIHRhcmdldCk7XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fTtcblxuXHRjb25zdCBib3VuZGFyeUVkZ2VzID0gbmV3IE1hcDxzdHJpbmcsIFtudW1iZXIsIG51bWJlcl0+KCk7XG5cdGZvciAoY29uc3QgZmFjZUluZGV4IG9mIGZhY2VJbmRpY2VzKSB7XG5cdFx0Y29uc3QgZmFjZSA9IG1lc2guZmFjZXNbZmFjZUluZGV4XTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZhY2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGEgPSBmYWNlW2ldO1xuXHRcdFx0Y29uc3QgYiA9IGZhY2VbKGkgKyAxKSAlIGZhY2UubGVuZ3RoXTtcblx0XHRcdGNvbnN0IGtleSA9IGVkZ2VLZXkoYSwgYik7XG5cdFx0XHRsZXQgc2hhcmVkID0gMDtcblx0XHRcdGZvciAoY29uc3Qgb3RoZXIgb2YgZmFjZUluZGljZXMpIHtcblx0XHRcdFx0Y29uc3Qgb3RoZXJGYWNlID0gbWVzaC5mYWNlc1tvdGhlcl07XG5cdFx0XHRcdGZvciAobGV0IGogPSAwOyBqIDwgb3RoZXJGYWNlLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRcdFx0aWYgKGVkZ2VLZXkob3RoZXJGYWNlW2pdLCBvdGhlckZhY2VbKGogKyAxKSAlIG90aGVyRmFjZS5sZW5ndGhdKSA9PT0ga2V5KSBzaGFyZWQrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHNoYXJlZCA8IDIpIGJvdW5kYXJ5RWRnZXMuc2V0KGtleSwgW2EsIGJdKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBuZXh0RmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRjb25zdCBuZXh0RmFjZVNsb3Q6IG51bWJlcltdID0gW107XG5cdG1lc2guZmFjZXMuZm9yRWFjaCgoZmFjZSwgaW5kZXgpID0+IHtcblx0XHRpZiAoIXNlbGVjdGVkLmhhcyhpbmRleCkpIHtcblx0XHRcdG5leHRGYWNlcy5wdXNoKFsuLi5mYWNlXSk7XG5cdFx0XHRuZXh0RmFjZVNsb3QucHVzaChtZXNoLmZhY2VTbG90Py5baW5kZXhdID8/IDApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRuZXh0RmFjZXMucHVzaChmYWNlLm1hcCgodmVydGV4SW5kZXgpID0+IGNvcHlWZXJ0ZXgodmVydGV4SW5kZXgpKSk7XG5cdFx0bmV4dEZhY2VTbG90LnB1c2gobWVzaC5mYWNlU2xvdD8uW2luZGV4XSA/PyAwKTtcblx0fSk7XG5cblx0Y29uc3Qgd2FsbFNsb3QgPSBtZXNoLmZhY2VTbG90Py5bZmFjZUluZGljZXNbMF1dID8/IDA7XG5cdGZvciAoY29uc3QgWywgW2EsIGJdXSBvZiBib3VuZGFyeUVkZ2VzKSB7XG5cdFx0bmV4dEZhY2VzLnB1c2goW2EsIGIsIGNvcHlWZXJ0ZXgoYiksIGNvcHlWZXJ0ZXgoYSldKTtcblx0XHRuZXh0RmFjZVNsb3QucHVzaCh3YWxsU2xvdCk7XG5cdH1cblxuXHRyZXR1cm4gZmluYWxpemVNZXNoKFxuXHRcdHsgdmVydGljZXM6IHJlc3VsdC52ZXJ0aWNlcywgZmFjZXM6IG5leHRGYWNlcywgZWRnZXM6IFtdLCByYWRpdXM6IDAsIHNsb3RzOiBtZXNoLnNsb3RzID8/IFtdLCBmYWNlU2xvdDogbmV4dEZhY2VTbG90IH0sXG5cdFx0bWVzaC5zbW9vdGgsXG5cdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnNldEZhY2VzKG1lc2g6IE1lc2gsIGZhY2VJbmRpY2VzOiBudW1iZXJbXSwgYW1vdW50ID0gMC4xOCk6IE1lc2gge1xuXHRpZiAoIWZhY2VJbmRpY2VzLmxlbmd0aCkgcmV0dXJuIGNsb25lTWVzaChtZXNoKTtcblx0Y29uc3QgdmVydGljZXMgPSBtZXNoLnZlcnRpY2VzLm1hcCgodikgPT4gW3ZbMF0sIHZbMV0sIHZbMl1dIGFzIFZlYzMpO1xuXHRjb25zdCBuZXh0RmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGZhY2Ugb2YgbWVzaC5mYWNlcykgbmV4dEZhY2VzLnB1c2goWy4uLmZhY2VdKTtcblxuXHRjb25zdCBpbmRleEJ5UG9zaXRpb24gPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRjb25zdCBhZGRWZXJ0ZXggPSAodjogVmVjMyk6IG51bWJlciA9PiB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7dlswXS50b0ZpeGVkKDUpfToke3ZbMV0udG9GaXhlZCg1KX06JHt2WzJdLnRvRml4ZWQoNSl9YDtcblx0XHRjb25zdCBleGlzdGluZyA9IGluZGV4QnlQb3NpdGlvbi5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcgIT09IHVuZGVmaW5lZCkgcmV0dXJuIGV4aXN0aW5nO1xuXHRcdGNvbnN0IHRhcmdldCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0XHR2ZXJ0aWNlcy5wdXNoKFt2WzBdLCB2WzFdLCB2WzJdXSBhcyBWZWMzKTtcblx0XHRpbmRleEJ5UG9zaXRpb24uc2V0KGtleSwgdGFyZ2V0KTtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9O1xuXG5cdGNvbnN0IGV4dHJhczogRmFjZVtdID0gW107XG5cdGZvciAoY29uc3QgZmFjZUluZGV4IG9mIGZhY2VJbmRpY2VzKSB7XG5cdFx0Y29uc3QgZmFjZSA9IG1lc2guZmFjZXNbZmFjZUluZGV4XTtcblx0XHRjb25zdCBjZW50ZXIgPSBmYWNlQ2VudGVyKG1lc2gsIGZhY2UpO1xuXHRcdGNvbnN0IGlubmVyID0gZmFjZS5tYXAoKHZlcnRleEluZGV4KSA9PiB7XG5cdFx0XHRjb25zdCB2ID0gbWVzaC52ZXJ0aWNlc1t2ZXJ0ZXhJbmRleF07XG5cdFx0XHRyZXR1cm4gYWRkVmVydGV4KFtcblx0XHRcdFx0dlswXSArIChjZW50ZXJbMF0gLSB2WzBdKSAqIGFtb3VudCxcblx0XHRcdFx0dlsxXSArIChjZW50ZXJbMV0gLSB2WzFdKSAqIGFtb3VudCxcblx0XHRcdFx0dlsyXSArIChjZW50ZXJbMl0gLSB2WzJdKSAqIGFtb3VudCxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdG5leHRGYWNlc1tmYWNlSW5kZXhdID0gaW5uZXI7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmYWNlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBhID0gZmFjZVtpXTtcblx0XHRcdGNvbnN0IGIgPSBmYWNlWyhpICsgMSkgJSBmYWNlLmxlbmd0aF07XG5cdFx0XHRleHRyYXMucHVzaChbYSwgYiwgaW5uZXJbKGkgKyAxKSAlIGlubmVyLmxlbmd0aF0sIGlubmVyW2ldXSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgbmV4dEZhY2VTbG90OiBudW1iZXJbXSA9IFtdO1xuXHRtZXNoLmZhY2VzLmZvckVhY2goKF8sIGluZGV4KSA9PiB7XG5cdFx0bmV4dEZhY2VTbG90LnB1c2gobWVzaC5mYWNlU2xvdD8uW2luZGV4XSA/PyAwKTtcblx0fSk7XG5cdGNvbnN0IHJpbVNsb3QgPSBtZXNoLmZhY2VTbG90Py5bZmFjZUluZGljZXNbMF1dID8/IDA7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZXh0cmFzLmxlbmd0aDsgaSsrKSBuZXh0RmFjZVNsb3QucHVzaChyaW1TbG90KTtcblxuXHRyZXR1cm4gZmluYWxpemVNZXNoKFxuXHRcdHsgdmVydGljZXMsIGZhY2VzOiBbLi4ubmV4dEZhY2VzLCAuLi5leHRyYXNdLCBlZGdlczogW10sIHJhZGl1czogMCwgc2xvdHM6IG1lc2guc2xvdHMgPz8gW10sIGZhY2VTbG90OiBuZXh0RmFjZVNsb3QgfSxcblx0XHRtZXNoLnNtb290aCxcblx0KTtcbn1cblxuLyoqXG4gKiBBcnJheSBNb2RpZmllcjogY3JlYXRlcyBgY291bnRgIGNvcGllcyBvZiB0aGUgbWVzaCBvZmZzZXQgYWxvbmcgW294LCBveSwgb3pdLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXJyYXlNZXNoKG1lc2g6IE1lc2gsIGNvdW50ID0gMywgb2Zmc2V0OiBWZWMzID0gWzEuMjUsIDAsIDBdKTogTWVzaCB7XG5cdGNvbnN0IHNhZmVDb3VudCA9IE1hdGgubWluKDEyLCBNYXRoLm1heCgyLCBNYXRoLmZsb29yKGNvdW50KSkpO1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gW107XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXTtcblx0Y29uc3QgZmFjZVNsb3Q6IG51bWJlcltdID0gW107XG5cdGNvbnN0IHZDb3VudCA9IG1lc2gudmVydGljZXMubGVuZ3RoO1xuXG5cdGZvciAobGV0IGMgPSAwOyBjIDwgc2FmZUNvdW50OyBjKyspIHtcblx0XHRjb25zdCBiYXNlID0gYyAqIHZDb3VudDtcblx0XHRjb25zdCBkeCA9IG9mZnNldFswXSAqIGM7XG5cdFx0Y29uc3QgZHkgPSBvZmZzZXRbMV0gKiBjO1xuXHRcdGNvbnN0IGR6ID0gb2Zmc2V0WzJdICogYztcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCB2ID0gbWVzaC52ZXJ0aWNlc1tpXTtcblx0XHRcdHZlcnRpY2VzLnB1c2goW3ZbMF0gKyBkeCwgdlsxXSArIGR5LCB2WzJdICsgZHpdKTtcblx0XHR9XG5cdFx0bWVzaC5mYWNlcy5mb3JFYWNoKChmYWNlLCBmSWR4KSA9PiB7XG5cdFx0XHRmYWNlcy5wdXNoKGZhY2UubWFwKChpZHgpID0+IGlkeCArIGJhc2UpKTtcblx0XHRcdGZhY2VTbG90LnB1c2gobWVzaC5mYWNlU2xvdD8uW2ZJZHhdID8/IDApO1xuXHRcdH0pO1xuXHR9XG5cdHJldHVybiBmaW5hbGl6ZU1lc2goeyB2ZXJ0aWNlcywgZmFjZXMsIHNsb3RzOiBtZXNoLnNsb3RzLCBmYWNlU2xvdCB9LCBtZXNoLnNtb290aCk7XG59XG5cbi8qKlxuICogU29saWRpZnkgTW9kaWZpZXI6IGFkZHMgc2hlbGwgdGhpY2tuZXNzIGFsb25nIHZlcnRleCBub3JtYWxzIGFuZCBicmlkZ2VzIG9wZW4gYm91bmRhcnkgZWRnZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzb2xpZGlmeU1lc2gobWVzaDogTWVzaCwgdGhpY2tuZXNzID0gMC4xMik6IE1lc2gge1xuXHRjb25zdCBub3JtYWxzID0gY29tcHV0ZVZlcnRleE5vcm1hbHMobWVzaCk7XG5cdGNvbnN0IHZDb3VudCA9IG1lc2gudmVydGljZXMubGVuZ3RoO1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gbWVzaC52ZXJ0aWNlcy5tYXAoKHYpID0+IFt2WzBdLCB2WzFdLCB2WzJdXSBhcyBWZWMzKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2Q291bnQ7IGkrKykge1xuXHRcdGNvbnN0IHYgPSBtZXNoLnZlcnRpY2VzW2ldO1xuXHRcdGNvbnN0IG4gPSBub3JtYWxzW2ldO1xuXHRcdHZlcnRpY2VzLnB1c2goW3ZbMF0gLSBuWzBdICogdGhpY2tuZXNzLCB2WzFdIC0gblsxXSAqIHRoaWNrbmVzcywgdlsyXSAtIG5bMl0gKiB0aGlja25lc3NdKTtcblx0fVxuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGNvbnN0IGZhY2VTbG90OiBudW1iZXJbXSA9IFtdO1xuXHRtZXNoLmZhY2VzLmZvckVhY2goKGZhY2UsIGlkeCkgPT4ge1xuXHRcdGNvbnN0IHNsb3QgPSBtZXNoLmZhY2VTbG90Py5baWR4XSA/PyAwO1xuXHRcdGZhY2VzLnB1c2goWy4uLmZhY2VdKTtcblx0XHRmYWNlU2xvdC5wdXNoKHNsb3QpO1xuXHRcdGZhY2VzLnB1c2goWy4uLmZhY2VdLnJldmVyc2UoKS5tYXAoKHZJZHgpID0+IHZJZHggKyB2Q291bnQpKTtcblx0XHRmYWNlU2xvdC5wdXNoKHNsb3QpO1xuXHR9KTtcblx0Ly8gQnJpZGdlIGJvdW5kYXJ5IGVkZ2VzXG5cdGNvbnN0IGVkZ2VDb3VudCA9IG5ldyBNYXA8c3RyaW5nLCB7IGE6IG51bWJlcjsgYjogbnVtYmVyOyBjb3VudDogbnVtYmVyOyBzbG90OiBudW1iZXIgfT4oKTtcblx0bWVzaC5mYWNlcy5mb3JFYWNoKChmYWNlLCBpZHgpID0+IHtcblx0XHRjb25zdCBzbG90ID0gbWVzaC5mYWNlU2xvdD8uW2lkeF0gPz8gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZhY2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGEgPSBmYWNlW2ldO1xuXHRcdFx0Y29uc3QgYiA9IGZhY2VbKGkgKyAxKSAlIGZhY2UubGVuZ3RoXTtcblx0XHRcdGNvbnN0IGsgPSBlZGdlS2V5KGEsIGIpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBlZGdlQ291bnQuZ2V0KGspO1xuXHRcdFx0aWYgKGVudHJ5KSBlbnRyeS5jb3VudCsrO1xuXHRcdFx0ZWxzZSBlZGdlQ291bnQuc2V0KGssIHsgYSwgYiwgY291bnQ6IDEsIHNsb3QgfSk7XG5cdFx0fVxuXHR9KTtcblx0Zm9yIChjb25zdCBlbnRyeSBvZiBlZGdlQ291bnQudmFsdWVzKCkpIHtcblx0XHRpZiAoZW50cnkuY291bnQgPT09IDEpIHtcblx0XHRcdGZhY2VzLnB1c2goW2VudHJ5LmEsIGVudHJ5LmIsIGVudHJ5LmIgKyB2Q291bnQsIGVudHJ5LmEgKyB2Q291bnRdKTtcblx0XHRcdGZhY2VTbG90LnB1c2goZW50cnkuc2xvdCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmaW5hbGl6ZU1lc2goeyB2ZXJ0aWNlcywgZmFjZXMsIHNsb3RzOiBtZXNoLnNsb3RzLCBmYWNlU2xvdCB9LCBtZXNoLnNtb290aCk7XG59XG5cbi8qKlxuICogTGFwbGFjaWFuIFNtb290aCBNb2RpZmllcjogcmVsYXhlcyB2ZXJ0ZXggcG9zaXRpb25zIHRvd2FyZCB0aGVpciBlZGdlIG5laWdoYm91cnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzbW9vdGhNZXNoVmVydGljZXMobWVzaDogTWVzaCwgaXRlcmF0aW9ucyA9IDIsIGZhY3RvciA9IDAuNSk6IE1lc2gge1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gbWVzaC52ZXJ0aWNlcy5tYXAoKHYpID0+IFt2WzBdLCB2WzFdLCB2WzJdXSBhcyBWZWMzKTtcblx0Y29uc3QgYWRqID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXHRmb3IgKGNvbnN0IFthLCBiXSBvZiBtZXNoLmVkZ2VzKSB7XG5cdFx0aWYgKCFhZGouaGFzKGEpKSBhZGouc2V0KGEsIFtdKTtcblx0XHRpZiAoIWFkai5oYXMoYikpIGFkai5zZXQoYiwgW10pO1xuXHRcdGFkai5nZXQoYSkhLnB1c2goYik7XG5cdFx0YWRqLmdldChiKSEucHVzaChhKTtcblx0fVxuXHRmb3IgKGxldCBpdGVyID0gMDsgaXRlciA8IGl0ZXJhdGlvbnM7IGl0ZXIrKykge1xuXHRcdGNvbnN0IG5leHQgPSB2ZXJ0aWNlcy5tYXAoKHYpID0+IFt2WzBdLCB2WzFdLCB2WzJdXSBhcyBWZWMzKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRpY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBuZWlnaGJvdXJzID0gYWRqLmdldChpKTtcblx0XHRcdGlmICghbmVpZ2hib3VycyB8fCAhbmVpZ2hib3Vycy5sZW5ndGgpIGNvbnRpbnVlO1xuXHRcdFx0bGV0IGF4ID0gMCwgYXkgPSAwLCBheiA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IG4gb2YgbmVpZ2hib3Vycykge1xuXHRcdFx0XHRheCArPSB2ZXJ0aWNlc1tuXVswXTtcblx0XHRcdFx0YXkgKz0gdmVydGljZXNbbl1bMV07XG5cdFx0XHRcdGF6ICs9IHZlcnRpY2VzW25dWzJdO1xuXHRcdFx0fVxuXHRcdFx0YXggLz0gbmVpZ2hib3Vycy5sZW5ndGg7XG5cdFx0XHRheSAvPSBuZWlnaGJvdXJzLmxlbmd0aDtcblx0XHRcdGF6IC89IG5laWdoYm91cnMubGVuZ3RoO1xuXHRcdFx0bmV4dFtpXVswXSA9IHZlcnRpY2VzW2ldWzBdICsgKGF4IC0gdmVydGljZXNbaV1bMF0pICogZmFjdG9yO1xuXHRcdFx0bmV4dFtpXVsxXSA9IHZlcnRpY2VzW2ldWzFdICsgKGF5IC0gdmVydGljZXNbaV1bMV0pICogZmFjdG9yO1xuXHRcdFx0bmV4dFtpXVsyXSA9IHZlcnRpY2VzW2ldWzJdICsgKGF6IC0gdmVydGljZXNbaV1bMl0pICogZmFjdG9yO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRpY2VzLmxlbmd0aDsgaSsrKSB2ZXJ0aWNlc1tpXSA9IG5leHRbaV07XG5cdH1cblx0cmV0dXJuIGZpbmFsaXplTWVzaCh7IC4uLm1lc2gsIHZlcnRpY2VzIH0sIG1lc2guc21vb3RoKTtcbn1cblxuLyoqXG4gKiBVViBVbndyYXAgUHJvamVjdGlvbnM6IGJveCwgcGxhbmFyLCBjeWxpbmRyaWNhbCwgc3BoZXJpY2FsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdW53cmFwTWVzaFVWKG1lc2g6IE1lc2gsIG1vZGU6ICdib3gnIHwgJ3BsYW5hcicgfCAnY3lsaW5kcmljYWwnIHwgJ3NwaGVyaWNhbCcgPSAnYm94Jywgc2NhbGUgPSAxKTogTWVzaCB7XG5cdGNvbnN0IHV2czogW251bWJlciwgbnVtYmVyXVtdID0gW107XG5cdGNvbnN0IG5vcm1hbHMgPSBjb21wdXRlVmVydGV4Tm9ybWFscyhtZXNoKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtZXNoLnZlcnRpY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgdiA9IG1lc2gudmVydGljZXNbaV07XG5cdFx0Y29uc3QgbiA9IG5vcm1hbHNbaV0gPz8gWzAsIDEsIDBdO1xuXHRcdGxldCB1ID0gMC41O1xuXHRcdGxldCB0ID0gMC41O1xuXHRcdGlmIChtb2RlID09PSAncGxhbmFyJykge1xuXHRcdFx0dSA9ICh2WzBdICsgMC41KSAqIHNjYWxlO1xuXHRcdFx0dCA9ICh2WzJdICsgMC41KSAqIHNjYWxlO1xuXHRcdH0gZWxzZSBpZiAobW9kZSA9PT0gJ2N5bGluZHJpY2FsJykge1xuXHRcdFx0dSA9ICgoTWF0aC5hdGFuMih2WzJdLCB2WzBdKSAvIChNYXRoLlBJICogMikpICsgMC41KSAqIHNjYWxlO1xuXHRcdFx0dCA9ICh2WzFdICsgMC41KSAqIHNjYWxlO1xuXHRcdH0gZWxzZSBpZiAobW9kZSA9PT0gJ3NwaGVyaWNhbCcpIHtcblx0XHRcdGNvbnN0IHIgPSBNYXRoLmh5cG90KHZbMF0sIHZbMV0sIHZbMl0pIHx8IDE7XG5cdFx0XHR1ID0gKChNYXRoLmF0YW4yKHZbMl0sIHZbMF0pIC8gKE1hdGguUEkgKiAyKSkgKyAwLjUpICogc2NhbGU7XG5cdFx0XHR0ID0gKDAuNSAtIE1hdGguYXNpbihNYXRoLm1heCgtMSwgTWF0aC5taW4oMSwgdlsxXSAvIHIpKSkgLyBNYXRoLlBJKSAqIHNjYWxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBheCA9IE1hdGguYWJzKG5bMF0pLCBheSA9IE1hdGguYWJzKG5bMV0pLCBheiA9IE1hdGguYWJzKG5bMl0pO1xuXHRcdFx0aWYgKGF4ID49IGF5ICYmIGF4ID49IGF6KSB7XG5cdFx0XHRcdHUgPSAodlsyXSArIDAuNSkgKiBzY2FsZTtcblx0XHRcdFx0dCA9ICh2WzFdICsgMC41KSAqIHNjYWxlO1xuXHRcdFx0fSBlbHNlIGlmIChheSA+PSBheikge1xuXHRcdFx0XHR1ID0gKHZbMF0gKyAwLjUpICogc2NhbGU7XG5cdFx0XHRcdHQgPSAodlsyXSArIDAuNSkgKiBzY2FsZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHUgPSAodlswXSArIDAuNSkgKiBzY2FsZTtcblx0XHRcdFx0dCA9ICh2WzFdICsgMC41KSAqIHNjYWxlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR1dnMucHVzaChbdSwgdF0pO1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IGNsb25lTWVzaChtZXNoKTtcblx0cmVzdWx0LnV2cyA9IHV2cztcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBCYWtlcyBwcm9jZWR1cmFsIGxpZ2h0aW5nIC8gQW1iaWVudCBPY2NsdXNpb24gLyBDdXJ2YXR1cmUgLyBIZWlnaHQgR3JhZGllbnQgaW50byBwZXItdmVydGV4IGNvbG9ycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJha2VNZXNoVmVydGV4Q29sb3JzKG1lc2g6IE1lc2gsIG1vZGU6ICdhbycgfCAnbGlnaHQnIHwgJ2dyYWRpZW50JyB8ICdjdXJ2YXR1cmUnID0gJ2FvJyk6IE1lc2gge1xuXHRjb25zdCByZXN1bHQgPSBjbG9uZU1lc2gobWVzaCk7XG5cdGNvbnN0IG5vcm1hbHMgPSBjb21wdXRlVmVydGV4Tm9ybWFscyhyZXN1bHQpO1xuXHRjb25zdCB2Q291bnQgPSByZXN1bHQudmVydGljZXMubGVuZ3RoO1xuXHRjb25zdCBjb2xvcnMgPSBuZXcgQXJyYXk8bnVtYmVyPih2Q291bnQgKiAzKTtcblxuXHRjb25zdCBhZGogPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cdGZvciAoY29uc3QgW2EsIGJdIG9mIHJlc3VsdC5lZGdlcykge1xuXHRcdGlmICghYWRqLmhhcyhhKSkgYWRqLnNldChhLCBbXSk7XG5cdFx0aWYgKCFhZGouaGFzKGIpKSBhZGouc2V0KGIsIFtdKTtcblx0XHRhZGouZ2V0KGEpIS5wdXNoKGIpO1xuXHRcdGFkai5nZXQoYikhLnB1c2goYSk7XG5cdH1cblxuXHRsZXQgbWluWSA9IEluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xuXHRmb3IgKGNvbnN0IHYgb2YgcmVzdWx0LnZlcnRpY2VzKSB7XG5cdFx0aWYgKHZbMV0gPCBtaW5ZKSBtaW5ZID0gdlsxXTtcblx0XHRpZiAodlsxXSA+IG1heFkpIG1heFkgPSB2WzFdO1xuXHR9XG5cdGNvbnN0IHNwYW5ZID0gTWF0aC5tYXgoMC4wMDEsIG1heFkgLSBtaW5ZKTtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHZDb3VudDsgaSsrKSB7XG5cdFx0Y29uc3QgdiA9IHJlc3VsdC52ZXJ0aWNlc1tpXTtcblx0XHRjb25zdCBuID0gbm9ybWFsc1tpXSA/PyBbMCwgMSwgMF07XG5cdFx0bGV0IHIgPSAxLCBnID0gMSwgYiA9IDE7XG5cblx0XHRpZiAobW9kZSA9PT0gJ2FvJykge1xuXHRcdFx0Y29uc3QgbGlzdCA9IGFkai5nZXQoaSkgPz8gW107XG5cdFx0XHRsZXQgY2F2aXR5ID0gMDtcblx0XHRcdGZvciAoY29uc3QgbmIgb2YgbGlzdCkge1xuXHRcdFx0XHRjb25zdCBudiA9IHJlc3VsdC52ZXJ0aWNlc1tuYl07XG5cdFx0XHRcdGNvbnN0IGR4ID0gbnZbMF0gLSB2WzBdLCBkeSA9IG52WzFdIC0gdlsxXSwgZHogPSBudlsyXSAtIHZbMl07XG5cdFx0XHRcdGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR5LCBkeikgfHwgMTtcblx0XHRcdFx0Y2F2aXR5ICs9IChkeCAqIG5bMF0gKyBkeSAqIG5bMV0gKyBkeiAqIG5bMl0pIC8gbGVuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXZnID0gbGlzdC5sZW5ndGggPyBjYXZpdHkgLyBsaXN0Lmxlbmd0aCA6IDA7XG5cdFx0XHRjb25zdCBzaGFkZSA9IE1hdGgubWluKDEsIE1hdGgubWF4KDAuMTgsIDAuNzIgLSBhdmcgKiAwLjY1ICsgKHZbMV0gLSBtaW5ZKSAvIHNwYW5ZICogMC4yMikpO1xuXHRcdFx0ciA9IHNoYWRlOyBnID0gc2hhZGU7IGIgPSBzaGFkZSAqIDEuMDM7XG5cdFx0fSBlbHNlIGlmIChtb2RlID09PSAnbGlnaHQnKSB7XG5cdFx0XHRjb25zdCBuZGwgPSBNYXRoLm1heCgwLCBuWzBdICogLTAuNDUgKyBuWzFdICogMC44MiArIG5bMl0gKiAwLjQ1KTtcblx0XHRcdGNvbnN0IHdhcm0gPSAwLjI1ICsgbmRsICogMC43NTtcblx0XHRcdHIgPSBNYXRoLm1pbigxLCB3YXJtICogMS4wNik7XG5cdFx0XHRnID0gTWF0aC5taW4oMSwgd2FybSAqIDAuOTgpO1xuXHRcdFx0YiA9IE1hdGgubWluKDEsIDAuMzIgKyBuZGwgKiAwLjYyKTtcblx0XHR9IGVsc2UgaWYgKG1vZGUgPT09ICdncmFkaWVudCcpIHtcblx0XHRcdGNvbnN0IHQgPSAodlsxXSAtIG1pblkpIC8gc3Bhblk7XG5cdFx0XHRyID0gMC4yICsgdCAqIDAuNzU7XG5cdFx0XHRnID0gMC4zNSArIHQgKiAwLjY7XG5cdFx0XHRiID0gMC41NSArICgxIC0gdCkgKiAwLjQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxpc3QgPSBhZGouZ2V0KGkpID8/IFtdO1xuXHRcdFx0bGV0IGxhcFggPSAwLCBsYXBZID0gMCwgbGFwWiA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IG5iIG9mIGxpc3QpIHtcblx0XHRcdFx0bGFwWCArPSByZXN1bHQudmVydGljZXNbbmJdWzBdIC0gdlswXTtcblx0XHRcdFx0bGFwWSArPSByZXN1bHQudmVydGljZXNbbmJdWzFdIC0gdlsxXTtcblx0XHRcdFx0bGFwWiArPSByZXN1bHQudmVydGljZXNbbmJdWzJdIC0gdlsyXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnYgPSBsaXN0Lmxlbmd0aCA/IE1hdGgubWluKDEsIE1hdGguaHlwb3QobGFwWCwgbGFwWSwgbGFwWikgLyBsaXN0Lmxlbmd0aCAqIDMuNSkgOiAwLjU7XG5cdFx0XHRyID0gMC4yNSArIGN1cnYgKiAwLjc1O1xuXHRcdFx0ZyA9IDAuMyArIGN1cnYgKiAwLjY4O1xuXHRcdFx0YiA9IDAuNDUgKyAoMSAtIGN1cnYpICogMC40NTtcblx0XHR9XG5cdFx0Y29sb3JzW2kgKiAzXSA9IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIHIpKTtcblx0XHRjb2xvcnNbaSAqIDMgKyAxXSA9IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIGcpKTtcblx0XHRjb2xvcnNbaSAqIDMgKyAyXSA9IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIGIpKTtcblx0fVxuXHRyZXN1bHQuY29sb3JzID0gY29sb3JzO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNmb3JtVmVydGljZXMobWVzaDogTWVzaCwgaW5kaWNlczogbnVtYmVyW10sIGZuOiAodjogVmVjMykgPT4gVmVjMyk6IE1lc2gge1xuXHRjb25zdCByZXN1bHQgPSBjbG9uZU1lc2gobWVzaCk7XG5cdGZvciAoY29uc3QgaW5kZXggb2YgaW5kaWNlcykge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gcmVzdWx0LnZlcnRpY2VzLmxlbmd0aCkgY29udGludWU7XG5cdFx0cmVzdWx0LnZlcnRpY2VzW2luZGV4XSA9IGZuKHJlc3VsdC52ZXJ0aWNlc1tpbmRleF0pO1xuXHR9XG5cdHJldHVybiBmaW5hbGl6ZU1lc2gocmVzdWx0LCBtZXNoLnNtb290aCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlhbmd1bGF0ZShtZXNoOiBNZXNoKTogeyBwb3NpdGlvbnM6IG51bWJlcltdOyBpbmRpY2VzOiBudW1iZXJbXSB9IHtcblx0Y29uc3QgcG9zaXRpb25zOiBudW1iZXJbXSA9IFtdO1xuXHRjb25zdCBpbmRpY2VzOiBudW1iZXJbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGZhY2Ugb2YgbWVzaC5mYWNlcykge1xuXHRcdGNvbnN0IGJhc2UgPSBwb3NpdGlvbnMubGVuZ3RoIC8gMztcblx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGZhY2UpIHtcblx0XHRcdGNvbnN0IHYgPSBtZXNoLnZlcnRpY2VzW2luZGV4XTtcblx0XHRcdHBvc2l0aW9ucy5wdXNoKHZbMF0sIHZbMV0sIHZbMl0pO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGZhY2UubGVuZ3RoIC0gMTsgaSsrKSBpbmRpY2VzLnB1c2goYmFzZSwgYmFzZSArIGksIGJhc2UgKyBpICsgMSk7XG5cdH1cblx0cmV0dXJuIHsgcG9zaXRpb25zLCBpbmRpY2VzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBicmlkZ2VFZGdlTG9vcHMobWVzaDogTWVzaCwgbG9vcDE6IG51bWJlcltdLCBsb29wMjogbnVtYmVyW10pOiBNZXNoIHtcblx0aWYgKCFsb29wMS5sZW5ndGggfHwgIWxvb3AyLmxlbmd0aCkgcmV0dXJuIG1lc2g7XG5cdGNvbnN0IGZhY2VzID0gbWVzaC5mYWNlcy5tYXAoKGYpID0+IFsuLi5mXSk7XG5cdGNvbnN0IGZhY2VTbG90cyA9IFsuLi4obWVzaC5mYWNlU2xvdCA/PyBbXSldO1xuXHRjb25zdCBuID0gTWF0aC5taW4obG9vcDEubGVuZ3RoLCBsb29wMi5sZW5ndGgpO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0Y29uc3QgbmV4dEkgPSAoaSArIDEpICUgbjtcblx0XHRjb25zdCBhID0gbG9vcDFbaV07XG5cdFx0Y29uc3QgYiA9IGxvb3AxW25leHRJXTtcblx0XHRjb25zdCBjID0gbG9vcDJbbmV4dEldO1xuXHRcdGNvbnN0IGQgPSBsb29wMltpXTtcblx0XHRmYWNlcy5wdXNoKFthLCBiLCBjLCBkXSk7XG5cdFx0ZmFjZVNsb3RzLnB1c2goMCk7XG5cdH1cblx0cmV0dXJuIGZpbmFsaXplTWVzaCh7XG5cdFx0dmVydGljZXM6IG1lc2gudmVydGljZXMubWFwKCh2KSA9PiBbdlswXSwgdlsxXSwgdlsyXV0gYXMgVmVjMyksXG5cdFx0ZmFjZXMsXG5cdFx0ZWRnZXM6IFtdLFxuXHRcdHJhZGl1czogMCxcblx0XHRzbG90czogbWVzaC5zbG90cyA/PyBbXSxcblx0XHRmYWNlU2xvdDogZmFjZVNsb3RzLFxuXHR9LCBtZXNoLnNtb290aCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZVZlcnRpY2VzKFxuXHRtZXNoOiBNZXNoLFxuXHR2ZXJ0ZXhJbmRpY2VzOiBudW1iZXJbXSxcblx0bW9kZTogJ2NlbnRlcicgfCAnZmlyc3QnIHwgJ2xhc3QnIHwgJ2NvbGxhcHNlJyB8ICdkaXN0YW5jZScgPSAnY2VudGVyJyxcblx0dGhyZXNob2xkID0gMC4wMDFcbik6IE1lc2gge1xuXHRpZiAoIXZlcnRleEluZGljZXMubGVuZ3RoKSByZXR1cm4gbWVzaDtcblx0aWYgKG1vZGUgPT09ICdkaXN0YW5jZScpIHtcblx0XHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gW107XG5cdFx0Y29uc3QgcmVtYXAgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRcdG1lc2gudmVydGljZXMuZm9yRWFjaCgodiwgaWR4KSA9PiB7XG5cdFx0XHRpZiAoIXZlcnRleEluZGljZXMuaW5jbHVkZXMoaWR4KSkge1xuXHRcdFx0XHRyZW1hcC5zZXQoaWR4LCB2ZXJ0aWNlcy5sZW5ndGgpO1xuXHRcdFx0XHR2ZXJ0aWNlcy5wdXNoKFsuLi52XSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxldCBmb3VuZCA9IC0xO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0aWNlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHZlcnRpY2VzW2ldO1xuXHRcdFx0XHRpZiAoTWF0aC5oeXBvdCh2WzBdIC0gZXhpc3RpbmdbMF0sIHZbMV0gLSBleGlzdGluZ1sxXSwgdlsyXSAtIGV4aXN0aW5nWzJdKSA8PSB0aHJlc2hvbGQpIHtcblx0XHRcdFx0XHRmb3VuZCA9IGk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChmb3VuZCA+PSAwKSB7XG5cdFx0XHRcdHJlbWFwLnNldChpZHgsIGZvdW5kKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlbWFwLnNldChpZHgsIHZlcnRpY2VzLmxlbmd0aCk7XG5cdFx0XHRcdHZlcnRpY2VzLnB1c2goWy4uLnZdKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdFx0Y29uc3QgZmFjZVNsb3RzOiBudW1iZXJbXSA9IFtdO1xuXHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZmFjZSwgZklkeCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVtYXBwZWQgPSBmYWNlLm1hcCgodmkpID0+IHJlbWFwLmdldCh2aSkgPz8gdmkpO1xuXHRcdFx0Y29uc3QgdW5pcXVlID0gcmVtYXBwZWQuZmlsdGVyKCh2LCBpLCBhcnIpID0+IGFyci5pbmRleE9mKHYpID09PSBpKTtcblx0XHRcdGlmICh1bmlxdWUubGVuZ3RoID49IDMpIHtcblx0XHRcdFx0ZmFjZXMucHVzaCh1bmlxdWUpO1xuXHRcdFx0XHRmYWNlU2xvdHMucHVzaChtZXNoLmZhY2VTbG90Py5bZklkeF0gPz8gMCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGZpbmFsaXplTWVzaCh7IHZlcnRpY2VzLCBmYWNlcywgZWRnZXM6IFtdLCByYWRpdXM6IDAsIHNsb3RzOiBtZXNoLnNsb3RzID8/IFtdLCBmYWNlU2xvdDogZmFjZVNsb3RzIH0sIG1lc2guc21vb3RoKTtcblx0fVxuXG5cdGNvbnN0IHZlcnRpY2VzID0gbWVzaC52ZXJ0aWNlcy5tYXAoKHYpID0+IFt2WzBdLCB2WzFdLCB2WzJdXSBhcyBWZWMzKTtcblx0bGV0IHRhcmdldFBvczogVmVjMztcblx0bGV0IHRhcmdldElkeDogbnVtYmVyO1xuXG5cdGlmIChtb2RlID09PSAnZmlyc3QnKSB7XG5cdFx0dGFyZ2V0SWR4ID0gdmVydGV4SW5kaWNlc1swXTtcblx0XHR0YXJnZXRQb3MgPSBbLi4udmVydGljZXNbdGFyZ2V0SWR4XV07XG5cdH0gZWxzZSBpZiAobW9kZSA9PT0gJ2xhc3QnKSB7XG5cdFx0dGFyZ2V0SWR4ID0gdmVydGV4SW5kaWNlc1t2ZXJ0ZXhJbmRpY2VzLmxlbmd0aCAtIDFdO1xuXHRcdHRhcmdldFBvcyA9IFsuLi52ZXJ0aWNlc1t0YXJnZXRJZHhdXTtcblx0fSBlbHNlIHtcblx0XHRsZXQgc3ggPSAwLCBzeSA9IDAsIHN6ID0gMDtcblx0XHRmb3IgKGNvbnN0IHZpIG9mIHZlcnRleEluZGljZXMpIHtcblx0XHRcdHN4ICs9IHZlcnRpY2VzW3ZpXVswXTtcblx0XHRcdHN5ICs9IHZlcnRpY2VzW3ZpXVsxXTtcblx0XHRcdHN6ICs9IHZlcnRpY2VzW3ZpXVsyXTtcblx0XHR9XG5cdFx0dGFyZ2V0UG9zID0gW3N4IC8gdmVydGV4SW5kaWNlcy5sZW5ndGgsIHN5IC8gdmVydGV4SW5kaWNlcy5sZW5ndGgsIHN6IC8gdmVydGV4SW5kaWNlcy5sZW5ndGhdO1xuXHRcdHRhcmdldElkeCA9IHZlcnRleEluZGljZXNbMF07XG5cdH1cblx0dmVydGljZXNbdGFyZ2V0SWR4XSA9IHRhcmdldFBvcztcblxuXHRjb25zdCByZW1hcCA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cdGZvciAoY29uc3Qgdmkgb2YgdmVydGV4SW5kaWNlcykge1xuXHRcdHJlbWFwLnNldCh2aSwgdGFyZ2V0SWR4KTtcblx0fVxuXG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXTtcblx0Y29uc3QgZmFjZVNsb3RzOiBudW1iZXJbXSA9IFtdO1xuXHRtZXNoLmZhY2VzLmZvckVhY2goKGZhY2UsIGZJZHgpID0+IHtcblx0XHRjb25zdCByZW1hcHBlZCA9IGZhY2UubWFwKCh2aSkgPT4gcmVtYXAuZ2V0KHZpKSA/PyB2aSk7XG5cdFx0Y29uc3QgY29sbGFwc2VkOiBudW1iZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVtYXBwZWQubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHByZXYgPSBjb2xsYXBzZWRbY29sbGFwc2VkLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKHJlbWFwcGVkW2ldICE9PSBwcmV2KSB7XG5cdFx0XHRcdGNvbGxhcHNlZC5wdXNoKHJlbWFwcGVkW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNvbGxhcHNlZC5sZW5ndGggPiAyICYmIGNvbGxhcHNlZFswXSA9PT0gY29sbGFwc2VkW2NvbGxhcHNlZC5sZW5ndGggLSAxXSkge1xuXHRcdFx0Y29sbGFwc2VkLnBvcCgpO1xuXHRcdH1cblx0XHRjb25zdCB1bmlxdWUgPSBuZXcgU2V0KGNvbGxhcHNlZCk7XG5cdFx0aWYgKHVuaXF1ZS5zaXplID49IDMpIHtcblx0XHRcdGZhY2VzLnB1c2goY29sbGFwc2VkKTtcblx0XHRcdGZhY2VTbG90cy5wdXNoKG1lc2guZmFjZVNsb3Q/LltmSWR4XSA/PyAwKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbnN0IHVzZWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRjb25zdCBuZXh0VmVydGljZXM6IFZlYzNbXSA9IFtdO1xuXHRjb25zdCBjb21wYWN0UmVtYXAgPSAoaWR4OiBudW1iZXIpID0+IHtcblx0XHRpZiAodXNlZC5oYXMoaWR4KSkgcmV0dXJuIHVzZWQuZ2V0KGlkeCkhO1xuXHRcdGNvbnN0IG5JZHggPSBuZXh0VmVydGljZXMubGVuZ3RoO1xuXHRcdG5leHRWZXJ0aWNlcy5wdXNoKHZlcnRpY2VzW2lkeF0pO1xuXHRcdHVzZWQuc2V0KGlkeCwgbklkeCk7XG5cdFx0cmV0dXJuIG5JZHg7XG5cdH07XG5cdGNvbnN0IG5leHRGYWNlcyA9IGZhY2VzLm1hcCgoZikgPT4gZi5tYXAoY29tcGFjdFJlbWFwKSk7XG5cdHJldHVybiBmaW5hbGl6ZU1lc2goeyB2ZXJ0aWNlczogbmV4dFZlcnRpY2VzLCBmYWNlczogbmV4dEZhY2VzLCBlZGdlczogW10sIHJhZGl1czogMCwgc2xvdHM6IG1lc2guc2xvdHMgPz8gW10sIGZhY2VTbG90OiBmYWNlU2xvdHMgfSwgbWVzaC5zbW9vdGgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlR2VvbWV0cnkobWVzaDogTWVzaCwga2luZDogJ3ZlcnRleCcgfCAnZWRnZScgfCAnZmFjZScsIGluZGljZXM6IG51bWJlcltdKTogTWVzaCB7XG5cdGlmICghaW5kaWNlcy5sZW5ndGgpIHJldHVybiBtZXNoO1xuXHRjb25zdCBpbmRleFNldCA9IG5ldyBTZXQoaW5kaWNlcyk7XG5cdGxldCByZW1haW5pbmdGYWNlczogRmFjZVtdID0gW107XG5cdGxldCBmYWNlU2xvdHM6IG51bWJlcltdID0gW107XG5cblx0aWYgKGtpbmQgPT09ICdmYWNlJykge1xuXHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZiwgaWR4KSA9PiB7XG5cdFx0XHRpZiAoIWluZGV4U2V0LmhhcyhpZHgpKSB7XG5cdFx0XHRcdHJlbWFpbmluZ0ZhY2VzLnB1c2goWy4uLmZdKTtcblx0XHRcdFx0ZmFjZVNsb3RzLnB1c2gobWVzaC5mYWNlU2xvdD8uW2lkeF0gPz8gMCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoa2luZCA9PT0gJ3ZlcnRleCcpIHtcblx0XHRtZXNoLmZhY2VzLmZvckVhY2goKGYsIGlkeCkgPT4ge1xuXHRcdFx0Y29uc3QgaGFzVmVydGV4ID0gZi5zb21lKCh2aSkgPT4gaW5kZXhTZXQuaGFzKHZpKSk7XG5cdFx0XHRpZiAoIWhhc1ZlcnRleCkge1xuXHRcdFx0XHRyZW1haW5pbmdGYWNlcy5wdXNoKFsuLi5mXSk7XG5cdFx0XHRcdGZhY2VTbG90cy5wdXNoKG1lc2guZmFjZVNsb3Q/LltpZHhdID8/IDApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9IGVsc2UgaWYgKGtpbmQgPT09ICdlZGdlJykge1xuXHRcdGNvbnN0IGRlbGV0ZWRFZGdlcyA9IGluZGljZXMubWFwKChpKSA9PiBtZXNoLmVkZ2VzW2ldKS5maWx0ZXIoQm9vbGVhbik7XG5cdFx0Y29uc3QgZWRnZVNldCA9IG5ldyBTZXQoZGVsZXRlZEVkZ2VzLm1hcCgoZSkgPT4gKGVbMF0gPCBlWzFdID8gYCR7ZVswXX1fJHtlWzFdfWAgOiBgJHtlWzFdfV8ke2VbMF19YCkpKTtcblx0XHRtZXNoLmZhY2VzLmZvckVhY2goKGYsIGlkeCkgPT4ge1xuXHRcdFx0bGV0IGNvbnRhaW5zRGVsZXRlZEVkZ2UgPSBmYWxzZTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZi5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhID0gZltpXTtcblx0XHRcdFx0Y29uc3QgYiA9IGZbKGkgKyAxKSAlIGYubGVuZ3RoXTtcblx0XHRcdFx0Y29uc3QgayA9IGEgPCBiID8gYCR7YX1fJHtifWAgOiBgJHtifV8ke2F9YDtcblx0XHRcdFx0aWYgKGVkZ2VTZXQuaGFzKGspKSB7XG5cdFx0XHRcdFx0Y29udGFpbnNEZWxldGVkRWRnZSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghY29udGFpbnNEZWxldGVkRWRnZSkge1xuXHRcdFx0XHRyZW1haW5pbmdGYWNlcy5wdXNoKFsuLi5mXSk7XG5cdFx0XHRcdGZhY2VTbG90cy5wdXNoKG1lc2guZmFjZVNsb3Q/LltpZHhdID8/IDApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aWYgKCFyZW1haW5pbmdGYWNlcy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmluYWxpemVNZXNoKHsgdmVydGljZXM6IFtdLCBmYWNlczogW10sIGVkZ2VzOiBbXSwgcmFkaXVzOiAwLCBzbG90czogbWVzaC5zbG90cyA/PyBbXSB9LCBtZXNoLnNtb290aCk7XG5cdH1cblxuXHRjb25zdCB1c2VkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcblx0Y29uc3QgbmV4dFZlcnRpY2VzOiBWZWMzW10gPSBbXTtcblx0Y29uc3QgY29tcGFjdFJlbWFwID0gKGlkeDogbnVtYmVyKSA9PiB7XG5cdFx0aWYgKHVzZWQuaGFzKGlkeCkpIHJldHVybiB1c2VkLmdldChpZHgpITtcblx0XHRjb25zdCBuSWR4ID0gbmV4dFZlcnRpY2VzLmxlbmd0aDtcblx0XHRuZXh0VmVydGljZXMucHVzaChtZXNoLnZlcnRpY2VzW2lkeF0pO1xuXHRcdHVzZWQuc2V0KGlkeCwgbklkeCk7XG5cdFx0cmV0dXJuIG5JZHg7XG5cdH07XG5cdGNvbnN0IG5leHRGYWNlcyA9IHJlbWFpbmluZ0ZhY2VzLm1hcCgoZikgPT4gZi5tYXAoY29tcGFjdFJlbWFwKSk7XG5cdHJldHVybiBmaW5hbGl6ZU1lc2goeyB2ZXJ0aWNlczogbmV4dFZlcnRpY2VzLCBmYWNlczogbmV4dEZhY2VzLCBlZGdlczogW10sIHJhZGl1czogMCwgc2xvdHM6IG1lc2guc2xvdHMgPz8gW10sIGZhY2VTbG90OiBmYWNlU2xvdHMgfSwgbWVzaC5zbW9vdGgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGlzc29sdmVHZW9tZXRyeShtZXNoOiBNZXNoLCBraW5kOiAndmVydGV4JyB8ICdlZGdlJyB8ICdmYWNlJywgaW5kaWNlczogbnVtYmVyW10pOiBNZXNoIHtcblx0aWYgKCFpbmRpY2VzLmxlbmd0aCkgcmV0dXJuIG1lc2g7XG5cdGlmIChraW5kID09PSAnZmFjZScpIHtcblx0XHRjb25zdCBmYWNlU2V0ID0gbmV3IFNldChpbmRpY2VzKTtcblx0XHRpZiAoZmFjZVNldC5zaXplIDw9IDEpIHJldHVybiBtZXNoO1xuXG5cdFx0Y29uc3QgZWRnZUNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCB7IGE6IG51bWJlcjsgYjogbnVtYmVyOyBjb3VudDogbnVtYmVyIH0+KCk7XG5cdFx0Zm9yIChjb25zdCBmSWR4IG9mIGluZGljZXMpIHtcblx0XHRcdGNvbnN0IGZhY2UgPSBtZXNoLmZhY2VzW2ZJZHhdO1xuXHRcdFx0aWYgKCFmYWNlKSBjb250aW51ZTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZmFjZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhID0gZmFjZVtpXTtcblx0XHRcdFx0Y29uc3QgYiA9IGZhY2VbKGkgKyAxKSAlIGZhY2UubGVuZ3RoXTtcblx0XHRcdFx0Y29uc3QgayA9IGEgPCBiID8gYCR7YX1fJHtifWAgOiBgJHtifV8ke2F9YDtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlZGdlQ291bnRzLmdldChrKSB8fCB7IGEsIGIsIGNvdW50OiAwIH07XG5cdFx0XHRcdGVudHJ5LmNvdW50Kys7XG5cdFx0XHRcdGVkZ2VDb3VudHMuc2V0KGssIGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBib3VuZGFyeUVkZ2VzOiBbbnVtYmVyLCBudW1iZXJdW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVkZ2VDb3VudHMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChlbnRyeS5jb3VudCA9PT0gMSkge1xuXHRcdFx0XHRib3VuZGFyeUVkZ2VzLnB1c2goW2VudHJ5LmEsIGVudHJ5LmJdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYm91bmRhcnlFZGdlcy5sZW5ndGggPCAzKSByZXR1cm4gbWVzaDtcblxuXHRcdGNvbnN0IGFkaiA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXJbXT4oKTtcblx0XHRmb3IgKGNvbnN0IFthLCBiXSBvZiBib3VuZGFyeUVkZ2VzKSB7XG5cdFx0XHRpZiAoIWFkai5oYXMoYSkpIGFkai5zZXQoYSwgW10pO1xuXHRcdFx0aWYgKCFhZGouaGFzKGIpKSBhZGouc2V0KGIsIFtdKTtcblx0XHRcdGFkai5nZXQoYSkhLnB1c2goYik7XG5cdFx0XHRhZGouZ2V0KGIpIS5wdXNoKGEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lcmdlZEZhY2U6IG51bWJlcltdID0gW107XG5cdFx0bGV0IHN0YXJ0ID0gYm91bmRhcnlFZGdlc1swXVswXTtcblx0XHRsZXQgY3VycmVudCA9IHN0YXJ0O1xuXHRcdGxldCBwcmV2ID0gLTE7XG5cdFx0Y29uc3QgdmlzaXRlZCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Zm9yIChsZXQgc3RlcCA9IDA7IHN0ZXAgPCBib3VuZGFyeUVkZ2VzLmxlbmd0aDsgc3RlcCsrKSB7XG5cdFx0XHRtZXJnZWRGYWNlLnB1c2goY3VycmVudCk7XG5cdFx0XHR2aXNpdGVkLmFkZChjdXJyZW50KTtcblx0XHRcdGNvbnN0IG5laWdoYm9ycyA9IGFkai5nZXQoY3VycmVudCkgfHwgW107XG5cdFx0XHRjb25zdCBuZXh0ID0gbmVpZ2hib3JzLmZpbmQoKG4pID0+IG4gIT09IHByZXYgJiYgKCF2aXNpdGVkLmhhcyhuKSB8fCBuID09PSBzdGFydCkpO1xuXHRcdFx0aWYgKG5leHQgPT09IHVuZGVmaW5lZCB8fCBuZXh0ID09PSBzdGFydCkgYnJlYWs7XG5cdFx0XHRwcmV2ID0gY3VycmVudDtcblx0XHRcdGN1cnJlbnQgPSBuZXh0O1xuXHRcdH1cblxuXHRcdGlmIChtZXJnZWRGYWNlLmxlbmd0aCA8IDMpIHJldHVybiBtZXNoO1xuXG5cdFx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRcdGNvbnN0IGZhY2VTbG90czogbnVtYmVyW10gPSBbXTtcblx0XHRtZXNoLmZhY2VzLmZvckVhY2goKGYsIGlkeCkgPT4ge1xuXHRcdFx0aWYgKCFmYWNlU2V0LmhhcyhpZHgpKSB7XG5cdFx0XHRcdGZhY2VzLnB1c2goWy4uLmZdKTtcblx0XHRcdFx0ZmFjZVNsb3RzLnB1c2gobWVzaC5mYWNlU2xvdD8uW2lkeF0gPz8gMCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0ZmFjZXMucHVzaChtZXJnZWRGYWNlKTtcblx0XHRmYWNlU2xvdHMucHVzaChtZXNoLmZhY2VTbG90Py5baW5kaWNlc1swXV0gPz8gMCk7XG5cblx0XHRyZXR1cm4gZmluYWxpemVNZXNoKHtcblx0XHRcdHZlcnRpY2VzOiBtZXNoLnZlcnRpY2VzLm1hcCgodikgPT4gW3ZbMF0sIHZbMV0sIHZbMl1dIGFzIFZlYzMpLFxuXHRcdFx0ZmFjZXMsXG5cdFx0XHRlZGdlczogW10sXG5cdFx0XHRyYWRpdXM6IDAsXG5cdFx0XHRzbG90czogbWVzaC5zbG90cyA/PyBbXSxcblx0XHRcdGZhY2VTbG90OiBmYWNlU2xvdHMsXG5cdFx0fSwgbWVzaC5zbW9vdGgpO1xuXHR9XG5cblx0aWYgKGtpbmQgPT09ICdlZGdlJykge1xuXHRcdGNvbnN0IGVkZ2UgPSBtZXNoLmVkZ2VzW2luZGljZXNbMF1dO1xuXHRcdGlmICghZWRnZSkgcmV0dXJuIG1lc2g7XG5cdFx0Y29uc3QgW2VhLCBlYl0gPSBlZGdlO1xuXHRcdGNvbnN0IHNoYXJpbmdGYWNlczogbnVtYmVyW10gPSBbXTtcblx0XHRtZXNoLmZhY2VzLmZvckVhY2goKGYsIGlkeCkgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBmW2ldO1xuXHRcdFx0XHRjb25zdCBiID0gZlsoaSArIDEpICUgZi5sZW5ndGhdO1xuXHRcdFx0XHRpZiAoKGEgPT09IGVhICYmIGIgPT09IGViKSB8fCAoYSA9PT0gZWIgJiYgYiA9PT0gZWEpKSB7XG5cdFx0XHRcdFx0c2hhcmluZ0ZhY2VzLnB1c2goaWR4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmIChzaGFyaW5nRmFjZXMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRyZXR1cm4gZGlzc29sdmVHZW9tZXRyeShtZXNoLCAnZmFjZScsIHNoYXJpbmdGYWNlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBkZWxldGVHZW9tZXRyeShtZXNoLCAnZmFjZScsIHNoYXJpbmdGYWNlcyk7XG5cdH1cblxuXHRpZiAoa2luZCA9PT0gJ3ZlcnRleCcpIHtcblx0XHRjb25zdCB2aSA9IGluZGljZXNbMF07XG5cdFx0Y29uc3Qgc2hhcmluZ0ZhY2VzOiBudW1iZXJbXSA9IFtdO1xuXHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZiwgaWR4KSA9PiB7XG5cdFx0XHRpZiAoZi5pbmNsdWRlcyh2aSkpIHNoYXJpbmdGYWNlcy5wdXNoKGlkeCk7XG5cdFx0fSk7XG5cdFx0aWYgKHNoYXJpbmdGYWNlcy5sZW5ndGggPj0gMikge1xuXHRcdFx0cmV0dXJuIGRpc3NvbHZlR2VvbWV0cnkobWVzaCwgJ2ZhY2UnLCBzaGFyaW5nRmFjZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVsZXRlR2VvbWV0cnkobWVzaCwgJ2ZhY2UnLCBzaGFyaW5nRmFjZXMpO1xuXHR9XG5cblx0cmV0dXJuIG1lc2g7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkdXBsaWNhdGVNZXNoR2VvbWV0cnkobWVzaDogTWVzaCwga2luZDogJ3ZlcnRleCcgfCAnZWRnZScgfCAnZmFjZScsIGluZGljZXM6IG51bWJlcltdKToge1xuXHRtZXNoOiBNZXNoO1xuXHRuZXdWZXJ0ZXhJbmRpY2VzOiBudW1iZXJbXTtcblx0bmV3RmFjZUluZGljZXM6IG51bWJlcltdO1xufSB7XG5cdGlmICghaW5kaWNlcy5sZW5ndGgpIHJldHVybiB7IG1lc2gsIG5ld1ZlcnRleEluZGljZXM6IFtdLCBuZXdGYWNlSW5kaWNlczogW10gfTtcblxuXHRsZXQgZmFjZXNUb0R1cDogbnVtYmVyW10gPSBbXTtcblx0aWYgKGtpbmQgPT09ICdmYWNlJykge1xuXHRcdGZhY2VzVG9EdXAgPSBbLi4uaW5kaWNlc107XG5cdH0gZWxzZSBpZiAoa2luZCA9PT0gJ3ZlcnRleCcpIHtcblx0XHRjb25zdCB2U2V0ID0gbmV3IFNldChpbmRpY2VzKTtcblx0XHRtZXNoLmZhY2VzLmZvckVhY2goKGYsIGlkeCkgPT4ge1xuXHRcdFx0aWYgKGYuc29tZSgodmkpID0+IHZTZXQuaGFzKHZpKSkpIGZhY2VzVG9EdXAucHVzaChpZHgpO1xuXHRcdH0pO1xuXHR9IGVsc2UgaWYgKGtpbmQgPT09ICdlZGdlJykge1xuXHRcdGNvbnN0IGVTZXQgPSBuZXcgU2V0KGluZGljZXMubWFwKChpKSA9PiBtZXNoLmVkZ2VzW2ldKS5maWx0ZXIoQm9vbGVhbikubWFwKChlKSA9PiBgJHtlWzBdfV8ke2VbMV19YCkpO1xuXHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZiwgaWR4KSA9PiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGYubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgYSA9IGZbaV07XG5cdFx0XHRcdGNvbnN0IGIgPSBmWyhpICsgMSkgJSBmLmxlbmd0aF07XG5cdFx0XHRcdGlmIChlU2V0LmhhcyhgJHthfV8ke2J9YCkgfHwgZVNldC5oYXMoYCR7Yn1fJHthfWApKSB7XG5cdFx0XHRcdFx0ZmFjZXNUb0R1cC5wdXNoKGlkeCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGlmICghZmFjZXNUb0R1cC5sZW5ndGgpIHJldHVybiB7IG1lc2gsIG5ld1ZlcnRleEluZGljZXM6IFtdLCBuZXdGYWNlSW5kaWNlczogW10gfTtcblxuXHRjb25zdCB2ZXJ0aWNlcyA9IG1lc2gudmVydGljZXMubWFwKCh2KSA9PiBbdlswXSwgdlsxXSwgdlsyXV0gYXMgVmVjMyk7XG5cdGNvbnN0IGZhY2VzID0gbWVzaC5mYWNlcy5tYXAoKGYpID0+IFsuLi5mXSk7XG5cdGNvbnN0IGZhY2VTbG90cyA9IFsuLi4obWVzaC5mYWNlU2xvdCA/PyBbXSldO1xuXG5cdGNvbnN0IHZSZW1hcCA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cdGNvbnN0IG5ld1ZlcnRleEluZGljZXM6IG51bWJlcltdID0gW107XG5cblx0Zm9yIChjb25zdCBmSWR4IG9mIGZhY2VzVG9EdXApIHtcblx0XHRjb25zdCBmID0gbWVzaC5mYWNlc1tmSWR4XTtcblx0XHRmb3IgKGNvbnN0IHZpIG9mIGYpIHtcblx0XHRcdGlmICghdlJlbWFwLmhhcyh2aSkpIHtcblx0XHRcdFx0Y29uc3QgblZpID0gdmVydGljZXMubGVuZ3RoO1xuXHRcdFx0XHR2ZXJ0aWNlcy5wdXNoKFsuLi5tZXNoLnZlcnRpY2VzW3ZpXV0pO1xuXHRcdFx0XHR2UmVtYXAuc2V0KHZpLCBuVmkpO1xuXHRcdFx0XHRuZXdWZXJ0ZXhJbmRpY2VzLnB1c2goblZpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb25zdCBuZXdGYWNlSW5kaWNlczogbnVtYmVyW10gPSBbXTtcblx0Zm9yIChjb25zdCBmSWR4IG9mIGZhY2VzVG9EdXApIHtcblx0XHRjb25zdCBvbGRGYWNlID0gbWVzaC5mYWNlc1tmSWR4XTtcblx0XHRjb25zdCBuRmFjZSA9IG9sZEZhY2UubWFwKCh2aSkgPT4gdlJlbWFwLmdldCh2aSkhKTtcblx0XHRuZXdGYWNlSW5kaWNlcy5wdXNoKGZhY2VzLmxlbmd0aCk7XG5cdFx0ZmFjZXMucHVzaChuRmFjZSk7XG5cdFx0ZmFjZVNsb3RzLnB1c2gobWVzaC5mYWNlU2xvdD8uW2ZJZHhdID8/IDApO1xuXHR9XG5cblx0Y29uc3QgbmV4dE1lc2ggPSBmaW5hbGl6ZU1lc2goe1xuXHRcdHZlcnRpY2VzLFxuXHRcdGZhY2VzLFxuXHRcdGVkZ2VzOiBbXSxcblx0XHRyYWRpdXM6IDAsXG5cdFx0c2xvdHM6IG1lc2guc2xvdHMgPz8gW10sXG5cdFx0ZmFjZVNsb3Q6IGZhY2VTbG90cyxcblx0fSwgbWVzaC5zbW9vdGgpO1xuXG5cdHJldHVybiB7IG1lc2g6IG5leHRNZXNoLCBuZXdWZXJ0ZXhJbmRpY2VzLCBuZXdGYWNlSW5kaWNlcyB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VwYXJhdGVHZW9tZXRyeShtZXNoOiBNZXNoLCBmYWNlSW5kaWNlczogbnVtYmVyW10pOiB7XG5cdHJlbWFpbmluZ01lc2g6IE1lc2g7XG5cdHNlcGFyYXRlZE1lc2g6IE1lc2g7XG59IHtcblx0Y29uc3QgZmFjZVNldCA9IG5ldyBTZXQoZmFjZUluZGljZXMpO1xuXHRjb25zdCBzZXBGYWNlczogRmFjZVtdID0gW107XG5cdGNvbnN0IHNlcEZhY2VTbG90czogbnVtYmVyW10gPSBbXTtcblx0Y29uc3QgcmVtRmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRjb25zdCByZW1GYWNlU2xvdHM6IG51bWJlcltdID0gW107XG5cblx0bWVzaC5mYWNlcy5mb3JFYWNoKChmLCBpZHgpID0+IHtcblx0XHRpZiAoZmFjZVNldC5oYXMoaWR4KSkge1xuXHRcdFx0c2VwRmFjZXMucHVzaChbLi4uZl0pO1xuXHRcdFx0c2VwRmFjZVNsb3RzLnB1c2gobWVzaC5mYWNlU2xvdD8uW2lkeF0gPz8gMCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbUZhY2VzLnB1c2goWy4uLmZdKTtcblx0XHRcdHJlbUZhY2VTbG90cy5wdXNoKG1lc2guZmFjZVNsb3Q/LltpZHhdID8/IDApO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uc3QgdXNlZFNlcCA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cdGNvbnN0IHNlcFZlcnRzOiBWZWMzW10gPSBbXTtcblx0Y29uc3QgY29tcGFjdFNlcFJlbWFwID0gKGlkeDogbnVtYmVyKSA9PiB7XG5cdFx0aWYgKHVzZWRTZXAuaGFzKGlkeCkpIHJldHVybiB1c2VkU2VwLmdldChpZHgpITtcblx0XHRjb25zdCBuID0gc2VwVmVydHMubGVuZ3RoO1xuXHRcdHNlcFZlcnRzLnB1c2gobWVzaC52ZXJ0aWNlc1tpZHhdKTtcblx0XHR1c2VkU2VwLnNldChpZHgsIG4pO1xuXHRcdHJldHVybiBuO1xuXHR9O1xuXHRjb25zdCBmaW5hbFNlcEZhY2VzID0gc2VwRmFjZXMubWFwKChmKSA9PiBmLm1hcChjb21wYWN0U2VwUmVtYXApKTtcblx0Y29uc3Qgc2VwYXJhdGVkTWVzaCA9IGZpbmFsaXplTWVzaCh7XG5cdFx0dmVydGljZXM6IHNlcFZlcnRzLFxuXHRcdGZhY2VzOiBmaW5hbFNlcEZhY2VzLFxuXHRcdGVkZ2VzOiBbXSxcblx0XHRyYWRpdXM6IDAsXG5cdFx0c2xvdHM6IG1lc2guc2xvdHMgPz8gW10sXG5cdFx0ZmFjZVNsb3Q6IHNlcEZhY2VTbG90cyxcblx0fSwgbWVzaC5zbW9vdGgpO1xuXG5cdGNvbnN0IHVzZWRSZW0gPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRjb25zdCByZW1WZXJ0czogVmVjM1tdID0gW107XG5cdGNvbnN0IGNvbXBhY3RSZW1SZW1hcCA9IChpZHg6IG51bWJlcikgPT4ge1xuXHRcdGlmICh1c2VkUmVtLmhhcyhpZHgpKSByZXR1cm4gdXNlZFJlbS5nZXQoaWR4KSE7XG5cdFx0Y29uc3QgbiA9IHJlbVZlcnRzLmxlbmd0aDtcblx0XHRyZW1WZXJ0cy5wdXNoKG1lc2gudmVydGljZXNbaWR4XSk7XG5cdFx0dXNlZFJlbS5zZXQoaWR4LCBuKTtcblx0XHRyZXR1cm4gbjtcblx0fTtcblx0Y29uc3QgZmluYWxSZW1GYWNlcyA9IHJlbUZhY2VzLm1hcCgoZikgPT4gZi5tYXAoY29tcGFjdFJlbVJlbWFwKSk7XG5cdGNvbnN0IHJlbWFpbmluZ01lc2ggPSBmaW5hbGl6ZU1lc2goe1xuXHRcdHZlcnRpY2VzOiByZW1WZXJ0cyxcblx0XHRmYWNlczogZmluYWxSZW1GYWNlcyxcblx0XHRlZGdlczogW10sXG5cdFx0cmFkaXVzOiAwLFxuXHRcdHNsb3RzOiBtZXNoLnNsb3RzID8/IFtdLFxuXHRcdGZhY2VTbG90OiByZW1GYWNlU2xvdHMsXG5cdH0sIG1lc2guc21vb3RoKTtcblxuXHRyZXR1cm4geyByZW1haW5pbmdNZXNoLCBzZXBhcmF0ZWRNZXNoIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaXJyb3JNZXNoKG1lc2g6IE1lc2gsIGF4aXM6ICd4JyB8ICd5JyB8ICd6Jywgd2VsZFRocmVzaG9sZCA9IDAuMDAxKTogTWVzaCB7XG5cdGNvbnN0IGF4aXNJZHggPSBheGlzID09PSAneCcgPyAwIDogYXhpcyA9PT0gJ3knID8gMSA6IDI7XG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBtZXNoLnZlcnRpY2VzLm1hcCgodikgPT4gW3ZbMF0sIHZbMV0sIHZbMl1dIGFzIFZlYzMpO1xuXHRjb25zdCBmYWNlczogRmFjZVtdID0gbWVzaC5mYWNlcy5tYXAoKGYpID0+IFsuLi5mXSk7XG5cdGNvbnN0IGZhY2VTbG90czogbnVtYmVyW10gPSBbLi4uKG1lc2guZmFjZVNsb3QgPz8gW10pXTtcblxuXHRjb25zdCB2UmVtYXAgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRtZXNoLnZlcnRpY2VzLmZvckVhY2goKHYsIGlkeCkgPT4ge1xuXHRcdGlmIChNYXRoLmFicyh2W2F4aXNJZHhdKSA8PSB3ZWxkVGhyZXNob2xkKSB7XG5cdFx0XHR2UmVtYXAuc2V0KGlkeCwgaWR4KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgblZpID0gdmVydGljZXMubGVuZ3RoO1xuXHRcdFx0Y29uc3QgbWlycm9yZWQ6IFZlYzMgPSBbdlswXSwgdlsxXSwgdlsyXV07XG5cdFx0XHRtaXJyb3JlZFtheGlzSWR4XSA9IC1taXJyb3JlZFtheGlzSWR4XTtcblx0XHRcdHZlcnRpY2VzLnB1c2gobWlycm9yZWQpO1xuXHRcdFx0dlJlbWFwLnNldChpZHgsIG5WaSk7XG5cdFx0fVxuXHR9KTtcblxuXHRtZXNoLmZhY2VzLmZvckVhY2goKGYsIGlkeCkgPT4ge1xuXHRcdGNvbnN0IG1pcnJvcmVkRmFjZSA9IGYubWFwKCh2aSkgPT4gdlJlbWFwLmdldCh2aSkhKS5yZXZlcnNlKCk7XG5cdFx0ZmFjZXMucHVzaChtaXJyb3JlZEZhY2UpO1xuXHRcdGZhY2VTbG90cy5wdXNoKG1lc2guZmFjZVNsb3Q/LltpZHhdID8/IDApO1xuXHR9KTtcblxuXHRyZXR1cm4gZmluYWxpemVNZXNoKHtcblx0XHR2ZXJ0aWNlcyxcblx0XHRmYWNlcyxcblx0XHRlZGdlczogW10sXG5cdFx0cmFkaXVzOiAwLFxuXHRcdHNsb3RzOiBtZXNoLnNsb3RzID8/IFtdLFxuXHRcdGZhY2VTbG90OiBmYWNlU2xvdHMsXG5cdH0sIG1lc2guc21vb3RoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY2ltYXRlTWVzaChtZXNoOiBNZXNoLCByYXRpbyA9IDAuNSk6IE1lc2gge1xuXHRjb25zdCB0YXJnZXRGYWNlcyA9IE1hdGgubWF4KDQsIE1hdGguZmxvb3IobWVzaC5mYWNlcy5sZW5ndGggKiBNYXRoLm1heCgwLjA1LCBNYXRoLm1pbigxLCByYXRpbykpKSk7XG5cdGlmIChtZXNoLmZhY2VzLmxlbmd0aCA8PSB0YXJnZXRGYWNlcykgcmV0dXJuIG1lc2g7XG5cblx0bGV0IGN1cnJlbnRNZXNoID0gbWVzaDtcblx0bGV0IGF0dGVtcHRzID0gMDtcblx0d2hpbGUgKChjdXJyZW50TWVzaC5mYWNlcy5sZW5ndGggPiB0YXJnZXRGYWNlcyB8fCBjdXJyZW50TWVzaC52ZXJ0aWNlcy5sZW5ndGggPiB0YXJnZXRGYWNlcyArIDIpICYmIGF0dGVtcHRzIDwgMTAwKSB7XG5cdFx0YXR0ZW1wdHMrKztcblx0XHRsZXQgc2hvcnRlc3RMZW4gPSBJbmZpbml0eTtcblx0XHRsZXQgYmVzdEVkZ2U6IFtudW1iZXIsIG51bWJlcl0gfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGNvbnN0IGVkZ2Ugb2YgY3VycmVudE1lc2guZWRnZXMpIHtcblx0XHRcdGNvbnN0IHYwID0gY3VycmVudE1lc2gudmVydGljZXNbZWRnZVswXV07XG5cdFx0XHRjb25zdCB2MSA9IGN1cnJlbnRNZXNoLnZlcnRpY2VzW2VkZ2VbMV1dO1xuXHRcdFx0aWYgKCF2MCB8fCAhdjEpIGNvbnRpbnVlO1xuXHRcdFx0Y29uc3QgZGlzdCA9IE1hdGguaHlwb3QodjBbMF0gLSB2MVswXSwgdjBbMV0gLSB2MVsxXSwgdjBbMl0gLSB2MVsyXSk7XG5cdFx0XHRpZiAoZGlzdCA8IHNob3J0ZXN0TGVuKSB7XG5cdFx0XHRcdHNob3J0ZXN0TGVuID0gZGlzdDtcblx0XHRcdFx0YmVzdEVkZ2UgPSBlZGdlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWJlc3RFZGdlKSBicmVhaztcblxuXHRcdGNvbnN0IG5leHQgPSBtZXJnZVZlcnRpY2VzKGN1cnJlbnRNZXNoLCBbYmVzdEVkZ2VbMF0sIGJlc3RFZGdlWzFdXSwgJ2NlbnRlcicpO1xuXHRcdGlmIChuZXh0LnZlcnRpY2VzLmxlbmd0aCA+PSBjdXJyZW50TWVzaC52ZXJ0aWNlcy5sZW5ndGgpIGJyZWFrO1xuXHRcdGN1cnJlbnRNZXNoID0gbmV4dDtcblx0fVxuXHRyZXR1cm4gY3VycmVudE1lc2g7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzY3Jld1NwaW5NZXNoKFxuXHRtZXNoOiBNZXNoLFxuXHRheGlzOiAneCcgfCAneScgfCAneicgPSAneicsXG5cdGFuZ2xlRGVnID0gMzYwLFxuXHRzdGVwcyA9IDE2LFxuXHRzY3Jld1BpdGNoID0gMFxuKTogTWVzaCB7XG5cdGlmICghbWVzaC52ZXJ0aWNlcy5sZW5ndGgpIHJldHVybiBtZXNoO1xuXHRjb25zdCBhbmdsZVJhZCA9IChhbmdsZURlZyAqIE1hdGguUEkpIC8gMTgwO1xuXHRjb25zdCB0b3RhbFN0ZXBzID0gTWF0aC5tYXgoMywgc3RlcHMpO1xuXG5cdGNvbnN0IGJhc2VWZXJ0cyA9IG1lc2gudmVydGljZXMubWFwKCh2KSA9PiBbdlswXSwgdlsxXSwgdlsyXV0gYXMgVmVjMyk7XG5cdGNvbnN0IG51bUJhc2UgPSBiYXNlVmVydHMubGVuZ3RoO1xuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gW107XG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXTtcblx0Y29uc3QgZmFjZVNsb3RzOiBudW1iZXJbXSA9IFtdO1xuXG5cdGZvciAobGV0IHMgPSAwOyBzIDw9IHRvdGFsU3RlcHM7IHMrKykge1xuXHRcdGNvbnN0IGZyYWMgPSBzIC8gdG90YWxTdGVwcztcblx0XHRjb25zdCBhID0gZnJhYyAqIGFuZ2xlUmFkO1xuXHRcdGNvbnN0IHBpdGNoT2Zmc2V0ID0gZnJhYyAqIHNjcmV3UGl0Y2g7XG5cdFx0Y29uc3QgY29zQSA9IE1hdGguY29zKGEpO1xuXHRcdGNvbnN0IHNpbkEgPSBNYXRoLnNpbihhKTtcblxuXHRcdGZvciAobGV0IHZpID0gMDsgdmkgPCBudW1CYXNlOyB2aSsrKSB7XG5cdFx0XHRjb25zdCBwID0gYmFzZVZlcnRzW3ZpXTtcblx0XHRcdGxldCB4ID0gcFswXSwgeSA9IHBbMV0sIHogPSBwWzJdO1xuXHRcdFx0aWYgKGF4aXMgPT09ICd6Jykge1xuXHRcdFx0XHRjb25zdCBueCA9IHggKiBjb3NBIC0geSAqIHNpbkE7XG5cdFx0XHRcdGNvbnN0IG55ID0geCAqIHNpbkEgKyB5ICogY29zQTtcblx0XHRcdFx0dmVydGljZXMucHVzaChbbngsIG55LCB6ICsgcGl0Y2hPZmZzZXRdKTtcblx0XHRcdH0gZWxzZSBpZiAoYXhpcyA9PT0gJ3knKSB7XG5cdFx0XHRcdGNvbnN0IG54ID0geCAqIGNvc0EgKyB6ICogc2luQTtcblx0XHRcdFx0Y29uc3QgbnogPSAteCAqIHNpbkEgKyB6ICogY29zQTtcblx0XHRcdFx0dmVydGljZXMucHVzaChbbngsIHkgKyBwaXRjaE9mZnNldCwgbnpdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG55ID0geSAqIGNvc0EgLSB6ICogc2luQTtcblx0XHRcdFx0Y29uc3QgbnogPSB5ICogc2luQSArIHogKiBjb3NBO1xuXHRcdFx0XHR2ZXJ0aWNlcy5wdXNoKFt4ICsgcGl0Y2hPZmZzZXQsIG55LCBuel0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZvciAobGV0IHMgPSAwOyBzIDwgdG90YWxTdGVwczsgcysrKSB7XG5cdFx0Y29uc3QgcmluZ0EgPSBzICogbnVtQmFzZTtcblx0XHRjb25zdCByaW5nQiA9IChzICsgMSkgKiBudW1CYXNlO1xuXHRcdGZvciAoY29uc3QgZWRnZSBvZiBtZXNoLmVkZ2VzKSB7XG5cdFx0XHRjb25zdCBhID0gcmluZ0EgKyBlZGdlWzBdO1xuXHRcdFx0Y29uc3QgYiA9IHJpbmdBICsgZWRnZVsxXTtcblx0XHRcdGNvbnN0IGMgPSByaW5nQiArIGVkZ2VbMV07XG5cdFx0XHRjb25zdCBkID0gcmluZ0IgKyBlZGdlWzBdO1xuXHRcdFx0ZmFjZXMucHVzaChbYSwgYiwgYywgZF0pO1xuXHRcdFx0ZmFjZVNsb3RzLnB1c2goMCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZpbmFsaXplTWVzaCh7XG5cdFx0dmVydGljZXMsXG5cdFx0ZmFjZXMsXG5cdFx0ZWRnZXM6IFtdLFxuXHRcdHJhZGl1czogMCxcblx0XHRzbG90czogbWVzaC5zbG90cyA/PyBbXSxcblx0XHRmYWNlU2xvdDogZmFjZVNsb3RzLFxuXHR9LCBtZXNoLnNtb290aCk7XG59XG5cbmZ1bmN0aW9uIHJheVRyaUludGVyc2VjdGlvbihvcmlnOiBWZWMzLCBkaXI6IFZlYzMsIHYwOiBWZWMzLCB2MTogVmVjMywgdjI6IFZlYzMpOiBib29sZWFuIHtcblx0Y29uc3QgZTE6IFZlYzMgPSBbdjFbMF0gLSB2MFswXSwgdjFbMV0gLSB2MFsxXSwgdjFbMl0gLSB2MFsyXV07XG5cdGNvbnN0IGUyOiBWZWMzID0gW3YyWzBdIC0gdjBbMF0sIHYyWzFdIC0gdjBbMV0sIHYyWzJdIC0gdjBbMl1dO1xuXHRjb25zdCBoOiBWZWMzID0gW2RpclsxXSAqIGUyWzJdIC0gZGlyWzJdICogZTJbMV0sIGRpclsyXSAqIGUyWzBdIC0gZGlyWzBdICogZTJbMl0sIGRpclswXSAqIGUyWzFdIC0gZGlyWzFdICogZTJbMF1dO1xuXHRjb25zdCBhID0gZTFbMF0gKiBoWzBdICsgZTFbMV0gKiBoWzFdICsgZTFbMl0gKiBoWzJdO1xuXHRpZiAoTWF0aC5hYnMoYSkgPCAxZS02KSByZXR1cm4gZmFsc2U7XG5cdGNvbnN0IGZJbnYgPSAxLjAgLyBhO1xuXHRjb25zdCBzOiBWZWMzID0gW29yaWdbMF0gLSB2MFswXSwgb3JpZ1sxXSAtIHYwWzFdLCBvcmlnWzJdIC0gdjBbMl1dO1xuXHRjb25zdCB1ID0gZkludiAqIChzWzBdICogaFswXSArIHNbMV0gKiBoWzFdICsgc1syXSAqIGhbMl0pO1xuXHRpZiAodSA8IDAuMCB8fCB1ID4gMS4wKSByZXR1cm4gZmFsc2U7XG5cdGNvbnN0IHE6IFZlYzMgPSBbc1sxXSAqIGUxWzJdIC0gc1syXSAqIGUxWzFdLCBzWzJdICogZTFbMF0gLSBzWzBdICogZTFbMl0sIHNbMF0gKiBlMVsxXSAtIHNbMV0gKiBlMVswXV07XG5cdGNvbnN0IHYgPSBmSW52ICogKGRpclswXSAqIHFbMF0gKyBkaXJbMV0gKiBxWzFdICsgZGlyWzJdICogcVsyXSk7XG5cdGlmICh2IDwgMC4wIHx8IHUgKyB2ID4gMS4wKSByZXR1cm4gZmFsc2U7XG5cdGNvbnN0IHQgPSBmSW52ICogKGUyWzBdICogcVswXSArIGUyWzFdICogcVsxXSArIGUyWzJdICogcVsyXSk7XG5cdHJldHVybiB0ID4gMWUtNTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUG9pbnRJbnNpZGVNZXNoKHB0OiBWZWMzLCBtZXNoOiBNZXNoKTogYm9vbGVhbiB7XG5cdGNvbnN0IGRpcjogVmVjMyA9IFswLjkwNCwgMC4yMDgsIDAuMzczXTtcblx0bGV0IGhpdHMgPSAwO1xuXHRmb3IgKGNvbnN0IGYgb2YgbWVzaC5mYWNlcykge1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZi5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdGlmIChyYXlUcmlJbnRlcnNlY3Rpb24ocHQsIGRpciwgbWVzaC52ZXJ0aWNlc1tmWzBdXSwgbWVzaC52ZXJ0aWNlc1tmW2ldXSwgbWVzaC52ZXJ0aWNlc1tmW2kgKyAxXV0pKSB7XG5cdFx0XHRcdGhpdHMrKztcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIChoaXRzICUgMikgPT09IDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBib29sZWFuTWVzaChcblx0bWVzaEE6IE1lc2gsXG5cdG1lc2hCOiBNZXNoLFxuXHRvcDogJ3VuaW9uJyB8ICdkaWZmZXJlbmNlJyB8ICdpbnRlcnNlY3QnID0gJ2RpZmZlcmVuY2UnXG4pOiBNZXNoIHtcblx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRjb25zdCBmYWNlU2xvdHM6IG51bWJlcltdID0gW107XG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBtZXNoQS52ZXJ0aWNlcy5tYXAoKHYpID0+IFt2WzBdLCB2WzFdLCB2WzJdXSBhcyBWZWMzKTtcblx0Y29uc3QgYlZlcnRTdGFydCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0bWVzaEIudmVydGljZXMuZm9yRWFjaCgodikgPT4gdmVydGljZXMucHVzaChbdlswXSwgdlsxXSwgdlsyXV0gYXMgVmVjMykpO1xuXG5cdG1lc2hBLmZhY2VzLmZvckVhY2goKGYsIGlkeCkgPT4ge1xuXHRcdGNvbnN0IGMgPSBmYWNlQ2VudGVyKG1lc2hBLCBmKTtcblx0XHRjb25zdCBpbnNpZGUgPSBpc1BvaW50SW5zaWRlTWVzaChjLCBtZXNoQik7XG5cdFx0aWYgKG9wID09PSAndW5pb24nICYmICFpbnNpZGUpIHtcblx0XHRcdGZhY2VzLnB1c2goWy4uLmZdKTtcblx0XHRcdGZhY2VTbG90cy5wdXNoKG1lc2hBLmZhY2VTbG90Py5baWR4XSA/PyAwKTtcblx0XHR9IGVsc2UgaWYgKG9wID09PSAnZGlmZmVyZW5jZScgJiYgIWluc2lkZSkge1xuXHRcdFx0ZmFjZXMucHVzaChbLi4uZl0pO1xuXHRcdFx0ZmFjZVNsb3RzLnB1c2gobWVzaEEuZmFjZVNsb3Q/LltpZHhdID8/IDApO1xuXHRcdH0gZWxzZSBpZiAob3AgPT09ICdpbnRlcnNlY3QnICYmIGluc2lkZSkge1xuXHRcdFx0ZmFjZXMucHVzaChbLi4uZl0pO1xuXHRcdFx0ZmFjZVNsb3RzLnB1c2gobWVzaEEuZmFjZVNsb3Q/LltpZHhdID8/IDApO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uc3Qgc2xvdE9mZnNldEIgPSAobWVzaEEuc2xvdHMgPz8gW10pLmxlbmd0aDtcblx0bWVzaEIuZmFjZXMuZm9yRWFjaCgoZiwgaWR4KSA9PiB7XG5cdFx0Y29uc3QgYyA9IGZhY2VDZW50ZXIobWVzaEIsIGYpO1xuXHRcdGNvbnN0IGluc2lkZSA9IGlzUG9pbnRJbnNpZGVNZXNoKGMsIG1lc2hBKTtcblx0XHRjb25zdCBtYXBwZWQgPSBmLm1hcCgodikgPT4gdiArIGJWZXJ0U3RhcnQpO1xuXHRcdGNvbnN0IGJTbG90ID0gKG1lc2hCLmZhY2VTbG90Py5baWR4XSA/PyAwKSArIHNsb3RPZmZzZXRCO1xuXHRcdGlmIChvcCA9PT0gJ3VuaW9uJyAmJiAhaW5zaWRlKSB7XG5cdFx0XHRmYWNlcy5wdXNoKG1hcHBlZCk7XG5cdFx0XHRmYWNlU2xvdHMucHVzaChiU2xvdCk7XG5cdFx0fSBlbHNlIGlmIChvcCA9PT0gJ2RpZmZlcmVuY2UnICYmIGluc2lkZSkge1xuXHRcdFx0ZmFjZXMucHVzaChbLi4ubWFwcGVkXS5yZXZlcnNlKCkpO1xuXHRcdFx0ZmFjZVNsb3RzLnB1c2goYlNsb3QpO1xuXHRcdH0gZWxzZSBpZiAob3AgPT09ICdpbnRlcnNlY3QnICYmIGluc2lkZSkge1xuXHRcdFx0ZmFjZXMucHVzaChtYXBwZWQpO1xuXHRcdFx0ZmFjZVNsb3RzLnB1c2goYlNsb3QpO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIGZpbmFsaXplTWVzaCh7XG5cdFx0dmVydGljZXMsXG5cdFx0ZmFjZXMsXG5cdFx0ZWRnZXM6IFtdLFxuXHRcdHJhZGl1czogMCxcblx0XHRzbG90czogWy4uLihtZXNoQS5zbG90cyA/PyBbXSksIC4uLihtZXNoQi5zbG90cyA/PyBbXSldLFxuXHRcdGZhY2VTbG90OiBmYWNlU2xvdHMsXG5cdH0sIG1lc2hBLnNtb290aCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqb2luTWVzaGVzKGl0ZW1zOiB7IG1lc2g6IE1lc2g7IHBvc2l0aW9uPzogVmVjMzsgcm90YXRpb24/OiBWZWMzOyBzY2FsZT86IFZlYzMgfVtdKTogTWVzaCB7XG5cdGlmICghaXRlbXMubGVuZ3RoKSByZXR1cm4gY3ViZU1lc2goKTtcblx0Y29uc3QgdmVydGljZXM6IFZlYzNbXSA9IFtdO1xuXHRjb25zdCBmYWNlczogRmFjZVtdID0gW107XG5cdGNvbnN0IGZhY2VTbG90czogbnVtYmVyW10gPSBbXTtcblx0Y29uc3Qgc2xvdHM6IE1hdGVyaWFsU2xvdFtdID0gW107XG5cblx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0Y29uc3QgbSA9IGl0ZW0ubWVzaDtcblx0XHRjb25zdCBvZmZzZXQgPSB2ZXJ0aWNlcy5sZW5ndGg7XG5cdFx0Y29uc3Qgc2xvdE9mZnNldCA9IHNsb3RzLmxlbmd0aDtcblx0XHRjb25zdCBwb3MgPSBpdGVtLnBvc2l0aW9uID8/IFswLCAwLCAwXTtcblx0XHRjb25zdCBzY2wgPSBpdGVtLnNjYWxlID8/IFsxLCAxLCAxXTtcblxuXHRcdGZvciAoY29uc3QgdiBvZiBtLnZlcnRpY2VzKSB7XG5cdFx0XHR2ZXJ0aWNlcy5wdXNoKFtcblx0XHRcdFx0dlswXSAqIHNjbFswXSArIHBvc1swXSxcblx0XHRcdFx0dlsxXSAqIHNjbFsxXSArIHBvc1sxXSxcblx0XHRcdFx0dlsyXSAqIHNjbFsyXSArIHBvc1syXSxcblx0XHRcdF0pO1xuXHRcdH1cblx0XHRmb3IgKGxldCBmaSA9IDA7IGZpIDwgbS5mYWNlcy5sZW5ndGg7IGZpKyspIHtcblx0XHRcdGZhY2VzLnB1c2gobS5mYWNlc1tmaV0ubWFwKCh2aSkgPT4gdmkgKyBvZmZzZXQpKTtcblx0XHRcdGZhY2VTbG90cy5wdXNoKChtLmZhY2VTbG90Py5bZmldID8/IDApICsgc2xvdE9mZnNldCk7XG5cdFx0fVxuXHRcdGlmIChtLnNsb3RzICYmIG0uc2xvdHMubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHMgb2YgbS5zbG90cykgc2xvdHMucHVzaCh7IC4uLnMgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNsb3RzLnB1c2goZGVmYXVsdE1hdGVyaWFsU2xvdCgpKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmluYWxpemVNZXNoKHtcblx0XHR2ZXJ0aWNlcyxcblx0XHRmYWNlcyxcblx0XHRlZGdlczogW10sXG5cdFx0cmFkaXVzOiAwLFxuXHRcdHNsb3RzLFxuXHRcdGZhY2VTbG90OiBmYWNlU2xvdHMsXG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjaW1hdGVMb2NhbChtZXNoOiBNZXNoLCBjZW50ZXI6IFZlYzMsIHJhZGl1czogbnVtYmVyKTogTWVzaCB7XG5cdGNvbnN0IHIyID0gcmFkaXVzICogcmFkaXVzO1xuXHRjb25zdCBjYW5kaWRhdGVzOiBbbnVtYmVyLCBudW1iZXJdW10gPSBbXTtcblx0Zm9yIChjb25zdCBbYSwgYl0gb2YgbWVzaC5lZGdlcykge1xuXHRcdGNvbnN0IHZhID0gbWVzaC52ZXJ0aWNlc1thXTtcblx0XHRjb25zdCB2YiA9IG1lc2gudmVydGljZXNbYl07XG5cdFx0aWYgKCF2YSB8fCAhdmIpIGNvbnRpbnVlO1xuXHRcdGlmIChtZXNoLm1hc2sgJiYgKChtZXNoLm1hc2tbYV0gPz8gMCkgPj0gMC45NSB8fCAobWVzaC5tYXNrW2JdID8/IDApID49IDAuOTUpKSBjb250aW51ZTtcblx0XHRjb25zdCBkYSA9ICh2YVswXSAtIGNlbnRlclswXSkgKiogMiArICh2YVsxXSAtIGNlbnRlclsxXSkgKiogMiArICh2YVsyXSAtIGNlbnRlclsyXSkgKiogMjtcblx0XHRjb25zdCBkYiA9ICh2YlswXSAtIGNlbnRlclswXSkgKiogMiArICh2YlsxXSAtIGNlbnRlclsxXSkgKiogMiArICh2YlsyXSAtIGNlbnRlclsyXSkgKiogMjtcblx0XHRpZiAoZGEgPD0gcjIgJiYgZGIgPD0gcjIpIGNhbmRpZGF0ZXMucHVzaChbYSwgYl0pO1xuXHR9XG5cdGlmICghY2FuZGlkYXRlcy5sZW5ndGgpIHJldHVybiBtZXNoO1xuXHRjYW5kaWRhdGVzLnNvcnQoKGUxLCBlMikgPT4ge1xuXHRcdGNvbnN0IGExID0gbWVzaC52ZXJ0aWNlc1tlMVswXV0sIGIxID0gbWVzaC52ZXJ0aWNlc1tlMVsxXV07XG5cdFx0Y29uc3QgYTIgPSBtZXNoLnZlcnRpY2VzW2UyWzBdXSwgYjIgPSBtZXNoLnZlcnRpY2VzW2UyWzFdXTtcblx0XHRyZXR1cm4gTWF0aC5oeXBvdChhMVswXSAtIGIxWzBdLCBhMVsxXSAtIGIxWzFdLCBhMVsyXSAtIGIxWzJdKSAtIE1hdGguaHlwb3QoYTJbMF0gLSBiMlswXSwgYTJbMV0gLSBiMlsxXSwgYTJbMl0gLSBiMlsyXSk7XG5cdH0pO1xuXHRsZXQgY3VycmVudCA9IG1lc2g7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oMywgY2FuZGlkYXRlcy5sZW5ndGgpOyBpKyspIHtcblx0XHRjb25zdCBwYWlyID0gY2FuZGlkYXRlc1tpXTtcblx0XHRpZiAocGFpclswXSA+PSBjdXJyZW50LnZlcnRpY2VzLmxlbmd0aCB8fCBwYWlyWzFdID49IGN1cnJlbnQudmVydGljZXMubGVuZ3RoKSBjb250aW51ZTtcblx0XHRjb25zdCBuZXh0ID0gbWVyZ2VWZXJ0aWNlcyhjdXJyZW50LCBbcGFpclswXSwgcGFpclsxXV0sICdjZW50ZXInKTtcblx0XHRpZiAobmV4dC52ZXJ0aWNlcy5sZW5ndGggPCBjdXJyZW50LnZlcnRpY2VzLmxlbmd0aCkgY3VycmVudCA9IG5leHQ7XG5cdH1cblx0cmV0dXJuIGN1cnJlbnQ7XG59XG4iXSwibWFwcGluZ3MiOiJBQW1EQSxPQUFPLFNBQVMsbUJBQW1CLENBQUMsSUFBSSxHQUFHLFVBQVUsRUFBZ0I7RUFDcEUsT0FBTztJQUNOLElBQUk7SUFDSixLQUFLLEVBQUUsU0FBUztJQUNoQixRQUFRLEVBQUUsU0FBUztJQUNuQixnQkFBZ0IsRUFBRSxDQUFDO0lBQ25CLFNBQVMsRUFBRSxJQUFJO0lBQ2YsU0FBUyxFQUFFLElBQUk7SUFDZixPQUFPLEVBQUUsQ0FBQztJQUNWLFFBQVEsRUFBRTtFQUNYLENBQUM7QUFDRjtBQUVBLE9BQU8sU0FBUyxpQkFBaUIsQ0FBQyxJQUFrQixFQUFnQjtFQUNuRSxPQUFPO0lBQUUsR0FBRztFQUFLLENBQUM7QUFDbkI7QUFFQSxPQUFPLFNBQVMsU0FBUyxDQUFDLElBQVUsRUFBUTtFQUMzQyxPQUFPO0lBQ04sUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFFLENBQUMsSUFBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFTLENBQUM7SUFDOUQsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFFLENBQUMsSUFBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDcEMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFFLENBQUMsSUFBSyxDQUFDLENB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QUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7TUFDekMsS0FBSyxNQUFNLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFO1FBQ3BELE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBQzlCLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBUyxDQUFDO1FBQ3pDLElBQUksT0FBTyxFQUFFO1VBQ1osTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7VUFDckMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFTLENBQUM7UUFDN0M7UUFDQSxJQUFJLE1BQU0sRUFBRTtVQUNYLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRztNQUNEO01BQ0EsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQztNQUN0QyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FB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Q3JDO0VBQ0EsSUFBSSxFQUFFLEdBQUcsQ0FBQztJQUFFLEVBQUUsR0FBRyxDQUFDO0lBQUUsRUFBRSxHQUFHLENBQUM7RUFDMUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDckMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN2RCxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0MsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9DLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUNoRDtFQUNBLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDO0VBQ3ZDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsR0FBRyxFQUFFLEVBQUUsR0FBRyxHQUFHLEVBQUUsRUFBRSxHQUFHLEdBQUcsQ0FBQztBQUN0QztBQUVBLE9BQU8sU0FBUyxVQUFVLENBQUMsSUFBVSxFQUFFLElBQVUsRUFBUTtFQUN4RCxJ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LEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFDZixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUNkLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUNiLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQ2QsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDZCxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDYixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQ1osQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQ2I7RUFDRCxNQUFNLEtBQUssR0FBRyxDQUNiLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUNaO0VBQ0QsT0FBTyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7QUFDckM7QUFFQSxPQUFPLFNBQVMsVUFBVSxDQUFDLFFBQVEsR0FBRyxFQUFFLEVBQUUsS0FBSyxHQUFHLEVBQUUsRUFBRSxNQUFNLEdBQUcsR0FBRyxFQUFRO0VBQ3pFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7RUFDOUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztFQUMzQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUM7RUFDbEMsTUFBTSxRQUFnQixHQUFHLEVBQUU7RUFDM0IsTUFBTSxPQUFlLEdBQUcsRUFBRTs7RUFFMUI7RUFDQSxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztFQUMxQixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQzs7RUFFdkI7RUFDQSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQzlCLE1BQU0sR0FBRyxHQUFJLENBQUMsR0FBRyxJQUFJLEdBQUksSUFBSSxDQUFDLEVBQUU7SUFDaEMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7SUFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7SUFDNUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtNQUM5QixNQUFNLEtBQUssR0FBSSxDQUFDLEdBQUcsSUFBSSxHQUFJLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQztNQUN0QyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLE1BQU07TUFDbkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFNO01BQ25DLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEdBQUcsR0FBRyxFQUFFLEVBQUUsR0FBRyxHQUFH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Q0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0VBQ3JFO0VBQ0EsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUM5QixNQUFNLEtBQUssR0FBSSxDQUFDLEdBQUcsSUFBSSxHQUFJLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUN0QyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7RUFDcEU7RUFDQSxJQUFJLFdBQVcsR0FBRyxDQUFDLEVBQUU7SUFDcEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtNQUM5QixNQUFNLEtBQUssR0FBSSxDQUFDLEdBQUcsSUFBSSxHQUFJLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQztNQUN0QyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxXQUFXLENBQUMsQ0FBQztJQUNyRjtJQUNBLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7TUFDOUIsTUFBTSxLQUFLLEdBQUksQ0FBQyxHQUFHLElBQUksR0FBSSxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUM7TUFDdEMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsV0FBVyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLFdBQVcsQ0FBQyxDQUFDO0lBQ3BGO0VBQ0Q7RUFDQSxNQUFNLEtBQWEsR0FBRyxFQUFFO0VBQ3hCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDOUIsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUk7SUFDM0IsSUFBSSxXQUFXLEdBQUcsQ0FBQyxFQUFFO01BQ3BCLE1BQU0sRUFBRSxHQUFHLElBQUksR0FBRyxDQUFDO01BQ25CLE1BQU0sRUFBRSxHQUFHLElBQUksR0FBRyxDQUFDO01BQ25CO01BQ0EsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7TUFDNUM7TUFDQSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLEdBQUcsSUFBSSxFQUFFLEVBQUUsR0FBRyxJQUFJLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO01BQ2xEO01BQ0EsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxHQUFHLElBQUksRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7TUFDeEM7TUFDQSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsR0FBRyxJQUFJLEVBQUUsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQ3ZELENBQUMsTUFBTTtNQUNOO01BQ0EsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN0M7RUFDRDtFQUNBLElBQUksV0FBVyxJQUFJLENBQUMsRUFBRTtJQUNyQixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO01BQUUsTUFBTSxFQUFFO0lBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDeEQsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztNQUFFLE1BQU0sRUFBRTtJQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssSUFBSSxJQUFJLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDekUsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDO0VBQ3hCO0VBQ0EsT0FBTyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUM7QUFDcEM7QUFFQSxPQUFPLFNBQVMsUUFBUSxDQUFDLFFBQVEsR0FBRyxFQUFFLEVBQUUsTUFBTSxHQUFHLEdBQUcsRUFBRSxNQUFNLEdBQUcsQ0FBQyxFQUFRO0VBQ3ZFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7RUFDOUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDO0VBQ2xDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxHQUFHLEdBQUc7RUFDekMsTUFBTSxRQUFnQixHQUFHLEVBQUU7RUFDM0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUM5QixNQUFNLEtBQUssR0FBSSxDQUFDLEdBQUcsSUFBSSxHQUFJLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUN0QyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMs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QUFDO0FBQ3hDO0FBRUEsT0FBTyxTQUFTLGFBQWEsQ0FBQyxZQUFZLEdBQUcsQ0FBQyxFQUFFLE1BQU0sR0FBRyxHQUFHLEVBQVE7RUFDbkUsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0VBQ2xDLE1BQU0sU0FBaUIsR0FBRyxDQUN6QixDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFDdEQsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQ3RELENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUN0RDtFQUNELE1BQU0sS0FBSyxHQUFHLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0VBQy9DLElBQUksUUFBZ0IsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFTLENBQUM7RUFDN0YsSUFBSSxLQUFhLEdBQUcsQ0FDbkIsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDekQsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDekQsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDckQsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FDdkQ7RUFDRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7RUFDL0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUM5QixNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsQ0FBaUIsQ0FBQztJQUMxQyxNQUFNLE1BQU0sR0FBRyxDQUFDLEVBQVUsRUFBRSxFQUFVLEtBQWE7TUFDbEQsTUFBTSxHQUFHLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBSSxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBSyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUc7TUFDdkQsSUFBSSxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7TUFDL0MsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBQztNQUN2QixNQUFNLEVBQUUsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDO01BQ3ZCLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO01BQzlCLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO01BQzlCLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO01BQzlCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDO01BQ3ZDLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxNQUFNO01BQzNCLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBRSxFQUFFLEdBQUcsR0FBRyxHQUFJLE1BQU0sRUFBRyxFQUFFLEdBQUcsR0FBRyxHQUFJLE1BQU0sRUFBRyxFQUFFLEdBQUcsR0FBRyxHQUFJLE1BQU0sQ0FBQyxDQUFDO01BQzlFLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztNQUN0QixPQUFPLEdBQUc7SUFDWCxDQUFDO0lBQ0QsTUFBTSxTQUFpQixHQUFHLEVBQUU7SUFDNUIsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLEVBQUU7TUFDdEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDbEMsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7TUFDdkIsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7TUFDdkIsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7TUFDdkIsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDcEU7SUFDQSxLQUFLLEdBQUcsU0FBUztFQUNsQjtFQUNBLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJO0lBQ2pDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFD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QUUsRUFBRSxDQUFDLEVBQUUsRUFBRTtNQUM1QixNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7TUFDM0IsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7TUFDakIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQztNQUNyQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7TUFDakMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzdCO0VBQ0Q7RUFDQSxPQUFPLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQztBQUNyQztBQUVBLE9BQU8sU0FBUyxXQUFXLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsR0FBRyxFQUFFLE1BQU0sR0FBRyxDQUFDLEVBQVE7RUFDdEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztFQUMxQyxNQUFNLElBQUksR0FBRyxNQUFNLEdBQUcsQ0FBQztFQUN2QixNQUFNLFFBQWdCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7RUFDdkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUM3QixNQUFNLEtBQUssR0FBSSxDQUFDLEdBQUcsR0FBRyxHQUFJLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUNyQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztFQUMzRTtFQUNBLE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxNQUFNO0VBQ2xDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7RUFDNUIsTUFBTSxLQUFhLEdBQUcsRUFBRTtFQUN4QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQzdCLE1BQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDO0lBQ2xCLE1BQU0sSUFBSSxHQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUksQ0FBQztJQUNoQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztFQUM1QjtFQUNBLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDN0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUM7SUFDbEIsTUFBTSxJQUFJLEdBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsR0FBSSxDQUFDO0lBQ2hDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0VBQ3JDO0VBQ0EsT0FBTyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7QUFDckM7QUFFQSxPQUFPLFNBQVMsUUFBUSxDQUFDLFFBQVEsR0FBRyxFQUFFLEVBQUUsV0FBVyxHQUFHLEdBQUcsRUFBRSxXQUFXLEdBQUcsR0FBRyxFQUFFLE1BQU0sR0FBRyxDQUFDLEVBQVE7RUFDL0YsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztFQUM5QyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxXQUFXLEdBQUcsSUFBSSxDQUFDLENBQUM7RUFDckUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxFQUFFLFdBQVcsQ0FBQztFQUM5QyxNQUFNLElBQUksR0FBRyxNQUFNLEdBQUcsQ0FBQztFQUN2QixNQUFNLFFBQWdCLEdBQUcsRUFBRTtFQUMzQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQzlCLE1BQU0sRUFBRSxHQUFJLENBQUMsR0FBRyxJQUFJLEdBQUksSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDO0lBQ25DLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztFQUNoRTtFQUNBLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDOUIsTUFBTSxFQUFFLEdBQUksQ0FBQyxHQUFHLElBQUksR0FBSSxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUM7SUFDbkMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7RUFDakU7RUFDQSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQzlCLE1BQU0sRUFBRSxHQUFJLENBQUMsR0FBRyxJQUFJLEdBQUksSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDO0lBQ25DLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztFQUM5RDtFQUNBLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDOUIsTUFBTSxFQUFFLEdBQUksQ0FBQyxHQUFHLElBQUksR0FBSSxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUM7SUFDbkMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7RUFDL0Q7RUFDQSxNQUFNLEtBQWEsR0FBRyxFQUFFO0VBQ3hCLE1BQU0sQ0FBQyxHQUFHLElBQUk7RUFDZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQzNCLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO0lBQ3ZCLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3BDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDNUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3BELEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0VBQzdEO0VBQ0EsT0FBTyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUM7QUFDcEM7QUFFQSxPQUFPLFNBQVMsV0FBVyxDQUFDLFFBQVEsR0FBRyxFQUFFLEVBQUUsS0FBSyxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsSUFBSSxFQUFFLE1BQU0sR0FBRyxHQUFHLEVBQVE7RUFDeEYsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztFQUM5QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0VBQzNDLE1BQU0sS0FBSyxHQUFHLE1BQU0sR0FBRyxDQUFDO0VBQ3hCLE1BQU0sUUFBZ0IsR0FBRyxFQUFFO0VBQzNCLE1BQU0sT0FBZSxHQUFHLEVBQUU7RUFDMUIsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUcsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0VBQ3JDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0VBQ3ZCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDL0IsTUFBTSxHQUFHLEdBQUksQ0FBQyxHQUFHLElBQUksSUFBSyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN0QyxNQUFNLENBQUMsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNO0lBQ3hDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTTtJQUNwQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO01BQzlCLE1BQU0sRUFBRSxHQUFJLENBQUMsR0FBRyxJQUFJLEdBQUksSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDO01BQ25DLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztNQUM5RCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDMUY7RUFDRDtFQUNBLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDOUIsTUFBTSxHQUFHLEdBQUksSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUssQ0FBQyxHQUFHLElBQUksSUFBSyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN0RCxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQU07SUFDekMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNO0lBQ3BDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7TUFDOUIsTUFBTSxFQUFFLEdBQUksQ0FBQyxHQUFHLElBQUksR0FBSSxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUM7TUFDbkMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO01BQzlELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUMxRjtFQUNEO0VBQ0EsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLE1BQU07RUFDakMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssR0FBRyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7RUFDdEMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztFQUV4QixNQUFNLEtBQWEsR0FBRyxFQUFFO0VBQ3hCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDOUIsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUk7SUFDMUIsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztFQUNoQztFQUNBLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0VBQzNCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQ3hDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSTtJQUN4QixNQUFNLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUk7SUFDakMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtNQUM5QixNQUFNLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSTtNQUMxQixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsQ0FBQyxFQUFFLE1BQU0sR0FBRyxHQUFHLEVBQUUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQzNEO0VBQ0Q7RUFDQSxNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxJQUFJLElBQUk7RUFDM0MsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUM5QixNQUFNLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSTtJQUMxQixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxFQUFFLE9BQU8sR0FBRyxHQUFHLEVBQUUsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDO0VBQ3BEO0VBQ0EsT0FBTyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDO0FBQzdDO0FBRUEsT0FBTyxTQUFTLGVBQWUsR0FBUztFQUN2QyxNQUFNLEtBQUssR0FBRyxFQUFFO0VBQ2hCLE1BQU0sSUFBSSxHQUFHLENBQUM7RUFDZCxNQUFNLENBQUMsR0FBRyxJQUFJO0VBQ2QsTUFBTSxRQUFnQixHQUFHLEVBQUU7RUFDM0IsTUFBTSxLQUFhLEdBQUcsRUFBRTtFQUN4QixNQUFNLEVBQVEsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztFQUNoQyxNQUFNLEVBQVEsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7RUFDakMsTUFBTSxFQUFRLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7RUFDbEMsTUFBTSxFQUFRLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztFQUM5QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQ2hDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLO0lBQ25CLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDO0lBQ2hCLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBQyxFQUFFLEdBQUMsRUFBRSxHQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUMsRUFBRSxHQUFDLEVBQUUsR0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBQyxFQUFFLEdBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxRSxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUMsRUFBRSxHQUFDLEVBQUUsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFDLEVBQUUsR0FBQyxFQUFFLEdBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUMsRUFBRSxHQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDMUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFDLEVBQUUsR0FBQyxFQUFFLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBQyxFQUFFLEdBQUMsRUFBRSxHQUFDLENBQUMsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFDLEVBQUUsR0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzFFLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBQyxFQUFFLEdBQUMsRUFBRSxJQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUMsRUFBRSxHQUFDLENBQUMsSUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLElBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RSxNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUMsRUFBRSxHQUFDLEVBQUUsSUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFDLEVBQUUsR0FBQyxDQUFDLElBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxJQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0UsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFDLEVBQUUsR0FBQyxFQUFFLElBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBQyxFQUFFLEdBQUMsQ0FBQyxJQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsSUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDO0lBQ3hDLE1BQU0sRUFBUSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDMUIsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFFLEVBQUUsR0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUUsRUFBRSxHQUFDLElBQUksQ0FBQztJQUMxQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUUsRUFBRSxHQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBRSxFQUFFLEdBQUMsSUFBSSxDQUFDO0lBQzFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBRSxFQUFFLEdBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFFLEVBQUUsR0FBQyxJQUFJLENBQUM7SUFDMUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUM7SUFDeEMsRUFBRSxJQUFJLElBQUk7SUFBRSxFQUFFLElBQUksSUFBSTtJQUFFLEVBQUUsSUFBSSxJQUFJO0lBQ2xDLE1BQU0sRUFBRSxHQUFJLEVBQUUsR0FBQyxJQUFJLEdBQUUsRUFBRSxHQUFJLEVBQUUsR0FBQyxJQUFJLEdBQUUsRUFBRTtJQUN0QyxNQUFNLEVBQUUsR0FBSSxFQUFFLEdBQUMsSUFBSSxHQUFFLEVBQUUsR0FBSSxFQUFFLEdBQUMsSUFBSSxHQUFFLEVBQUU7SUFDdEMsTUFBTSxFQUFFLEdBQUksRUFBRSxHQUFDLElBQUksR0FBRSxFQUFFLEdBQUksRUFBRSxHQUFDLElBQUksR0FBRSxFQUFFO0lBQ3RDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7TUFDOUIsTUFBTSxFQUFFLEdBQUksQ0FBQyxHQUFHLElBQUksR0FBSSxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUM7TUFDbkMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDO01BQzFCLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQztNQUMzQixRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUNyRjtFQUNEO0VBQ0EsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUMvQixNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcs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QUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQzlFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQzlFO0VBQ0QsTUFBTSxLQUFhLEdBQUcsQ0FDckIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQ2xGLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FDMUU7RUFDRCxPQUFPLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQztB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U0FBUyxXQUFXLEdBQVM7RUFDbkMsTUFBTSxLQUFhLEdBQUcsQ0FDckIsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFDOUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUcsSUFBSSxDQUFDLENBQzlFO0VBQ0QsTUFBTSxLQUFhLEdBQUcsQ0FDckIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQ2xGO0VBQ0QsT0FBTyxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7QUFDbEM7QUFFQSxPQUFPLFNBQVMsV0FBVyxHQUFTO0VBQ25DLE1BQU0sS0FBYSxHQUFHLENBQ3JCLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUN0RSxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFDdEUsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUN2QyxDQUFDLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQ25DLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQ3ZDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQ3ZDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQ3JDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUNyQyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUNuQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQ2pDO0VBQ0QsTUFBTSxLQUFhLEdBQUcsQ0FDckIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUNwRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQ2xGLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUN4RCxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQzlCO0VBQ0QsT0FBTyxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUM7QUFDakM7QUFFQSxPQUFPLFNBQVMsUUFBUSxHQUFTO0VBQ2hDLE1BQU0sS0FBYSxHQUFHLEVBQUU7RUFDeEIsTUFBTSxLQUFhLEdBQUcsRUFBRTtFQUN4QixNQUFNLEtBQUssR0FBRyxDQUFDO0VBQ2YsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUMvQixNQUFNLEVBQUUsR0FBSSxDQUFDLEdBQUcsS0FBSyxHQUFJLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUNwQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztFQUM3RDtFQUNBLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDL0IsTUFBTSxFQUFFLEdBQUksQ0FBQyxHQUFHLEtBQUssR0FBSSxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUM7SUFDcEMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0VBQzFEO0VBQ0EsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUMvQixNQUFNLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSztJQUMzQixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEdBQUcsS0FBSyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztFQUM3QztFQUNBLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxNQUFNO0VBQzVCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDL0IsTUFBTSxFQUFFLEdBQUksQ0FBQyxHQUFHLEtBQUssR0FBSSxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUM7SUFDcEMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO0VBQzVEO0VBQ0EsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE1BQU07RUFDNUIsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7RUFDeEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUMvQixNQUFNLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSztJQUMzQixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLE9BQU8sR0FBRyxDQUFDLEVBQUUsT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0VBQ2xEO0VBQ0EsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE1BQU07RUFDNUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUMvQixNQUFNLEVBQUUsR0FBSSxDQUFDLEdBQUcsS0FBSyxHQUFJLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUNwQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7RUFDNUQ7RUFDQSxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsTUFBTTtFQUM1QixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztFQUN4QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQy9CLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxLQUFLO0lBQzNCLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxHQUFHLENBQUMsRUFBRSxPQUFPLEdBQUcsR0FBRyxDQUFDLENBQUM7RUFDbEQ7RUFDQSxPQUFPLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQztBQUNsQztBQUVBLE9BQU8sU0FBUyxPQUFPLEdBQVM7RUFDL0IsTUFBTSxLQUFhLEdBQUcsQ0FDckIsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFDaEYsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUcsR0FBRyxDQUFDLEVBQ2hGLENBQUMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFDNUUsQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRyxJQUFJLENBQUMsQ0FDaEY7RUFDRCxNQUFNLEtBQWEsR0FBRyxDQUNyQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDbEYsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUNwRjtFQUNELE9BQU8sS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDO0FBQ2xDO0FBRUEsT0FBTyxTQUFTLGFBQWEsR0FBUztFQUNyQyxNQUFNLEtBQWEsR0FBRyxDQUNyQixDQUFDLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQ2xGLENBQUMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUcsSUFBSSxDQUFDLEVBQ2xGLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFDcEYsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRyxJQUFJLENBQUMsRUFDcEYsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEVBQ2xGLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FDOUU7RUFDRCxNQUFNLEtBQWEsR0FBRyxDQUNyQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDbEYsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQ3BHLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDakMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUNqQztFQUNELE9BQU8sS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDO0FBQ2xDO0FBRUEsT0FBTyxTQUFTLFNBQVMsR0FBUztFQUNqQyxNQUFNLEtBQWEsR0FBRyxDQUNyQixDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQzFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUcsR0FBRyxDQUFDLEVBQzFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FDOUU7RUFDRCxNQUFNLEtBQWEsR0FBRyxDQUNyQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDbEYsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FDMUQ7RUFDRCxPQUFPLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQztBQUNsQztBQUlBLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFlLENBQUM7QUFFckMsT0FBTyxTQUFTLE9BQU8sQ0FBQyxJQUFZLEVBQUUsTUFBNEIsRUFBZTtFQUNoRixJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FB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QUFTLEtBQUs7TUFDdkMsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLEVBQUU7UUFDekIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDO1FBQzdELGNBQWMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztNQUMzQztJQUNELENBQUMsQ0FBQztJQUNGLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsSUFBSSxVQUFVLEVBQUU7TUFDM0MsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7TUFDekMsS0FBSyxNQUFNLEtBQUssSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRTtRQUMzQixJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDN0QsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDO01BQzVDO0lBQ0Q7SUFDQSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLEtBQUs7TUFDeEMsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFO01BQzdDLE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRTtNQUM3QyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUU7TUFDcEMsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU07TUFDdEIsSUFBSSxFQUFFLEdBQUcsQ0FBQztRQUFFLEVBQUUsR0FBRyxDQUFDO1FBQUUsRUFBRSxHQUFHLENBQUM7TUFDMUIsS0FBSyxNQUFNLFNBQVMsSUFBSSxLQUFLLEVBQUU7UUFDOUIsRUFBRSxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsRUFBRSxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsRUFBRSxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDL0I7TUFDQSxFQUFFLElBQUksQ0FBQztNQUFFLEVBQUUsSUFBSSxDQUFDO01BQUUsRUFBRSxJQUFJLENBQUM7TUFDekIsSUFBSSxFQUFFLEdBQUcsQ0FBQztRQUFFLEVBQUUsR0FBRyxDQUFDO1FBQUUsRUFBRSxHQUFHLENBQUM7TUFDMUIsS0FBSyxNQUFNLFVBQVUsSUFBSSxLQUFLLEVBQUU7UUFDL0IsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQy9DLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUMvQyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7TUFDaEQ7TUFDQSxFQUFFLElBQUksS0FBSyxDQUFDLE1BQU07TUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLE1BQU07TUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLE1BQU07TUFDMUQsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUs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QzFCLEtBQUssTUFBTSxDQUFDLElBQUksVUFBVSxFQUFFO1FBQzNCLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ3JCO01BQ0EsRUFBRSxJQUFJLFVBQVUsQ0FBQyxNQUFNO01BQ3ZCLEVBQUUsSUFBSSxVQUFVLENBQUMsTUFBTTtNQUN2QixFQUFFLElBQUksVUFBVSxDQUFDLE1BQU07TUFDdkIsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksTUFBTTtNQUM1RCxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNO01BQzVELElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU07SUFDN0Q7SUFDQSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztFQUNoRTtFQUNBLE9BQU8sWUFBWSxDQUFDO0lBQUUsR0FBRyxJQUFJO0lBQUU7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QUcsQ0FBQztNQUNkLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxFQUFFO1FBQ3RCLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQzlCLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1VBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1VBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDO1FBQ3ZDLE1BQU0sSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUc7TUFDcEQ7TUFDQSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUM7TUFDbEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxHQUFHLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQztNQUMzRixDQUFDLEdBQUcsS0FBSztNQUFFLENBQUMsR0FBRyxLQUFLO01BQUUsQ0FBQyxHQUFHLEtBQUssR0FBRyxJQUFJO0lBQ3ZDLENBQUMsTUFBTSxJQUFJLElBQUksS0FBSyxPQUFPLEVBQUU7TUFDNUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztNQUNqRSxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsR0FBRyxHQUFHLElBQUk7TUFDOUIsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksR0FBRyxJQUFJLENBQUM7TUFDNUIsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksR0FBRyxJQUFJLENBQUM7TUFDNUIsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDO0lBQ25DLENBQUMsTUFBTSxJQUFJLElBQUksS0FBSyxVQUFVLEVBQUU7TUFDL0IsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLEtBQUs7TUFDL0IsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSTtNQUNsQixDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxHQUFHO01BQ2xCLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUc7SUFDekIsQ0FBQyxNQUFNO01BQ04sTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFO01BQzdCLElBQUksSUFBSSxHQUFHLENBQUM7UUFBRSxJQUFJLEdBQUcsQ0FBQztRQUFFLElBQUksR0FBRyxDQUFDO01BQ2hDLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxFQUFFO1FBQ3RCLElBQUksSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxJQUFJLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ3RDO01BQ0EsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHO01BQzlGLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUk7TUFDdEIsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLEdBQUcsSUFBSTtNQUNyQixDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJO0lBQzdCO0lBQ0EsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMzQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMvQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztFQUNoRDtFQUNBLE1BQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTTtFQUN0QixPQUFPLE1BQU07QUFDZDtBQUVB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LENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLO01BQzlCLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBRSxFQUFFLElBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ3ZELENBQUMsQ0FBQztFQUNILENBQUMsTUFBTSxJQUFJLElBQUksS0FBSyxNQUFNLEVBQUU7SUFDM0IsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBRSxDQUFDLElBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLENBQUUsQ0FBQyxJQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDckcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLO01BQzlCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ2xDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDL0IsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1VBQ25ELFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1VBQ3BCO1FBQ0Q7TUFDRDtJQUNELENBQUMsQ0FBQztFQUNIO0VBRUEsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUs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LENBQUMsR0FBRyxJQUFJO1FBQzlCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLElBQUk7UUFDOUIsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxDQUFDO01BQ3pDLENBQUMsTUFBTSxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUU7UUFDeEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsSUFBSTtRQUM5QixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLElBQUk7UUFDL0IsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO01BQ3pDLENBQUMsTUFBTTtRQUNOLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLElBQUk7UUFDOUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsSUFBSTtRQUM5QixRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLFdBQVcsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7TUFDekM7SUFDRDtFQUNEO0VBRUEsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUNwQyxNQUFNLEtBQUssR0FBRyxDQUFDLEdBQUcsT0FBTztJQUN6QixNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTztJQUMvQixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7TUFDOUIsTUFBTSxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7TUFDekIsTUFBTSxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7TUFDekIsTUFBTSxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7TUFDekIsTUFBTSxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7TUFDekIsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO01BQ3hCLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2xCO0VBQ0Q7RUFFQSxPQUFPLFlBQVksQ0FBQztJQUNuQixRQUFRO0lBQ1IsS0FBSztJQUNMLEtBQUssRUFBRSxFQUFFO0lBQ1QsTUFBTSxFQUFFLENBQUM7SUFDVCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFO0lBQ3ZCLFFBQVEsRUFBRTtFQUNYLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDO0FBQ2hCO0FBRUEsU0FBUyxrQkFBa0IsQ0FBQyxJQUFVLEVBQUUsR0FBUyxFQUFFLEVBQVEsRUFBRSxFQUFRLEVBQUUsRUFBUSxFQUFXO0VBQ3pGLE1BQU0sRUFBUSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDOUQsTUFBTSxFQUFRLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM5RCxNQUFNLENBQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQ25ILE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUNwRCxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxFQUFFLE9BQU8sS0FBSztFQUNwQyxNQUFNLElBQUksR0FBRyxHQUFHLEdBQUcsQ0FBQztFQUNwQixNQUFNLENBQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQ25FLE1BQU0sQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUMxRCxJQUFJLENBQUMs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SSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsRUFBRTtJQUMvRSxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDekYsTUFBTSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQ3pGLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7RUFDbEQ7RUFDQSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxPQUFPLElBQUk7RUFDbkMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUs7SUFDM0IsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUQsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUQsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUN6SCxDQUFDLENBQUM7RUFDRixJQUFJLE9BQU8sR0FBRyxJQUFJO0VBQ2xCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDeEQsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUMxQixJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUU7SUFDOUUsTUFBTSxJQUFJLEdBQUcsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUM7SUFDakUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxPQUFPLEdBQUcsSUFBSTtFQUNuRTtFQUNBLE9BQU8sT0FBTztBQUNmIiwiaWdub3JlTGlzdCI6W119