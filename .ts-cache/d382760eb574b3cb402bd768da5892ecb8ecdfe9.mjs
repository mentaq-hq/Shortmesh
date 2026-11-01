import { rayTriangle } from './picking';

/**
 * High-speed Bounding Volume Hierarchy (BVH) over mesh triangles.
 *
 * Optimizations:
 * - Precomputes per-triangle AABBs once during flatten() to speed up tree construction.
 * - Eliminates subarray view allocations in partialSort().
 * - Uses a pre-allocated static Int32Array traversal stack and inlined ray-triangle
 *   intersection with precomputed inverse ray directions (zero heap allocations per raycast).
 */

const LEAF_SIZE = 6;
const EPSILON = 1e-6;
const TRAVERSAL_STACK = new Int32Array(128);
function triangleCountOf(mesh) {
  let total = 0;
  const faces = mesh.faces;
  for (let i = 0; i < faces.length; i++) {
    const len = faces[i].length;
    if (len > 2) total += len - 2;
  }
  return total;
}

/** Flattens polygons into a triangle soup and precomputes per-triangle AABBs and centroids. */
function flatten(mesh, count) {
  const positions = new Float64Array(count * 9);
  const triBounds = new Float64Array(count * 6);
  const centroids = new Float64Array(count * 3);
  const faceIndex = new Int32Array(count);
  const triVerts = new Int32Array(count * 3);
  const verts = mesh.vertices;
  const faces = mesh.faces;
  let triangle = 0;
  for (let f = 0; f < faces.length; f++) {
    const face = faces[f];
    const fLen = face.length;
    if (fLen < 3) continue;
    const i0 = face[0];
    const a = verts[i0];
    const ax = a[0],
      ay = a[1],
      az = a[2];
    for (let i = 1; i < fLen - 1; i++) {
      const i1 = face[i];
      const i2 = face[i + 1];
      const b = verts[i1];
      const c = verts[i2];
      const bx = b[0],
        by = b[1],
        bz = b[2];
      const cx = c[0],
        cy = c[1],
        cz = c[2];
      const at = triangle * 9;
      positions[at] = ax;
      positions[at + 1] = ay;
      positions[at + 2] = az;
      positions[at + 3] = bx;
      positions[at + 4] = by;
      positions[at + 5] = bz;
      positions[at + 6] = cx;
      positions[at + 7] = cy;
      positions[at + 8] = cz;
      const bt = triangle * 6;
      triBounds[bt] = ax < bx ? ax < cx ? ax : cx : bx < cx ? bx : cx;
      triBounds[bt + 1] = ay < by ? ay < cy ? ay : cy : by < cy ? by : cy;
      triBounds[bt + 2] = az < bz ? az < cz ? az : cz : bz < cz ? bz : cz;
      triBounds[bt + 3] = ax > bx ? ax > cx ? ax : cx : bx > cx ? bx : cx;
      triBounds[bt + 4] = ay > by ? ay > cy ? ay : cy : by > cy ? by : cy;
      triBounds[bt + 5] = az > bz ? az > cz ? az : cz : bz > cz ? bz : cz;
      const ct = triangle * 3;
      centroids[ct] = (ax + bx + cx) * (1 / 3);
      centroids[ct + 1] = (ay + by + cy) * (1 / 3);
      centroids[ct + 2] = (az + bz + cz) * (1 / 3);
      faceIndex[triangle] = f;
      triVerts[ct] = i0;
      triVerts[ct + 1] = i1;
      triVerts[ct + 2] = i2;
      triangle++;
    }
  }
  return {
    positions,
    triBounds,
    centroids,
    faceIndex,
    triVerts
  };
}
export function buildMeshBVH(mesh) {
  const triangleCount = triangleCountOf(mesh);
  const {
    positions,
    triBounds,
    centroids,
    faceIndex,
    triVerts
  } = flatten(mesh, triangleCount);
  const order = new Int32Array(triangleCount);
  for (let i = 0; i < triangleCount; i++) order[i] = i;
  const maxNodes = Math.max(1, triangleCount * 2);
  const bounds = new Float64Array(maxNodes * 6);
  const left = new Int32Array(maxNodes);
  const right = new Int32Array(maxNodes);
  const start = new Int32Array(maxNodes);
  const count = new Int32Array(maxNodes);
  let nodeCount = 0;
  function partialSort(from, len, k, axis) {
    let lo = from;
    let hi = from + len - 1;
    const target = from + k;
    while (lo < hi) {
      const pivot = centroids[order[lo + hi >> 1] * 3 + axis];
      let i = lo;
      let j = hi;
      while (i <= j) {
        while (centroids[order[i] * 3 + axis] < pivot) i++;
        while (centroids[order[j] * 3 + axis] > pivot) j--;
        if (i <= j) {
          const tmp = order[i];
          order[i] = order[j];
          order[j] = tmp;
          i++;
          j--;
        }
      }
      if (target <= j) hi = j;else if (target >= i) lo = i;else break;
    }
  }
  function makeNode(from, length) {
    const node = nodeCount++;
    start[node] = from;
    count[node] = length;
    left[node] = -1;
    right[node] = -1;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    let cMinX = Infinity,
      cMinY = Infinity,
      cMinZ = Infinity;
    let cMaxX = -Infinity,
      cMaxY = -Infinity,
      cMaxZ = -Infinity;
    const end = from + length;
    for (let i = from; i < end; i++) {
      const t = order[i];
      const bt = t * 6;
      const bMinX = triBounds[bt],
        bMinY = triBounds[bt + 1],
        bMinZ = triBounds[bt + 2];
      const bMaxX = triBounds[bt + 3],
        bMaxY = triBounds[bt + 4],
        bMaxZ = triBounds[bt + 5];
      if (bMinX < minX) minX = bMinX;
      if (bMinY < minY) minY = bMinY;
      if (bMinZ < minZ) minZ = bMinZ;
      if (bMaxX > maxX) maxX = bMaxX;
      if (bMaxY > maxY) maxY = bMaxY;
      if (bMaxZ > maxZ) maxZ = bMaxZ;
      const ct = t * 3;
      const cx = centroids[ct],
        cy = centroids[ct + 1],
        cz = centroids[ct + 2];
      if (cx < cMinX) cMinX = cx;
      if (cy < cMinY) cMinY = cy;
      if (cz < cMinZ) cMinZ = cz;
      if (cx > cMaxX) cMaxX = cx;
      if (cy > cMaxY) cMaxY = cy;
      if (cz > cMaxZ) cMaxZ = cz;
    }
    const nb = node * 6;
    bounds[nb] = minX;
    bounds[nb + 1] = minY;
    bounds[nb + 2] = minZ;
    bounds[nb + 3] = maxX;
    bounds[nb + 4] = maxY;
    bounds[nb + 5] = maxZ;
    if (length <= LEAF_SIZE) return node;
    const extentX = cMaxX - cMinX;
    const extentY = cMaxY - cMinY;
    const extentZ = cMaxZ - cMinZ;
    const axis = extentX >= extentY && extentX >= extentZ ? 0 : extentY >= extentZ ? 1 : 2;
    const half = length >> 1;
    partialSort(from, length, half, axis);
    left[node] = makeNode(from, half);
    right[node] = makeNode(from + half, length - half);
    return node;
  }
  if (triangleCount > 0) makeNode(0, triangleCount);else {
    start[0] = 0;
    count[0] = 0;
    nodeCount = 1;
  }
  return {
    triangleCount,
    positions,
    faceIndex,
    triVerts,
    order,
    bounds,
    left,
    right,
    start,
    count,
    nodeCount
  };
}

/** Zero-allocation slab test with precomputed inverse ray directions. */
function slabFast(bounds, node, ox, oy, oz, dx, dy, dz, invX, invY, invZ, maxT) {
  const at = node * 6;
  let tMin = 0;
  let tMax = maxT;
  const loX = bounds[at],
    hiX = bounds[at + 3];
  if (Math.abs(dx) < 1e-12) {
    if (ox < loX || ox > hiX) return -1;
  } else {
    let t1 = (loX - ox) * invX;
    let t2 = (hiX - ox) * invX;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }
  const loY = bounds[at + 1],
    hiY = bounds[at + 4];
  if (Math.abs(dy) < 1e-12) {
    if (oy < loY || oy > hiY) return -1;
  } else {
    let t1 = (loY - oy) * invY;
    let t2 = (hiY - oy) * invY;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }
  const loZ = bounds[at + 2],
    hiZ = bounds[at + 5];
  if (Math.abs(dz) < 1e-12) {
    if (oz < loZ || oz > hiZ) return -1;
  } else {
    let t1 = (loZ - oz) * invZ;
    let t2 = (hiZ - oz) * invZ;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }
  return tMin;
}

