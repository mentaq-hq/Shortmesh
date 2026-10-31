import type { SceneObject } from '../stores/scene';
import type { OrbitCamera, CameraBasis, Vec3 } from './math3d';
import {
	add,
	cameraBasis,
	clamp,
	cross,
	dot,
	hexToRgb,
	normalize,
	project,
	rotateEuler,
	scale,
	sub,
	transformPoint,
	withAlpha,
} from './math3d';
import { meshFor } from './mesh';

export interface RenderOptions {
	shading: 'wireframe' | 'solid' | 'material' | 'rendered' | 'toon';
	xray: boolean;
	grid: boolean;
	axes: boolean;
	selectedId: string | null;
	showGizmo: boolean;
	gameMode: boolean;
}

interface FaceDraw {
	points: { x: number; y: number }[];
	depth: number;
	fill: string;
	stroke: string;
}

const LIGHT = normalize([-0.45, 0.92, 0.55]);

function viewSpace(point: Vec3, basis: CameraBasis): Vec3 {
	const rel = sub(point, basis.eye);
	return [dot(rel, basis.right), dot(rel, basis.up), dot(rel, basis.forward)];
}

function projectView(point: Vec3, basis: CameraBasis, width: number, height: number) {
	const f = height / 2 / Math.tan((basis.fov * Math.PI) / 360);
	return { x: width / 2 + (point[0] / point[2]) * f, y: height / 2 - (point[1] / point[2]) * f };
}

function clippedSegment(
	a: Vec3,
	b: Vec3,
	basis: CameraBasis,
	width: number,
	height: number,
): [{ x: number; y: number }, { x: number; y: number }] | null {
	let va = viewSpace(a, basis);
	let vb = viewSpace(b, basis);
	if (va[2] < basis.near && vb[2] < basis.near) return null;
	if (va[2] < basis.near) {
		const t = (basis.near - va[2]) / (vb[2] - va[2]);
		va = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, basis.near];
	} else if (vb[2] < basis.near) {
		const t = (basis.near - vb[2]) / (va[2] - vb[2]);
		vb = [vb[0] + (va[0] - vb[0]) * t, vb[1] + (va[1] - vb[1]) * t, basis.near];
	}
	return [projectView(va, basis, width, height), projectView(vb, basis, width, height)];
}

function shadedColor(base: string, brightness: number, toon: boolean, alpha = 1): string {
	const [r, g, b] = hexToRgb(base);
	const level = toon ? Math.round(brightness * 3) / 3 : brightness;
	return `rgba(${Math.round(r * level)}, ${Math.round(g * level)}, ${Math.round(b * level)}, ${alpha})`;
}

function drawGrid(ctx: CanvasRenderingContext2D, basis: CameraBasis, width: number, height: number) {
	const extent = 12;
	ctx.lineWidth = 1;
	for (let i = -extent; i <= extent; i++) {
		const major = i === 0;
		ctx.strokeStyle = major ? 'rgba(120, 145, 180, 0.34)' : 'rgba(120, 145, 180, 0.12)';
		const xLine = clippedSegment([i, 0, -extent], [i, 0, extent], basis, width, height);
		if (xLine) {
			ctx.beginPath();
			ctx.moveTo(xLine[0].x, xLine[0].y);
			ctx.lineTo(xLine[1].x, xLine[1].y);
			ctx.stroke();
		}
		const zLine = clippedSegment([-extent, 0, i], [extent, 0, i], basis, width, height);
		if (zLine) {
			ctx.beginPath();
			ctx.moveTo(zLine[0].x, zLine[0].y);
			ctx.lineTo(zLine[1].x, zLine[1].y);
			ctx.stroke();
		}
	}
}

function drawAxes(ctx: CanvasRenderingContext2D, basis: CameraBasis, width: number, height: number) {
	const origin = project([0, 0, 0], basis, width, height);
	const axes: [Vec3, string][] = [
		[[2, 0, 0], '#ff6b6b'],
		[[0, 2, 0], '#51d88a'],
		[[0, 0, 2], '#5cb8ff'],
	];
	ctx.lineWidth = 2;
	for (const [endpoint, color] of axes) {
		const end = project(endpoint, basis, width, height);
		if (!origin.visible || !end.visible) continue;
		ctx.strokeStyle = color;
		ctx.beginPath();
		ctx.moveTo(origin.x, origin.y);
		ctx.lineTo(end.x, end.y);
		ctx.stroke();
	}
}

