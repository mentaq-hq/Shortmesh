import { get } from 'svelte/store';
import { sceneStore } from '../stores/scene';
import { buildGroups } from './mesh';
import { MAX_TIMELINE_SECONDS } from '../lib/fcurve';
import { timelineStore } from '../stores/timeline';
export const PROJECT_FORMAT = 'toon-studio';
export const PROJECT_VERSION = 2;
const STORAGE_KEY = 'toon-studio.projects';
const AUTOSAVE_KEY = 'toon-studio.autosave';
function numberTuple(value, fallback) {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const tuple = value.map(item => typeof item === 'number' && Number.isFinite(item) ? item : 0);
  return [tuple[0], tuple[1], tuple[2]];
}
function hexColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
function sanitizeMaterial(value) {
  const raw = value || {};
  return {
    emissive: hexColor(raw.emissive, '#000000'),
    opacity: typeof raw.opacity === 'number' ? Math.min(1, Math.max(0, raw.opacity)) : 1,
    metalness: typeof raw.metalness === 'number' ? Math.min(1, Math.max(0, raw.metalness)) : 0.05,
    roughness: typeof raw.roughness === 'number' ? Math.min(1, Math.max(0, raw.roughness)) : 0.55
  };
}
function sanitizePhysics(value) {
  const raw = value || {};
  return {
    dynamic: raw.dynamic === true,
    velocity: numberTuple(raw.velocity, [0, 0, 0]),
    restitution: typeof raw.restitution === 'number' ? Math.min(1, Math.max(0, raw.restitution)) : 0.45,
    home: Array.isArray(raw.home) ? numberTuple(raw.home, [0, 0, 0]) : undefined
  };
}
function sanitizeSlots(value) {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const slot = raw || {};
    return {
      name: typeof slot.name === 'string' && slot.name ? slot.name : `Slot ${index}`,
      color: hexColor(slot.color, '#9aa3b8'),
      emissive: hexColor(slot.emissive, '#000000'),
      emissiveStrength: typeof slot.emissiveStrength === 'number' ? Math.min(5, Math.max(0, slot.emissiveStrength)) : 1,
      metalness: typeof slot.metalness === 'number' ? Math.min(1, Math.max(0, slot.metalness)) : 0.05,
      roughness: typeof slot.roughness === 'number' ? Math.min(1, Math.max(0, slot.roughness)) : 0.55,
      opacity: typeof slot.opacity === 'number' ? Math.min(1, Math.max(0, slot.opacity)) : 1,
      uvRepeat: typeof slot.uvRepeat === 'number' ? Math.min(20, Math.max(0.1, slot.uvRepeat)) : 1,
      ...(typeof slot.specular === 'number' ? {
        specular: Math.min(1, Math.max(0, slot.specular))
      } : {}),
      ...(typeof slot.normalStrength === 'number' ? {
        normalStrength: Math.min(3, Math.max(0, slot.normalStrength))
      } : {}),
      ...(typeof slot.blendMode === 'string' ? {
        blendMode: slot.blendMode
      } : {}),
      ...(typeof slot.uvScaleY === 'number' ? {
        uvScaleY: slot.uvScaleY
      } : {}),
      ...(typeof slot.uvOffsetX === 'number' ? {
        uvOffsetX: slot.uvOffsetX
      } : {}),
      ...(typeof slot.uvOffsetY === 'number' ? {
        uvOffsetY: slot.uvOffsetY
      } : {}),
      ...(typeof slot.uvRotation === 'number' ? {
        uvRotation: slot.uvRotation
      } : {}),
      ...(typeof slot.texMapping === 'number' ? {
        texMapping: slot.texMapping
      } : {}),
      ...(typeof slot.texStrength === 'number' ? {
        texStrength: slot.texStrength
      } : {}),
      presetId: typeof slot.presetId === 'string' ? slot.presetId : undefined,
      imageUrl: typeof slot.imageUrl === 'string' ? slot.imageUrl : undefined,
      ...(typeof slot.roughnessUrl === 'string' ? {
        roughnessUrl: slot.roughnessUrl
      } : {}),
      ...(typeof slot.normalUrl === 'string' ? {
        normalUrl: slot.normalUrl
      } : {})
    };
  });
}
function sanitizeGroups(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(raw => Boolean(raw) && typeof raw.start === 'number').map(raw => ({
    start: Math.max(0, Math.round(raw.start)),
    count: Math.max(0, Math.round(raw.count)),
    materialIndex: Math.max(0, Math.round(raw.materialIndex))
  }));
}
function sanitizeMesh(value) {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value;
  if (!Array.isArray(raw.vertices) || !Array.isArray(raw.faces)) return undefined;
  const vertices = raw.vertices.filter(vertex => Array.isArray(vertex) && vertex.length === 3 && vertex.every(item => typeof item === 'number' && Number.isFinite(item))).map(vertex => [vertex[0], vertex[1], vertex[2]]);
  if (vertices.length < 3) return undefined;
  const faces = raw.faces.filter(face => Array.isArray(face) && face.length >= 3 && face.every(index => Number.isInteger(index) && index >= 0 && index < vertices.length)).map(face => face.map(Number));
  if (!faces.length) return undefined;
  const edges = [];
  const seen = new Set();
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  let radius = 0.25;
  for (const vertex of vertices) radius = Math.max(radius, Math.hypot(vertex[0], vertex[1], vertex[2]));
  const colors = Array.isArray(raw.colors) && raw.colors.length >= vertices.length * 3 ? raw.colors.slice(0, vertices.length * 3).map(item => typeof item === 'number' && Number.isFinite(item) ? Math.min(1, Math.max(0, item)) : 1) : undefined;
  const uvs = Array.isArray(raw.uvs) && raw.uvs.length >= vertices.length ? raw.uvs.slice(0, vertices.length).map(uv => {
    if (!Array.isArray(uv) || uv.length !== 2) return [0, 0];
    const u = typeof uv[0] === 'number' && Number.isFinite(uv[0]) ? uv[0] : 0;
    const v = typeof uv[1] === 'number' && Number.isFinite(uv[1]) ? uv[1] : 0;
    return [u, v];
  }) : undefined;
  const slots = sanitizeSlots(raw.slots);
  const faceSlot = Array.isArray(raw.faceSlot) ? raw.faceSlot.map(index => Number.isInteger(index) && index >= 0 ? index : 0) : faces.map(() => 0);
  while (faceSlot.length < faces.length) faceSlot.push(0);
  faceSlot.length = faces.length;
  const mesh = {
    vertices,
    faces,
    edges,
    radius,
    colors,
    uvs,
    smooth: raw.smooth === true,
    slots,
    faceSlot,
    groups: []
  };
  const parsedGroups = sanitizeGroups(raw.groups);
  mesh.groups = parsedGroups.length && parsedGroups.some(g => g.count > 0) ? parsedGroups : buildGroups(mesh);
  return mesh;
}
export function createProject(name = 'Untitled') {
  const scene = sceneStore.serialize();
  const timeline = get(timelineStore);
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name,
    savedAt: new Date().toISOString(),
    scene,
    timeline: {
      duration: timeline.duration,
      startFrame: timeline.startFrame,
      endFrame: timeline.endFrame,
      snapToFrames: timeline.snapToFrames,
      loop: timeline.loop,
      easing: timeline.easing,
      frameRate: timeline.frameRate,
      keyframes: timelineStore.serializeKeyframes(),
      curves: timelineStore.serializeCurves(),
      tracks: timelineStore.serializeTracks(),
      strips: timelineStore.serializeStrips(),
      clips: timelineStore.serializeClips()
    }
  };
}
export function validateProject(input) {
  if (!input || typeof input !== 'object') throw new Error('Project file is empty or invalid.');
  const data = input;
  if (data.format !== PROJECT_FORMAT) throw new Error('Not a Toon Studio project file.');
  if (typeof data.version !== 'number' || data.version > PROJECT_VERSION) {
    throw new Error('This project was created by a newer version of Toon Studio.');
  }
  const scene = data.scene;
  if (!scene || !Array.isArray(scene.objects)) throw new Error('Project is missing its scene data.');
  const objects = scene.objects.map((raw, index) => {
    const object = raw;
    if (!object || typeof object !== 'object') throw new Error(`Invalid object at index ${index}.`);
    const type = typeof object.type === 'string' ? object.type : 'cube';
    const pos = numberTuple(object.position, [0, 0.5, 0]);
    const rot = numberTuple(object.rotation, [0, 0, 0]);
    const scl = numberTuple(object.scale, [1, 1, 1]);
    return {
      id: typeof object.id === 'string' ? object.id : `obj-${index + 1}`,
      name: typeof object.name === 'string' ? object.name : `${type} ${index + 1}`,
      type,
      position: pos,
      rotation: rot,
      scale: scl,
      restPose: object.restPose && typeof object.restPose === 'object' ? {
        position: numberTuple(object.restPose.position, pos),
        rotation: numberTuple(object.restPose.rotation, rot),
        scale: numberTuple(object.restPose.scale, scl)
      } : undefined,
      color: hexColor(object.color, '#ebeff5'),
      material: sanitizeMaterial(object.material),
      physics: sanitizePhysics(object.physics),
      geometry: sanitizeMesh(object.geometry),
      geometryVersion: typeof object.geometryVersion === 'number' ? object.geometryVersion : 1,
      colorVersion: typeof object.colorVersion === 'number' ? object.colorVersion : 1,
      selectionVersion: typeof object.selectionVersion === 'number' ? object.selectionVersion : 1,
      visible: object.visible !== false,
      locked: object.locked === true,
      selected: object.selected === true,
      text: typeof object.text === 'string' ? object.text.slice(0, 2000) : undefined,
      depth: typeof object.depth === 'number' ? object.depth : 0,
      parent: typeof object.parent === 'string' ? object.parent : undefined,
      children: Array.isArray(object.children) ? object.children.filter(child => typeof child === 'string') : [],
      ...(object.creationParams && typeof object.creationParams === 'object' ? {
        creationParams: {
          ...object.creationParams
        }
      } : {}),
      ...(object.lightProps && typeof object.lightProps === 'object' ? {
        lightProps: {
          ...object.lightProps
        }
      } : {}),
      cameraProps: object.cameraProps && typeof object.cameraProps === 'object' ? {
        fov: typeof object.cameraProps.fov === 'number' ? object.cameraProps.fov : 50,
        near: typeof object.cameraProps.near === 'number' ? object.cameraProps.near : 0.1,
        far: typeof object.cameraProps.far === 'number' ? object.cameraProps.far : 100,
        ortho: Boolean(object.cameraProps.ortho),
        orthoScale: typeof object.cameraProps.orthoScale === 'number' ? object.cameraProps.orthoScale : 4,
        targetId: typeof object.cameraProps.targetId === 'string' ? object.cameraProps.targetId : null,
        targetOffset: numberTuple(object.cameraProps.targetOffset, [0, 0.5, 0]),
        trackingMode: ['none', 'look_at', 'follow', 'orbit'].includes(object.cameraProps.trackingMode) ? object.cameraProps.trackingMode : 'look_at',
        followDistance: typeof object.cameraProps.followDistance === 'number' ? object.cameraProps.followDistance : 4.5,
        followHeight: typeof object.cameraProps.followHeight === 'number' ? object.cameraProps.followHeight : 1.8,
        damping: typeof object.cameraProps.damping === 'number' ? object.cameraProps.damping : 0.1,
        active: object.cameraProps.active !== false
      } : undefined
    };
  });
  const timeline = data.timeline || {};
  const keyframes = {};
  if (timeline.keyframes && typeof timeline.keyframes === 'object') {
    for (const [objectId, keys] of Object.entries(timeline.keyframes)) {
      if (!Array.isArray(keys)) continue;
      keyframes[objectId] = keys.filter(key => Boolean(key) && typeof key.time === 'number').map(key => ({
        time: Number.isFinite(key.time) ? key.time : 0,
        position: numberTuple(key.position, [0, 0, 0]),
        rotation: numberTuple(key.rotation, [0, 0, 0]),
        scale: numberTuple(key.scale, [1, 1, 1]),
        ...(typeof key.visible === 'boolean' ? {
          visible: key.visible
        } : {}),
        ...(key.interpolation === 'constant' || key.interpolation === 'linear' || key.interpolation === 'bezier' ? {
          interpolation: key.interpolation
        } : {})
      })).sort((a, b) => a.time - b.time);
    }
  }
  const curves = {};
  if (timeline.curves && typeof timeline.curves === 'object') {
    for (const [objectId, channels] of Object.entries(timeline.curves)) {
      const sanitized = {};
      for (const [path, keys] of Object.entries(channels || {})) {
        if (!Array.isArray(keys)) continue;
        sanitized[path] = keys.filter(key => Boolean(key) && typeof key.time === 'number' && Number.isFinite(key.time)).map(key => ({
          time: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, key.time)),
          value: typeof key.value === 'number' && Number.isFinite(key.value) ? key.value : 0,
          interpolation: key.interpolation === 'constant' || key.interpolation === 'linear' ? key.interpolation : 'bezier',
          handleLeft: Array.isArray(key.handleLeft) ? [Number(key.handleLeft[0]) || 0, Number(key.handleLeft[1]) || 0] : [-1 / 3, 0],
          handleRight: Array.isArray(key.handleRight) ? [Number(key.handleRight[0]) || 0, Number(key.handleRight[1]) || 0] : [1 / 3, 0],
          autoLeft: key.autoLeft !== false,
          autoRight: key.autoRight !== false
        })).sort((a, b) => a.time - b.time);
      }
      if (Object.keys(sanitized).length) curves[objectId] = sanitized;
    }
  }
  const tracks = {};
  if (timeline.tracks && typeof timeline.tracks === 'object' && !Array.isArray(timeline.tracks)) {
    for (const [objectId, raw] of Object.entries(timeline.tracks)) {
      if (!raw || typeof raw !== 'object') continue;
      tracks[objectId] = {
        objectId,
        name: typeof raw.name === 'string' ? raw.name : undefined,
        locked: raw.locked === true,
        hidden: raw.hidden === true,
        muted: raw.muted === true
      };
    }
  }
  const strips = Array.isArray(timeline.strips) ? timeline.strips.filter(strip => Boolean(strip) && typeof strip.id === 'string').map(strip => ({
    id: strip.id,
    objectId: typeof strip.objectId === 'string' ? strip.objectId : '',
    name: typeof strip.name === 'string' ? strip.name : 'Strip',
    start: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, Number(strip.start) || 0)),
    end: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, Number(strip.end) || 0)),
    actionStart: Number(strip.actionStart) || 0,
    actionEnd: Number(strip.actionEnd) || 0,
    speed: Math.min(10, Math.max(0.1, Number(strip.speed) || 1)),
    reversed: strip.reversed === true,
    frozen: strip.frozen === true,
    muted: strip.muted === true
  })) : [];
  const clips = {};
  if (timeline.clips && typeof timeline.clips === 'object' && !Array.isArray(timeline.clips)) {
    for (const [objectId, raw] of Object.entries(timeline.clips)) {
      if (!raw || typeof raw !== 'object') continue;
      const start = Number(raw.start);
      const end = Number(raw.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      clips[objectId] = {
        start: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, start)),
        end: Math.min(MAX_TIMELINE_SECONDS, Math.max(0, end))
      };
    }
  }
  const fps = typeof timeline.frameRate === 'number' ? Math.min(120, Math.max(1, timeline.frameRate)) : 30;
  const dur = typeof timeline.duration === 'number' ? Math.min(MAX_TIMELINE_SECONDS, Math.max(0.1, timeline.duration)) : MAX_TIMELINE_SECONDS;
  const startFrame = typeof timeline.startFrame === 'number' ? Math.max(0, Math.round(timeline.startFrame)) : 0;
  const endFrame = typeof timeline.endFrame === 'number' ? Math.max(startFrame + 1, Math.round(timeline.endFrame)) : Math.max(1, Math.round(dur * fps));
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled',
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
    scene: {
      objects,
      selectedId: typeof scene.selectedId === 'string' ? scene.selectedId : null,
      score: typeof scene.score === 'number' ? scene.score : 0
    },
    timeline: {
      duration: dur,
      startFrame,
      endFrame,
      snapToFrames: timeline.snapToFrames === true,
      loop: timeline.loop !== false,
      easing: timeline.easing !== false,
      frameRate: fps,
      keyframes,
      curves,
      tracks,
      strips,
      clips
    }
  };
}
export function applyProject(project) {
  const data = validateProject(project);
  sceneStore.load(data.scene.objects, data.scene.selectedId);
  sceneStore.setScore(data.scene.score);
  timelineStore.loadKeyframes(data.timeline.keyframes);
  if (Object.keys(data.timeline.curves).length) timelineStore.loadCurves(data.timeline.curves);
  if (data.timeline.tracks) timelineStore.loadTracks(data.timeline.tracks);
  timelineStore.setFrameRate(data.timeline.frameRate);
  timelineStore.setDuration(data.timeline.duration);
  if (typeof data.timeline.startFrame === 'number') timelineStore.setStartFrame(data.timeline.startFrame);
  timelineStore.setSnapToFrames(Boolean(data.timeline.snapToFrames));
  timelineStore.loadStrips(data.timeline.strips);
  timelineStore.loadClips(data.timeline.clips);
  timelineStore.setLoop(data.timeline.loop);
  timelineStore.setEasing(data.timeline.easing);
  // Evaluate initial frame so viewport transforms match the loaded animation at t=0 / startFrame
  const evaluated = timelineStore.evaluate(get(timelineStore).currentTime, data.timeline.easing);
  if (evaluated.size) sceneStore.applyAnimation(evaluated);
}
export function downloadProject(project) {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${project.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'toon-project'}.tsf.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readProjectFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  return validateProject(parsed);
}
function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeStore(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Ignore quota or sandbox storage errors
  }
}
export function listSavedProjects() {
  return readStore().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export function saveToBrowser(project) {
  const projects = readStore().filter(entry => entry.name !== project.name);
  projects.push({
    name: project.name,
    savedAt: project.savedAt,
    project
  });
  writeStore(projects.slice(-20));
}
export function deleteSavedProject(name) {
  writeStore(readStore().filter(entry => entry.name !== name));
}
export function saveAutosave(project) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
  } catch {
    // Storage can be unavailable in private browsing; autosave is best-effort.
  }
}
export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return validateProject(JSON.parse(raw));
  } catch {
    return null;
  }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsicHJvamVjdC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBnZXQgfSBmcm9tICdzdmVsdGUvc3RvcmUnO1xuaW1wb3J0IHR5cGUgeyBNYXRlcmlhbCwgUGh5c2ljc0JvZHksIFNjZW5lT2JqZWN0IH0gZnJvbSAnLi4vc3RvcmVzL3NjZW5lJztcbmltcG9ydCB7IHNjZW5lU3RvcmUgfSBmcm9tICcuLi9zdG9yZXMvc2NlbmUnO1xuaW1wb3J0IHsgYnVpbGRHcm91cHMsIHR5cGUgR2VvbWV0cnlHcm91cCwgdHlwZSBNYXRlcmlhbFNsb3QsIHR5cGUgTWVzaCB9IGZyb20gJy4vbWVzaCc7XG5pbXBvcnQgdHlwZSB7IEJlelRyaXBsZSB9IGZyb20gJy4uL2xpYi9mY3VydmUnO1xuaW1wb3J0IHR5cGUgeyBLZXlmcmFtZURhdGEsIExheWVyQ2xpcCwgTmxhU3RyaXAsIFRyYWNrTWV0YSB9IGZyb20gJy4uL3N0b3Jlcy90aW1lbGluZSc7XG5pbXBvcnQgeyBNQVhfVElNRUxJTkVfU0VDT05EUyB9IGZyb20gJy4uL2xpYi9mY3VydmUnO1xuaW1wb3J0IHsgdGltZWxpbmVTdG9yZSB9IGZyb20gJy4uL3N0b3Jlcy90aW1lbGluZSc7XG5cbmV4cG9ydCBjb25zdCBQUk9KRUNUX0ZPUk1BVCA9ICd0b29uLXN0dWRpbyc7XG5leHBvcnQgY29uc3QgUFJPSkVDVF9WRVJTSU9OID0gMjtcbmNvbnN0IFNUT1JBR0VfS0VZID0gJ3Rvb24tc3R1ZGlvLnByb2plY3RzJztcbmNvbnN0IEFVVE9TQVZFX0tFWSA9ICd0b29uLXN0dWRpby5hdXRvc2F2ZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEZpbGUge1xuXHRmb3JtYXQ6IHR5cGVvZiBQUk9KRUNUX0ZPUk1BVDtcblx0dmVyc2lvbjogbnVtYmVyO1xuXHRuYW1lOiBzdHJpbmc7XG5cdHNhdmVkQXQ6IHN0cmluZztcblx0c2NlbmU6IHtcblx0XHRvYmplY3RzOiBTY2VuZU9iamVjdFtdO1xuXHRcdHNlbGVjdGVkSWQ6IHN0cmluZyB8IG51bGw7XG5cdFx0c2NvcmU6IG51bWJlcjtcblx0fTtcblx0dGltZWxpbmU6IHtcblx0XHRkdXJhdGlvbjogbnVtYmVyO1xuXHRcdHN0YXJ0RnJhbWU/OiBudW1iZXI7XG5cdFx0ZW5kRnJhbWU/OiBudW1iZXI7XG5cdFx0c25hcFRvRnJhbWVzPzogYm9vbGVhbjtcblx0XHRsb29wOiBib29sZWFuO1xuXHRcdGVhc2luZzogYm9vbGVhbjtcblx0XHRmcmFtZVJhdGU6IG51bWJlcjtcblx0XHRrZXlmcmFtZXM6IFJlY29yZDxzdHJpbmcsIEtleWZyYW1lRGF0YVtdPjtcblx0XHRjdXJ2ZXM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIEJlelRyaXBsZVtdPj47XG5cdFx0dHJhY2tzPzogUmVjb3JkPHN0cmluZywgVHJhY2tNZXRhPjtcblx0XHRzdHJpcHM6IE5sYVN0cmlwW107XG5cdFx0Y2xpcHM6IFJlY29yZDxzdHJpbmcsIExheWVyQ2xpcD47XG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcmVkUHJvamVjdCB7XG5cdG5hbWU6IHN0cmluZztcblx0c2F2ZWRBdDogc3RyaW5nO1xuXHRwcm9qZWN0OiBQcm9qZWN0RmlsZTtcbn1cblxuZnVuY3Rpb24gbnVtYmVyVHVwbGUodmFsdWU6IHVua25vd24sIGZhbGxiYWNrOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0pOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0ge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpIHx8IHZhbHVlLmxlbmd0aCAhPT0gMykgcmV0dXJuIGZhbGxiYWNrO1xuXHRjb25zdCB0dXBsZSA9IHZhbHVlLm1hcCgoaXRlbSkgPT4gKHR5cGVvZiBpdGVtID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoaXRlbSkgPyBpdGVtIDogMCkpO1xuXHRyZXR1cm4gW3R1cGxlWzBdLCB0dXBsZVsxXSwgdHVwbGVbMl1dO1xufVxuXG5mdW5jdGlvbiBoZXhDb2xvcih2YWx1ZTogdW5rbm93biwgZmFsbGJhY2s6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIC9eI1swLTlhLWZBLUZdezZ9JC8udGVzdCh2YWx1ZSkgPyB2YWx1ZSA6IGZhbGxiYWNrO1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZU1hdGVyaWFsKHZhbHVlOiB1bmtub3duKTogTWF0ZXJpYWwge1xuXHRjb25zdCByYXcgPSAodmFsdWUgfHwge30pIGFzIFBhcnRpYWw8TWF0ZXJpYWw+O1xuXHRyZXR1cm4ge1xuXHRcdGVtaXNzaXZlOiBoZXhDb2xvcihyYXcuZW1pc3NpdmUsICcjMDAwMDAwJyksXG5cdFx0b3BhY2l0eTogdHlwZW9mIHJhdy5vcGFjaXR5ID09PSAnbnVtYmVyJyA/IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIHJhdy5vcGFjaXR5KSkgOiAxLFxuXHRcdG1ldGFsbmVzczogdHlwZW9mIHJhdy5tZXRhbG5lc3MgPT09ICdudW1iZXInID8gTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgcmF3Lm1ldGFsbmVzcykpIDogMC4wNSxcblx0XHRyb3VnaG5lc3M6IHR5cGVvZiByYXcucm91Z2huZXNzID09PSAnbnVtYmVyJyA/IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIHJhdy5yb3VnaG5lc3MpKSA6IDAuNTUsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplUGh5c2ljcyh2YWx1ZTogdW5rbm93bik6IFBoeXNpY3NCb2R5IHtcblx0Y29uc3QgcmF3ID0gKHZhbHVlIHx8IHt9KSBhcyBQYXJ0aWFsPFBoeXNpY3NCb2R5Pjtcblx0cmV0dXJuIHtcblx0XHRkeW5hbWljOiByYXcuZHluYW1pYyA9PT0gdHJ1ZSxcblx0XHR2ZWxvY2l0eTogbnVtYmVyVHVwbGUocmF3LnZlbG9jaXR5LCBbMCwgMCwgMF0pLFxuXHRcdHJlc3RpdHV0aW9uOiB0eXBlb2YgcmF3LnJlc3RpdHV0aW9uID09PSAnbnVtYmVyJyA/IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIHJhdy5yZXN0aXR1dGlvbikpIDogMC40NSxcblx0XHRob21lOiBBcnJheS5pc0FycmF5KHJhdy5ob21lKSA/IG51bWJlclR1cGxlKHJhdy5ob21lLCBbMCwgMCwgMF0pIDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZVNsb3RzKHZhbHVlOiB1bmtub3duKTogTWF0ZXJpYWxTbG90W10ge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gW107XG5cdHJldHVybiB2YWx1ZS5tYXAoKHJhdywgaW5kZXgpID0+IHtcblx0XHRjb25zdCBzbG90ID0gKHJhdyB8fCB7fSkgYXMgUGFydGlhbDxNYXRlcmlhbFNsb3Q+ICYgUmVjb3JkPHN0cmluZywgYW55Pjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogdHlwZW9mIHNsb3QubmFtZSA9PT0gJ3N0cmluZycgJiYgc2xvdC5uYW1lID8gc2xvdC5uYW1lIDogYFNsb3QgJHtpbmRleH1gLFxuXHRcdFx0Y29sb3I6IGhleENvbG9yKHNsb3QuY29sb3IsICcjOWFhM2I4JyksXG5cdFx0XHRlbWlzc2l2ZTogaGV4Q29sb3Ioc2xvdC5lbWlzc2l2ZSwgJyMwMDAwMDAnKSxcblx0XHRcdGVtaXNzaXZlU3RyZW5ndGg6IHR5cGVvZiBzbG90LmVtaXNzaXZlU3RyZW5ndGggPT09ICdudW1iZXInID8gTWF0aC5taW4oNSwgTWF0aC5tYXgoMCwgc2xvdC5lbWlzc2l2ZVN0cmVuZ3RoKSkgOiAxLFxuXHRcdFx0bWV0YWxuZXNzOiB0eXBlb2Ygc2xvdC5tZXRhbG5lc3MgPT09ICdudW1iZXInID8gTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgc2xvdC5tZXRhbG5lc3MpKSA6IDAuMDUsXG5cdFx0XHRyb3VnaG5lc3M6IHR5cGVvZiBzbG90LnJvdWdobmVzcyA9PT0gJ251bWJlcicgPyBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBzbG90LnJvdWdobmVzcykpIDogMC41NSxcblx0XHRcdG9wYWNpdHk6IHR5cGVvZiBzbG90Lm9wYWNpdHkgPT09ICdudW1iZXInID8gTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgc2xvdC5vcGFjaXR5KSkgOiAxLFxuXHRcdFx0dXZSZXBlYXQ6IHR5cGVvZiBzbG90LnV2UmVwZWF0ID09PSAnbnVtYmVyJyA/IE1hdGgubWluKDIwLCBNYXRoLm1heCgwLjEsIHNsb3QudXZSZXBlYXQpKSA6IDEsXG5cdFx0XHQuLi4odHlwZW9mIHNsb3Quc3BlY3VsYXIgPT09ICdudW1iZXInID8geyBzcGVjdWxhcjogTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgc2xvdC5zcGVjdWxhcikpIH0gOiB7fSksXG5cdFx0XHQuLi4odHlwZW9mIHNsb3Qubm9ybWFsU3RyZW5ndGggPT09ICdudW1iZXInID8geyBub3JtYWxTdHJlbmd0aDogTWF0aC5taW4oMywgTWF0aC5tYXgoMCwgc2xvdC5ub3JtYWxTdHJlbmd0aCkpIH0gOiB7fSksXG5cdFx0XHQuLi4odHlwZW9mIHNsb3QuYmxlbmRNb2RlID09PSAnc3RyaW5nJyA/IHsgYmxlbmRNb2RlOiBzbG90LmJsZW5kTW9kZSB9IDoge30pLFxuXHRcdFx0Li4uKHR5cGVvZiBzbG90LnV2U2NhbGVZID09PSAnbnVtYmVyJyA/IHsgdXZTY2FsZVk6IHNsb3QudXZTY2FsZVkgfSA6IHt9KSxcblx0XHRcdC4uLih0eXBlb2Ygc2xvdC51dk9mZnNldFggPT09ICdudW1iZXInID8geyB1dk9mZnNldFg6IHNsb3QudXZPZmZzZXRYIH0gOiB7fSksXG5cdFx0XHQuLi4odHlwZW9mIHNsb3QudXZPZmZzZXRZID09PSAnbnVtYmVyJyA/IHsgdXZPZmZzZXRZOiBzbG90LnV2T2Zmc2V0WSB9IDoge30pLFxuXHRcdFx0Li4uKHR5cGVvZiBzbG90LnV2Um90YXRpb24gPT09ICdudW1iZXInID8geyB1dlJvdGF0aW9uOiBzbG90LnV2Um90YXRpb24gfSA6IHt9KSxcblx0XHRcdC4uLih0eXBlb2Ygc2xvdC50ZXhNYXBwaW5nID09PSAnbnVtYmVyJyA/IHsgdGV4TWFwcGluZzogc2xvdC50ZXhNYXBwaW5nIH0gOiB7fSksXG5cdFx0XHQuLi4odHlwZW9mIHNsb3QudGV4U3RyZW5ndGggPT09ICdudW1iZXInID8geyB0ZXhTdHJlbmd0aDogc2xvdC50ZXhTdHJlbmd0aCB9IDoge30pLFxuXHRcdFx0cHJlc2V0SWQ6IHR5cGVvZiBzbG90LnByZXNldElkID09PSAnc3RyaW5nJyA/IHNsb3QucHJlc2V0SWQgOiB1bmRlZmluZWQsXG5cdFx0XHRpbWFnZVVybDogdHlwZW9mIHNsb3QuaW1hZ2VVcmwgPT09ICdzdHJpbmcnID8gc2xvdC5pbWFnZVVybCA6IHVuZGVmaW5lZCxcblx0XHRcdC4uLih0eXBlb2Ygc2xvdC5yb3VnaG5lc3NVcmwgPT09ICdzdHJpbmcnID8geyByb3VnaG5lc3NVcmw6IHNsb3Qucm91Z2huZXNzVXJsIH0gOiB7fSksXG5cdFx0XHQuLi4odHlwZW9mIHNsb3Qubm9ybWFsVXJsID09PSAnc3RyaW5nJyA/IHsgbm9ybWFsVXJsOiBzbG90Lm5vcm1hbFVybCB9IDoge30pLFxuXHRcdH07XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZUdyb3Vwcyh2YWx1ZTogdW5rbm93bik6IEdlb21ldHJ5R3JvdXBbXSB7XG5cdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiBbXTtcblx0cmV0dXJuIHZhbHVlXG5cdFx0LmZpbHRlcigocmF3KTogcmF3IGlzIEdlb21ldHJ5R3JvdXAgPT4gQm9vbGVhbihyYXcpICYmIHR5cGVvZiAocmF3IGFzIEdlb21ldHJ5R3JvdXApLnN0YXJ0ID09PSAnbnVtYmVyJylcblx0XHQubWFwKChyYXcpID0+ICh7XG5cdFx0XHRzdGFydDogTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChyYXcuc3RhcnQpKSxcblx0XHRcdGNvdW50OiBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKHJhdy5jb3VudCkpLFxuXHRcdFx0bWF0ZXJpYWxJbmRleDogTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChyYXcubWF0ZXJpYWxJbmRleCkpLFxuXHRcdH0pKTtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVNZXNoKHZhbHVlOiB1bmtub3duKTogTWVzaCB8IHVuZGVmaW5lZCB7XG5cdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblx0Y29uc3QgcmF3ID0gdmFsdWUgYXMgUGFydGlhbDxNZXNoPjtcblx0aWYgKCFBcnJheS5pc0FycmF5KHJhdy52ZXJ0aWNlcykgfHwgIUFycmF5LmlzQXJyYXkocmF3LmZhY2VzKSkgcmV0dXJuIHVuZGVmaW5lZDtcblx0Y29uc3QgdmVydGljZXMgPSByYXcudmVydGljZXNcblx0XHQuZmlsdGVyKCh2ZXJ0ZXgpOiB2ZXJ0ZXggaXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0+IEFycmF5LmlzQXJyYXkodmVydGV4KSAmJiB2ZXJ0ZXgubGVuZ3RoID09PSAzICYmIHZlcnRleC5ldmVyeSgoaXRlbSkgPT4gdHlwZW9mIGl0ZW0gPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShpdGVtKSkpXG5cdFx0Lm1hcCgodmVydGV4KSA9PiBbdmVydGV4WzBdLCB2ZXJ0ZXhbMV0sIHZlcnRleFsyXV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdKTtcblx0aWYgKHZlcnRpY2VzLmxlbmd0aCA8IDMpIHJldHVybiB1bmRlZmluZWQ7XG5cdGNvbnN0IGZhY2VzID0gcmF3LmZhY2VzXG5cdFx0LmZpbHRlcigoZmFjZSk6IGZhY2UgaXMgbnVtYmVyW10gPT4gQXJyYXkuaXNBcnJheShmYWNlKSAmJiBmYWNlLmxlbmd0aCA+PSAzICYmIGZhY2UuZXZlcnkoKGluZGV4KSA9PiBOdW1iZXIuaXNJbnRlZ2VyKGluZGV4KSAmJiBpbmRleCA+PSAwICYmIGluZGV4IDwgdmVydGljZXMubGVuZ3RoKSlcblx0XHQubWFwKChmYWNlKSA9PiBmYWNlLm1hcChOdW1iZXIpKTtcblx0aWYgKCFmYWNlcy5sZW5ndGgpIHJldHVybiB1bmRlZmluZWQ7XG5cdGNvbnN0IGVkZ2VzOiBbbnVtYmVyLCBudW1iZXJdW10gPSBbXTtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRmb3IgKGNvbnN0IGZhY2Ugb2YgZmFjZXMpIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZhY2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGEgPSBmYWNlW2ldO1xuXHRcdFx0Y29uc3QgYiA9IGZhY2VbKGkgKyAxKSAlIGZhY2UubGVuZ3RoXTtcblx0XHRcdGNvbnN0IGtleSA9IGEgPCBiID8gYCR7YX06JHtifWAgOiBgJHtifToke2F9YDtcblx0XHRcdGlmIChzZWVuLmhhcyhrZXkpKSBjb250aW51ZTtcblx0XHRcdHNlZW4uYWRkKGtleSk7XG5cdFx0XHRlZGdlcy5wdXNoKFthLCBiXSk7XG5cdFx0fVxuXHR9XG5cdGxldCByYWRpdXMgPSAwLjI1O1xuXHRmb3IgKGNvbnN0IHZlcnRleCBvZiB2ZXJ0aWNlcykgcmFkaXVzID0gTWF0aC5tYXgocmFkaXVzLCBNYXRoLmh5cG90KHZlcnRleFswXSwgdmVydGV4WzFdLCB2ZXJ0ZXhbMl0pKTtcblx0Y29uc3QgY29sb3JzID0gQXJyYXkuaXNBcnJheShyYXcuY29sb3JzKSAmJiByYXcuY29sb3JzLmxlbmd0aCA+PSB2ZXJ0aWNlcy5sZW5ndGggKiAzXG5cdFx0PyByYXcuY29sb3JzLnNsaWNlKDAsIHZlcnRpY2VzLmxlbmd0aCAqIDMpLm1hcCgoaXRlbSkgPT4gKHR5cGVvZiBpdGVtID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoaXRlbSkgPyBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBpdGVtKSkgOiAxKSlcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29uc3QgdXZzID1cblx0XHRBcnJheS5pc0FycmF5KHJhdy51dnMpICYmIHJhdy51dnMubGVuZ3RoID49IHZlcnRpY2VzLmxlbmd0aFxuXHRcdFx0PyByYXcudXZzLnNsaWNlKDAsIHZlcnRpY2VzLmxlbmd0aCkubWFwKCh1dik6IFtudW1iZXIsIG51bWJlcl0gPT4ge1xuXHRcdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh1dikgfHwgdXYubGVuZ3RoICE9PSAyKSByZXR1cm4gWzAsIDBdO1xuXHRcdFx0XHRcdGNvbnN0IHUgPSB0eXBlb2YgdXZbMF0gPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZSh1dlswXSkgPyB1dlswXSA6IDA7XG5cdFx0XHRcdFx0Y29uc3QgdiA9IHR5cGVvZiB1dlsxXSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHV2WzFdKSA/IHV2WzFdIDogMDtcblx0XHRcdFx0XHRyZXR1cm4gW3UsIHZdO1xuXHRcdFx0XHR9KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IHNsb3RzID0gc2FuaXRpemVTbG90cyhyYXcuc2xvdHMpO1xuXHRjb25zdCBmYWNlU2xvdCA9IEFycmF5LmlzQXJyYXkocmF3LmZhY2VTbG90KVxuXHRcdD8gcmF3LmZhY2VTbG90Lm1hcCgoaW5kZXgpID0+IChOdW1iZXIuaXNJbnRlZ2VyKGluZGV4KSAmJiBpbmRleCA+PSAwID8gaW5kZXggOiAwKSlcblx0XHQ6IGZhY2VzLm1hcCgoKSA9PiAwKTtcblx0d2hpbGUgKGZhY2VTbG90Lmxlbmd0aCA8IGZhY2VzLmxlbmd0aCkgZmFjZVNsb3QucHVzaCgwKTtcblx0ZmFjZVNsb3QubGVuZ3RoID0gZmFjZXMubGVuZ3RoO1xuXHRjb25zdCBtZXNoOiBNZXNoID0geyB2ZXJ0aWNlcywgZmFjZXMsIGVkZ2VzLCByYWRpdXMsIGNvbG9ycywgdXZzLCBzbW9vdGg6IHJhdy5zbW9vdGggPT09IHRydWUsIHNsb3RzLCBmYWNlU2xvdCwgZ3JvdXBzOiBbXSB9O1xuXHRjb25zdCBwYXJzZWRHcm91cHMgPSBzYW5pdGl6ZUdyb3VwcyhyYXcuZ3JvdXBzKTtcblx0bWVzaC5ncm91cHMgPSBwYXJzZWRHcm91cHMubGVuZ3RoICYmIHBhcnNlZEdyb3Vwcy5zb21lKChnKSA9PiBnLmNvdW50ID4gMCkgPyBwYXJzZWRHcm91cHMgOiBidWlsZEdyb3VwcyhtZXNoKTtcblx0cmV0dXJuIG1lc2g7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVQcm9qZWN0KG5hbWUgPSAnVW50aXRsZWQnKTogUHJvamVjdEZpbGUge1xuXHRjb25zdCBzY2VuZSA9IHNjZW5lU3RvcmUuc2VyaWFsaXplKCk7XG5cdGNvbnN0IHRpbWVsaW5lID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRyZXR1cm4ge1xuXHRcdGZvcm1hdDogUFJPSkVDVF9GT1JNQVQsXG5cdFx0dmVyc2lvbjogUFJPSkVDVF9WRVJTSU9OLFxuXHRcdG5hbWUsXG5cdFx0c2F2ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdHNjZW5lLFxuXHRcdHRpbWVsaW5lOiB7XG5cdFx0XHRkdXJhdGlvbjogdGltZWxpbmUuZHVyYXRpb24sXG5cdFx0XHRzdGFydEZyYW1lOiB0aW1lbGluZS5zdGFydEZyYW1lLFxuXHRcdFx0ZW5kRnJhbWU6IHRpbWVsaW5lLmVuZEZyYW1lLFxuXHRcdFx0c25hcFRvRnJhbWVzOiB0aW1lbGluZS5zbmFwVG9GcmFtZXMsXG5cdFx0XHRsb29wOiB0aW1lbGluZS5sb29wLFxuXHRcdFx0ZWFzaW5nOiB0aW1lbGluZS5lYXNpbmcsXG5cdFx0XHRmcmFtZVJhdGU6IHRpbWVsaW5lLmZyYW1lUmF0ZSxcblx0XHRcdGtleWZyYW1lczogdGltZWxpbmVTdG9yZS5zZXJpYWxpemVLZXlmcmFtZXMoKSxcblx0XHRcdGN1cnZlczogdGltZWxpbmVTdG9yZS5zZXJpYWxpemVDdXJ2ZXMoKSxcblx0XHRcdHRyYWNrczogdGltZWxpbmVTdG9yZS5zZXJpYWxpemVUcmFja3MoKSxcblx0XHRcdHN0cmlwczogdGltZWxpbmVTdG9yZS5zZXJpYWxpemVTdHJpcHMoKSxcblx0XHRcdGNsaXBzOiB0aW1lbGluZVN0b3JlLnNlcmlhbGl6ZUNsaXBzKCksXG5cdFx0fSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlUHJvamVjdChpbnB1dDogdW5rbm93bik6IFByb2plY3RGaWxlIHtcblx0aWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09ICdvYmplY3QnKSB0aHJvdyBuZXcgRXJyb3IoJ1Byb2plY3QgZmlsZSBpcyBlbXB0eSBvciBpbnZhbGlkLicpO1xuXHRjb25zdCBkYXRhID0gaW5wdXQgYXMgUGFydGlhbDxQcm9qZWN0RmlsZT47XG5cdGlmIChkYXRhLmZvcm1hdCAhPT0gUFJPSkVDVF9GT1JNQVQpIHRocm93IG5ldyBFcnJvcignTm90IGEgVG9vbiBTdHVkaW8gcHJvamVjdCBmaWxlLicpO1xuXHRpZiAodHlwZW9mIGRhdGEudmVyc2lvbiAhPT0gJ251bWJlcicgfHwgZGF0YS52ZXJzaW9uID4gUFJPSkVDVF9WRVJTSU9OKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdUaGlzIHByb2plY3Qgd2FzIGNyZWF0ZWQgYnkgYSBuZXdlciB2ZXJzaW9uIG9mIFRvb24gU3R1ZGlvLicpO1xuXHR9XG5cdGNvbnN0IHNjZW5lID0gZGF0YS5zY2VuZTtcblx0aWYgKCFzY2VuZSB8fCAhQXJyYXkuaXNBcnJheShzY2VuZS5vYmplY3RzKSkgdGhyb3cgbmV3IEVycm9yKCdQcm9qZWN0IGlzIG1pc3NpbmcgaXRzIHNjZW5lIGRhdGEuJyk7XG5cdGNvbnN0IG9iamVjdHM6IFNjZW5lT2JqZWN0W10gPSBzY2VuZS5vYmplY3RzLm1hcCgocmF3LCBpbmRleCkgPT4ge1xuXHRcdGNvbnN0IG9iamVjdCA9IHJhdyBhcyBQYXJ0aWFsPFNjZW5lT2JqZWN0PiAmIFJlY29yZDxzdHJpbmcsIGFueT47XG5cdFx0aWYgKCFvYmplY3QgfHwgdHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcpIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBvYmplY3QgYXQgaW5kZXggJHtpbmRleH0uYCk7XG5cdFx0Y29uc3QgdHlwZSA9IHR5cGVvZiBvYmplY3QudHlwZSA9PT0gJ3N0cmluZycgPyBvYmplY3QudHlwZSA6ICdjdWJlJztcblx0XHRjb25zdCBwb3MgPSBudW1iZXJUdXBsZShvYmplY3QucG9zaXRpb24sIFswLCAwLjUsIDBdKTtcblx0XHRjb25zdCByb3QgPSBudW1iZXJUdXBsZShvYmplY3Qucm90YXRpb24sIFswLCAwLCAwXSk7XG5cdFx0Y29uc3Qgc2NsID0gbnVtYmVyVHVwbGUob2JqZWN0LnNjYWxlLCBbMSwgMSwgMV0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdHlwZW9mIG9iamVjdC5pZCA9PT0gJ3N0cmluZycgPyBvYmplY3QuaWQgOiBgb2JqLSR7aW5kZXggKyAxfWAsXG5cdFx0XHRuYW1lOiB0eXBlb2Ygb2JqZWN0Lm5hbWUgPT09ICdzdHJpbmcnID8gb2JqZWN0Lm5hbWUgOiBgJHt0eXBlfSAke2luZGV4ICsgMX1gLFxuXHRcdFx0dHlwZSxcblx0XHRcdHBvc2l0aW9uOiBwb3MsXG5cdFx0XHRyb3RhdGlvbjogcm90LFxuXHRcdFx0c2NhbGU6IHNjbCxcblx0XHRcdHJlc3RQb3NlOlxuXHRcdFx0XHRvYmplY3QucmVzdFBvc2UgJiYgdHlwZW9mIG9iamVjdC5yZXN0UG9zZSA9PT0gJ29iamVjdCdcblx0XHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IG51bWJlclR1cGxlKG9iamVjdC5yZXN0UG9zZS5wb3NpdGlvbiwgcG9zKSxcblx0XHRcdFx0XHRcdFx0cm90YXRpb246IG51bWJlclR1cGxlKG9iamVjdC5yZXN0UG9zZS5yb3RhdGlvbiwgcm90KSxcblx0XHRcdFx0XHRcdFx0c2NhbGU6IG51bWJlclR1cGxlKG9iamVjdC5yZXN0UG9zZS5zY2FsZSwgc2NsKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdGNvbG9yOiBoZXhDb2xvcihvYmplY3QuY29sb3IsICcjZWJlZmY1JyksXG5cdFx0XHRtYXRlcmlhbDogc2FuaXRpemVNYXRlcmlhbChvYmplY3QubWF0ZXJpYWwpLFxuXHRcdFx0cGh5c2ljczogc2FuaXRpemVQaHlzaWNzKG9iamVjdC5waHlzaWNzKSxcblx0XHRcdGdlb21ldHJ5OiBzYW5pdGl6ZU1lc2gob2JqZWN0Lmdlb21ldHJ5KSxcblx0XHRcdGdlb21ldHJ5VmVyc2lvbjogdHlwZW9mIG9iamVjdC5nZW9tZXRyeVZlcnNpb24gPT09ICdudW1iZXInID8gb2JqZWN0Lmdlb21ldHJ5VmVyc2lvbiA6IDEsXG5cdFx0XHRjb2xvclZlcnNpb246IHR5cGVvZiBvYmplY3QuY29sb3JWZXJzaW9uID09PSAnbnVtYmVyJyA/IG9iamVjdC5jb2xvclZlcnNpb24gOiAxLFxuXHRcdFx0c2VsZWN0aW9uVmVyc2lvbjogdHlwZW9mIG9iamVjdC5zZWxlY3Rpb25WZXJzaW9uID09PSAnbnVtYmVyJyA/IG9iamVjdC5zZWxlY3Rpb25WZXJzaW9uIDogMSxcblx0XHRcdHZpc2libGU6IG9iamVjdC52aXNpYmxlICE9PSBmYWxzZSxcblx0XHRcdGxvY2tlZDogb2JqZWN0LmxvY2tlZCA9PT0gdHJ1ZSxcblx0XHRcdHNlbGVjdGVkOiBvYmplY3Quc2VsZWN0ZWQgPT09IHRydWUsXG5cdFx0XHR0ZXh0OiB0eXBlb2Ygb2JqZWN0LnRleHQgPT09ICdzdHJpbmcnID8gb2JqZWN0LnRleHQuc2xpY2UoMCwgMjAwMCkgOiB1bmRlZmluZWQsXG5cdFx0XHRkZXB0aDogdHlwZW9mIG9iamVjdC5kZXB0aCA9PT0gJ251bWJlcicgPyBvYmplY3QuZGVwdGggOiAwLFxuXHRcdFx0cGFyZW50OiB0eXBlb2Ygb2JqZWN0LnBhcmVudCA9PT0gJ3N0cmluZycgPyBvYmplY3QucGFyZW50IDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hpbGRyZW46IEFycmF5LmlzQXJyYXkob2JqZWN0LmNoaWxkcmVuKSA/IG9iamVjdC5jaGlsZHJlbi5maWx0ZXIoKGNoaWxkKTogY2hpbGQgaXMgc3RyaW5nID0+IHR5cGVvZiBjaGlsZCA9PT0gJ3N0cmluZycpIDogW10sXG5cdFx0XHQuLi4ob2JqZWN0LmNyZWF0aW9uUGFyYW1zICYmIHR5cGVvZiBvYmplY3QuY3JlYXRpb25QYXJhbXMgPT09ICdvYmplY3QnID8geyBjcmVhdGlvblBhcmFtczogeyAuLi5vYmplY3QuY3JlYXRpb25QYXJhbXMgfSB9IDoge30pLFxuXHRcdFx0Li4uKG9iamVjdC5saWdodFByb3BzICYmIHR5cGVvZiBvYmplY3QubGlnaHRQcm9wcyA9PT0gJ29iamVjdCcgPyB7IGxpZ2h0UHJvcHM6IHsgLi4ub2JqZWN0LmxpZ2h0UHJvcHMgfSB9IDoge30pLFxuXHRcdFx0Y2FtZXJhUHJvcHM6IG9iamVjdC5jYW1lcmFQcm9wcyAmJiB0eXBlb2Ygb2JqZWN0LmNhbWVyYVByb3BzID09PSAnb2JqZWN0JyA/IHtcblx0XHRcdFx0Zm92OiB0eXBlb2Ygb2JqZWN0LmNhbWVyYVByb3BzLmZvdiA9PT0gJ251bWJlcicgPyBvYmplY3QuY2FtZXJhUHJvcHMuZm92IDogNTAsXG5cdFx0XHRcdG5lYXI6IHR5cGVvZiAob2JqZWN0LmNhbWVyYVByb3BzIGFzIGFueSkubmVhciA9PT0gJ251bWJlcicgPyAob2JqZWN0LmNhbWVyYVByb3BzIGFzIGFueSkubmVhciA6IDAuMSxcblx0XHRcdFx0ZmFyOiB0eXBlb2YgKG9iamVjdC5jYW1lcmFQcm9wcyBhcyBhbnkpLmZhciA9PT0gJ251bWJlcicgPyAob2JqZWN0LmNhbWVyYVByb3BzIGFzIGFueSkuZmFyIDogMTAwLFxuXHRcdFx0XHRvcnRobzogQm9vbGVhbigob2JqZWN0LmNhbWVyYVByb3BzIGFzIGFueSkub3J0aG8pLFxuXHRcdFx0XHRvcnRob1NjYWxlOiB0eXBlb2YgKG9iamVjdC5jYW1lcmFQcm9wcyBhcyBhbnkpLm9ydGhvU2NhbGUgPT09ICdudW1iZXInID8gKG9iamVjdC5jYW1lcmFQcm9wcyBhcyBhbnkpLm9ydGhvU2NhbGUgOiA0LFxuXHRcdFx0XHR0YXJnZXRJZDogdHlwZW9mIG9iamVjdC5jYW1lcmFQcm9wcy50YXJnZXRJZCA9PT0gJ3N0cmluZycgPyBvYmplY3QuY2FtZXJhUHJvcHMudGFyZ2V0SWQgOiBudWxsLFxuXHRcdFx0XHR0YXJnZXRPZmZzZXQ6IG51bWJlclR1cGxlKG9iamVjdC5jYW1lcmFQcm9wcy50YXJnZXRPZmZzZXQsIFswLCAwLjUsIDBdKSxcblx0XHRcdFx0dHJhY2tpbmdNb2RlOiAoWydub25lJywgJ2xvb2tfYXQnLCAnZm9sbG93JywgJ29yYml0J10uaW5jbHVkZXMoKG9iamVjdC5jYW1lcmFQcm9wcyBhcyBhbnkpLnRyYWNraW5nTW9kZSlcblx0XHRcdFx0XHQ/IChvYmplY3QuY2FtZXJhUHJvcHMgYXMgYW55KS50cmFja2luZ01vZGVcblx0XHRcdFx0XHQ6ICdsb29rX2F0JyksXG5cdFx0XHRcdGZvbGxvd0Rpc3RhbmNlOiB0eXBlb2Ygb2JqZWN0LmNhbWVyYVByb3BzLmZvbGxvd0Rpc3RhbmNlID09PSAnbnVtYmVyJyA/IG9iamVjdC5jYW1lcmFQcm9wcy5mb2xsb3dEaXN0YW5jZSA6IDQuNSxcblx0XHRcdFx0Zm9sbG93SGVpZ2h0OiB0eXBlb2Ygb2JqZWN0LmNhbWVyYVByb3BzLmZvbGxvd0hlaWdodCA9PT0gJ251bWJlcicgPyBvYmplY3QuY2FtZXJhUHJvcHMuZm9sbG93SGVpZ2h0IDogMS44LFxuXHRcdFx0XHRkYW1waW5nOiB0eXBlb2Ygb2JqZWN0LmNhbWVyYVByb3BzLmRhbXBpbmcgPT09ICdudW1iZXInID8gb2JqZWN0LmNhbWVyYVByb3BzLmRhbXBpbmcgOiAwLjEsXG5cdFx0XHRcdGFjdGl2ZTogb2JqZWN0LmNhbWVyYVByb3BzLmFjdGl2ZSAhPT0gZmFsc2UsXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH0pO1xuXHRjb25zdCB0aW1lbGluZSA9IChkYXRhLnRpbWVsaW5lIHx8IHt9KSBhcyBQYXJ0aWFsPFByb2plY3RGaWxlWyd0aW1lbGluZSddPjtcblx0Y29uc3Qga2V5ZnJhbWVzOiBSZWNvcmQ8c3RyaW5nLCBLZXlmcmFtZURhdGFbXT4gPSB7fTtcblx0aWYgKHRpbWVsaW5lLmtleWZyYW1lcyAmJiB0eXBlb2YgdGltZWxpbmUua2V5ZnJhbWVzID09PSAnb2JqZWN0Jykge1xuXHRcdGZvciAoY29uc3QgW29iamVjdElkLCBrZXlzXSBvZiBPYmplY3QuZW50cmllcyh0aW1lbGluZS5rZXlmcmFtZXMpKSB7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoa2V5cykpIGNvbnRpbnVlO1xuXHRcdFx0a2V5ZnJhbWVzW29iamVjdElkXSA9IGtleXNcblx0XHRcdFx0LmZpbHRlcigoa2V5KToga2V5IGlzIEtleWZyYW1lRGF0YSA9PiBCb29sZWFuKGtleSkgJiYgdHlwZW9mIGtleS50aW1lID09PSAnbnVtYmVyJylcblx0XHRcdFx0Lm1hcCgoa2V5KSA9PiAoe1xuXHRcdFx0XHRcdHRpbWU6IE51bWJlci5pc0Zpbml0ZShrZXkudGltZSkgPyBrZXkudGltZSA6IDAsXG5cdFx0XHRcdFx0cG9zaXRpb246IG51bWJlclR1cGxlKGtleS5wb3NpdGlvbiwgWzAsIDAsIDBdKSxcblx0XHRcdFx0XHRyb3RhdGlvbjogbnVtYmVyVHVwbGUoa2V5LnJvdGF0aW9uLCBbMCwgMCwgMF0pLFxuXHRcdFx0XHRcdHNjYWxlOiBudW1iZXJUdXBsZShrZXkuc2NhbGUsIFsxLCAxLCAxXSksXG5cdFx0XHRcdFx0Li4uKHR5cGVvZiBrZXkudmlzaWJsZSA9PT0gJ2Jvb2xlYW4nID8geyB2aXNpYmxlOiBrZXkudmlzaWJsZSB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihrZXkuaW50ZXJwb2xhdGlvbiA9PT0gJ2NvbnN0YW50JyB8fCBrZXkuaW50ZXJwb2xhdGlvbiA9PT0gJ2xpbmVhcicgfHwga2V5LmludGVycG9sYXRpb24gPT09ICdiZXppZXInXG5cdFx0XHRcdFx0XHQ/IHsgaW50ZXJwb2xhdGlvbjoga2V5LmludGVycG9sYXRpb24gfVxuXHRcdFx0XHRcdFx0OiB7fSksXG5cdFx0XHRcdH0pKVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHR9XG5cdH1cblx0Y29uc3QgY3VydmVzOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBCZXpUcmlwbGVbXT4+ID0ge307XG5cdGlmICh0aW1lbGluZS5jdXJ2ZXMgJiYgdHlwZW9mIHRpbWVsaW5lLmN1cnZlcyA9PT0gJ29iamVjdCcpIHtcblx0XHRmb3IgKGNvbnN0IFtvYmplY3RJZCwgY2hhbm5lbHNdIG9mIE9iamVjdC5lbnRyaWVzKHRpbWVsaW5lLmN1cnZlcykpIHtcblx0XHRcdGNvbnN0IHNhbml0aXplZDogUmVjb3JkPHN0cmluZywgQmV6VHJpcGxlW10+ID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IFtwYXRoLCBrZXlzXSBvZiBPYmplY3QuZW50cmllcyhjaGFubmVscyB8fCB7fSkpIHtcblx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGtleXMpKSBjb250aW51ZTtcblx0XHRcdFx0c2FuaXRpemVkW3BhdGhdID0ga2V5c1xuXHRcdFx0XHRcdC5maWx0ZXIoKGtleSk6IGtleSBpcyBCZXpUcmlwbGUgPT4gQm9vbGVhbihrZXkpICYmIHR5cGVvZiBrZXkudGltZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKGtleS50aW1lKSlcblx0XHRcdFx0XHQubWFwKChrZXkpOiBCZXpUcmlwbGUgPT4gKHtcblx0XHRcdFx0XHRcdHRpbWU6IE1hdGgubWluKE1BWF9USU1FTElORV9TRUNPTkRTLCBNYXRoLm1heCgwLCBrZXkudGltZSkpLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHR5cGVvZiBrZXkudmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShrZXkudmFsdWUpID8ga2V5LnZhbHVlIDogMCxcblx0XHRcdFx0XHRcdGludGVycG9sYXRpb246IGtleS5pbnRlcnBvbGF0aW9uID09PSAnY29uc3RhbnQnIHx8IGtleS5pbnRlcnBvbGF0aW9uID09PSAnbGluZWFyJyA/IGtleS5pbnRlcnBvbGF0aW9uIDogJ2JlemllcicsXG5cdFx0XHRcdFx0XHRoYW5kbGVMZWZ0OiBBcnJheS5pc0FycmF5KGtleS5oYW5kbGVMZWZ0KSA/IFtOdW1iZXIoa2V5LmhhbmRsZUxlZnRbMF0pIHx8IDAsIE51bWJlcihrZXkuaGFuZGxlTGVmdFsxXSkgfHwgMF0gOiBbLTEgLyAzLCAwXSxcblx0XHRcdFx0XHRcdGhhbmRsZVJpZ2h0OiBBcnJheS5pc0FycmF5KGtleS5oYW5kbGVSaWdodCkgPyBbTnVtYmVyKGtleS5oYW5kbGVSaWdodFswXSkgfHwgMCwgTnVtYmVyKGtleS5oYW5kbGVSaWdodFsxXSkgfHwgMF0gOiBbMSAvIDMsIDBdLFxuXHRcdFx0XHRcdFx0YXV0b0xlZnQ6IGtleS5hdXRvTGVmdCAhPT0gZmFsc2UsXG5cdFx0XHRcdFx0XHRhdXRvUmlnaHQ6IGtleS5hdXRvUmlnaHQgIT09IGZhbHNlLFxuXHRcdFx0XHRcdH0pKVxuXHRcdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLnRpbWUgLSBiLnRpbWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKE9iamVjdC5rZXlzKHNhbml0aXplZCkubGVuZ3RoKSBjdXJ2ZXNbb2JqZWN0SWRdID0gc2FuaXRpemVkO1xuXHRcdH1cblx0fVxuXHRjb25zdCB0cmFja3M6IFJlY29yZDxzdHJpbmcsIFRyYWNrTWV0YT4gPSB7fTtcblx0aWYgKHRpbWVsaW5lLnRyYWNrcyAmJiB0eXBlb2YgdGltZWxpbmUudHJhY2tzID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh0aW1lbGluZS50cmFja3MpKSB7XG5cdFx0Zm9yIChjb25zdCBbb2JqZWN0SWQsIHJhd10gb2YgT2JqZWN0LmVudHJpZXModGltZWxpbmUudHJhY2tzIGFzIFJlY29yZDxzdHJpbmcsIFBhcnRpYWw8VHJhY2tNZXRhPj4pKSB7XG5cdFx0XHRpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSAnb2JqZWN0JykgY29udGludWU7XG5cdFx0XHR0cmFja3Nbb2JqZWN0SWRdID0ge1xuXHRcdFx0XHRvYmplY3RJZCxcblx0XHRcdFx0bmFtZTogdHlwZW9mIHJhdy5uYW1lID09PSAnc3RyaW5nJyA/IHJhdy5uYW1lIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsb2NrZWQ6IHJhdy5sb2NrZWQgPT09IHRydWUsXG5cdFx0XHRcdGhpZGRlbjogcmF3LmhpZGRlbiA9PT0gdHJ1ZSxcblx0XHRcdFx0bXV0ZWQ6IHJhdy5tdXRlZCA9PT0gdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHN0cmlwczogTmxhU3RyaXBbXSA9IEFycmF5LmlzQXJyYXkodGltZWxpbmUuc3RyaXBzKVxuXHRcdD8gdGltZWxpbmUuc3RyaXBzXG5cdFx0XHRcdC5maWx0ZXIoKHN0cmlwKTogc3RyaXAgaXMgTmxhU3RyaXAgPT4gQm9vbGVhbihzdHJpcCkgJiYgdHlwZW9mIHN0cmlwLmlkID09PSAnc3RyaW5nJylcblx0XHRcdFx0Lm1hcCgoc3RyaXApID0+ICh7XG5cdFx0XHRcdFx0aWQ6IHN0cmlwLmlkLFxuXHRcdFx0XHRcdG9iamVjdElkOiB0eXBlb2Ygc3RyaXAub2JqZWN0SWQgPT09ICdzdHJpbmcnID8gc3RyaXAub2JqZWN0SWQgOiAnJyxcblx0XHRcdFx0XHRuYW1lOiB0eXBlb2Ygc3RyaXAubmFtZSA9PT0gJ3N0cmluZycgPyBzdHJpcC5uYW1lIDogJ1N0cmlwJyxcblx0XHRcdFx0XHRzdGFydDogTWF0aC5taW4oTUFYX1RJTUVMSU5FX1NFQ09ORFMsIE1hdGgubWF4KDAsIE51bWJlcihzdHJpcC5zdGFydCkgfHwgMCkpLFxuXHRcdFx0XHRcdGVuZDogTWF0aC5taW4oTUFYX1RJTUVMSU5FX1NFQ09ORFMsIE1hdGgubWF4KDAsIE51bWJlcihzdHJpcC5lbmQpIHx8IDApKSxcblx0XHRcdFx0XHRhY3Rpb25TdGFydDogTnVtYmVyKHN0cmlwLmFjdGlvblN0YXJ0KSB8fCAwLFxuXHRcdFx0XHRcdGFjdGlvbkVuZDogTnVtYmVyKHN0cmlwLmFjdGlvbkVuZCkgfHwgMCxcblx0XHRcdFx0XHRzcGVlZDogTWF0aC5taW4oMTAsIE1hdGgubWF4KDAuMSwgTnVtYmVyKHN0cmlwLnNwZWVkKSB8fCAxKSksXG5cdFx0XHRcdFx0cmV2ZXJzZWQ6IHN0cmlwLnJldmVyc2VkID09PSB0cnVlLFxuXHRcdFx0XHRcdGZyb3plbjogc3RyaXAuZnJvemVuID09PSB0cnVlLFxuXHRcdFx0XHRcdG11dGVkOiBzdHJpcC5tdXRlZCA9PT0gdHJ1ZSxcblx0XHRcdFx0fSkpXG5cdFx0XHQ6IFtdO1xuXHRjb25zdCBjbGlwczogUmVjb3JkPHN0cmluZywgTGF5ZXJDbGlwPiA9IHt9O1xuXHRpZiAodGltZWxpbmUuY2xpcHMgJiYgdHlwZW9mIHRpbWVsaW5lLmNsaXBzID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh0aW1lbGluZS5jbGlwcykpIHtcblx0XHRmb3IgKGNvbnN0IFtvYmplY3RJZCwgcmF3XSBvZiBPYmplY3QuZW50cmllcyh0aW1lbGluZS5jbGlwcyBhcyBSZWNvcmQ8c3RyaW5nLCBQYXJ0aWFsPExheWVyQ2xpcD4+KSkge1xuXHRcdFx0aWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBOdW1iZXIocmF3LnN0YXJ0KTtcblx0XHRcdGNvbnN0IGVuZCA9IE51bWJlcihyYXcuZW5kKTtcblx0XHRcdGlmICghTnVtYmVyLmlzRmluaXRlKHN0YXJ0KSB8fCAhTnVtYmVyLmlzRmluaXRlKGVuZCkgfHwgZW5kIDw9IHN0YXJ0KSBjb250aW51ZTtcblx0XHRcdGNsaXBzW29iamVjdElkXSA9IHtcblx0XHRcdFx0c3RhcnQ6IE1hdGgubWluKE1BWF9USU1FTElORV9TRUNPTkRTLCBNYXRoLm1heCgwLCBzdGFydCkpLFxuXHRcdFx0XHRlbmQ6IE1hdGgubWluKE1BWF9USU1FTElORV9TRUNPTkRTLCBNYXRoLm1heCgwLCBlbmQpKSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cdGNvbnN0IGZwcyA9IHR5cGVvZiB0aW1lbGluZS5mcmFtZVJhdGUgPT09ICdudW1iZXInID8gTWF0aC5taW4oMTIwLCBNYXRoLm1heCgxLCB0aW1lbGluZS5mcmFtZVJhdGUpKSA6IDMwO1xuXHRjb25zdCBkdXIgPVxuXHRcdHR5cGVvZiB0aW1lbGluZS5kdXJhdGlvbiA9PT0gJ251bWJlcidcblx0XHRcdD8gTWF0aC5taW4oTUFYX1RJTUVMSU5FX1NFQ09ORFMsIE1hdGgubWF4KDAuMSwgdGltZWxpbmUuZHVyYXRpb24pKVxuXHRcdFx0OiBNQVhfVElNRUxJTkVfU0VDT05EUztcblx0Y29uc3Qgc3RhcnRGcmFtZSA9IHR5cGVvZiB0aW1lbGluZS5zdGFydEZyYW1lID09PSAnbnVtYmVyJyA/IE1hdGgubWF4KDAsIE1hdGgucm91bmQodGltZWxpbmUuc3RhcnRGcmFtZSkpIDogMDtcblx0Y29uc3QgZW5kRnJhbWUgPVxuXHRcdHR5cGVvZiB0aW1lbGluZS5lbmRGcmFtZSA9PT0gJ251bWJlcidcblx0XHRcdD8gTWF0aC5tYXgoc3RhcnRGcmFtZSArIDEsIE1hdGgucm91bmQodGltZWxpbmUuZW5kRnJhbWUpKVxuXHRcdFx0OiBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGR1ciAqIGZwcykpO1xuXHRyZXR1cm4ge1xuXHRcdGZvcm1hdDogUFJPSkVDVF9GT1JNQVQsXG5cdFx0dmVyc2lvbjogUFJPSkVDVF9WRVJTSU9OLFxuXHRcdG5hbWU6IHR5cGVvZiBkYXRhLm5hbWUgPT09ICdzdHJpbmcnICYmIGRhdGEubmFtZS50cmltKCkgPyBkYXRhLm5hbWUudHJpbSgpIDogJ1VudGl0bGVkJyxcblx0XHRzYXZlZEF0OiB0eXBlb2YgZGF0YS5zYXZlZEF0ID09PSAnc3RyaW5nJyA/IGRhdGEuc2F2ZWRBdCA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRzY2VuZToge1xuXHRcdFx0b2JqZWN0cyxcblx0XHRcdHNlbGVjdGVkSWQ6IHR5cGVvZiBzY2VuZS5zZWxlY3RlZElkID09PSAnc3RyaW5nJyA/IHNjZW5lLnNlbGVjdGVkSWQgOiBudWxsLFxuXHRcdFx0c2NvcmU6IHR5cGVvZiBzY2VuZS5zY29yZSA9PT0gJ251bWJlcicgPyBzY2VuZS5zY29yZSA6IDAsXG5cdFx0fSxcblx0XHR0aW1lbGluZToge1xuXHRcdFx0ZHVyYXRpb246IGR1cixcblx0XHRcdHN0YXJ0RnJhbWUsXG5cdFx0XHRlbmRGcmFtZSxcblx0XHRcdHNuYXBUb0ZyYW1lczogdGltZWxpbmUuc25hcFRvRnJhbWVzID09PSB0cnVlLFxuXHRcdFx0bG9vcDogdGltZWxpbmUubG9vcCAhPT0gZmFsc2UsXG5cdFx0XHRlYXNpbmc6IHRpbWVsaW5lLmVhc2luZyAhPT0gZmFsc2UsXG5cdFx0XHRmcmFtZVJhdGU6IGZwcyxcblx0XHRcdGtleWZyYW1lcyxcblx0XHRcdGN1cnZlcyxcblx0XHRcdHRyYWNrcyxcblx0XHRcdHN0cmlwcyxcblx0XHRcdGNsaXBzLFxuXHRcdH0sXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseVByb2plY3QocHJvamVjdDogUHJvamVjdEZpbGUpIHtcblx0Y29uc3QgZGF0YSA9IHZhbGlkYXRlUHJvamVjdChwcm9qZWN0KTtcblx0c2NlbmVTdG9yZS5sb2FkKGRhdGEuc2NlbmUub2JqZWN0cywgZGF0YS5zY2VuZS5zZWxlY3RlZElkKTtcblx0c2NlbmVTdG9yZS5zZXRTY29yZShkYXRhLnNjZW5lLnNjb3JlKTtcblx0dGltZWxpbmVTdG9yZS5sb2FkS2V5ZnJhbWVzKGRhdGEudGltZWxpbmUua2V5ZnJhbWVzKTtcblx0aWYgKE9iamVjdC5rZXlzKGRhdGEudGltZWxpbmUuY3VydmVzKS5sZW5ndGgpIHRpbWVsaW5lU3RvcmUubG9hZEN1cnZlcyhkYXRhLnRpbWVsaW5lLmN1cnZlcyk7XG5cdGlmIChkYXRhLnRpbWVsaW5lLnRyYWNrcykgdGltZWxpbmVTdG9yZS5sb2FkVHJhY2tzKGRhdGEudGltZWxpbmUudHJhY2tzKTtcblx0dGltZWxpbmVTdG9yZS5zZXRGcmFtZVJhdGUoZGF0YS50aW1lbGluZS5mcmFtZVJhdGUpO1xuXHR0aW1lbGluZVN0b3JlLnNldER1cmF0aW9uKGRhdGEudGltZWxpbmUuZHVyYXRpb24pO1xuXHRpZiAodHlwZW9mIGRhdGEudGltZWxpbmUuc3RhcnRGcmFtZSA9PT0gJ251bWJlcicpIHRpbWVsaW5lU3RvcmUuc2V0U3RhcnRGcmFtZShkYXRhLnRpbWVsaW5lLnN0YXJ0RnJhbWUpO1xuXHR0aW1lbGluZVN0b3JlLnNldFNuYXBUb0ZyYW1lcyhCb29sZWFuKGRhdGEudGltZWxpbmUuc25hcFRvRnJhbWVzKSk7XG5cdHRpbWVsaW5lU3RvcmUubG9hZFN0cmlwcyhkYXRhLnRpbWVsaW5lLnN0cmlwcyk7XG5cdHRpbWVsaW5lU3RvcmUubG9hZENsaXBzKGRhdGEudGltZWxpbmUuY2xpcHMpO1xuXHR0aW1lbGluZVN0b3JlLnNldExvb3AoZGF0YS50aW1lbGluZS5sb29wKTtcblx0dGltZWxpbmVTdG9yZS5zZXRFYXNpbmcoZGF0YS50aW1lbGluZS5lYXNpbmcpO1xuXHQvLyBFdmFsdWF0ZSBpbml0aWFsIGZyYW1lIHNvIHZpZXdwb3J0IHRyYW5zZm9ybXMgbWF0Y2ggdGhlIGxvYWRlZCBhbmltYXRpb24gYXQgdD0wIC8gc3RhcnRGcmFtZVxuXHRjb25zdCBldmFsdWF0ZWQgPSB0aW1lbGluZVN0b3JlLmV2YWx1YXRlKGdldCh0aW1lbGluZVN0b3JlKS5jdXJyZW50VGltZSwgZGF0YS50aW1lbGluZS5lYXNpbmcpO1xuXHRpZiAoZXZhbHVhdGVkLnNpemUpIHNjZW5lU3RvcmUuYXBwbHlBbmltYXRpb24oZXZhbHVhdGVkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRvd25sb2FkUHJvamVjdChwcm9qZWN0OiBQcm9qZWN0RmlsZSkge1xuXHRjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkocHJvamVjdCwgbnVsbCwgMik7XG5cdGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbanNvbl0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuXHRjb25zdCBhbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdGFuY2hvci5ocmVmID0gdXJsO1xuXHRhbmNob3IuZG93bmxvYWQgPSBgJHtwcm9qZWN0Lm5hbWUucmVwbGFjZSgvW15cXHctXSsvZywgJy0nKS50b0xvd2VyQ2FzZSgpIHx8ICd0b29uLXByb2plY3QnfS50c2YuanNvbmA7XG5cdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYW5jaG9yKTtcblx0YW5jaG9yLmNsaWNrKCk7XG5cdGFuY2hvci5yZW1vdmUoKTtcblx0c2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZFByb2plY3RGaWxlKGZpbGU6IEZpbGUpOiBQcm9taXNlPFByb2plY3RGaWxlPiB7XG5cdGNvbnN0IHRleHQgPSBhd2FpdCBmaWxlLnRleHQoKTtcblx0bGV0IHBhcnNlZDogdW5rbm93bjtcblx0dHJ5IHtcblx0XHRwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQpO1xuXHR9IGNhdGNoIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZSBzZWxlY3RlZCBmaWxlIGlzIG5vdCB2YWxpZCBKU09OLicpO1xuXHR9XG5cdHJldHVybiB2YWxpZGF0ZVByb2plY3QocGFyc2VkKTtcbn1cblxuZnVuY3Rpb24gcmVhZFN0b3JlKCk6IFN0b3JlZFByb2plY3RbXSB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgcmF3ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9LRVkpO1xuXHRcdGlmICghcmF3KSByZXR1cm4gW107XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdHJldHVybiBBcnJheS5pc0FycmF5KHBhcnNlZCkgPyBwYXJzZWQgOiBbXTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHdyaXRlU3RvcmUocHJvamVjdHM6IFN0b3JlZFByb2plY3RbXSkge1xuXHR0cnkge1xuXHRcdGxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShwcm9qZWN0cykpO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBJZ25vcmUgcXVvdGEgb3Igc2FuZGJveCBzdG9yYWdlIGVycm9yc1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaXN0U2F2ZWRQcm9qZWN0cygpOiBTdG9yZWRQcm9qZWN0W10ge1xuXHRyZXR1cm4gcmVhZFN0b3JlKCkuc29ydCgoYSwgYikgPT4gYi5zYXZlZEF0LmxvY2FsZUNvbXBhcmUoYS5zYXZlZEF0KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlVG9Ccm93c2VyKHByb2plY3Q6IFByb2plY3RGaWxlKSB7XG5cdGNvbnN0IHByb2plY3RzID0gcmVhZFN0b3JlKCkuZmlsdGVyKChlbnRyeSkgPT4gZW50cnkubmFtZSAhPT0gcHJvamVjdC5uYW1lKTtcblx0cHJvamVjdHMucHVzaCh7IG5hbWU6IHByb2plY3QubmFtZSwgc2F2ZWRBdDogcHJvamVjdC5zYXZlZEF0LCBwcm9qZWN0IH0pO1xuXHR3cml0ZVN0b3JlKHByb2plY3RzLnNsaWNlKC0yMCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlU2F2ZWRQcm9qZWN0KG5hbWU6IHN0cmluZykge1xuXHR3cml0ZVN0b3JlKHJlYWRTdG9yZSgpLmZpbHRlcigoZW50cnkpID0+IGVudHJ5Lm5hbWUgIT09IG5hbWUpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVBdXRvc2F2ZShwcm9qZWN0OiBQcm9qZWN0RmlsZSkge1xuXHR0cnkge1xuXHRcdGxvY2FsU3RvcmFnZS5zZXRJdGVtKEFVVE9TQVZFX0tFWSwgSlNPTi5zdHJpbmdpZnkocHJvamVjdCkpO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBTdG9yYWdlIGNhbiBiZSB1bmF2YWlsYWJsZSBpbiBwcml2YXRlIGJyb3dzaW5nOyBhdXRvc2F2ZSBpcyBiZXN0LWVmZm9ydC5cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZEF1dG9zYXZlKCk6IFByb2plY3RGaWxlIHwgbnVsbCB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgcmF3ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oQVVUT1NBVkVfS0VZKTtcblx0XHRpZiAoIXJhdykgcmV0dXJuIG51bGw7XG5cdFx0cmV0dXJuIHZhbGlkYXRlUHJvamVjdChKU09OLnBhcnNlKHJhdykpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuIl0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTLEdBQUcsUUFBUSxjQUFjO0FBRWxDLFNBQVMsVUFBVSxRQUFRLGlCQUFpQjtBQUM1QyxTQUFTLFdBQVcsUUFBMEQsUUFBUTtBQUd0RixTQUFTLG9CQUFvQixRQUFRLGVBQWU7QUFDcEQsU0FBUyxhQUFhLFFBQVEsb0JBQW9CO0FBRWxELE9BQU8sTUFBTSxjQUFjLEdBQUcsYUFBYTtBQUMzQyxPQUFPLE1BQU0sZUFBZSxHQUFHLENBQUM7QUFDaEMsTUFBTSxXQUFXLEdBQUcsc0JBQXNCO0FBQzFDLE1BQU0sWUFBWSxHQUFHLHNCQUFzQjtBQWtDM0MsU0FBUyxXQUFXLENBQUMsS0FBYyxFQUFFLFFBQWtDLEVBQTRCO0VBQ2xHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLE9BQU8sUUFBUTtFQUNoRSxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFFLElBQUksSUFBTSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBRSxDQUFDO0VBQ2pHLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN0QztBQUVBLFNBQVMsUUFBUSxDQUFDLEtBQWMsRUFBRSxRQUFnQixFQUFVO0VBQzNELE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLG1CQUFtQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLEdBQUcsUUFBUTtBQUN2RjtBQUVBLFNBQVMsZ0JBQWdCLENBQUMsS0FBYyxFQUFZO0VBQ25ELE1BQU0sR0FBRyxHQUFJLEtBQUssSUFBSSxDQUFDLENBQXVCO0VBQzlDLE9BQU87SUFDTixRQUFRLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDO0lBQzNDLE9BQU8sRUFBRSxPQUFPLEdBQUcsQ0FBQyxPQUFPLEtBQUssUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDcEYsU0FBUyxFQUFFLE9BQU8sR0FBRyxDQUFDLFNBQVMsS0FBSyxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsSUFBSTtJQUM3RixTQUFTLEVBQUUsT0FBTyxHQUFHLENBQUMsU0FBUyxLQUFLLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBRztFQUMxRixDQUFDO0FBQ0Y7QUFFQSxTQUFTLGVBQWUsQ0FBQyxLQUFjLEVBQWU7RUFDckQsTUFBTSxHQUFHLEdBQUksS0FBSyxJQUFJLENBQUMsQ0FBMEI7RUFDakQsT0FBTztJQUNOLE9BQU8sRUFBRSxHQUFHLENBQUMsT0FBTyxLQUFLLElBQUk7SUFDN0IsUUFBUSxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM5QyxXQUFXLEVBQUUsT0FBTyxHQUFHLENBQUMsV0FBVyxLQUFLLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsR0FBRyxJQUFJO0lBQ25HLElBQUksRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRztFQUNwRSxDQUFDO0FBQ0Y7QUFFQSxTQUFTLGFBQWEsQ0FBQyxLQUFjLEVBQWtCO0VBQ3RELElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLE9BQU8sRUFBRTtFQUNwQyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxLQUFLO0lBQ2hDLE1BQU0sSUFBSSxHQUFJLEdBQUcsSUFBSSxDQUFDLENBQWlEO0lBQ3ZFLE9BQU87TUFDTixJQUFJLEVBQUUsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsUUFBUSxLQUFLLEVBQUU7TUFDOUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQztNQUN0QyxRQUFRLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDO01BQzVDLGdCQUFnQixFQUFFLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixLQUFLLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxHQUFHLENBQUM7TUFDakgsU0FBUyxFQUFFLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsSUFBSTtNQUMvRixTQUFTLEVBQUUsT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFLLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxJQUFJO01BQy9GLE9BQU8sRUFBRSxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLENBQUM7TUFDdEYsUUFBUSxFQUFFLE9BQU8sSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQztNQUM1RixJQUFJLE9BQU8sSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLEdBQUc7UUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQztNQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztNQUNuRyxJQUFJLE9BQU8sSUFBSSxDQUFDLGNBQWMsS0FBSyxRQUFRLEdBQUc7UUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQztNQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztNQUNySCxJQUFJLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLEdBQUc7UUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDO01BQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO01BQzVFLElBQUksT0FBTyxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsR0FBRztRQUFFLFFBQVEsRUFBRSxJQUFJLENBQUM7TUFBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7TUFDekUsSUFBSSxPQUFPLElBQUksQ0FBQyxTQUFTLEtBQUssUUFBUSxH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