import type { Vec3 } from './math3d';
import type { Mesh } from './mesh';
import { computeVertexNormals, faceNormal } from './mesh';
import type { RenderSlot } from './materials';
import type { GizmoPart } from './gizmo';
import {
	hexColor,
	mat4FromTRS,
	mat4Identity,
	mat4LookAt,
	mat4Multiply,
	mat4Perspective,
	normalMatrix,
} from './glmath';

export interface RenderObject {
	id: string;
	mesh: Mesh;
	geometryVersion: number;
	selectionVersion: number;
	colorVersion: number;
	position: Vec3;
	rotation: Vec3;
	scale: Vec3;
	color: [number, number, number];
	emissive: [number, number, number];
	opacity: number;
	metalness: number;
	roughness: number;
	selected: boolean;
	selectedFaces: Set<number> | null;
	selectedEdges: Set<number> | null;
	selectedVertices: Set<number> | null;
	hoverKind: 'vertex' | 'edge' | 'face' | null;
	hoverIndex: number | null;
	special: 'light' | 'camera' | null;
	slots: RenderSlot[];
	glowFaces: Set<number> | null;
	glowVersion: number;
}

export interface RenderCamera {
	eye: Vec3;
	forward: Vec3;
	up: Vec3;
	fov: number;
	near: number;
	far: number;
}

export interface RenderOptions {
	shading: 'wireframe' | 'solid' | 'material' | 'rendered' | 'toon';
	xray: boolean;
	grid: boolean;
	axes: boolean;
	wireOverlay: boolean;
	outlines: boolean;
	selectOutline: boolean;
	editMode: boolean;
	elementMode: 'vertex' | 'edge' | 'face' | null;
	background: [number, number, number];
	gizmo: GizmoPart[] | null;
	overlayLine: { x0: number; y0: number; x1: number; y1: number } | null;
	cursor?: Vec3 | null;
	brushRing?: { center: Vec3; normal?: Vec3; radius: number; color?: [number, number, number]; mirrors?: Vec3[] } | null;
	ambient?: number;
	lightDir?: Vec3;
	lightColor?: [number, number, number];
	shadows?: boolean;
	ao?: number;
	bloom?: number;
}

const SELECT: [number, number, number] = [0.24, 0.85, 0.66];
const HOVER: [number, number, number] = [1.0, 0.76, 0.28];

const MESH_VS = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in float aSelect;
in vec3 aColor;
in vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform int uOutline;
uniform float uOutlinePx;
uniform vec2 uViewport;
uniform vec3 uLightDir;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out float vSelect;
out vec3 vColor;
out vec2 vUV;
void main() {
	vec4 world = uModel * vec4(aPosition, 1.0);
	vLocal = aPosition;
	if (uOutline == 2) {
		vec2 shShift = uLightDir.xz / max(0.32, abs(uLightDir.y));
		float h = max(0.0, world.y);
		world.xz -= shShift * h * 0.65;
		world.y = 0.004;
		gl_Position = uViewProj * world;
		return;
	}
	vWorld = world.xyz;
	vNormal = uNormalMat * aNormal;
	vSelect = aSelect;
	vColor = aColor;
	vUV = aUV;
	vec4 clip = uViewProj * world;
	if (uOutline == 1) {
		vec3 radial = length(aPosition) > 0.0001 ? normalize(uNormalMat * aPosition) : normalize(vNormal);
		vec3 expandN = normalize(mix(normalize(vNormal), radial, 0.45));
		vec4 clipN = uViewProj * vec4(expandN, 0.0);
		float len = length(clipN.xy);
		vec2 dir = len > 0.0001 ? clipN.xy / len : vec2(0.0);
		clip.xy += dir * (uOutlinePx * 2.0 / uViewport) * clip.w;
		clip.z += 0.0035 * clip.w;
	}
	gl_Position = clip;
}`;

const MESH_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in float vSelect;
in vec3 vColor;
in vec2 vUV;
uniform int uShading;
uniform int uOutline;
uniform int uUseVertexColor;
uniform int uUseTexture;
uniform int uUseRoughMap;
uniform int uUseBumpMap;
uniform sampler2D uTexture;
uniform sampler2D uRoughMap;
uniform sampler2D uBumpMap;
uniform vec3 uBaseColor;
uniform vec3 uEmissive;
uniform vec3 uTexTint;
uniform vec2 uUVRepeat;
uniform vec2 uUVOffset;
uniform float uUVRotation;
uniform int uTexMapping;
uniform float uTexStrength;
uniform float uSpecular;
uniform float uNormalStrength;
uniform int uAlphaMode;
uniform float uAO;
uniform float uBloom;
uniform vec3 uOutlineColor;
uniform vec3 uSelectColor;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uEye;
uniform float uAmbient;
uniform float uOpacity;
uniform float uMetalness;
uniform float uRoughness;
out vec4 outColor;

vec3 perturbNormal(vec3 N, vec3 worldPos, float height) {
	vec3 dpdx = dFdx(worldPos);
	vec3 dpdy = dFdy(worldPos);
	float dhdx = dFdx(height);
	float dhdy = dFdy(height);
	vec3 r1 = cross(dpdy, N);
	vec3 r2 = cross(N, dpdx);
	float det = dot(dpdx, r1);
	vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
	return normalize(abs(det) * N - grad);
}

void main() {
	if (uOutline == 1) { outColor = vec4(uOutlineColor, 1.0); return; }
	if (uOutline == 2) { outColor = vec4(0.02, 0.03, 0.06, 0.36); return; }
	vec3 N = normalize(vNormal);
	if (!gl_FrontFacing) N = -N;
	vec3 V = normalize(uEye - vWorld);
	vec3 L = normalize(uLightDir);
	vec2 rawUV = vUV;
	if (uTexMapping == 1) rawUV = vLocal.xz + vec2(0.5);
	else if (uTexMapping == 2) rawUV = vWorld.xz * 0.5 + vec2(0.5);
	vec2 centeredUV = rawUV - vec2(0.5);
	float cRot = cos(uUVRotation);
	float sRot = sin(uUVRotation);
	vec2 rotUV = vec2(centeredUV.x * cRot - centeredUV.y * sRot, centeredUV.x * sRot + centeredUV.y * cRot) + vec2(0.5);
	vec2 finalUV = rotUV * uUVRepeat + uUVOffset;
	vec3 keyDir = uShading == 2 ? L : normalize(mix(L, normalize(V + vec3(-0.28, 0.55, 0.25)), 0.42));
	vec3 fillDir = normalize(vec3(-keyDir.x, 0.35, -keyDir.z));
	vec3 base = uBaseColor;
	float alpha = uOpacity;
	if (uUseVertexColor == 1) base = uBaseColor * vColor;
	if (uUseTexture == 1) {
		vec4 texel = texture(uTexture, finalUV);
		base = mix(base, base * texel.rgb * uTexTint, clamp(uTexStrength, 0.0, 1.0));
		alpha *= mix(1.0, texel.a, clamp(uTexStrength, 0.0, 1.0));
	}
	if (uAlphaMode == 0) alpha = 1.0;
	else if (uAlphaMode == 2) { if (alpha < 0.5) discard; alpha = 1.0; }
	if (alpha < 0.01) discard;
	float roughness = clamp(uRoughness, 0.04, 1.0);
	if (uUseRoughMap == 1) {
		float rough = texture(uRoughMap, finalUV).r;
		roughness = clamp(roughness * rough * 2.0, 0.04, 1.0);
	}
	if (uUseBumpMap == 1) {
		float height = texture(uBumpMap, finalUV).r * uNormalStrength;
		N = perturbNormal(N, vWorld, height);
	}
	if (uShading == 0) base = vec3(0.96, 0.97, 0.99);

	float ndl = max(dot(N, keyDir), 0.0);
	float fill = max(dot(N, fillDir), 0.0) * 0.24;
	float aoFactor = 1.0 - clamp(uAO, 0.0, 1.0) * (1.0 - clamp(N.y * 0.5 + 0.5, 0.15, 1.0)) * 0.6;
	float ambScale = clamp(uAmbient / 0.45, 0.1, 3.0);
	float hemi = mix(0.38, 0.62, N.y * 0.5 + 0.5) * ambScale * aoFactor;
	vec3 H = normalize(keyDir + V);
	float specPower = mix(140.0, 14.0, roughness);
	float spec = pow(max(dot(N, H), 0.0), specPower) * (1.0 - roughness * 0.72) * 0.34 * (uSpecular * 2.0);
	float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2) * 0.12;

	vec3 color;
	if (uShading == 3) {
		float cel = smoothstep(0.18, 0.22, ndl) * 0.22 + smoothstep(0.55, 0.60, ndl) * 0.20;
		float studioLight = (0.52 * ambScale + cel) * aoFactor;
		color = base * studioLight * uLightColor + vec3(spec * 0.6) + uEmissive * (1.0 + uBloom);
	} else {
		float lighting = clamp(hemi + ndl * 0.58 + fill, 0.18, 1.65);
		vec3 diffuse = base * lighting * uLightColor;
		vec3 specCol = mix(vec3(1.0), base, uMetalness * 0.75) * spec * uLightColor;
		color = diffuse + specCol * (1.0 + uBloom * 0.6) + uEmissive * (1.0 + uBloom * 1.2) + vec3(rim);
	}
	color = clamp(color, 0.0, 1.0);
	color = mix(color, uSelectColor, vSelect * 0.65);
	outColor = vec4(color, alpha);
}`;