function drawGizmo(
	ctx: CanvasRenderingContext2D,
	object: SceneObject,
	basis: CameraBasis,
	width: number,
	height: number,
	mode: string,
) {
	const origin = project(object.position, basis, width, height);
	if (!origin.visible) return;
	const colors = ['#ff6b6b', '#51d88a', '#5cb8ff'];
	const ends: Vec3[] = [
		add(object.position, [0.85, 0, 0]),
		add(object.position, [0, 0.85, 0]),
		add(object.position, [0, 0, 0.85]),
	];
	const labels = mode === 'rotate' ? ['X', 'Y', 'Z'] : ['X', 'Y', 'Z'];
	ctx.lineWidth = 2.5;
	ctx.font = '700 10px Inter, system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for (let i = 0; i < ends.length; i++) {
		const end = project(ends[i], basis, width, height);
		if (!end.visible) continue;
		ctx.strokeStyle = colors[i];
		ctx.fillStyle = colors[i];
		ctx.beginPath();
		ctx.moveTo(origin.x, origin.y);
		ctx.lineTo(end.x, end.y);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(end.x, end.y, 4.5, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#0b0c10';
		ctx.fillText(labels[i], end.x, end.y + 0.5);
	}
	ctx.beginPath();
	ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(238, 240, 246, 0.9)';
	ctx.fill();
}

function drawLight(
	ctx: CanvasRenderingContext2D,
	object: SceneObject,
	basis: CameraBasis,
	width: number,
	height: number,
	selected: boolean,
) {
	const p = project(object.position, basis, width, height);
	if (!p.visible) return;
	ctx.save();
	ctx.strokeStyle = selected ? '#3dd9a8' : '#ffc247';
	ctx.fillStyle = selected ? 'rgba(61, 217, 168, 0.18)' : 'rgba(255, 194, 71, 0.18)';
	ctx.lineWidth = selected ? 2 : 1.5;
	ctx.beginPath();
	ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	for (let i = 0; i < 8; i++) {
		const angle = (i / 8) * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(p.x + Math.cos(angle) * 12, p.y + Math.sin(angle) * 12);
		ctx.lineTo(p.x + Math.cos(angle) * 17, p.y + Math.sin(angle) * 17);
		ctx.stroke();
	}
	ctx.restore();
}

function drawCamera(
	ctx: CanvasRenderingContext2D,
	object: SceneObject,
	basis: CameraBasis,
	width: number,
	height: number,
	selected: boolean,
) {
	const forward = rotateEuler([0, 0, -1], object.rotation);
	const up = rotateEuler([0, 1, 0], object.rotation);
	const right = normalize(cross(forward, up));
	const spread = 0.32;
	const depth = 0.75;
	const apex = object.position;
	const corners = [
		add(add(apex, scale(forward, depth)), add(scale(right, -spread), scale(up, -spread))),
		add(add(apex, scale(forward, depth)), add(scale(right, spread), scale(up, -spread))),
		add(add(apex, scale(forward, depth)), add(scale(right, spread), scale(up, spread))),
		add(add(apex, scale(forward, depth)), add(scale(right, -spread), scale(up, spread))),
	];
	const color = selected ? '#3dd9a8' : '#a78bfa';
	ctx.strokeStyle = color;
	ctx.lineWidth = selected ? 2 : 1.5;
	const apexPoint = project(apex, basis, width, height);
	for (const corner of corners) {
		const c = project(corner, basis, width, height);
		if (!apexPoint.visible || !c.visible) continue;
		ctx.beginPath();
		ctx.moveTo(apexPoint.x, apexPoint.y);
		ctx.lineTo(c.x, c.y);
		ctx.stroke();
	}
	ctx.beginPath();
	for (let i = 0; i < corners.length; i++) {
		const c = project(corners[i], basis, width, height);
		if (!c.visible) continue;
		if (i === 0) ctx.moveTo(c.x, c.y);
		else ctx.lineTo(c.x, c.y);
	}
	ctx.closePath();
	ctx.stroke();
}

