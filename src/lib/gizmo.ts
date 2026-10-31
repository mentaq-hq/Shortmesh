// Transform gizmos, modelled on Blender's gizmo library.
//
// Blender draws a move gizmo as three arrows with a cone tip, three plane
// handles and a screen aligned disc in the middle. The rotate gizmo draws one
// ring per axis. The scale gizmo draws three axes with a cube handle and a
// cube in the middle for a uniform scale.
//
// The same description drives the drawing and the picking, so what the user
// sees is exactly what can be grabbed.

import type { Vec3 } from './math3d';
import { add, cross, dot, normalize, rotateEuler, scale } from './math3d';

export type GizmoMode = 'translate' | 'rotate' | 'scale' | 'universal';

export type GizmoAxis = 0 | 1 | 2;

export type GizmoHit =
	| { kind: 'axis'; axis: GizmoAxis }
	| { kind: 'plane'; axis: GizmoAxis }
	| { kind: 'center' }
	| { kind: 'ring'; axis: GizmoAxis }
	| { kind: 'scale'; axis: GizmoAxis };

/** The colours Blender uses for the three axes. */
export const AXIS_COLORS: [number, number, number][] = [
	[0.957, 0.263, 0.263],
	[0.549, 0.855, 0.353],
	[0.298, 0.549, 0.957],
];

/** The colour of a handle the pointer is over. */
export const HOVER_COLOR: [number, number, number] = [1.0, 0.82, 0.25];

/** A coloured line in world space. */
export interface GizmoLine {
	a: Vec3;
	b: Vec3;
	color: [number, number, number];
}

/** A filled triangle in world space. */
export interface GizmoTriangle {
	points: [Vec3, Vec3, Vec3];
	color: [number, number, number];
}

/** A shape that can be picked, always described in screen space pixels. */
export type GizmoPick =
	| { kind: 'segment'; a: Vec3; b: Vec3; radius: number }
	| { kind: 'point'; at: Vec3; radius: number }
	| { kind: 'ring'; points: Vec3[]; radius: number };

export interface GizmoPart {
	lines: GizmoLine[];
	triangles: GizmoTriangle[];
	pick: GizmoPick;
	hit: GizmoHit;
}

export interface GizmoView {
	/** Right vector of the camera. */
	right: Vec3;
	/** Up vector of the camera. */
	up: Vec3;
}

export interface GizmoOptions {
	mode: GizmoMode;
	/** Centre of the gizmo in world space. */
	target: Vec3;
	/** Size of the gizmo in world units. */
	size: number;
	/** Rotation of the gizmo, used by the local space. */
	rotation: Vec3;
	/** Use the rotation of the object instead of the world axes. */
	local: boolean;
	/** Camera basis, used for the screen aligned handles. */
	view: GizmoView;
	/** Handle the pointer is over, drawn in the hover colour. */
	hover: GizmoHit | null;
}

const RING_SEGMENTS = 48;
const CONE_SEGMENTS = 12;

function colorOf(axis: GizmoAxis, hover: GizmoHit | null, hit: GizmoHit): [number, number, number] {
	if (!hover) return AXIS_COLORS[axis];
	if (hover.kind === hit.kind && (hover as { axis?: number }).axis === (hit as { axis?: number }).axis) {
		return HOVER_COLOR;
	}
	return AXIS_COLORS[axis];
}

function sameHit(a: GizmoHit, b: GizmoHit): boolean {
	if (a.kind !== b.kind) return false;
	if ('axis' in a && 'axis' in b) return a.axis === b.axis;
	return true;
}

/** Builds the axis directions of the gizmo. */
function axisDirections(rotation: Vec3, local: boolean): Vec3[] {
	if (!local) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
	return [
		rotateEuler([1, 0, 0], rotation),
		rotateEuler([0, 1, 0], rotation),
		rotateEuler([0, 0, 1], rotation),
	];
}