const OVERLAY_VS = `#version 300 es
in vec3 aPosition;
in vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vColor;
void main() {
	vColor = aColor;
	gl_Position = uViewProj * uModel * vec4(aPosition, 1.0);
}`;

const OVERLAY_FS = `#version 300 es
precision highp float;
in vec3 vColor;
uniform float uOpacity;
out vec4 outColor;
void main() { outColor = vec4(vColor, uOpacity); }`;

const GLOW_VS = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
out vec3 vNormal;
out vec3 vWorld;
void main() {
	vec4 world = uModel * vec4(aPosition, 1.0);
	vWorld = world.xyz;
	vNormal = uNormalMat * aNormal;
	gl_Position = uViewProj * world;
}`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uGlowColor;
out vec4 outColor;
void main() {
	vec3 N = normalize(vNormal);
	vec3 V = normalize(uEye - vWorld);
	float facing = 1.0 - abs(dot(N, V));
	float rim = pow(clamp(facing, 0.0, 1.0), 1.6);
	float pulse = 0.65 + 0.35 * rim;
	outColor = vec4(uGlowColor * pulse, rim * 0.85);
}`;

const LINE_VS = `#version 300 es
in vec3 aPosition;
in vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vColor;
void main() {
	vColor = aColor;
	gl_Position = uViewProj * uModel * vec4(aPosition, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vColor;
uniform float uOpacity;
out vec4 outColor;
void main() { outColor = vec4(vColor, uOpacity); }`;

const POINT_VS = `#version 300 es
in vec3 aPosition;
in vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uPointSize;
out vec3 vColor;
void main() {
	vColor = aColor;
	gl_Position = uViewProj * uModel * vec4(aPosition, 1.0);
	gl_PointSize = uPointSize;
}`;

const POINT_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vColor;
out vec4 outColor;
void main() {
	float d = length(gl_PointCoord - vec2(0.5));
	if (d > 0.5) discard;
	outColor = vec4(vColor, smoothstep(0.5, 0.36, d));
}`;

interface ProgramInfo {
	program: WebGLProgram;
	uniforms: Record<string, WebGLUniformLocation | null>;
	attribs: Record<string, number>;
}

interface GpuMesh {
	geometryVersion: number;
	selectionVersion: number;
	colorVersion: number;
	glowVersion: number;
	pointSource: number;
	vaoTri: WebGLVertexArrayObject;
	triPos: WebGLBuffer;
	triNorm: WebGLBuffer;
	triSelect: WebGLBuffer;
	triColor: WebGLBuffer;
	triUV: WebGLBuffer;
	triCount: number;
	vaoEdge: WebGLVertexArrayObject;
	edgePos: WebGLBuffer;
	edgeColor: WebGLBuffer;
	edgeCount: number;
	vaoPoint: WebGLVertexArrayObject;
	pointPos: WebGLBuffer;
	pointColor: WebGLBuffer;
	pointCount: number;
	vaoGlow: WebGLVertexArrayObject | null;
	glowPos: WebGLBuffer | null;
	glowNorm: WebGLBuffer | null;
	glowCount: number;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type) as WebGLShader;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compile error: ${log}`);
	}
	return shader;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): ProgramInfo {
	const program = gl.createProgram() as WebGLProgram;
	const s1 = compile(gl, gl.VERTEX_SHADER, vs);
	const s2 = compile(gl, gl.FRAGMENT_SHADER, fs);
	gl.attachShader(program, s1);
	gl.attachShader(program, s2);
	gl.linkProgram(program);
	gl.deleteShader(s1);
	gl.deleteShader(s2);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
	}
	const uniforms: Record<string, WebGLUniformLocation | null> = {};
	const attribs: Record<string, number> = {};
	const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
	for (let i = 0; i < uniformCount; i++) {
		const info = gl.getActiveUniform(program, i);
		if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
	}
	const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number;
	for (let i = 0; i < attribCount; i++) {
		const info = gl.getActiveAttrib(program, i);
		if (info) attribs[info.name] = gl.getAttribLocation(program, info.name);
	}
	return { program, uniforms, attribs };
}

/**
 * Converts a polygon mesh into non-indexed GPU triangle arrays with crease-aware
 * auto-smooth normals (smoothly shading curved surfaces while keeping 90-degree
 * cylinder/coin caps and sharp creases 100% flat and distortion-free).
 */
