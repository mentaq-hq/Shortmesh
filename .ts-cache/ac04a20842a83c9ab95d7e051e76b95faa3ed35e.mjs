// Blender BMesh operator port: `bmo_bisect_plane` and `bmo_extrude`.
//
// The scissors tool draws a line across the screen. That line is unprojected
// into a 3D cutting plane, every triangle is classified by the signed distance
// to that plane and the triangles that straddle it are split along the exact
// intersection points. The resulting cut loop is capped so both halves stay
// watertight.

import { cross, dot, normalize, sub } from './math3d';
import { buildEdges, buildGroups, computeRadius } from './mesh';
const EPSILON = 1e-7;
const WELD_QUANTUM = 1e5;
function signOf(distance) {
  if (distance > EPSILON) return 1;
  if (distance < -EPSILON) return -1;
  return 0;
}
function quantize(value) {
  return Math.round(value * WELD_QUANTUM) / WELD_QUANTUM;
}
function pointKey(point) {
  return `${quantize(point[0])}:${quantize(point[1])}:${quantize(point[2])}`;
}

/** Builds a ray through a screen position for the given camera frame. */
export function screenRay(frame, point, width, height) {
  const ndcX = point.x / Math.max(width, 1) * 2 - 1;
  const ndcY = 1 - point.y / Math.max(height, 1) * 2;
  const tanHalf = Math.tan(frame.fov * Math.PI / 360);
  const aspect = width / Math.max(height, 1);
  const dir = [frame.forward[0] + frame.right[0] * ndcX * aspect * tanHalf + frame.up[0] * ndcY * tanHalf, frame.forward[1] + frame.right[1] * ndcX * aspect * tanHalf + frame.up[1] * ndcY * tanHalf, frame.forward[2] + frame.right[2] * ndcX * aspect * tanHalf + frame.up[2] * ndcY * tanHalf];
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return {
    origin: frame.eye,
    dir: [dir[0] / len, dir[1] / len, dir[2] / len]
  };
}

/**
 * Turns a screen drawn segment into a cutting plane.
 *
 * The plane contains the drawn line at the requested view depth and its
 * normal lies inside the screen plane, so the cut is seen exactly where the
 * user drew it.
 */
export function cutPlaneFromScreenSegment(frame, start, end, width, height, depth) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  // Screen space perpendicular (screen y points down).
  const nx = dy / length;
  const ny = -dx / length;
  const normal = normalize([frame.right[0] * nx + frame.up[0] * -ny, frame.right[1] * nx + frame.up[1] * -ny, frame.right[2] * nx + frame.up[2] * -ny]);
  const rayA = screenRay(frame, start, width, height);
  const depthA = depth / Math.max(dot(rayA.dir, frame.forward), 1e-6);
  const pointA = [rayA.origin[0] + rayA.dir[0] * depthA, rayA.origin[1] + rayA.dir[1] * depthA, rayA.origin[2] + rayA.dir[2] * depthA];
  return {
    normal,
    dist: dot(normal, pointA)
  };
}

/** Newell's method: the area weighted normal of a polygon. */
export function polygonNormal(points) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return [0, 1, 0];
  return [nx / len, ny / len, nz / len];
}
function clipPolygon(vertices, keepPositive) {
  const result = [];
  const count = vertices.length;
  for (let i = 0; i < count; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % count];
    const currentInside = keepPositive ? current.distance >= -EPSILON : current.distance <= EPSILON;
    const nextInside = keepPositive ? next.distance >= -EPSILON : next.distance <= EPSILON;
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const denominator = current.distance - next.distance;
      if (Math.abs(denominator) > 1e-12) {
        const t = current.distance / denominator;
        result.push({
          position: [current.position[0] + (next.position[0] - current.position[0]) * t, current.position[1] + (next.position[1] - current.position[1]) * t, current.position[2] + (next.position[2] - current.position[2]) * t],
          distance: 0
        });
      }
    }
  }
  return result;
}
function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

/** Signed area of a polygon; positive when the winding is counter clockwise. */
export function signedArea(points) {
  return polygonArea(points);
}

/**
 * Splits a mesh with a plane.
 *
 * Every triangle is classified with the signed distance
 * `d = dot(plane_normal, v) - plane_dist`. Triangles that straddle the plane
 * are split at `t = d0 / (d0 - d1)` and the cut loop is capped, so both
 * halves come out watertight.
 */
export function bisectMesh(mesh, plane) {
  const length = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]) || 1;
  const normal = normalize(plane.normal);
  const dist = plane.dist / length;
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  const distances = vertices.map(v => dot(normal, v) - dist);
  const cutVertexIndex = new Map();
  const cutVertex = position => {
    const key = pointKey(position);
    const existing = cutVertexIndex.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push(position);
    distances.push(0);
    cutVertexIndex.set(key, index);
    return index;
  };
  const positiveFaces = [];
  const negativeFaces = [];
  const positiveSlots = [];
  const negativeSlots = [];
  const segments = [];
  let splitTriangles = 0;
  mesh.faces.forEach((face, faceIndex) => {
    const slot = mesh.faceSlot?.[faceIndex] ?? 0;
    for (let i = 1; i < face.length - 1; i++) {
      const indices = [face[0], face[i], face[i + 1]];
      const corners = indices.map(index => ({
        position: mesh.vertices[index],
        distance: distances[index],
        index
      }));
      const signs = corners.map(corner => signOf(corner.distance));
      const hasPositive = signs.some(sign => sign > 0);
      const hasNegative = signs.some(sign => sign < 0);
      if (!hasPositive) {
        negativeFaces.push([...indices]);
        negativeSlots.push(slot);
        continue;
      }
      if (!hasNegative) {
        positiveFaces.push([...indices]);
        positiveSlots.push(slot);
        continue;
      }
      splitTriangles++;
      const positive = clipPolygon(corners, true);
      const negative = clipPolygon(corners, false);
      const cutPoints = [];
      const emit = (polygon, target, slotTarget) => {
        const indicesOut = [];
        for (const corner of polygon) {
          indicesOut.push(corner.index ?? cutVertex(corner.position));
        }
        if (indicesOut.length < 3) return;
        for (let k = 1; k < indicesOut.length - 1; k++) {
          target.push([indicesOut[0], indicesOut[k], indicesOut[k + 1]]);
          slotTarget.push(slot);
        }
      };
      emit(positive, positiveFaces, positiveSlots);
      emit(negative, negativeFaces, negativeSlots);

      // The cut segment of this triangle connects the two points where the
      // plane crosses its edges.
      for (let e = 0; e < 3; e++) {
        const a = corners[e];
        const b = corners[(e + 1) % 3];
        const sa = signOf(a.distance);
        const sb = signOf(b.distance);
        if (sa === 0 || sb === 0 || sa === sb) continue;
        const denominator = a.distance - b.distance;
        if (Math.abs(denominator) < 1e-12) continue;
        const t = a.distance / denominator;
        cutPoints.push([a.position[0] + (b.position[0] - a.position[0]) * t, a.position[1] + (b.position[1] - a.position[1]) * t, a.position[2] + (b.position[2] - a.position[2]) * t]);
      }
      if (cutPoints.length >= 2) {
        segments.push([cutPoints[0], cutPoints[1]]);
      }
    }
  });
  const loops = chainSegments(segments);
  const positiveLoop = loops.map(loop => orientLoop(loop, normal, true));
  const negativeLoop = loops.map(loop => orientLoop(loop, normal, false));
  const slots = mesh.slots ?? [];
  const positiveMesh = buildPart(vertices, positiveFaces, positiveSlots, positiveLoop, mesh.smooth ?? false, slots, cutVertex);
  const negativeMesh = buildPart(vertices, negativeFaces, negativeSlots, negativeLoop, mesh.smooth ?? false, slots, cutVertex);
  return {
    positive: positiveMesh,
    negative: negativeMesh,
    splitTriangles,
    cutVertices: cutVertexIndex.size,
    loops
  };
}
function orientLoop(loop, normal, positive) {
  const loopNormal = polygonNormal(loop);
  const aligned = dot(loopNormal, normal) >= 0;
  if (aligned === positive) return loop;
  return [...loop].reverse();
}

/** Chains cut segments into closed loops. */
function chainSegments(segments) {
  if (!segments.length) return [];
  const adjacency = new Map();
  const keyOf = point => pointKey(point);
  const node = point => {
    const key = keyOf(point);
    let entry = adjacency.get(key);
    if (!entry) {
      entry = {
        point,
        links: []
      };
      adjacency.set(key, entry);
    }
    return key;
  };
  const edgeKeys = [];
  for (const [a, b] of segments) {
    const ka = node(a);
    const kb = node(b);
    if (ka === kb) continue;
    adjacency.get(ka)?.links.push(kb);
    adjacency.get(kb)?.links.push(ka);
    edgeKeys.push([ka, kb]);
  }
  const used = new Set();
  const loops = [];
  for (const [ka, kb] of edgeKeys) {
    const edgeId = `${ka}|${kb}`;
    const reverseId = `${kb}|${ka}`;
    if (used.has(edgeId) || used.has(reverseId)) continue;
    const loop = [adjacency.get(ka).point];
    let current = ka;
    let next = kb;
    let guard = 0;
    while (guard++ < 4096) {
      used.add(`${current}|${next}`);
      loop.push(adjacency.get(next).point);
      if (next === ka) break;
      const links = adjacency.get(next)?.links ?? [];
      const following = links.find(candidate => {
        if (candidate === current) return false;
        return !used.has(`${next}|${candidate}`) && !used.has(`${candidate}|${next}`);
      });
      if (!following) break;
      current = next;
      next = following;
    }
    if (loop.length >= 3) {
      loop.pop();
      loops.push(loop);
    }
  }
  return loops;
}
function buildPart(vertices, faces, faceSlots, loops, smooth, slots, resolve) {
  const remap = new Map();
  const nextVertices = [];
  const translate = index => {
    const existing = remap.get(index);
    if (existing !== undefined) return existing;
    const target = nextVertices.length;
    nextVertices.push(vertices[index]);
    remap.set(index, target);
    return target;
  };
  const nextFaces = faces.map(face => face.map(translate));
  const faceSlot = faces.map((_, index) => faceSlots[index] ?? 0);
  for (const loop of loops) {
    nextFaces.push(loop.map(point => translate(resolve(point))));
    faceSlot.push(0);
  }
  const result = {
    vertices: nextVertices,
    faces: nextFaces,
    edges: buildEdges(nextFaces),
    radius: computeRadius(nextVertices),
    smooth,
    slots: slots.map(slot => ({
      ...slot
    })),
    faceSlot,
    groups: []
  };
  result.groups = buildGroups(result);
  return result;
}