/** Zero-allocation Möller–Trumbore ray-triangle test reading directly from the flat buffer. */
function rayTriangleFlat(ox, oy, oz, dx, dy, dz, positions, at) {
  const ax = positions[at],
    ay = positions[at + 1],
    az = positions[at + 2];
  const e1x = positions[at + 3] - ax;
  const e1y = positions[at + 4] - ay;
  const e1z = positions[at + 5] - az;
  const e2x = positions[at + 6] - ax;
  const e2y = positions[at + 7] - ay;
  const e2z = positions[at + 8] - az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -EPSILON && det < EPSILON) return -1;
  const inv = 1 / det;
  const tx = ox - ax;
  const ty = oy - ay;
  const tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -EPSILON || u > 1 + EPSILON) return -1;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -EPSILON || u + v > 1 + EPSILON) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > EPSILON ? t : -1;
}

/**
 * Nearest triangle along the ray. Zero allocations during traversal.
 */
export function raycastBVH(bvh, ray, maxT = Infinity) {
  if (bvh.triangleCount === 0) return null;
  const ox = ray.origin[0],
    oy = ray.origin[1],
    oz = ray.origin[2];
  const dx = ray.dir[0],
    dy = ray.dir[1],
    dz = ray.dir[2];
  const invX = Math.abs(dx) >= 1e-12 ? 1 / dx : 0;
  const invY = Math.abs(dy) >= 1e-12 ? 1 / dy : 0;
  const invZ = Math.abs(dz) >= 1e-12 ? 1 / dz : 0;
  const bounds = bvh.bounds;
  const left = bvh.left;
  const right = bvh.right;
  const start = bvh.start;
  const count = bvh.count;
  const order = bvh.order;
  const positions = bvh.positions;
  if (slabFast(bounds, 0, ox, oy, oz, dx, dy, dz, invX, invY, invZ, maxT) < 0) return null;
  let bestT = maxT;
  let bestTri = -1;
  let sp = 0;
  TRAVERSAL_STACK[sp++] = 0;
  while (sp > 0) {
    const node = TRAVERSAL_STACK[--sp];
    const l = left[node];
    if (l < 0) {
      const from = start[node];
      const to = from + count[node];
      for (let i = from; i < to; i++) {
        const triangle = order[i];
        const t = rayTriangleFlat(ox, oy, oz, dx, dy, dz, positions, triangle * 9);
        if (t > 0 && t < bestT) {
          bestT = t;
          bestTri = triangle;
        }
      }
      continue;
    }
    const r = right[node];
    const a = slabFast(bounds, l, ox, oy, oz, dx, dy, dz, invX, invY, invZ, bestT);
    const b = slabFast(bounds, r, ox, oy, oz, dx, dy, dz, invX, invY, invZ, bestT);
    if (a < 0 && b < 0) continue;
    if (a < 0) {
      TRAVERSAL_STACK[sp++] = r;
    } else if (b < 0) {
      TRAVERSAL_STACK[sp++] = l;
    } else if (a <= b) {
      TRAVERSAL_STACK[sp++] = r;
      TRAVERSAL_STACK[sp++] = l;
    } else {
      TRAVERSAL_STACK[sp++] = l;
      TRAVERSAL_STACK[sp++] = r;
    }
  }
  void rayTriangle;
  return bestTri >= 0 ? {
    t: bestT,
    faceIndex: bvh.faceIndex[bestTri],
    triangle: bestTri
  } : null;
}

/** Every vertex that falls inside a sphere, used by proportional editing and sculpting. */
export function verticesInSphere(bvh, center, vertices, radius) {
  if (bvh.triangleCount === 0) return [];
  const found = new Set();
  const r2 = radius * radius;
  const cx = center[0],
    cy = center[1],
    cz = center[2];
  const bounds = bvh.bounds;
  const left = bvh.left;
  const right = bvh.right;
  const start = bvh.start;
  const count = bvh.count;
  const order = bvh.order;
  const triVerts = bvh.triVerts;
  let sp = 0;
  TRAVERSAL_STACK[sp++] = 0;
  while (sp > 0) {
    const node = TRAVERSAL_STACK[--sp];
    const at = node * 6;
    const dx = cx < bounds[at] ? bounds[at] - cx : cx > bounds[at + 3] ? cx - bounds[at + 3] : 0;
    const dy = cy < bounds[at + 1] ? bounds[at + 1] - cy : cy > bounds[at + 4] ? cy - bounds[at + 4] : 0;
    const dz = cz < bounds[at + 2] ? bounds[at + 2] - cz : cz > bounds[at + 5] ? cz - bounds[at + 5] : 0;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    const l = left[node];
    if (l < 0) {
      const from = start[node];
      const to = from + count[node];
      for (let i = from; i < to; i++) {
        const t3 = order[i] * 3;
        for (let corner = 0; corner < 3; corner++) {
          const vertex = triVerts[t3 + corner];
          const point = vertices[vertex];
          if (!point) continue;
          const vx = point[0] - cx;
          const vy = point[1] - cy;
          const vz = point[2] - cz;
          if (vx * vx + vy * vy + vz * vz <= r2) found.add(vertex);
        }
      }
      continue;
    }
    TRAVERSAL_STACK[sp++] = l;
    TRAVERSAL_STACK[sp++] = right[node];
  }
  return [...found];
}
const cache = new WeakMap();

/**
 * The hierarchy of a mesh, rebuilt only when the geometry version moves.
 */