function meshToTriangles(mesh: Mesh): {
	positions: Float32Array;
	normals: Float32Array;
	colors: Float32Array;
	uvs: Float32Array;
} {
	const fCount = mesh.faces.length;
	const faceNormals: Vec3[] = new Array(fCount);
	const vertexFaces: number[][] = Array.from({ length: mesh.vertices.length }, () => []);

	for (let f = 0; f < fCount; f++) {
		const face = mesh.faces[f];
		faceNormals[f] = faceNormal(mesh, face);
		for (let k = 0; k < face.length; k++) {
			vertexFaces[face[k]]?.push(f);
		}
	}

	const triangles: number[] = [];
	const triFaceIndices: number[] = [];
	for (let f = 0; f < fCount; f++) {
		const face = mesh.faces[f];
		for (let i = 1; i < face.length - 1; i++) {
			triangles.push(face[0], face[i], face[i + 1]);
			triFaceIndices.push(f);
		}
	}

	const positions = new Float32Array(triangles.length * 3);
	const normals = new Float32Array(triangles.length * 3);
	const colors = new Float32Array(triangles.length * 3);
	const uvs = new Float32Array(triangles.length * 2);
	const source = mesh.colors;
	const sourceUvs = mesh.uvs;
	const CREASE_COS = 0.55; // ~56 degrees: smooths curved walls while keeping 90-deg cylinder/coin caps flat

	for (let i = 0; i < triangles.length; i += 3) {
		const fIdx = triFaceIndices[i / 3];
		const fn = faceNormals[fIdx];
		const nx = fn[0], ny = fn[1], nz = fn[2];
		const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);

		for (let j = 0; j < 3; j++) {
			const index = triangles[i + j];
			const v = mesh.vertices[index];
			const p = (i + j) * 3;
			positions[p] = v[0];
			positions[p + 1] = v[1];
			positions[p + 2] = v[2];

			let vnx = nx, vny = ny, vnz = nz;
			if (mesh.smooth) {
				// Average only adjacent faces within the crease angle threshold
				const adjFaces = vertexFaces[index];
				if (adjFaces && adjFaces.length > 1) {
					let sx = 0, sy = 0, sz = 0;
					for (let k = 0; k < adjFaces.length; k++) {
						const afn = faceNormals[adjFaces[k]];
						const d = nx * afn[0] + ny * afn[1] + nz * afn[2];
						if (d >= CREASE_COS) {
							sx += afn[0];
							sy += afn[1];
							sz += afn[2];
						}
					}
					const sLen = Math.hypot(sx, sy, sz);
					if (sLen > 1e-5) {
						vnx = sx / sLen;
						vny = sy / sLen;
						vnz = sz / sLen;
					}
				} else if (mesh.normals?.[index]) {
					const mn = mesh.normals[index];
					vnx = mn[0];
					vny = mn[1];
					vnz = mn[2];
				}
			}

			normals[p] = vnx;
			normals[p + 1] = vny;
			normals[p + 2] = vnz;

			let cr = 1, cg = 1, cb = 1;
			if (source && source.length >= index * 3 + 3) {
				cr = source[index * 3];
				cg = source[index * 3 + 1];
				cb = source[index * 3 + 2];
			}
			if (mesh.mask && mesh.mask.length > index) {
				const mFactor = 1 - 0.65 * (mesh.mask[index] ?? 0);
				cr *= mFactor;
				cg *= mFactor;
				cb *= mFactor;
			}
			colors[p] = cr;
			colors[p + 1] = cg;
			colors[p + 2] = cb;
			const t = (i + j) * 2;
			const explicit = sourceUvs?.[index];
			if (explicit && explicit.length === 2) {
				uvs[t] = explicit[0];
				uvs[t + 1] = explicit[1];
			} else if (ax >= ay && ax >= az) {
				uvs[t] = v[2];
				uvs[t + 1] = v[1];
			} else if (ay >= az) {
				uvs[t] = v[0];
				uvs[t + 1] = v[2];
			} else {
				uvs[t] = v[0];
				uvs[t + 1] = v[1];
			}
		}
	}
	return { positions, normals, colors, uvs };
}

export class GLRenderer {
	readonly gl: WebGL2RenderingContext;
	private meshProgram: ProgramInfo;
	private lineProgram: ProgramInfo;
	private pointProgram: ProgramInfo;
	private glowProgram: ProgramInfo;
	private overlayProgram: ProgramInfo;
	private textureCache = new WeakMap<object, WebGLTexture>();
	private whiteTexture: WebGLTexture | null = null;
	private meshCache = new Map<string, GpuMesh>();
	private gridVao: WebGLVertexArrayObject | null = null;
	private gridBuffers: WebGLBuffer[] = [];
	private gridCount = 0;
	private axesVao: WebGLVertexArrayObject | null = null;
	private axesBuffers: WebGLBuffer[] = [];
	private axesCount = 0;
	private dynamicVao: WebGLVertexArrayObject | null = null;
	private dynamicPos: WebGLBuffer | null = null;
	private dynamicColor: WebGLBuffer | null = null;
	private dynamicTriVao: WebGLVertexArrayObject | null = null;
	private dynamicTriPos: WebGLBuffer | null = null;
	private dynamicTriColor: WebGLBuffer | null = null;
	private identity = mat4Identity();
	calls = 0;