/**
 * Moves the whole positive half along the plane normal.
 *
 * The scissors tool offsets the two halves by a small amount so the cut is
 * clearly visible in the viewport.
 */
export function offsetMesh(mesh, offset) {
  return {
    ...mesh,
    vertices: mesh.vertices.map(v => [v[0] + offset[0], v[1] + offset[1], v[2] + offset[2]])
  };
}

/**
 * Classifies every face of a mesh against a plane.
 *
 * Used by the knife mark mode, which keeps a single object but moves the
 * sliced side into its own material slot.
 */
export function classifyFacesByPlane(mesh, plane) {
  const length = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]) || 1;
  const normal = normalize(plane.normal);
  const dist = plane.dist / length;
  const positive = [];
  const negative = [];
  mesh.faces.forEach((face, index) => {
    let above = 0;
    let below = 0;
    for (const vertexIndex of face) {
      const distance = dot(normal, mesh.vertices[vertexIndex]) - dist;
      if (distance > EPSILON) above++;
      if (distance < -EPSILON) below++;
    }
    if (above && !below) positive.push(index);else if (below && !above) negative.push(index);else if (above && below) {
      // The face straddles the plane: assign it to the side of its centre.
      const centre = faceCentre(mesh, face);
      if (dot(normal, centre) - dist >= 0) positive.push(index);else negative.push(index);
    }
  });
  return {
    positive,
    negative
  };
}

/**
 * Extrudes a region of faces along its average normal.
 *
 * Blender's `bmo_extrude` duplicates the selected faces and bridges them with
 * side wall quads. A negative distance pushes the region inwards.
 */
export function extrudeRegion(mesh, faceIndices, distance) {
  if (!faceIndices.length) return mesh;
  const selected = new Set(faceIndices);
  const valid = faceIndices.filter(index => index >= 0 && index < mesh.faces.length);
  if (!valid.length) return mesh;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (const index of valid) {
    const face = mesh.faces[index];
    const a = mesh.vertices[face[0]];
    const b = mesh.vertices[face[1]];
    const c = mesh.vertices[face[2]];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    nx += uy * vz - uz * vy;
    ny += uz * vx - ux * vz;
    nz += ux * vy - uy * vx;
  }
  const length = Math.hypot(nx, ny, nz) || 1;
  const normal = [nx / length, ny / length, nz / length];
  const vertices = mesh.vertices.map(v => [v[0], v[1], v[2]]);
  const copyIndex = new Map();
  const copyVertex = index => {
    const existing = copyIndex.get(index);
    if (existing !== undefined) return existing;
    const v = vertices[index];
    const target = vertices.length;
    vertices.push([v[0] + normal[0] * distance, v[1] + normal[1] * distance, v[2] + normal[2] * distance]);
    copyIndex.set(index, target);
    return target;
  };
  const boundary = [];
  for (const index of valid) {
    const face = mesh.faces[index];
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      let shared = 0;
      for (const other of valid) {
        const otherFace = mesh.faces[other];
        for (let j = 0; j < otherFace.length; j++) {
          const p = otherFace[j];
          const q = otherFace[(j + 1) % otherFace.length];
          if (p === a && q === b || p === b && q === a) shared++;
        }
      }
      if (shared < 2) boundary.push([a, b]);
    }
  }
  const faces = [];
  mesh.faces.forEach((face, index) => {
    if (selected.has(index)) faces.push(face.map(copyVertex));else faces.push([...face]);
  });
  for (const [a, b] of boundary) faces.push([a, b, copyVertex(b), copyVertex(a)]);
  const result = {
    vertices,
    faces,
    edges: buildEdges(faces),
    radius: computeRadius(vertices),
    smooth: mesh.smooth ?? false,
    slots: (mesh.slots ?? []).map(slot => ({
      ...slot
    })),
    faceSlot: [...(mesh.faceSlot ?? [])],
    groups: []
  };
  while (result.faceSlot.length < faces.length) result.faceSlot.push(0);
  result.groups = buildGroups(result);
  return result;
}

/** Returns the point of a triangle that sits deepest along the plane normal. */
function faceCentre(mesh, face) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const index of face) {
    const vertex = mesh.vertices[index];
    x += vertex[0];
    y += vertex[1];
    z += vertex[2];
  }
  const count = face.length || 1;
  return [x / count, y / count, z / count];
}
export function deepestPoint(mesh, face, normal) {
  void normal;
  return faceCentre(mesh, face);
}

/** Distance from a point to the cutting plane. */
export function signedDistance(plane, point) {
  const length = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]) || 1;
  const normal = [plane.normal[0] / length, plane.normal[1] / length, plane.normal[2] / length];
  return dot(normal, point) - plane.dist / length;
}

/** Builds a plane that faces the camera and passes through a world point. */
export function planeFacingCamera(point, frame) {
  const normal = normalize(frame.forward);
  return {
    normal,
    dist: dot(normal, point)
  };
}

