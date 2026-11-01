import { computeRadius, finalizeMesh } from './mesh';

/**
 * Topology helpers for the editable mesh.
 *
 * The mesh is an indexed polygon soup, so the ring walk below rebuilds the
 * small amount of adjacency it needs instead of keeping a second structure in
 * sync with every edit.
 */

function key(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
function faceKey(face, index) {
  return key(face[index], face[(index + 1) % face.length]);
}

/** edge key -> the faces that use it. */
function edgeFaces(faces) {
  const map = new Map();
  faces.forEach((face, index) => {
    for (let i = 0; i < face.length; i++) {
      const k = faceKey(face, i);
      const bucket = map.get(k);
      if (bucket) bucket.push(index);else map.set(k, [index]);
    }
  });
  return map;
}

/** The opposite edge of a quad, or null when the face is not a quad. */
function oppositeEdge(face, edge) {
  if (face.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    if (faceKey(face, i) === edge) {
      const a = face[(i + 2) % 4];
      const b = face[(i + 3) % 4];
      return [a, b];
    }
  }
  return null;
}
/**
 * Cuts a new edge loop across a quad ring.
 *
 * The walk starts from `startEdge`, crosses one quad at a time through the
 * opposite edge, and stops at a boundary, a triangle, a pole or when the ring
 * closes. Every face on the ring is then split into `cuts + 1` quads.
 */
export function loopCut(mesh, startEdge, cuts = 1) {
  if (!mesh.faces.length) return {
    ok: false,
    error: {
      code: 'empty',
      message: 'The mesh has no faces.'
    }
  };
  if (!Number.isFinite(cuts) || cuts < 1) {
    return {
      ok: false,
      error: {
        code: 'degenerate',
        message: 'A loop cut needs at least one cut.'
      }
    };
  }
  const count = Math.floor(cuts);
  if (count > 12) {
    return {
      ok: false,
      error: {
        code: 'limit',
        message: 'At most 12 cuts per loop are supported.'
      }
    };
  }
  const edge = mesh.edges[startEdge];
  if (!edge) return {
    ok: false,
    error: {
      code: 'no-edge',
      message: 'Select an edge to cut across.'
    }
  };
  const adjacency = edgeFaces(mesh.faces);
  const startKey = key(edge[0], edge[1]);
  const owners = adjacency.get(startKey);
  if (!owners?.length) return {
    ok: false,
    error: {
      code: 'no-edge',
      message: 'That edge belongs to no face.'
    }
  };
  const ring = [];
  const visited = new Set();
  const walk = (fromFace, fromEdge) => {
    const walked = [];
    let faceIndex = fromFace;
    let edgeKey = fromEdge;
    for (;;) {
      if (visited.has(faceIndex)) break;
      const face = mesh.faces[faceIndex];
      if (face.length !== 4) break;
      const opposite = oppositeEdge(face, edgeKey);
      if (!opposite) break;
      visited.add(faceIndex);
      const entry = mesh.faces[faceIndex].find((_, i) => faceKey(mesh.faces[faceIndex], i) === edgeKey);
      const entryA = entry ?? opposite[0];
      const entryB = mesh.faces[faceIndex][(mesh.faces[faceIndex].indexOf(entryA) + 1) % 4];
      walked.push({
        face: faceIndex,
        a: opposite[0],
        b: opposite[1],
        entryA,
        entryB
      });
      const nextKey = key(opposite[0], opposite[1]);
      const nextOwners = adjacency.get(nextKey) ?? [];
      const nextFace = nextOwners.find(index => index !== faceIndex);
      if (nextFace === undefined) break;
      faceIndex = nextFace;
      edgeKey = nextKey;
    }
    return walked;
  };

  // Both sides of the starting edge, otherwise the loop stops at the seam.
  const firstSide = walk(owners[0], startKey);
  const secondSide = owners.length > 1 ? walk(owners[1], startKey) : [];
  ring.push(...firstSide.reverse(), ...secondSide);
  if (!ring.length) {
    return {
      ok: false,
      error: {
        code: 'not-quad',
        message: 'Loop cut needs a ring of quads.'
      }
    };
  }

  // New vertices, one row per ring edge.
  const vertices = mesh.vertices.map(vertex => [vertex[0], vertex[1], vertex[2]]);
  const insertions = new Map();
  const cut = (a, b) => {
    const k = key(a, b);
    const existing = insertions.get(k);
    if (existing) return existing;
    const from = mesh.vertices[a];
    const to = mesh.vertices[b];
    const row = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      row.push(vertices.length);
      vertices.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
    }
    insertions.set(k, row);
    return row;
  };
  for (const item of ring) {
    cut(item.a, item.b);
    cut(item.entryA, item.entryB);
  }

  /** The inserted vertices of an edge, ordered from `from` to `to`. */
  const rowFrom = (edgeA, edgeB) => {
    const row = insertions.get(key(edgeA, edgeB)) ?? [];
    return edgeA < edgeB ? row : [...row].reverse();
  };
  const faces = [];
  const faceSlot = [];
  const ringFaces = new Set(ring.map(item => item.face));
  mesh.faces.forEach((face, index) => {
    if (!ringFaces.has(index)) {
      faces.push([...face]);
      faceSlot.push(mesh.faceSlot?.[index] ?? 0);
    }
  });
  for (const item of ring) {
    const face = mesh.faces[item.face];
    const slot = mesh.faceSlot?.[item.face] ?? 0;
    // The two ring edges are opposite, so the cycle is A, a, B, b.
    const index = face.findIndex((_, i) => faceKey(face, i) === key(item.a, item.b));
    const i1 = index < 0 ? 0 : index;
    const i2 = (i1 + 2) % 4;
    const a0 = face[i1];
    const a1 = face[(i1 + 1) % 4];
    const b0 = face[i2];
    const b1 = face[(i2 + 1) % 4];
    const aRow = rowFrom(a0, a1);
    const bRow = rowFrom(b0, b1);
    if (aRow.length !== count || bRow.length !== count) continue;
    const A = [a0, ...aRow, a1];
    const B = [b0, ...bRow, b1];
    for (let strip = 1; strip <= count + 1; strip++) {
      const quad = [A[strip - 1], A[strip], B[count + 1 - strip], B[count + 2 - strip]];
      const unique = new Set(quad);
      if (unique.size < 4) continue;
      faces.push(quad);
      faceSlot.push(slot);
    }
  }
  const next = finalizeMesh({
    vertices,
    faces,
    faceSlot,
    slots: mesh.slots,
    smooth: mesh.smooth ?? false
  }, mesh.smooth ?? false);
  next.radius = computeRadius(next.vertices);

  // The new loop edges are those whose both ends are inserted points.
  const inserted = new Set([...insertions.values()].flat());
  const loopEdges = next.edges.filter(([a, b]) => inserted.has(a) && inserted.has(b));
  return {
    ok: true,
    mesh: next,
    edges: loopEdges,
    faces: ring.length
  };
}
/**
 * Chamfers the selected corners.
 *
 * Every incident edge of a corner gets one point a short way along it, the
 * corner is replaced by those points inside each face, and the points are
 * joined into a new face. The offset is clamped to 45% of the shortest
 * incident edge so the points of two neighbouring corners can never cross.
 *
 * This is a corner bevel: it does not create rounded edge strips, so it is
 * reported as such instead of pretending to be a full edge bevel.
 */