	constructor(canvas: HTMLCanvasElement) {
		const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, depth: true });
		if (!gl) throw new Error('WebGL2 is not available in this browser.');
		this.gl = gl;
		this.meshProgram = createProgram(gl, MESH_VS, MESH_FS);
		this.lineProgram = createProgram(gl, LINE_VS, LINE_FS);
		this.pointProgram = createProgram(gl, POINT_VS, POINT_FS);
		this.glowProgram = createProgram(gl, GLOW_VS, GLOW_FS);
		this.overlayProgram = createProgram(gl, OVERLAY_VS, OVERLAY_FS);
		this.whiteTexture = this.createWhiteTexture();
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		this.buildGrid();
		this.buildAxes();
		this.dynamicVao = gl.createVertexArray();
		this.dynamicPos = gl.createBuffer();
		this.dynamicColor = gl.createBuffer();
		this.dynamicTriVao = gl.createVertexArray();
		this.dynamicTriPos = gl.createBuffer();
		this.dynamicTriColor = gl.createBuffer();
	}

	private buildLineVao(positions: number[], colors: number[]): { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[] } {
		const gl = this.gl;
		const vao = gl.createVertexArray() as WebGLVertexArrayObject;
		gl.bindVertexArray(vao);
		const pos = gl.createBuffer() as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, pos);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(this.lineProgram.attribs.aPosition);
		gl.vertexAttribPointer(this.lineProgram.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
		const col = gl.createBuffer() as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, col);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(this.lineProgram.attribs.aColor);
		gl.vertexAttribPointer(this.lineProgram.attribs.aColor, 3, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
		return { vao, buffers: [pos, col] };
	}

	private buildGrid() {
		const extent = 12;
		const positions: number[] = [];
		const colors: number[] = [];
		for (let i = -extent; i <= extent; i++) {
			if (i === 0) continue;
			const c = [0.137, 0.157, 0.212];
			positions.push(i, 0, -extent, i, 0, extent, -extent, 0, i, extent, 0, i);
			colors.push(...c, ...c, ...c, ...c);
		}
		const built = this.buildLineVao(positions, colors);
		this.gridVao = built.vao;
		this.gridBuffers = built.buffers;
		this.gridCount = positions.length / 3;
	}

	private buildAxes() {
		const positions = [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, -2, 0, 0, 0, 0, 0, 0, 0, -2];
		const colors = [
			0.898, 0.376, 0.302, 0.898, 0.376, 0.302, 0.239, 0.859, 0.69, 0.239, 0.859, 0.69, 0.302, 0.553,
			0.898, 0.302, 0.553, 0.898, 0.4, 0.302, 0.4, 0.302, 0.4, 0.302, 0.4, 0.302, 0.31, 0.31, 0.345,
			0.31, 0.31, 0.345,
		];
		const built = this.buildLineVao(positions, colors);
		this.axesVao = built.vao;
		this.axesBuffers = built.buffers;
		this.axesCount = positions.length / 3;
	}

	private createVao(): WebGLVertexArrayObject {
		return this.gl.createVertexArray() as WebGLVertexArrayObject;
	}

	private attachBuffer(data: Float32Array, location: number, size: number, usage: number): WebGLBuffer {
		const gl = this.gl;
		const buffer = gl.createBuffer() as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, usage);
		gl.enableVertexAttribArray(location);
		gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
		return buffer;
	}

	private buildGpuMesh(object: RenderObject): GpuMesh {
		const gl = this.gl;
		const { positions, normals, colors, uvs } = meshToTriangles(object.mesh);
		const triCount = positions.length / 3;
		const select = new Float32Array(triCount);

		const vaoTri = this.createVao();
		gl.bindVertexArray(vaoTri);
		const triPos = this.attachBuffer(positions, this.meshProgram.attribs.aPosition, 3, gl.STATIC_DRAW);
		const triNorm = this.attachBuffer(normals, this.meshProgram.attribs.aNormal, 3, gl.STATIC_DRAW);
		const triUV = gl.createBuffer() as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, triUV);
		gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(this.meshProgram.attribs.aUV);
		gl.vertexAttribPointer(this.meshProgram.attribs.aUV, 2, gl.FLOAT, false, 0, 0);
		const triColor = gl.createBuffer() as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, triColor);
		gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.meshProgram.attribs.aColor);
		gl.vertexAttribPointer(this.meshProgram.attribs.aColor, 3, gl.FLOAT, false, 0, 0);
		const triSelect = gl.createBuffer() as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, triSelect);
		gl.bufferData(gl.ARRAY_BUFFER, select, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.meshProgram.attribs.aSelect);
		gl.vertexAttribPointer(this.meshProgram.attribs.aSelect, 1, gl.FLOAT, false, 0, 0);

		const edgePositions = new Float32Array(object.mesh.edges.length * 6);
		for (let i = 0; i < object.mesh.edges.length; i++) {
			const [a, b] = object.mesh.edges[i];
			const va = object.mesh.vertices[a];
			const vb = object.mesh.vertices[b];
			edgePositions.set([va[0], va[1], va[2], vb[0], vb[1], vb[2]], i * 6);
		}
		const edgeColor = new Float32Array(object.mesh.edges.length * 6);
		const vaoEdge = this.createVao();
		gl.bindVertexArray(vaoEdge);
		const edgePos = this.attachBuffer(edgePositions, this.lineProgram.attribs.aPosition, 3, gl.STATIC_DRAW);
		const edgeColorBuf = gl.createBuffer() as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, edgeColorBuf);
		gl.bufferData(gl.ARRAY_BUFFER, edgeColor, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.lineProgram.attribs.aColor);
		gl.vertexAttribPointer(this.lineProgram.attribs.aColor, 3, gl.FLOAT, false, 0, 0);

		const pointPositions = new Float32Array(object.mesh.vertices.length * 3);
		for (let i = 0; i < object.mesh.vertices.length; i++) {
			const v = object.mesh.vertices[i];
			pointPositions.set([v[0], v[1], v[2]], i * 3);
		}
		const pointColor = new Float32Array(object.mesh.vertices.length * 3);
		const vaoPoint = this.createVao();
		gl.bindVertexArray(vaoPoint);
		const pointPos = this.attachBuffer(pointPositions, this.pointProgram.attribs.aPosition, 3, gl.STATIC_DRAW);
		const pointColorBuf = gl.createBuffer() as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, pointColorBuf);
		gl.bufferData(gl.ARRAY_BUFFER, pointColor, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.pointProgram.attribs.aColor);
		gl.vertexAttribPointer(this.pointProgram.attribs.aColor, 3, gl.FLOAT, false, 0, 0);

		gl.bindVertexArray(null);
		return {
			geometryVersion: object.geometryVersion,
			selectionVersion: -1,
			colorVersion: -1,
			glowVersion: -1,
			pointSource: object.mesh.vertices.length,
			vaoTri,
			triPos,
			triNorm,
			triSelect,
			triColor,
			triUV,
			triCount,
			vaoEdge,
			edgePos,
			edgeColor: edgeColorBuf,
			edgeCount: object.mesh.edges.length * 2,
			vaoPoint,
			pointPos,
			pointColor: pointColorBuf,
			pointCount: object.mesh.vertices.length,
			vaoGlow: null,
			glowPos: null,
			glowNorm: null,
			glowCount: 0,
		};
	}

	private uploadTexture(source: TexImageSource | null): WebGLTexture | null {
		if (!source) return null;
		const cached = this.textureCache.get(source as unknown as object);
		if (cached) return cached;
		const gl = this.gl;
		const texture = gl.createTexture() as WebGLTexture;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		this.textureCache.set(source as unknown as object, texture);
		return texture;
	}

	private createWhiteTexture(): WebGLTexture | null {
		const gl = this.gl;
		const texture = gl.createTexture() as WebGLTexture;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		return texture;
	}

	private updateGlow(object: RenderObject, gpu: GpuMesh) {
		if (gpu.glowVersion === object.glowVersion) return;
		const gl = this.gl;
		if (gpu.vaoGlow) {
			gl.deleteVertexArray(gpu.vaoGlow);
			if (gpu.glowPos) gl.deleteBuffer(gpu.glowPos);
			if (gpu.glowNorm) gl.deleteBuffer(gpu.glowNorm);
			gpu.vaoGlow = null;
			gpu.glowPos = null;
			gpu.glowNorm = null;
			gpu.glowCount = 0;
		}
		const marked = object.glowFaces;
		if (marked && marked.size) {
			const positions: number[] = [];
			const normals: number[] = [];
			const smoothNormals = object.mesh.normals ?? computeVertexNormals(object.mesh);
			object.mesh.faces.forEach((face, faceIndex) => {
				if (!marked.has(faceIndex)) return;
				for (let i = 1; i < face.length - 1; i++) {
					for (const index of [face[0], face[i], face[i + 1]]) {
						const v = object.mesh.vertices[index];
						positions.push(v[0], v[1], v[2]);
						const n = smoothNormals[index] ?? [0, 1, 0];
						normals.push(n[0], n[1], n[2]);
					}
				}
			});
			if (positions.length) {
				const vao = this.createVao();
				gl.bindVertexArray(vao);
				gpu.glowPos = this.attachBuffer(new Float32Array(positions), this.glowProgram.attribs.aPosition, 3, gl.STATIC_DRAW);
				gpu.glowNorm = this.attachBuffer(new Float32Array(normals), this.glowProgram.attribs.aNormal, 3, gl.STATIC_DRAW);
				gl.bindVertexArray(null);
				gpu.vaoGlow = vao;
				gpu.glowCount = positions.length / 3;
			}
		}
		gpu.glowVersion = object.glowVersion;
	}

	private updateSelection(object: RenderObject, gpu: GpuMesh) {
		if (object.selectionVersion === gpu.selectionVersion) return;
		const gl = this.gl;
		const triSelect = new Float32Array(gpu.triCount);
		const hoverFace = object.hoverKind === 'face' ? object.hoverIndex : null;
		let cursor = 0;
		object.mesh.faces.forEach((face, faceIndex) => {
			let value = 0;
			if (object.selectedFaces?.has(faceIndex)) value = 1;
			else if (hoverFace === faceIndex) value = 0.45;
			for (let i = 1; i < face.length - 1; i++) {
				for (let k = 0; k < 3; k++) triSelect[cursor * 3 + k] = value;
				cursor++;
			}
		});
		gl.bindBuffer(gl.ARRAY_BUFFER, gpu.triSelect);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, triSelect);

		const baseEdge: [number, number, number] = object.selected ? SELECT : [0.7, 0.76, 0.86];
		const edgeColor = new Float32Array(object.mesh.edges.length * 6);
		for (let i = 0; i < object.mesh.edges.length; i++) {
			let color: [number, number, number] = baseEdge;
			if (object.selectedEdges?.has(i)) color = SELECT;
			else if (object.hoverKind === 'edge' && object.hoverIndex === i) color = HOVER;
			edgeColor.set([...color, ...color], i * 6);
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, gpu.edgeColor);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, edgeColor);

		const pointColor = new Float32Array(object.mesh.vertices.length * 3);
		for (let i = 0; i < object.mesh.vertices.length; i++) {
			let color: [number, number, number] = [0.6, 0.66, 0.76];
			if (object.selectedVertices?.has(i)) color = SELECT;
			else if (object.hoverKind === 'vertex' && object.hoverIndex === i) color = HOVER;
			pointColor.set(color, i * 3);
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, gpu.pointColor);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, pointColor);

		gpu.selectionVersion = object.selectionVersion;
	}

	private updateColors(object: RenderObject, gpu: GpuMesh) {
		if (object.colorVersion === gpu.colorVersion) return;
		const gl = this.gl;
		const colors = new Float32Array(gpu.triCount * 3);
		const source = object.mesh.colors;
		let cursor = 0;
		for (const face of object.mesh.faces) {
			for (let i = 1; i < face.length - 1; i++) {
				for (const index of [face[0], face[i], face[i + 1]]) {
					if (source && source.length >= index * 3 + 3) {
						colors[cursor * 3] = source[index * 3];
						colors[cursor * 3 + 1] = source[index * 3 + 1];
						colors[cursor * 3 + 2] = source[index * 3 + 2];
					} else {
						colors[cursor * 3] = 1;
						colors[cursor * 3 + 1] = 1;
						colors[cursor * 3 + 2] = 1;
					}
					cursor++;
				}
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, gpu.triColor);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);
		gpu.colorVersion = object.colorVersion;
	}

	private getGpuMesh(object: RenderObject): GpuMesh {
		let gpu = this.meshCache.get(object.id);
		if (!gpu || gpu.geometryVersion !== object.geometryVersion || gpu.pointSource !== object.mesh.vertices.length) {
			if (gpu) this.disposeGpuMesh(gpu);
			gpu = this.buildGpuMesh(object);
			this.meshCache.set(object.id, gpu);
		}
		return gpu;
	}

	private disposeGpuMesh(gpu: GpuMesh) {
		const gl = this.gl;
		gl.deleteVertexArray(gpu.vaoTri);
		gl.deleteVertexArray(gpu.vaoEdge);
		gl.deleteVertexArray(gpu.vaoPoint);
		if (gpu.vaoGlow) gl.deleteVertexArray(gpu.vaoGlow);
		gl.deleteBuffer(gpu.triPos);
		gl.deleteBuffer(gpu.triNorm);
		gl.deleteBuffer(gpu.triSelect);
		gl.deleteBuffer(gpu.triColor);
		gl.deleteBuffer(gpu.triUV);
		gl.deleteBuffer(gpu.edgePos);
		gl.deleteBuffer(gpu.edgeColor);
		gl.deleteBuffer(gpu.pointPos);
		gl.deleteBuffer(gpu.pointColor);
		if (gpu.glowPos) gl.deleteBuffer(gpu.glowPos);
		if (gpu.glowNorm) gl.deleteBuffer(gpu.glowNorm);
	}

	private drawDynamic(vao: WebGLVertexArrayObject, positions: number[], colors: number[], mode: number, pointSize = 1) {
		const gl = this.gl;
		if (!this.dynamicPos || !this.dynamicColor) return;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicPos);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.lineProgram.attribs.aPosition);
		gl.vertexAttribPointer(this.lineProgram.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicColor);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.lineProgram.attribs.aColor);
		gl.vertexAttribPointer(this.lineProgram.attribs.aColor, 3, gl.FLOAT, false, 0, 0);
		if (mode === gl.POINTS) {
			gl.useProgram(this.pointProgram.program);
			gl.uniformMatrix4fv(this.pointProgram.uniforms.uModel, false, this.identity);
			gl.uniform1f(this.pointProgram.uniforms.uPointSize, pointSize);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicColor);
			gl.enableVertexAttribArray(this.pointProgram.attribs.aColor);
			gl.vertexAttribPointer(this.pointProgram.attribs.aColor, 3, gl.FLOAT, false, 0, 0);
			gl.drawArrays(mode, 0, positions.length / 3);
		} else {
			gl.drawArrays(mode, 0, positions.length / 3);
		}
		this.calls++;
	}

	private drawDynamicTriangles(positions: number[], colors: number[]) {
		const gl = this.gl;
		if (!this.dynamicTriVao || !this.dynamicTriPos || !this.dynamicTriColor) return;
		gl.bindVertexArray(this.dynamicTriVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicTriPos);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.overlayProgram.attribs.aPosition);
		gl.vertexAttribPointer(this.overlayProgram.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicTriColor);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.overlayProgram.attribs.aColor);
		gl.vertexAttribPointer(this.overlayProgram.attribs.aColor, 3, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);
		this.calls++;
	}

	render(width: number, height: number, objects: RenderObject[], camera: RenderCamera, options: RenderOptions): void {
		const gl = this.gl;
		this.calls = 0;

		// Prune GPU meshes of deleted objects to prevent VRAM leaks
		if (this.meshCache.size > objects.length) {
			const liveIds = new Set(objects.map((o) => o.id));
			for (const [id, gpu] of this.meshCache) {
				if (!liveIds.has(id)) {
					this.disposeGpuMesh(gpu);
					this.meshCache.delete(id);
				}
			}
		}

		gl.viewport(0, 0, width, height);
		gl.clearColor(options.background[0], options.background[1], options.background[2], 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		const view = mat4LookAt(
			camera.eye,
			[camera.eye[0] + camera.forward[0], camera.eye[1] + camera.forward[1], camera.eye[2] + camera.forward[2]],
			camera.up,
		);
		const proj = mat4Perspective(camera.fov, width / Math.max(height, 1), camera.near, camera.far);
		const viewProj = mat4Multiply(proj, view);

		// Grid + axes (pushed slightly back in depth so floor plates never z-fight with grid lines).
		gl.useProgram(this.lineProgram.program);
		gl.uniformMatrix4fv(this.lineProgram.uniforms.uViewProj, false, viewProj);
		gl.uniformMatrix4fv(this.lineProgram.uniforms.uModel, false, this.identity);
		gl.uniform1f(this.lineProgram.uniforms.uOpacity, 1);
		if (options.grid && this.gridVao) {
			gl.bindVertexArray(this.gridVao);
			gl.drawArrays(gl.LINES, 0, this.gridCount);
			this.calls++;
		}
		if (options.axes && this.axesVao) {
			gl.bindVertexArray(this.axesVao);
			gl.drawArrays(gl.LINES, 0, this.axesCount);
			this.calls++;
		}

		// Compute real light direction and color from scene Light objects (or default studio sun)
		const sceneLight = objects.find((o) => o.special === 'light');
		let lightDir: Vec3 = [-0.45, 0.86, 0.52];
		let lightColor: [number, number, number] = [1, 1, 1];
		if (sceneLight) {
			const lx = sceneLight.position[0];
			const ly = sceneLight.position[1];
			const lz = sceneLight.position[2];
			const len = Math.hypot(lx, ly, lz) || 1;
			lightDir = [lx / len, ly / len, lz / len];
			lightColor = sceneLight.color;
		}

		const drawList = objects.filter((object) => !object.special);
		const shadingIndex = { solid: 0, material: 1, rendered: 2, toon: 3, wireframe: 1 }[options.shading];

		if (options.shading !== 'wireframe') {
			gl.useProgram(this.meshProgram.program);
			gl.uniformMatrix4fv(this.meshProgram.uniforms.uViewProj, false, viewProj);
			gl.uniform3fv(this.meshProgram.uniforms.uLightDir, new Float32Array(lightDir));
			gl.uniform3fv(this.meshProgram.uniforms.uLightColor, new Float32Array(lightColor));
			gl.uniform3fv(this.meshProgram.uniforms.uEye, new Float32Array(camera.eye));
			gl.uniform1f(this.meshProgram.uniforms.uAmbient, options.ambient ?? 0.45);
			gl.uniform1i(this.meshProgram.uniforms.uOutline, 0);
			gl.uniform1i(this.meshProgram.uniforms.uShading, shadingIndex);
			gl.uniform3fv(this.meshProgram.uniforms.uSelectColor, new Float32Array(SELECT));
			gl.disable(gl.CULL_FACE);

			// Sort opaque objects first, transparent objects back-to-front
			const ordered = [...drawList].sort((a, b) => {
				const aAlpha = options.xray || a.opacity < 0.999 || a.slots.some((s) => s.opacity < 0.999);
				const bAlpha = options.xray || b.opacity < 0.999 || b.slots.some((s) => s.opacity < 0.999);
				if (aAlpha !== bAlpha) return aAlpha ? 1 : -1;
				if (!aAlpha) return 0;
				const da = Math.hypot(a.position[0] - camera.eye[0], a.position[1] - camera.eye[1], a.position[2] - camera.eye[2]);
				const db = Math.hypot(b.position[0] - camera.eye[0], b.position[1] - camera.eye[1], b.position[2] - camera.eye[2]);
				return db - da;
			});

			for (const object of ordered) {
				const gpu = this.getGpuMesh(object);
				this.updateSelection(object, gpu);
				this.updateColors(object, gpu);
				const model = mat4FromTRS(object.position, object.rotation, object.scale);
				gl.uniformMatrix4fv(this.meshProgram.uniforms.uModel, false, model);
				gl.uniformMatrix3fv(this.meshProgram.uniforms.uNormalMat, false, normalMatrix(model));
				gl.uniform1i(this.meshProgram.uniforms.uUseVertexColor, object.mesh.colors?.length ? 1 : 0);
				const fallback: RenderSlot = {
					color: object.color,
					emissive: object.emissive,
					emissiveStrength: 1,
					metalness: object.metalness,
					roughness: object.roughness,
					opacity: object.opacity,
					uvRepeat: 1,
					texTint: [1, 1, 1],
					albedo: null,
					roughnessMap: null,
					bumpMap: null,
				};
				const groups = object.mesh.groups?.length
					? object.mesh.groups
					: [{ start: 0, count: gpu.triCount, materialIndex: 0 }];
				for (const group of groups) {
					const slot = object.slots[group.materialIndex] ?? fallback;
					const effectiveOpacity = options.xray ? Math.min(0.38, slot.opacity) : slot.opacity;
					const needsBlend = options.xray || effectiveOpacity < 0.999 || Boolean(slot.albedo);
					if (needsBlend) {
						gl.enable(gl.BLEND);
						gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
						gl.depthMask(!options.xray && effectiveOpacity >= 0.95);
					} else {
						gl.disable(gl.BLEND);
						gl.depthMask(true);
					}

					gl.uniform3fv(this.meshProgram.uniforms.uBaseColor, new Float32Array(slot.color));
					gl.uniform3fv(
						this.meshProgram.uniforms.uEmissive,
						new Float32Array([
							slot.emissive[0] * slot.emissiveStrength,
							slot.emissive[1] * slot.emissiveStrength,
							slot.emissive[2] * slot.emissiveStrength,
						]),
					);
					gl.uniform3fv(this.meshProgram.uniforms.uTexTint, new Float32Array(slot.texTint));
					gl.uniform2f(this.meshProgram.uniforms.uUVRepeat, slot.uvRepeat, slot.uvRepeat);
					gl.uniform1f(this.meshProgram.uniforms.uOpacity, effectiveOpacity);
					gl.uniform1f(this.meshProgram.uniforms.uMetalness, slot.metalness);
					gl.uniform1f(this.meshProgram.uniforms.uRoughness, slot.roughness);

					const albedo = this.uploadTexture(slot.albedo) ?? this.whiteTexture;
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, albedo);
					gl.uniform1i(this.meshProgram.uniforms.uTexture, 0);
					gl.uniform1i(this.meshProgram.uniforms.uUseTexture, slot.albedo ? 1 : 0);

					const roughMap = this.uploadTexture(slot.roughnessMap) ?? this.whiteTexture;
					gl.activeTexture(gl.TEXTURE1);
					gl.bindTexture(gl.TEXTURE_2D, roughMap);
					gl.uniform1i(this.meshProgram.uniforms.uRoughMap, 1);
					gl.uniform1i(this.meshProgram.uniforms.uUseRoughMap, slot.roughnessMap ? 1 : 0);

					const bumpMap = this.uploadTexture(slot.bumpMap) ?? this.whiteTexture;
					gl.activeTexture(gl.TEXTURE2);
					gl.bindTexture(gl.TEXTURE_2D, bumpMap);
					gl.uniform1i(this.meshProgram.uniforms.uBumpMap, 2);
					gl.uniform1i(this.meshProgram.uniforms.uUseBumpMap, slot.bumpMap ? 1 : 0);
					gl.activeTexture(gl.TEXTURE0);

					gl.bindVertexArray(gpu.vaoTri);
					gl.drawArrays(gl.TRIANGLES, group.start, group.count);
					this.calls++;
				}
			}
			gl.disable(gl.BLEND);
			gl.depthMask(true);
		}

		// Glow overlay of the marked portion.
		const glowing = objects.filter((object) => object.glowFaces && object.glowFaces.size);
		if (glowing.length) {
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			gl.depthMask(false);
			gl.useProgram(this.glowProgram.program);
			gl.uniformMatrix4fv(this.glowProgram.uniforms.uViewProj, false, viewProj);
			gl.uniform3fv(this.glowProgram.uniforms.uEye, new Float32Array(camera.eye));
			gl.uniform3fv(this.glowProgram.uniforms.uGlowColor, new Float32Array([0.24, 0.85, 0.66]));
			for (const object of glowing) {
				const gpu = this.getGpuMesh(object);
				this.updateGlow(object, gpu);
				if (!gpu.vaoGlow) continue;
				const model = mat4FromTRS(object.position, object.rotation, object.scale);
				gl.uniformMatrix4fv(this.glowProgram.uniforms.uModel, false, model);
				gl.uniformMatrix3fv(this.glowProgram.uniforms.uNormalMat, false, normalMatrix(model));
				gl.bindVertexArray(gpu.vaoGlow);
				gl.drawArrays(gl.TRIANGLES, 0, gpu.glowCount);
				this.calls++;
			}
			gl.depthMask(true);
			gl.disable(gl.BLEND);
		}

		// Silhouette Outlines (strictly depth-biased back-face hull for closed 3D meshes,
		// and clean boundary edge highlight for single-sided planes so front surfaces never z-fight).
		if (options.outlines || options.selectOutline) {
			gl.useProgram(this.meshProgram.program);
			gl.uniformMatrix4fv(this.meshProgram.uniforms.uViewProj, false, viewProj);
			gl.uniform2f(this.meshProgram.uniforms.uViewport, width, height);
			gl.uniform1i(this.meshProgram.uniforms.uOutline, 1);
			gl.uniform1f(this.meshProgram.uniforms.uOutlinePx, 1.75);
			gl.enable(gl.CULL_FACE);
			gl.cullFace(gl.FRONT);
			gl.depthFunc(gl.LESS);
			gl.depthMask(false);
			for (const object of drawList) {
				// Single-face planar layers cannot use back-face hull culling without z-fighting
				if (object.mesh.faces.length <= 2) continue;
				const wantsToon = options.outlines && options.shading === 'toon';
				const wantsSelect = options.selectOutline && object.selected && !options.editMode;
				if (!wantsToon && !wantsSelect) continue;
				const gpu = this.getGpuMesh(object);
				const model = mat4FromTRS(object.position, object.rotation, object.scale);
				gl.uniformMatrix4fv(this.meshProgram.uniforms.uModel, false, model);
				gl.uniformMatrix3fv(this.meshProgram.uniforms.uNormalMat, false, normalMatrix(model));
				gl.uniform3fv(
					this.meshProgram.uniforms.uOutlineColor,
					new Float32Array(wantsSelect ? [0.24, 0.85, 0.66] : [0.12, 0.15, 0.2]),
				);
				gl.bindVertexArray(gpu.vaoTri);
				gl.drawArrays(gl.TRIANGLES, 0, gpu.triCount);
				this.calls++;
			}
			gl.depthMask(true);
			gl.depthFunc(gl.LEQUAL);
			gl.cullFace(gl.BACK);
			gl.disable(gl.CULL_FACE);

			// Draw clean selection border for selected planar objects (e.g. Floor / Plate / Media layers)
			const selectedPlanes = drawList.filter(
				(o) => o.selected && !options.editMode && o.mesh.faces.length <= 2,
			);
			if (selectedPlanes.length) {
				gl.useProgram(this.lineProgram.program);
				gl.uniformMatrix4fv(this.lineProgram.uniforms.uViewProj, false, viewProj);
				gl.uniform1f(this.lineProgram.uniforms.uOpacity, 0.95);
				for (const object of selectedPlanes) {
					const gpu = this.getGpuMesh(object);
					this.updateSelection(object, gpu);
					gl.uniformMatrix4fv(
						this.lineProgram.uniforms.uModel,
						false,
						mat4FromTRS(object.position, object.rotation, object.scale),
					);
					gl.bindVertexArray(gpu.vaoEdge);
					gl.drawArrays(gl.LINES, 0, gpu.edgeCount);
					this.calls++;
				}
			}
		}

		// Wireframe / edit edges.
		const showEdges = options.shading === 'wireframe' || options.wireOverlay || options.editMode;
		if (showEdges) {
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.useProgram(this.lineProgram.program);
			gl.uniformMatrix4fv(this.lineProgram.uniforms.uViewProj, false, viewProj);
			for (const object of drawList) {
				if (options.editMode && !object.selected) continue;
				if (options.shading === 'wireframe') gl.uniform1f(this.lineProgram.uniforms.uOpacity, object.selected ? 0.95 : 0.6);
				else gl.uniform1f(this.lineProgram.uniforms.uOpacity, options.xray ? 0.4 : 0.85);
				const gpu = this.getGpuMesh(object);
				this.updateSelection(object, gpu);
				gl.uniformMatrix4fv(this.lineProgram.uniforms.uModel, false, mat4FromTRS(object.position, object.rotation, object.scale));
				gl.bindVertexArray(gpu.vaoEdge);
				gl.drawArrays(gl.LINES, 0, gpu.edgeCount);
				this.calls++;
			}
			gl.disable(gl.BLEND);
		}

		// Edit vertices.
		if (options.editMode && options.elementMode === 'vertex') {
			gl.useProgram(this.pointProgram.program);
			gl.uniformMatrix4fv(this.pointProgram.uniforms.uViewProj, false, viewProj);
			gl.uniform1f(this.pointProgram.uniforms.uPointSize, 10);
			for (const object of drawList) {
				if (!object.selected) continue;
				const gpu = this.getGpuMesh(object);
				this.updateSelection(object, gpu);
				gl.uniformMatrix4fv(this.pointProgram.uniforms.uModel, false, mat4FromTRS(object.position, object.rotation, object.scale));
				gl.bindVertexArray(gpu.vaoPoint);
				gl.drawArrays(gl.POINTS, 0, gpu.pointCount);
				this.calls++;
			}
		}

		// Light / camera / 3D cursor helpers.
		const helperPositions: number[] = [];
		const helperColors: number[] = [];
		for (const object of objects) {
			if (object.special === 'light') {
				const c = object.selected ? [0.24, 0.85, 0.66] : [1.0, 0.76, 0.28];
				const p = object.position;
				for (let i = 0; i < 8; i++) {
					const a = (i / 8) * Math.PI * 2;
					helperPositions.push(p[0], p[1], p[2], p[0] + Math.cos(a) * 0.38, p[1] + 0.35, p[2] + Math.sin(a) * 0.38);
					helperColors.push(...c, ...c);
				}
				// Ray to origin to visualize light direction
				helperPositions.push(p[0], p[1], p[2], 0, 0, 0);
				helperColors.push(...c, 0.35, 0.3, 0.15);
			} else if (object.special === 'camera') {
				const c = object.selected ? [0.24, 0.85, 0.66] : [0.66, 0.55, 0.98];
				const p = object.position;
				helperPositions.push(p[0], p[1], p[2], p[0], p[1] + 0.45, p[2]);
				helperColors.push(...c, ...c);
			}
		}
		if (options.cursor) {
			const [cx, cy, cz] = options.cursor;
			const r = 0.28;
			const c1 = [1.0, 0.35, 0.35];
			const c2 = [0.95, 0.97, 1.0];
			helperPositions.push(
				cx - r, cy, cz, cx + r, cy, cz,
				cx, cy - r, cz, cx, cy + r, cz,
				cx, cy, cz - r, cx, cy, cz + r,
			);
			helperColors.push(...c1, ...c1, ...c2, ...c2, ...c1, ...c1);
		}
		if (helperPositions.length && this.dynamicVao) {
			gl.useProgram(this.lineProgram.program);
			gl.uniformMatrix4fv(this.lineProgram.uniforms.uViewProj, false, viewProj);
			gl.uniformMatrix4fv(this.lineProgram.uniforms.uModel, false, this.identity);
			gl.uniform1f(this.lineProgram.uniforms.uOpacity, 1);
			this.drawDynamic(this.dynamicVao, helperPositions, helperColors, gl.LINES);
		}

		if (options.brushRing && this.dynamicVao) {
			const ring = options.brushRing;
			const pos: number[] = [];
			const col: number[] = [];
			const rc = ring.color ?? [1, 0.55, 0.1];
			const centers = [ring.center, ...(ring.mirrors ?? [])];
			const n = ring.normal ?? [0, 1, 0];
			let t1: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
			const d = t1[0] * n[0] + t1[1] * n[1] + t1[2] * n[2];
			t1 = [t1[0] - n[0] * d, t1[1] - n[1] * d, t1[2] - n[2] * d];
			const len1 = Math.hypot(t1[0], t1[1], t1[2]) || 1;
			t1 = [t1[0] / len1, t1[1] / len1, t1[2] / len1];
			const t2: Vec3 = [
				n[1] * t1[2] - n[2] * t1[1],
				n[2] * t1[0] - n[0] * t1[2],
				n[0] * t1[1] - n[1] * t1[0],
			];
			const segs = 32;
			for (const c of centers) {
				for (let s = 0; s < segs; s++) {
					const a0 = (s / segs) * Math.PI * 2;
					const a1 = ((s + 1) / segs) * Math.PI * 2;
					const x0 = c[0] + ring.radius * (Math.cos(a0) * t1[0] + Math.sin(a0) * t2[0]);
					const y0 = c[1] + ring.radius * (Math.cos(a0) * t1[1] + Math.sin(a0) * t2[1]);
					const z0 = c[2] + ring.radius * (Math.cos(a0) * t1[2] + Math.sin(a0) * t2[2]);
					const x1 = c[0] + ring.radius * (Math.cos(a1) * t1[0] + Math.sin(a1) * t2[0]);
					const y1 = c[1] + ring.radius * (Math.cos(a1) * t1[1] + Math.sin(a1) * t2[1]);
					const z1 = c[2] + ring.radius * (Math.cos(a1) * t1[2] + Math.sin(a1) * t2[2]);
					pos.push(x0, y0, z0, x1, y1, z1);
					col.push(...rc, ...rc);
				}
				pos.push(c[0], c[1], c[2], c[0] + n[0] * (ring.radius * 0.25), c[1] + n[1] * (ring.radius * 0.25), c[2] + n[2] * (ring.radius * 0.25));
				col.push(1, 1, 1, 1, 1, 1);
			}
			gl.disable(gl.DEPTH_TEST);
			gl.useProgram(this.lineProgram.program);
			gl.uniformMatrix4fv(this.lineProgram.uniforms.uViewProj, false, viewProj);
			gl.uniformMatrix4fv(this.lineProgram.uniforms.uModel, false, this.identity);
			gl.uniform1f(this.lineProgram.uniforms.uOpacity, 0.95);
			this.drawDynamic(this.dynamicVao, pos, col, gl.LINES);
			gl.enable(gl.DEPTH_TEST);
		}

		// Scissors preview line (converted from screen pixels to WebGL NDC [-1, 1]).
		if (options.overlayLine && this.dynamicVao) {
			const line = options.overlayLine;
			const dprX = width / Math.max(1, (this.gl.canvas as HTMLCanvasElement).clientWidth || width);
			const dprY = height / Math.max(1, (this.gl.canvas as HTMLCanvasElement).clientHeight || height);
			const x0 = ((line.x0 * dprX) / Math.max(1, width)) * 2 - 1;
			const y0 = 1 - ((line.y0 * dprY) / Math.max(1, height)) * 2;
			const x1 = ((line.x1 * dprX) / Math.max(1, width)) * 2 - 1;
			const y1 = 1 - ((line.y1 * dprY) / Math.max(1, height)) * 2;
			gl.disable(gl.DEPTH_TEST);
			gl.useProgram(this.lineProgram.program);
			gl.uniformMatrix4fv(this.lineProgram.uniforms.uViewProj, false, this.identity);
			gl.uniformMatrix4fv(this.lineProgram.uniforms.uModel, false, this.identity);
			gl.uniform1f(this.lineProgram.uniforms.uOpacity, 1);
			this.drawDynamic(
				this.dynamicVao,
				[x0, y0, 0, x1, y1, 0],
				[1, 0.42, 0.32, 1, 0.42, 0.32],
				gl.LINES,
			);
			gl.enable(gl.DEPTH_TEST);
		}

		// The transform gizmo is drawn on top of everything.
		if (options.gizmo && options.gizmo.length) {
			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

			const linePositions: number[] = [];
			const lineColors: number[] = [];
			for (const part of options.gizmo) {
				for (const line of part.lines) {
					linePositions.push(...line.a, ...line.b);
					lineColors.push(...line.color, ...line.color);
				}
			}
			if (linePositions.length) {
				gl.useProgram(this.lineProgram.program);
				gl.uniformMatrix4fv(this.lineProgram.uniforms.uViewProj, false, viewProj);
				gl.uniformMatrix4fv(this.lineProgram.uniforms.uModel, false, this.identity);
				gl.uniform1f(this.lineProgram.uniforms.uOpacity, 1);
				this.drawDynamic(this.dynamicVao!, linePositions, lineColors, gl.LINES);
			}

			const triPositions: number[] = [];
			const triColors: number[] = [];
			for (const part of options.gizmo) {
				for (const triangle of part.triangles) {
					triPositions.push(...triangle.points[0], ...triangle.points[1], ...triangle.points[2]);
					triColors.push(...triangle.color, ...triangle.color, ...triangle.color);
				}
			}
			if (triPositions.length) {
				gl.useProgram(this.overlayProgram.program);
				gl.uniformMatrix4fv(this.overlayProgram.uniforms.uViewProj, false, viewProj);
				gl.uniformMatrix4fv(this.overlayProgram.uniforms.uModel, false, this.identity);
				gl.uniform1f(this.overlayProgram.uniforms.uOpacity, 1);
				this.drawDynamicTriangles(triPositions, triColors);
			}

			gl.disable(gl.BLEND);
			gl.enable(gl.DEPTH_TEST);
		}

		gl.bindVertexArray(null);
	}

	snapshot(): string {
		const canvas = this.gl.canvas as HTMLCanvasElement;
		return canvas.toDataURL('image/png');
	}

	dispose() {
		for (const gpu of this.meshCache.values()) this.disposeGpuMesh(gpu);
		this.meshCache.clear();
		const gl = this.gl;
		gl.deleteProgram(this.meshProgram.program);
		gl.deleteProgram(this.lineProgram.program);
		gl.deleteProgram(this.pointProgram.program);
		gl.deleteProgram(this.glowProgram.program);
		gl.deleteProgram(this.overlayProgram.program);
		if (this.whiteTexture) gl.deleteTexture(this.whiteTexture);
		if (this.gridVao) gl.deleteVertexArray(this.gridVao);
		for (const b of this.gridBuffers) gl.deleteBuffer(b);
		if (this.axesVao) gl.deleteVertexArray(this.axesVao);
		for (const b of this.axesBuffers) gl.deleteBuffer(b);
		if (this.dynamicVao) gl.deleteVertexArray(this.dynamicVao);
		if (this.dynamicPos) gl.deleteBuffer(this.dynamicPos);
		if (this.dynamicColor) gl.deleteBuffer(this.dynamicColor);
		if (this.dynamicTriVao) gl.deleteVertexArray(this.dynamicTriVao);
		if (this.dynamicTriPos) gl.deleteBuffer(this.dynamicTriPos);
		if (this.dynamicTriColor) gl.deleteBuffer(this.dynamicTriColor);
	}
}

export function objectRenderColor(hex: string): [number, number, number] {
	return hexColor(hex);
}