export function drawScene(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	objects: SceneObject[],
	camera: OrbitCamera | CameraBasis,
	options: RenderOptions,
): { hits: { id: string; x: number; y: number; radius: number }[]; fpsLabel: string } {
	const basis = 'eye' in camera ? camera : cameraBasis(camera);
	const gradient = ctx.createRadialGradient(width * 0.5, height * 0.34, 40, width * 0.5, height * 0.5, Math.max(width, height) * 0.8);
	gradient.addColorStop(0, '#1b2030');
	gradient.addColorStop(1, '#0b0c10');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);

	if (options.grid) drawGrid(ctx, basis, width, height);
	if (options.axes) drawAxes(ctx, basis, width, height);

	const faces: FaceDraw[] = [];
	const hits: { id: string; x: number; y: number; radius: number }[] = [];
	const specials: SceneObject[] = [];

	for (const object of objects) {
		if (!object.visible) continue;
		if (object.type === 'light' || object.type === 'camera') {
			specials.push(object);
			const p = project(object.position, basis, width, height);
			if (p.visible) hits.push({ id: object.id, x: p.x, y: p.y, radius: 18 });
			continue;
		}
		const mesh = object.geometry ?? meshFor(object.type);
		if (!mesh) continue;

		const world = mesh.vertices.map((v) => transformPoint(v, object.position, object.rotation, object.scale));
		const projected = world.map((p) => project(p, basis, width, height));
		const center = project(object.position, basis, width, height);
		const maxScale = Math.max(object.scale[0], object.scale[1], object.scale[2]);
		if (center.visible) {
			const radius = (mesh.radius * maxScale * (height / 2 / Math.tan((basis.fov * Math.PI) / 360))) / Math.max(center.z, 0.1);
			hits.push({ id: object.id, x: center.x, y: center.y, radius: clamp(radius + 10, 14, 120) });
		}

		// The camera preview must show the material the editor shows, not the
		// legacy base colour stored beside it.
		const base = object.geometry?.slots?.[0]?.color || object.color || '#ebeff5';
		for (const face of mesh.faces) {
			if (face.some((index) => !projected[index]?.visible)) continue;
			if (options.shading !== 'wireframe') {
				const a = world[face[0]];
				const b = world[face[1]];
				const c = world[face[2]];
				const normal = normalize(cross(sub(b, a), sub(c, a)));
				const brightness = clamp(0.38 + Math.abs(dot(normal, LIGHT)) * 0.7, 0.22, 1.12);
				let alpha = options.shading === 'rendered' ? 0.98 : 0.92;
				if (options.xray) alpha = 0.16;
				const fill =
					options.shading === 'solid'
						? shadedColor('#7f8ca6', brightness, false, alpha)
						: shadedColor(base, brightness, options.shading === 'toon', alpha);
				const points = face.map((index) => projected[index]);
				const depth = points.reduce((sum, p) => sum + p.z, 0) / points.length;
				faces.push({
					points,
					depth,
					fill,
					stroke: options.shading === 'toon' ? 'rgba(6, 10, 14, 0.55)' : 'rgba(8, 12, 18, 0.28)',
				});
			}
		}
	}

	faces.sort((a, b) => b.depth - a.depth);
	for (const face of faces) {
		ctx.beginPath();
		ctx.moveTo(face.points[0].x, face.points[0].y);
		for (let i = 1; i < face.points.length; i++) ctx.lineTo(face.points[i].x, face.points[i].y);
		ctx.closePath();
		ctx.fillStyle = face.fill;
		ctx.fill();
		ctx.strokeStyle = face.stroke;
		ctx.lineWidth = 0.75;
		ctx.stroke();
	}

	for (const object of objects) {
		if (!object.visible) continue;
		if (object.type === 'light' || object.type === 'camera') continue;
		const mesh = object.geometry ?? meshFor(object.type);
		if (!mesh) continue;
		const world = mesh.vertices.map((v) => transformPoint(v, object.position, object.rotation, object.scale));
		const selected = options.selectedId === object.id;
		ctx.strokeStyle = selected ? '#3dd9a8' : options.shading === 'wireframe' ? withAlpha(object.geometry?.slots?.[0]?.color || object.color || '#ebeff5', 0.85) : 'rgba(220, 230, 245, 0.16)';
		ctx.lineWidth = selected ? 2 : 0.8;
		for (const [a, b] of mesh.edges) {
			const segment = clippedSegment(world[a], world[b], basis, width, height);
			if (!segment) continue;
			ctx.beginPath();
			ctx.moveTo(segment[0].x, segment[0].y);
			ctx.lineTo(segment[1].x, segment[1].y);
			ctx.stroke();
		}
	}

	for (const object of specials) {
		const selected = options.selectedId === object.id;
		if (object.type === 'light') drawLight(ctx, object, basis, width, height, selected);
		else drawCamera(ctx, object, basis, width, height, selected);
	}

	const selectedObject = objects.find((object) => object.id === options.selectedId);
	if (selectedObject && options.showGizmo) {
		drawGizmo(ctx, selectedObject, basis, width, height, 'translate');
	}

	return { hits, fpsLabel: `${objects.length} obj` };
}