export function meshBVH(mesh, version = 0) {
  const entry = cache.get(mesh);
  if (entry && entry.version === version) return entry.bvh;
  const bvh = buildMeshBVH(mesh);
  cache.set(mesh, {
    version,
    bvh
  });
  return bvh;
}
export function invalidateBVH(mesh) {
  cache.delete(mesh);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiYnZoLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgVmVjMyB9IGZyb20gJy4vbWF0aDNkJztcbmltcG9ydCB0eXBlIHsgTWVzaCB9IGZyb20gJy4vbWVzaCc7XG5pbXBvcnQgeyByYXlUcmlhbmdsZSwgdHlwZSBSYXkgfSBmcm9tICcuL3BpY2tpbmcnO1xuXG4vKipcbiAqIEhpZ2gtc3BlZWQgQm91bmRpbmcgVm9sdW1lIEhpZXJhcmNoeSAoQlZIKSBvdmVyIG1lc2ggdHJpYW5nbGVzLlxuICpcbiAqIE9wdGltaXphdGlvbnM6XG4gKiAtIFByZWNvbXB1dGVzIHBlci10cmlhbmdsZSBBQUJCcyBvbmNlIGR1cmluZyBmbGF0dGVuKCkgdG8gc3BlZWQgdXAgdHJlZSBjb25zdHJ1Y3Rpb24uXG4gKiAtIEVsaW1pbmF0ZXMgc3ViYXJyYXkgdmlldyBhbGxvY2F0aW9ucyBpbiBwYXJ0aWFsU29ydCgpLlxuICogLSBVc2VzIGEgcHJlLWFsbG9jYXRlZCBzdGF0aWMgSW50MzJBcnJheSB0cmF2ZXJzYWwgc3RhY2sgYW5kIGlubGluZWQgcmF5LXRyaWFuZ2xlXG4gKiAgIGludGVyc2VjdGlvbiB3aXRoIHByZWNvbXB1dGVkIGludmVyc2UgcmF5IGRpcmVjdGlvbnMgKHplcm8gaGVhcCBhbGxvY2F0aW9ucyBwZXIgcmF5Y2FzdCkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTWVzaEJWSCB7XG5cdHRyaWFuZ2xlQ291bnQ6IG51bWJlcjtcblx0LyoqIE5pbmUgZmxvYXRzIHBlciB0cmlhbmdsZTogdGhyZWUgY29ybmVycy4gKi9cblx0cG9zaXRpb25zOiBGbG9hdDY0QXJyYXk7XG5cdC8qKiBUaGUgZmFjZSBhIHRyaWFuZ2xlIGNhbWUgZnJvbS4gKi9cblx0ZmFjZUluZGV4OiBJbnQzMkFycmF5O1xuXHQvKiogVGhyZWUgdmVydGV4IGluZGljZXMgcGVyIHRyaWFuZ2xlLiAqL1xuXHR0cmlWZXJ0czogSW50MzJBcnJheTtcblx0LyoqIFRyaWFuZ2xlIGlkcyBzb3J0ZWQgc28gdGhhdCBldmVyeSBsZWFmIG93bnMgYSBjb250aWd1b3VzIHJ1bi4gKi9cblx0b3JkZXI6IEludDMyQXJyYXk7XG5cdC8qKiBTaXggZmxvYXRzIHBlciBub2RlOiBtaW4geHl6LCBtYXggeHl6LiAqL1xuXHRib3VuZHM6IEZsb2F0NjRBcnJheTtcblx0bGVmdDogSW50MzJBcnJheTtcblx0cmlnaHQ6IEludDMyQXJyYXk7XG5cdHN0YXJ0OiBJbnQzMkFycmF5O1xuXHRjb3VudDogSW50MzJBcnJheTtcblx0bm9kZUNvdW50OiBudW1iZXI7XG59XG5cbmNvbnN0IExFQUZfU0laRSA9IDY7XG5jb25zdCBFUFNJTE9OID0gMWUtNjtcbmNvbnN0IFRSQVZFUlNBTF9TVEFDSyA9IG5ldyBJbnQzMkFycmF5KDEyOCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQlZISGl0IHtcblx0dDogbnVtYmVyO1xuXHRmYWNlSW5kZXg6IG51bWJlcjtcblx0dHJpYW5nbGU6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gdHJpYW5nbGVDb3VudE9mKG1lc2g6IE1lc2gpOiBudW1iZXIge1xuXHRsZXQgdG90YWwgPSAwO1xuXHRjb25zdCBmYWNlcyA9IG1lc2guZmFjZXM7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZmFjZXMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBsZW4gPSBmYWNlc1tpXS5sZW5ndGg7XG5cdFx0aWYgKGxlbiA+IDIpIHRvdGFsICs9IGxlbiAtIDI7XG5cdH1cblx0cmV0dXJuIHRvdGFsO1xufVxuXG4vKiogRmxhdHRlbnMgcG9seWdvbnMgaW50byBhIHRyaWFuZ2xlIHNvdXAgYW5kIHByZWNvbXB1dGVzIHBlci10cmlhbmdsZSBBQUJCcyBhbmQgY2VudHJvaWRzLiAqL1xuZnVuY3Rpb24gZmxhdHRlbihtZXNoOiBNZXNoLCBjb3VudDogbnVtYmVyKSB7XG5cdGNvbnN0IHBvc2l0aW9ucyA9IG5ldyBGbG9hdDY0QXJyYXkoY291bnQgKiA5KTtcblx0Y29uc3QgdHJpQm91bmRzID0gbmV3IEZsb2F0NjRBcnJheShjb3VudCAqIDYpO1xuXHRjb25zdCBjZW50cm9pZHMgPSBuZXcgRmxvYXQ2NEFycmF5KGNvdW50ICogMyk7XG5cdGNvbnN0IGZhY2VJbmRleCA9IG5ldyBJbnQzMkFycmF5KGNvdW50KTtcblx0Y29uc3QgdHJpVmVydHMgPSBuZXcgSW50MzJBcnJheShjb3VudCAqIDMpO1xuXHRjb25zdCB2ZXJ0cyA9IG1lc2gudmVydGljZXM7XG5cdGNvbnN0IGZhY2VzID0gbWVzaC5mYWNlcztcblx0bGV0IHRyaWFuZ2xlID0gMDtcblxuXHRmb3IgKGxldCBmID0gMDsgZiA8IGZhY2VzLmxlbmd0aDsgZisrKSB7XG5cdFx0Y29uc3QgZmFjZSA9IGZhY2VzW2ZdO1xuXHRcdGNvbnN0IGZMZW4gPSBmYWNlLmxlbmd0aDtcblx0XHRpZiAoZkxlbiA8IDMpIGNvbnRpbnVlO1xuXHRcdGNvbnN0IGkwID0gZmFjZVswXTtcblx0XHRjb25zdCBhID0gdmVydHNbaTBdO1xuXHRcdGNvbnN0IGF4ID0gYVswXSwgYXkgPSBhWzFdLCBheiA9IGFbMl07XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGZMZW4gLSAxOyBpKyspIHtcblx0XHRcdGNvbnN0IGkxID0gZmFjZVtpXTtcblx0XHRcdGNvbnN0IGkyID0gZmFjZVtpICsgMV07XG5cdFx0XHRjb25zdCBiID0gdmVydHNbaTFdO1xuXHRcdFx0Y29uc3QgYyA9IHZlcnRzW2kyXTtcblx0XHRcdGNvbnN0IGJ4ID0gYlswXSwgYnkgPSBiWzFdLCBieiA9IGJbMl07XG5cdFx0XHRjb25zdCBjeCA9IGNbMF0sIGN5ID0gY1sxXSwgY3ogPSBjWzJdO1xuXG5cdFx0XHRjb25zdCBhdCA9IHRyaWFuZ2xlICogOTtcblx0XHRcdHBvc2l0aW9uc1thdF0gPSBheDtcblx0XHRcdHBvc2l0aW9uc1thdCArIDFdID0gYXk7XG5cdFx0XHRwb3NpdGlvbnNbYXQgKyAyXSA9IGF6O1xuXHRcdFx0cG9zaXRpb25zW2F0ICsgM10gPSBieDtcblx0XHRcdHBvc2l0aW9uc1thdCArIDRdID0gYnk7XG5cdFx0XHRwb3NpdGlvbnNbYXQgKyA1XSA9IGJ6O1xuXHRcdFx0cG9zaXRpb25zW2F0ICsgNl0gPSBjeDtcblx0XHRcdHBvc2l0aW9uc1thdCArIDddID0gY3k7XG5cdFx0XHRwb3NpdGlvbnNbYXQgKyA4XSA9IGN6O1xuXG5cdFx0XHRjb25zdCBidCA9IHRyaWFuZ2xlICogNjtcblx0XHRcdHRyaUJvdW5kc1tidF0gPSBheCA8IGJ4ID8gKGF4IDwgY3ggPyBheCA6IGN4KSA6IChieCA8IGN4ID8gYnggOiBjeCk7XG5cdFx0XHR0cmlCb3VuZHNbYnQgKyAxXSA9IGF5IDwgYnkgPyAoYXkgPCBjeSA/IGF5IDogY3kpIDogKGJ5IDwgY3kgPyBieSA6IGN5KTtcblx0XHRcdHRyaUJvdW5kc1tidCArIDJdID0gYXogPCBieiA/IChheiA8IGN6ID8gYXogOiBjeikgOiAoYnogPCBjeiA/IGJ6IDogY3opO1xuXHRcdFx0dHJpQm91bmRzW2J0ICsgM10gPSBheCA+IGJ4ID8gKGF4ID4gY3ggPyBheCA6IGN4KSA6IChieCA+IGN4ID8gYnggOiBjeCk7XG5cdFx0XHR0cmlCb3VuZHNbYnQgKyA0XSA9IGF5ID4gYnkgPyAoYXkgPiBjeSA/IGF5IDogY3kpIDogKGJ5ID4gY3kgPyBieSA6IGN5KTtcblx0XHRcdHRyaUJvdW5kc1tidCArIDVdID0gYXogPiBieiA/IChheiA+IGN6ID8gYXogOiBjeikgOiAoYnogPiBjeiA/IGJ6IDogY3opO1xuXG5cdFx0XHRjb25zdCBjdCA9IHRyaWFuZ2xlICogMztcblx0XHRcdGNlbnRyb2lkc1tjdF0gPSAoYXggKyBieCArIGN4KSAqICgxIC8gMyk7XG5cdFx0XHRjZW50cm9pZHNbY3QgKyAxXSA9IChheSArIGJ5ICsgY3kpICogKDEgLyAzKTtcblx0XHRcdGNlbnRyb2lkc1tjdCArIDJdID0gKGF6ICsgYnogKyBjeikgKiAoMSAvIDMpO1xuXG5cdFx0XHRmYWNlSW5kZXhbdHJpYW5nbGVdID0gZjtcblx0XHRcdHRyaVZlcnRzW2N0XSA9IGkwO1xuXHRcdFx0dHJpVmVydHNbY3QgKyAxXSA9IGkxO1xuXHRcdFx0dHJpVmVydHNbY3QgKyAyXSA9IGkyO1xuXHRcdFx0dHJpYW5nbGUrKztcblx0XHR9XG5cdH1cblx0cmV0dXJuIHsgcG9zaXRpb25zLCB0cmlCb3VuZHMsIGNlbnRyb2lkcywgZmFjZUluZGV4LCB0cmlWZXJ0cyB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRNZXNoQlZIKG1lc2g6IE1lc2gpOiBNZXNoQlZIIHtcblx0Y29uc3QgdHJpYW5nbGVDb3VudCA9IHRyaWFuZ2xlQ291bnRPZihtZXNoKTtcblx0Y29uc3QgeyBwb3NpdGlvbnMsIHRyaUJvdW5kcywgY2VudHJvaWRzLCBmYWNlSW5kZXgsIHRyaVZlcnRzIH0gPSBmbGF0dGVuKG1lc2gsIHRyaWFuZ2xlQ291bnQpO1xuXHRjb25zdCBvcmRlciA9IG5ldyBJbnQzMkFycmF5KHRyaWFuZ2xlQ291bnQpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHRyaWFuZ2xlQ291bnQ7IGkrKykgb3JkZXJbaV0gPSBpO1xuXG5cdGNvbnN0IG1heE5vZGVzID0gTWF0aC5tYXgoMSwgdHJpYW5nbGVDb3VudCAqIDIpO1xuXHRjb25zdCBib3VuZHMgPSBuZXcgRmxvYXQ2NEFycmF5KG1heE5vZGVzICogNik7XG5cdGNvbnN0IGxlZnQgPSBuZXcgSW50MzJBcnJheShtYXhOb2Rlcyk7XG5cdGNvbnN0IHJpZ2h0ID0gbmV3IEludDMyQXJyYXkobWF4Tm9kZXMpO1xuXHRjb25zdCBzdGFydCA9IG5ldyBJbnQzMkFycmF5KG1heE5vZGVzKTtcblx0Y29uc3QgY291bnQgPSBuZXcgSW50MzJBcnJheShtYXhOb2Rlcyk7XG5cdGxldCBub2RlQ291bnQgPSAwO1xuXG5cdGZ1bmN0aW9uIHBhcnRpYWxTb3J0KGZyb206IG51bWJlciwgbGVuOiBudW1iZXIsIGs6IG51bWJlciwgYXhpczogbnVtYmVyKSB7XG5cdFx0bGV0IGxvID0gZnJvbTtcblx0XHRsZXQgaGkgPSBmcm9tICsgbGVuIC0gMTtcblx0XHRjb25zdCB0YXJnZXQgPSBmcm9tICsgaztcblx0XHR3aGlsZSAobG8gPCBoaSkge1xuXHRcdFx0Y29uc3QgcGl2b3QgPSBjZW50cm9pZHNbb3JkZXJbKGxvICsgaGkpID4+IDFdICogMyArIGF4aXNdO1xuXHRcdFx0bGV0IGkgPSBsbztcblx0XHRcdGxldCBqID0gaGk7XG5cdFx0XHR3aGlsZSAoaSA8PSBqKSB7XG5cdFx0XHRcdHdoaWxlIChjZW50cm9pZHNbb3JkZXJbaV0gKiAzICsgYXhpc10gPCBwaXZvdCkgaSsrO1xuXHRcdFx0XHR3aGlsZSAoY2VudHJvaWRzW29yZGVyW2pdICogMyArIGF4aXNdID4gcGl2b3QpIGotLTtcblx0XHRcdFx0aWYgKGkgPD0gaikge1xuXHRcdFx0XHRcdGNvbnN0IHRtcCA9IG9yZGVyW2ldO1xuXHRcdFx0XHRcdG9yZGVyW2ldID0gb3JkZXJbal07XG5cdFx0XHRcdFx0b3JkZXJbal0gPSB0bXA7XG5cdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHRcdGotLTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRhcmdldCA8PSBqKSBoaSA9IGo7XG5cdFx0XHRlbHNlIGlmICh0YXJnZXQgPj0gaSkgbG8gPSBpO1xuXHRcdFx0ZWxzZSBicmVhaztcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlTm9kZShmcm9tOiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBub2RlID0gbm9kZUNvdW50Kys7XG5cdFx0c3RhcnRbbm9kZV0gPSBmcm9tO1xuXHRcdGNvdW50W25vZGVdID0gbGVuZ3RoO1xuXHRcdGxlZnRbbm9kZV0gPSAtMTtcblx0XHRyaWdodFtub2RlXSA9IC0xO1xuXG5cdFx0bGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5LCBtaW5aID0gSW5maW5pdHk7XG5cdFx0bGV0IG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG5cdFx0bGV0IGNNaW5YID0gSW5maW5pdHksIGNNaW5ZID0gSW5maW5pdHksIGNNaW5aID0gSW5maW5pdHk7XG5cdFx0bGV0IGNNYXhYID0gLUluZmluaXR5LCBjTWF4WSA9IC1JbmZpbml0eSwgY01heFogPSAtSW5maW5pdHk7XG5cblx0XHRjb25zdCBlbmQgPSBmcm9tICsgbGVuZ3RoO1xuXHRcdGZvciAobGV0IGkgPSBmcm9tOyBpIDwgZW5kOyBpKyspIHtcblx0XHRcdGNvbnN0IHQgPSBvcmRlcltpXTtcblx0XHRcdGNvbnN0IGJ0ID0gdCAqIDY7XG5cdFx0XHRjb25zdCBiTWluWCA9IHRyaUJvdW5kc1tidF0sIGJNaW5ZID0gdHJpQm91bmRzW2J0ICsgMV0sIGJNaW5aID0gdHJpQm91bmRzW2J0ICsgMl07XG5cdFx0XHRjb25zdCBiTWF4WCA9IHRyaUJvdW5kc1tidCArIDNdLCBiTWF4WSA9IHRyaUJvdW5kc1tidCArIDRdLCBiTWF4WiA9IHRyaUJvdW5kc1tidCArIDVdO1xuXHRcdFx0aWYgKGJNaW5YIDwgbWluWCkgbWluWCA9IGJNaW5YO1xuXHRcdFx0aWYgKGJNaW5ZIDwgbWluWSkgbWluWSA9IGJNaW5ZO1xuXHRcdFx0aWYgKGJNaW5aIDwgbWluWikgbWluWiA9IGJNaW5aO1xuXHRcdFx0aWYgKGJNYXhYID4gbWF4WCkgbWF4WCA9IGJNYXhYO1xuXHRcdFx0aWYgKGJNYXhZID4gbWF4WSkgbWF4WSA9IGJNYXhZO1xuXHRcdFx0aWYgKGJNYXhaID4gbWF4WikgbWF4WiA9IGJNYXhaO1xuXG5cdFx0XHRjb25zdCBjdCA9IHQgKiAzO1xuXHRcdFx0Y29uc3QgY3ggPSBjZW50cm9pZHNbY3RdLCBjeSA9IGNlbnRyb2lkc1tjdCArIDFdLCBjeiA9IGNlbnRyb2lkc1tjdCArIDJdO1xuXHRcdFx0aWYgKGN4IDwgY01pblgpIGNNaW5YID0gY3g7XG5cdFx0XHRpZiAoY3kgPCBjTWluWSkgY01pblkgPSBjeTtcblx0XHRcdGlmIChjeiA8IGNNaW5aKSBjTWluWiA9IGN6O1xuXHRcdFx0aWYgKGN4ID4gY01heFgpIGNNYXhYID0gY3g7XG5cdFx0XHRpZiAoY3kgPiBjTWF4WSkgY01heFkgPSBjeTtcblx0XHRcdGlmIChjeiA+IGNNYXhaKSBjTWF4WiA9IGN6O1xuXHRcdH1cblxuXHRcdGNvbnN0IG5iID0gbm9kZSAqIDY7XG5cdFx0Ym91bmRzW25iXSA9IG1pblg7XG5cdFx0Ym91bmRzW25iICsgMV0gPSBtaW5ZO1xuXHRcdGJvdW5kc1tuYiArIDJdID0gbWluWjtcblx0XHRib3VuZHNbbmIgKyAzXSA9IG1heFg7XG5cdFx0Ym91bmRzW25iICsgNF0gPSBtYXhZO1xuXHRcdGJvdW5kc1tuYiArIDVdID0gbWF4WjtcblxuXHRcdGlmIChsZW5ndGggPD0gTEVBRl9TSVpFKSByZXR1cm4gbm9kZTtcblxuXHRcdGNvbnN0IGV4dGVudFggPSBjTWF4WCAtIGNNaW5YO1xuXHRcdGNvbnN0IGV4dGVudFkgPSBjTWF4WSAtIGNNaW5ZO1xuXHRcdGNvbnN0IGV4dGVudFogPSBjTWF4WiAtIGNNaW5aO1xuXHRcdGNvbnN0IGF4aXMgPSBleHRlbnRYID49IGV4dGVudFkgJiYgZXh0ZW50WCA+PSBleHRlbnRaID8gMCA6IGV4dGVudFkgPj0gZXh0ZW50WiA/IDEgOiAyO1xuXHRcdGNvbnN0IGhhbGYgPSBsZW5ndGggPj4gMTtcblx0XHRwYXJ0aWFsU29ydChmcm9tLCBsZW5ndGgsIGhhbGYsIGF4aXMpO1xuXG5cdFx0bGVmdFtub2RlXSA9IG1ha2VOb2RlKGZyb20sIGhhbGYpO1xuXHRcdHJpZ2h0W25vZGVdID0gbWFrZU5vZGUoZnJvbSArIGhhbGYsIGxlbmd0aCAtIGhhbGYpO1xuXHRcdHJldHVybiBub2RlO1xuXHR9XG5cblx0aWYgKHRyaWFuZ2xlQ291bnQgPiAwKSBtYWtlTm9kZSgwLCB0cmlhbmdsZUNvdW50KTtcblx0ZWxzZSB7XG5cdFx0c3RhcnRbMF0gPSAwO1xuXHRcdGNvdW50WzBdID0gMDtcblx0XHRub2RlQ291bnQgPSAxO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHR0cmlhbmdsZUNvdW50LFxuXHRcdHBvc2l0aW9ucyxcblx0XHRmYWNlSW5kZXgsXG5cdFx0dHJpVmVydHMsXG5cdFx0b3JkZXIsXG5cdFx0Ym91bmRzLFxuXHRcdGxlZnQsXG5cdFx0cmlnaHQsXG5cdFx0c3RhcnQsXG5cdFx0Y291bnQsXG5cdFx0bm9kZUNvdW50LFxuXHR9O1xufVxuXG4vKiogWmVyby1hbGxvY2F0aW9uIHNsYWIgdGVzdCB3aXRoIHByZWNvbXB1dGVkIGludmVyc2UgcmF5IGRpcmVjdGlvbnMuICovXG5mdW5jdGlvbiBzbGFiRmFzdChcblx0Ym91bmRzOiBGbG9hdDY0QXJyYXksXG5cdG5vZGU6IG51bWJlcixcblx0b3g6IG51bWJlcixcblx0b3k6IG51bWJlcixcblx0b3o6IG51bWJlcixcblx0ZHg6IG51bWJlcixcblx0ZHk6IG51bWJlcixcblx0ZHo6IG51bWJlcixcblx0aW52WDogbnVtYmVyLFxuXHRpbnZZOiBudW1iZXIsXG5cdGludlo6IG51bWJlcixcblx0bWF4VDogbnVtYmVyLFxuKTogbnVtYmVyIHtcblx0Y29uc3QgYXQgPSBub2RlICogNjtcblx0bGV0IHRNaW4gPSAwO1xuXHRsZXQgdE1heCA9IG1heFQ7XG5cblx0Y29uc3QgbG9YID0gYm91bmRzW2F0XSwgaGlYID0gYm91bmRzW2F0ICsgM107XG5cdGlmIChNYXRoLmFicyhkeCkgPCAxZS0xMikge1xuXHRcdGlmIChveCA8IGxvWCB8fCBveCA+IGhpWCkgcmV0dXJuIC0xO1xuXHR9IGVsc2Uge1xuXHRcdGxldCB0MSA9IChsb1ggLSBveCkgKiBpbnZYO1xuXHRcdGxldCB0MiA9IChoaVggLSBveCkgKiBpbnZYO1xuXHRcdGlmICh0MSA+IHQyKSB7IGNvbnN0IHRtcCA9IHQxOyB0MSA9IHQyOyB0MiA9IHRtcDsgfVxuXHRcdGlmICh0MSA+IHRNaW4pIHRNaW4gPSB0MTtcblx0XHRpZiAodDIgPCB0TWF4KSB0TWF4ID0gdDI7XG5cdFx0aWYgKHRNaW4gPiB0TWF4KSByZXR1cm4gLTE7XG5cdH1cblxuXHRjb25zdCBsb1kgPSBib3VuZHNbYXQgKyAxXSwgaGlZID0gYm91bmRzW2F0ICsgNF07XG5cdGlmIChNYXRoLmFicyhkeSkgPCAxZS0xMikge1xuXHRcdGlmIChveSA8IGxvWSB8fCBveSA+IGhpWSkgcmV0dXJuIC0xO1xuXHR9IGVsc2Uge1xuXHRcdGxldCB0MSA9IChsb1kgLSBveSkgKiBpbnZZO1xuXHRcdGxldCB0MiA9IChoaVkgLSBveSkgKiBpbnZZO1xuXHRcdGlmICh0MSA+IHQyKSB7IGNvbnN0IHRtcCA9IHQxOyB0MSA9IHQyOyB0MiA9IHRtcDsgfVxuXHRcdGlmICh0MSA+IHRNaW4pIHRNaW4gPSB0MTtcblx0XHRpZiAodDIgPCB0TWF4KSB0TWF4ID0gdDI7XG5cdFx0aWYgKHRNaW4gPiB0TWF4KSByZXR1cm4gLTE7XG5cdH1cblxuXHRjb25zdCBsb1ogPSBib3VuZHNbYXQgKyAyXSwgaGlaID0gYm91bmRzW2F0ICsgNV07XG5cdGlmIChNYXRoLmFicyhkeikgPCAxZS0xMikge1xuXHRcdGlmIChveiA8IGxvWiB8fCBveiA+IGhpWikgcmV0dXJuIC0xO1xuXHR9IGVsc2Uge1xuXHRcdGxldCB0MSA9IChsb1ogLSBveikgKiBpbnZaO1xuXHRcdGxldCB0MiA9IChoaVogLSBveikgKiBpbnZaO1xuXHRcdGlmICh0MSA+IHQyKSB7IGNvbnN0IHRtcCA9IHQxOyB0MSA9IHQyOyB0MiA9IHRtcDsgfVxuXHRcdGlmICh0MSA+IHRNaW4pIHRNaW4gPSB0MTtcblx0XHRpZiAodDIgPCB0TWF4KSB0TWF4ID0gdDI7XG5cdFx0aWYgKHRNaW4gPiB0TWF4KSByZXR1cm4gLTE7XG5cdH1cblxuXHRyZXR1cm4gdE1pbjtcbn1cblxuLyoqIFplcm8tYWxsb2NhdGlvbiBNw7ZsbGVy4oCTVHJ1bWJvcmUgcmF5LXRyaWFuZ2xlIHRlc3QgcmVhZGluZyBkaXJlY3RseSBmcm9tIHRoZSBmbGF0IGJ1ZmZlci4gKi9cbmZ1bmN0aW9uIHJheVRyaWFuZ2xlRmxhdChcblx0b3g6IG51bWJlcixcblx0b3k6IG51bWJlcixcblx0b3o6IG51bWJlcixcblx0ZHg6IG51bWJlcixcblx0ZHk6IG51bWJlcixcblx0ZHo6IG51bWJlcixcblx0cG9zaXRpb25zOiBGbG9hdDY0QXJyYXksXG5cdGF0OiBudW1iZXIsXG4pOiBudW1iZXIge1xuXHRjb25zdCBheCA9IHBvc2l0aW9uc1thdF0sIGF5ID0gcG9zaXRpb25zW2F0ICsgMV0sIGF6ID0gcG9zaXRpb25zW2F0ICsgMl07XG5cdGNvbnN0IGUxeCA9IHBvc2l0aW9uc1thdCArIDNdIC0gYXg7XG5cdGNvbnN0IGUxeSA9IHBvc2l0aW9uc1thdCArIDRdIC0gYXk7XG5cdGNvbnN0IGUxeiA9IHBvc2l0aW9uc1thdCArIDVdIC0gYXo7XG5cdGNvbnN0IGUyeCA9IHBvc2l0aW9uc1thdCArIDZdIC0gYXg7XG5cdGNvbnN0IGUyeSA9IHBvc2l0aW9uc1thdCArIDddIC0gYXk7XG5cdGNvbnN0IGUyeiA9IHBvc2l0aW9uc1thdCArIDhdIC0gYXo7XG5cdGNvbnN0IHB4ID0gZHkgKiBlMnogLSBkeiAqIGUyeTtcblx0Y29uc3QgcHkgPSBkeiAqIGUyeCAtIGR4ICogZTJ6O1xuXHRjb25zdCBweiA9IGR4ICogZTJ5IC0gZHkgKiBlMng7XG5cdGNvbnN0IGRldCA9IGUxeCAqIHB4ICsgZTF5ICogcHkgKyBlMXogKiBwejtcblx0aWYgKGRldCA+IC1FUFNJTE9OICYmIGRldCA8IEVQU0lMT04pIHJldHVybiAtMTtcblx0Y29uc3QgaW52ID0gMSAvIGRldDtcblx0Y29uc3QgdHggPSBveCAtIGF4O1xuXHRjb25zdCB0eSA9IG95IC0gYXk7XG5cdGNvbnN0IHR6ID0gb3ogLSBhejtcblx0Y29uc3QgdSA9ICh0eCAqIHB4ICsgdHkgKiBweSArIHR6ICogcHopICogaW52O1xuXHRpZiAodSA8IC1FUFNJTE9OIHx8IHUgPiAxICsgRVBTSUxPTikgcmV0dXJuIC0xO1xuXHRjb25zdCBxeCA9IHR5ICogZTF6IC0gdHogKiBlMXk7XG5cdGNvbnN0IHF5ID0gdHogKiBlMXggLSB0eCAqIGUxejtcblx0Y29uc3QgcXogPSB0eCAqIGUxeSAtIHR5ICogZTF4O1xuXHRjb25zdCB2ID0gKGR4ICogcXggKyBkeSAqIHF5ICsgZHogKiBxeikgKiBpbnY7XG5cdGlmICh2IDwgLUVQU0lMT04gfHwgdSArIHYgPiAxICsgRVBTSUxPTikgcmV0dXJuIC0xO1xuXHRjb25zdCB0ID0gKGUyeCAqIHF4ICsgZTJ5ICogcXkgKyBlMnogKiBxeikgKiBpbnY7XG5cdHJldHVybiB0ID4gRVBTSUxPTiA/IHQgOiAtMTtcbn1cblxuLyoqXG4gKiBOZWFyZXN0IHRyaWFuZ2xlIGFsb25nIHRoZSByYXkuIFplcm8gYWxsb2NhdGlvbnMgZHVyaW5nIHRyYXZlcnNhbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJheWNhc3RCVkgoYnZoOiBNZXNoQlZILCByYXk6IFJheSwgbWF4VCA9IEluZmluaXR5KTogQlZISGl0IHwgbnVsbCB7XG5cdGlmIChidmgudHJpYW5nbGVDb3VudCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cdGNvbnN0IG94ID0gcmF5Lm9yaWdpblswXSwgb3kgPSByYXkub3JpZ2luWzFdLCBveiA9IHJheS5vcmlnaW5bMl07XG5cdGNvbnN0IGR4ID0gcmF5LmRpclswXSwgZHkgPSByYXkuZGlyWzFdLCBkeiA9IHJheS5kaXJbMl07XG5cdGNvbnN0IGludlggPSBNYXRoLmFicyhkeCkgPj0gMWUtMTIgPyAxIC8gZHggOiAwO1xuXHRjb25zdCBpbnZZID0gTWF0aC5hYnMoZHkpID49IDFlLTEyID8gMSAvIGR5IDogMDtcblx0Y29uc3QgaW52WiA9IE1hdGguYWJzKGR6KSA+PSAxZS0xMiA/IDEgLyBkeiA6IDA7XG5cblx0Y29uc3QgYm91bmRzID0gYnZoLmJvdW5kcztcblx0Y29uc3QgbGVmdCA9IGJ2aC5sZWZ0O1xuXHRjb25zdCByaWdodCA9IGJ2aC5yaWdodDtcblx0Y29uc3Qgc3RhcnQgPSBidmguc3RhcnQ7XG5cdGNvbnN0IGNvdW50ID0gYnZoLmNvdW50O1xuXHRjb25zdCBvcmRlciA9IGJ2aC5vcmRlcjtcblx0Y29uc3QgcG9zaXRpb25zID0gYnZoLnBvc2l0aW9ucztcblxuXHRpZiAoc2xhYkZhc3QoYm91bmRzLCAwLCBveCwgb3ksIG96LCBkeCwgZHksIGR6LCBpbnZYLCBpbnZZLCBpbnZaLCBtYXhUKSA8IDApIHJldHVybiBudWxsO1xuXG5cdGxldCBiZXN0VCA9IG1heFQ7XG5cdGxldCBiZXN0VHJpID0gLTE7XG5cdGxldCBzcCA9IDA7XG5cdFRSQVZFUlNBTF9TVEFDS1tzcCsrXSA9IDA7XG5cblx0d2hpbGUgKHNwID4gMCkge1xuXHRcdGNvbnN0IG5vZGUgPSBUUkFWRVJTQUxfU1RBQ0tbLS1zcF07XG5cdFx0Y29uc3QgbCA9IGxlZnRbbm9kZV07XG5cdFx0aWYgKGwgPCAwKSB7XG5cdFx0XHRjb25zdCBmcm9tID0gc3RhcnRbbm9kZV07XG5cdFx0XHRjb25zdCB0byA9IGZyb20gKyBjb3VudFtub2RlXTtcblx0XHRcdGZvciAobGV0IGkgPSBmcm9tOyBpIDwgdG87IGkrKykge1xuXHRcdFx0XHRjb25zdCB0cmlhbmdsZSA9IG9yZGVyW2ldO1xuXHRcdFx0XHRjb25zdCB0ID0gcmF5VHJpYW5nbGVGbGF0KG94LCBveSwgb3osIGR4LCBkeSwgZHosIHBvc2l0aW9ucywgdHJpYW5nbGUgKiA5KTtcblx0XHRcdFx0aWYgKHQgPiAwICYmIHQgPCBiZXN0VCkge1xuXHRcdFx0XHRcdGJlc3RUID0gdDtcblx0XHRcdFx0XHRiZXN0VHJpID0gdHJpYW5nbGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCByID0gcmlnaHRbbm9kZV07XG5cdFx0Y29uc3QgYSA9IHNsYWJGYXN0KGJvdW5kcywgbCwgb3gsIG95LCBveiwgZHgsIGR5LCBkeiwgaW52WCwgaW52WSwgaW52WiwgYmVzdFQpO1xuXHRcdGNvbnN0IGIgPSBzbGFiRmFzdChib3VuZHMsIHIsIG94LCBveSwgb3osIGR4LCBkeSwgZHosIGludlgsIGludlksIGludlosIGJlc3RUKTtcblx0XHRpZiAoYSA8IDAgJiYgYiA8IDApIGNvbnRpbnVlO1xuXHRcdGlmIChhIDwgMCkge1xuXHRcdFx0VFJBVkVSU0FMX1NUQUNLW3NwKytdID0gcjtcblx0XHR9IGVsc2UgaWYgKGIgPCAwKSB7XG5cdFx0XHRUUkFWRVJTQUxfU1RBQ0tbc3ArK10gPSBsO1xuXHRcdH0gZWxzZSBpZiAoYSA8PSBiKSB7XG5cdFx0XHRUUkFWRVJTQUxfU1RBQ0tbc3ArK10gPSByO1xuXHRcdFx0VFJBVkVSU0FMX1NUQUNLW3NwKytdID0gbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0VFJBVkVSU0FMX1NUQUNLW3NwKytdID0gbDtcblx0XHRcdFRSQVZFUlNBTF9TVEFDS1tzcCsrXSA9IHI7XG5cdFx0fVxuXHR9XG5cdHZvaWQgcmF5VHJpYW5nbGU7XG5cdHJldHVybiBiZXN0VHJpID49IDAgPyB7IHQ6IGJlc3RULCBmYWNlSW5kZXg6IGJ2aC5mYWNlSW5kZXhbYmVzdFRyaV0sIHRyaWFuZ2xlOiBiZXN0VHJpIH0gOiBudWxsO1xufVxuXG4vKiogRXZlcnkgdmVydGV4IHRoYXQgZmFsbHMgaW5zaWRlIGEgc3BoZXJlLCB1c2VkIGJ5IHByb3BvcnRpb25hbCBlZGl0aW5nIGFuZCBzY3VscHRpbmcuICovXG5leHBvcnQgZnVuY3Rpb24gdmVydGljZXNJblNwaGVyZShidmg6IE1lc2hCVkgsIGNlbnRlcjogVmVjMywgdmVydGljZXM6IFZlYzNbXSwgcmFkaXVzOiBudW1iZXIpOiBudW1iZXJbXSB7XG5cdGlmIChidmgudHJpYW5nbGVDb3VudCA9PT0gMCkgcmV0dXJuIFtdO1xuXHRjb25zdCBmb3VuZCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRjb25zdCByMiA9IHJhZGl1cyAqIHJhZGl1cztcblx0Y29uc3QgY3ggPSBjZW50ZXJbMF0sIGN5ID0gY2VudGVyWzFdLCBjeiA9IGNlbnRlclsyXTtcblx0Y29uc3QgYm91bmRzID0gYnZoLmJvdW5kcztcblx0Y29uc3QgbGVmdCA9IGJ2aC5sZWZ0O1xuXHRjb25zdCByaWdodCA9IGJ2aC5yaWdodDtcblx0Y29uc3Qgc3RhcnQgPSBidmguc3RhcnQ7XG5cdGNvbnN0IGNvdW50ID0gYnZoLmNvdW50O1xuXHRjb25zdCBvcmRlciA9IGJ2aC5vcmRlcjtcblx0Y29uc3QgdHJpVmVydHMgPSBidmgudHJpVmVydHM7XG5cblx0bGV0IHNwID0gMDtcblx0VFJBVkVSU0FMX1NUQUNLW3NwKytdID0gMDtcblx0d2hpbGUgKHNwID4gMCkge1xuXHRcdGNvbnN0IG5vZGUgPSBUUkFWRVJTQUxfU1RBQ0tbLS1zcF07XG5cdFx0Y29uc3QgYXQgPSBub2RlICogNjtcblx0XHRjb25zdCBkeCA9IGN4IDwgYm91bmRzW2F0XSA/IGJvdW5kc1thdF0gLSBjeCA6IGN4ID4gYm91bmRzW2F0ICsgM10gPyBjeCAtIGJvdW5kc1thdCArIDNdIDogMDtcblx0XHRjb25zdCBkeSA9IGN5IDwgYm91bmRzW2F0ICsgMV0gPyBib3VuZHNbYXQgKyAxXSAtIGN5IDogY3kgPiBib3VuZHNbYXQgKyA0XSA/IGN5IC0gYm91bmRzW2F0ICsgNF0gOiAwO1xuXHRcdGNvbnN0IGR6ID0gY3ogPCBib3VuZHNbYXQgKyAyXSA/IGJvdW5kc1thdCArIDJdIC0gY3ogOiBjeiA+IGJvdW5kc1thdCArIDVdID8gY3ogLSBib3VuZHNbYXQgKyA1XSA6IDA7XG5cdFx0aWYgKGR4ICogZHggKyBkeSAqIGR5ICsgZHogKiBkeiA+IHIyKSBjb250aW51ZTtcblx0XHRjb25zdCBsID0gbGVmdFtub2RlXTtcblx0XHRpZiAobCA8IDApIHtcblx0XHRcdGNvbnN0IGZyb20gPSBzdGFydFtub2RlXTtcblx0XHRcdGNvbnN0IHRvID0gZnJvbSArIGNvdW50W25vZGVdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IGZyb207IGkgPCB0bzsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHQzID0gb3JkZXJbaV0gKiAzO1xuXHRcdFx0XHRmb3IgKGxldCBjb3JuZXIgPSAwOyBjb3JuZXIgPCAzOyBjb3JuZXIrKykge1xuXHRcdFx0XHRcdGNvbnN0IHZlcnRleCA9IHRyaVZlcnRzW3QzICsgY29ybmVyXTtcblx0XHRcdFx0XHRjb25zdCBwb2ludCA9IHZlcnRpY2VzW3ZlcnRleF07XG5cdFx0XHRcdFx0aWYgKCFwb2ludCkgY29udGludWU7XG5cdFx0XHRcdFx0Y29uc3QgdnggPSBwb2ludFswXSAtIGN4O1xuXHRcdFx0XHRcdGNvbnN0IHZ5ID0gcG9pbnRbMV0gLSBjeTtcblx0XHRcdFx0XHRjb25zdCB2eiA9IHBvaW50WzJdIC0gY3o7XG5cdFx0XHRcdFx0aWYgKHZ4ICogdnggKyB2eSAqIHZ5ICsgdnogKiB2eiA8PSByMikgZm91bmQuYWRkKHZlcnRleCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRUUkFWRVJTQUxfU1RBQ0tbc3ArK10gPSBsO1xuXHRcdFRSQVZFUlNBTF9TVEFDS1tzcCsrXSA9IHJpZ2h0W25vZGVdO1xuXHR9XG5cdHJldHVybiBbLi4uZm91bmRdO1xufVxuXG5jb25zdCBjYWNoZSA9IG5ldyBXZWFrTWFwPE1lc2gsIHsgdmVyc2lvbjogbnVtYmVyOyBidmg6IE1lc2hCVkggfT4oKTtcblxuLyoqXG4gKiBUaGUgaGllcmFyY2h5IG9mIGEgbWVzaCwgcmVidWlsdCBvbmx5IHdoZW4gdGhlIGdlb21ldHJ5IHZlcnNpb24gbW92ZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoQlZIKG1lc2g6IE1lc2gsIHZlcnNpb24gPSAwKTogTWVzaEJWSCB7XG5cdGNvbnN0IGVudHJ5ID0gY2FjaGUuZ2V0KG1lc2gpO1xuXHRpZiAoZW50cnkgJiYgZW50cnkudmVyc2lvbiA9PT0gdmVyc2lvbikgcmV0dXJuIGVudHJ5LmJ2aDtcblx0Y29uc3QgYnZoID0gYnVpbGRNZXNoQlZIKG1lc2gpO1xuXHRjYWNoZS5zZXQobWVzaCwgeyB2ZXJzaW9uLCBidmggfSk7XG5cdHJldHVybiBidmg7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnZhbGlkYXRlQlZIKG1lc2g6IE1lc2gpOiB2b2lkIHtcblx0Y2FjaGUuZGVsZXRlKG1lc2gpO1xufVxuIl0sIm1hcHBpbmdzIjoiQUFFQSxTQUFTLFdBQVcsUUFBa0IsV0FBVzs7QUFFakQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQW9CQSxNQUFNLFNBQVMsR0FBRyxDQUFDO0FBQ25CLE1BQU0sT0FBTyxHQUFHLElBQUk7QUFDcEIsTUFBTSxlQUFlLEdBQUcsSUFBSSxVQUFVLENBQUMsR0FBRyxDQUFDO0FBUTNDLFNBQVMsZUFBZSxDQUFDLElBQVUsRUFBVTtFQUM1QyxJQUFJLEtBQUssR0FBRyxDQUFDO0VBQ2IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUs7RUFDeEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7SUFDdEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU07SUFDM0IsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLEtBQUssSUFBSSxHQUFHLEdBQUcsQ0FBQztFQUM5QjtFQUNBLE9BQU8sS0FBSztBQUNiOztBQUVBO0FBQ0EsU0FBUyxPQUFPLENBQUMsSUFBVSxFQUFFLEtBQWEsRUFBRTtFQUMzQyxNQUFNLFNBQVMsR0FBRyxJQUFJLFlBQVksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0VBQzdDLE1BQU0sU0FBUyxHQUFHLElBQUksWUFBWSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7RUFDN0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxZQUFZLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztFQUM3QyxNQUFNLFNBQVMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUM7RUFDdkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxVQUFVLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztFQUMxQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUTtFQUMzQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSztFQUN4QixJQUFJLFFBQVEsR0FBRyxDQUFDO0VBRWhCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQ3RDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDckIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU07SUFDeEIsSUFBSSxJQUFJLEdBQUcsQ0FBQyxFQUFFO0lBQ2QsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNsQixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDO0lBQ25CLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXJDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO01BQ2xDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7TUFDbEIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7TUFDdEIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQztNQUNuQixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDO01BQ25CLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ3JDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BRXJDLE1BQU0sRUFBRSxHQUFHLFFBQVEsR0FBRyxDQUFDO01BQ3ZCLFNBQVMsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFO01BQ2xCLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRTtNQUN0QixTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUU7TUFDdEIsU0FBUyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFO01BQ3RCLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRTtNQUN0QixTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUU7TUFDdEIsU0FBUyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFO01BQ3RCLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRTtNQUN0QixTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUU7TUFFdEIsTUFBTSxFQUFFLEdBQUcsUUFBUSxHQUFHLENBQUM7TUFDdkIsU0FBUyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUc7TUFDbkUsU0FBUyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFHO01BQ3ZFLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRztNQUN2RSxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUc7TUFDdkUsU0FBUyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFHO01BQ3ZFLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRztNQUV2RSxNQUFNLEVBQUUsR0FBRyxRQUFRLEdBQUcsQ0FBQztNQUN2QixTQUFTLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO01BQ3hDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO01BQzVDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO01BRTVDLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDO01BQ3ZCLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFO01BQ2pCLFFBQVEsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRTtNQUNyQixRQUFRLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUU7TUFDckIsUUFBUSxFQUFFO0lBQ1g7RUFDRDtFQUNBLE9BQU87SUFBRSxTQUFTO0lBQUUsU0FBUztJQUFFLFNBQVM7SUFBRSxTQUFTO0lBQUU7RUFBUyxDQUFDO0FBQ2hFO0FBRUEsT0FBTyxT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LEdBQUcsUUFBUTtJQUNyRCxJQUFJLElBQUksR0FBRyxDQUFDLFFBQVE7TUFBRSxJQUFJLEdBQUcsQ0FBQyxRQUFRO01BQUUsSUFBSSxHQUFHLENBQUMsUUFBUTtJQUN4RCxJQUFJLEtBQUssR0FBRyxRQUFRO01BQUUsS0FBSyxHQUFHLFFBQVE7TUFBRSxLQUFLLEdBQUcsUUFBUTtJQUN4RCxJQUFJLEtBQUssR0FBRyxDQUFDLFFBQVE7TUFBRSxLQUFLLEdBQUcsQ0FBQyxRQUFRO01BQUUsS0FBSyxHQUFHLENBQUMsUUFBUTtJQUUzRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsTUFBTTtJQUN6QixLQUFLLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO01BQ2hDLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7TUFDbEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUM7TUFDaEIsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUFFLEtBQUssR0FBRyxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUFFLEtBQUssR0FBRyxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztNQUNqRixNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUFFLEtBQUssR0FBRyxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUFFLEtBQUssR0FBRyxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztNQUNyRixJQUFJLEtBQUssR0FBRyxJQUFJLEVBQUUsSUFBSSxHQUFHLEtBQUs7TUFDOUIsSUFBSSxLQUFLLEdBQUcsSUFBSSxFQUFFLElBQUksR0FBRyxLQUFLO01BQzlCLElBQUksS0FBSyxHQUFHLElBQUksRUFBRSxJQUFJLEdBQUcsS0FBSztNQUM5QixJQUFJLEtBQUssR0FBRyxJQUFJLEVBQUUsSUFBSSxHQUFHLEtBQUs7TUFDOUIsSUFBSSxLQUFLLEdBQUcsSUFBSSxFQUFFLElBQUksR0FBRyxLQUFLO01BQzlCLElBQUksS0FBSyxHQUFHLElBQUksRUFBRSxJQUFJLEdBQUcsS0FBSztNQUU5QixNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQztNQUNoQixNQUFNLEVBQUUsR0FBRyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQUUsRUFBRSxHQUFHLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQUUsRUFBRSxHQUFHLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO01BQ3hFLElBQUksRUFBRSxHQUFHLEtBQUssRUFBRSxLQUFLLEdBQUcsRUFBRTtNQUMxQixJQUFJLEVBQUUsR0FBRyxLQUFLLEVBQUUsS0FBSyxHQUFHLEVBQUU7TUFDMUIsSUFBSSxFQUFFLEdBQUcsS0FBSyxFQUFFLEtBQUssR0FBRyxFQUFFO01BQzFCLElBQUksRUFBRSxHQUFHLEtBQUssRUFBRSxLQUFLLEdBQUcsRUFBRTtNQUMxQixJQUFJLEVBQUUsR0FBRyxLQUFLLEVBQUUsS0FBSyxHQUFHLEVBQUU7TUFDMUIsSUFBSSxFQUFFLEdBQUcsS0FBSyxFQUFFLEtBQUssR0FBRyxFQUFFO0lBQzNCO0lBRUEsTUFBTSxFQUFFLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDbkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUk7SUFDakIsTUFBTSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJO0lBQ3JCLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSTtJQUNyQixNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUk7SUFDckIsTUFBTSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJO0lBQ3JCLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSTtJQUVyQixJQUFJLE1BQU0sSUFBSSxTQUFTLEVBQUUsT0FBTyxJQUFJO0lBRXBDLE1BQU0sT0FBTyxHQUFHLEtBQUssR0FBRyxLQUFLO0lB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QUFHLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztFQUM5QyxNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRztFQUNuQixNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRTtFQUNsQixNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRTtFQUNsQixNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRTtFQUNsQixNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEdBQUc7RUFDN0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7RUFDOUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsR0FBRztFQUM5QixNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxHQUFHO0VBQzlCLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLEdBQUc7RUFDOUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxHQUFHO0VBQzdDLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztFQUNsRCxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxHQUFHLEdBQUcsRUFBRSxJQUFJLEdBQUc7RUFDaEQsT0FBTyxDQUFDLEdBQUcsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDNUI7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsT0FBTyxTQUFTLFVBQVUsQ0FBQyxHQUFZLEVBQUUsR0FBUSxFQUFFLElBQUksR0FBRyxRQUFRLEVBQWlCO0VBQ2xGLElBQUksR0FBRyxDQUFDLGFBQWEsS0FBSyxDQUFDLEVBQUUsT0FBTyxJQUFJO0VBQ3hDLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQUUsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQUUsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0VBQ2hFLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQUUsRUFBRSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQUUsRUFBRSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0VBQ3ZELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztFQUMvQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7RUFDL0MsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO0VBRS9DLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNO0VBQ3pCLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJO0VBQ3JCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLO0VBQ3ZCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLO0VBQ3ZCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLO0VBQ3ZCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLO0VBQ3ZCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxTQUFTO0VBRS9CLElBQUksUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sSUFBSTtFQUV4RixJQUFJLEtBQUssR0FBRyxJQUFJO0VBQ2hCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztFQUNoQixJQUFJLEVBQUUsR0FBRyxDQUFDO0VBQ1YsZUFBZSxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQztFQUV6QixPQUFPLEVBQUUsR0FBRyxDQUFDLEVBQUU7SUFDZCxNQUFNLElBQUksR0FBRyxlQUFlLENBQUMsRUFBRSxFQUFFLENBQUM7SUFDbEMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztJQUNwQixJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUU7TUFDVixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO01BQ3hCLE1BQU0sRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO01BQzdCLEtBQUssSUFBSSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDL0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN6QixNQUFNLENBQUMsR0FBRyxlQUFlLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFLLEVBQUU7VUFDdkIsS0FBSyxHQUFHLENBQUM7VUFDVCxPQUFPLEdBQUcsUUFBUTtRQUNuQjtNQUNEO01BQ0E7SUFDRDtJQUNBLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDckIsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDO0lBQzlFLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQztJQUM5RSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUNwQixJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUU7TUFDVixlQUFlLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDO0lBQzFCLENBQUMsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUU7TUFDakIsZUFBZSxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQztJQUMxQixDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO01BQ2xCLGVBQWUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUM7TUFDekIsZUFBZSxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQztJQUMxQixDQUFDLE1BQU07TUFDTixlQUFlLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDO01BQ3pCLGVBQWUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUM7SUFDMUI7RUFDRDtFQUNBLEtBQUssV0FBVztFQUNoQixPQUFPLE9BQU8sSUFBSSxDQUFDLEdBQUc7SUFBRSxDQUFDLEVBQUUsS0FBSztJQUFFLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztJQUFFLFFBQVEsRUFBRTtFQUFRLENBQUMsR0FBRyxJQUFJO0FBQ2hHOztBQUVBO0FBQ0EsT0FBTyxTQUFTLGdCQUFnQixDQUFDLEdBQVksRUFBRSxNQUFZLEVBQUUsUUFBZ0IsRUFBRSxNQUFjLEVBQVk7RUFDeEcsSUFBSSxHQUFHLENBQUMsYUFBYSxLQUFLLENBQUMsRUFBRSxPQUFPLEVBQUU7RUFDdEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQVMsQ0FBQztFQUMvQixNQUFNLEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTTtFQUMxQixNQUFNLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQztFQUNwRCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTTtFQUN6QixNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSTtFQUNyQixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSztFQUN2QixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSztFQUN2QixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSztFQUN2QixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSztFQUN2QixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsUUFBUTtFQUU3QixJQUFJLEVBQUUsR0FBRyxDQUFDO0VBQ1YsZUFBZSxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQztFQUN6QixPQUFPLEVBQUUsR0FBRyxDQUFDLEVBQUU7SUFDZCxNQUFNLElBQUksR0FBRyxlQUFlLENBQUMsRUFBRSxFQUFFLENBQUM7SUFDbEMsTUFBTSxFQUFFLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDbkIsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDNUYsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUNwRyxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO0lBQ3BHLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO0lBQ3RDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7SUFDcEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFO01BQ1YsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztNQUN4QixNQUFNLEVBQUUsR0FBRyxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztNQUM3QixLQUFLLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQy9CLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3ZCLEtBQUssSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFLE1BQU0sR0FBRyxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUU7VUFDMUMsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLEVBQUUsR0FBRyxNQUFNLENBQUM7VUFDcEMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztVQUM5QixJQUFJLENBQUMsS0FBSyxFQUFFO1VBQ1osTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7VUFDeEIsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7VUFDeEIsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7VUFDeEIsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFDekQ7TUFDRDtNQUNBO0lBQ0Q7SUFDQSxlQUFlLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDO0lBQ3pCLGVBQWUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7RUFDcEM7RUFDQSxPQUFPLENBQUMsR0FBRyxLQUFLLENBQUM7QUFDbEI7QUFFQSxNQUFNLEtBQUssR0FBRyxJQUFJLE9BQU8sQ0FBMEMsQ0FBQzs7QUFFcEU7QUFDQTtBQUNBO0FBQ0EsT0FBTyxTQUFTLE9BQU8sQ0FBQyxJQUFVLEVBQUUsT0FBTyxHQUFHLENBQUMsRUFBVztFQUN6RCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztFQUM3QixJQUFJLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxLQUFLLE9BQU8sRUFBRSxPQUFPLEtBQUssQ0FBQyxHQUFHO0VBQ3hELE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7RUFDOUIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7SUFBRSxPQUFPO0lBQUU7RUFBSSxDQUFDLENBQUM7RUFDakMsT0FBTyxHQUFHO0FBQ1g7QUFFQSxPQUFPLFNBQVMsYUFBYSxDQUFDLElBQVUsRUFBUTtFQUMvQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztBQUNuQiIsImlnbm9yZUxpc3QiOltdfQ==