export function bevelVertices(mesh, vertexIndices, width, segments = 1) {
  if (!vertexIndices.length) return {
    ok: false,
    error: {
      code: 'empty',
      message: 'Select at least one vertex to bevel.'
    }
  };
  if (!Number.isFinite(width) || width <= 0) {
    return {
      ok: false,
      error: {
        code: 'degenerate',
        message: 'The bevel width must be a positive number.'
      }
    };
  }
  if (segments < 1 || !Number.isFinite(segments)) {
    return {
      ok: false,
      error: {
        code: 'degenerate',
        message: 'The segment count must be at least one.'
      }
    };
  }
  const selected = new Set(vertexIndices.filter(index => mesh.vertices[index]));
  if (!selected.size) return {
    ok: false,
    error: {
      code: 'empty',
      message: 'None of the selected vertices exist.'
    }
  };
  const vertices = mesh.vertices.map(vertex => [vertex[0], vertex[1], vertex[2]]);
  const incident = new Map();
  mesh.faces.forEach((face, faceIndex) => {
    for (const index of face) {
      if (!selected.has(index)) continue;
      const bucket = incident.get(index);
      if (bucket) bucket.push(faceIndex);else incident.set(index, [faceIndex]);
    }
  });

  // One point per incident edge, shared by the faces on both sides.
  const offsets = new Map();
  const cornerPoints = new Map();
  const cornerNormal = new Map();
  for (const corner of selected) {
    const faces = incident.get(corner) ?? [];
    if (faces.length < 3) continue;
    const points = [];
    const normal = [0, 0, 0];
    for (const faceIndex of faces) {
      const face = mesh.faces[faceIndex];
      const at = face.indexOf(corner);
      if (at < 0) continue;
      const prev = face[(at - 1 + face.length) % face.length];
      const next = face[(at + 1) % face.length];
      for (const other of [prev, next]) {
        // Each end of an edge gets its own point: two neighbouring
        // corners must not share one offset.
        const k = `${corner}:${other}`;
        if (offsets.has(k)) continue;
        const from = mesh.vertices[corner];
        const to = mesh.vertices[other];
        const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        if (length < 1e-9) continue;
        const distance = Math.min(width, length * 0.45);
        const t = distance / length;
        const index = vertices.length;
        vertices.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
        offsets.set(k, index);
        points.push(index);
      }
    }
    if (points.length < 3) continue;
    cornerPoints.set(corner, [...new Set(points)]);

    // The average of the incident face normals orients the new cap.
    for (const faceIndex of faces) {
      const face = mesh.faces[faceIndex];
      const at = face.indexOf(corner);
      if (at < 0) continue;
      const a = mesh.vertices[face[(at - 1 + face.length) % face.length]];
      const b = mesh.vertices[corner];
      const c = mesh.vertices[face[(at + 1) % face.length]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      normal[0] += cross[0];
      normal[1] += cross[1];
      normal[2] += cross[2];
    }
    cornerNormal.set(corner, normal);
  }
  if (!cornerPoints.size) {
    return {
      ok: false,
      error: {
        code: 'degenerate',
        message: 'Those corners have too few surrounding faces.'
      }
    };
  }
  const pointOf = (a, b) => offsets.get(`${a}:${b}`);
  const faces = [];
  const faceSlot = [];
  mesh.faces.forEach((face, faceIndex) => {
    const slot = mesh.faceSlot?.[faceIndex] ?? 0;
    let any = false;
    const rebuilt = [];
    for (let i = 0; i < face.length; i++) {
      const vertex = face[i];
      if (!cornerPoints.has(vertex)) {
        rebuilt.push(vertex);
        continue;
      }
      const prev = face[(i - 1 + face.length) % face.length];
      const next = face[(i + 1) % face.length];
      const before = pointOf(vertex, prev);
      const after = pointOf(vertex, next);
      if (before === undefined || after === undefined) {
        rebuilt.push(vertex);
        continue;
      }
      any = true;
      rebuilt.push(before, after);
    }
    if (!any) {
      faces.push([...face]);
      faceSlot.push(slot);
      return;
    }
    if (new Set(rebuilt).size >= 3) {
      faces.push(rebuilt);
      faceSlot.push(slot);
    }
  });
  for (const [corner, points] of cornerPoints) {
    const normal = cornerNormal.get(corner) ?? [0, 1, 0];
    const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    const n = [normal[0] / length, normal[1] / length, normal[2] / length];
    const helper = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const right = [n[1] * helper[2] - n[2] * helper[1], n[2] * helper[0] - n[0] * helper[2], n[0] * helper[1] - n[1] * helper[0]];
    const rightLength = Math.hypot(right[0], right[1], right[2]) || 1;
    const u = [right[0] / rightLength, right[1] / rightLength, right[2] / rightLength];
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const origin = mesh.vertices[corner];
    const ring = [...new Set(points)].sort((a, b) => {
      const pa = vertices[a];
      const pb = vertices[b];
      const da = Math.atan2((pa[0] - origin[0]) * v[0] + (pa[1] - origin[1]) * v[1] + (pa[2] - origin[2]) * v[2], (pa[0] - origin[0]) * u[0] + (pa[1] - origin[1]) * u[1] + (pa[2] - origin[2]) * u[2]);
      const db = Math.atan2((pb[0] - origin[0]) * v[0] + (pb[1] - origin[1]) * v[1] + (pb[2] - origin[2]) * v[2], (pb[0] - origin[0]) * u[0] + (pb[1] - origin[1]) * u[1] + (pb[2] - origin[2]) * u[2]);
      return da - db;
    });
    if (ring.length >= 3) {
      faces.push(ring);
      faceSlot.push(mesh.faceSlot?.[incident.get(corner)?.[0] ?? 0] ?? 0);
    }
  }

  // The bevelled corners are gone; drop them instead of leaving unused
  // vertices behind for picking and export to trip over.
  const used = new Map();
  const compactVertices = [];
  const remap = index => {
    const found = used.get(index);
    if (found !== undefined) return found;
    const next = compactVertices.length;
    used.set(index, next);
    compactVertices.push(vertices[index]);
    return next;
  };
  const compactFaces = faces.map(face => face.map(remap));
  const next = finalizeMesh({
    vertices: compactVertices,
    faces: compactFaces,
    faceSlot,
    slots: mesh.slots,
    smooth: mesh.smooth ?? false
  }, mesh.smooth ?? false);
  next.radius = computeRadius(next.vertices);
  return {
    ok: true,
    mesh: next,
    vertices: cornerPoints.size,
    faces: next.faces.length
  };
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsidG9wb2xvZ3kudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBWZWMzIH0gZnJvbSAnLi9tYXRoM2QnO1xuaW1wb3J0IHsgY29tcHV0ZVJhZGl1cywgZmluYWxpemVNZXNoLCB0eXBlIEZhY2UsIHR5cGUgTWVzaCB9IGZyb20gJy4vbWVzaCc7XG5cbi8qKlxuICogVG9wb2xvZ3kgaGVscGVycyBmb3IgdGhlIGVkaXRhYmxlIG1lc2guXG4gKlxuICogVGhlIG1lc2ggaXMgYW4gaW5kZXhlZCBwb2x5Z29uIHNvdXAsIHNvIHRoZSByaW5nIHdhbGsgYmVsb3cgcmVidWlsZHMgdGhlXG4gKiBzbWFsbCBhbW91bnQgb2YgYWRqYWNlbmN5IGl0IG5lZWRzIGluc3RlYWQgb2Yga2VlcGluZyBhIHNlY29uZCBzdHJ1Y3R1cmUgaW5cbiAqIHN5bmMgd2l0aCBldmVyeSBlZGl0LlxuICovXG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVzaEVycm9yIHtcblx0Y29kZTogJ2VtcHR5JyB8ICdub3QtcXVhZCcgfCAnYm91bmRhcnknIHwgJ2RlZ2VuZXJhdGUnIHwgJ25vLWVkZ2UnIHwgJ2xpbWl0Jztcblx0bWVzc2FnZTogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBMb29wQ3V0UmVzdWx0ID1cblx0fCB7IG9rOiB0cnVlOyBtZXNoOiBNZXNoOyBlZGdlczogW251bWJlciwgbnVtYmVyXVtdOyBmYWNlczogbnVtYmVyIH1cblx0fCB7IG9rOiBmYWxzZTsgZXJyb3I6IE1lc2hFcnJvciB9O1xuXG5mdW5jdGlvbiBrZXkoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gYSA8IGIgPyBgJHthfToke2J9YCA6IGAke2J9OiR7YX1gO1xufVxuXG5mdW5jdGlvbiBmYWNlS2V5KGZhY2U6IEZhY2UsIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4ga2V5KGZhY2VbaW5kZXhdLCBmYWNlWyhpbmRleCArIDEpICUgZmFjZS5sZW5ndGhdKTtcbn1cblxuLyoqIGVkZ2Uga2V5IC0+IHRoZSBmYWNlcyB0aGF0IHVzZSBpdC4gKi9cbmZ1bmN0aW9uIGVkZ2VGYWNlcyhmYWNlczogRmFjZVtdKTogTWFwPHN0cmluZywgbnVtYmVyW10+IHtcblx0Y29uc3QgbWFwID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcltdPigpO1xuXHRmYWNlcy5mb3JFYWNoKChmYWNlLCBpbmRleCkgPT4ge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZmFjZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgayA9IGZhY2VLZXkoZmFjZSwgaSk7XG5cdFx0XHRjb25zdCBidWNrZXQgPSBtYXAuZ2V0KGspO1xuXHRcdFx0aWYgKGJ1Y2tldCkgYnVja2V0LnB1c2goaW5kZXgpO1xuXHRcdFx0ZWxzZSBtYXAuc2V0KGssIFtpbmRleF0pO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBtYXA7XG59XG5cbi8qKiBUaGUgb3Bwb3NpdGUgZWRnZSBvZiBhIHF1YWQsIG9yIG51bGwgd2hlbiB0aGUgZmFjZSBpcyBub3QgYSBxdWFkLiAqL1xuZnVuY3Rpb24gb3Bwb3NpdGVFZGdlKGZhY2U6IEZhY2UsIGVkZ2U6IHN0cmluZyk6IFtudW1iZXIsIG51bWJlcl0gfCBudWxsIHtcblx0aWYgKGZhY2UubGVuZ3RoICE9PSA0KSByZXR1cm4gbnVsbDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcblx0XHRpZiAoZmFjZUtleShmYWNlLCBpKSA9PT0gZWRnZSkge1xuXHRcdFx0Y29uc3QgYSA9IGZhY2VbKGkgKyAyKSAlIDRdO1xuXHRcdFx0Y29uc3QgYiA9IGZhY2VbKGkgKyAzKSAlIDRdO1xuXHRcdFx0cmV0dXJuIFthLCBiXTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmludGVyZmFjZSBSaW5nRmFjZSB7XG5cdGZhY2U6IG51bWJlcjtcblx0LyoqIFRoZSBmYXIgcmluZyBlZGdlIG9mIHRoZSBxdWFkLCB0aGUgb25lIHRoZSB3YWxrIGxlYXZlcyB0aHJvdWdoLiAqL1xuXHRhOiBudW1iZXI7XG5cdGI6IG51bWJlcjtcblx0LyoqIFRoZSBlZGdlIHRoZSB3YWxrIGVudGVyZWQgdGhyb3VnaC4gSXQgaXMgY3V0IGFzIHdlbGwuICovXG5cdGVudHJ5QTogbnVtYmVyO1xuXHRlbnRyeUI6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBDdXRzIGEgbmV3IGVkZ2UgbG9vcCBhY3Jvc3MgYSBxdWFkIHJpbmcuXG4gKlxuICogVGhlIHdhbGsgc3RhcnRzIGZyb20gYHN0YXJ0RWRnZWAsIGNyb3NzZXMgb25lIHF1YWQgYXQgYSB0aW1lIHRocm91Z2ggdGhlXG4gKiBvcHBvc2l0ZSBlZGdlLCBhbmQgc3RvcHMgYXQgYSBib3VuZGFyeSwgYSB0cmlhbmdsZSwgYSBwb2xlIG9yIHdoZW4gdGhlIHJpbmdcbiAqIGNsb3Nlcy4gRXZlcnkgZmFjZSBvbiB0aGUgcmluZyBpcyB0aGVuIHNwbGl0IGludG8gYGN1dHMgKyAxYCBxdWFkcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxvb3BDdXQobWVzaDogTWVzaCwgc3RhcnRFZGdlOiBudW1iZXIsIGN1dHMgPSAxKTogTG9vcEN1dFJlc3VsdCB7XG5cdGlmICghbWVzaC5mYWNlcy5sZW5ndGgpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHsgY29kZTogJ2VtcHR5JywgbWVzc2FnZTogJ1RoZSBtZXNoIGhhcyBubyBmYWNlcy4nIH0gfTtcblx0aWYgKCFOdW1iZXIuaXNGaW5pdGUoY3V0cykgfHwgY3V0cyA8IDEpIHtcblx0XHRyZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiB7IGNvZGU6ICdkZWdlbmVyYXRlJywgbWVzc2FnZTogJ0EgbG9vcCBjdXQgbmVlZHMgYXQgbGVhc3Qgb25lIGN1dC4nIH0gfTtcblx0fVxuXHRjb25zdCBjb3VudCA9IE1hdGguZmxvb3IoY3V0cyk7XG5cdGlmIChjb3VudCA+IDEyKSB7XG5cdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogeyBjb2RlOiAnbGltaXQnLCBtZXNzYWdlOiAnQXQgbW9zdCAxMiBjdXRzIHBlciBsb29wIGFyZSBzdXBwb3J0ZWQuJyB9IH07XG5cdH1cblx0Y29uc3QgZWRnZSA9IG1lc2guZWRnZXNbc3RhcnRFZGdlXTtcblx0aWYgKCFlZGdlKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiB7IGNvZGU6ICduby1lZGdlJywgbWVzc2FnZTogJ1NlbGVjdCBhbiBlZGdlIHRvIGN1dCBhY3Jvc3MuJyB9IH07XG5cdGNvbnN0IGFkamFjZW5jeSA9IGVkZ2VGYWNlcyhtZXNoLmZhY2VzKTtcblx0Y29uc3Qgc3RhcnRLZXkgPSBrZXkoZWRnZVswXSwgZWRnZVsxXSk7XG5cdGNvbnN0IG93bmVycyA9IGFkamFjZW5jeS5nZXQoc3RhcnRLZXkpO1xuXHRpZiAoIW93bmVycz8ubGVuZ3RoKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiB7IGNvZGU6ICduby1lZGdlJywgbWVzc2FnZTogJ1RoYXQgZWRnZSBiZWxvbmdzIHRvIG5vIGZhY2UuJyB9IH07XG5cblx0Y29uc3QgcmluZzogUmluZ0ZhY2VbXSA9IFtdO1xuXHRjb25zdCB2aXNpdGVkID0gbmV3IFNldDxudW1iZXI+KCk7XG5cblx0Y29uc3Qgd2FsayA9IChmcm9tRmFjZTogbnVtYmVyLCBmcm9tRWRnZTogc3RyaW5nKTogUmluZ0ZhY2VbXSA9PiB7XG5cdFx0Y29uc3Qgd2Fsa2VkOiBSaW5nRmFjZVtdID0gW107XG5cdFx0bGV0IGZhY2VJbmRleCA9IGZyb21GYWNlO1xuXHRcdGxldCBlZGdlS2V5ID0gZnJvbUVkZ2U7XG5cdFx0Zm9yICg7Oykge1xuXHRcdFx0aWYgKHZpc2l0ZWQuaGFzKGZhY2VJbmRleCkpIGJyZWFrO1xuXHRcdFx0Y29uc3QgZmFjZSA9IG1lc2guZmFjZXNbZmFjZUluZGV4XTtcblx0XHRcdGlmIChmYWNlLmxlbmd0aCAhPT0gNCkgYnJlYWs7XG5cdFx0XHRjb25zdCBvcHBvc2l0ZSA9IG9wcG9zaXRlRWRnZShmYWNlLCBlZGdlS2V5KTtcblx0XHRcdGlmICghb3Bwb3NpdGUpIGJyZWFrO1xuXHRcdFx0dmlzaXRlZC5hZGQoZmFjZUluZGV4KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gbWVzaC5mYWNlc1tmYWNlSW5kZXhdLmZpbmQoKF8sIGkpID0+IGZhY2VLZXkobWVzaC5mYWNlc1tmYWNlSW5kZXhdLCBpKSA9PT0gZWRnZUtleSk7XG5cdFx0XHRjb25zdCBlbnRyeUEgPSBlbnRyeSA/PyBvcHBvc2l0ZVswXTtcblx0XHRcdGNvbnN0IGVudHJ5QiA9IG1lc2guZmFjZXNbZmFjZUluZGV4XVsobWVzaC5mYWNlc1tmYWNlSW5kZXhdLmluZGV4T2YoZW50cnlBKSArIDEpICUgNF07XG5cdFx0XHR3YWxrZWQucHVzaCh7IGZhY2U6IGZhY2VJbmRleCwgYTogb3Bwb3NpdGVbMF0sIGI6IG9wcG9zaXRlWzFdLCBlbnRyeUEsIGVudHJ5QiB9KTtcblx0XHRcdGNvbnN0IG5leHRLZXkgPSBrZXkob3Bwb3NpdGVbMF0sIG9wcG9zaXRlWzFdKTtcblx0XHRcdGNvbnN0IG5leHRPd25lcnMgPSBhZGphY2VuY3kuZ2V0KG5leHRLZXkpID8/IFtdO1xuXHRcdFx0Y29uc3QgbmV4dEZhY2UgPSBuZXh0T3duZXJzLmZpbmQoKGluZGV4KSA9PiBpbmRleCAhPT0gZmFjZUluZGV4KTtcblx0XHRcdGlmIChuZXh0RmFjZSA9PT0gdW5kZWZpbmVkKSBicmVhaztcblx0XHRcdGZhY2VJbmRleCA9IG5leHRGYWNlO1xuXHRcdFx0ZWRnZUtleSA9IG5leHRLZXk7XG5cdFx0fVxuXHRcdHJldHVybiB3YWxrZWQ7XG5cdH07XG5cblx0Ly8gQm90aCBzaWRlcyBvZiB0aGUgc3RhcnRpbmcgZWRnZSwgb3RoZXJ3aXNlIHRoZSBsb29wIHN0b3BzIGF0IHRoZSBzZWFtLlxuXHRjb25zdCBmaXJzdFNpZGUgPSB3YWxrKG93bmVyc1swXSwgc3RhcnRLZXkpO1xuXHRjb25zdCBzZWNvbmRTaWRlID0gb3duZXJzLmxlbmd0aCA+IDEgPyB3YWxrKG93bmVyc1sxXSwgc3RhcnRLZXkpIDogW107XG5cdHJpbmcucHVzaCguLi5maXJzdFNpZGUucmV2ZXJzZSgpLCAuLi5zZWNvbmRTaWRlKTtcblx0aWYgKCFyaW5nLmxlbmd0aCkge1xuXHRcdHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHsgY29kZTogJ25vdC1xdWFkJywgbWVzc2FnZTogJ0xvb3AgY3V0IG5lZWRzIGEgcmluZyBvZiBxdWFkcy4nIH0gfTtcblx0fVxuXG5cdC8vIE5ldyB2ZXJ0aWNlcywgb25lIHJvdyBwZXIgcmluZyBlZGdlLlxuXHRjb25zdCB2ZXJ0aWNlczogVmVjM1tdID0gbWVzaC52ZXJ0aWNlcy5tYXAoKHZlcnRleCkgPT4gW3ZlcnRleFswXSwgdmVydGV4WzFdLCB2ZXJ0ZXhbMl1dIGFzIFZlYzMpO1xuXHRjb25zdCBpbnNlcnRpb25zID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcltdPigpO1xuXHRjb25zdCBjdXQgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IHtcblx0XHRjb25zdCBrID0ga2V5KGEsIGIpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gaW5zZXJ0aW9ucy5nZXQoayk7XG5cdFx0aWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG5cdFx0Y29uc3QgZnJvbSA9IG1lc2gudmVydGljZXNbYV07XG5cdFx0Y29uc3QgdG8gPSBtZXNoLnZlcnRpY2VzW2JdO1xuXHRcdGNvbnN0IHJvdzogbnVtYmVyW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSBjb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0ID0gaSAvIChjb3VudCArIDEpO1xuXHRcdFx0cm93LnB1c2godmVydGljZXMubGVuZ3RoKTtcblx0XHRcdHZlcnRpY2VzLnB1c2goW2Zyb21bMF0gKyAodG9bMF0gLSBmcm9tWzBdKSAqIHQsIGZyb21bMV0gKyAodG9bMV0gLSBmcm9tWzFdKSAqIHQsIGZyb21bMl0gKyAodG9bMl0gLSBmcm9tWzJdKSAqIHRdKTtcblx0XHR9XG5cdFx0aW5zZXJ0aW9ucy5zZXQoaywgcm93KTtcblx0XHRyZXR1cm4gcm93O1xuXHR9O1xuXG5cdGZvciAoY29uc3QgaXRlbSBvZiByaW5nKSB7XG5cdFx0Y3V0KGl0ZW0uYSwgaXRlbS5iKTtcblx0XHRjdXQoaXRlbS5lbnRyeUEsIGl0ZW0uZW50cnlCKTtcblx0fVxuXG5cdC8qKiBUaGUgaW5zZXJ0ZWQgdmVydGljZXMgb2YgYW4gZWRnZSwgb3JkZXJlZCBmcm9tIGBmcm9tYCB0byBgdG9gLiAqL1xuXHRjb25zdCByb3dGcm9tID0gKGVkZ2VBOiBudW1iZXIsIGVkZ2VCOiBudW1iZXIpOiBudW1iZXJbXSA9PiB7XG5cdFx0Y29uc3Qgcm93ID0gaW5zZXJ0aW9ucy5nZXQoa2V5KGVkZ2VBLCBlZGdlQikpID8/IFtdO1xuXHRcdHJldHVybiBlZGdlQSA8IGVkZ2VCID8gcm93IDogWy4uLnJvd10ucmV2ZXJzZSgpO1xuXHR9O1xuXG5cdGNvbnN0IGZhY2VzOiBGYWNlW10gPSBbXTtcblx0Y29uc3QgZmFjZVNsb3Q6IG51bWJlcltdID0gW107XG5cdGNvbnN0IHJpbmdGYWNlcyA9IG5ldyBTZXQocmluZy5tYXAoKGl0ZW0pID0+IGl0ZW0uZmFjZSkpO1xuXHRtZXNoLmZhY2VzLmZvckVhY2goKGZhY2UsIGluZGV4KSA9PiB7XG5cdFx0aWYgKCFyaW5nRmFjZXMuaGFzKGluZGV4KSkge1xuXHRcdFx0ZmFjZXMucHVzaChbLi4uZmFjZV0pO1xuXHRcdFx0ZmFjZVNsb3QucHVzaChtZXNoLmZhY2VTbG90Py5baW5kZXhdID8/IDApO1xuXHRcdH1cblx0fSk7XG5cblx0Zm9yIChjb25zdCBpdGVtIG9mIHJpbmcpIHtcblx0XHRjb25zdCBmYWNlID0gbWVzaC5mYWNlc1tpdGVtLmZhY2VdO1xuXHRcdGNvbnN0IHNsb3QgPSBtZXNoLmZhY2VTbG90Py5baXRlbS5mYWNlXSA/PyAwO1xuXHRcdC8vIFRoZSB0d28gcmluZyBlZGdlcyBhcmUgb3Bwb3NpdGUsIHNvIHRoZSBjeWNsZSBpcyBBLCBhLCBCLCBiLlxuXHRcdGNvbnN0IGluZGV4ID0gZmFjZS5maW5kSW5kZXgoKF8sIGkpID0+IGZhY2VLZXkoZmFjZSwgaSkgPT09IGtleShpdGVtLmEsIGl0ZW0uYikpO1xuXHRcdGNvbnN0IGkxID0gaW5kZXggPCAwID8gMCA6IGluZGV4O1xuXHRcdGNvbnN0IGkyID0gKGkxICsgMikgJSA0O1xuXHRcdGNvbnN0IGEwID0gZmFjZVtpMV07XG5cdFx0Y29uc3QgYTEgPSBmYWNlWyhpMSArIDEpICUgNF07XG5cdFx0Y29uc3QgYjAgPSBmYWNlW2kyXTtcblx0XHRjb25zdCBiMSA9IGZhY2VbKGkyICsgMSkgJSA0XTtcblx0XHRjb25zdCBhUm93ID0gcm93RnJvbShhMCwgYTEpO1xuXHRcdGNvbnN0IGJSb3cgPSByb3dGcm9tKGIwLCBiMSk7XG5cdFx0aWYgKGFSb3cubGVuZ3RoICE9PSBjb3VudCB8fCBiUm93Lmxlbmd0aCAhPT0gY291bnQpIGNvbnRpbnVlO1xuXG5cdFx0Y29uc3QgQSA9IFthMCwgLi4uYVJvdywgYTFdO1xuXHRcdGNvbnN0IEIgPSBbYjAsIC4uLmJSb3csIGIxXTtcblx0XHRmb3IgKGxldCBzdHJpcCA9IDE7IHN0cmlwIDw9IGNvdW50ICsgMTsgc3RyaXArKykge1xuXHRcdFx0Y29uc3QgcXVhZDogRmFjZSA9IFtBW3N0cmlwIC0gMV0sIEFbc3RyaXBdLCBCW2NvdW50ICsgMSAtIHN0cmlwXSwgQltjb3VudCArIDIgLSBzdHJpcF1dO1xuXHRcdFx0Y29uc3QgdW5pcXVlID0gbmV3IFNldChxdWFkKTtcblx0XHRcdGlmICh1bmlxdWUuc2l6ZSA8IDQpIGNvbnRpbnVlO1xuXHRcdFx0ZmFjZXMucHVzaChxdWFkKTtcblx0XHRcdGZhY2VTbG90LnB1c2goc2xvdCk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgbmV4dCA9IGZpbmFsaXplTWVzaCh7IHZlcnRpY2VzLCBmYWNlcywgZmFjZVNsb3QsIHNsb3RzOiBtZXNoLnNsb3RzLCBzbW9vdGg6IG1lc2guc21vb3RoID8/IGZhbHNlIH0sIG1lc2guc21vb3RoID8/IGZhbHNlKTtcblx0bmV4dC5yYWRpdXMgPSBjb21wdXRlUmFkaXVzKG5leHQudmVydGljZXMpO1xuXG5cdC8vIFRoZSBuZXcgbG9vcCBlZGdlcyBhcmUgdGhvc2Ugd2hvc2UgYm90aCBlbmRzIGFyZSBpbnNlcnRlZCBwb2ludHMuXG5cdGNvbnN0IGluc2VydGVkID0gbmV3IFNldChbLi4uaW5zZXJ0aW9ucy52YWx1ZXMoKV0uZmxhdCgpKTtcblx0Y29uc3QgbG9vcEVkZ2VzID0gbmV4dC5lZGdlcy5maWx0ZXIoKFthLCBiXSkgPT4gaW5zZXJ0ZWQuaGFzKGEpICYmIGluc2VydGVkLmhhcyhiKSk7XG5cdHJldHVybiB7IG9rOiB0cnVlLCBtZXNoOiBuZXh0LCBlZGdlczogbG9vcEVkZ2VzLCBmYWNlczogcmluZy5sZW5ndGggfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCZXZlbFJlc3VsdCB7XG5cdG9rOiB0cnVlO1xuXHRtZXNoOiBNZXNoO1xuXHR2ZXJ0aWNlczogbnVtYmVyO1xuXHRmYWNlczogbnVtYmVyO1xufVxuXG4vKipcbiAqIENoYW1mZXJzIHRoZSBzZWxlY3RlZCBjb3JuZXJzLlxuICpcbiAqIEV2ZXJ5IGluY2lkZW50IGVkZ2Ugb2YgYSBjb3JuZXIgZ2V0cyBvbmUgcG9pbnQgYSBzaG9ydCB3YXkgYWxvbmcgaXQsIHRoZVxuICogY29ybmVyIGlzIHJlcGxhY2VkIGJ5IHRob3NlIHBvaW50cyBpbnNpZGUgZWFjaCBmYWNlLCBhbmQgdGhlIHBvaW50cyBhcmVcbiAqIGpvaW5lZCBpbnRvIGEgbmV3IGZhY2UuIFRoZSBvZmZzZXQgaXMgY2xhbXBlZCB0byA0NSUgb2YgdGhlIHNob3J0ZXN0XG4gKiBpbmNpZGVudCBlZGdlIHNvIHRoZSBwb2ludHMgb2YgdHdvIG5laWdoYm91cmluZyBjb3JuZXJzIGNhbiBuZXZlciBjcm9zcy5cbiAqXG4gKiBUaGlzIGlzIGEgY29ybmVyIGJldmVsOiBpdCBkb2VzIG5vdCBjcmVhdGUgcm91bmRlZCBlZGdlIHN0cmlwcywgc28gaXQgaXNcbiAqIHJlcG9ydGVkIGFzIHN1Y2ggaW5zdGVhZCBvZiBwcmV0ZW5kaW5nIHRvIGJlIGEgZnVsbCBlZGdlIGJldmVsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYmV2ZWxWZXJ0aWNlcyhtZXNoOiBNZXNoLCB2ZXJ0ZXhJbmRpY2VzOiBudW1iZXJbXSwgd2lkdGg6IG51bWJlciwgc2VnbWVudHMgPSAxKTogQmV2ZWxSZXN1bHQgfCB7IG9rOiBmYWxzZTsgZXJyb3I6IE1lc2hFcnJvciB9IHtcblx0aWYgKCF2ZXJ0ZXhJbmRpY2VzLmxlbmd0aCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogeyBjb2RlOiAnZW1wdHknLCBtZXNzYWdlOiAnU2VsZWN0IGF0IGxlYXN0IG9uZSB2ZXJ0ZXggdG8gYmV2ZWwuJyB9IH07XG5cdGlmICghTnVtYmVyLmlzRmluaXRlKHdpZHRoKSB8fCB3aWR0aCA8PSAwKSB7XG5cdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogeyBjb2RlOiAnZGVnZW5lcmF0ZScsIG1lc3NhZ2U6ICdUaGUgYmV2ZWwgd2lkdGggbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlci4nIH0gfTtcblx0fVxuXHRpZiAoc2VnbWVudHMgPCAxIHx8ICFOdW1iZXIuaXNGaW5pdGUoc2VnbWVudHMpKSB7XG5cdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogeyBjb2RlOiAnZGVnZW5lcmF0ZScsIG1lc3NhZ2U6ICdUaGUgc2VnbWVudCBjb3VudCBtdXN0IGJlIGF0IGxlYXN0IG9uZS4nIH0gfTtcblx0fVxuXHRjb25zdCBzZWxlY3RlZCA9IG5ldyBTZXQodmVydGV4SW5kaWNlcy5maWx0ZXIoKGluZGV4KSA9PiBtZXNoLnZlcnRpY2VzW2luZGV4XSkpO1xuXHRpZiAoIXNlbGVjdGVkLnNpemUpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHsgY29kZTogJ2VtcHR5JywgbWVzc2FnZTogJ05vbmUgb2YgdGhlIHNlbGVjdGVkIHZlcnRpY2VzIGV4aXN0LicgfSB9O1xuXG5cdGNvbnN0IHZlcnRpY2VzOiBWZWMzW10gPSBtZXNoLnZlcnRpY2VzLm1hcCgodmVydGV4KSA9PiBbdmVydGV4WzBdLCB2ZXJ0ZXhbMV0sIHZlcnRleFsyXV0gYXMgVmVjMyk7XG5cdGNvbnN0IGluY2lkZW50ID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXHRtZXNoLmZhY2VzLmZvckVhY2goKGZhY2UsIGZhY2VJbmRleCkgPT4ge1xuXHRcdGZvciAoY29uc3QgaW5kZXggb2YgZmFjZSkge1xuXHRcdFx0aWYgKCFzZWxlY3RlZC5oYXMoaW5kZXgpKSBjb250aW51ZTtcblx0XHRcdGNvbnN0IGJ1Y2tldCA9IGluY2lkZW50LmdldChpbmRleCk7XG5cdFx0XHRpZiAoYnVja2V0KSBidWNrZXQucHVzaChmYWNlSW5kZXgpO1xuXHRcdFx0ZWxzZSBpbmNpZGVudC5zZXQoaW5kZXgsIFtmYWNlSW5kZXhdKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIE9uZSBwb2ludCBwZXIgaW5jaWRlbnQgZWRnZSwgc2hhcmVkIGJ5IHRoZSBmYWNlcyBvbiBib3RoIHNpZGVzLlxuXHRjb25zdCBvZmZzZXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Y29uc3QgY29ybmVyUG9pbnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXHRjb25zdCBjb3JuZXJOb3JtYWwgPSBuZXcgTWFwPG51bWJlciwgVmVjMz4oKTtcblxuXHRmb3IgKGNvbnN0IGNvcm5lciBvZiBzZWxlY3RlZCkge1xuXHRcdGNvbnN0IGZhY2VzID0gaW5jaWRlbnQuZ2V0KGNvcm5lcikgPz8gW107XG5cdFx0aWYgKGZhY2VzLmxlbmd0aCA8IDMpIGNvbnRpbnVlO1xuXHRcdGNvbnN0IHBvaW50czogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBub3JtYWw6IFZlYzMgPSBbMCwgMCwgMF07XG5cdFx0Zm9yIChjb25zdCBmYWNlSW5kZXggb2YgZmFjZXMpIHtcblx0XHRcdGNvbnN0IGZhY2UgPSBtZXNoLmZhY2VzW2ZhY2VJbmRleF07XG5cdFx0XHRjb25zdCBhdCA9IGZhY2UuaW5kZXhPZihjb3JuZXIpO1xuXHRcdFx0aWYgKGF0IDwgMCkgY29udGludWU7XG5cdFx0XHRjb25zdCBwcmV2ID0gZmFjZVsoYXQgLSAxICsgZmFjZS5sZW5ndGgpICUgZmFjZS5sZW5ndGhdO1xuXHRcdFx0Y29uc3QgbmV4dCA9IGZhY2VbKGF0ICsgMSkgJSBmYWNlLmxlbmd0aF07XG5cdFx0XHRmb3IgKGNvbnN0IG90aGVyIG9mIFtwcmV2LCBuZXh0XSkge1xuXHRcdFx0XHQvLyBFYWNoIGVuZCBvZiBhbiBlZGdlIGdldHMgaXRzIG93biBwb2ludDogdHdvIG5laWdoYm91cmluZ1xuXHRcdFx0XHQvLyBjb3JuZXJzIG11c3Qgbm90IHNoYXJlIG9uZSBvZmZzZXQuXG5cdFx0XHRcdGNvbnN0IGsgPSBgJHtjb3JuZXJ9OiR7b3RoZXJ9YDtcblx0XHRcdFx0aWYgKG9mZnNldHMuaGFzKGspKSBjb250aW51ZTtcblx0XHRcdFx0Y29uc3QgZnJvbSA9IG1lc2gudmVydGljZXNbY29ybmVyXTtcblx0XHRcdFx0Y29uc3QgdG8gPSBtZXNoLnZlcnRpY2VzW290aGVyXTtcblx0XHRcdFx0Y29uc3QgbGVuZ3RoID0gTWF0aC5oeXBvdCh0b1swXSAtIGZyb21bMF0sIHRvWzFdIC0gZnJvbVsxXSwgdG9bMl0gLSBmcm9tWzJdKTtcblx0XHRcdFx0aWYgKGxlbmd0aCA8IDFlLTkpIGNvbnRpbnVlO1xuXHRcdFx0XHRjb25zdCBkaXN0YW5jZSA9IE1hdGgubWluKHdpZHRoLCBsZW5ndGggKiAwLjQ1KTtcblx0XHRcdFx0Y29uc3QgdCA9IGRpc3RhbmNlIC8gbGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHZlcnRpY2VzLmxlbmd0aDtcblx0XHRcdFx0dmVydGljZXMucHVzaChbXG5cdFx0XHRcdFx0ZnJvbVswXSArICh0b1swXSAtIGZyb21bMF0pICogdCxcblx0XHRcdFx0XHRmcm9tWzFdICsgKHRvWzFdIC0gZnJvbVsxXSkgKiB0LFxuXHRcdFx0XHRcdGZyb21bMl0gKyAodG9bMl0gLSBmcm9tWzJdKSAqIHQsXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRvZmZzZXRzLnNldChrLCBpbmRleCk7XG5cdFx0XHRcdHBvaW50cy5wdXNoKGluZGV4KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBvaW50cy5sZW5ndGggPCAzKSBjb250aW51ZTtcblx0XHRjb3JuZXJQb2ludHMuc2V0KGNvcm5lciwgWy4uLm5ldyBTZXQocG9pbnRzKV0pO1xuXG5cdFx0Ly8gVGhlIGF2ZXJhZ2Ugb2YgdGhlIGluY2lkZW50IGZhY2Ugbm9ybWFscyBvcmllbnRzIHRoZSBuZXcgY2FwLlxuXHRcdGZvciAoY29uc3QgZmFjZUluZGV4IG9mIGZhY2VzKSB7XG5cdFx0XHRjb25zdCBmYWNlID0gbWVzaC5mYWNlc1tmYWNlSW5kZXhdO1xuXHRcdFx0Y29uc3QgYXQgPSBmYWNlLmluZGV4T2YoY29ybmVyKTtcblx0XHRcdGlmIChhdCA8IDApIGNvbnRpbnVlO1xuXHRcdFx0Y29uc3QgYSA9IG1lc2gudmVydGljZXNbZmFjZVsoYXQgLSAxICsgZmFjZS5sZW5ndGgpICUgZmFjZS5sZW5ndGhdXTtcblx0XHRcdGNvbnN0IGIgPSBtZXNoLnZlcnRpY2VzW2Nvcm5lcl07XG5cdFx0XHRjb25zdCBjID0gbWVzaC52ZXJ0aWNlc1tmYWNlWyhhdCArIDEpICUgZmFjZS5sZW5ndGhdXTtcblx0XHRcdGNvbnN0IHU6IFZlYzMgPSBbYlswXSAtIGFbMF0sIGJbMV0gLSBhWzFdLCBiWzJdIC0gYVsyXV07XG5cdFx0XHRjb25zdCB2OiBWZWMzID0gW2NbMF0gLSBhWzBdLCBjWzFdIC0gYVsxXSwgY1syXSAtIGFbMl1dO1xuXHRcdFx0Y29uc3QgY3Jvc3M6IFZlYzMgPSBbdVsxXSAqIHZbMl0gLSB1WzJdICogdlsxXSwgdVsyXSAqIHZbMF0gLSB1WzBdICogdlsyXSwgdVswXSAqIHZbMV0gLSB1WzFdICogdlswXV07XG5cdFx0XHRub3JtYWxbMF0gKz0gY3Jvc3NbMF07XG5cdFx0XHRub3JtYWxbMV0gKz0gY3Jvc3NbMV07XG5cdFx0XHRub3JtYWxbMl0gKz0gY3Jvc3NbMl07XG5cdFx0fVxuXHRcdGNvcm5lck5vcm1hbC5zZXQoY29ybmVyLCBub3JtYWwpO1xuXHR9XG5cblx0aWYgKCFjb3JuZXJQb2ludHMuc2l6ZSkge1xuXHRcdHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHsgY29kZTogJ2RlZ2VuZXJhdGUnLCBtZXNzYWdlOiAnVGhvc2UgY29ybmVycyBoYXZlIHRvbyBmZXcgc3Vycm91bmRpbmcgZmFjZXMuJyB9IH07XG5cdH1cblxuXHRjb25zdCBwb2ludE9mID0gKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBvZmZzZXRzLmdldChgJHthfToke2J9YCk7XG5cblx0Y29uc3QgZmFjZXM6IEZhY2VbXSA9IFtdO1xuXHRjb25zdCBmYWNlU2xvdDogbnVtYmVyW10gPSBbXTtcblx0bWVzaC5mYWNlcy5mb3JFYWNoKChmYWNlLCBmYWNlSW5kZXgpID0+IHtcblx0XHRjb25zdCBzbG90ID0gbWVzaC5mYWNlU2xvdD8uW2ZhY2VJbmRleF0gPz8gMDtcblx0XHRsZXQgYW55ID0gZmFsc2U7XG5cdFx0Y29uc3QgcmVidWlsdDogbnVtYmVyW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZhY2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHZlcnRleCA9IGZhY2VbaV07XG5cdFx0XHRpZiAoIWNvcm5lclBvaW50cy5oYXModmVydGV4KSkge1xuXHRcdFx0XHRyZWJ1aWx0LnB1c2godmVydGV4KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcmV2ID0gZmFjZVsoaSAtIDEgKyBmYWNlLmxlbmd0aCkgJSBmYWNlLmxlbmd0aF07XG5cdFx0XHRjb25zdCBuZXh0ID0gZmFjZVsoaSArIDEpICUgZmFjZS5sZW5ndGhdO1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gcG9pbnRPZih2ZXJ0ZXgsIHByZXYpO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSBwb2ludE9mKHZlcnRleCwgbmV4dCk7XG5cdFx0XHRpZiAoYmVmb3JlID09PSB1bmRlZmluZWQgfHwgYWZ0ZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZWJ1aWx0LnB1c2godmVydGV4KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRhbnkgPSB0cnVlO1xuXHRcdFx0cmVidWlsdC5wdXNoKGJlZm9yZSwgYWZ0ZXIpO1xuXHRcdH1cblx0XHRpZiAoIWFueSkge1xuXHRcdFx0ZmFjZXMucHVzaChbLi4uZmFjZV0pO1xuXHRcdFx0ZmFjZVNsb3QucHVzaChzbG90KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKG5ldyBTZXQocmVidWlsdCkuc2l6ZSA+PSAzKSB7XG5cdFx0XHRmYWNlcy5wdXNoKHJlYnVpbHQpO1xuXHRcdFx0ZmFjZVNsb3QucHVzaChzbG90KTtcblx0XHR9XG5cdH0pO1xuXG5cdGZvciAoY29uc3QgW2Nvcm5lciwgcG9pbnRzXSBvZiBjb3JuZXJQb2ludHMpIHtcblx0XHRjb25zdCBub3JtYWwgPSBjb3JuZXJOb3JtYWwuZ2V0KGNvcm5lcikgPz8gWzAsIDEsIDBdO1xuXHRcdGNvbnN0IGxlbmd0aCA9IE1hdGguaHlwb3Qobm9ybWFsWzBdLCBub3JtYWxbMV0sIG5vcm1hbFsyXSkgfHwgMTtcblx0XHRjb25zdCBuOiBWZWMzID0gW25vcm1hbFswXSAvIGxlbmd0aCwgbm9ybWFsWzFdIC8gbGVuZ3RoLCBub3JtYWxbMl0gLyBsZW5ndGhdO1xuXHRcdGNvbnN0IGhlbHBlcjogVmVjMyA9IE1hdGguYWJzKG5bMV0pID4gMC45ID8gWzEsIDAsIDBdIDogWzAsIDEsIDBdO1xuXHRcdGNvbnN0IHJpZ2h0OiBWZWMzID0gW25bMV0gKiBoZWxwZXJbMl0gLSBuWzJdICogaGVscGVyWzFdLCBuWzJdICogaGVscGVyWzBdIC0gblswXSAqIGhlbHBlclsyXSwgblswXSAqIGhlbHBlclsxXSAtIG5bMV0gKiBoZWxwZXJbMF1dO1xuXHRcdGNvbnN0IHJpZ2h0TGVuZ3RoID0gTWF0aC5oeXBvdChyaWdodFswXSwgcmlnaHRbMV0sIHJpZ2h0WzJdKSB8fCAxO1xuXHRcdGNvbnN0IHU6IFZlYzMgPSBbcmlnaHRbMF0gLyByaWdodExlbmd0aCwgcmlnaHRbMV0gLyByaWdodExlbmd0aCwgcmlnaHRbMl0gLyByaWdodExlbmd0aF07XG5cdFx0Y29uc3QgdjogVmVjMyA9IFtuWzFdICogdVsyXSAtIG5bMl0gKiB1WzFdLCBuWzJdICogdVswXSAtIG5bMF0gKiB1WzJdLCBuWzBdICogdVsxXSAtIG5bMV0gKiB1WzBdXTtcblx0XHRjb25zdCBvcmlnaW4gPSBtZXNoLnZlcnRpY2VzW2Nvcm5lcl07XG5cdFx0Y29uc3QgcmluZyA9IFsuLi5uZXcgU2V0KHBvaW50cyldLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IHBhID0gdmVydGljZXNbYV07XG5cdFx0XHRjb25zdCBwYiA9IHZlcnRpY2VzW2JdO1xuXHRcdFx0Y29uc3QgZGEgPSBNYXRoLmF0YW4yKFxuXHRcdFx0XHQocGFbMF0gLSBvcmlnaW5bMF0pICogdlswXSArIChwYVsxXSAtIG9yaWdpblsxXSkgKiB2WzFdICsgKHBhWzJdIC0gb3JpZ2luWzJdKSAqIHZbMl0sXG5cdFx0XHRcdChwYVswXSAtIG9yaWdpblswXSkgKiB1WzBdICsgKHBhWzFdIC0gb3JpZ2luWzFdKSAqIHVbMV0gKyAocGFbMl0gLSBvcmlnaW5bMl0pICogdVsyXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBkYiA9IE1hdGguYXRhbjIoXG5cdFx0XHRcdChwYlswXSAtIG9yaWdpblswXSkgKiB2WzBdICsgKHBiWzFdIC0gb3JpZ2luWzFdKSAqIHZbMV0gKyAocGJbMl0gLSBvcmlnaW5bMl0pICogdlsyXSxcblx0XHRcdFx0KHBiWzBdIC0gb3JpZ2luWzBdKSAqIHVbMF0gKyAocGJbMV0gLSBvcmlnaW5bMV0pICogdVsxXSArIChwYlsyXSAtIG9yaWdpblsyXSkgKiB1WzJdLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiBkYSAtIGRiO1xuXHRcdH0pO1xuXHRcdGlmIChyaW5nLmxlbmd0aCA+PSAzKSB7XG5cdFx0XHRmYWNlcy5wdXNoKHJpbmcpO1xuXHRcdFx0ZmFjZVNsb3QucHVzaChtZXNoLmZhY2VTbG90Py5baW5jaWRlbnQuZ2V0KGNvcm5lcik/LlswXSA/PyAwXSA/PyAwKTtcblx0XHR9XG5cdH1cblxuXHQvLyBUaGUgYmV2ZWxsZWQgY29ybmVycyBhcmUgZ29uZTsgZHJvcCB0aGVtIGluc3RlYWQgb2YgbGVhdmluZyB1bnVzZWRcblx0Ly8gdmVydGljZXMgYmVoaW5kIGZvciBwaWNraW5nIGFuZCBleHBvcnQgdG8gdHJpcCBvdmVyLlxuXHRjb25zdCB1c2VkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcblx0Y29uc3QgY29tcGFjdFZlcnRpY2VzOiBWZWMzW10gPSBbXTtcblx0Y29uc3QgcmVtYXAgPSAoaW5kZXg6IG51bWJlcik6IG51bWJlciA9PiB7XG5cdFx0Y29uc3QgZm91bmQgPSB1c2VkLmdldChpbmRleCk7XG5cdFx0aWYgKGZvdW5kICE9PSB1bmRlZmluZWQpIHJldHVybiBmb3VuZDtcblx0XHRjb25zdCBuZXh0ID0gY29tcGFjdFZlcnRpY2VzLmxlbmd0aDtcblx0XHR1c2VkLnNldChpbmRleCwgbmV4dCk7XG5cdFx0Y29tcGFjdFZlcnRpY2VzLnB1c2godmVydGljZXNbaW5kZXhdKTtcblx0XHRyZXR1cm4gbmV4dDtcblx0fTtcblx0Y29uc3QgY29tcGFjdEZhY2VzID0gZmFjZXMubWFwKChmYWNlKSA9PiBmYWNlLm1hcChyZW1hcCkpO1xuXG5cdGNvbnN0IG5leHQgPSBmaW5hbGl6ZU1lc2goXG5cdFx0eyB2ZXJ0aWNlczogY29tcGFjdFZlcnRpY2VzLCBmYWNlczogY29tcGFjdEZhY2VzLCBmYWNlU2xvdCwgc2xvdHM6IG1lc2guc2xvdHMsIHNtb290aDogbWVzaC5zbW9vdGggPz8gZmFsc2UgfSxcblx0XHRtZXNoLnNtb290aCA/PyBmYWxzZSxcblx0KTtcblx0bmV4dC5yYWRpdXMgPSBjb21wdXRlUmFkaXVzKG5leHQudmVydGljZXMpO1xuXHRyZXR1cm4geyBvazogdHJ1ZSwgbWVzaDogbmV4dCwgdmVydGljZXM6IGNvcm5lclBv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QyxLQUFLLE1BQU0sS0FBSyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFO1FBQ2pDO1FBQ0E7UUFDQSxNQUFNLENBQUMsR0FBRyxHQUFHLE1BQU0sSUFBSSxLQUFLLEVBQUU7UUFDOUIsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFO1FBQ3BCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQ2xDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBQy9CLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxNQUFNLEdBQUcsSUFBSSxFQUFFO1FBQ25CLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFDL0MsTUFBTSxDQUFDLEdBQUcsUUFBUSxHQUFHLE1BQU07UUFDM0IsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLE1BQU07UUFDN0IsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUNiLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUMvQixJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFDL0IsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQy9CLENBQUM7UUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUM7UUFDckIsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7TUFDbkI7SUFDRDtJQUNBLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7SUFDdkIsWUFBWSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7O0lBRTlDO0lBQ0EsS0FBSyxNQUFNLFNBQVMsSUFBSSxLQUFLLEVBQUU7TUFDOUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7TUFDbEMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7TUFDL0IsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFO01BQ1osTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO01BQ25FLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO01BQy9CLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7TUFDckQsTUFBTSxDQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUN2RCxNQUFNLENBQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ3ZELE1BQU0sS0FBVyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDckcsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7TUFDckIsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7TUFDckIsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdEI7SUFDQSxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7RUFDakM7RUFFQSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRTtJQUN2QixPQUFPO01BQUUsRUFBRSxFQUFFLEtBQUs7TUFBRSxLQUFLLEVBQUU7UUFBRSxJQUFJLEVBQUUsWUFBWTtRQUFFLE9BQU8sRUFBRTtNQUFnRDtJQUFFLENBQUM7RUFDOUc7RUFFQSxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQVMsRUFBRSxDQUFTLEtBQUssT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFD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Q0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuSSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUNqRSxNQUFNLENBQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDO0lBQ3hGLE1BQU0sQ0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakcsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7SUFDcEMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSztNQUNoRCxNQUFNLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDO01BQ3RCLE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUM7TUFDdEIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FDcEIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ3BGLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FDcEYsQ0FBQztNQUNELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQ3BCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUNwRixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQ3BGLENBQUM7TUFDRCxPQUFPLEVBQUUsR0FBRyxFQUFFO0lBQ2YsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRTtNQUNyQixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztNQUNoQixRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEU7RUFDRDs7RUFFQTtFQUNBO0VBQ0EsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQWlCLENBQUM7RUFDdEMsTUFBTSxlQUF1QixHQUFHLEVBQUU7RUFDbEMsTUFBTSxLQUFLLEdBQUksS0FBYSxJQUFhO0lBQ3hDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO0lBQzdCLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxPQUFPLEtBQUs7SUFDckMsTUFBTSxJQUFJLEdBQUcsZUFBZSxDQUFDLE1BQU07SUFDbkMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDO0lBQ3JCLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3JDLE9BQU8sSUFBSTtFQUNaLENBQUM7RUFDRCxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFFLElBQUksSUFBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0VBRXpELE1BQU0sSUFBSSxHQUFHLFlBQVksQ0FDeEI7SUFBRSxRQUFRLEVBQUUsZUFBZTtJQUFFLEtBQUssRUFBRSxZQUFZO0lBQUUsUUFBUTtJQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztJQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxJQUFJO0VBQU0sQ0FBQyxFQUM3RyxJQUFJLENBQUMsTUFBTSxJQUFJLEtBQ2hCLENBQUM7RUFDRCxJQUFJLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO0VBQzFDLE9BQU87SUFBRSxFQUFFLEVBQUUsSUFBSTtJQUFFLElBQUksRUFBRSxJQUFJO0lBQUUsUUFBUSxFQUFFLFlBQVksQ0FBQyxJQUFJO0lBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUM7RUFBTyxDQUFDO0FBQ3ZGIiwiaWdub3JlTGlzdCI6W119