/** Convenience helper: a plane whose normal is the cross product of two edges. */
export function planeFromEdges(a, b, c) {
  const normal = normalize(cross(sub(b, a), sub(c, a)));
  return {
    normal,
    dist: dot(normal, a)
  };
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiYmlzZWN0LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEJsZW5kZXIgQk1lc2ggb3BlcmF0b3IgcG9ydDogYGJtb19iaXNlY3RfcGxhbmVgIGFuZCBgYm1vX2V4dHJ1ZGVgLlxuLy9cbi8vIFRoZSBzY2lzc29ycyB0b29sIGRyYXdzIGEgbGluZSBhY3Jvc3MgdGhlIHNjcmVlbi4gVGhhdCBsaW5lIGlzIHVucHJvamVjdGVkXG4vLyBpbnRvIGEgM0QgY3V0dGluZyBwbGFuZSwgZXZlcnkgdHJpYW5nbGUgaXMgY2xhc3NpZmllZCBieSB0aGUgc2lnbmVkIGRpc3RhbmNlXG4vLyB0byB0aGF0IHBsYW5lIGFuZCB0aGUgdHJpYW5nbGVzIHRoYXQgc3RyYWRkbGUgaXQgYXJlIHNwbGl0IGFsb25nIHRoZSBleGFjdFxuLy8gaW50ZXJzZWN0aW9uIHBvaW50cy4gVGhlIHJlc3VsdGluZyBjdXQgbG9vcCBpcyBjYXBwZWQgc28gYm90aCBoYWx2ZXMgc3RheVxuLy8gd2F0ZXJ0aWdodC5cblxuaW1wb3J0IHR5cGUgeyBWZWMzIH0gZnJvbSAnLi9tYXRoM2QnO1xuaW1wb3J0IHsgY3Jvc3MsIGRvdCwgbm9ybWFsaXplLCBzdWIgfSBmcm9tICcuL21hdGgzZCc7XG5pbXBvcnQgeyBidWlsZEVkZ2VzLCBidWlsZEdyb3VwcywgY29tcHV0ZVJhZGl1cywgdHlwZSBGYWNlLCB0eXBlIE1hdGVyaWFsU2xvdCwgdHlwZSBNZXNoIH0gZnJvbSAnLi9tZXNoJztcblxuY29uc3QgRVBTSUxPTiA9IDFlLTc7XG5jb25zdCBXRUxEX1FVQU5UVU0gPSAxZTU7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ3V0UGxhbmUge1xuXHRub3JtYWw6IFZlYzM7XG5cdGRpc3Q6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTY3JlZW5Qb2ludCB7XG5cdHg6IG51bWJlcjtcblx0eTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhbWVyYUZyYW1lIHtcblx0ZXllOiBWZWMzO1xuXHRmb3J3YXJkOiBWZWMzO1xuXHRyaWdodDogVmVjMztcblx0dXA6IFZlYzM7XG5cdGZvdjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEJpc2VjdFJlc3VsdCB7XG5cdHBvc2l0aXZlOiBNZXNoO1xuXHRuZWdhdGl2ZTogTWVzaDtcblx0LyoqIE51bWJlciBvZiB0cmlhbmdsZXMgdGhhdCB3ZXJlIHNwbGl0IGJ5IHRoZSBwbGFuZS4gKi9cblx0c3BsaXRUcmlhbmdsZXM6IG51bWJlcjtcblx0LyoqIFZlcnRpY2VzIGNyZWF0ZWQgYnkgdGhlIGN1dC4gKi9cblx0Y3V0VmVydGljZXM6IG51bWJlcjtcblx0LyoqIENsb3NlZCBsb29wcyB0aGF0IGRlc2NyaWJlIHRoZSBjdXQgdGhyb3VnaCB0aGUgc3VyZmFjZS4gKi9cblx0bG9vcHM6IFZlYzNbXVtdO1xufVxuXG5mdW5jdGlvbiBzaWduT2YoZGlzdGFuY2U6IG51bWJlcik6IG51bWJlciB7XG5cdGlmIChkaXN0YW5jZSA+IEVQU0lMT04pIHJldHVybiAxO1xuXHRpZiAoZGlzdGFuY2UgPCAtRVBTSUxPTikgcmV0dXJuIC0xO1xuXHRyZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gcXVhbnRpemUodmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLnJvdW5kKHZhbHVlICogV0VMRF9RVUFOVFVNKSAvIFdFTERfUVVBTlRVTTtcbn1cblxuZnVuY3Rpb24gcG9pbnRLZXkocG9pbnQ6IFZlYzMpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7cXVhbnRpemUocG9pbnRbMF0pfToke3F1YW50aXplKHBvaW50WzFdKX06JHtxdWFudGl6ZShwb2ludFsyXSl9YDtcbn1cblxuLyoqIEJ1aWxkcyBhIHJheSB0aHJvdWdoIGEgc2NyZWVuIHBvc2l0aW9uIGZvciB0aGUgZ2l2ZW4gY2FtZXJhIGZyYW1lLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNjcmVlblJheShmcmFtZTogQ2FtZXJhRnJhbWUsIHBvaW50OiBTY3JlZW5Qb2ludCwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcblx0Y29uc3QgbmRjWCA9IChwb2ludC54IC8gTWF0aC5tYXgod2lkdGgsIDEpKSAqIDIgLSAxO1xuXHRjb25zdCBuZGNZID0gMSAtIChwb2ludC55IC8gTWF0aC5tYXgoaGVpZ2h0LCAxKSkgKiAyO1xuXHRjb25zdCB0YW5IYWxmID0gTWF0aC50YW4oKGZyYW1lLmZvdiAqIE1hdGguUEkpIC8gMzYwKTtcblx0Y29uc3QgYXNwZWN0ID0gd2lkdGggLyBNYXRoLm1heChoZWlnaHQsIDEpO1xuXHRjb25zdCBkaXI6IFZlYzMgPSBbXG5cdFx0ZnJhbWUuZm9yd2FyZFswXSArIGZyYW1lLnJpZ2h0WzBdICogbmRjWCAqIGFzcGVjdCAqIHRhbkhhbGYgKyBmcmFtZS51cFswXSAqIG5kY1kgKiB0YW5IYWxmLFxuXHRcdGZyYW1lLmZvcndhcmRbMV0gKyBmcmFtZS5yaWdodFsxXSAqIG5kY1ggKiBhc3BlY3QgKiB0YW5IYWxmICsgZnJhbWUudXBbMV0gKiBuZGNZICogdGFuSGFsZixcblx0XHRmcmFtZS5mb3J3YXJkWzJdICsgZnJhbWUucmlnaHRbMl0gKiBuZGNYICogYXNwZWN0ICogdGFuSGFsZiArIGZyYW1lLnVwWzJdICogbmRjWSAqIHRhbkhhbGYsXG5cdF07XG5cdGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZGlyWzBdLCBkaXJbMV0sIGRpclsyXSkgfHwgMTtcblx0cmV0dXJuIHsgb3JpZ2luOiBmcmFtZS5leWUsIGRpcjogW2RpclswXSAvIGxlbiwgZGlyWzFdIC8gbGVuLCBkaXJbMl0gLyBsZW5dIGFzIFZlYzMgfTtcbn1cblxuLyoqXG4gKiBUdXJucyBhIHNjcmVlbiBkcmF3biBzZWdtZW50IGludG8gYSBjdXR0aW5nIHBsYW5lLlxuICpcbiAqIFRoZSBwbGFuZSBjb250YWlucyB0aGUgZHJhd24gbGluZSBhdCB0aGUgcmVxdWVzdGVkIHZpZXcgZGVwdGggYW5kIGl0c1xuICogbm9ybWFsIGxpZXMgaW5zaWRlIHRoZSBzY3JlZW4gcGxhbmUsIHNvIHRoZSBjdXQgaXMgc2VlbiBleGFjdGx5IHdoZXJlIHRoZVxuICogdXNlciBkcmV3IGl0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3V0UGxhbmVGcm9tU2NyZWVuU2VnbWVudChcblx0ZnJhbWU6IENhbWVyYUZyYW1lLFxuXHRzdGFydDogU2NyZWVuUG9pbnQsXG5cdGVuZDogU2NyZWVuUG9pbnQsXG5cdHdpZHRoOiBudW1iZXIsXG5cdGhlaWdodDogbnVtYmVyLFxuXHRkZXB0aDogbnVtYmVyLFxuKTogQ3V0UGxhbmUge1xuXHRjb25zdCBkeCA9IGVuZC54IC0gc3RhcnQueDtcblx0Y29uc3QgZHkgPSBlbmQueSAtIHN0YXJ0Lnk7XG5cdGNvbnN0IGxlbmd0aCA9IE1hdGguaHlwb3QoZHgsIGR5KSB8fCAxO1xuXHQvLyBTY3JlZW4gc3BhY2UgcGVycGVuZGljdWxhciAoc2NyZWVuIHkgcG9pbnRzIGRvd24pLlxuXHRjb25zdCBueCA9IGR5IC8gbGVuZ3RoO1xuXHRjb25zdCBueSA9IC1keCAvIGxlbmd0aDtcblxuXHRjb25zdCBub3JtYWwgPSBub3JtYWxpemUoW1xuXHRcdGZyYW1lLnJpZ2h0WzBdICogbnggKyBmcmFtZS51cFswXSAqIC1ueSxcblx0XHRmcmFtZS5yaWdodFsxXSAqIG54ICsgZnJhbWUudXBbMV0gKiAtbnksXG5cdFx0ZnJhbWUucmlnaHRbMl0gKiBueCArIGZyYW1lLnVwWzJdICogLW55LFxuXHRdKTtcblxuXHRjb25zdCByYXlBID0gc2NyZWVuUmF5KGZyYW1lLCBzdGFydCwgd2lkdGgsIGhlaWdodCk7XG5cdGNvbnN0IGRlcHRoQSA9IGRlcHRoIC8gTWF0aC5tYXgoZG90KHJheUEuZGlyLCBmcmFtZS5mb3J3YXJkKSwgMWUtNik7XG5cdGNvbnN0IHBvaW50QTogVmVjMyA9IFtcblx0XHRyYXlBLm9yaWdpblswXSArIHJheUEuZGlyWzBdICogZGVwdGhBLFxuXHRcdHJheUEub3JpZ2luWzFdICsgcmF5QS5kaXJbMV0gKiBkZXB0aEEsXG5cdFx0cmF5QS5vcmlnaW5bMl0gKyByYXlBLmRpclsyXSAqIGRlcHRoQSxcblx0XTtcblx0cmV0dXJuIHsgbm9ybWFsLCBkaXN0OiBkb3Qobm9ybWFsLCBwb2ludEEpIH07XG59XG5cbi8qKiBOZXdlbGwncyBtZXRob2Q6IHRoZSBhcmVhIHdlaWdodGVkIG5vcm1hbCBvZiBhIHBvbHlnb24uICovXG5leHBvcnQgZnVuY3Rpb24gcG9seWdvbk5vcm1hbChwb2ludHM6IFZlYzNbXSk6IFZlYzMge1xuXHRsZXQgbnggPSAwO1xuXHRsZXQgbnkgPSAwO1xuXHRsZXQgbnogPSAwO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHBvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGEgPSBwb2ludHNbaV07XG5cdFx0Y29uc3QgYiA9IHBvaW50c1soaSArIDEpICUgcG9pbnRzLmxlbmd0aF07XG5cdFx0bnggKz0gKGFbMV0gLSBiWzFdKSAqIChhWzJdICsgYlsyXSk7XG5cdFx0bnkgKz0gKGFbMl0gLSBiWzJdKSAqIChhWzBdICsgYlswXSk7XG5cdFx0bnogKz0gKGFbMF0gLSBiWzBdKSAqIChhWzFdICsgYlsxXSk7XG5cdH1cblx0Y29uc3QgbGVuID0gTWF0aC5oeXBvdChueCwgbnksIG56KTtcblx0aWYgKGxlbiA8IDFlLTEyKSByZXR1cm4gWzAsIDEsIDBdO1xuXHRyZXR1cm4gW254IC8gbGVuLCBueSAvIGxlbiwgbnogLyBsZW5dO1xufVxuXG5pbnRlcmZhY2UgQ2xpcFZlcnRleCB7XG5cdHBvc2l0aW9uOiBWZWMzO1xuXHRkaXN0YW5jZTogbnVtYmVyO1xuXHQvKiogSW5kZXggb2YgdGhlIHZlcnRleCBpbiB0aGUgc291cmNlIG1lc2gsIG1pc3NpbmcgZm9yIGN1dCBwb2ludHMuICovXG5cdGluZGV4PzogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBjbGlwUG9seWdvbih2ZXJ0aWNlczogQ2xpcFZlcnRleFtdLCBrZWVwUG9zaXRpdmU6IGJvb2xlYW4pOiBDbGlwVmVydGV4W10ge1xuXHRjb25zdCByZXN1bHQ6IENsaXBWZXJ0ZXhbXSA9IFtdO1xuXHRjb25zdCBjb3VudCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHZlcnRpY2VzW2ldO1xuXHRcdGNvbnN0IG5leHQgPSB2ZXJ0aWNlc1soaSArIDEpICUgY291bnRdO1xuXHRcdGNvbnN0IGN1cnJlbnRJbnNpZGUgPSBrZWVwUG9zaXRpdmUgPyBjdXJyZW50LmRpc3RhbmNlID49IC1FUFNJTE9OIDogY3VycmVudC5kaXN0YW5jZSA8PSBFUFNJTE9OO1xuXHRcdGNvbnN0IG5leHRJbnNpZGUgPSBrZWVwUG9zaXRpdmUgPyBuZXh0LmRpc3RhbmNlID49IC1FUFNJTE9OIDogbmV4dC5kaXN0YW5jZSA8PSBFUFNJTE9OO1xuXHRcdGlmIChjdXJyZW50SW5zaWRlKSByZXN1bHQucHVzaChjdXJyZW50KTtcblx0XHRpZiAoY3VycmVudEluc2lkZSAhPT0gbmV4dEluc2lkZSkge1xuXHRcdFx0Y29uc3QgZGVub21pbmF0b3IgPSBjdXJyZW50LmRpc3RhbmNlIC0gbmV4dC5kaXN0YW5jZTtcblx0XHRcdGlmIChNYXRoLmFicyhkZW5vbWluYXRvcikgPiAxZS0xMikge1xuXHRcdFx0XHRjb25zdCB0ID0gY3VycmVudC5kaXN0YW5jZSAvIGRlbm9taW5hdG9yO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0cG9zaXRpb246IFtcblx0XHRcdFx0XHRcdGN1cnJlbnQucG9zaXRpb25bMF0gKyAobmV4dC5wb3NpdGlvblswXSAtIGN1cnJlbnQucG9zaXRpb25bMF0pICogdCxcblx0XHRcdFx0XHRcdGN1cnJlbnQucG9zaXRpb25bMV0gKyAobmV4dC5wb3NpdGlvblsxXSAtIGN1cnJlbnQucG9zaXRpb25bMV0pICogdCxcblx0XHRcdFx0XHRcdGN1cnJlbnQucG9zaXRpb25bMl0gKyAobmV4dC5wb3NpdGlvblsyXSAtIGN1cnJlbnQucG9zaXRpb25bMl0pICogdCxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRpc3RhbmNlOiAwLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcG9seWdvbkFyZWEocG9pbnRzOiBWZWMzW10pOiBudW1iZXIge1xuXHRsZXQgYXJlYSA9IDA7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgYSA9IHBvaW50c1tpXTtcblx0XHRjb25zdCBiID0gcG9pbnRzWyhpICsgMSkgJSBwb2ludHMubGVuZ3RoXTtcblx0XHRhcmVhICs9IGFbMF0gKiBiWzFdIC0gYlswXSAqIGFbMV07XG5cdH1cblx0cmV0dXJuIGFyZWEgLyAyO1xufVxuXG4vKiogU2lnbmVkIGFyZWEgb2YgYSBwb2x5Z29uOyBwb3NpdGl2ZSB3aGVuIHRoZSB3aW5kaW5nIGlzIGNvdW50ZXIgY2xvY2t3aXNlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNpZ25lZEFyZWEocG9pbnRzOiBWZWMzW10pOiBudW1iZXIge1xuXHRyZXR1cm4gcG9seWdvbkFyZWEocG9pbnRzKTtcbn1cblxuLyoqXG4gKiBTcGxpdHMgYSBtZXNoIHdpdGggYSBwbGFuZS5cbiAqXG4gKiBFdmVyeSB0cmlhbmdsZSBpcyBjbGFzc2lmaWVkIHdpdGggdGhlIHNpZ25lZCBkaXN0YW5jZVxuICogYGQgPSBkb3QocGxhbmVfbm9ybWFsLCB2KSAtIHBsYW5lX2Rpc3RgLiBUcmlhbmdsZXMgdGhhdCBzdHJhZGRsZSB0aGUgcGxhbmVcbiAqIGFyZSBzcGxpdCBhdCBgdCA9IGQwIC8gKGQwIC0gZDEpYCBhbmQgdGhlIGN1dCBsb29wIGlzIGNhcHBlZCwgc28gYm90aFxuICogaGFsdmVzIGNvbWUgb3V0IHdhdGVydGlnaHQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaXNlY3RNZXNoKG1lc2g6IE1lc2gsIHBsYW5lOiBDdXRQbGFuZSk6IEJpc2VjdFJlc3VsdCB7XG5cdGNvbnN0IGxlbmd0aCA9IE1hdGguaHlwb3QocGxhbmUubm9ybWFsWzBdLCBwbGFuZS5ub3JtYWxbMV0sIHBsYW5lLm5vcm1hbFsyXSkgfHwgMTtcblx0Y29uc3Qgbm9ybWFsID0gbm9ybWFsaXplKHBsYW5lLm5vcm1hbCk7XG5cdGNvbnN0IGRpc3QgPSBwbGFuZS5kaXN0IC8gbGVuZ3RoO1xuXG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBtZXNoLnZlcnRpY2VzLm1hcCgodikgPT4gW3ZbMF0sIHZbMV0sIHZbMl1dIGFzIFZlYzMpO1xuXHRjb25zdCBkaXN0YW5jZXMgPSB2ZXJ0aWNlcy5tYXAoKHYpID0+IGRvdChub3JtYWwsIHYpIC0gZGlzdCk7XG5cblx0Y29uc3QgY3V0VmVydGV4SW5kZXggPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdGNvbnN0IGN1dFZlcnRleCA9IChwb3NpdGlvbjogVmVjMyk6IG51bWJlciA9PiB7XG5cdFx0Y29uc3Qga2V5ID0gcG9pbnRLZXkocG9zaXRpb24pO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gY3V0VmVydGV4SW5kZXguZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nICE9PSB1bmRlZmluZWQpIHJldHVybiBleGlzdGluZztcblx0XHRjb25zdCBpbmRleCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0XHR2ZXJ0aWNlcy5wdXNoKHBvc2l0aW9uKTtcblx0XHRkaXN0YW5jZXMucHVzaCgwKTtcblx0XHRjdXRWZXJ0ZXhJbmRleC5zZXQoa2V5LCBpbmRleCk7XG5cdFx0cmV0dXJuIGluZGV4O1xuXHR9O1xuXG5cdGNvbnN0IHBvc2l0aXZlRmFjZXM6IG51bWJlcltdW10gPSBbXTtcblx0Y29uc3QgbmVnYXRpdmVGYWNlczogbnVtYmVyW11bXSA9IFtdO1xuXHRjb25zdCBwb3NpdGl2ZVNsb3RzOiBudW1iZXJbXSA9IFtdO1xuXHRjb25zdCBuZWdhdGl2ZVNsb3RzOiBudW1iZXJbXSA9IFtdO1xuXHRjb25zdCBzZWdtZW50czogW1ZlYzMsIFZlYzNdW10gPSBbXTtcblx0bGV0IHNwbGl0VHJpYW5nbGVzID0gMDtcblxuXHRtZXNoLmZhY2VzLmZvckVhY2goKGZhY2UsIGZhY2VJbmRleCkgPT4ge1xuXHRcdGNvbnN0IHNsb3QgPSBtZXNoLmZhY2VTbG90Py5bZmFjZUluZGV4XSA/PyAwO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZmFjZS5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdGNvbnN0IGluZGljZXMgPSBbZmFjZVswXSwgZmFjZVtpXSwgZmFjZVtpICsgMV1dO1xuXHRcdFx0Y29uc3QgY29ybmVyczogQ2xpcFZlcnRleFtdID0gaW5kaWNlcy5tYXAoKGluZGV4KSA9PiAoe1xuXHRcdFx0XHRwb3NpdGlvbjogbWVzaC52ZXJ0aWNlc1tpbmRleF0sXG5cdFx0XHRcdGRpc3RhbmNlOiBkaXN0YW5jZXNbaW5kZXhdLFxuXHRcdFx0XHRpbmRleCxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHNpZ25zID0gY29ybmVycy5tYXAoKGNvcm5lcikgPT4gc2lnbk9mKGNvcm5lci5kaXN0YW5jZSkpO1xuXHRcdFx0Y29uc3QgaGFzUG9zaXRpdmUgPSBzaWducy5zb21lKChzaWduKSA9PiBzaWduID4gMCk7XG5cdFx0XHRjb25zdCBoYXNOZWdhdGl2ZSA9IHNpZ25zLnNvbWUoKHNpZ24pID0+IHNpZ24gPCAwKTtcblxuXHRcdFx0aWYgKCFoYXNQb3NpdGl2ZSkge1xuXHRcdFx0XHRuZWdhdGl2ZUZhY2VzLnB1c2goWy4uLmluZGljZXNdKTtcblx0XHRcdFx0bmVnYXRpdmVTbG90cy5wdXNoKHNsb3QpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghaGFzTmVnYXRpdmUpIHtcblx0XHRcdFx0cG9zaXRpdmVGYWNlcy5wdXNoKFsuLi5pbmRpY2VzXSk7XG5cdFx0XHRcdHBvc2l0aXZlU2xvdHMucHVzaChzbG90KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHNwbGl0VHJpYW5nbGVzKys7XG5cblx0XHRcdGNvbnN0IHBvc2l0aXZlID0gY2xpcFBvbHlnb24oY29ybmVycywgdHJ1ZSk7XG5cdFx0XHRjb25zdCBuZWdhdGl2ZSA9IGNsaXBQb2x5Z29uKGNvcm5lcnMsIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgY3V0UG9pbnRzOiBWZWMzW10gPSBbXTtcblx0XHRcdGNvbnN0IGVtaXQgPSAocG9seWdvbjogQ2xpcFZlcnRleFtdLCB0YXJnZXQ6IG51bWJlcltdW10sIHNsb3RUYXJnZXQ6IG51bWJlcltdKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluZGljZXNPdXQ6IG51bWJlcltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgY29ybmVyIG9mIHBvbHlnb24pIHtcblx0XHRcdFx0XHRpbmRpY2VzT3V0LnB1c2goY29ybmVyLmluZGV4ID8/IGN1dFZlcnRleChjb3JuZXIucG9zaXRpb24pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW5kaWNlc091dC5sZW5ndGggPCAzKSByZXR1cm47XG5cdFx0XHRcdGZvciAobGV0IGsgPSAxOyBrIDwgaW5kaWNlc091dC5sZW5ndGggLSAxOyBrKyspIHtcblx0XHRcdFx0XHR0YXJnZXQucHVzaChbaW5kaWNlc091dFswXSwgaW5kaWNlc091dFtrXSwgaW5kaWNlc091dFtrICsgMV1dKTtcblx0XHRcdFx0XHRzbG90VGFyZ2V0LnB1c2goc2xvdCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGVtaXQocG9zaXRpdmUsIHBvc2l0aXZlRmFjZXMsIHBvc2l0aXZlU2xvdHMpO1xuXHRcdFx0ZW1pdChuZWdhdGl2ZSwgbmVnYXRpdmVGYWNlcywgbmVnYXRpdmVTbG90cyk7XG5cblx0XHRcdC8vIFRoZSBjdXQgc2VnbWVudCBvZiB0aGlzIHRyaWFuZ2xlIGNvbm5lY3RzIHRoZSB0d28gcG9pbnRzIHdoZXJlIHRoZVxuXHRcdFx0Ly8gcGxhbmUgY3Jvc3NlcyBpdHMgZWRnZXMuXG5cdFx0XHRmb3IgKGxldCBlID0gMDsgZSA8IDM7IGUrKykge1xuXHRcdFx0XHRjb25zdCBhID0gY29ybmVyc1tlXTtcblx0XHRcdFx0Y29uc3QgYiA9IGNvcm5lcnNbKGUgKyAxKSAlIDNdO1xuXHRcdFx0XHRjb25zdCBzYSA9IHNpZ25PZihhLmRpc3RhbmNlKTtcblx0XHRcdFx0Y29uc3Qgc2IgPSBzaWduT2YoYi5kaXN0YW5jZSk7XG5cdFx0XHRcdGlmIChzYSA9PT0gMCB8fCBzYiA9PT0gMCB8fCBzYSA9PT0gc2IpIGNvbnRpbnVlO1xuXHRcdFx0XHRjb25zdCBkZW5vbWluYXRvciA9IGEuZGlzdGFuY2UgLSBiLmRpc3RhbmNlO1xuXHRcdFx0XHRpZiAoTWF0aC5hYnMoZGVub21pbmF0b3IpIDwgMWUtMTIpIGNvbnRpbnVlO1xuXHRcdFx0XHRjb25zdCB0ID0gYS5kaXN0YW5jZSAvIGRlbm9taW5hdG9yO1xuXHRcdFx0XHRjdXRQb2ludHMucHVzaChbXG5cdFx0XHRcdFx0YS5wb3NpdGlvblswXSArIChiLnBvc2l0aW9uWzBdIC0gYS5wb3NpdGlvblswXSkgKiB0LFxuXHRcdFx0XHRcdGEucG9zaXRpb25bMV0gKyAoYi5wb3NpdGlvblsxXSAtIGEucG9zaXRpb25bMV0pICogdCxcblx0XHRcdFx0XHRhLnBvc2l0aW9uWzJdICsgKGIucG9zaXRpb25bMl0gLSBhLnBvc2l0aW9uWzJdKSAqIHQsXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1dFBvaW50cy5sZW5ndGggPj0gMikge1xuXHRcdFx0XHRzZWdtZW50cy5wdXNoKFtjdXRQb2ludHNbMF0sIGN1dFBvaW50c1sxXV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0Y29uc3QgbG9vcHMgPSBjaGFpblNlZ21lbnRzKHNlZ21lbnRzKTtcblxuXHRjb25zdCBwb3NpdGl2ZUxvb3AgPSBsb29wcy5tYXAoKGxvb3ApID0+IG9yaWVudExvb3AobG9vcCwgbm9ybWFsLCB0cnVlKSk7XG5cdGNvbnN0IG5lZ2F0aXZlTG9vcCA9IGxvb3BzLm1hcCgobG9vcCkgPT4gb3JpZW50TG9vcChsb29wLCBub3JtYWwsIGZhbHNlKSk7XG5cblx0Y29uc3Qgc2xvdHMgPSBtZXNoLnNsb3RzID8/IFtdO1xuXHRjb25zdCBwb3NpdGl2ZU1lc2ggPSBidWlsZFBhcnQodmVydGljZXMsIHBvc2l0aXZlRmFjZXMsIHBvc2l0aXZlU2xvdHMsIHBvc2l0aXZlTG9vcCwgbWVzaC5zbW9vdGggPz8gZmFsc2UsIHNsb3RzLCBjdXRWZXJ0ZXgpO1xuXHRjb25zdCBuZWdhdGl2ZU1lc2ggPSBidWlsZFBhcnQodmVydGljZXMsIG5lZ2F0aXZlRmFjZXMsIG5lZ2F0aXZlU2xvdHMsIG5lZ2F0aXZlTG9vcCwgbWVzaC5zbW9vdGggPz8gZmFsc2UsIHNsb3RzLCBjdXRWZXJ0ZXgpO1xuXG5cdHJldHVybiB7XG5cdFx0cG9zaXRpdmU6IHBvc2l0aXZlTWVzaCxcblx0XHRuZWdhdGl2ZTogbmVnYXRpdmVNZXNoLFxuXHRcdHNwbGl0VHJpYW5nbGVzLFxuXHRcdGN1dFZlcnRpY2VzOiBjdXRWZXJ0ZXhJbmRleC5zaXplLFxuXHRcdGxvb3BzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBvcmllbnRMb29wKGxvb3A6IFZlYzNbXSwgbm9ybWFsOiBWZWMzLCBwb3NpdGl2ZTogYm9vbGVhbik6IFZlYzNbXSB7XG5cdGNvbnN0IGxvb3BOb3JtYWwgPSBwb2x5Z29uTm9ybWFsKGxvb3ApO1xuXHRjb25zdCBhbGlnbmVkID0gZG90KGxvb3BOb3JtYWwsIG5vcm1hbCkgPj0gMDtcblx0aWYgKGFsaWduZWQgPT09IHBvc2l0aXZlKSByZXR1cm4gbG9vcDtcblx0cmV0dXJuIFsuLi5sb29wXS5yZXZlcnNlKCk7XG59XG5cbi8qKiBDaGFpbnMgY3V0IHNlZ21lbnRzIGludG8gY2xvc2VkIGxvb3BzLiAqL1xuZnVuY3Rpb24gY2hhaW5TZWdtZW50cyhzZWdtZW50czogW1ZlYzMsIFZlYzNdW10pOiBWZWMzW11bXSB7XG5cdGlmICghc2VnbWVudHMubGVuZ3RoKSByZXR1cm4gW107XG5cdGNvbnN0IGFkamFjZW5jeSA9IG5ldyBNYXA8c3RyaW5nLCB7IHBvaW50OiBWZWMzOyBsaW5rczogc3RyaW5nW10gfT4oKTtcblx0Y29uc3Qga2V5T2YgPSAocG9pbnQ6IFZlYzMpID0+IHBvaW50S2V5KHBvaW50KTtcblxuXHRjb25zdCBub2RlID0gKHBvaW50OiBWZWMzKTogc3RyaW5nID0+IHtcblx0XHRjb25zdCBrZXkgPSBrZXlPZihwb2ludCk7XG5cdFx0bGV0IGVudHJ5ID0gYWRqYWNlbmN5LmdldChrZXkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdGVudHJ5ID0geyBwb2ludCwgbGlua3M6IFtdIH07XG5cdFx0XHRhZGphY2VuY3kuc2V0KGtleSwgZW50cnkpO1xuXHRcdH1cblx0XHRyZXR1cm4ga2V5O1xuXHR9O1xuXG5cdGNvbnN0IGVkZ2VLZXlzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0Zm9yIChjb25zdCBbYSwgYl0gb2Ygc2VnbWVudHMpIHtcblx0XHRjb25zdCBrYSA9IG5vZGUoYSk7XG5cdFx0Y29uc3Qga2IgPSBub2RlKGIpO1xuXHRcdGlmIChrYSA9PT0ga2IpIGNvbnRpbnVlO1xuXHRcdGFkamFjZW5jeS5nZXQoa2EpPy5saW5rcy5wdXNoKGtiKTtcblx0XHRhZGphY2VuY3kuZ2V0KGtiKT8ubGlua3MucHVzaChrYSk7XG5cdFx0ZWRnZUtleXMucHVzaChba2EsIGtiXSk7XG5cdH1cblxuXHRjb25zdCB1c2VkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGxvb3BzOiBWZWMzW11bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IFtrYSwga2JdIG9mIGVkZ2VLZXlzKSB7XG5cdFx0Y29uc3QgZWRnZUlkID0gYCR7a2F9fCR7a2J9YDtcblx0XHRjb25zdCByZXZlcnNlSWQgPSBgJHtrYn18JHtrYX1gO1xuXHRcdGlmICh1c2VkLmhhcyhlZGdlSWQpIHx8IHVzZWQuaGFzKHJldmVyc2VJZCkpIGNvbnRpbnVlO1xuXHRcdGNvbnN0IGxvb3A6IFZlYzNbXSA9IFthZGphY2VuY3kuZ2V0KGthKSEucG9pbnRdO1xuXHRcdGxldCBjdXJyZW50ID0ga2E7XG5cdFx0bGV0IG5leHQgPSBrYjtcblx0XHRsZXQgZ3VhcmQgPSAwO1xuXHRcdHdoaWxlIChndWFyZCsrIDwgNDA5Nikge1xuXHRcdFx0dXNlZC5hZGQoYCR7Y3VycmVudH18JHtuZXh0fWApO1xuXHRcdFx0bG9vcC5wdXNoKGFkamFjZW5jeS5nZXQobmV4dCkhLnBvaW50KTtcblx0XHRcdGlmIChuZXh0ID09PSBrYSkgYnJlYWs7XG5cdFx0XHRjb25zdCBsaW5rcyA9IGFkamFjZW5jeS5nZXQobmV4dCk/LmxpbmtzID8/IFtdO1xuXHRcdFx0Y29uc3QgZm9sbG93aW5nID0gbGlua3MuZmluZCgoY2FuZGlkYXRlKSA9PiB7XG5cdFx0XHRcdGlmIChjYW5kaWRhdGUgPT09IGN1cnJlbnQpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0cmV0dXJuICF1c2VkLmhhcyhgJHtuZXh0fXwke2NhbmRpZGF0ZX1gKSAmJiAhdXNlZC5oYXMoYCR7Y2FuZGlkYXRlfXwke25leHR9YCk7XG5cdFx0XHR9KTtcblx0XHRcdGlmICghZm9sbG93aW5nKSBicmVhaztcblx0XHRcdGN1cnJlbnQgPSBuZXh0O1xuXHRcdFx0bmV4dCA9IGZvbGxvd2luZztcblx0XHR9XG5cdFx0aWYgKGxvb3AubGVuZ3RoID49IDMpIHtcblx0XHRcdGxvb3AucG9wKCk7XG5cdFx0XHRsb29wcy5wdXNoKGxvb3ApO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gbG9vcHM7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUGFydChcblx0dmVydGljZXM6IFZlYzNbXSxcblx0ZmFjZXM6IG51bWJlcltdW10sXG5cdGZhY2VTbG90czogbnVtYmVyW10sXG5cdGxvb3BzOiBWZWMzW11bXSxcblx0c21vb3RoOiBib29sZWFuLFxuXHRzbG90czogTWF0ZXJpYWxTbG90W10sXG5cdHJlc29sdmU6IChwb3NpdGlvbjogVmVjMykgPT4gbnVtYmVyLFxuKTogTWVzaCB7XG5cdGNvbnN0IHJlbWFwID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcblx0Y29uc3QgbmV4dFZlcnRpY2VzOiBWZWMzW10gPSBbXTtcblx0Y29uc3QgdHJhbnNsYXRlID0gKGluZGV4OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gcmVtYXAuZ2V0KGluZGV4KTtcblx0XHRpZiAoZXhpc3RpbmcgIT09IHVuZGVmaW5lZCkgcmV0dXJuIGV4aXN0aW5nO1xuXHRcdGNvbnN0IHRhcmdldCA9IG5leHRWZXJ0aWNlcy5sZW5ndGg7XG5cdFx0bmV4dFZlcnRpY2VzLnB1c2godmVydGljZXNbaW5kZXhdKTtcblx0XHRyZW1hcC5zZXQoaW5kZXgsIHRhcmdldCk7XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fTtcblxuXHRjb25zdCBuZXh0RmFjZXM6IG51bWJlcltdW10gPSBmYWNlcy5tYXAoKGZhY2UpID0+IGZhY2UubWFwKHRyYW5zbGF0ZSkpO1xuXHRjb25zdCBmYWNlU2xvdCA9IGZhY2VzLm1hcCgoXywgaW5kZXgpID0+IGZhY2VTbG90c1tpbmRleF0gPz8gMCk7XG5cdGZvciAoY29uc3QgbG9vcCBvZiBsb29wcykge1xuXHRcdG5leHRGYWNlcy5wdXNoKGxvb3AubWFwKChwb2ludCkgPT4gdHJhbnNsYXRlKHJlc29sdmUocG9pbnQpKSkpO1xuXHRcdGZhY2VTbG90LnB1c2goMCk7XG5cdH1cblx0Y29uc3QgcmVzdWx0OiBNZXNoID0ge1xuXHRcdHZlcnRpY2VzOiBuZXh0VmVydGljZXMsXG5cdFx0ZmFjZXM6IG5leHRGYWNlcyxcblx0XHRlZGdlczogYnVpbGRFZGdlcyhuZXh0RmFjZXMpLFxuXHRcdHJhZGl1czogY29tcHV0ZVJhZGl1cyhuZXh0VmVydGljZXMpLFxuXHRcdHNtb290aCxcblx0XHRzbG90czogc2xvdHMubWFwKChzbG90KSA9PiAoeyAuLi5zbG90IH0pKSxcblx0XHRmYWNlU2xvdCxcblx0XHRncm91cHM6IFtdLFxuXHR9O1xuXHRyZXN1bHQuZ3JvdXBzID0gYnVpbGRHcm91cHMocmVzdWx0KTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBNb3ZlcyB0aGUgd2hvbGUgcG9zaXRpdmUgaGFsZiBhbG9uZyB0aGUgcGxhbmUgbm9ybWFsLlxuICpcbiAqIFRoZSBzY2lzc29ycyB0b29sIG9mZnNldHMgdGhlIHR3byBoYWx2ZXMgYnkgYSBzbWFsbCBhbW91bnQgc28gdGhlIGN1dCBpc1xuICogY2xlYXJseSB2aXNpYmxlIGluIHRoZSB2aWV3cG9ydC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9mZnNldE1lc2gobWVzaDogTWVzaCwgb2Zmc2V0OiBWZWMzKTogTWVzaCB7XG5cdHJldHVybiB7XG5cdFx0Li4ubWVzaCxcblx0XHR2ZXJ0aWNlczogbWVzaC52ZXJ0aWNlcy5tYXAoKHYpID0+IFt2WzBdICsgb2Zmc2V0WzBdLCB2WzFdICsgb2Zmc2V0WzFdLCB2WzJdICsgb2Zmc2V0WzJdXSBhcyBWZWMzKSxcblx0fTtcbn1cblxuLyoqXG4gKiBDbGFzc2lmaWVzIGV2ZXJ5IGZhY2Ugb2YgYSBtZXNoIGFnYWluc3QgYSBwbGFuZS5cbiAqXG4gKiBVc2VkIGJ5IHRoZSBrbmlmZSBtYXJrIG1vZGUsIHdoaWNoIGtlZXBzIGEgc2luZ2xlIG9iamVjdCBidXQgbW92ZXMgdGhlXG4gKiBzbGljZWQgc2lkZSBpbnRvIGl0cyBvd24gbWF0ZXJpYWwgc2xvdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsYXNzaWZ5RmFjZXNCeVBsYW5lKG1lc2g6IE1lc2gsIHBsYW5lOiBDdXRQbGFuZSk6IHsgcG9zaXRpdmU6IG51bWJlcltdOyBuZWdhdGl2ZTogbnVtYmVyW10gfSB7XG5cdGNvbnN0IGxlbmd0aCA9IE1hdGguaHlwb3QocGxhbmUubm9ybWFsWzBdLCBwbGFuZS5ub3JtYWxbMV0sIHBsYW5lLm5vcm1hbFsyXSkgfHwgMTtcblx0Y29uc3Qgbm9ybWFsID0gbm9ybWFsaXplKHBsYW5lLm5vcm1hbCk7XG5cdGNvbnN0IGRpc3QgPSBwbGFuZS5kaXN0IC8gbGVuZ3RoO1xuXHRjb25zdCBwb3NpdGl2ZTogbnVtYmVyW10gPSBbXTtcblx0Y29uc3QgbmVnYXRpdmU6IG51bWJlcltdID0gW107XG5cdG1lc2guZmFjZXMuZm9yRWFjaCgoZmFjZSwgaW5kZXgpID0+IHtcblx0XHRsZXQgYWJvdmUgPSAwO1xuXHRcdGxldCBiZWxvdyA9IDA7XG5cdFx0Zm9yIChjb25zdCB2ZXJ0ZXhJbmRleCBvZiBmYWNlKSB7XG5cdFx0XHRjb25zdCBkaXN0YW5jZSA9IGRvdChub3JtYWwsIG1lc2gudmVydGljZXNbdmVydGV4SW5kZXhdKSAtIGRpc3Q7XG5cdFx0XHRpZiAoZGlzdGFuY2UgPiBFUFNJTE9OKSBhYm92ZSsrO1xuXHRcdFx0aWYgKGRpc3RhbmNlIDwgLUVQU0lMT04pIGJlbG93Kys7XG5cdFx0fVxuXHRcdGlmIChhYm92ZSAmJiAhYmVsb3cpIHBvc2l0aXZlLnB1c2goaW5kZXgpO1xuXHRcdGVsc2UgaWYgKGJlbG93ICYmICFhYm92ZSkgbmVnYXRpdmUucHVzaChpbmRleCk7XG5cdFx0ZWxzZSBpZiAoYWJvdmUgJiYgYmVsb3cpIHtcblx0XHRcdC8vIFRoZSBmYWNlIHN0cmFkZGxlcyB0aGUgcGxhbmU6IGFzc2lnbiBpdCB0byB0aGUgc2lkZSBvZiBpdHMgY2VudHJlLlxuXHRcdFx0Y29uc3QgY2VudHJlID0gZmFjZUNlbnRyZShtZXNoLCBmYWNlKTtcblx0XHRcdGlmIChkb3Qobm9ybWFsLCBjZW50cmUpIC0gZGlzdCA+PSAwKSBwb3NpdGl2ZS5wdXNoKGluZGV4KTtcblx0XHRcdGVsc2UgbmVnYXRpdmUucHVzaChpbmRleCk7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIHsgcG9zaXRpdmUsIG5lZ2F0aXZlIH07XG59XG5cbi8qKlxuICogRXh0cnVkZXMgYSByZWdpb24gb2YgZmFjZXMgYWxvbmcgaXRzIGF2ZXJhZ2Ugbm9ybWFsLlxuICpcbiAqIEJsZW5kZXIncyBgYm1vX2V4dHJ1ZGVgIGR1cGxpY2F0ZXMgdGhlIHNlbGVjdGVkIGZhY2VzIGFuZCBicmlkZ2VzIHRoZW0gd2l0aFxuICogc2lkZSB3YWxsIHF1YWRzLiBBIG5lZ2F0aXZlIGRpc3RhbmNlIHB1c2hlcyB0aGUgcmVnaW9uIGlud2FyZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRydWRlUmVnaW9uKG1lc2g6IE1lc2gsIGZhY2VJbmRpY2VzOiBudW1iZXJbXSwgZGlzdGFuY2U6IG51bWJlcik6IE1lc2gge1xuXHRpZiAoIWZhY2VJbmRpY2VzLmxlbmd0aCkgcmV0dXJuIG1lc2g7XG5cdGNvbnN0IHNlbGVjdGVkID0gbmV3IFNldChmYWNlSW5kaWNlcyk7XG5cdGNvbnN0IHZhbGlkID0gZmFjZUluZGljZXMuZmlsdGVyKChpbmRleCkgPT4gaW5kZXggPj0gMCAmJiBpbmRleCA8IG1lc2guZmFjZXMubGVuZ3RoKTtcblx0aWYgKCF2YWxpZC5sZW5ndGgpIHJldHVybiBtZXNoO1xuXG5cdGxldCBueCA9IDA7XG5cdGxldCBueSA9IDA7XG5cdGxldCBueiA9IDA7XG5cdGZvciAoY29uc3QgaW5kZXggb2YgdmFsaWQpIHtcblx0XHRjb25zdCBmYWNlID0gbWVzaC5mYWNlc1tpbmRleF07XG5cdFx0Y29uc3QgYSA9IG1lc2gudmVydGljZXNbZmFjZVswXV07XG5cdFx0Y29uc3QgYiA9IG1lc2gudmVydGljZXNbZmFjZVsxXV07XG5cdFx0Y29uc3QgYyA9IG1lc2gudmVydGljZXNbZmFjZVsyXV07XG5cdFx0Y29uc3QgdXggPSBiWzBdIC0gYVswXTtcblx0XHRjb25zdCB1eSA9IGJbMV0gLSBhWzFdO1xuXHRcdGNvbnN0IHV6ID0gYlsyXSAtIGFbMl07XG5cdFx0Y29uc3QgdnggPSBjWzBdIC0gYVswXTtcblx0XHRjb25zdCB2eSA9IGNbMV0gLSBhWzFdO1xuXHRcdGNvbnN0IHZ6ID0gY1syXSAtIGFbMl07XG5cdFx0bnggKz0gdXkgKiB2eiAtIHV6ICogdnk7XG5cdFx0bnkgKz0gdXogKiB2eCAtIHV4ICogdno7XG5cdFx0bnogKz0gdXggKiB2eSAtIHV5ICogdng7XG5cdH1cblx0Y29uc3QgbGVuZ3RoID0gTWF0aC5oeXBvdChueCwgbnksIG56KSB8fCAxO1xuXHRjb25zdCBub3JtYWw6IFZlYzMgPSBbbnggLyBsZW5ndGgsIG55IC8gbGVuZ3RoLCBueiAvIGxlbmd0aF07XG5cblx0Y29uc3QgdmVydGljZXMgPSBtZXNoLnZlcnRpY2VzLm1hcCgodikgPT4gW3ZbMF0sIHZbMV0sIHZbMl1dIGFzIFZlYzMpO1xuXHRjb25zdCBjb3B5SW5kZXggPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRjb25zdCBjb3B5VmVydGV4ID0gKGluZGV4OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gY29weUluZGV4LmdldChpbmRleCk7XG5cdFx0aWYgKGV4aXN0aW5nICE9PSB1bmRlZmluZWQpIHJldHVybiBleGlzdGluZztcblx0XHRjb25zdCB2ID0gdmVydGljZXNbaW5kZXhdO1xuXHRcdGNvbnN0IHRhcmdldCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0XHR2ZXJ0aWNlcy5wdXNoKFt2WzBdICsgbm9ybWFsWzBdICogZGlzdGFuY2UsIHZbMV0gKyBub3JtYWxbMV0gKiBkaXN0YW5jZSwgdlsyXSArIG5vcm1hbFsyXSAqIGRpc3RhbmNlXSk7XG5cdFx0Y29weUluZGV4LnNldChpbmRleCwgdGFyZ2V0KTtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9O1xuXG5cdGNvbnN0IGJvdW5kYXJ5OiBbbnVtYmVyLCBudW1iZXJdW10gPSBbXTtcblx0Zm9yIChjb25zdCBpbmRleCBvZiB2YWxpZCkge1xuXHRcdGNvbnN0IGZhY2UgPSBtZXNoLmZhY2VzW2luZGV4XTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZhY2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGEgPSBmYWNlW2ldO1xuXHRcdFx0Y29uc3QgYiA9IGZhY2VbKGkgKyAxKSAlIGZhY2UubGVuZ3RoXTtcblx0XHRcdGxldCBzaGFyZWQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBvdGhlciBvZiB2YWxpZCkge1xuXHRcdFx0XHRjb25zdCBvdGhlckZhY2UgPSBtZXNoLmZhY2VzW290aGVyXTtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBvdGhlckZhY2UubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0XHRjb25zdCBwID0gb3RoZXJGYWNlW2pdO1xuXHRcdFx0XHRcdGNvbnN0IHEgPSBvdGhlckZhY2VbKGogKyAxKSAlIG90aGVyRmFjZS5sZW5ndGhdO1xuXHRcdFx0XHRcdGlmICgocCA9PT0gYSAmJiBxID09PSBiKSB8fCAocCA9PT0gYiAmJiBxID09PSBhKSkgc2hhcmVkKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzaGFyZWQgPCAyKSBib3VuZGFyeS5wdXNoKFthLCBiXSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZmFjZXM6IG51bWJlcltdW10gPSBbXTtcblx0bWVzaC5mYWNlcy5mb3JFYWNoKChmYWNlLCBpbmRleCkgPT4ge1xuXHRcdGlmIChzZWxlY3RlZC5oYXMoaW5kZXgpKSBmYWNlcy5wdXNoKGZhY2UubWFwKGNvcHlWZXJ0ZXgpKTtcblx0XHRlbHNlIGZhY2VzLnB1c2goWy4uLmZhY2VdKTtcblx0fSk7XG5cdGZvciAoY29uc3QgW2EsIGJdIG9mIGJvdW5kYXJ5KSBmYWNlcy5wdXNoKFthLCBiLCBjb3B5VmVydGV4KGIpLCBjb3B5VmVydGV4KGEpXSk7XG5cblx0Y29uc3QgcmVzdWx0OiBNZXNoID0ge1xuXHRcdHZlcnRpY2VzLFxuXHRcdGZhY2VzLFxuXHRcdGVkZ2VzOiBidWlsZEVkZ2VzKGZhY2VzKSxcblx0XHRyYWRpdXM6IGNvbXB1dGVSYWRpdXModmVydGljZXMpLFxuXHRcdHNtb290aDogbWVzaC5zbW9vdGggPz8gZmFsc2UsXG5cdFx0c2xvdHM6IChtZXNoLnNsb3RzID8/IFtdKS5tYXAoKHNsb3QpID0+ICh7IC4uLnNsb3QgfSkpLFxuXHRcdGZhY2VTbG90OiBbLi4uKG1lc2guZmFjZVNsb3QgPz8gW10pXSxcblx0XHRncm91cHM6IFtdLFxuXHR9O1xuXHR3aGlsZSAocmVzdWx0LmZhY2VTbG90Lmxlbmd0aCA8IGZhY2VzLmxlbmd0aCkgcmVzdWx0LmZhY2VTbG90LnB1c2goMCk7XG5cdHJlc3VsdC5ncm91cHMgPSBidWlsZEdyb3VwcyhyZXN1bHQpO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKiogUmV0dXJucyB0aGUgcG9pbnQgb2YgYSB0cmlhbmdsZSB0aGF0IHNpdHMgZGVlcGVzdCBhbG9uZyB0aGUgcGxhbmUgbm9ybWFsLiAqL1xuZnVuY3Rpb24gZmFjZUNlbnRyZShtZXNoOiBNZXNoLCBmYWNlOiBGYWNlKTogVmVjMyB7XG5cdGxldCB4ID0gMDtcblx0bGV0IHkgPSAwO1xuXHRsZXQgeiA9IDA7XG5cdGZvciAoY29uc3QgaW5kZXggb2YgZmFjZSkge1xuXHRcdGNvbnN0IHZlcnRleCA9IG1lc2gudmVydGljZXNbaW5kZXhdO1xuXHRcdHggKz0gdmVydGV4WzBdO1xuXHRcdHkgKz0gdmVydGV4WzFdO1xuXHRcdHogKz0gdmVydGV4WzJdO1xuXHR9XG5cdGNvbnN0IGNvdW50ID0gZmFjZS5sZW5ndGggfHwgMTtcblx0cmV0dXJuIFt4IC8gY291bnQsIHkgLyBjb3VudCwgeiAvIGNvdW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZXBlc3RQb2ludChtZXNoOiBNZXNoLCBmYWNlOiBGYWNlLCBub3JtYWw6IFZlYzMpOiBWZWMzIHtcblx0dm9pZCBub3JtYWw7XG5cdHJldHVybiBmYWNlQ2VudHJlKG1lc2gsIGZhY2UpO1xufVxuXG4vKiogRGlzdGFuY2UgZnJvbSBhIHBvaW50IHRvIHRoZSBjdXR0aW5nIHBsYW5lLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNpZ25lZERpc3RhbmNlKHBsYW5lOiBDdXRQbGFuZSwgcG9pbnQ6IFZlYzMpOiBudW1iZXIge1xuXHRjb25zdCBsZW5ndGggPSBNYXRoLmh5cG90KHBsYW5lLm5vcm1hbFswXSwgcGxhbmUubm9ybWFsWzFdLCBwbGFuZS5ub3JtYWxbMl0pIHx8IDE7XG5cdGNvbnN0IG5vcm1hbDogVmVjMyA9IFtwbGFuZS5ub3JtYWxbMF0gLyBsZW5ndGgsIHBsYW5lLm5vcm1hbFsxXSAvIGxlbmd0aCwgcGxhbmUubm9ybWFsWzJdIC8gbGVuZ3RoXTtcblx0cmV0dXJuIGRvdChub3JtYWwsIHBvaW50KSAtIHBsYW5lLmRpc3QgLyBsZW5ndGg7XG59XG5cbi8qKiBCdWlsZHMgYSBwbGFuZSB0aGF0IGZhY2VzIHRoZSBjYW1lcmEgYW5kIHBhc3NlcyB0aHJvdWdoIGEgd29ybGQgcG9pbnQuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbmVGYWNpbmdDYW1lcmEocG9pbnQ6IFZlYzMsIGZyYW1lOiBDYW1lcmFGcmFtZSk6IEN1dFBsYW5lIHtcblx0Y29uc3Qgbm9ybWFsID0gbm9ybWFsaXplKGZyYW1lLmZvcndhcmQpO1xuXHRyZXR1cm4geyBub3JtYWwsIGRpc3Q6IGRvdChub3JtYWwsIHBvaW50KSB9O1xufVxuXG4vKiogQ29udmVuaWVuY2UgaGVscGVyOiBhIHBsYW5lIHdob3NlIG5vcm1hbCBpcyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0d28gZWRnZXMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbmVGcm9tRWRnZXMoYTogVmVjMywgYjogVmVjMywgYzogVmVjMyk6IEN1dFBsYW5lIHtcblx0Y29uc3Qgbm9ybWFsID0gbm9ybWFsaXplKGNyb3NzKHN1YihiLCBhKSwgc3ViKGMsIGEpKSk7XG5cdHJldHVybiB7IG5vcm1hbCwgZGlzdDogZG90KG5vcm1hbCwgYSkgfTtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBR0EsU0FBUyxLQUFLLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxHQUFHLFFBQVEsVUFBVTtBQUNyRCxTQUFTLFVBQVUsRUFBRSxXQUFXLEVBQUUsYUFBYSxRQUFpRCxRQUFRO0FBRXhHLE1BQU0sT0FBTyxHQUFHLElBQUk7QUFDcEIsTUFBTSxZQUFZLEdBQUcsR0FBRztBQStCeEIsU0FBUyxNQUFNLENBQUMsUUFBZ0IsRUFBVTtFQUN6QyxJQUFJLFFBQVEsR0FBRyxPQUFPLEVBQUUsT0FBTyxDQUFDO0VBQ2hDLElBQUksUUFBUSxHQUFHLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0VBQ2xDLE9BQU8sQ0FBQztBQUNUO0FBRUEsU0FBUyxRQUFRLENBQUMsS0FBYSxFQUFVO0VBQ3hDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsWUFBWSxDQUFDLEdBQUcsWUFBWTtBQUN2RDtBQUVBLFNBQVMsUUFBUSxDQUFDLEtBQVcsRUFBVTtFQUN0QyxPQUFPLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFDM0U7O0FBRUE7QUFDQSxPQUFPLFNBQVMsU0FBUyxDQUFDLEtBQWtCLEVBQUUsS0FBa0IsRUFBRSxLQUFhLEVBQUUsTUFBYyxFQUFFO0VBQ2hHLE1BQU0sSUFBSSxHQUFJLEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEdBQUksQ0FBQyxHQUFHLENBQUM7RUFDbkQsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFJLEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLEdBQUksQ0FBQztFQUNwRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFFLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsR0FBSSxHQUFHLENBQUM7RUFDckQsTUFBTSxNQUFNLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztFQUMxQyxNQUFNLEdBQVMsR0FBRyxDQUNqQixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxPQUFPLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsT0FBTyxFQUMxRixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxPQUFPLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsT0FBTyxFQUMxRixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxPQUFPLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsT0FBTyxDQUMxRjtFQUNELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0VBQ25ELE9BQU87SUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUc7SUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUc7RUFBVSxDQUFDO0FBQ3RGOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTyxTQUFTLHlCQUF5QixDQUN4QyxLQUFrQixFQUNsQixLQUFrQixFQUNsQixHQUFnQixFQUNoQixLQUFhLEVBQ2IsTUFBYyxFQUNkLEtBQWEsRUFDRjtFQUNYLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7RUFDMUIsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztFQUMxQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDO0VBQ3RDO0VBQ0EsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLE1BQU07RUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEdBQUcsTUFBTTtFQUV2QixNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsQ0FDeEIsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFDdkMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFDdkMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FDdkMsQ0FBQztFQUVGLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUM7RUFDbkQsTUFBTSxNQUFNLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksQ0FBQztFQUNuRSxNQUFNLE1BQVksR0FBRyxDQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxFQUNyQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxFQUNyQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUNyQztFQUNELE9BQU87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Q2hDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RCLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFO0VBQ3hCO0VBQ0EsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUM7RUFDMUMsTUFBTSxNQUFZLEdBQUcsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLEVBQUUsR0FBRyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQztFQUU1RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBRSxDQUFDLElBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBUyxDQUFDO0VBQ3JFLE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxDQUFpQixDQUFDO0VBQzNDLE1BQU0sVUFBVSxHQUFJLEtBQWEsSUFBYTtJQUM3QyxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztJQUNyQyxJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsT0FBTyxRQUFRO0lBQzNDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7SUFDekIsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLE1BQU07SUFDOUIsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUM7SUFDdEcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDO0lBQzVCLE9BQU8sTUFBTTtFQUNkLENBQUM7RUFFRCxNQUFNLFFBQTRCLEdBQUcsRUFBRTtFQUN2QyxLQUFLLE1BQU0sS0FBSyxJQUFJLEtBQUssRUFBRTtJQUMxQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUM5QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtNQUNyQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO01BQ2pCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztNQUNyQyxJQUFJLE1BQU0sR0FBRyxDQUFDO01BQ2QsS0FBSyxNQUFNLEtBQUssSUFBSSxLQUFLLEVBQUU7UUFDMUIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDbkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7VUFDMUMsTUFBTSxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztVQUN0QixNQUFNLENBQUMsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxNQUFNLENBQUM7VUFDL0MsSUFBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBRSxFQUFFLE1BQU0sRUFBRTtRQUMzRDtNQUNEO01BQ0EsSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdEM7RUFDRDtFQUVBLE1BQU0sS0FBaUIsR0FBRyxFQUFFO0VBQzVCLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssS0FBSztJQUNuQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FDckQsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7RUFDM0IsQ0FBQyxDQUFDO0VBQ0YsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLFFBQVEsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFFL0UsTUFBTSxNQUFZLEdBQUc7SUFDcEIsUUFBUTtJQUNSLEtBQUs7SUFDTCxLQUFLLEVBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQztJQUN4QixNQUFNLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQztJQUMvQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sSUFBSSxLQUFLO0lBQzVCLEtBQUssRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRSxFQUFFLEdBQUcsQ0FBRSxJQUFJLEtBQU07TUFBRSxHQUFHO0lBQUssQ0FBQyxDQUFDLENBQUM7SUFDdEQsUUFBUSxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3BDLE1BQU0sRUFBRTtFQUNULENBQUM7RUFDRCxPQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0VBQ3JFLE1BQU0sQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztFQUNuQyxPQUFPLE1BQU07QUFDZDs7QUFFQTtBQUNBLFNBQVMsVUFBVSxDQUFDLElBQVUsRUFBRSxJQUFVLEVBQVE7RUFDakQsSUFBSSxDQUFDLEdBQUcsQ0FBQztFQUNULElBQUksQ0FBQyxHQUFHLENBQUM7RUFDVCxJQUFJLENBQUMsR0FBRyxDQUFDO0VBQ1QsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLEVBQUU7SUFDekIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7SUFDbkMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDZCxDQUFDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNkLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDO0VBQ2Y7RUFDQSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUM7RUFDOUIsT0FBTyxDQUFDLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDO0FBQ3pDO0FBRUEsT0FBTyxTQUFTLFlBQVksQ0FBQyxJQUFVLEVBQUUsSUFBVSxFQUFFLE1BQVksRUFBUTtFQUN4RSxLQUFLLE1BQU07RUFDWCxPQUFPLFVBQVUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO0FBQzlCOztBQUVBO0FBQ0EsT0FBTyxTQUFTLGNBQWMsQ0FBQyxLQUFlLEVBQUUsS0FBVyxFQUFVO0VBQ3BFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0VBQ2pGLE1BQU0sTUFBWSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUM7RUFDbkcsT0FBTyxHQUFHLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLEdBQUcsTUFBTTtBQUNoRDs7QUFFQTtBQUNBLE9BQU8sU0FBUyxpQkFBaUIsQ0FBQyxLQUFXLEVBQUUsS0FBa0IsRUFBWTtFQUM1RSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQztFQUN2QyxPQUFPO0lBQUUsTUFBTTtJQUFFLElBQUksRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFLEtBQUs7RUFBRSxDQUFDO0FBQzVDOztBQUVBO0FBQ0EsT0FBTyxTQUFTLGNBQWMsQ0FBQyxDQUFPLEVBQUUsQ0FBTyxFQUFFLENBQU8sRUFBWTtFQUNuRSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQ3JELE9BQU87SUFBRSxNQUFNO0lBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztFQUFFLENBQUM7QUFDeEMiLCJpZ25vcmVMaXN0IjpbXX0=