/** A cone pointing along `direction`, used for the tip of a move arrow. */
function cone(origin: Vec3, direction: Vec3, length: number, radius: number): GizmoTriangle[] {
	const forward = normalize(direction);
	const helper: Vec3 = Math.abs(forward[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
	const side = normalize(cross(forward, helper));
	const up = normalize(cross(side, forward));
	const apex = add(origin, scale(forward, length));
	const triangles: GizmoTriangle[] = [];
	for (let index = 0; index < CONE_SEGMENTS; index++) {
		const a0 = (index / CONE_SEGMENTS) * Math.PI * 2;
		const a1 = ((index + 1) / CONE_SEGMENTS) * Math.PI * 2;
		const p0 = add(origin, add(scale(side, Math.cos(a0) * radius), scale(up, Math.sin(a0) * radius)));
		const p1 = add(origin, add(scale(side, Math.cos(a1) * radius), scale(up, Math.sin(a1) * radius)));
		triangles.push({ points: [p0, p1, apex], color: [0, 0, 0] });
	}
	return triangles;
}

/** A flat quad in the plane of two axis directions. */
function quad(
	center: Vec3,
	first: Vec3,
	second: Vec3,
	half: number,
): [Vec3, Vec3, Vec3][] {
	const a = add(center, add(scale(first, half), scale(second, half)));
	const b = add(center, add(scale(first, -half), scale(second, half)));
	const c = add(center, add(scale(first, -half), scale(second, -half)));
	const d = add(center, add(scale(first, half), scale(second, -half)));
	return [
		[a, b, c],
		[a, c, d],
	];
}

/** A small cube, used for the scale handles. */
function cube(center: Vec3, half: number): [Vec3, Vec3, Vec3][] {
	const h = half;
	const corners: Vec3[] = [
		[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h],
		[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h],
	];
	const faces: number[][] = [
		[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3],
		[1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4],
	];
	const triangles: [Vec3, Vec3, Vec3][] = [];
	for (const face of faces) {
		const p0 = add(center, corners[face[0]]);
		const p1 = add(center, corners[face[1]]);
		const p2 = add(center, corners[face[2]]);
		const p3 = add(center, corners[face[3]]);
		triangles.push([p0, p1, p2]);
		triangles.push([p0, p2, p3]);
	}
	return triangles;
}

/** A circle in the plane of a normal, used for the rotate rings. */
function ring(center: Vec3, axis: Vec3, radius: number): Vec3[] {
	const helper: Vec3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
	const first = normalize(cross(axis, helper));
	const second = normalize(cross(axis, first));
	const points: Vec3[] = [];
	for (let index = 0; index < RING_SEGMENTS; index++) {
		const angle = (index / RING_SEGMENTS) * Math.PI * 2;
		points.push(
			add(center, add(scale(first, Math.cos(angle) * radius), scale(second, Math.sin(angle) * radius))),
		);
	}
	return points;
}

/** A screen aligned disc, the free move handle of the move gizmo. */
function disc(center: Vec3, view: GizmoView, radius: number): [Vec3, Vec3, Vec3][] {
	const segments = 24;
	const triangles: [Vec3, Vec3, Vec3][] = [];
	for (let index = 0; index < segments; index++) {
		const a0 = (index / segments) * Math.PI * 2;
		const a1 = ((index + 1) / segments) * Math.PI * 2;
		const p0 = add(center, add(scale(view.right, Math.cos(a0) * radius), scale(view.up, Math.sin(a0) * radius)));
		const p1 = add(center, add(scale(view.right, Math.cos(a1) * radius), scale(view.up, Math.sin(a1) * radius)));
		triangles.push([center, p0, p1]);
	}
	return triangles;
}

/**
 * Builds the gizmo.
 *
 * The result carries the geometry that is drawn and the shapes that are
 * picked, both in world space.
 */
export function buildGizmo(options: GizmoOptions): GizmoPart[] {
	const { mode, target, size, rotation, local, view, hover } = options;
	const directions = axisDirections(rotation, local);
	const parts: GizmoPart[] = [];

	if (mode === 'translate') {
		const shaft = size * 0.62;
		const tip = size;
		const coneRadius = size * 0.075;
		for (let axis = 0 as GizmoAxis; axis < 3; axis = (axis + 1) as GizmoAxis) {
			const direction = directions[axis];
			const color = colorOf(axis, hover, { kind: 'axis', axis });
			const end = add(target, scale(direction, shaft));
			const tipPoint = add(target, scale(direction, tip));
			const triangles = cone(end, direction, tip - shaft, coneRadius);
			parts.push({
				lines: [{ a: target, b: end, color }],
				triangles: triangles.map((triangle) => ({ points: triangle.points, color })),
				// The pick starts away from the centre, the disc owns that spot.
				pick: { kind: 'segment', a: add(target, scale(direction, size * 0.2)), b: tipPoint, radius: 15 },
				hit: { kind: 'axis', axis },
			});
		}

		// The plane handles sit between the axes.
		const planeOffset = size * 0.32;
		const planeHalf = size * 0.085;
		const planes: { axis: GizmoAxis; first: GizmoAxis; second: GizmoAxis }[] = [
			{ axis: 0, first: 1, second: 2 },
			{ axis: 1, first: 2, second: 0 },
			{ axis: 2, first: 0, second: 1 },
		];
		for (const plane of planes) {
			const center = add(
				target,
				add(scale(directions[plane.first], planeOffset), scale(directions[plane.second], planeOffset)),
			);
			const color: [number, number, number] =
				hover && sameHit(hover, { kind: 'plane', axis: plane.axis })
					? HOVER_COLOR
					: [
							(AXIS_COLORS[plane.first][0] + AXIS_COLORS[plane.second][0]) / 2,
							(AXIS_COLORS[plane.first][1] + AXIS_COLORS[plane.second][1]) / 2,
							(AXIS_COLORS[plane.first][2] + AXIS_COLORS[plane.second][2]) / 2,
					];
			parts.push({
				lines: [],
				triangles: quad(center, directions[plane.first], directions[plane.second], planeHalf).map((triangle) => ({
					points: triangle,
					color,
				})),
				pick: { kind: 'point', at: center, radius: 14 },
				hit: { kind: 'plane', axis: plane.axis },
			});
		}

		const discRadius = size * 0.095;
		const centerColor: [number, number, number] =
			hover && sameHit(hover, { kind: 'center' }) ? HOVER_COLOR : [0.85, 0.88, 0.95];
		parts.push({
			lines: [],
			triangles: disc(target, view, discRadius).map((triangle) => ({ points: triangle, color: centerColor })),
			pick: { kind: 'point', at: target, radius: 13 },
			hit: { kind: 'center' },
		});
		return parts;
	}

	if (mode === 'rotate') {
		const radius = size * 0.85;
		for (let axis = 0 as GizmoAxis; axis < 3; axis = (axis + 1) as GizmoAxis) {
			const points = ring(target, directions[axis], radius);
			const color = colorOf(axis, hover, { kind: 'ring', axis });
			const lines: GizmoLine[] = [];
			for (let index = 0; index < points.length; index++) {
				lines.push({ a: points[index], b: points[(index + 1) % points.length], color });
			}
			parts.push({
				lines,
				triangles: [],
				pick: { kind: 'ring', points, radius: 16 },
				hit: { kind: 'ring', axis },
			});
		}
		const centerColor: [number, number, number] =
			hover && sameHit(hover, { kind: 'center' }) ? HOVER_COLOR : [0.85, 0.88, 0.95];
		parts.push({
			lines: [],
			triangles: disc(target, view, size * 0.08).map((triangle) => ({ points: triangle, color: centerColor })),
			pick: { kind: 'point', at: target, radius: 10 },
			hit: { kind: 'center' },
		});
		return parts;
	}


	if (mode === 'universal') {
		const shaft = size * 0.65;
		const tip = size * 0.9;
		const coneRadius = size * 0.065;
		for (let axis = 0 as GizmoAxis; axis < 3; axis = (axis + 1) as GizmoAxis) {
			const direction = directions[axis];
			const color = colorOf(axis, hover, { kind: 'axis', axis });
			const end = add(target, scale(direction, shaft));
			const tipPoint = add(target, scale(direction, tip));
			const triangles = cone(end, direction, tip - shaft, coneRadius);
			parts.push({
				lines: [{ a: target, b: end, color }],
				triangles: triangles.map((triangle) => ({ points: triangle.points, color })),
				pick: { kind: 'segment', a: add(target, scale(direction, size * 0.2)), b: tipPoint, radius: 14 },
				hit: { kind: 'axis', axis },
			});
		}

		const radius = size * 1.05;
		for (let axis = 0 as GizmoAxis; axis < 3; axis = (axis + 1) as GizmoAxis) {
			const points = ring(target, directions[axis], radius);
			const color = colorOf(axis, hover, { kind: 'ring', axis });
			const lines: GizmoLine[] = [];
			for (let index = 0; index < points.length; index++) {
				lines.push({ a: points[index], b: points[(index + 1) % points.length], color });
			}
			parts.push({
				lines,
				triangles: [],
				pick: { kind: 'ring', points, radius: 14 },
				hit: { kind: 'ring', axis },
			});
		}

		const scaleDist = size * 0.42;
		const handleHalf = size * 0.055;
		for (let axis = 0 as GizmoAxis; axis < 3; axis = (axis + 1) as GizmoAxis) {
			const direction = directions[axis];
			const color = colorOf(axis, hover, { kind: 'scale', axis });
			const handle = add(target, scale(direction, scaleDist));
			parts.push({
				lines: [],
				triangles: cube(handle, handleHalf).map((triangle) => ({ points: triangle, color })),
				pick: { kind: 'point', at: handle, radius: 14 },
				hit: { kind: 'scale', axis },
			});
		}

		const discRadius = size * 0.085;
		const centerColor: [number, number, number] =
			hover && sameHit(hover, { kind: 'center' }) ? HOVER_COLOR : [0.85, 0.88, 0.95];
		parts.push({
			lines: [],
			triangles: disc(target, view, discRadius).map((triangle) => ({ points: triangle, color: centerColor })),
			pick: { kind: 'point', at: target, radius: 12 },
			hit: { kind: 'center' },
		});
		return parts;
	}

	// Scale.
	const shaft = size * 0.9;
	const handleHalf = size * 0.085;
	for (let axis = 0 as GizmoAxis; axis < 3; axis = (axis + 1) as GizmoAxis) {
		const direction = directions[axis];
		const color = colorOf(axis, hover, { kind: 'axis', axis });
		const end = add(target, scale(direction, shaft));
		const handle = add(target, scale(direction, shaft + handleHalf));
		parts.push({
			lines: [{ a: target, b: end, color }],
			triangles: cube(handle, handleHalf).map((triangle) => ({ points: triangle, color })),
			pick: { kind: 'point', at: handle, radius: 18 },
			hit: { kind: 'axis', axis },
		});
	}
	const centerColor: [number, number, number] =
		hover && sameHit(hover, { kind: 'center' }) ? HOVER_COLOR : [0.85, 0.88, 0.95];
	parts.push({
		lines: [],
		triangles: cube(target, handleHalf * 1.1).map((triangle) => ({ points: triangle, color: centerColor })),
		pick: { kind: 'point', at: target, radius: 14 },
		hit: { kind: 'center' },
	});
	return parts;
}

/** Distance from a point to a segment. */
export function distanceToSegment(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const abx = bx - ax;
	const aby = by - ay;
	const lengthSq = abx * abx + aby * aby || 1;
	let t = ((px - ax) * abx + (py - ay) * aby) / lengthSq;
	t = Math.min(1, Math.max(0, t));
	return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/** Distance from a point to a closed polyline. */
export function distanceToPolyline(
	px: number,
	py: number,
	points: { x: number; y: number }[],
): number {
	let best = Infinity;
	for (let index = 0; index < points.length; index++) {
		const a = points[index];
		const b = points[(index + 1) % points.length];
		best = Math.min(best, distanceToSegment(px, py, a.x, a.y, b.x, b.y));
	}
	return best;
}

/** The world direction of a gizmo axis. */
export function gizmoAxisDirection(rotation: Vec3, local: boolean, axis: GizmoAxis): Vec3 {
	return axisDirections(rotation, local)[axis];
}

/** The two axes of a plane handle. */
export function gizmoPlaneAxes(
	rotation: Vec3,
	local: boolean,
	axis: GizmoAxis,
): [Vec3, Vec3] {
	const directions = axisDirections(rotation, local);
	if (axis === 0) return [directions[1], directions[2]];
	if (axis === 1) return [directions[2], directions[0]];
	return [directions[0], directions[1]];
}

/** Signed angle of a screen point around a screen centre. */
export function screenAngle(cx: number, cy: number, px: number, py: number): number {
	return Math.atan2(py - cy, px - cx);
}

/** Dot product of a world direction with the camera forward, used to flip a ring. */
export function facing(direction: Vec3, forward: Vec3): number {
	return dot(direction, forward);
}
