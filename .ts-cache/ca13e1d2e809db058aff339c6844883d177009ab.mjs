import { writable, derived, get } from 'svelte/store';
import { lookAtEuler, rotateEuler, clamp } from '../lib/math3d';
import { arrayMesh, assignFacesToSlot, bakeMeshVertexColors, buildGroups, cloneMesh, computeRadius, computeVertexNormals, deleteFaces as deleteMeshFaces, extrudeFaces, flipNormals, insetFaces, meshFor, mergeByDistance, smoothMeshVertices, solidifyMesh, subdivide, unwrapMeshUV, bridgeEdgeLoops, mergeVertices, deleteGeometry, dissolveGeometry, duplicateMeshGeometry, separateGeometry, mirrorMesh, decimateMesh, decimateLocal, screwSpinMesh, booleanMesh, joinMeshes, faceCenter, faceNormal } from '../lib/mesh';
import { bisectMesh, classifyFacesByPlane, extrudeRegion, offsetMesh } from '../lib/bisect';
import { presetById, presetToSlot, slotFromImage } from '../lib/materials';
import { aspectPlaneScale, primeLayerTexture, textTextureDataUrl } from '../lib/media';
import { bevelVertices, loopCut } from '../lib/topology';
import { timelineStore } from './timeline';
export const STUDIO_WHITE = '#ffffff';
export const PRIMITIVES = [
// Mesh Primitives (Most used - show first)
{
  type: 'cube',
  label: 'Cube',
  icon: 'cube',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'sphere',
  label: 'UV Sphere',
  icon: 'sphere',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'icosphere',
  label: 'Ico Sphere',
  icon: 'sphere',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'cylinder',
  label: 'Cylinder',
  icon: 'cylinder',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'cone',
  label: 'Cone',
  icon: 'cone',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'torus',
  label: 'Torus',
  icon: 'torus',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'plane',
  label: 'Plane',
  icon: 'plane',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'circle',
  label: 'Circle',
  icon: 'torus',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'grid',
  label: 'Grid',
  icon: 'plane',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'pyramid',
  label: 'Pyramid',
  icon: 'cone',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'tube',
  label: 'Tube',
  icon: 'cylinder',
  color: STUDIO_WHITE,
  category: 'Mesh'
}, {
  type: 'capsule',
  label: 'Capsule',
  icon: 'sphere',
  color: STUDIO_WHITE,
  category: 'Mesh'
},
// Curves
{
  type: 'curve_bezier',
  label: 'Bezier Curve',
  icon: 'curve',
  color: STUDIO_WHITE,
  category: 'Curve'
}, {
  type: 'curve_circle',
  label: 'Bezier Circle',
  icon: 'torus',
  color: STUDIO_WHITE,
  category: 'Curve'
}, {
  type: 'curve_path',
  label: 'Path',
  icon: 'curve',
  color: STUDIO_WHITE,
  category: 'Curve'
}, {
  type: 'curve_nurbs',
  label: 'NURBS Curve',
  icon: 'curve',
  color: STUDIO_WHITE,
  category: 'Curve'
},
// Lights
{
  type: 'light',
  label: 'Point Light',
  icon: 'lamp',
  color: STUDIO_WHITE,
  category: 'Light'
}, {
  type: 'light_sun',
  label: 'Sun Light',
  icon: 'lamp',
  color: STUDIO_WHITE,
  category: 'Light'
}, {
  type: 'light_spot',
  label: 'Spot Light',
  icon: 'lamp',
  color: STUDIO_WHITE,
  category: 'Light'
}, {
  type: 'light_area',
  label: 'Area Light',
  icon: 'lamp',
  color: STUDIO_WHITE,
  category: 'Light'
},
// Cameras
{
  type: 'camera',
  label: 'Perspective',
  icon: 'camera',
  color: STUDIO_WHITE,
  category: 'Camera'
}, {
  type: 'camera_ortho',
  label: 'Orthographic',
  icon: 'camera',
  color: STUDIO_WHITE,
  category: 'Camera'
},
// Empties / Helpers
{
  type: 'empty_axes',
  label: 'Plain Axes',
  icon: 'move',
  color: STUDIO_WHITE,
  category: 'Empty'
}, {
  type: 'empty_arrows',
  label: 'Arrows',
  icon: 'move',
  color: STUDIO_WHITE,
  category: 'Empty'
}, {
  type: 'empty_cube',
  label: 'Cube Empty',
  icon: 'cube',
  color: STUDIO_WHITE,
  category: 'Empty'
}, {
  type: 'empty_sphere',
  label: 'Sphere Empty',
  icon: 'sphere',
  color: STUDIO_WHITE,
  category: 'Empty'
}, {
  type: 'empty_circle',
  label: 'Circle Empty',
  icon: 'torus',
  color: STUDIO_WHITE,
  category: 'Empty'
}, {
  type: 'empty_image',
  label: 'Image Empty',
  icon: 'photo',
  color: STUDIO_WHITE,
  category: 'Empty'
},
// 3D Text
{
  type: 'text_3d',
  label: '3D Text',
  icon: 'text',
  color: STUDIO_WHITE,
  category: 'Text'
},
// Import & Asset Library
{
  type: 'import_device',
  label: 'Device Model',
  icon: 'cube',
  color: STUDIO_WHITE,
  category: 'Import'
}, {
  type: 'import_photo',
  label: 'Reference Image',
  icon: 'photo',
  color: STUDIO_WHITE,
  category: 'Import'
}, {
  type: 'asset_suzanne',
  label: 'Suzanne Monkey',
  icon: 'sphere',
  color: STUDIO_WHITE,
  category: 'Import'
}, {
  type: 'asset_tree',
  label: 'Stylized Tree',
  icon: 'cylinder',
  color: STUDIO_WHITE,
  category: 'Import'
}, {
  type: 'asset_car',
  label: 'Stylized Car',
  icon: 'cube',
  color: STUDIO_WHITE,
  category: 'Import'
}, {
  type: 'asset_character',
  label: 'Character',
  icon: 'bone',
  color: STUDIO_WHITE,
  category: 'Import'
}, {
  type: 'asset_chair',
  label: 'Modern Chair',
  icon: 'cube',
  color: STUDIO_WHITE,
  category: 'Import'
},
// Advanced / More
{
  type: 'bone',
  label: 'Armature Bone',
  icon: 'bone',
  color: STUDIO_WHITE,
  category: 'More'
}, {
  type: 'metaball',
  label: 'Metaball',
  icon: 'sphere',
  color: STUDIO_WHITE,
  category: 'More'
}, {
  type: 'lattice',
  label: 'Lattice Cage',
  icon: 'cube',
  color: STUDIO_WHITE,
  category: 'More'
}, {
  type: 'forcefield',
  label: 'Force Field',
  icon: 'torus',
  color: STUDIO_WHITE,
  category: 'More'
}, {
  type: 'speaker',
  label: 'Audio Speaker',
  icon: 'lamp',
  color: STUDIO_WHITE,
  category: 'More'
}, {
  type: 'coin',
  label: 'Coin Plate',
  icon: 'torus',
  color: STUDIO_WHITE,
  category: 'More'
}];
export function defaultCreationParams(type) {
  switch (type) {
    case 'sphere':
      return {
        segments: 32,
        rings: 16,
        radius: 0.5
      };
    case 'icosphere':
      return {
        subdivisions: 1,
        radius: 0.5
      };
    case 'cylinder':
      return {
        segments: 32,
        radius: 0.5,
        height: 1.0
      };
    case 'cone':
      return {
        segments: 32,
        radius: 0.5,
        height: 1.0
      };
    case 'torus':
      return {
        segments: 32,
        sides: 16,
        radius: 0.35,
        tube: 0.15
      };
    case 'cube':
      return {
        sizeX: 1.0,
        sizeY: 1.0,
        sizeZ: 1.0
      };
    case 'plane':
      return {
        sizeX: 2.4,
        sizeZ: 2.4
      };
    case 'circle':
      return {
        segments: 32,
        radius: 0.5
      };
    case 'grid':
      return {
        subdivX: 4,
        subdivY: 4,
        sizeX: 2.0,
        sizeY: 2.0
      };
    case 'pyramid':
      return {
        sides: 4,
        radius: 0.5,
        height: 1.0
      };
    case 'tube':
      return {
        segments: 24,
        innerRadius: 0.3,
        outerRadius: 0.5,
        height: 1.0
      };
    case 'capsule':
      return {
        segments: 20,
        rings: 6,
        radius: 0.25,
        height: 0.6
      };
    case 'light':
    case 'light_point':
      return {
        intensity: 1.0,
        color: '#ffffff',
        radius: 5.0
      };
    case 'light_sun':
      return {
        intensity: 1.5,
        color: '#fff9e6',
        angle: 45
      };
    case 'light_spot':
      return {
        intensity: 2.0,
        color: '#ffffff',
        spotAngle: 45,
        radius: 8.0
      };
    case 'light_area':
      return {
        intensity: 1.2,
        color: '#ffffff',
        sizeX: 1.0,
        sizeY: 1.0
      };
    case 'camera':
    case 'camera_perspective':
      return {
        fov: 45,
        near: 0.1,
        far: 100
      };
    case 'camera_ortho':
      return {
        orthoScale: 4.0,
        near: 0.1,
        far: 100
      };
    case 'text_3d':
      return {
        text: '3D Text',
        depth: 0.2,
        bevel: 0.02
      };
    default:
      return {};
  }
}
export function iconForType(type) {
  const mediaIcons = {
    text: 'text',
    image: 'photo',
    video: 'video'
  };
  return mediaIcons[type] ?? PRIMITIVES.find(primitive => primitive.type === type)?.icon ?? 'cube';
}
const defaultMaterial = () => ({
  emissive: '#000000',
  opacity: 1,
  metalness: 0.04,
  roughness: 0.36
});
const defaultPhysics = () => ({
  dynamic: false,
  velocity: [0, 0, 0],
  restitution: 0.45
});
const initialState = {
  objects: [],
  selectedId: null,
  gameMode: false,
  score: 0,
  editMode: false,
  elementMode: 'vertex',
  selectedVertices: [],
  selectedEdges: [],
  selectedFaces: [],
  hover: null,
  markedFaces: [],
  markedObjectId: null,
  portionVersion: 0
};
const gameInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  jump: false
};
let idCounter = 1;
const MAX_HISTORY = 80;

/** Cached vertex adjacency per mesh to avoid O(E) rebuilds on every sculpt brush tick. */
const adjacencyCache = new WeakMap();
function meshAdjacency(mesh) {
  let adj = adjacencyCache.get(mesh);
  if (adj) return adj;
  adj = new Map();
  for (const [a, b] of mesh.edges) {
    let la = adj.get(a);
    if (!la) {
      la = [];
      adj.set(a, la);
    }
    la.push(b);
    let lb = adj.get(b);
    if (!lb) {
      lb = [];
      adj.set(b, lb);
    }
    lb.push(a);
  }
  adjacencyCache.set(mesh, adj);
  return adj;
}
let transformSnapshot = null;
let animationSnapshot = null;
function nextId() {
  return `obj-${idCounter++}`;
}
function cloneObject(object) {
  return {
    ...object,
    position: [...object.position],
    rotation: [...object.rotation],
    scale: [...object.scale],
    restPose: object.restPose ? {
      position: [...object.restPose.position],
      rotation: [...object.restPose.rotation],
      scale: [...object.restPose.scale]
    } : undefined,
    children: [...object.children],
    material: {
      ...object.material
    },
    physics: {
      ...object.physics,
      velocity: [...object.physics.velocity],
      home: object.physics.home ? [...object.physics.home] : undefined
    },
    geometry: object.geometry ? cloneMesh(object.geometry) : undefined
  };
}
function cloneObjects(objects) {
  return objects.map(cloneObject);
}
function cloneState(state) {
  return {
    ...state,
    objects: cloneObjects(state.objects),
    selectedVertices: [...state.selectedVertices],
    selectedEdges: [...state.selectedEdges],
    selectedFaces: [...state.selectedFaces],
    hover: state.hover ? {
      ...state.hover
    } : null,
    markedFaces: [...state.markedFaces],
    markedObjectId: state.markedObjectId,
    portionVersion: state.portionVersion
  };
}
function uniqueName(objects, base) {
  const names = new Set(objects.map(object => object.name));
  if (!names.has(base)) return base;
  let index = 1;
  while (names.has(`${base}.${String(index).padStart(3, '0')}`)) index++;
  return `${base}.${String(index).padStart(3, '0')}`;
}
function defaultTransform(type, index) {
  if (type === 'plane') return {
    position: [0, 0.02, 0],
    rotation: [0, 0, 0],
    scale: [2.4, 1, 2.4]
  };
  if (type === 'light') return {
    position: [2.5, 3.5, 2.5],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
  if (type === 'camera') return {
    position: [3.2, 2.2, 4.2],
    rotation: [-0.25, 0.65, 0],
    scale: [1, 1, 1]
  };
  const angle = index * 2.399963;
  const radius = index === 0 ? 0 : 1.25 * Math.sqrt(index);
  return {
    position: [Math.cos(angle) * radius, type === 'coin' ? 0.5 : 0.5, Math.sin(angle) * radius],
    rotation: [0, 0, 0],
    scale: type === 'coin' ? [1.1, 1, 1.1] : [1, 1, 1]
  };
}
function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}
function createSceneStore() {
  const {
    subscribe,
    set,
    update
  } = writable(initialState);
  const past = [];
  const future = [];
  function pushHistory(state) {
    past.push({
      kind: 'scene',
      state: cloneState(state)
    });
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0;
  }
  function trimHistory() {
    if (past.length > MAX_HISTORY) past.length = MAX_HISTORY;
    if (future.length > MAX_HISTORY) future.length = MAX_HISTORY;
  }
  function animationDataKey(snapshot) {
    return JSON.stringify({
      keyframes: snapshot.keyframes,
      curves: snapshot.curves,
      strips: snapshot.strips,
      clips: snapshot.clips,
      duration: snapshot.duration,
      loop: snapshot.loop,
      easing: snapshot.easing,
      frameRate: snapshot.frameRate
    });
  }
  function captureTransforms(state) {
    const out = {};
    for (const object of state.objects) {
      out[object.id] = {
        position: [...object.position],
        rotation: [...object.rotation],
        scale: [...object.scale]
      };
    }
    return out;
  }
  function sameTransform(a, b) {
    if (!a || !b) return a === b;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(a.position[i] - b.position[i]) > 1e-6) return false;
      if (Math.abs(a.rotation[i] - b.rotation[i]) > 1e-6) return false;
      if (Math.abs(a.scale[i] - b.scale[i]) > 1e-6) return false;
    }
    return true;
  }
  function diffTransforms(before, after) {
    const changedBefore = {};
    const changedAfter = {};
    let count = 0;
    for (const id of Object.keys(after)) {
      if (sameTransform(before[id], after[id])) continue;
      changedBefore[id] = before[id];
      changedAfter[id] = after[id];
      count++;
    }
    return count ? {
      before: changedBefore,
      after: changedAfter
    } : null;
  }
  function restoreSnapshot(state, snapshot) {
    state.objects = snapshot.objects;
    state.selectedId = snapshot.selectedId;
    state.editMode = snapshot.editMode;
    state.elementMode = snapshot.elementMode;
    state.selectedVertices = snapshot.selectedVertices;
    state.selectedEdges = snapshot.selectedEdges;
    state.selectedFaces = snapshot.selectedFaces;
    state.markedFaces = snapshot.markedFaces;
    state.markedObjectId = snapshot.markedObjectId;
  }
  function applyTransforms(state, transforms) {
    for (const object of state.objects) {
      const trs = transforms[object.id];
      if (!trs) continue;
      object.position = [...trs.position];
      object.rotation = [...trs.rotation];
      object.scale = [...trs.scale];
    }
  }
  function slotFromObject(object) {
    return {
      name: object.name,
      color: object.color,
      emissive: object.material.emissive,
      emissiveStrength: 1,
      metalness: object.material.metalness,
      roughness: object.material.roughness,
      opacity: object.material.opacity,
      uvRepeat: 1
    };
  }
  function materializeGeometry(object) {
    if (!object.geometry) {
      const base = cloneMesh(meshFor(object.type) ?? meshFor('cube'));
      base.slots = [slotFromObject(object)];
      base.faceSlot = base.faces.map(() => 0);
      base.groups = buildGroups(base);
      object.geometry = base;
    }
    if (!object.geometry.slots.length) object.geometry.slots = [slotFromObject(object)];
    if (object.geometry.faceSlot.length !== object.geometry.faces.length) {
      object.geometry.faceSlot = object.geometry.faces.map((_, index) => object.geometry?.faceSlot[index] ?? 0);
      object.geometry.groups = buildGroups(object.geometry);
    }
    return object.geometry;
  }
  function newObject(state, type, label) {
    return {
      id: nextId(),
      name: uniqueName(state.objects, label),
      type,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      restPose: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
      color: STUDIO_WHITE,
      material: defaultMaterial(),
      geometryVersion: 1,
      colorVersion: 1,
      selectionVersion: 1,
      physics: defaultPhysics(),
      visible: true,
      locked: false,
      selected: true,
      depth: 0,
      children: []
    };
  }
  function refreshObject(id) {
    update(state => {
      const object = state.objects.find(item => item.id === id);
      if (!object) return state;
      object.colorVersion++;
      object.selectionVersion++;
      return state;
    });
  }
  function useTextureSlot(object, dataUrl, width, height) {
    const mesh = materializeGeometry(object);
    mesh.slots[0] = {
      ...mesh.slots[0],
      name: object.name,
      color: '#ffffff',
      metalness: 0,
      roughness: 0.92,
      emissive: '#ffffff',
      emissiveStrength: 0.3,
      imageUrl: dataUrl,
      uvRepeat: 1
    };
    object.scale = aspectPlaneScale(width, height);
    object.restPose = {
      position: [...object.position],
      rotation: [...object.rotation],
      scale: [...object.scale]
    };
    primeLayerTexture(dataUrl, () => refreshObject(object.id));
  }
  return {
    subscribe,
    set,
    addPrimitive: (type, position, params) => update(state => {
      pushHistory(state);
      const definition = PRIMITIVES.find(p => p.type === type);
      const id = nextId();
      const transform = defaultTransform(type, state.objects.length);
      const pos = position ? [...position] : transform.position;
      const initParams = params ? {
        ...params
      } : defaultCreationParams(type);
      const initialMesh = meshFor(type, initParams);
      const object = {
        id,
        name: uniqueName(state.objects, definition?.label || type),
        type,
        position: [...pos],
        rotation: [...transform.rotation],
        scale: [...transform.scale],
        restPose: {
          position: [...pos],
          rotation: [...transform.rotation],
          scale: [...transform.scale]
        },
        color: STUDIO_WHITE,
        material: defaultMaterial(),
        geometry: initialMesh ? cloneMesh(initialMesh) : undefined,
        geometryVersion: 1,
        colorVersion: 1,
        selectionVersion: 1,
        physics: defaultPhysics(),
        visible: true,
        locked: false,
        selected: true,
        depth: 0,
        children: [],
        creationParams: initParams
      };
      if (type === 'light' || type.startsWith('light_')) {
        object.lightProps = {
          type: type.replace('light_', '') || 'point',
          intensity: initParams.intensity ?? 1.0,
          color: initParams.color ?? '#ffffff',
          distance: initParams.radius ?? 10,
          angle: initParams.spotAngle ? initParams.spotAngle * Math.PI / 180 : Math.PI / 4
        };
      }
      if (type === 'camera' || type.startsWith('camera_')) {
        object.cameraProps = {
          fov: initParams.fov ?? 45,
          near: initParams.near ?? 0.1,
          far: initParams.far ?? 100,
          ortho: type === 'camera_ortho',
          orthoScale: initParams.orthoScale ?? 4.0,
          trackingMode: 'none',
          trackingTargetId: null
        };
      }
      state.objects.forEach(item => item.selected = false);
      state.objects.push(object);
      state.selectedId = id;
      state.editMode = false;
      state.selectedVertices = [];
      state.selectedEdges = [];
      state.selectedFaces = [];
      return state;
    }),
    recreateLastObject: (_id, params) => sceneStore.updateCreationParams(params),
    mutateRig: (fn, record = true) => update(state => {
      if (record) pushHistory(state);
      fn(state);
      return state;
    }),
    updateCreationParams: params => update(state => {
      const obj = state.objects.find(o => o.id === state.selectedId);
      if (!obj) return state;
      pushHistory(state);
      obj.creationParams = {
        ...(obj.creationParams || defaultCreationParams(obj.type)),
        ...params
      };
      const newMesh = meshFor(obj.type, obj.creationParams);
      if (newMesh) {
        obj.geometry = cloneMesh(newMesh);
        obj.geometryVersion = (obj.geometryVersion || 1) + 1;
      }
      if (obj.lightProps) {
        if (params.intensity !== undefined) obj.lightProps.intensity = params.intensity;
        if (params.color !== undefined) obj.lightProps.color = params.color;
      }
      if (obj.cameraProps) {
        if (params.fov !== undefined) obj.cameraProps.fov = params.fov;
        if (params.orthoScale !== undefined) obj.cameraProps.orthoScale = params.orthoScale;
      }
      return state;
    }),
    /** Imports a custom 3D mesh (.OBJ / .STL) into the scene. */
    importMeshObject: (name, mesh) => update(state => {
      pushHistory(state);
      const clean = name.replace(/\.[^.]+$/, '').trim() || 'Imported_Mesh';
      const object = newObject(state, 'cube', clean);
      object.position = [0, 0.5, 0];
      object.restPose = {
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      };
      const copy = cloneMesh(mesh);
      if (!copy.slots.length) copy.slots = [slotFromObject(object)];
      copy.faceSlot = copy.faces.map((_, idx) => copy.faceSlot[idx] ?? 0);
      copy.groups = buildGroups(copy);
      object.geometry = copy;
      state.objects.forEach(item => item.selected = false);
      state.objects.push(object);
      state.selectedId = object.id;
      state.editMode = false;
      return state;
    }),
    addTextLayer: text => update(state => {
      pushHistory(state);
      const caption = text.replace(/\s+/g, ' ').trim() || 'Text';
      const object = newObject(state, 'text', caption.slice(0, 24));
      object.text = caption;
      object.position = [0, 1.45, 0.6];
      object.rotation = [Math.PI / 2, 0, 0];
      object.material = {
        ...defaultMaterial(),
        metalness: 0,
        roughness: 0.9
      };
      const url = textTextureDataUrl(caption);
      if (url) useTextureSlot(object, url, 1024, 512);else {
        materializeGeometry(object);
        object.scale = [2.4, 1.2, 1];
        object.restPose = {
          position: [...object.position],
          rotation: [...object.rotation],
          scale: [...object.scale]
        };
      }
      state.objects.forEach(item => item.selected = false);
      state.objects.push(object);
      state.selectedId = object.id;
      state.editMode = false;
      return state;
    }),
    addImageLayer: (dataUrl, width, height, name = 'Image') => update(state => {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return state;
      pushHistory(state);
      const label = name.replace(/\.[^.]+$/, '').trim() || 'Image';
      const object = newObject(state, 'image', label);
      object.position = [0, 1.45, 0.6];
      object.rotation = [Math.PI / 2, 0, 0];
      object.material = {
        ...defaultMaterial(),
        metalness: 0,
        roughness: 0.8
      };
      useTextureSlot(object, dataUrl, width, height);
      state.objects.forEach(item => item.selected = false);
      state.objects.push(object);
      state.selectedId = object.id;
      state.editMode = false;
      return state;
    }),
    setTextContent: (id, text) => update(state => {
      const object = state.objects.find(item => item.id === id);
      if (!object || object.type !== 'text') return state;
      const caption = text.replace(/\s+/g, ' ').trim() || 'Text';
      if (caption === object.text) return state;
      pushHistory(state);
      object.text = caption;
      object.name = uniqueName(state.objects.filter(item => item.id !== id), caption.slice(0, 24));
      const url = textTextureDataUrl(caption);
      if (url) {
        const mesh = materializeGeometry(object);
        mesh.slots[0] = {
          ...mesh.slots[0],
          color: '#ffffff',
          imageUrl: url
        };
        primeLayerTexture(url, () => refreshObject(id));
      }
      object.colorVersion++;
      return state;
    }),
    /** Moves a layer up (-1) or down (+1) in the scene object/timeline layer stack. */
    reorderObject: (id, delta) => update(state => {
      const idx = state.objects.findIndex(o => o.id === id);
      if (idx < 0) return state;
      const target = Math.max(0, Math.min(state.objects.length - 1, idx + delta));
      if (target === idx) return state;
      pushHistory(state);
      const [item] = state.objects.splice(idx, 1);
      state.objects.splice(target, 0, item);
      return state;
    }),
    /**
     * Smart keyframe recorder for the UI '+ Key' button:
     * - If adding the very first keyframe at t > 0, automatically anchors the object's
     *   initial restPose at t = 0 so pressing Play immediately animates from 0s to t.
     * - If clicking '+ Key' at t = 0 when a key at t = 0 already exists and the object
     *   has been moved, automatically places the new key at t + 1.5s so an animation is created.
     */
    recordKeyframe: (id, explicitTime) => {
      const state = get(sceneStore);
      const object = state.objects.find(o => o.id === id);
      if (!object) return 0;
      const tl = get(timelineStore);
      let targetTime = explicitTime ?? tl.currentTime;
      const existingKeys = tl.keyframes.get(id) ?? [];
      const currentPose = {
        position: [...object.position],
        rotation: [...object.rotation],
        scale: [...object.scale]
      };
      const restPose = object.restPose ?? currentPose;
      animationSnapshot = timelineStore.snapshotAnimation();
      if (existingKeys.length === 0 && targetTime > 0.02) {
        // Anchor t = 0 with restPose so 0s -> targetTime animates immediately
        timelineStore.addKeyframe(id, {
          time: 0,
          position: [...restPose.position],
          rotation: [...restPose.rotation],
          scale: [...restPose.scale]
        });
        timelineStore.addKeyframe(id, {
          time: targetTime,
          position: [...currentPose.position],
          rotation: [...currentPose.rotation],
          scale: [...currentPose.scale]
        });
      } else if (existingKeys.length === 1 && Math.abs(existingKeys[0].time - targetTime) < 0.02 && !sameTransform(existingKeys[0], currentPose)) {
        // User moved object without moving playhead first: advance playhead by 1.5s and key there
        targetTime = Math.min(tl.duration, existingKeys[0].time + 1.5);
        timelineStore.setTime(targetTime);
        timelineStore.addKeyframe(id, {
          time: targetTime,
          position: [...currentPose.position],
          rotation: [...currentPose.rotation],
          scale: [...currentPose.scale]
        });
      } else {
        timelineStore.addKeyframe(id, {
          time: targetTime,
          position: [...currentPose.position],
          rotation: [...currentPose.rotation],
          scale: [...currentPose.scale]
        });
        if (existingKeys.length === 0 && targetTime <= 0.02) {
          object.restPose = {
            position: [...currentPose.position],
            rotation: [...currentPose.rotation],
            scale: [...currentPose.scale]
          };
        }
      }
      const before = animationSnapshot;
      animationSnapshot = null;
      if (before) {
        const after = timelineStore.snapshotAnimation();
        if (animationDataKey(before) !== animationDataKey(after)) {
          past.push({
            kind: 'animation',
            before,
            after
          });
          trimHistory();
          future.length = 0;
        }
      }
      return targetTime;
    },
    refreshObject: id => refreshObject(id),
    addObject: object => update(state => {
      pushHistory(state);
      state.objects.push(cloneObject(object));
      return state;
    }),
    removeObject: id => update(state => {
      pushHistory(state);
      state.objects = state.objects.filter(o => o.id !== id);
      if (state.selectedId === id) state.selectedId = null;
      return state;
    }),
    selectObject: (id, additive = false) => update(state => {
      if (state.selectedId !== id) {
        state.selectedVertices = [];
        state.selectedEdges = [];
        state.selectedFaces = [];
        state.hover = null;
      }
      if (additive && id) {
        const object = state.objects.find(item => item.id === id);
        if (!object || object.locked) return state;
        object.selected = !object.selected;
        if (object.selected) state.selectedId = id;else if (state.selectedId === id) {
          state.selectedId = [...state.objects].reverse().find(item => item.selected)?.id ?? null;
        }
      } else {
        state.selectedId = id;
        state.objects.forEach(object => object.selected = object.id === id);
      }
      for (const object of state.objects) object.selectionVersion++;
      return state;
    }),
    selectAll: () => update(state => {
      let last = null;
      for (const object of state.objects) {
        if (object.locked) continue;
        object.selected = true;
        last = object.id;
        object.selectionVersion++;
      }
      state.selectedId = last ?? state.selectedId;
      return state;
    }),
    setTransforms: entries => update(state => {
      for (const entry of entries) {
        const object = state.objects.find(item => item.id === entry.id);
        if (!object) continue;
        if (entry.position) object.position = [...entry.position];
        if (entry.rotation) object.rotation = [...entry.rotation];
        if (entry.scale) object.scale = [...entry.scale];
      }
      return state;
    }),
    toggleVisibility: id => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object) return state;
      object.visible = !object.visible;
      timelineStore.setTrackMeta(id, {
        hidden: !object.visible
      });
      const tl = get(timelineStore);
      const hasVisCurve = Boolean(tl.curves.get(id)?.get('visible')?.keys.length);
      if (tl.autoKey && (hasVisCurve || (tl.keyframes.get(id)?.length ?? 0) > 0)) {
        timelineStore.setVisibilityKeyframe(id, tl.currentTime, object.visible, {
          position: [...object.position],
          rotation: [...object.rotation],
          scale: [...object.scale]
        });
      }
      return state;
    }),
    toggleLock: id => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object) return state;
      object.locked = !object.locked;
      timelineStore.setTrackMeta(id, {
        locked: object.locked
      });
      if (object.locked && state.selectedId === id) {
        object.selected = false;
        state.selectedId = null;
      }
      return state;
    }),
    deleteObject: id => update(state => {
      pushHistory(state);
      state.objects = state.objects.filter(o => o.id !== id);
      for (const obj of state.objects) {
        if (obj.parent === id) delete obj.parent;
        if (obj.children.includes(id)) obj.children = obj.children.filter(cid => cid !== id);
        if (obj.cameraProps?.targetId === id) obj.cameraProps.targetId = null;
      }
      if (state.selectedId === id) state.selectedId = null;
      return state;
    }),
    deleteSelected: () => update(state => {
      const doomed = new Set(state.objects.filter(o => o.selected && !o.locked).map(o => o.id));
      if (state.selectedId && !doomed.size) doomed.add(state.selectedId);
      if (!doomed.size) return state;
      pushHistory(state);
      state.objects = state.objects.filter(o => !doomed.has(o.id));
      for (const obj of state.objects) {
        if (obj.parent && doomed.has(obj.parent)) delete obj.parent;
        if (obj.children.length) obj.children = obj.children.filter(cid => !doomed.has(cid));
        if (obj.cameraProps?.targetId && doomed.has(obj.cameraProps.targetId)) obj.cameraProps.targetId = null;
      }
      state.selectedId = null;
      state.editMode = false;
      return state;
    }),
    renameObject: (id, name) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object) return state;
      const clean = name.trim().slice(0, 60);
      if (!clean || clean === object.name) return state;
      pushHistory(state);
      object.name = clean;
      timelineStore.setTrackMeta(id, {
        name: clean
      });
      return state;
    }),
    duplicateObject: id => update(state => {
      const source = state.objects.find(o => o.id === id);
      if (!source) return state;
      pushHistory(state);
      const copy = cloneObject(source);
      copy.id = nextId();
      copy.name = uniqueName(state.objects, source.name);
      copy.position = [source.position[0] + 0.35, source.position[1], source.position[2] + 0.35];
      copy.selected = false;
      state.objects.forEach(o => o.selected = false);
      state.objects.push(copy);
      state.selectedId = copy.id;
      return state;
    }),
    duplicateSelected: () => update(state => {
      const sources = state.objects.filter(o => o.selected);
      if (!sources.length) {
        const active = state.objects.find(o => o.id === state.selectedId);
        if (active) sources.push(active);
      }
      if (!sources.length) return state;
      pushHistory(state);
      state.objects.forEach(o => o.selected = false);
      let last = null;
      for (const source of sources) {
        const copy = cloneObject(source);
        copy.id = nextId();
        copy.name = uniqueName(state.objects, source.name);
        copy.position = [source.position[0] + 0.7, source.position[1], source.position[2] + 0.7];
        copy.selected = true;
        state.objects.push(copy);
        last = copy.id;
      }
      state.selectedId = last;
      return state;
    }),
    mirrorSelected: (axis = 'x') => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object) return state;
      pushHistory(state);
      const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      object.scale[index] *= -1;
      return state;
    }),
    setColor: (id, color) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object) return state;
      pushHistory(state);
      object.color = color;
      const slots = object.geometry?.slots;
      if (slots?.length) {
        object.geometry = {
          ...object.geometry,
          slots: slots.map((slot, index) => index === 0 ? {
            ...slot,
            color
          } : slot)
        };
        object.colorVersion++;
      }
      return state;
    }),
    setMaterial: (id, patch) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object) return state;
      pushHistory(state);
      object.material = {
        ...object.material,
        ...patch
      };
      const slots = object.geometry?.slots;
      if (slots?.length) {
        object.geometry = {
          ...object.geometry,
          slots: slots.map((slot, index) => index === 0 ? {
            ...slot,
            emissive: patch.emissive ?? slot.emissive,
            opacity: patch.opacity ?? slot.opacity,
            metalness: patch.metalness ?? slot.metalness,
            roughness: patch.roughness ?? slot.roughness
          } : slot)
        };
        object.colorVersion++;
      }
      return state;
    }),
    paintObject: (id, color) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object) return state;
      pushHistory(state);
      object.color = color;
      return state;
    }),
    setTransform: (id, patch) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object) return state;
      if (patch.position) object.position = [...patch.position];
      if (patch.rotation) object.rotation = [...patch.rotation];
      if (patch.scale) object.scale = [...patch.scale];
      return state;
    }),
    setPhysics: (id, patch) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object) return state;
      pushHistory(state);
      object.physics = {
        ...object.physics,
        ...patch
      };
      if (object.physics.dynamic && !object.physics.home) object.physics.home = [...object.position];
      if (patch.dynamic === false) object.physics.velocity = [0, 0, 0];
      return state;
    }),
    stepPhysics: (dt, gravity = 9.8) => update(state => {
      const dyn = [];
      for (const object of state.objects) {
        if (!object.physics.dynamic || object.type === 'light' || object.type === 'camera') continue;
        dyn.push(object);
        const halfHeight = Math.max(0.1, (object.geometry?.radius ?? meshFor(object.type)?.radius ?? 0.5) * Math.abs(object.scale[1]));
        const velocity = object.physics.velocity;
        velocity[1] -= gravity * dt;
        const position = [...object.position];
        position[0] += velocity[0] * dt;
        position[1] += velocity[1] * dt;
        position[2] += velocity[2] * dt;
        if (position[1] <= halfHeight) {
          position[1] = halfHeight;
          velocity[1] = -velocity[1] * object.physics.restitution;
          velocity[0] *= 0.86;
          velocity[2] *= 0.86;
          if (Math.abs(velocity[1]) < 0.35) velocity[1] = 0;
        }
        object.position = position;
      }
      // Object-to-object elastic sphere collisions
      for (let i = 0; i < dyn.length; i++) {
        for (let j = i + 1; j < dyn.length; j++) {
          const a = dyn[i];
          const b = dyn[j];
          const ra = Math.max(0.2, (a.geometry?.radius ?? 0.5) * Math.max(Math.abs(a.scale[0]), Math.abs(a.scale[2])) * 0.75);
          const rb = Math.max(0.2, (b.geometry?.radius ?? 0.5) * Math.max(Math.abs(b.scale[0]), Math.abs(b.scale[2])) * 0.75);
          const dx = b.position[0] - a.position[0];
          const dy = b.position[1] - a.position[1];
          const dz = b.position[2] - a.position[2];
          const dist = Math.hypot(dx, dy, dz);
          const minDist = ra + rb;
          if (dist > 1e-5 && dist < minDist) {
            const nx = dx / dist,
              ny = dy / dist,
              nz = dz / dist;
            const overlap = (minDist - dist) * 0.5;
            a.position = [a.position[0] - nx * overlap, a.position[1] - ny * overlap, a.position[2] - nz * overlap];
            b.position = [b.position[0] + nx * overlap, b.position[1] + ny * overlap, b.position[2] + nz * overlap];
            const rvx = b.physics.velocity[0] - a.physics.velocity[0];
            const rvy = b.physics.velocity[1] - a.physics.velocity[1];
            const rvz = b.physics.velocity[2] - a.physics.velocity[2];
            const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;
            if (velAlongNormal < 0) {
              const e = Math.min(a.physics.restitution, b.physics.restitution);
              const jImp = -(1 + e) * velAlongNormal * 0.5;
              a.physics.velocity[0] -= jImp * nx;
              a.physics.velocity[1] -= jImp * ny;
              a.physics.velocity[2] -= jImp * nz;
              b.physics.velocity[0] += jImp * nx;
              b.physics.velocity[1] += jImp * ny;
              b.physics.velocity[2] += jImp * nz;
            }
          }
        }
      }
      return state;
    }),
    resetPhysics: () => update(state => {
      pushHistory(state);
      for (const object of state.objects) {
        if (!object.physics.dynamic) continue;
        object.physics.velocity = [0, 0, 0];
        if (object.physics.home) object.position = [...object.physics.home];
      }
      return state;
    }),
    /** Simulates physics and bakes the resulting trajectory into real timeline keyframes. */
    bakePhysicsToKeyframes: (duration = 3, fps = 15, gravity = 9.8) => {
      const state = get(sceneStore);
      const dynamicObjects = state.objects.filter(o => o.physics.dynamic && o.type !== 'light' && o.type !== 'camera');
      if (!dynamicObjects.length) return 0;
      const beforeAnim = timelineStore.snapshotAnimation();
      const sim = dynamicObjects.map(o => ({
        id: o.id,
        pos: [...o.position],
        rot: [...o.rotation],
        scl: [...o.scale],
        vel: [...o.physics.velocity],
        rest: o.physics.restitution,
        halfH: Math.max(0.1, (o.geometry?.radius ?? meshFor(o.type)?.radius ?? 0.5) * Math.abs(o.scale[1]))
      }));
      const dt = 1 / fps;
      const steps = Math.max(2, Math.round(duration * fps));
      timelineStore.setDuration(Math.max(duration, get(timelineStore).duration));
      for (let step = 0; step <= steps; step++) {
        const t = step * dt;
        for (const item of sim) {
          timelineStore.addKeyframe(item.id, {
            time: t,
            position: [...item.pos],
            rotation: [...item.rot],
            scale: [...item.scl]
          });
          item.vel[1] -= gravity * dt;
          item.pos[0] += item.vel[0] * dt;
          item.pos[1] += item.vel[1] * dt;
          item.pos[2] += item.vel[2] * dt;
          if (item.pos[1] <= item.halfH) {
            item.pos[1] = item.halfH;
            item.vel[1] = -item.vel[1] * item.rest;
            item.vel[0] *= 0.86;
            item.vel[2] *= 0.86;
            if (Math.abs(item.vel[1]) < 0.25) item.vel[1] = 0;
          }
        }
      }
      const afterAnim = timelineStore.snapshotAnimation();
      if (animationDataKey(beforeAnim) !== animationDataKey(afterAnim)) {
        past.push({
          kind: 'animation',
          before: beforeAnim,
          after: afterAnim
        });
        trimHistory();
        future.length = 0;
      }
      return dynamicObjects.length;
    },
    /** Adds a connected Bone chain for rigging. */
    addBoneChain: (countOrPos = 3, maybeCount) => update(state => {
      pushHistory(state);
      state.objects.forEach(o => o.selected = false);
      let parentId;
      let lastId = null;
      const count = typeof countOrPos === 'number' ? countOrPos : typeof maybeCount === 'number' ? maybeCount : 3;
      for (let i = 0; i < count; i++) {
        const obj = newObject(state, 'bone', `Bone.${String(i + 1).padStart(2, '0')}`);
        obj.position = [0, 0.3 + i * 0.45, 0];
        obj.restPose = {
          position: [...obj.position],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        };
        obj.depth = i;
        obj.parent = parentId;
        obj.selected = i === count - 1;
        if (parentId) {
          const p = state.objects.find(o => o.id === parentId);
          if (p) p.children.push(obj.id);
        }
        state.objects.push(obj);
        parentId = obj.id;
        lastId = obj.id;
      }
      state.selectedId = lastId;
      return state;
    }),
    // ---- Animation history ----------------------------------------------

    beginAnimationEdit: () => {
      animationSnapshot = timelineStore.snapshotAnimation();
    },
    endAnimationEdit: () => {
      const before = animationSnapshot;
      animationSnapshot = null;
      if (!before) return;
      const after = timelineStore.snapshotAnimation();
      if (animationDataKey(before) === animationDataKey(after)) return;
      past.push({
        kind: 'animation',
        before,
        after
      });
      trimHistory();
      future.length = 0;
    },
    animationEdit: mutate => {
      animationSnapshot = timelineStore.snapshotAnimation();
      mutate();
      const before = animationSnapshot;
      animationSnapshot = null;
      if (!before) return;
      const after = timelineStore.snapshotAnimation();
      if (animationDataKey(before) === animationDataKey(after)) return;
      past.push({
        kind: 'animation',
        before,
        after
      });
      trimHistory();
      future.length = 0;
    },
    beginTransform: (mode = 'transform') => {
      const state = get(sceneStore);
      const object = state.objects.find(item => item.id === state.selectedId) ?? null;
      const mesh = mode === 'geometry' && object ? materializeGeometry(object) : null;
      transformSnapshot = {
        mode,
        objectId: object?.id ?? null,
        transforms: captureTransforms(state),
        vertices: mesh ? Float32Array.from(mesh.vertices.flat()) : null
      };
    },
    endTransform: () => {
      const start = transformSnapshot;
      if (!start) return;
      transformSnapshot = null;
      const state = get(sceneStore);
      const after = captureTransforms(state);
      const moved = diffTransforms(start.transforms, after);
      if (start.mode === 'geometry' && start.objectId && start.vertices) {
        const object = state.objects.find(item => item.id === start.objectId);
        if (!object) return;
        const mesh = object.geometry;
        if (!mesh) return;
        const before = start.vertices;
        const indices = [];
        const beforeValues = [];
        const afterValues = [];
        const count = Math.min(mesh.vertices.length, before.length / 3);
        for (let i = 0; i < count; i++) {
          const x = mesh.vertices[i][0];
          const y = mesh.vertices[i][1];
          const z = mesh.vertices[i][2];
          if (x === before[i * 3] && y === before[i * 3 + 1] && z === before[i * 3 + 2]) continue;
          indices.push(i);
          beforeValues.push(before[i * 3], before[i * 3 + 1], before[i * 3 + 2]);
          afterValues.push(x, y, z);
        }
        if (!indices.length) return;
        object.geometryVersion++;
        past.push({
          kind: 'mesh',
          objectId: start.objectId,
          indices,
          before: beforeValues,
          after: afterValues,
          transforms: moved
        });
        trimHistory();
        future.length = 0;
        return;
      }
      if (!moved) return;
      const animBefore = timelineStore.snapshotAnimation();
      // Update restPose or Auto-Key when timeline is active or object already has keyframes
      const tl = get(timelineStore);
      for (const id of Object.keys(moved.after)) {
        const obj = state.objects.find(o => o.id === id);
        const keys = tl.keyframes.get(id) ?? [];
        const beforePose = moved.before[id];
        const afterPose = moved.after[id];
        if (obj && keys.length === 0 && tl.currentTime <= 0.02) {
          obj.restPose = {
            position: [...afterPose.position],
            rotation: [...afterPose.rotation],
            scale: [...afterPose.scale]
          };
        }
        if (tl.autoKey && (tl.show || keys.length > 0)) {
          if (keys.length === 0 && tl.currentTime > 0.02) {
            const startPose = obj?.restPose ?? beforePose;
            timelineStore.addKeyframe(id, {
              time: 0,
              position: [...startPose.position],
              rotation: [...startPose.rotation],
              scale: [...startPose.scale]
            });
            timelineStore.addKeyframe(id, {
              time: tl.currentTime,
              position: [...afterPose.position],
              rotation: [...afterPose.rotation],
              scale: [...afterPose.scale]
            });
          } else {
            timelineStore.addKeyframe(id, {
              time: tl.currentTime,
              position: [...afterPose.position],
              rotation: [...afterPose.rotation],
              scale: [...afterPose.scale]
            });
          }
        }
      }
      const animAfter = timelineStore.snapshotAnimation();
      const hasAnimChange = animationDataKey(animBefore) !== animationDataKey(animAfter);
      past.push({
        kind: 'transform',
        before: moved.before,
        after: moved.after,
        ...(hasAnimChange ? {
          animBefore,
          animAfter
        } : {})
      });
      trimHistory();
      future.length = 0;
    },
    setTimelineHidden: ids => {
      const current = get(sceneStore);
      let changed = false;
      for (const object of current.objects) {
        if (Boolean(object.timelineHidden) !== ids.has(object.id)) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      update(state => {
        for (const object of state.objects) {
          object.timelineHidden = ids.has(object.id);
        }
        return state;
      });
    },
    applyAnimation: transforms => update(state => {
      for (const object of state.objects) {
        const transform = transforms.get(object.id);
        if (!transform) continue;
        if (transform.position) {
          object.position[0] = transform.position[0];
          object.position[1] = transform.position[1];
          object.position[2] = transform.position[2];
        }
        if (transform.rotation) {
          object.rotation[0] = transform.rotation[0];
          object.rotation[1] = transform.rotation[1];
          object.rotation[2] = transform.rotation[2];
        }
        if (transform.scale) {
          object.scale[0] = transform.scale[0];
          object.scale[1] = transform.scale[1];
          object.scale[2] = transform.scale[2];
        }
        if (transform.visible !== undefined) {
          object.visible = transform.visible;
        }
      }
      return state;
    }),
    undo: () => {
      const animation = past[past.length - 1];
      if (animation?.kind === 'animation') {
        past.pop();
        timelineStore.restoreAnimation(animation.before);
        future.push(animation);
        return;
      }
      update(state => {
        const previous = past.pop();
        if (!previous) return state;
        if (previous.kind === 'scene') {
          future.push({
            kind: 'scene',
            state: cloneState(state)
          });
          restoreSnapshot(state, previous.state);
          return state;
        }
        if (previous.kind === 'transform') {
          applyTransforms(state, previous.before);
          if (previous.animBefore) timelineStore.restoreAnimation(previous.animBefore);
          future.push(previous);
          return state;
        }
        if (previous.kind === 'animation') return state;
        const object = state.objects.find(item => item.id === previous.objectId);
        if (!object?.geometry) return state;
        const mesh = object.geometry;
        for (let i = 0; i < previous.indices.length; i++) {
          const vertex = mesh.vertices[previous.indices[i]];
          if (!vertex) continue;
          vertex[0] = previous.before[i * 3];
          vertex[1] = previous.before[i * 3 + 1];
          vertex[2] = previous.before[i * 3 + 2];
        }
        mesh.radius = computeRadius(mesh.vertices);
        mesh.normals = undefined;
        if (previous.transforms) applyTransforms(state, previous.transforms.before);
        object.geometryVersion++;
        future.push(previous);
        return state;
      });
    },
    redo: () => {
      const animation = future[future.length - 1];
      if (animation?.kind === 'animation') {
        future.pop();
        timelineStore.restoreAnimation(animation.after);
        past.push(animation);
        return;
      }
      update(state => {
        const next = future.pop();
        if (!next) return state;
        if (next.kind === 'scene') {
          past.push({
            kind: 'scene',
            state: cloneState(state)
          });
          restoreSnapshot(state, next.state);
          return state;
        }
        if (next.kind === 'transform') {
          applyTransforms(state, next.after);
          if (next.animAfter) timelineStore.restoreAnimation(next.animAfter);
          past.push(next);
          return state;
        }
        if (next.kind === 'animation') return state;
        const object = state.objects.find(item => item.id === next.objectId);
        if (!object?.geometry) return state;
        const mesh = object.geometry;
        for (let i = 0; i < next.indices.length; i++) {
          const vertex = mesh.vertices[next.indices[i]];
          if (!vertex) continue;
          vertex[0] = next.after[i * 3];
          vertex[1] = next.after[i * 3 + 1];
          vertex[2] = next.after[i * 3 + 2];
        }
        mesh.radius = computeRadius(mesh.vertices);
        mesh.normals = undefined;
        if (next.transforms) applyTransforms(state, next.transforms.after);
        object.geometryVersion++;
        past.push(next);
        return state;
      });
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    historySize: () => ({
      past: past.length,
      future: future.length
    }),
    toggleGameMode: () => update(state => {
      state.gameMode = !state.gameMode;
      return state;
    }),
    addScore: (amount = 1) => update(state => {
      state.score += amount;
      return state;
    }),
    setScore: score => update(state => {
      state.score = Math.max(0, Math.round(score));
      return state;
    }),
    resetScore: () => update(state => {
      state.score = 0;
      return state;
    }),
    resetGameInput: () => {
      gameInput.up = false;
      gameInput.down = false;
      gameInput.left = false;
      gameInput.right = false;
      gameInput.jump = false;
    },
    setGameInput: (direction, pressed) => {
      gameInput[direction] = pressed;
    },
    setJump: pressed => {
      gameInput.jump = pressed;
    },
    getGameInput: () => ({
      ...gameInput
    }),
    // ---- Edit mode ----
    setEditMode: editMode => update(state => {
      if (state.editMode === editMode) return state;
      state.editMode = editMode;
      state.selectedVertices = [];
      state.selectedEdges = [];
      state.selectedFaces = [];
      state.hover = null;
      if (editMode) {
        const object = state.objects.find(o => o.id === state.selectedId);
        if (object && object.type !== 'light' && object.type !== 'camera') {
          materializeGeometry(object);
          object.geometryVersion++;
        }
      }
      for (const object of state.objects) object.selectionVersion++;
      return state;
    }),
    setElementMode: elementMode => update(state => {
      state.elementMode = elementMode;
      state.selectedVertices = [];
      state.selectedEdges = [];
      state.selectedFaces = [];
      for (const object of state.objects) object.selectionVersion++;
      return state;
    }),
    setHover: hover => update(state => {
      const previous = state.hover;
      if (previous?.kind === hover?.kind && previous?.index === hover?.index) return state;
      state.hover = hover;
      const object = state.objects.find(o => o.id === state.selectedId);
      if (object) object.selectionVersion++;
      return state;
    }),
    selectElement: (kind, index, additive) => update(state => {
      const key = kind === 'vertex' ? 'selectedVertices' : kind === 'edge' ? 'selectedEdges' : 'selectedFaces';
      const current = state[key];
      const exists = current.includes(index);
      state.selectedVertices = kind === 'vertex' ? state.selectedVertices : [];
      state.selectedEdges = kind === 'edge' ? state.selectedEdges : [];
      state.selectedFaces = kind === 'face' ? state.selectedFaces : [];
      if (additive && exists) state[key] = current.filter(value => value !== index);else if (additive) state[key] = uniqueSorted([...current, index]);else state[key] = [index];
      const object = state.objects.find(o => o.id === state.selectedId);
      if (object) object.selectionVersion++;
      return state;
    }),
    selectElements: (kind, indices, additive) => update(state => {
      const key = kind === 'vertex' ? 'selectedVertices' : kind === 'edge' ? 'selectedEdges' : 'selectedFaces';
      state.selectedVertices = kind === 'vertex' ? state.selectedVertices : [];
      state.selectedEdges = kind === 'edge' ? state.selectedEdges : [];
      state.selectedFaces = kind === 'face' ? state.selectedFaces : [];
      state[key] = additive ? uniqueSorted([...state[key], ...indices]) : uniqueSorted(indices);
      const object = state.objects.find(o => o.id === state.selectedId);
      if (object) object.selectionVersion++;
      return state;
    }),
    clearElementSelection: () => update(state => {
      state.selectedVertices = [];
      state.selectedEdges = [];
      state.selectedFaces = [];
      const object = state.objects.find(o => o.id === state.selectedId);
      if (object) object.selectionVersion++;
      return state;
    }),
    /** Translates/scales the currently selected vertices, edges, or faces in Edit Mode. */
    translateSelectedElements: delta => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || !object.geometry) return state;
      const mesh = object.geometry;
      const vIndices = new Set();
      for (const v of state.selectedVertices) vIndices.add(v);
      for (const e of state.selectedEdges) {
        const edge = mesh.edges[e];
        if (edge) {
          vIndices.add(edge[0]);
          vIndices.add(edge[1]);
        }
      }
      for (const f of state.selectedFaces) {
        const face = mesh.faces[f];
        if (face) for (const v of face) vIndices.add(v);
      }
      if (!vIndices.size) return state;
      for (const idx of vIndices) {
        const v = mesh.vertices[idx];
        if (!v) continue;
        v[0] += delta[0];
        v[1] += delta[1];
        v[2] += delta[2];
      }
      mesh.radius = computeRadius(mesh.vertices);
      if (mesh.smooth) mesh.normals = computeVertexNormals(mesh);else mesh.normals = undefined;
      object.geometryVersion++;
      return state;
    }),
    // ---- Mesh operations ----
    meshOp: (op, params = {}) => {
      let failure = null;
      update(state => {
        const object = state.objects.find(o => o.id === state.selectedId);
        if (!object || object.type === 'light' || object.type === 'camera') return state;
        const mesh = materializeGeometry(object);
        let next = null;
        let nextEdges = null;
        let nextVerts = null;
        let nextFaces = null;
        pushHistory(state);
        switch (op) {
          case 'subdivide':
            next = subdivide(mesh, mesh.smooth ?? true);
            break;
          case 'extrude':
            {
              const facesToExtrude = state.selectedFaces.length ? state.selectedFaces : mesh.faces.length ? [0] : [];
              if (!facesToExtrude.length) {
                past.pop();
                return state;
              }
              next = extrudeFaces(mesh, facesToExtrude, params.amount ?? 0.35);
              break;
            }
          case 'inset':
            {
              const facesToInset = state.selectedFaces.length ? state.selectedFaces : mesh.faces.length ? [0] : [];
              if (!facesToInset.length) {
                past.pop();
                return state;
              }
              next = insetFaces(mesh, facesToInset, params.amount ?? 0.18);
              break;
            }
          case 'delete':
            if (state.selectedFaces.length) {
              if (state.selectedFaces.length >= mesh.faces.length) {
                past.pop();
                return state;
              }
              next = deleteMeshFaces(mesh, state.selectedFaces);
            } else if (state.elementMode === 'edge' && state.selectedEdges.length) {
              next = deleteGeometry(mesh, 'edge', state.selectedEdges);
            } else if (state.elementMode === 'vertex' && state.selectedVertices.length) {
              next = deleteGeometry(mesh, 'vertex', state.selectedVertices);
            } else {
              past.pop();
              return state;
            }
            break;
          case 'duplicate':
            {
              const indices = state.elementMode === 'face' ? state.selectedFaces.length ? state.selectedFaces : [0] : state.elementMode === 'edge' ? state.selectedEdges.length ? state.selectedEdges : [0] : state.selectedVertices.length ? state.selectedVertices : mesh.vertices.map((_, i) => i);
              const dup = duplicateMeshGeometry(mesh, state.elementMode, indices);
              next = dup.mesh;
              nextVerts = dup.newVertexIndices;
              nextFaces = dup.newFaceIndices;
              break;
            }
          case 'merge':
            next = mergeByDistance(mesh, params.amount ?? 0.001);
            break;
          case 'flip':
            next = flipNormals(mesh);
            break;
          case 'array':
            next = arrayMesh(mesh, params.amount ?? params.count ?? 3, params.offset ?? [1.25, 0, 0]);
            break;
          case 'solidify':
            next = solidifyMesh(mesh, params.amount ?? 0.12);
            break;
          case 'smooth':
            next = smoothMeshVertices(mesh, Math.max(1, Math.round(params.amount ?? params.iterations ?? 2)), params.factor ?? 0.5);
            break;
          case 'unwrap-box':
            next = unwrapMeshUV(mesh, 'box', params.amount ?? 1);
            break;
          case 'unwrap-planar':
            next = unwrapMeshUV(mesh, 'planar', params.amount ?? 1);
            break;
          case 'unwrap-cylindrical':
            next = unwrapMeshUV(mesh, 'cylindrical', params.amount ?? 1);
            break;
          case 'unwrap-spherical':
            next = unwrapMeshUV(mesh, 'spherical', params.amount ?? 1);
            break;
          case 'bake-ao':
            next = bakeMeshVertexColors(mesh, 'ao');
            break;
          case 'bake-light':
            next = bakeMeshVertexColors(mesh, 'light');
            break;
          case 'bake-gradient':
            next = bakeMeshVertexColors(mesh, 'gradient');
            break;
          case 'bake-curvature':
            next = bakeMeshVertexColors(mesh, 'curvature');
            break;
          case 'loopcut':
            {
              const start = state.selectedEdges[0] ?? 0;
              const cut = loopCut(mesh, start, params.amount ?? params.cuts ?? 1);
              if (!cut.ok) {
                failure = cut.error.message;
                past.pop();
                return state;
              }
              next = cut.mesh;
              nextEdges = cut.edges;
              break;
            }
          case 'bevel':
            {
              const corners = state.selectedVertices.length ? state.selectedVertices : mesh.vertices.map((_, index) => index);
              const bevelled = bevelVertices(mesh, corners, params.amount ?? 0.05, params.segments ?? 1);
              if (!bevelled.ok) {
                failure = bevelled.error.message;
                past.pop();
                return state;
              }
              next = bevelled.mesh;
              break;
            }
          case 'bridge':
            {
              if (state.selectedFaces.length >= 2) {
                const f1 = mesh.faces[state.selectedFaces[0]];
                const f2 = mesh.faces[state.selectedFaces[1]];
                next = bridgeEdgeLoops(mesh, f1, f2);
              } else if (state.selectedEdges.length >= 2) {
                const e1 = mesh.edges[state.selectedEdges[0]];
                const e2 = mesh.edges[state.selectedEdges[1]];
                next = bridgeEdgeLoops(mesh, [e1[0], e1[1]], [e2[0], e2[1]]);
              } else {
                // Bridge boundary loops or opposite faces
                const f1 = mesh.faces[0];
                const f2 = mesh.faces[mesh.faces.length - 1];
                next = bridgeEdgeLoops(mesh, f1, f2);
              }
              break;
            }
          case 'merge-center':
          case 'merge-first':
          case 'merge-last':
          case 'merge-collapse':
            {
              const mode = op === 'merge-first' ? 'first' : op === 'merge-last' ? 'last' : op === 'merge-collapse' ? 'collapse' : 'center';
              const verts = state.selectedVertices.length ? state.selectedVertices : mesh.vertices.map((_, i) => i);
              next = mergeVertices(mesh, verts, mode);
              break;
            }
          case 'dissolve':
            {
              if (state.elementMode === 'face' && state.selectedFaces.length) {
                next = dissolveGeometry(mesh, 'face', state.selectedFaces);
              } else if (state.elementMode === 'edge' && state.selectedEdges.length) {
                next = dissolveGeometry(mesh, 'edge', state.selectedEdges);
              } else if (state.elementMode === 'vertex' && state.selectedVertices.length) {
                next = dissolveGeometry(mesh, 'vertex', state.selectedVertices);
              } else {
                past.pop();
                return state;
              }
              break;
            }
          case 'separate':
            {
              if (!state.selectedFaces.length) {
                past.pop();
                return state;
              }
              const sep = separateGeometry(mesh, state.selectedFaces);
              next = sep.remainingMesh;
              // Add separated mesh as a new object
              const newId = 'obj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
              const newObj = {
                ...object,
                id: newId,
                name: object.name + '_sep',
                geometry: sep.separatedMesh,
                geometryVersion: 1,
                colorVersion: 1,
                selectionVersion: 1,
                position: [...object.position],
                children: []
              };
              state.objects.push(newObj);
              break;
            }
          case 'decimate':
            {
              next = decimateMesh(mesh, params.ratio ?? params.amount ?? 0.5);
              break;
            }
          case 'mirror':
            {
              next = mirrorMesh(mesh, params.axis ?? 'x', params.threshold ?? 0.001);
              break;
            }
          case 'screw':
            {
              next = screwSpinMesh(mesh, params.axis ?? 'z', params.angle ?? 360, params.steps ?? 16, params.pitch ?? params.amount ?? 0.5);
              break;
            }
          case 'boolean':
            {
              // Target object from params or next available mesh object
              const targetObj = state.objects.find(o => o.id !== object.id && o.geometry);
              if (targetObj && targetObj.geometry) {
                next = booleanMesh(mesh, targetObj.geometry, params.op ?? 'difference');
              } else {
                past.pop();
                return state;
              }
              break;
            }
          default:
            past.pop();
            return state;
        }
        if (!next) {
          past.pop();
          return state;
        }
        object.geometry = next;
        object.geometryVersion++;
        object.colorVersion++;
        object.selectionVersion++;
        state.selectedVertices = [];
        state.selectedEdges = [];
        state.selectedFaces = [];
        if (nextEdges) {
          state.selectedEdges = nextEdges.map(edge => next.edges.findIndex(candidate => candidate[0] === edge[0] && candidate[1] === edge[1])).filter(index => index >= 0);
          state.elementMode = 'edge';
        } else if (nextVerts || nextFaces) {
          if (state.elementMode === 'face' && nextFaces?.length) state.selectedFaces = nextFaces;else if (nextVerts?.length) state.selectedVertices = nextVerts;
        } else if (op === 'bevel') {
          state.elementMode = 'vertex';
        }
        return state;
      });
      return failure;
    },
    // ---- Sculpt / paint (Optimized in-place vertex updates) ----
    applyBrush: (kind, localPoint, radius, strength, symmetry, delta = [0, 0, 0], push = true, options) => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || object.type === 'light' || object.type === 'camera') return state;
      if (push) pushHistory(state);
      const mesh = materializeGeometry(object);
      if (!mesh.normals || mesh.normals.length !== mesh.vertices.length) {
        mesh.normals = computeVertexNormals(mesh);
      }
      const normals = mesh.normals;
      let affectedCount = 0;
      const centres = [localPoint];
      if (symmetry) {
        if (symmetry.x) centres.push([-localPoint[0], localPoint[1], localPoint[2]]);
        if (symmetry.y) centres.push([localPoint[0], -localPoint[1], localPoint[2]]);
        if (symmetry.z) centres.push([localPoint[0], localPoint[1], -localPoint[2]]);
        if (symmetry.x && symmetry.y) centres.push([-localPoint[0], -localPoint[1], localPoint[2]]);
        if (symmetry.x && symmetry.z) centres.push([-localPoint[0], localPoint[1], -localPoint[2]]);
        if (symmetry.y && symmetry.z) centres.push([localPoint[0], -localPoint[1], -localPoint[2]]);
        if (symmetry.x && symmetry.y && symmetry.z) centres.push([-localPoint[0], -localPoint[1], -localPoint[2]]);
      }
      if (kind === 'simplify') {
        for (let c = 0; c < centres.length; c++) {
          const simplified = decimateLocal(mesh, centres[c], radius);
          if (simplified !== mesh && simplified.vertices.length < mesh.vertices.length) {
            object.geometry = simplified;
            affectedCount++;
          }
        }
        if (affectedCount) {
          object.geometryVersion++;
          object.selectionVersion++;
          object.colorVersion++;
        } else if (push) {
          past.pop();
        }
        return state;
      }
      let hardness = 0.5;
      let inverted = false;
      let falloffType = 'smooth';
      let pressure = 1;
      let strokeVec = null;
      let hitNorm = null;
      if (typeof options === 'object' && options !== null) {
        if (options.hardness !== undefined) hardness = options.hardness;
        if (options.inverted !== undefined) inverted = options.inverted;
        if (options.falloff !== undefined) falloffType = options.falloff;
        if (options.pressure !== undefined) pressure = options.pressure;
        if (options.strokeVector) strokeVec = options.strokeVector;
        if (options.hitNormal) hitNorm = options.hitNormal;
      }
      const sign = inverted ? -1 : 1;
      const effStrength = strength * Math.max(0.05, Math.min(2, pressure));
      const neighbours = kind === 'smooth' || kind === 'clay' ? meshAdjacency(mesh) : null;
      const r2 = radius * radius;
      const invRadius = 1 / Math.max(1e-6, radius);
      const verts = mesh.vertices;
      const vLen = verts.length;
      if (kind === 'mask') {
        if (!mesh.mask || mesh.mask.length !== vLen) mesh.mask = new Array(vLen).fill(0);
        for (let c = 0; c < centres.length; c++) {
          const centre = centres[c];
          const cx = centre[0],
            cy = centre[1],
            cz = centre[2];
          for (let i = 0; i < vLen; i++) {
            const v = verts[i];
            const dx = v[0] - cx,
              dy = v[1] - cy,
              dz = v[2] - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > r2) continue;
            affectedCount++;
            const t = 1 - Math.sqrt(d2) * invRadius;
            const deltaMask = t * t * effStrength * sign;
            mesh.mask[i] = Math.min(1, Math.max(0, mesh.mask[i] + deltaMask));
          }
        }
        if (affectedCount) object.colorVersion++;else if (push) past.pop();
        return state;
      }
      for (let c = 0; c < centres.length; c++) {
        const centre = centres[c];
        const cx = centre[0],
          cy = centre[1],
          cz = centre[2];
        for (let i = 0; i < vLen; i++) {
          const v = verts[i];
          const dx = v[0] - cx,
            dy = v[1] - cy,
            dz = v[2] - cz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          const maskVal = mesh.mask?.[i] ?? 0;
          const unmasked = Math.max(0, 1 - maskVal);
          if (unmasked <= 1e-4) continue;
          affectedCount++;
          const dist = Math.sqrt(d2);
          const t = 1 - dist * invRadius;
          let falloff;
          if (falloffType === 'linear') {
            falloff = t;
          } else if (falloffType === 'hard') {
            falloff = dist < 0.85 * radius ? 1 : 6.6 * (1 - dist * invRadius);
          } else {
            const cosine = 0.5 * (1 + Math.cos((1 - t) * Math.PI));
            const exp = Math.max(0.1, 2.2 * (1 - hardness) + 0.3);
            falloff = Math.pow(cosine, exp);
          }
          const amount = falloff * effStrength * unmasked;
          if (kind === 'draw') {
            const n = normals[i] ?? [0, 1, 0];
            const disp = 0.12 * amount * sign;
            v[0] += n[0] * disp;
            v[1] += n[1] * disp;
            v[2] += n[2] * disp;
          } else if (kind === 'clay') {
            const n = hitNorm ?? normals[i] ?? [0, 1, 0];
            const planeDist = (0.14 * sign * effStrength * falloff - (dx * n[0] + dy * n[1] + dz * n[2])) * Math.min(1, 0.85 * amount);
            v[0] += n[0] * planeDist;
            v[1] += n[1] * planeDist;
            v[2] += n[2] * planeDist;
          } else if (kind === 'smooth') {
            const list = neighbours?.get(i);
            if (!list || !list.length) continue;
            let ax = 0,
              ay = 0,
              az = 0;
            for (let k = 0; k < list.length; k++) {
              const nb = verts[list[k]];
              ax += nb[0];
              ay += nb[1];
              az += nb[2];
            }
            const invL = 1 / list.length;
            const kFactor = Math.min(1, amount);
            v[0] += (ax * invL - v[0]) * kFactor;
            v[1] += (ay * invL - v[1]) * kFactor;
            v[2] += (az * invL - v[2]) * kFactor;
          } else if (kind === 'inflate') {
            const n = normals[i] ?? [0, 1, 0];
            const disp = 0.15 * amount * sign;
            v[0] += n[0] * disp;
            v[1] += n[1] * disp;
            v[2] += n[2] * disp;
          } else if (kind === 'grab') {
            v[0] += delta[0] * amount;
            v[1] += delta[1] * amount;
            v[2] += delta[2] * amount;
          } else if (kind === 'snake_hook') {
            const sv = !strokeVec || strokeVec[0] === 0 && strokeVec[1] === 0 && strokeVec[2] === 0 ? delta : strokeVec;
            const scaleHook = 1.35;
            v[0] += sv[0] * amount * scaleHook;
            v[1] += sv[1] * amount * scaleHook;
            v[2] += sv[2] * amount * scaleHook;
          } else if (kind === 'pinch') {
            const kFactor = Math.min(0.7, 0.8 * amount) * sign;
            v[0] -= dx * kFactor;
            v[1] -= dy * kFactor;
            v[2] -= dz * kFactor;
          } else if (kind === 'crease') {
            const pinchFactor = Math.min(0.65, 0.7 * amount);
            v[0] -= dx * pinchFactor;
            v[1] -= dy * pinchFactor;
            v[2] -= dz * pinchFactor;
            const n = normals[i] ?? [0, 1, 0];
            const indent = 0.12 * amount * (inverted ? 1 : -1);
            v[0] += n[0] * indent;
            v[1] += n[1] * indent;
            v[2] += n[2] * indent;
          } else if (kind === 'flatten') {
            const n = hitNorm ?? normals[i] ?? [0, 1, 0];
            const distance = (dx * n[0] + dy * n[1] + dz * n[2]) * Math.min(1, amount);
            v[0] -= n[0] * distance;
            v[1] -= n[1] * distance;
            v[2] -= n[2] * distance;
          } else if (kind === 'fill') {
            const n = hitNorm ?? normals[i] ?? [0, 1, 0];
            const distance = dx * n[0] + dy * n[1] + dz * n[2];
            if (sign > 0 && distance < 0) {
              const kFactor = distance * Math.min(1, amount);
              v[0] -= n[0] * kFactor;
              v[1] -= n[1] * kFactor;
              v[2] -= n[2] * kFactor;
            } else if (sign < 0 && distance < 0) {
              const kFactor = Math.abs(distance) * Math.min(0.5, 0.5 * amount);
              v[0] -= n[0] * kFactor;
              v[1] -= n[1] * kFactor;
              v[2] -= n[2] * kFactor;
            }
          }
        }
      }
      if (!affectedCount) {
        if (push) past.pop();
        return state;
      }
      mesh.radius = computeRadius(verts);
      mesh.normals = computeVertexNormals(mesh);
      object.geometryVersion++;
      return state;
    }),
    clearMask: id => update(state => {
      const targetId = id ?? state.selectedId;
      const object = state.objects.find(o => o.id === targetId);
      if (!object || !object.geometry) return state;
      pushHistory(state);
      if (object.geometry.mask) object.geometry.mask.fill(0);
      object.colorVersion++;
      return state;
    }),
    invertMask: id => update(state => {
      const targetId = id ?? state.selectedId;
      const object = state.objects.find(o => o.id === targetId);
      if (!object || !object.geometry) return state;
      pushHistory(state);
      const vLen = object.geometry.vertices.length;
      if (object.geometry.mask && object.geometry.mask.length === vLen) {
        for (let i = 0; i < vLen; i++) {
          object.geometry.mask[i] = Math.max(0, Math.min(1, 1 - (object.geometry.mask[i] ?? 0)));
        }
      } else {
        object.geometry.mask = new Array(vLen).fill(1);
      }
      object.colorVersion++;
      return state;
    }),
    blurMask: id => update(state => {
      const targetId = id ?? state.selectedId;
      const object = state.objects.find(o => o.id === targetId);
      if (!object || !object.geometry) return state;
      const mesh = object.geometry;
      const vLen = mesh.vertices.length;
      if (!mesh.mask || mesh.mask.length !== vLen) return state;
      pushHistory(state);
      const adj = meshAdjacency(mesh);
      const next = new Array(vLen).fill(0);
      for (let i = 0; i < vLen; i++) {
        const nbs = adj.get(i);
        if (!nbs || !nbs.length) {
          next[i] = mesh.mask[i];
          continue;
        }
        let sum = 2 * mesh.mask[i];
        for (const nb of nbs) sum += mesh.mask[nb] ?? 0;
        next[i] = sum / (nbs.length + 2);
      }
      mesh.mask = next;
      object.colorVersion++;
      return state;
    }),
    bindArmature: id => update(state => {
      const targetId = id ?? state.selectedId;
      const object = state.objects.find(o => o.id === targetId);
      if (!object) return state;
      const rootBone = state.objects.find(o => o.type === 'bone' && !o.parent) ?? state.objects.find(o => o.type === 'bone');
      if (rootBone && rootBone.id !== object.id) {
        pushHistory(state);
        object.parent = rootBone.id;
        if (!rootBone.children.includes(object.id)) rootBone.children.push(object.id);
      }
      return state;
    }),
    paintVertices: (localPoint, radius, color, strength = 1, push = true) => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || object.type === 'light' || object.type === 'camera') return state;
      if (push) pushHistory(state);
      const mesh = materializeGeometry(object);
      if (!mesh.colors || mesh.colors.length !== mesh.vertices.length * 3) mesh.colors = new Array(mesh.vertices.length * 3).fill(1);
      let touched = false;
      const r2 = radius * radius;
      const invRadius = 1 / Math.max(1e-6, radius);
      const lx = localPoint[0],
        ly = localPoint[1],
        lz = localPoint[2];
      for (let i = 0; i < mesh.vertices.length; i++) {
        const v = mesh.vertices[i];
        const dx = v[0] - lx,
          dy = v[1] - ly,
          dz = v[2] - lz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const t = 1 - Math.sqrt(d2) * invRadius;
        const falloff = t * t * strength;
        const i3 = i * 3;
        mesh.colors[i3] += (color[0] - mesh.colors[i3]) * falloff;
        mesh.colors[i3 + 1] += (color[1] - mesh.colors[i3 + 1]) * falloff;
        mesh.colors[i3 + 2] += (color[2] - mesh.colors[i3 + 2]) * falloff;
        touched = true;
      }
      if (touched) object.colorVersion++;else if (push) past.pop();
      return state;
    }),
    fillVertexColor: hex => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || object.type === 'light' || object.type === 'camera') return state;
      pushHistory(state);
      const mesh = materializeGeometry(object);
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      mesh.colors = new Array(mesh.vertices.length * 3);
      for (let i = 0; i < mesh.vertices.length; i++) {
        mesh.colors[i * 3] = r;
        mesh.colors[i * 3 + 1] = g;
        mesh.colors[i * 3 + 2] = b;
      }
      object.colorVersion++;
      return state;
    }),
    // ---- Marked portions and material slots ----

    markPortion: (objectId, faces) => update(state => {
      state.markedObjectId = objectId;
      state.markedFaces = [...new Set(faces)].sort((a, b) => a - b);
      state.portionVersion++;
      return state;
    }),
    clearPortion: () => update(state => {
      state.markedFaces = [];
      state.markedObjectId = null;
      state.portionVersion++;
      return state;
    }),
    applyMaterialPreset: (objectId, presetId) => update(state => {
      const object = state.objects.find(o => o.id === objectId);
      if (!object) return state;
      const preset = presetById(presetId);
      if (!preset) return state;
      pushHistory(state);
      const slot = presetToSlot(preset);
      const mesh = materializeGeometry(object);
      const marked = state.markedObjectId === objectId && state.markedFaces.length ? state.markedFaces : null;
      if (marked) {
        const slotIndex = mesh.slots.length;
        const next = assignFacesToSlot(mesh, marked, slotIndex);
        next.slots = [...mesh.slots];
        next.slots[slotIndex] = slot;
        object.geometry = next;
      } else {
        const next = assignFacesToSlot(mesh, mesh.faces.map((_, index) => index), 0);
        next.slots = [...mesh.slots];
        next.slots[0] = slot;
        object.geometry = next;
        object.color = preset.color;
        object.material = {
          emissive: preset.emissive,
          opacity: preset.opacity,
          metalness: preset.metalness,
          roughness: preset.roughness
        };
      }
      object.geometryVersion++;
      object.colorVersion++;
      object.selectionVersion++;
      return state;
    }),
    applyMaterialImage: (objectId, dataUrl, name) => update(state => {
      const object = state.objects.find(o => o.id === objectId);
      if (!object) return state;
      pushHistory(state);
      const mesh = materializeGeometry(object);
      const next = slotFromImage(name, dataUrl);
      const marked = state.markedObjectId === objectId && state.markedFaces.length ? state.markedFaces : null;
      if (marked) {
        const slotIndex = mesh.slots.length;
        const updated = assignFacesToSlot(mesh, marked, slotIndex);
        updated.slots = [...mesh.slots, next];
        object.geometry = updated;
      } else {
        const updated = assignFacesToSlot(mesh, mesh.faces.map((_, index) => index), 0);
        updated.slots = [...mesh.slots];
        updated.slots[0] = next;
        object.geometry = updated;
        object.color = next.color;
      }
      object.geometryVersion++;
      object.colorVersion++;
      return state;
    }),
    updateMaterialSlot: (objectId, slotIndex, patch) => update(state => {
      const object = state.objects.find(o => o.id === objectId);
      if (!object) return state;
      pushHistory(state);
      const mesh = materializeGeometry(object);
      const slots = [...mesh.slots];
      while (slots.length <= slotIndex) slots.push({
        ...(slots[0] ?? slotFromObject(object)),
        name: `Slot ${slots.length}`
      });
      slots[slotIndex] = {
        ...slots[slotIndex],
        ...patch
      };
      object.geometry = {
        ...mesh,
        slots
      };
      object.geometryVersion++;
      object.colorVersion++;
      return state;
    }),
    addMaterialSlot: (objectId, name = 'Slot') => update(state => {
      const object = state.objects.find(o => o.id === objectId);
      if (!object) return state;
      pushHistory(state);
      const mesh = materializeGeometry(object);
      const slots = [...mesh.slots, {
        ...slotFromObject(object),
        name
      }];
      object.geometry = {
        ...mesh,
        slots
      };
      object.geometryVersion++;
      return state;
    }),
    cutObject: (objectId, plane, mode) => update(state => {
      const object = state.objects.find(o => o.id === objectId);
      if (!object) return state;
      const mesh = materializeGeometry(object);
      pushHistory(state);
      if (mode === 'mark') {
        const {
          negative
        } = classifyFacesByPlane(mesh, plane);
        if (!negative.length) {
          past.pop();
          return state;
        }
        const slotIndex = mesh.slots.length;
        const next = assignFacesToSlot(mesh, negative, slotIndex);
        next.slots = [...mesh.slots];
        next.slots[slotIndex] = {
          ...slotFromObject(object),
          name: 'Cut Surface',
          color: '#ff7a6b'
        };
        object.geometry = next;
        object.geometryVersion++;
        object.colorVersion++;
        return state;
      }
      const result = bisectMesh(mesh, plane);
      if (!result.positive.faces.length || !result.negative.faces.length) {
        past.pop();
        return state;
      }
      const gap = 0.12;
      const negative = offsetMesh(result.negative, [plane.normal[0] * gap, plane.normal[1] * gap, plane.normal[2] * gap]);
      const names = new Set(state.objects.map(item => item.name));
      const pickName = base => {
        let candidate = base;
        let index = 1;
        while (names.has(candidate)) {
          candidate = `${base}.${String(index).padStart(3, '0')}`;
          index++;
        }
        names.add(candidate);
        return candidate;
      };
      const baseName = object.name;
      const nameA = pickName(`${baseName}_Part_A`);
      const nameB = pickName(`${baseName}_Part_B`);
      object.name = nameA;
      const positive = {
        ...result.positive,
        slots: mesh.slots.map(slot => ({
          ...slot
        })),
        faceSlot: [...(result.positive.faceSlot ?? [])]
      };
      positive.groups = buildGroups(positive);
      object.geometry = positive;
      const copy = cloneObject(object);
      copy.id = nextId();
      copy.name = nameB;
      const negativeMesh = {
        ...negative,
        slots: mesh.slots.map(slot => ({
          ...slot
        })),
        faceSlot: [...(negative.faceSlot ?? [])]
      };
      negativeMesh.groups = buildGroups(negativeMesh);
      copy.geometry = negativeMesh;
      copy.selected = false;
      state.objects.push(copy);
      object.geometryVersion++;
      object.colorVersion++;
      return state;
    }),
    extrudePortion: (objectId, faces, distance) => update(state => {
      const object = state.objects.find(o => o.id === objectId);
      if (!object) return state;
      const mesh = materializeGeometry(object);
      if (!faces.length) return state;
      pushHistory(state);
      object.geometry = extrudeRegion(mesh, faces, distance);
      object.geometryVersion++;
      object.colorVersion++;
      return state;
    }),
    serialize: () => {
      const state = get(sceneStore);
      return {
        objects: cloneObjects(state.objects),
        selectedId: state.selectedId,
        score: state.score
      };
    },
    load: (objects, selectedId = null) => update(state => {
      pushHistory(state);
      let maxId = 0;
      for (const object of objects) {
        const match = /^obj-(\d+)$/.exec(object.id);
        if (match) maxId = Math.max(maxId, Number(match[1]));
      }
      idCounter = Math.max(idCounter, maxId + 1);
      state.objects = cloneObjects(objects).map(obj => ({
        ...obj,
        restPose: obj.restPose ?? {
          position: [...obj.position],
          rotation: [...obj.rotation],
          scale: [...obj.scale]
        }
      }));
      state.selectedId = selectedId;
      state.editMode = false;
      state.selectedVertices = [];
      state.selectedEdges = [];
      state.selectedFaces = [];
      state.objects.forEach(object => object.selected = object.id === selectedId);
      for (const object of state.objects) {
        const url = object.geometry?.slots?.find(slot => slot.imageUrl)?.imageUrl;
        if (url) primeLayerTexture(url, () => refreshObject(object.id));
      }
      return state;
    }),
    setCameraProps: (id, patch) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object || object.type !== 'camera') return state;
      object.cameraProps = {
        ...(object.cameraProps ?? {
          fov: 50,
          targetId: null,
          targetOffset: [0, 0.5, 0],
          trackingMode: 'look_at',
          followDistance: 4.5,
          followHeight: 1.8,
          damping: 0.1,
          active: true
        }),
        ...patch
      };
      if (patch.active) {
        for (const other of state.objects) {
          if (other.id !== id && other.cameraProps) other.cameraProps.active = false;
        }
      }
      return state;
    }),
    updateCameraTracking: (dt = 0.016, currentTime = 0) => {
      const snap = get(sceneStore);
      const hasTrackingCam = snap.objects.some(o => (o.type === 'camera' || o.type.startsWith('camera_')) && o.cameraProps && o.cameraProps.trackingMode !== 'none' && Boolean(o.cameraProps.targetId));
      if (!hasTrackingCam) return;
      update(state => {
        for (const object of state.objects) {
          if (object.type !== 'camera' && !object.type.startsWith('camera_') || !object.cameraProps || object.cameraProps.trackingMode === 'none') continue;
          const targetId = object.cameraProps.targetId;
          if (!targetId) continue;
          const target = state.objects.find(o => o.id === targetId);
          if (!target) continue;
          const offset = object.cameraProps.targetOffset ?? [0, 0.5, 0];
          const targetCenter = [target.position[0] + offset[0], target.position[1] + offset[1], target.position[2] + offset[2]];
          if (object.cameraProps.trackingMode === 'look_at') {
            object.rotation = lookAtEuler(object.position, targetCenter);
          } else if (object.cameraProps.trackingMode === 'follow') {
            const dist = object.cameraProps.followDistance ?? 4.5;
            const h = object.cameraProps.followHeight ?? 1.8;
            const behind = rotateEuler([0, 0, dist], target.rotation);
            const desiredPos = [targetCenter[0] + behind[0], targetCenter[1] + h, targetCenter[2] + behind[2]];
            const damp = clamp(object.cameraProps.damping ?? 0.15, 0.01, 1);
            object.position[0] += (desiredPos[0] - object.position[0]) * damp;
            object.position[1] += (desiredPos[1] - object.position[1]) * damp;
            object.position[2] += (desiredPos[2] - object.position[2]) * damp;
            object.rotation = lookAtEuler(object.position, targetCenter);
          } else if (object.cameraProps.trackingMode === 'orbit') {
            const dist = object.cameraProps.followDistance ?? 4.5;
            const h = object.cameraProps.followHeight ?? 1.8;
            const theta = currentTime * 0.75;
            object.position[0] = targetCenter[0] + Math.sin(theta) * dist;
            object.position[1] = targetCenter[1] + h;
            object.position[2] = targetCenter[2] + Math.cos(theta) * dist;
            object.rotation = lookAtEuler(object.position, targetCenter);
          }
        }
        return state;
      });
    },
    splitLayer: (id, time) => {
      let result = null;
      update(state => {
        const orig = state.objects.find(o => o.id === id);
        if (!orig) return state;
        const tl = get(timelineStore);
        const splitTime = time !== undefined ? time : tl.currentTime;
        const clip = tl.clips.get(id) ?? {
          start: 0,
          end: 15
        };
        if (splitTime <= clip.start + 0.05 || splitTime >= clip.end - 0.05) return state;
        pushHistory(state);
        timelineStore.setClip(id, clip.start, splitTime);
        const newId = nextId();
        const copy = cloneObject(orig);
        copy.id = newId;
        copy.name = uniqueName(state.objects, orig.name + ' Part 2');
        copy.selected = true;
        orig.selected = false;
        state.objects.push(copy);
        state.selectedId = newId;
        timelineStore.setClip(newId, splitTime, clip.end);

        // Split keyframes
        const allKeys = tl.keyframes.get(id) ?? [];
        const keysA = allKeys.filter(k => k.time <= splitTime);
        const keysB = allKeys.filter(k => k.time >= splitTime);
        const evalMap = timelineStore.evaluate(splitTime, tl.easing);
        const cutTransform = evalMap.get(id);
        const cutPose = {
          time: splitTime,
          position: cutTransform?.position ? [...cutTransform.position] : [...orig.position],
          rotation: cutTransform?.rotation ? [...cutTransform.rotation] : [...orig.rotation],
          scale: cutTransform?.scale ? [...cutTransform.scale] : [...orig.scale]
        };
        if (!keysA.some(k => Math.abs(k.time - splitTime) < 0.001)) keysA.push({
          ...cutPose
        });
        if (!keysB.some(k => Math.abs(k.time - splitTime) < 0.001)) keysB.unshift({
          ...cutPose
        });
        timelineStore.loadKeyframes({
          ...timelineStore.serializeKeyframes(),
          [id]: keysA,
          [newId]: keysB
        });
        result = {
          partAId: id,
          partBId: newId
        };
        return state;
      });
      return result;
    },
    replaceObjectGeometry: (id, newType) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object || object.locked) return state;
      pushHistory(state);
      object.type = newType;
      const newMesh = cloneMesh(meshFor(newType) ?? meshFor('cube'));
      if (object.geometry?.slots?.length) {
        newMesh.slots = [...object.geometry.slots];
        newMesh.faceSlot = newMesh.faces.map(() => 0);
        newMesh.groups = buildGroups(newMesh);
      }
      object.geometry = newMesh;
      object.geometryVersion++;
      object.colorVersion++;
      object.selectionVersion++;
      return state;
    }),
    replaceObjectMedia: (id, dataUrl, width = 1280, height = 720) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object || object.locked) return state;
      pushHistory(state);
      useTextureSlot(object, dataUrl, width, height);
      object.geometryVersion++;
      object.colorVersion++;
      return state;
    }),
    setObjectOpacity: (id, opacity) => update(state => {
      const object = state.objects.find(o => o.id === id);
      if (!object || object.locked) return state;
      const val = clamp(opacity, 0, 1);
      object.material.opacity = val;
      if (object.geometry?.slots?.length) {
        for (const slot of object.geometry.slots) slot.opacity = val;
      }
      object.colorVersion++;
      const tl = get(timelineStore);
      if (tl.autoKey) {
        timelineStore.addChannelKeyframe(id, 'material.opacity', tl.currentTime, val);
      }
      return state;
    }),
    // ---- Edit Tab Selection Tools ----
    selectLinked: () => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || !object.geometry) return state;
      const mesh = object.geometry;
      const adj = new Map();
      mesh.faces.forEach((f, fIdx) => {
        for (const vi of f) {
          if (!adj.has(vi)) adj.set(vi, []);
          adj.get(vi).push(fIdx);
        }
      });
      const visitedFaces = new Set(state.selectedFaces);
      const visitedVerts = new Set(state.selectedVertices);
      const queue = [...state.selectedVertices];
      for (const fIdx of state.selectedFaces) {
        for (const vi of mesh.faces[fIdx]) {
          if (!visitedVerts.has(vi)) {
            visitedVerts.add(vi);
            queue.push(vi);
          }
        }
      }
      if (!queue.length && mesh.vertices.length) {
        queue.push(0);
        visitedVerts.add(0);
      }
      while (queue.length > 0) {
        const vi = queue.pop();
        const faces = adj.get(vi) || [];
        for (const fIdx of faces) {
          if (!visitedFaces.has(fIdx)) {
            visitedFaces.add(fIdx);
            for (const otherVi of mesh.faces[fIdx]) {
              if (!visitedVerts.has(otherVi)) {
                visitedVerts.add(otherVi);
                queue.push(otherVi);
              }
            }
          }
        }
      }
      state.selectedVertices = [...visitedVerts];
      state.selectedFaces = [...visitedFaces];
      object.selectionVersion++;
      return state;
    }),
    selectLoop: () => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || !object.geometry) return state;
      const mesh = object.geometry;
      if (state.elementMode === 'edge') {
        const start = state.selectedEdges[0] ?? 0;
        if (!mesh.edges[start]) return state;
        const edgeIndexByKey = new Map();
        mesh.edges.forEach(([a, b], idx) => {
          edgeIndexByKey.set(a < b ? `${a}:${b}` : `${b}:${a}`, idx);
        });
        const selected = new Set(state.selectedEdges.length ? state.selectedEdges : [start]);
        const queue = [...selected];
        while (queue.length > 0) {
          const curIdx = queue.pop();
          const curEdge = mesh.edges[curIdx];
          if (!curEdge) continue;
          for (const f of mesh.faces) {
            if (f.length !== 4) continue;
            for (let i = 0; i < 4; i++) {
              const a = f[i],
                b = f[(i + 1) % 4];
              if (a === curEdge[0] && b === curEdge[1] || a === curEdge[1] && b === curEdge[0]) {
                const oppA = f[(i + 2) % 4],
                  oppB = f[(i + 3) % 4];
                const oppKey = oppA < oppB ? `${oppA}:${oppB}` : `${oppB}:${oppA}`;
                const oppEdgeIdx = edgeIndexByKey.get(oppKey);
                if (oppEdgeIdx !== undefined && !selected.has(oppEdgeIdx)) {
                  selected.add(oppEdgeIdx);
                  queue.push(oppEdgeIdx);
                }
              }
            }
          }
        }
        state.selectedEdges = [...selected];
      } else if (state.elementMode === 'face') {
        const start = state.selectedFaces[0] ?? 0;
        const selected = new Set(state.selectedFaces);
        mesh.faces.forEach((f, idx) => {
          if (Math.abs(idx - start) <= 3) selected.add(idx);
        });
        state.selectedFaces = [...selected];
      }
      object.selectionVersion++;
      return state;
    }),
    selectRing: () => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || !object.geometry) return state;
      const mesh = object.geometry;
      if (state.elementMode === 'edge') {
        const start = state.selectedEdges[0] ?? 0;
        const edge = mesh.edges[start];
        if (!edge) return state;
        const edgeIndexByKey = new Map();
        mesh.edges.forEach(([a, b], idx) => {
          edgeIndexByKey.set(a < b ? `${a}:${b}` : `${b}:${a}`, idx);
        });
        const selected = new Set(state.selectedEdges.length ? state.selectedEdges : [start]);
        mesh.faces.forEach(f => {
          if (f.length === 4) {
            for (let i = 0; i < 4; i++) {
              const a = f[i],
                b = f[(i + 1) % 4];
              if (a === edge[0] && b === edge[1] || a === edge[1] && b === edge[0]) {
                const s1a = f[(i + 1) % 4],
                  s1b = f[(i + 2) % 4];
                const s2a = f[(i + 3) % 4],
                  s2b = f[i];
                const sideA = edgeIndexByKey.get(s1a < s1b ? `${s1a}:${s1b}` : `${s1b}:${s1a}`);
                const sideB = edgeIndexByKey.get(s2a < s2b ? `${s2a}:${s2b}` : `${s2b}:${s2a}`);
                if (sideA !== undefined) selected.add(sideA);
                if (sideB !== undefined) selected.add(sideB);
              }
            }
          }
        });
        state.selectedEdges = [...selected];
      }
      object.selectionVersion++;
      return state;
    }),
    invertSelection: () => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || !object.geometry) return state;
      const mesh = object.geometry;
      if (state.elementMode === 'vertex') {
        const current = new Set(state.selectedVertices);
        state.selectedVertices = mesh.vertices.map((_, i) => i).filter(i => !current.has(i));
      } else if (state.elementMode === 'edge') {
        const current = new Set(state.selectedEdges);
        state.selectedEdges = mesh.edges.map((_, i) => i).filter(i => !current.has(i));
      } else if (state.elementMode === 'face') {
        const current = new Set(state.selectedFaces);
        state.selectedFaces = mesh.faces.map((_, i) => i).filter(i => !current.has(i));
      }
      object.selectionVersion++;
      return state;
    }),
    selectSimilar: (_criteria = 'normal') => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || !object.geometry) return state;
      const mesh = object.geometry;
      if (state.elementMode === 'vertex') {
        const vIdx = state.selectedVertices[0] ?? 0;
        const degrees = new Int32Array(mesh.vertices.length);
        for (const [a, b] of mesh.edges) {
          if (a >= 0 && a < degrees.length) degrees[a]++;
          if (b >= 0 && b < degrees.length) degrees[b]++;
        }
        const valence = degrees[vIdx] ?? 0;
        const matched = [];
        for (let i = 0; i < degrees.length; i++) {
          if (degrees[i] === valence) matched.push(i);
        }
        state.selectedVertices = matched;
      } else if (state.elementMode === 'edge') {
        const eIdx = state.selectedEdges[0] ?? 0;
        const edge = mesh.edges[eIdx];
        if (edge) {
          const v0 = mesh.vertices[edge[0]],
            v1 = mesh.vertices[edge[1]];
          const targetLen = Math.hypot(v0[0] - v1[0], v0[1] - v1[1], v0[2] - v1[2]);
          const matched = [];
          mesh.edges.forEach((e, idx) => {
            const ev0 = mesh.vertices[e[0]],
              ev1 = mesh.vertices[e[1]];
            const len = Math.hypot(ev0[0] - ev1[0], ev0[1] - ev1[1], ev0[2] - ev1[2]);
            if (Math.abs(len - targetLen) < 0.05 * targetLen + 1e-4) matched.push(idx);
          });
          state.selectedEdges = matched;
        }
      } else if (state.elementMode === 'face') {
        const fIdx = state.selectedFaces[0] ?? 0;
        const face = mesh.faces[fIdx];
        if (face) {
          const n0 = faceNormal(mesh, face);
          const matched = [];
          mesh.faces.forEach((f, idx) => {
            const n = faceNormal(mesh, f);
            const dotProd = n0[0] * n[0] + n0[1] * n[1] + n0[2] * n[2];
            if (dotProd > 0.85) matched.push(idx);
          });
          state.selectedFaces = matched;
        }
      }
      object.selectionVersion++;
      return state;
    }),
    boxSelect: (rect, projectFn) => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object || !object.geometry) return state;
      const mesh = object.geometry;
      if (state.elementMode === 'vertex') {
        const sel = [];
        mesh.vertices.forEach((v, idx) => {
          const pt = projectFn(v);
          if (pt && pt.x >= rect.minX && pt.x <= rect.maxX && pt.y >= rect.minY && pt.y <= rect.maxY) {
            sel.push(idx);
          }
        });
        state.selectedVertices = sel;
      } else if (state.elementMode === 'face') {
        const sel = [];
        mesh.faces.forEach((f, idx) => {
          const c = faceCenter(mesh, f);
          const pt = projectFn(c);
          if (pt && pt.x >= rect.minX && pt.x <= rect.maxX && pt.y >= rect.minY && pt.y <= rect.maxY) {
            sel.push(idx);
          }
        });
        state.selectedFaces = sel;
      } else if (state.elementMode === 'edge') {
        const sel = [];
        mesh.edges.forEach((e, idx) => {
          const v0 = mesh.vertices[e[0]],
            v1 = mesh.vertices[e[1]];
          const mid = [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2, (v0[2] + v1[2]) / 2];
          const pt = projectFn(mid);
          if (pt && pt.x >= rect.minX && pt.x <= rect.maxX && pt.y >= rect.minY && pt.y <= rect.maxY) {
            sel.push(idx);
          }
        });
        state.selectedEdges = sel;
      }
      object.selectionVersion++;
      return state;
    }),
    // ---- Edit Tab Object Level Tools ----
    setOrigin: (mode, cursorPosition = [0, 0, 0]) => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object) return state;
      const mesh = materializeGeometry(object);
      pushHistory(state);
      if (mode === 'geometry') {
        let minX = Infinity,
          minY = Infinity,
          minZ = Infinity;
        let maxX = -Infinity,
          maxY = -Infinity,
          maxZ = -Infinity;
        for (const v of mesh.vertices) {
          if (v[0] < minX) minX = v[0];
          if (v[0] > maxX) maxX = v[0];
          if (v[1] < minY) minY = v[1];
          if (v[1] > maxY) maxY = v[1];
          if (v[2] < minZ) minZ = v[2];
          if (v[2] > maxZ) maxZ = v[2];
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        mesh.vertices.forEach(v => {
          v[0] -= cx;
          v[1] -= cy;
          v[2] -= cz;
        });
        const rot = rotateEuler([cx * object.scale[0], cy * object.scale[1], cz * object.scale[2]], object.rotation);
        object.position = [object.position[0] + rot[0], object.position[1] + rot[1], object.position[2] + rot[2]];
      } else if (mode === 'cursor') {
        const dx = cursorPosition[0] - object.position[0];
        const dy = cursorPosition[1] - object.position[1];
        const dz = cursorPosition[2] - object.position[2];
        mesh.vertices.forEach(v => {
          v[0] -= dx / object.scale[0];
          v[1] -= dy / object.scale[1];
          v[2] -= dz / object.scale[2];
        });
        object.position = [...cursorPosition];
      } else {
        mesh.vertices.forEach(v => {
          v[0] += object.position[0] / object.scale[0];
          v[1] += object.position[1] / object.scale[1];
          v[2] += object.position[2] / object.scale[2];
        });
        object.position = [0, 0, 0];
      }
      mesh.radius = computeRadius(mesh.vertices);
      object.geometryVersion++;
      return state;
    }),
    applyTransformation: type => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object) return state;
      const mesh = materializeGeometry(object);
      pushHistory(state);
      if (type === 'scale' || type === 'all') {
        mesh.vertices.forEach(v => {
          v[0] *= object.scale[0];
          v[1] *= object.scale[1];
          v[2] *= object.scale[2];
        });
        object.scale = [1, 1, 1];
      }
      if (type === 'rotation' || type === 'all') {
        mesh.vertices = mesh.vertices.map(v => rotateEuler(v, object.rotation));
        object.rotation = [0, 0, 0];
      }
      if (type === 'location' || type === 'all') {
        mesh.vertices.forEach(v => {
          v[0] += object.position[0];
          v[1] += object.position[1];
          v[2] += object.position[2];
        });
        object.position = [0, 0, 0];
      }
      mesh.radius = computeRadius(mesh.vertices);
      if (mesh.smooth || mesh.normals) mesh.normals = computeVertexNormals(mesh);
      object.geometryVersion++;
      return state;
    }),
    clearTransformation: type => update(state => {
      const object = state.objects.find(o => o.id === state.selectedId);
      if (!object) return state;
      pushHistory(state);
      if (type === 'location' || type === 'all') object.position = [0, 0, 0];
      if (type === 'rotation' || type === 'all') object.rotation = [0, 0, 0];
      if (type === 'scale' || type === 'all') object.scale = [1, 1, 1];
      return state;
    }),
    setParent: (childId, parentId) => update(state => {
      const child = state.objects.find(o => o.id === childId);
      const parent = state.objects.find(o => o.id === parentId);
      if (!child || !parent || child.id === parent.id) return state;
      // Guard against circular hierarchy cycles
      let cursor = parent;
      const visited = new Set();
      while (cursor?.parent) {
        if (cursor.parent === childId || visited.has(cursor.id)) return state;
        visited.add(cursor.id);
        cursor = state.objects.find(o => o.id === cursor.parent);
      }
      pushHistory(state);
      if (child.parent && child.parent !== parentId) {
        const oldParent = state.objects.find(o => o.id === child.parent);
        if (oldParent) oldParent.children = oldParent.children.filter(id => id !== childId);
      }
      child.parent = parentId;
      if (!parent.children.includes(childId)) parent.children.push(childId);
      return state;
    }),
    clearParent: childId => update(state => {
      const child = state.objects.find(o => o.id === childId);
      if (!child || !child.parent) return state;
      pushHistory(state);
      const parent = state.objects.find(o => o.id === child.parent);
      if (parent) {
        parent.children = parent.children.filter(id => id !== childId);
      }
      delete child.parent;
      return state;
    }),
    joinSelected: () => update(state => {
      const active = state.objects.find(o => o.id === state.selectedId);
      if (!active || !active.geometry) return state;
      const otherSelected = state.objects.filter(o => o.selected && o.id !== active.id && o.geometry);
      if (!otherSelected.length) return state;
      pushHistory(state);
      const meshesToJoin = [{
        mesh: active.geometry,
        position: [0, 0, 0],
        scale: [1, 1, 1]
      }, ...otherSelected.map(o => ({
        mesh: o.geometry,
        position: [(o.position[0] - active.position[0]) / active.scale[0], (o.position[1] - active.position[1]) / active.scale[1], (o.position[2] - active.position[2]) / active.scale[2]],
        scale: [o.scale[0] / active.scale[0], o.scale[1] / active.scale[1], o.scale[2] / active.scale[2]]
      }))];
      active.geometry = joinMeshes(meshesToJoin);
      active.geometryVersion++;
      const otherIds = new Set(otherSelected.map(o => o.id));
      state.objects = state.objects.filter(o => !otherIds.has(o.id));
      return state;
    }),
    clear: () => update(state => {
      pushHistory(state);
      state.objects = [];
      state.selectedId = null;
      state.score = 0;
      state.editMode = false;
      state.selectedVertices = [];
      state.selectedEdges = [];
      state.selectedFaces = [];
      return state;
    })
  };
}
export const sceneStore = createSceneStore();
export const selectedObject = derived(sceneStore, $scene => $scene.objects.find(o => o.id === $scene.selectedId) || null);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsic2NlbmUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgd3JpdGFibGUsIGRlcml2ZWQsIGdldCB9IGZyb20gJ3N2ZWx0ZS9zdG9yZSc7XG5pbXBvcnQgeyB0eXBlIFZlYzMsIGxvb2tBdEV1bGVyLCByb3RhdGVFdWxlciwgY2xhbXAgfSBmcm9tICcuLi9saWIvbWF0aDNkJztcbmltcG9ydCB7XG5cdGFycmF5TWVzaCxcblx0YXNzaWduRmFjZXNUb1Nsb3QsXG5cdGJha2VNZXNoVmVydGV4Q29sb3JzLFxuXHRidWlsZEdyb3Vwcyxcblx0Y2xvbmVNZXNoLFxuXHRjb21wdXRlUmFkaXVzLFxuXHRjb21wdXRlVmVydGV4Tm9ybWFscyxcblx0ZGVsZXRlRmFjZXMgYXMgZGVsZXRlTWVzaEZhY2VzLFxuXHRleHRydWRlRmFjZXMsXG5cdGZsaXBOb3JtYWxzLFxuXHRpbnNldEZhY2VzLFxuXHRtZXNoRm9yLFxuXHRtZXJnZUJ5RGlzdGFuY2UsXG5cdHNtb290aE1lc2hWZXJ0aWNlcyxcblx0c29saWRpZnlNZXNoLFxuXHRzdWJkaXZpZGUsXG5cdHVud3JhcE1lc2hVVixcblx0YnJpZGdlRWRnZUxvb3BzLFxuXHRtZXJnZVZlcnRpY2VzLFxuXHRkZWxldGVHZW9tZXRyeSxcblx0ZGlzc29sdmVHZW9tZXRyeSxcblx0ZHVwbGljYXRlTWVzaEdlb21ldHJ5LFxuXHRzZXBhcmF0ZUdlb21ldHJ5LFxuXHRtaXJyb3JNZXNoLFxuXHRkZWNpbWF0ZU1lc2gsXG5cdGRlY2ltYXRlTG9jYWwsXG5cdHNjcmV3U3Bpbk1lc2gsXG5cdGJvb2xlYW5NZXNoLFxuXHRqb2luTWVzaGVzLFxuXHRmYWNlQ2VudGVyLFxuXHRmYWNlTm9ybWFsLFxuXHR0eXBlIE1hdGVyaWFsU2xvdCxcblx0dHlwZSBNZXNoLFxufSBmcm9tICcuLi9saWIvbWVzaCc7XG5pbXBvcnQge1xuXHRiaXNlY3RNZXNoLFxuXHRjbGFzc2lmeUZhY2VzQnlQbGFuZSxcblx0ZXh0cnVkZVJlZ2lvbixcblx0b2Zmc2V0TWVzaCxcblx0dHlwZSBDdXRQbGFuZSxcbn0gZnJvbSAnLi4vbGliL2Jpc2VjdCc7XG5pbXBvcnQgeyBwcmVzZXRCeUlkLCBwcmVzZXRUb1Nsb3QsIHNsb3RGcm9tSW1hZ2UgfSBmcm9tICcuLi9saWIvbWF0ZXJpYWxzJztcbmltcG9ydCB7IGFzcGVjdFBsYW5lU2NhbGUsIHByaW1lTGF5ZXJUZXh0dXJlLCB0ZXh0VGV4dHVyZURhdGFVcmwgfSBmcm9tICcuLi9saWIvbWVkaWEnO1xuaW1wb3J0IHsgYmV2ZWxWZXJ0aWNlcywgbG9vcEN1dCB9IGZyb20gJy4uL2xpYi90b3BvbG9neSc7XG5pbXBvcnQgeyB0aW1lbGluZVN0b3JlLCB0eXBlIEFuaW1hdGlvblNuYXBzaG90IH0gZnJvbSAnLi90aW1lbGluZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FtZXJhUHJvcHMge1xuXHRmb3Y6IG51bWJlcjtcblx0dGFyZ2V0SWQ6IHN0cmluZyB8IG51bGw7XG5cdHRhcmdldE9mZnNldDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHR0cmFja2luZ01vZGU6ICdub25lJyB8ICdsb29rX2F0JyB8ICdmb2xsb3cnIHwgJ29yYml0Jztcblx0Zm9sbG93RGlzdGFuY2U6IG51bWJlcjtcblx0Zm9sbG93SGVpZ2h0OiBudW1iZXI7XG5cdGRhbXBpbmc6IG51bWJlcjtcblx0YWN0aXZlOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1hdGVyaWFsIHtcblx0ZW1pc3NpdmU6IHN0cmluZztcblx0b3BhY2l0eTogbnVtYmVyO1xuXHRtZXRhbG5lc3M6IG51bWJlcjtcblx0cm91Z2huZXNzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGh5c2ljc0JvZHkge1xuXHRkeW5hbWljOiBib29sZWFuO1xuXHR2ZWxvY2l0eTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRyZXN0aXR1dGlvbjogbnVtYmVyO1xuXHRob21lPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xufVxuXG5leHBvcnQgdHlwZSBFbGVtZW50S2luZCA9ICd2ZXJ0ZXgnIHwgJ2VkZ2UnIHwgJ2ZhY2UnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lT2JqZWN0IHtcblx0aWQ6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHR0eXBlOiBzdHJpbmc7XG5cdHBvc2l0aW9uOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdHJvdGF0aW9uOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdHNjYWxlOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdHJlc3RQb3NlPzoge1xuXHRcdHBvc2l0aW9uOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdFx0cm90YXRpb246IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcblx0XHRzY2FsZTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHR9O1xuXHRjb2xvcjogc3RyaW5nO1xuXHRtYXRlcmlhbDogTWF0ZXJpYWw7XG5cdGdlb21ldHJ5PzogTWVzaDtcblx0Z2VvbWV0cnlWZXJzaW9uOiBudW1iZXI7XG5cdGNvbG9yVmVyc2lvbjogbnVtYmVyO1xuXHRzZWxlY3Rpb25WZXJzaW9uOiBudW1iZXI7XG5cdHBoeXNpY3M6IFBoeXNpY3NCb2R5O1xuXHR2aXNpYmxlOiBib29sZWFuO1xuXHRsb2NrZWQ6IGJvb2xlYW47XG5cdHRpbWVsaW5lSGlkZGVuPzogYm9vbGVhbjtcblx0c2VsZWN0ZWQ6IGJvb2xlYW47XG5cdHRleHQ/OiBzdHJpbmc7XG5cdGRlcHRoOiBudW1iZXI7XG5cdHBhcmVudD86IHN0cmluZztcblx0Y2hpbGRyZW46IHN0cmluZ1tdO1xuXHRjYW1lcmFQcm9wcz86IENhbWVyYVByb3BzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lU3RhdGUge1xuXHRvYmplY3RzOiBTY2VuZU9iamVjdFtdO1xuXHRzZWxlY3RlZElkOiBzdHJpbmcgfCBudWxsO1xuXHRnYW1lTW9kZTogYm9vbGVhbjtcblx0c2NvcmU6IG51bWJlcjtcblx0ZWRpdE1vZGU6IGJvb2xlYW47XG5cdGVsZW1lbnRNb2RlOiBFbGVtZW50S2luZDtcblx0c2VsZWN0ZWRWZXJ0aWNlczogbnVtYmVyW107XG5cdHNlbGVjdGVkRWRnZXM6IG51bWJlcltdO1xuXHRzZWxlY3RlZEZhY2VzOiBudW1iZXJbXTtcblx0aG92ZXI6IHsga2luZDogRWxlbWVudEtpbmQ7IGluZGV4OiBudW1iZXIgfSB8IG51bGw7XG5cdG1hcmtlZEZhY2VzOiBudW1iZXJbXTtcblx0bWFya2VkT2JqZWN0SWQ6IHN0cmluZyB8IG51bGw7XG5cdHBvcnRpb25WZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2FtZUlucHV0IHtcblx0dXA6IGJvb2xlYW47XG5cdGRvd246IGJvb2xlYW47XG5cdGxlZnQ6IGJvb2xlYW47XG5cdHJpZ2h0OiBib29sZWFuO1xuXHRqdW1wOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByaW1pdGl2ZURlZmluaXRpb24ge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGljb246IHN0cmluZztcblx0Y29sb3I6IHN0cmluZztcblx0Y2F0ZWdvcnk/OiAnTWVzaCcgfCAnQ3VydmUnIHwgJ0xpZ2h0JyB8ICdDYW1lcmEnIHwgJ0VtcHR5JyB8ICdUZXh0JyB8ICdJbXBvcnQnIHwgJ01vcmUnO1xufVxuXG5leHBvcnQgY29uc3QgU1RVRElPX1dISVRFID0gJyNmZmZmZmYnO1xuXG5leHBvcnQgY29uc3QgUFJJTUlUSVZFUzogUHJpbWl0aXZlRGVmaW5pdGlvbltdID0gW1xuXHQvLyBNZXNoIFByaW1pdGl2ZXMgKE1vc3QgdXNlZCAtIHNob3cgZmlyc3QpXG5cdHsgdHlwZTogJ2N1YmUnLCBsYWJlbDogJ0N1YmUnLCBpY29uOiAnY3ViZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnTWVzaCcgfSxcblx0eyB0eXBlOiAnc3BoZXJlJywgbGFiZWw6ICdVViBTcGhlcmUnLCBpY29uOiAnc3BoZXJlJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdNZXNoJyB9LFxuXHR7IHR5cGU6ICdpY29zcGhlcmUnLCBsYWJlbDogJ0ljbyBTcGhlcmUnLCBpY29uOiAnc3BoZXJlJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdNZXNoJyB9LFxuXHR7IHR5cGU6ICdjeWxpbmRlcicsIGxhYmVsOiAnQ3lsaW5kZXInLCBpY29uOiAnY3lsaW5kZXInLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ01lc2gnIH0sXG5cdHsgdHlwZTogJ2NvbmUnLCBsYWJlbDogJ0NvbmUnLCBpY29uOiAnY29uZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnTWVzaCcgfSxcblx0eyB0eXBlOiAndG9ydXMnLCBsYWJlbDogJ1RvcnVzJywgaWNvbjogJ3RvcnVzJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdNZXNoJyB9LFxuXHR7IHR5cGU6ICdwbGFuZScsIGxhYmVsOiAnUGxhbmUnLCBpY29uOiAncGxhbmUnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ01lc2gnIH0sXG5cdHsgdHlwZTogJ2NpcmNsZScsIGxhYmVsOiAnQ2lyY2xlJywgaWNvbjogJ3RvcnVzJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdNZXNoJyB9LFxuXHR7IHR5cGU6ICdncmlkJywgbGFiZWw6ICdHcmlkJywgaWNvbjogJ3BsYW5lJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdNZXNoJyB9LFxuXHR7IHR5cGU6ICdweXJhbWlkJywgbGFiZWw6ICdQeXJhbWlkJywgaWNvbjogJ2NvbmUnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ01lc2gnIH0sXG5cdHsgdHlwZTogJ3R1YmUnLCBsYWJlbDogJ1R1YmUnLCBpY29uOiAnY3lsaW5kZXInLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ01lc2gnIH0sXG5cdHsgdHlwZTogJ2NhcHN1bGUnLCBsYWJlbDogJ0NhcHN1bGUnLCBpY29uOiAnc3BoZXJlJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdNZXNoJyB9LFxuXG5cdC8vIEN1cnZlc1xuXHR7IHR5cGU6ICdjdXJ2ZV9iZXppZXInLCBsYWJlbDogJ0JlemllciBDdXJ2ZScsIGljb246ICdjdXJ2ZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnQ3VydmUnIH0sXG5cdHsgdHlwZTogJ2N1cnZlX2NpcmNsZScsIGxhYmVsOiAnQmV6aWVyIENpcmNsZScsIGljb246ICd0b3J1cycsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnQ3VydmUnIH0sXG5cdHsgdHlwZTogJ2N1cnZlX3BhdGgnLCBsYWJlbDogJ1BhdGgnLCBpY29uOiAnY3VydmUnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ0N1cnZlJyB9LFxuXHR7IHR5cGU6ICdjdXJ2ZV9udXJicycsIGxhYmVsOiAnTlVSQlMgQ3VydmUnLCBpY29uOiAnY3VydmUnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ0N1cnZlJyB9LFxuXG5cdC8vIExpZ2h0c1xuXHR7IHR5cGU6ICdsaWdodCcsIGxhYmVsOiAnUG9pbnQgTGlnaHQnLCBpY29uOiAnbGFtcCcsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnTGlnaHQnIH0sXG5cdHsgdHlwZTogJ2xpZ2h0X3N1bicsIGxhYmVsOiAnU3VuIExpZ2h0JywgaWNvbjogJ2xhbXAnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ0xpZ2h0JyB9LFxuXHR7IHR5cGU6ICdsaWdodF9zcG90JywgbGFiZWw6ICdTcG90IExpZ2h0JywgaWNvbjogJ2xhbXAnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ0xpZ2h0JyB9LFxuXHR7IHR5cGU6ICdsaWdodF9hcmVhJywgbGFiZWw6ICdBcmVhIExpZ2h0JywgaWNvbjogJ2xhbXAnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ0xpZ2h0JyB9LFxuXG5cdC8vIENhbWVyYXNcblx0eyB0eXBlOiAnY2FtZXJhJywgbGFiZWw6ICdQZXJzcGVjdGl2ZScsIGljb246ICdjYW1lcmEnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ0NhbWVyYScgfSxcblx0eyB0eXBlOiAnY2FtZXJhX29ydGhvJywgbGFiZWw6ICdPcnRob2dyYXBoaWMnLCBpY29uOiAnY2FtZXJhJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdDYW1lcmEnIH0sXG5cblx0Ly8gRW1wdGllcyAvIEhlbHBlcnNcblx0eyB0eXBlOiAnZW1wdHlfYXhlcycsIGxhYmVsOiAnUGxhaW4gQXhlcycsIGljb246ICdtb3ZlJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdFbXB0eScgfSxcblx0eyB0eXBlOiAnZW1wdHlfYXJyb3dzJywgbGFiZWw6ICdBcnJvd3MnLCBpY29uOiAnbW92ZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnRW1wdHknIH0sXG5cdHsgdHlwZTogJ2VtcHR5X2N1YmUnLCBsYWJlbDogJ0N1YmUgRW1wdHknLCBpY29uOiAnY3ViZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnRW1wdHknIH0sXG5cdHsgdHlwZTogJ2VtcHR5X3NwaGVyZScsIGxhYmVsOiAnU3BoZXJlIEVtcHR5JywgaWNvbjogJ3NwaGVyZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnRW1wdHknIH0sXG5cdHsgdHlwZTogJ2VtcHR5X2NpcmNsZScsIGxhYmVsOiAnQ2lyY2xlIEVtcHR5JywgaWNvbjogJ3RvcnVzJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdFbXB0eScgfSxcblx0eyB0eXBlOiAnZW1wdHlfaW1hZ2UnLCBsYWJlbDogJ0ltYWdlIEVtcHR5JywgaWNvbjogJ3Bob3RvJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdFbXB0eScgfSxcblxuXHQvLyAzRCBUZXh0XG5cdHsgdHlwZTogJ3RleHRfM2QnLCBsYWJlbDogJzNEIFRleHQnLCBpY29uOiAndGV4dCcsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnVGV4dCcgfSxcblxuXHQvLyBJbXBvcnQgJiBBc3NldCBMaWJyYXJ5XG5cdHsgdHlwZTogJ2ltcG9ydF9kZXZpY2UnLCBsYWJlbDogJ0RldmljZSBNb2RlbCcsIGljb246ICdjdWJlJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdJbXBvcnQnIH0sXG5cdHsgdHlwZTogJ2ltcG9ydF9waG90bycsIGxhYmVsOiAnUmVmZXJlbmNlIEltYWdlJywgaWNvbjogJ3Bob3RvJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdJbXBvcnQnIH0sXG5cdHsgdHlwZTogJ2Fzc2V0X3N1emFubmUnLCBsYWJlbDogJ1N1emFubmUgTW9ua2V5JywgaWNvbjogJ3NwaGVyZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnSW1wb3J0JyB9LFxuXHR7IHR5cGU6ICdhc3NldF90cmVlJywgbGFiZWw6ICdTdHlsaXplZCBUcmVlJywgaWNvbjogJ2N5bGluZGVyJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdJbXBvcnQnIH0sXG5cdHsgdHlwZTogJ2Fzc2V0X2NhcicsIGxhYmVsOiAnU3R5bGl6ZWQgQ2FyJywgaWNvbjogJ2N1YmUnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ0ltcG9ydCcgfSxcblx0eyB0eXBlOiAnYXNzZXRfY2hhcmFjdGVyJywgbGFiZWw6ICdDaGFyYWN0ZXInLCBpY29uOiAnYm9uZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnSW1wb3J0JyB9LFxuXHR7IHR5cGU6ICdhc3NldF9jaGFpcicsIGxhYmVsOiAnTW9kZXJuIENoYWlyJywgaWNvbjogJ2N1YmUnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ0ltcG9ydCcgfSxcblxuXHQvLyBBZHZhbmNlZCAvIE1vcmVcblx0eyB0eXBlOiAnYm9uZScsIGxhYmVsOiAnQXJtYXR1cmUgQm9uZScsIGljb246ICdib25lJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdNb3JlJyB9LFxuXHR7IHR5cGU6ICdtZXRhYmFsbCcsIGxhYmVsOiAnTWV0YWJhbGwnLCBpY29uOiAnc3BoZXJlJywgY29sb3I6IFNUVURJT19XSElURSwgY2F0ZWdvcnk6ICdNb3JlJyB9LFxuXHR7IHR5cGU6ICdsYXR0aWNlJywgbGFiZWw6ICdMYXR0aWNlIENhZ2UnLCBpY29uOiAnY3ViZScsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnTW9yZScgfSxcblx0eyB0eXBlOiAnZm9yY2VmaWVsZCcsIGxhYmVsOiAnRm9yY2UgRmllbGQnLCBpY29uOiAndG9ydXMnLCBjb2xvcjogU1RVRElPX1dISVRFLCBjYXRlZ29yeTogJ01vcmUnIH0sXG5cdHsgdHlwZTogJ3NwZWFrZXInLCBsYWJlbDogJ0F1ZGlvIFNwZWFrZXInLCBpY29uOiAnbGFtcCcsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnTW9yZScgfSxcblx0eyB0eXBlOiAnY29pbicsIGxhYmVsOiAnQ29pbiBQbGF0ZScsIGljb246ICd0b3J1cycsIGNvbG9yOiBTVFVESU9fV0hJVEUsIGNhdGVnb3J5OiAnTW9yZScgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZhdWx0Q3JlYXRpb25QYXJhbXModHlwZTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgYW55PiB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgJ3NwaGVyZSc6IHJldHVybiB7IHNlZ21lbnRzOiAzMiwgcmluZ3M6IDE2LCByYWRpdXM6IDAuNSB9O1xuXHRcdGNhc2UgJ2ljb3NwaGVyZSc6IHJldHVybiB7IHN1YmRpdmlzaW9uczogMSwgcmFkaXVzOiAwLjUgfTtcblx0XHRjYXNlICdjeWxpbmRlcic6IHJldHVybiB7IHNlZ21lbnRzOiAzMiwgcmFkaXVzOiAwLjUsIGhlaWdodDogMS4wIH07XG5cdFx0Y2FzZSAnY29uZSc6IHJldHVybiB7IHNlZ21lbnRzOiAzMiwgcmFkaXVzOiAwLjUsIGhlaWdodDogMS4wIH07XG5cdFx0Y2FzZSAndG9ydXMnOiByZXR1cm4geyBzZWdtZW50czogMzIsIHNpZGVzOiAxNiwgcmFkaXVzOiAwLjM1LCB0dWJlOiAwLjE1IH07XG5cdFx0Y2FzZSAnY3ViZSc6IHJldHVybiB7IHNpemVYOiAxLjAsIHNpemVZOiAxLjAsIHNpemVaOiAxLjAgfTtcblx0XHRjYXNlICdwbGFuZSc6IHJldHVybiB7IHNpemVYOiAyLjQsIHNpemVaOiAyLjQgfTtcblx0XHRjYXNlICdjaXJjbGUnOiByZXR1cm4geyBzZWdtZW50czogMzIsIHJhZGl1czogMC41IH07XG5cdFx0Y2FzZSAnZ3JpZCc6IHJldHVybiB7IHN1YmRpdlg6IDQsIHN1YmRpdlk6IDQsIHNpemVYOiAyLjAsIHNpemVZOiAyLjAgfTtcblx0XHRjYXNlICdweXJhbWlkJzogcmV0dXJuIHsgc2lkZXM6IDQsIHJhZGl1czogMC41LCBoZWlnaHQ6IDEuMCB9O1xuXHRcdGNhc2UgJ3R1YmUnOiByZXR1cm4geyBzZWdtZW50czogMjQsIGlubmVyUmFkaXVzOiAwLjMsIG91dGVyUmFkaXVzOiAwLjUsIGhlaWdodDogMS4wIH07XG5cdFx0Y2FzZSAnY2Fwc3VsZSc6IHJldHVybiB7IHNlZ21lbnRzOiAyMCwgcmluZ3M6IDYsIHJhZGl1czogMC4yNSwgaGVpZ2h0OiAwLjYgfTtcblx0XHRjYXNlICdsaWdodCc6XG5cdFx0Y2FzZSAnbGlnaHRfcG9pbnQnOiByZXR1cm4geyBpbnRlbnNpdHk6IDEuMCwgY29sb3I6ICcjZmZmZmZmJywgcmFkaXVzOiA1LjAgfTtcblx0XHRjYXNlICdsaWdodF9zdW4nOiByZXR1cm4geyBpbnRlbnNpdHk6IDEuNSwgY29sb3I6ICcjZmZmOWU2JywgYW5nbGU6IDQ1IH07XG5cdFx0Y2FzZSAnbGlnaHRfc3BvdCc6IHJldHVybiB7IGludGVuc2l0eTogMi4wLCBjb2xvcjogJyNmZmZmZmYnLCBzcG90QW5nbGU6IDQ1LCByYWRpdXM6IDguMCB9O1xuXHRcdGNhc2UgJ2xpZ2h0X2FyZWEnOiByZXR1cm4geyBpbnRlbnNpdHk6IDEuMiwgY29sb3I6ICcjZmZmZmZmJywgc2l6ZVg6IDEuMCwgc2l6ZVk6IDEuMCB9O1xuXHRcdGNhc2UgJ2NhbWVyYSc6XG5cdFx0Y2FzZSAnY2FtZXJhX3BlcnNwZWN0aXZlJzogcmV0dXJuIHsgZm92OiA0NSwgbmVhcjogMC4xLCBmYXI6IDEwMCB9O1xuXHRcdGNhc2UgJ2NhbWVyYV9vcnRobyc6IHJldHVybiB7IG9ydGhvU2NhbGU6IDQuMCwgbmVhcjogMC4xLCBmYXI6IDEwMCB9O1xuXHRcdGNhc2UgJ3RleHRfM2QnOiByZXR1cm4geyB0ZXh0OiAnM0QgVGV4dCcsIGRlcHRoOiAwLjIsIGJldmVsOiAwLjAyIH07XG5cdFx0ZGVmYXVsdDogcmV0dXJuIHt9O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpY29uRm9yVHlwZSh0eXBlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBtZWRpYUljb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyB0ZXh0OiAndGV4dCcsIGltYWdlOiAncGhvdG8nLCB2aWRlbzogJ3ZpZGVvJyB9O1xuXHRyZXR1cm4gbWVkaWFJY29uc1t0eXBlXSA/PyBQUklNSVRJVkVTLmZpbmQoKHByaW1pdGl2ZSkgPT4gcHJpbWl0aXZlLnR5cGUgPT09IHR5cGUpPy5pY29uID8/ICdjdWJlJztcbn1cblxuY29uc3QgZGVmYXVsdE1hdGVyaWFsID0gKCk6IE1hdGVyaWFsID0+ICh7IGVtaXNzaXZlOiAnIzAwMDAwMCcsIG9wYWNpdHk6IDEsIG1ldGFsbmVzczogMC4wNCwgcm91Z2huZXNzOiAwLjM2IH0pO1xuY29uc3QgZGVmYXVsdFBoeXNpY3MgPSAoKTogUGh5c2ljc0JvZHkgPT4gKHsgZHluYW1pYzogZmFsc2UsIHZlbG9jaXR5OiBbMCwgMCwgMF0sIHJlc3RpdHV0aW9uOiAwLjQ1IH0pO1xuXG5jb25zdCBpbml0aWFsU3RhdGU6IFNjZW5lU3RhdGUgPSB7XG5cdG9iamVjdHM6IFtdLFxuXHRzZWxlY3RlZElkOiBudWxsLFxuXHRnYW1lTW9kZTogZmFsc2UsXG5cdHNjb3JlOiAwLFxuXHRlZGl0TW9kZTogZmFsc2UsXG5cdGVsZW1lbnRNb2RlOiAndmVydGV4Jyxcblx0c2VsZWN0ZWRWZXJ0aWNlczogW10sXG5cdHNlbGVjdGVkRWRnZXM6IFtdLFxuXHRzZWxlY3RlZEZhY2VzOiBbXSxcblx0aG92ZXI6IG51bGwsXG5cdG1hcmtlZEZhY2VzOiBbXSxcblx0bWFya2VkT2JqZWN0SWQ6IG51bGwsXG5cdHBvcnRpb25WZXJzaW9uOiAwLFxufTtcblxuY29uc3QgZ2FtZUlucHV0OiBHYW1lSW5wdXQgPSB7IHVwOiBmYWxzZSwgZG93bjogZmFsc2UsIGxlZnQ6IGZhbHNlLCByaWdodDogZmFsc2UsIGp1bXA6IGZhbHNlIH07XG5cbmxldCBpZENvdW50ZXIgPSAxO1xuY29uc3QgTUFYX0hJU1RPUlkgPSA4MDtcblxuLyoqIENhY2hlZCB2ZXJ0ZXggYWRqYWNlbmN5IHBlciBtZXNoIHRvIGF2b2lkIE8oRSkgcmVidWlsZHMgb24gZXZlcnkgc2N1bHB0IGJydXNoIHRpY2suICovXG5jb25zdCBhZGphY2VuY3lDYWNoZSA9IG5ldyBXZWFrTWFwPE1lc2gsIE1hcDxudW1iZXIsIG51bWJlcltdPj4oKTtcbmZ1bmN0aW9uIG1lc2hBZGphY2VuY3kobWVzaDogTWVzaCk6IE1hcDxudW1iZXIsIG51bWJlcltdPiB7XG5cdGxldCBhZGogPSBhZGphY2VuY3lDYWNoZS5nZXQobWVzaCk7XG5cdGlmIChhZGopIHJldHVybiBhZGo7XG5cdGFkaiA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXJbXT4oKTtcblx0Zm9yIChjb25zdCBbYSwgYl0gb2YgbWVzaC5lZGdlcykge1xuXHRcdGxldCBsYSA9IGFkai5nZXQoYSk7XG5cdFx0aWYgKCFsYSkgeyBsYSA9IFtdOyBhZGouc2V0KGEsIGxhKTsgfVxuXHRcdGxhLnB1c2goYik7XG5cdFx0bGV0IGxiID0gYWRqLmdldChiKTtcblx0XHRpZiAoIWxiKSB7IGxiID0gW107IGFkai5zZXQoYiwgbGIpOyB9XG5cdFx0bGIucHVzaChhKTtcblx0fVxuXHRhZGphY2VuY3lDYWNoZS5zZXQobWVzaCwgYWRqKTtcblx0cmV0dXJuIGFkajtcbn1cblxudHlwZSBUUlMgPSB7XG5cdHBvc2l0aW9uOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdHJvdGF0aW9uOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdHNjYWxlOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG59O1xuXG50eXBlIEhpc3RvcnlFbnRyeSA9XG5cdHwgeyBraW5kOiAnc2NlbmUnOyBzdGF0ZTogU2NlbmVTdGF0ZSB9XG5cdHwgeyBraW5kOiAndHJhbnNmb3JtJzsgYmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBUUlM+OyBhZnRlcjogUmVjb3JkPHN0cmluZywgVFJTPjsgYW5pbUJlZm9yZT86IEFuaW1hdGlvblNuYXBzaG90OyBhbmltQWZ0ZXI/OiBBbmltYXRpb25TbmFwc2hvdCB9XG5cdHwgeyBraW5kOiAnYW5pbWF0aW9uJzsgYmVmb3JlOiBBbmltYXRpb25TbmFwc2hvdDsgYWZ0ZXI6IEFuaW1hdGlvblNuYXBzaG90IH1cblx0fCB7XG5cdFx0XHRraW5kOiAnbWVzaCc7XG5cdFx0XHRvYmplY3RJZDogc3RyaW5nO1xuXHRcdFx0aW5kaWNlczogbnVtYmVyW107XG5cdFx0XHRiZWZvcmU6IG51bWJlcltdO1xuXHRcdFx0YWZ0ZXI6IG51bWJlcltdO1xuXHRcdFx0dHJhbnNmb3JtczogeyBiZWZvcmU6IFJlY29yZDxzdHJpbmcsIFRSUz47IGFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBUUlM+IH0gfCBudWxsO1xuXHRcdH07XG5cbnR5cGUgVHJhbnNmb3JtU25hcHNob3QgPSB7XG5cdG1vZGU6ICd0cmFuc2Zvcm0nIHwgJ2dlb21ldHJ5Jztcblx0b2JqZWN0SWQ6IHN0cmluZyB8IG51bGw7XG5cdHRyYW5zZm9ybXM6IFJlY29yZDxzdHJpbmcsIFRSUz47XG5cdHZlcnRpY2VzOiBGbG9hdDMyQXJyYXkgfCBudWxsO1xufTtcblxubGV0IHRyYW5zZm9ybVNuYXBzaG90OiBUcmFuc2Zvcm1TbmFwc2hvdCB8IG51bGwgPSBudWxsO1xubGV0IGFuaW1hdGlvblNuYXBzaG90OiBBbmltYXRpb25TbmFwc2hvdCB8IG51bGwgPSBudWxsO1xuXG5mdW5jdGlvbiBuZXh0SWQoKTogc3RyaW5nIHtcblx0cmV0dXJuIGBvYmotJHtpZENvdW50ZXIrK31gO1xufVxuXG5mdW5jdGlvbiBjbG9uZU9iamVjdChvYmplY3Q6IFNjZW5lT2JqZWN0KTogU2NlbmVPYmplY3Qge1xuXHRyZXR1cm4ge1xuXHRcdC4uLm9iamVjdCxcblx0XHRwb3NpdGlvbjogWy4uLm9iamVjdC5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdHJvdGF0aW9uOiBbLi4ub2JqZWN0LnJvdGF0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0c2NhbGU6IFsuLi5vYmplY3Quc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRyZXN0UG9zZTogb2JqZWN0LnJlc3RQb3NlXG5cdFx0XHQ/IHtcblx0XHRcdFx0XHRwb3NpdGlvbjogWy4uLm9iamVjdC5yZXN0UG9zZS5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4ub2JqZWN0LnJlc3RQb3NlLnJvdGF0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdFx0c2NhbGU6IFsuLi5vYmplY3QucmVzdFBvc2Uuc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0fVxuXHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0Y2hpbGRyZW46IFsuLi5vYmplY3QuY2hpbGRyZW5dLFxuXHRcdG1hdGVyaWFsOiB7IC4uLm9iamVjdC5tYXRlcmlhbCB9LFxuXHRcdHBoeXNpY3M6IHtcblx0XHRcdC4uLm9iamVjdC5waHlzaWNzLFxuXHRcdFx0dmVsb2NpdHk6IFsuLi5vYmplY3QucGh5c2ljcy52ZWxvY2l0eV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0aG9tZTogb2JqZWN0LnBoeXNpY3MuaG9tZSA/IChbLi4ub2JqZWN0LnBoeXNpY3MuaG9tZV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdKSA6IHVuZGVmaW5lZCxcblx0XHR9LFxuXHRcdGdlb21ldHJ5OiBvYmplY3QuZ2VvbWV0cnkgPyBjbG9uZU1lc2gob2JqZWN0Lmdlb21ldHJ5KSA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gY2xvbmVPYmplY3RzKG9iamVjdHM6IFNjZW5lT2JqZWN0W10pOiBTY2VuZU9iamVjdFtdIHtcblx0cmV0dXJuIG9iamVjdHMubWFwKGNsb25lT2JqZWN0KTtcbn1cblxuZnVuY3Rpb24gY2xvbmVTdGF0ZShzdGF0ZTogU2NlbmVTdGF0ZSk6IFNjZW5lU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdC4uLnN0YXRlLFxuXHRcdG9iamVjdHM6IGNsb25lT2JqZWN0cyhzdGF0ZS5vYmplY3RzKSxcblx0XHRzZWxlY3RlZFZlcnRpY2VzOiBbLi4uc3RhdGUuc2VsZWN0ZWRWZXJ0aWNlc10sXG5cdFx0c2VsZWN0ZWRFZGdlczogWy4uLnN0YXRlLnNlbGVjdGVkRWRnZXNdLFxuXHRcdHNlbGVjdGVkRmFjZXM6IFsuLi5zdGF0ZS5zZWxlY3RlZEZhY2VzXSxcblx0XHRob3Zlcjogc3RhdGUuaG92ZXIgPyB7IC4uLnN0YXRlLmhvdmVyIH0gOiBudWxsLFxuXHRcdG1hcmtlZEZhY2VzOiBbLi4uc3RhdGUubWFya2VkRmFjZXNdLFxuXHRcdG1hcmtlZE9iamVjdElkOiBzdGF0ZS5tYXJrZWRPYmplY3RJZCxcblx0XHRwb3J0aW9uVmVyc2lvbjogc3RhdGUucG9ydGlvblZlcnNpb24sXG5cdH07XG59XG5cbmZ1bmN0aW9uIHVuaXF1ZU5hbWUob2JqZWN0czogU2NlbmVPYmplY3RbXSwgYmFzZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgbmFtZXMgPSBuZXcgU2V0KG9iamVjdHMubWFwKChvYmplY3QpID0+IG9iamVjdC5uYW1lKSk7XG5cdGlmICghbmFtZXMuaGFzKGJhc2UpKSByZXR1cm4gYmFzZTtcblx0bGV0IGluZGV4ID0gMTtcblx0d2hpbGUgKG5hbWVzLmhhcyhgJHtiYXNlfS4ke1N0cmluZyhpbmRleCkucGFkU3RhcnQoMywgJzAnKX1gKSkgaW5kZXgrKztcblx0cmV0dXJuIGAke2Jhc2V9LiR7U3RyaW5nKGluZGV4KS5wYWRTdGFydCgzLCAnMCcpfWA7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRUcmFuc2Zvcm0odHlwZTogc3RyaW5nLCBpbmRleDogbnVtYmVyKSB7XG5cdGlmICh0eXBlID09PSAncGxhbmUnKSByZXR1cm4geyBwb3NpdGlvbjogWzAsIDAuMDIsIDBdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgcm90YXRpb246IFswLCAwLCAwXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sIHNjYWxlOiBbMi40LCAxLCAyLjRdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB9O1xuXHRpZiAodHlwZSA9PT0gJ2xpZ2h0JykgcmV0dXJuIHsgcG9zaXRpb246IFsyLjUsIDMuNSwgMi41XSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sIHJvdGF0aW9uOiBbMCwgMCwgMF0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLCBzY2FsZTogWzEsIDEsIDFdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB9O1xuXHRpZiAodHlwZSA9PT0gJ2NhbWVyYScpIHJldHVybiB7IHBvc2l0aW9uOiBbMy4yLCAyLjIsIDQuMl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLCByb3RhdGlvbjogWy0wLjI1LCAwLjY1LCAwXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sIHNjYWxlOiBbMSwgMSwgMV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdIH07XG5cdGNvbnN0IGFuZ2xlID0gaW5kZXggKiAyLjM5OTk2Mztcblx0Y29uc3QgcmFkaXVzID0gaW5kZXggPT09IDAgPyAwIDogMS4yNSAqIE1hdGguc3FydChpbmRleCk7XG5cdHJldHVybiB7XG5cdFx0cG9zaXRpb246IFtNYXRoLmNvcyhhbmdsZSkgKiByYWRpdXMsIHR5cGUgPT09ICdjb2luJyA/IDAuNSA6IDAuNSwgTWF0aC5zaW4oYW5nbGUpICogcmFkaXVzXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0cm90YXRpb246IFswLCAwLCAwXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0c2NhbGU6ICh0eXBlID09PSAnY29pbicgPyBbMS4xLCAxLCAxLjFdIDogWzEsIDEsIDFdKSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIHVuaXF1ZVNvcnRlZCh2YWx1ZXM6IG51bWJlcltdKTogbnVtYmVyW10ge1xuXHRyZXR1cm4gWy4uLm5ldyBTZXQodmFsdWVzKV0uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTY2VuZVN0b3JlKCkge1xuXHRjb25zdCB7IHN1YnNjcmliZSwgc2V0LCB1cGRhdGUgfSA9IHdyaXRhYmxlPFNjZW5lU3RhdGU+KGluaXRpYWxTdGF0ZSk7XG5cdGNvbnN0IHBhc3Q6IEhpc3RvcnlFbnRyeVtdID0gW107XG5cdGNvbnN0IGZ1dHVyZTogSGlzdG9yeUVudHJ5W10gPSBbXTtcblxuXHRmdW5jdGlvbiBwdXNoSGlzdG9yeShzdGF0ZTogU2NlbmVTdGF0ZSkge1xuXHRcdHBhc3QucHVzaCh7IGtpbmQ6ICdzY2VuZScsIHN0YXRlOiBjbG9uZVN0YXRlKHN0YXRlKSB9KTtcblx0XHRpZiAocGFzdC5sZW5ndGggPiBNQVhfSElTVE9SWSkgcGFzdC5zaGlmdCgpO1xuXHRcdGZ1dHVyZS5sZW5ndGggPSAwO1xuXHR9XG5cblx0ZnVuY3Rpb24gdHJpbUhpc3RvcnkoKSB7XG5cdFx0aWYgKHBhc3QubGVuZ3RoID4gTUFYX0hJU1RPUlkpIHBhc3QubGVuZ3RoID0gTUFYX0hJU1RPUlk7XG5cdFx0aWYgKGZ1dHVyZS5sZW5ndGggPiBNQVhfSElTVE9SWSkgZnV0dXJlLmxlbmd0aCA9IE1BWF9ISVNUT1JZO1xuXHR9XG5cblx0ZnVuY3Rpb24gYW5pbWF0aW9uRGF0YUtleShzbmFwc2hvdDogQW5pbWF0aW9uU25hcHNob3QpOiBzdHJpbmcge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRrZXlmcmFtZXM6IHNuYXBzaG90LmtleWZyYW1lcyxcblx0XHRcdGN1cnZlczogc25hcHNob3QuY3VydmVzLFxuXHRcdFx0c3RyaXBzOiBzbmFwc2hvdC5zdHJpcHMsXG5cdFx0XHRjbGlwczogc25hcHNob3QuY2xpcHMsXG5cdFx0XHRkdXJhdGlvbjogc25hcHNob3QuZHVyYXRpb24sXG5cdFx0XHRsb29wOiBzbmFwc2hvdC5sb29wLFxuXHRcdFx0ZWFzaW5nOiBzbmFwc2hvdC5lYXNpbmcsXG5cdFx0XHRmcmFtZVJhdGU6IHNuYXBzaG90LmZyYW1lUmF0ZSxcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNhcHR1cmVUcmFuc2Zvcm1zKHN0YXRlOiBTY2VuZVN0YXRlKTogUmVjb3JkPHN0cmluZywgVFJTPiB7XG5cdFx0Y29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBUUlM+ID0ge307XG5cdFx0Zm9yIChjb25zdCBvYmplY3Qgb2Ygc3RhdGUub2JqZWN0cykge1xuXHRcdFx0b3V0W29iamVjdC5pZF0gPSB7XG5cdFx0XHRcdHBvc2l0aW9uOiBbLi4ub2JqZWN0LnBvc2l0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdHJvdGF0aW9uOiBbLi4ub2JqZWN0LnJvdGF0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdHNjYWxlOiBbLi4ub2JqZWN0LnNjYWxlXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2FtZVRyYW5zZm9ybShhOiBUUlMgfCB1bmRlZmluZWQsIGI6IFRSUyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghYSB8fCAhYikgcmV0dXJuIGEgPT09IGI7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcblx0XHRcdGlmIChNYXRoLmFicyhhLnBvc2l0aW9uW2ldIC0gYi5wb3NpdGlvbltpXSkgPiAxZS02KSByZXR1cm4gZmFsc2U7XG5cdFx0XHRpZiAoTWF0aC5hYnMoYS5yb3RhdGlvbltpXSAtIGIucm90YXRpb25baV0pID4gMWUtNikgcmV0dXJuIGZhbHNlO1xuXHRcdFx0aWYgKE1hdGguYWJzKGEuc2NhbGVbaV0gLSBiLnNjYWxlW2ldKSA+IDFlLTYpIHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRmdW5jdGlvbiBkaWZmVHJhbnNmb3JtcyhiZWZvcmU6IFJlY29yZDxzdHJpbmcsIFRSUz4sIGFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBUUlM+KSB7XG5cdFx0Y29uc3QgY2hhbmdlZEJlZm9yZTogUmVjb3JkPHN0cmluZywgVFJTPiA9IHt9O1xuXHRcdGNvbnN0IGNoYW5nZWRBZnRlcjogUmVjb3JkPHN0cmluZywgVFJTPiA9IHt9O1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBPYmplY3Qua2V5cyhhZnRlcikpIHtcblx0XHRcdGlmIChzYW1lVHJhbnNmb3JtKGJlZm9yZVtpZF0sIGFmdGVyW2lkXSkpIGNvbnRpbnVlO1xuXHRcdFx0Y2hhbmdlZEJlZm9yZVtpZF0gPSBiZWZvcmVbaWRdO1xuXHRcdFx0Y2hhbmdlZEFmdGVyW2lkXSA9IGFmdGVyW2lkXTtcblx0XHRcdGNvdW50Kys7XG5cdFx0fVxuXHRcdHJldHVybiBjb3VudCA/IHsgYmVmb3JlOiBjaGFuZ2VkQmVmb3JlLCBhZnRlcjogY2hhbmdlZEFmdGVyIH0gOiBudWxsO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVzdG9yZVNuYXBzaG90KHN0YXRlOiBTY2VuZVN0YXRlLCBzbmFwc2hvdDogU2NlbmVTdGF0ZSkge1xuXHRcdHN0YXRlLm9iamVjdHMgPSBzbmFwc2hvdC5vYmplY3RzO1xuXHRcdHN0YXRlLnNlbGVjdGVkSWQgPSBzbmFwc2hvdC5zZWxlY3RlZElkO1xuXHRcdHN0YXRlLmVkaXRNb2RlID0gc25hcHNob3QuZWRpdE1vZGU7XG5cdFx0c3RhdGUuZWxlbWVudE1vZGUgPSBzbmFwc2hvdC5lbGVtZW50TW9kZTtcblx0XHRzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzID0gc25hcHNob3Quc2VsZWN0ZWRWZXJ0aWNlcztcblx0XHRzdGF0ZS5zZWxlY3RlZEVkZ2VzID0gc25hcHNob3Quc2VsZWN0ZWRFZGdlcztcblx0XHRzdGF0ZS5zZWxlY3RlZEZhY2VzID0gc25hcHNob3Quc2VsZWN0ZWRGYWNlcztcblx0XHRzdGF0ZS5tYXJrZWRGYWNlcyA9IHNuYXBzaG90Lm1hcmtlZEZhY2VzO1xuXHRcdHN0YXRlLm1hcmtlZE9iamVjdElkID0gc25hcHNob3QubWFya2VkT2JqZWN0SWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBhcHBseVRyYW5zZm9ybXMoc3RhdGU6IFNjZW5lU3RhdGUsIHRyYW5zZm9ybXM6IFJlY29yZDxzdHJpbmcsIFRSUz4pIHtcblx0XHRmb3IgKGNvbnN0IG9iamVjdCBvZiBzdGF0ZS5vYmplY3RzKSB7XG5cdFx0XHRjb25zdCB0cnMgPSB0cmFuc2Zvcm1zW29iamVjdC5pZF07XG5cdFx0XHRpZiAoIXRycykgY29udGludWU7XG5cdFx0XHRvYmplY3QucG9zaXRpb24gPSBbLi4udHJzLnBvc2l0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdFx0XHRvYmplY3Qucm90YXRpb24gPSBbLi4udHJzLnJvdGF0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdFx0XHRvYmplY3Quc2NhbGUgPSBbLi4udHJzLnNjYWxlXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc2xvdEZyb21PYmplY3Qob2JqZWN0OiBTY2VuZU9iamVjdCk6IE1hdGVyaWFsU2xvdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG9iamVjdC5uYW1lLFxuXHRcdFx0Y29sb3I6IG9iamVjdC5jb2xvcixcblx0XHRcdGVtaXNzaXZlOiBvYmplY3QubWF0ZXJpYWwuZW1pc3NpdmUsXG5cdFx0XHRlbWlzc2l2ZVN0cmVuZ3RoOiAxLFxuXHRcdFx0bWV0YWxuZXNzOiBvYmplY3QubWF0ZXJpYWwubWV0YWxuZXNzLFxuXHRcdFx0cm91Z2huZXNzOiBvYmplY3QubWF0ZXJpYWwucm91Z2huZXNzLFxuXHRcdFx0b3BhY2l0eTogb2JqZWN0Lm1hdGVyaWFsLm9wYWNpdHksXG5cdFx0XHR1dlJlcGVhdDogMSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWF0ZXJpYWxpemVHZW9tZXRyeShvYmplY3Q6IFNjZW5lT2JqZWN0KTogTWVzaCB7XG5cdFx0aWYgKCFvYmplY3QuZ2VvbWV0cnkpIHtcblx0XHRcdGNvbnN0IGJhc2UgPSBjbG9uZU1lc2gobWVzaEZvcihvYmplY3QudHlwZSkgPz8gbWVzaEZvcignY3ViZScpISk7XG5cdFx0XHRiYXNlLnNsb3RzID0gW3Nsb3RGcm9tT2JqZWN0KG9iamVjdCldO1xuXHRcdFx0YmFzZS5mYWNlU2xvdCA9IGJhc2UuZmFjZXMubWFwKCgpID0+IDApO1xuXHRcdFx0YmFzZS5ncm91cHMgPSBidWlsZEdyb3VwcyhiYXNlKTtcblx0XHRcdG9iamVjdC5nZW9tZXRyeSA9IGJhc2U7XG5cdFx0fVxuXHRcdGlmICghb2JqZWN0Lmdlb21ldHJ5LnNsb3RzLmxlbmd0aCkgb2JqZWN0Lmdlb21ldHJ5LnNsb3RzID0gW3Nsb3RGcm9tT2JqZWN0KG9iamVjdCldO1xuXHRcdGlmIChvYmplY3QuZ2VvbWV0cnkuZmFjZVNsb3QubGVuZ3RoICE9PSBvYmplY3QuZ2VvbWV0cnkuZmFjZXMubGVuZ3RoKSB7XG5cdFx0XHRvYmplY3QuZ2VvbWV0cnkuZmFjZVNsb3QgPSBvYmplY3QuZ2VvbWV0cnkuZmFjZXMubWFwKChfLCBpbmRleCkgPT4gb2JqZWN0Lmdlb21ldHJ5Py5mYWNlU2xvdFtpbmRleF0gPz8gMCk7XG5cdFx0XHRvYmplY3QuZ2VvbWV0cnkuZ3JvdXBzID0gYnVpbGRHcm91cHMob2JqZWN0Lmdlb21ldHJ5KTtcblx0XHR9XG5cdFx0cmV0dXJuIG9iamVjdC5nZW9tZXRyeTtcblx0fVxuXG5cdGZ1bmN0aW9uIG5ld09iamVjdChzdGF0ZTogU2NlbmVTdGF0ZSwgdHlwZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogU2NlbmVPYmplY3Qge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogbmV4dElkKCksXG5cdFx0XHRuYW1lOiB1bmlxdWVOYW1lKHN0YXRlLm9iamVjdHMsIGxhYmVsKSxcblx0XHRcdHR5cGUsXG5cdFx0XHRwb3NpdGlvbjogWzAsIDAsIDBdLFxuXHRcdFx0cm90YXRpb246IFswLCAwLCAwXSxcblx0XHRcdHNjYWxlOiBbMSwgMSwgMV0sXG5cdFx0XHRyZXN0UG9zZToge1xuXHRcdFx0XHRwb3NpdGlvbjogWzAsIDAsIDBdLFxuXHRcdFx0XHRyb3RhdGlvbjogWzAsIDAsIDBdLFxuXHRcdFx0XHRzY2FsZTogWzEsIDEsIDFdLFxuXHRcdFx0fSxcblx0XHRcdGNvbG9yOiBTVFVESU9fV0hJVEUsXG5cdFx0XHRtYXRlcmlhbDogZGVmYXVsdE1hdGVyaWFsKCksXG5cdFx0XHRnZW9tZXRyeVZlcnNpb246IDEsXG5cdFx0XHRjb2xvclZlcnNpb246IDEsXG5cdFx0XHRzZWxlY3Rpb25WZXJzaW9uOiAxLFxuXHRcdFx0cGh5c2ljczogZGVmYXVsdFBoeXNpY3MoKSxcblx0XHRcdHZpc2libGU6IHRydWUsXG5cdFx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdFx0c2VsZWN0ZWQ6IHRydWUsXG5cdFx0XHRkZXB0aDogMCxcblx0XHRcdGNoaWxkcmVuOiBbXSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVmcmVzaE9iamVjdChpZDogc3RyaW5nKSB7XG5cdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSBpZCk7XG5cdFx0XHRpZiAoIW9iamVjdCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0b2JqZWN0LmNvbG9yVmVyc2lvbisrO1xuXHRcdFx0b2JqZWN0LnNlbGVjdGlvblZlcnNpb24rKztcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHVzZVRleHR1cmVTbG90KG9iamVjdDogU2NlbmVPYmplY3QsIGRhdGFVcmw6IHN0cmluZywgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRjb25zdCBtZXNoID0gbWF0ZXJpYWxpemVHZW9tZXRyeShvYmplY3QpO1xuXHRcdG1lc2guc2xvdHNbMF0gPSB7XG5cdFx0XHQuLi5tZXNoLnNsb3RzWzBdLFxuXHRcdFx0bmFtZTogb2JqZWN0Lm5hbWUsXG5cdFx0XHRjb2xvcjogJyNmZmZmZmYnLFxuXHRcdFx0bWV0YWxuZXNzOiAwLFxuXHRcdFx0cm91Z2huZXNzOiAwLjkyLFxuXHRcdFx0ZW1pc3NpdmU6ICcjZmZmZmZmJyxcblx0XHRcdGVtaXNzaXZlU3RyZW5ndGg6IDAuMyxcblx0XHRcdGltYWdlVXJsOiBkYXRhVXJsLFxuXHRcdFx0dXZSZXBlYXQ6IDEsXG5cdFx0fTtcblx0XHRvYmplY3Quc2NhbGUgPSBhc3BlY3RQbGFuZVNjYWxlKHdpZHRoLCBoZWlnaHQpO1xuXHRcdG9iamVjdC5yZXN0UG9zZSA9IHtcblx0XHRcdHBvc2l0aW9uOiBbLi4ub2JqZWN0LnBvc2l0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRyb3RhdGlvbjogWy4uLm9iamVjdC5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0c2NhbGU6IFsuLi5vYmplY3Quc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHR9O1xuXHRcdHByaW1lTGF5ZXJUZXh0dXJlKGRhdGFVcmwsICgpID0+IHJlZnJlc2hPYmplY3Qob2JqZWN0LmlkKSk7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHN1YnNjcmliZSxcblx0XHRzZXQsXG5cdFx0YWRkUHJpbWl0aXZlOiAodHlwZTogc3RyaW5nLCBwb3NpdGlvbj86IFZlYzMsIHBhcmFtcz86IFJlY29yZDxzdHJpbmcsIGFueT4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0Y29uc3QgZGVmaW5pdGlvbiA9IFBSSU1JVElWRVMuZmluZCgocCkgPT4gcC50eXBlID09PSB0eXBlKTtcblx0XHRcdFx0Y29uc3QgaWQgPSBuZXh0SWQoKTtcblx0XHRcdFx0Y29uc3QgdHJhbnNmb3JtID0gZGVmYXVsdFRyYW5zZm9ybSh0eXBlLCBzdGF0ZS5vYmplY3RzLmxlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IHBvcyA9IHBvc2l0aW9uID8gKFsuLi5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdKSA6IHRyYW5zZm9ybS5wb3NpdGlvbjtcblx0XHRcdFx0Y29uc3QgaW5pdFBhcmFtcyA9IHBhcmFtcyA/IHsgLi4ucGFyYW1zIH0gOiBkZWZhdWx0Q3JlYXRpb25QYXJhbXModHlwZSk7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxNZXNoID0gbWVzaEZvcih0eXBlLCBpbml0UGFyYW1zKTtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0OiBTY2VuZU9iamVjdCA9IHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRuYW1lOiB1bmlxdWVOYW1lKHN0YXRlLm9iamVjdHMsIGRlZmluaXRpb24/LmxhYmVsIHx8IHR5cGUpLFxuXHRcdFx0XHRcdHR5cGUsXG5cdFx0XHRcdFx0cG9zaXRpb246IFsuLi5wb3NdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHRyb3RhdGlvbjogWy4uLnRyYW5zZm9ybS5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdHNjYWxlOiBbLi4udHJhbnNmb3JtLnNjYWxlXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdFx0cmVzdFBvc2U6IHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4ucG9zXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdFx0XHRyb3RhdGlvbjogWy4uLnRyYW5zZm9ybS5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdFx0c2NhbGU6IFsuLi50cmFuc2Zvcm0uc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbG9yOiBTVFVESU9fV0hJVEUsXG5cdFx0XHRcdFx0bWF0ZXJpYWw6IGRlZmF1bHRNYXRlcmlhbCgpLFxuXHRcdFx0XHRcdGdlb21ldHJ5OiBpbml0aWFsTWVzaCA/IGNsb25lTWVzaChpbml0aWFsTWVzaCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Z2VvbWV0cnlWZXJzaW9uOiAxLFxuXHRcdFx0XHRcdGNvbG9yVmVyc2lvbjogMSxcblx0XHRcdFx0XHRzZWxlY3Rpb25WZXJzaW9uOiAxLFxuXHRcdFx0XHRcdHBoeXNpY3M6IGRlZmF1bHRQaHlzaWNzKCksXG5cdFx0XHRcdFx0dmlzaWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHNlbGVjdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGRlcHRoOiAwLFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBbXSxcblx0XHRcdFx0XHRjcmVhdGlvblBhcmFtczogaW5pdFBhcmFtcyxcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKHR5cGUgPT09ICdsaWdodCcgfHwgdHlwZS5zdGFydHNXaXRoKCdsaWdodF8nKSkge1xuXHRcdFx0XHRcdG9iamVjdC5saWdodFByb3BzID0ge1xuXHRcdFx0XHRcdFx0dHlwZTogKHR5cGUucmVwbGFjZSgnbGlnaHRfJywgJycpIHx8ICdwb2ludCcpIGFzIGFueSxcblx0XHRcdFx0XHRcdGludGVuc2l0eTogaW5pdFBhcmFtcy5pbnRlbnNpdHkgPz8gMS4wLFxuXHRcdFx0XHRcdFx0Y29sb3I6IGluaXRQYXJhbXMuY29sb3IgPz8gJyNmZmZmZmYnLFxuXHRcdFx0XHRcdFx0ZGlzdGFuY2U6IGluaXRQYXJhbXMucmFkaXVzID8/IDEwLFxuXHRcdFx0XHRcdFx0YW5nbGU6IGluaXRQYXJhbXMuc3BvdEFuZ2xlID8gKGluaXRQYXJhbXMuc3BvdEFuZ2xlICogTWF0aC5QSSkgLyAxODAgOiBNYXRoLlBJIC8gNCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlID09PSAnY2FtZXJhJyB8fCB0eXBlLnN0YXJ0c1dpdGgoJ2NhbWVyYV8nKSkge1xuXHRcdFx0XHRcdG9iamVjdC5jYW1lcmFQcm9wcyA9IHtcblx0XHRcdFx0XHRcdGZvdjogaW5pdFBhcmFtcy5mb3YgPz8gNDUsXG5cdFx0XHRcdFx0XHRuZWFyOiBpbml0UGFyYW1zLm5lYXIgPz8gMC4xLFxuXHRcdFx0XHRcdFx0ZmFyOiBpbml0UGFyYW1zLmZhciA/PyAxMDAsXG5cdFx0XHRcdFx0XHRvcnRobzogdHlwZSA9PT0gJ2NhbWVyYV9vcnRobycsXG5cdFx0XHRcdFx0XHRvcnRob1NjYWxlOiBpbml0UGFyYW1zLm9ydGhvU2NhbGUgPz8gNC4wLFxuXHRcdFx0XHRcdFx0dHJhY2tpbmdNb2RlOiAnbm9uZScsXG5cdFx0XHRcdFx0XHR0cmFja2luZ1RhcmdldElkOiBudWxsLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUub2JqZWN0cy5mb3JFYWNoKChpdGVtKSA9PiAoaXRlbS5zZWxlY3RlZCA9IGZhbHNlKSk7XG5cdFx0XHRcdHN0YXRlLm9iamVjdHMucHVzaChvYmplY3QpO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZElkID0gaWQ7XG5cdFx0XHRcdHN0YXRlLmVkaXRNb2RlID0gZmFsc2U7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkVmVydGljZXMgPSBbXTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRFZGdlcyA9IFtdO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEZhY2VzID0gW107XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0cmVjcmVhdGVMYXN0T2JqZWN0OiAoX2lkOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgYW55PikgPT4gc2NlbmVTdG9yZS51cGRhdGVDcmVhdGlvblBhcmFtcyhwYXJhbXMpLFxuXHRcdG11dGF0ZVJpZzogKGZuOiAoc3RhdGU6IFNjZW5lU3RhdGUpID0+IHZvaWQsIHJlY29yZCA9IHRydWUpID0+IHVwZGF0ZSgoc3RhdGUpID0+IHsgaWYgKHJlY29yZCkgcHVzaEhpc3Rvcnkoc3RhdGUpOyBmbihzdGF0ZSk7IHJldHVybiBzdGF0ZTsgfSksXG5cdFx0dXBkYXRlQ3JlYXRpb25QYXJhbXM6IChwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iaiA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gc3RhdGUuc2VsZWN0ZWRJZCk7XG5cdFx0XHRcdGlmICghb2JqKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0b2JqLmNyZWF0aW9uUGFyYW1zID0geyAuLi4ob2JqLmNyZWF0aW9uUGFyYW1zIHx8IGRlZmF1bHRDcmVhdGlvblBhcmFtcyhvYmoudHlwZSkpLCAuLi5wYXJhbXMgfTtcblx0XHRcdFx0Y29uc3QgbmV3TWVzaCA9IG1lc2hGb3Iob2JqLnR5cGUsIG9iai5jcmVhdGlvblBhcmFtcyk7XG5cdFx0XHRcdGlmIChuZXdNZXNoKSB7XG5cdFx0XHRcdFx0b2JqLmdlb21ldHJ5ID0gY2xvbmVNZXNoKG5ld01lc2gpO1xuXHRcdFx0XHRcdG9iai5nZW9tZXRyeVZlcnNpb24gPSAob2JqLmdlb21ldHJ5VmVyc2lvbiB8fCAxKSArIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9iai5saWdodFByb3BzKSB7XG5cdFx0XHRcdFx0aWYgKHBhcmFtcy5pbnRlbnNpdHkgIT09IHVuZGVmaW5lZCkgb2JqLmxpZ2h0UHJvcHMuaW50ZW5zaXR5ID0gcGFyYW1zLmludGVuc2l0eTtcblx0XHRcdFx0XHRpZiAocGFyYW1zLmNvbG9yICE9PSB1bmRlZmluZWQpIG9iai5saWdodFByb3BzLmNvbG9yID0gcGFyYW1zLmNvbG9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvYmouY2FtZXJhUHJvcHMpIHtcblx0XHRcdFx0XHRpZiAocGFyYW1zLmZvdiAhPT0gdW5kZWZpbmVkKSBvYmouY2FtZXJhUHJvcHMuZm92ID0gcGFyYW1zLmZvdjtcblx0XHRcdFx0XHRpZiAocGFyYW1zLm9ydGhvU2NhbGUgIT09IHVuZGVmaW5lZCkgb2JqLmNhbWVyYVByb3BzLm9ydGhvU2NhbGUgPSBwYXJhbXMub3J0aG9TY2FsZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdC8qKiBJbXBvcnRzIGEgY3VzdG9tIDNEIG1lc2ggKC5PQkogLyAuU1RMKSBpbnRvIHRoZSBzY2VuZS4gKi9cblx0XHRpbXBvcnRNZXNoT2JqZWN0OiAobmFtZTogc3RyaW5nLCBtZXNoOiBNZXNoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IGNsZWFuID0gbmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCAnJykudHJpbSgpIHx8ICdJbXBvcnRlZF9NZXNoJztcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gbmV3T2JqZWN0KHN0YXRlLCAnY3ViZScsIGNsZWFuKTtcblx0XHRcdFx0b2JqZWN0LnBvc2l0aW9uID0gWzAsIDAuNSwgMF07XG5cdFx0XHRcdG9iamVjdC5yZXN0UG9zZSA9IHtcblx0XHRcdFx0XHRwb3NpdGlvbjogWzAsIDAuNSwgMF0sXG5cdFx0XHRcdFx0cm90YXRpb246IFswLCAwLCAwXSxcblx0XHRcdFx0XHRzY2FsZTogWzEsIDEsIDFdLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBjb3B5ID0gY2xvbmVNZXNoKG1lc2gpO1xuXHRcdFx0XHRpZiAoIWNvcHkuc2xvdHMubGVuZ3RoKSBjb3B5LnNsb3RzID0gW3Nsb3RGcm9tT2JqZWN0KG9iamVjdCldO1xuXHRcdFx0XHRjb3B5LmZhY2VTbG90ID0gY29weS5mYWNlcy5tYXAoKF8sIGlkeCkgPT4gY29weS5mYWNlU2xvdFtpZHhdID8/IDApO1xuXHRcdFx0XHRjb3B5Lmdyb3VwcyA9IGJ1aWxkR3JvdXBzKGNvcHkpO1xuXHRcdFx0XHRvYmplY3QuZ2VvbWV0cnkgPSBjb3B5O1xuXHRcdFx0XHRzdGF0ZS5vYmplY3RzLmZvckVhY2goKGl0ZW0pID0+IChpdGVtLnNlbGVjdGVkID0gZmFsc2UpKTtcblx0XHRcdFx0c3RhdGUub2JqZWN0cy5wdXNoKG9iamVjdCk7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkSWQgPSBvYmplY3QuaWQ7XG5cdFx0XHRcdHN0YXRlLmVkaXRNb2RlID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0YWRkVGV4dExheWVyOiAodGV4dDogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IGNhcHRpb24gPSB0ZXh0LnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCkgfHwgJ1RleHQnO1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBuZXdPYmplY3Qoc3RhdGUsICd0ZXh0JywgY2FwdGlvbi5zbGljZSgwLCAyNCkpO1xuXHRcdFx0XHRvYmplY3QudGV4dCA9IGNhcHRpb247XG5cdFx0XHRcdG9iamVjdC5wb3NpdGlvbiA9IFswLCAxLjQ1LCAwLjZdO1xuXHRcdFx0XHRvYmplY3Qucm90YXRpb24gPSBbTWF0aC5QSSAvIDIsIDAsIDBdO1xuXHRcdFx0XHRvYmplY3QubWF0ZXJpYWwgPSB7IC4uLmRlZmF1bHRNYXRlcmlhbCgpLCBtZXRhbG5lc3M6IDAsIHJvdWdobmVzczogMC45IH07XG5cdFx0XHRcdGNvbnN0IHVybCA9IHRleHRUZXh0dXJlRGF0YVVybChjYXB0aW9uKTtcblx0XHRcdFx0aWYgKHVybCkgdXNlVGV4dHVyZVNsb3Qob2JqZWN0LCB1cmwsIDEwMjQsIDUxMik7XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdG1hdGVyaWFsaXplR2VvbWV0cnkob2JqZWN0KTtcblx0XHRcdFx0XHRvYmplY3Quc2NhbGUgPSBbMi40LCAxLjIsIDFdO1xuXHRcdFx0XHRcdG9iamVjdC5yZXN0UG9zZSA9IHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4ub2JqZWN0LnBvc2l0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdFx0XHRyb3RhdGlvbjogWy4uLm9iamVjdC5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdFx0c2NhbGU6IFsuLi5vYmplY3Quc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLm9iamVjdHMuZm9yRWFjaCgoaXRlbSkgPT4gKGl0ZW0uc2VsZWN0ZWQgPSBmYWxzZSkpO1xuXHRcdFx0XHRzdGF0ZS5vYmplY3RzLnB1c2gob2JqZWN0KTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRJZCA9IG9iamVjdC5pZDtcblx0XHRcdFx0c3RhdGUuZWRpdE1vZGUgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRhZGRJbWFnZUxheWVyOiAoZGF0YVVybDogc3RyaW5nLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgbmFtZSA9ICdJbWFnZScpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZGF0YVVybCAhPT0gJ3N0cmluZycgfHwgIWRhdGFVcmwuc3RhcnRzV2l0aCgnZGF0YTppbWFnZS8nKSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gbmFtZS5yZXBsYWNlKC9cXC5bXi5dKyQvLCAnJykudHJpbSgpIHx8ICdJbWFnZSc7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IG5ld09iamVjdChzdGF0ZSwgJ2ltYWdlJywgbGFiZWwpO1xuXHRcdFx0XHRvYmplY3QucG9zaXRpb24gPSBbMCwgMS40NSwgMC42XTtcblx0XHRcdFx0b2JqZWN0LnJvdGF0aW9uID0gW01hdGguUEkgLyAyLCAwLCAwXTtcblx0XHRcdFx0b2JqZWN0Lm1hdGVyaWFsID0geyAuLi5kZWZhdWx0TWF0ZXJpYWwoKSwgbWV0YWxuZXNzOiAwLCByb3VnaG5lc3M6IDAuOCB9O1xuXHRcdFx0XHR1c2VUZXh0dXJlU2xvdChvYmplY3QsIGRhdGFVcmwsIHdpZHRoLCBoZWlnaHQpO1xuXHRcdFx0XHRzdGF0ZS5vYmplY3RzLmZvckVhY2goKGl0ZW0pID0+IChpdGVtLnNlbGVjdGVkID0gZmFsc2UpKTtcblx0XHRcdFx0c3RhdGUub2JqZWN0cy5wdXNoKG9iamVjdCk7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkSWQgPSBvYmplY3QuaWQ7XG5cdFx0XHRcdHN0YXRlLmVkaXRNb2RlID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0c2V0VGV4dENvbnRlbnQ6IChpZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCBvYmplY3QudHlwZSAhPT0gJ3RleHQnKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IGNhcHRpb24gPSB0ZXh0LnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCkgfHwgJ1RleHQnO1xuXHRcdFx0XHRpZiAoY2FwdGlvbiA9PT0gb2JqZWN0LnRleHQpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRvYmplY3QudGV4dCA9IGNhcHRpb247XG5cdFx0XHRcdG9iamVjdC5uYW1lID0gdW5pcXVlTmFtZShzdGF0ZS5vYmplY3RzLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pZCAhPT0gaWQpLCBjYXB0aW9uLnNsaWNlKDAsIDI0KSk7XG5cdFx0XHRcdGNvbnN0IHVybCA9IHRleHRUZXh0dXJlRGF0YVVybChjYXB0aW9uKTtcblx0XHRcdFx0aWYgKHVybCkge1xuXHRcdFx0XHRcdGNvbnN0IG1lc2ggPSBtYXRlcmlhbGl6ZUdlb21ldHJ5KG9iamVjdCk7XG5cdFx0XHRcdFx0bWVzaC5zbG90c1swXSA9IHsgLi4ubWVzaC5zbG90c1swXSwgY29sb3I6ICcjZmZmZmZmJywgaW1hZ2VVcmw6IHVybCB9O1xuXHRcdFx0XHRcdHByaW1lTGF5ZXJUZXh0dXJlKHVybCwgKCkgPT4gcmVmcmVzaE9iamVjdChpZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9iamVjdC5jb2xvclZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvKiogTW92ZXMgYSBsYXllciB1cCAoLTEpIG9yIGRvd24gKCsxKSBpbiB0aGUgc2NlbmUgb2JqZWN0L3RpbWVsaW5lIGxheWVyIHN0YWNrLiAqL1xuXHRcdHJlb3JkZXJPYmplY3Q6IChpZDogc3RyaW5nLCBkZWx0YTogbnVtYmVyKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBpZHggPSBzdGF0ZS5vYmplY3RzLmZpbmRJbmRleCgobykgPT4gby5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoaWR4IDwgMCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihzdGF0ZS5vYmplY3RzLmxlbmd0aCAtIDEsIGlkeCArIGRlbHRhKSk7XG5cdFx0XHRcdGlmICh0YXJnZXQgPT09IGlkeCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IFtpdGVtXSA9IHN0YXRlLm9iamVjdHMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdHN0YXRlLm9iamVjdHMuc3BsaWNlKHRhcmdldCwgMCwgaXRlbSk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0LyoqXG5cdFx0ICogU21hcnQga2V5ZnJhbWUgcmVjb3JkZXIgZm9yIHRoZSBVSSAnKyBLZXknIGJ1dHRvbjpcblx0XHQgKiAtIElmIGFkZGluZyB0aGUgdmVyeSBmaXJzdCBrZXlmcmFtZSBhdCB0ID4gMCwgYXV0b21hdGljYWxseSBhbmNob3JzIHRoZSBvYmplY3Qnc1xuXHRcdCAqICAgaW5pdGlhbCByZXN0UG9zZSBhdCB0ID0gMCBzbyBwcmVzc2luZyBQbGF5IGltbWVkaWF0ZWx5IGFuaW1hdGVzIGZyb20gMHMgdG8gdC5cblx0XHQgKiAtIElmIGNsaWNraW5nICcrIEtleScgYXQgdCA9IDAgd2hlbiBhIGtleSBhdCB0ID0gMCBhbHJlYWR5IGV4aXN0cyBhbmQgdGhlIG9iamVjdFxuXHRcdCAqICAgaGFzIGJlZW4gbW92ZWQsIGF1dG9tYXRpY2FsbHkgcGxhY2VzIHRoZSBuZXcga2V5IGF0IHQgKyAxLjVzIHNvIGFuIGFuaW1hdGlvbiBpcyBjcmVhdGVkLlxuXHRcdCAqL1xuXHRcdHJlY29yZEtleWZyYW1lOiAoaWQ6IHN0cmluZywgZXhwbGljaXRUaW1lPzogbnVtYmVyKTogbnVtYmVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHNjZW5lU3RvcmUpO1xuXHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBpZCk7XG5cdFx0XHRpZiAoIW9iamVjdCkgcmV0dXJuIDA7XG5cdFx0XHRjb25zdCB0bCA9IGdldCh0aW1lbGluZVN0b3JlKTtcblx0XHRcdGxldCB0YXJnZXRUaW1lID0gZXhwbGljaXRUaW1lID8/IHRsLmN1cnJlbnRUaW1lO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdLZXlzID0gdGwua2V5ZnJhbWVzLmdldChpZCkgPz8gW107XG5cdFx0XHRjb25zdCBjdXJyZW50UG9zZTogVFJTID0ge1xuXHRcdFx0XHRwb3NpdGlvbjogWy4uLm9iamVjdC5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRyb3RhdGlvbjogWy4uLm9iamVjdC5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRzY2FsZTogWy4uLm9iamVjdC5zY2FsZV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3RQb3NlOiBUUlMgPSBvYmplY3QucmVzdFBvc2UgPz8gY3VycmVudFBvc2U7XG5cblx0XHRcdGFuaW1hdGlvblNuYXBzaG90ID0gdGltZWxpbmVTdG9yZS5zbmFwc2hvdEFuaW1hdGlvbigpO1xuXHRcdFx0aWYgKGV4aXN0aW5nS2V5cy5sZW5ndGggPT09IDAgJiYgdGFyZ2V0VGltZSA+IDAuMDIpIHtcblx0XHRcdFx0Ly8gQW5jaG9yIHQgPSAwIHdpdGggcmVzdFBvc2Ugc28gMHMgLT4gdGFyZ2V0VGltZSBhbmltYXRlcyBpbW1lZGlhdGVseVxuXHRcdFx0XHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKGlkLCB7XG5cdFx0XHRcdFx0dGltZTogMCxcblx0XHRcdFx0XHRwb3NpdGlvbjogWy4uLnJlc3RQb3NlLnBvc2l0aW9uXSxcblx0XHRcdFx0XHRyb3RhdGlvbjogWy4uLnJlc3RQb3NlLnJvdGF0aW9uXSxcblx0XHRcdFx0XHRzY2FsZTogWy4uLnJlc3RQb3NlLnNjYWxlXSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoaWQsIHtcblx0XHRcdFx0XHR0aW1lOiB0YXJnZXRUaW1lLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4uY3VycmVudFBvc2UucG9zaXRpb25dLFxuXHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4uY3VycmVudFBvc2Uucm90YXRpb25dLFxuXHRcdFx0XHRcdHNjYWxlOiBbLi4uY3VycmVudFBvc2Uuc2NhbGVdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoXG5cdFx0XHRcdGV4aXN0aW5nS2V5cy5sZW5ndGggPT09IDEgJiZcblx0XHRcdFx0TWF0aC5hYnMoZXhpc3RpbmdLZXlzWzBdLnRpbWUgLSB0YXJnZXRUaW1lKSA8IDAuMDIgJiZcblx0XHRcdFx0IXNhbWVUcmFuc2Zvcm0oZXhpc3RpbmdLZXlzWzBdLCBjdXJyZW50UG9zZSlcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBVc2VyIG1vdmVkIG9iamVjdCB3aXRob3V0IG1vdmluZyBwbGF5aGVhZCBmaXJzdDogYWR2YW5jZSBwbGF5aGVhZCBieSAxLjVzIGFuZCBrZXkgdGhlcmVcblx0XHRcdFx0dGFyZ2V0VGltZSA9IE1hdGgubWluKHRsLmR1cmF0aW9uLCBleGlzdGluZ0tleXNbMF0udGltZSArIDEuNSk7XG5cdFx0XHRcdHRpbWVsaW5lU3RvcmUuc2V0VGltZSh0YXJnZXRUaW1lKTtcblx0XHRcdFx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZShpZCwge1xuXHRcdFx0XHRcdHRpbWU6IHRhcmdldFRpbWUsXG5cdFx0XHRcdFx0cG9zaXRpb246IFsuLi5jdXJyZW50UG9zZS5wb3NpdGlvbl0sXG5cdFx0XHRcdFx0cm90YXRpb246IFsuLi5jdXJyZW50UG9zZS5yb3RhdGlvbl0sXG5cdFx0XHRcdFx0c2NhbGU6IFsuLi5jdXJyZW50UG9zZS5zY2FsZV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZShpZCwge1xuXHRcdFx0XHRcdHRpbWU6IHRhcmdldFRpbWUsXG5cdFx0XHRcdFx0cG9zaXRpb246IFsuLi5jdXJyZW50UG9zZS5wb3NpdGlvbl0sXG5cdFx0XHRcdFx0cm90YXRpb246IFsuLi5jdXJyZW50UG9zZS5yb3RhdGlvbl0sXG5cdFx0XHRcdFx0c2NhbGU6IFsuLi5jdXJyZW50UG9zZS5zY2FsZV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdLZXlzLmxlbmd0aCA9PT0gMCAmJiB0YXJnZXRUaW1lIDw9IDAuMDIpIHtcblx0XHRcdFx0XHRvYmplY3QucmVzdFBvc2UgPSB7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogWy4uLmN1cnJlbnRQb3NlLnBvc2l0aW9uXSxcblx0XHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4uY3VycmVudFBvc2Uucm90YXRpb25dLFxuXHRcdFx0XHRcdFx0c2NhbGU6IFsuLi5jdXJyZW50UG9zZS5zY2FsZV0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmVmb3JlID0gYW5pbWF0aW9uU25hcHNob3Q7XG5cdFx0XHRhbmltYXRpb25TbmFwc2hvdCA9IG51bGw7XG5cdFx0XHRpZiAoYmVmb3JlKSB7XG5cdFx0XHRcdGNvbnN0IGFmdGVyID0gdGltZWxpbmVTdG9yZS5zbmFwc2hvdEFuaW1hdGlvbigpO1xuXHRcdFx0XHRpZiAoYW5pbWF0aW9uRGF0YUtleShiZWZvcmUpICE9PSBhbmltYXRpb25EYXRhS2V5KGFmdGVyKSkge1xuXHRcdFx0XHRcdHBhc3QucHVzaCh7IGtpbmQ6ICdhbmltYXRpb24nLCBiZWZvcmUsIGFmdGVyIH0pO1xuXHRcdFx0XHRcdHRyaW1IaXN0b3J5KCk7XG5cdFx0XHRcdFx0ZnV0dXJlLmxlbmd0aCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0YXJnZXRUaW1lO1xuXHRcdH0sXG5cblx0XHRyZWZyZXNoT2JqZWN0OiAoaWQ6IHN0cmluZykgPT4gcmVmcmVzaE9iamVjdChpZCksXG5cdFx0YWRkT2JqZWN0OiAob2JqZWN0OiBTY2VuZU9iamVjdCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRzdGF0ZS5vYmplY3RzLnB1c2goY2xvbmVPYmplY3Qob2JqZWN0KSk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHJlbW92ZU9iamVjdDogKGlkOiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0c3RhdGUub2JqZWN0cyA9IHN0YXRlLm9iamVjdHMuZmlsdGVyKChvKSA9PiBvLmlkICE9PSBpZCk7XG5cdFx0XHRcdGlmIChzdGF0ZS5zZWxlY3RlZElkID09PSBpZCkgc3RhdGUuc2VsZWN0ZWRJZCA9IG51bGw7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNlbGVjdE9iamVjdDogKGlkOiBzdHJpbmcgfCBudWxsLCBhZGRpdGl2ZSA9IGZhbHNlKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoc3RhdGUuc2VsZWN0ZWRJZCAhPT0gaWQpIHtcblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzID0gW107XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRFZGdlcyA9IFtdO1xuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkRmFjZXMgPSBbXTtcblx0XHRcdFx0XHRzdGF0ZS5ob3ZlciA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFkZGl0aXZlICYmIGlkKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSBpZCk7XG5cdFx0XHRcdFx0aWYgKCFvYmplY3QgfHwgb2JqZWN0LmxvY2tlZCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRcdG9iamVjdC5zZWxlY3RlZCA9ICFvYmplY3Quc2VsZWN0ZWQ7XG5cdFx0XHRcdFx0aWYgKG9iamVjdC5zZWxlY3RlZCkgc3RhdGUuc2VsZWN0ZWRJZCA9IGlkO1xuXHRcdFx0XHRcdGVsc2UgaWYgKHN0YXRlLnNlbGVjdGVkSWQgPT09IGlkKSB7XG5cdFx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZElkID0gWy4uLnN0YXRlLm9iamVjdHNdLnJldmVyc2UoKS5maW5kKChpdGVtKSA9PiBpdGVtLnNlbGVjdGVkKT8uaWQgPz8gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRJZCA9IGlkO1xuXHRcdFx0XHRcdHN0YXRlLm9iamVjdHMuZm9yRWFjaCgob2JqZWN0KSA9PiAob2JqZWN0LnNlbGVjdGVkID0gb2JqZWN0LmlkID09PSBpZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3Qgb2JqZWN0IG9mIHN0YXRlLm9iamVjdHMpIG9iamVjdC5zZWxlY3Rpb25WZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNlbGVjdEFsbDogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0bGV0IGxhc3Q6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9iamVjdCBvZiBzdGF0ZS5vYmplY3RzKSB7XG5cdFx0XHRcdFx0aWYgKG9iamVjdC5sb2NrZWQpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdG9iamVjdC5zZWxlY3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0bGFzdCA9IG9iamVjdC5pZDtcblx0XHRcdFx0XHRvYmplY3Quc2VsZWN0aW9uVmVyc2lvbisrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkSWQgPSBsYXN0ID8/IHN0YXRlLnNlbGVjdGVkSWQ7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNldFRyYW5zZm9ybXM6IChcblx0XHRcdGVudHJpZXM6IHsgaWQ6IHN0cmluZzsgcG9zaXRpb24/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07IHJvdGF0aW9uPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdOyBzY2FsZT86IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB9W10sXG5cdFx0KSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IGVudHJ5LmlkKTtcblx0XHRcdFx0XHRpZiAoIW9iamVjdCkgY29udGludWU7XG5cdFx0XHRcdFx0aWYgKGVudHJ5LnBvc2l0aW9uKSBvYmplY3QucG9zaXRpb24gPSBbLi4uZW50cnkucG9zaXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcblx0XHRcdFx0XHRpZiAoZW50cnkucm90YXRpb24pIG9iamVjdC5yb3RhdGlvbiA9IFsuLi5lbnRyeS5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRcdFx0XHRcdGlmIChlbnRyeS5zY2FsZSkgb2JqZWN0LnNjYWxlID0gWy4uLmVudHJ5LnNjYWxlXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0dG9nZ2xlVmlzaWJpbGl0eTogKGlkOiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRvYmplY3QudmlzaWJsZSA9ICFvYmplY3QudmlzaWJsZTtcblx0XHRcdFx0dGltZWxpbmVTdG9yZS5zZXRUcmFja01ldGEoaWQsIHsgaGlkZGVuOiAhb2JqZWN0LnZpc2libGUgfSk7XG5cdFx0XHRcdGNvbnN0IHRsID0gZ2V0KHRpbWVsaW5lU3RvcmUpO1xuXHRcdFx0XHRjb25zdCBoYXNWaXNDdXJ2ZSA9IEJvb2xlYW4odGwuY3VydmVzLmdldChpZCk/LmdldCgndmlzaWJsZScpPy5rZXlzLmxlbmd0aCk7XG5cdFx0XHRcdGlmICh0bC5hdXRvS2V5ICYmIChoYXNWaXNDdXJ2ZSB8fCAodGwua2V5ZnJhbWVzLmdldChpZCk/Lmxlbmd0aCA/PyAwKSA+IDApKSB7XG5cdFx0XHRcdFx0dGltZWxpbmVTdG9yZS5zZXRWaXNpYmlsaXR5S2V5ZnJhbWUoaWQsIHRsLmN1cnJlbnRUaW1lLCBvYmplY3QudmlzaWJsZSwge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IFsuLi5vYmplY3QucG9zaXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4ub2JqZWN0LnJvdGF0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdFx0XHRzY2FsZTogWy4uLm9iamVjdC5zY2FsZV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHRvZ2dsZUxvY2s6IChpZDogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0b2JqZWN0LmxvY2tlZCA9ICFvYmplY3QubG9ja2VkO1xuXHRcdFx0XHR0aW1lbGluZVN0b3JlLnNldFRyYWNrTWV0YShpZCwgeyBsb2NrZWQ6IG9iamVjdC5sb2NrZWQgfSk7XG5cdFx0XHRcdGlmIChvYmplY3QubG9ja2VkICYmIHN0YXRlLnNlbGVjdGVkSWQgPT09IGlkKSB7XG5cdFx0XHRcdFx0b2JqZWN0LnNlbGVjdGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRJZCA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0ZGVsZXRlT2JqZWN0OiAoaWQ6IHN0cmluZykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRzdGF0ZS5vYmplY3RzID0gc3RhdGUub2JqZWN0cy5maWx0ZXIoKG8pID0+IG8uaWQgIT09IGlkKTtcblx0XHRcdFx0Zm9yIChjb25zdCBvYmogb2Ygc3RhdGUub2JqZWN0cykge1xuXHRcdFx0XHRcdGlmIChvYmoucGFyZW50ID09PSBpZCkgZGVsZXRlIG9iai5wYXJlbnQ7XG5cdFx0XHRcdFx0aWYgKG9iai5jaGlsZHJlbi5pbmNsdWRlcyhpZCkpIG9iai5jaGlsZHJlbiA9IG9iai5jaGlsZHJlbi5maWx0ZXIoKGNpZCkgPT4gY2lkICE9PSBpZCk7XG5cdFx0XHRcdFx0aWYgKG9iai5jYW1lcmFQcm9wcz8udGFyZ2V0SWQgPT09IGlkKSBvYmouY2FtZXJhUHJvcHMudGFyZ2V0SWQgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdGF0ZS5zZWxlY3RlZElkID09PSBpZCkgc3RhdGUuc2VsZWN0ZWRJZCA9IG51bGw7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdGRlbGV0ZVNlbGVjdGVkOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBkb29tZWQgPSBuZXcgU2V0KHN0YXRlLm9iamVjdHMuZmlsdGVyKChvKSA9PiBvLnNlbGVjdGVkICYmICFvLmxvY2tlZCkubWFwKChvKSA9PiBvLmlkKSk7XG5cdFx0XHRcdGlmIChzdGF0ZS5zZWxlY3RlZElkICYmICFkb29tZWQuc2l6ZSkgZG9vbWVkLmFkZChzdGF0ZS5zZWxlY3RlZElkKTtcblx0XHRcdFx0aWYgKCFkb29tZWQuc2l6ZSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdHN0YXRlLm9iamVjdHMgPSBzdGF0ZS5vYmplY3RzLmZpbHRlcigobykgPT4gIWRvb21lZC5oYXMoby5pZCkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9iaiBvZiBzdGF0ZS5vYmplY3RzKSB7XG5cdFx0XHRcdFx0aWYgKG9iai5wYXJlbnQgJiYgZG9vbWVkLmhhcyhvYmoucGFyZW50KSkgZGVsZXRlIG9iai5wYXJlbnQ7XG5cdFx0XHRcdFx0aWYgKG9iai5jaGlsZHJlbi5sZW5ndGgpIG9iai5jaGlsZHJlbiA9IG9iai5jaGlsZHJlbi5maWx0ZXIoKGNpZCkgPT4gIWRvb21lZC5oYXMoY2lkKSk7XG5cdFx0XHRcdFx0aWYgKG9iai5jYW1lcmFQcm9wcz8udGFyZ2V0SWQgJiYgZG9vbWVkLmhhcyhvYmouY2FtZXJhUHJvcHMudGFyZ2V0SWQpKSBvYmouY2FtZXJhUHJvcHMudGFyZ2V0SWQgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkSWQgPSBudWxsO1xuXHRcdFx0XHRzdGF0ZS5lZGl0TW9kZSA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRyZW5hbWVPYmplY3Q6IChpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBjbGVhbiA9IG5hbWUudHJpbSgpLnNsaWNlKDAsIDYwKTtcblx0XHRcdFx0aWYgKCFjbGVhbiB8fCBjbGVhbiA9PT0gb2JqZWN0Lm5hbWUpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRvYmplY3QubmFtZSA9IGNsZWFuO1xuXHRcdFx0XHR0aW1lbGluZVN0b3JlLnNldFRyYWNrTWV0YShpZCwgeyBuYW1lOiBjbGVhbiB9KTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRkdXBsaWNhdGVPYmplY3Q6IChpZDogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFzb3VyY2UpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRjb25zdCBjb3B5ID0gY2xvbmVPYmplY3Qoc291cmNlKTtcblx0XHRcdFx0Y29weS5pZCA9IG5leHRJZCgpO1xuXHRcdFx0XHRjb3B5Lm5hbWUgPSB1bmlxdWVOYW1lKHN0YXRlLm9iamVjdHMsIHNvdXJjZS5uYW1lKTtcblx0XHRcdFx0Y29weS5wb3NpdGlvbiA9IFtzb3VyY2UucG9zaXRpb25bMF0gKyAwLjM1LCBzb3VyY2UucG9zaXRpb25bMV0sIHNvdXJjZS5wb3NpdGlvblsyXSArIDAuMzVdO1xuXHRcdFx0XHRjb3B5LnNlbGVjdGVkID0gZmFsc2U7XG5cdFx0XHRcdHN0YXRlLm9iamVjdHMuZm9yRWFjaCgobykgPT4gKG8uc2VsZWN0ZWQgPSBmYWxzZSkpO1xuXHRcdFx0XHRzdGF0ZS5vYmplY3RzLnB1c2goY29weSk7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkSWQgPSBjb3B5LmlkO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdGR1cGxpY2F0ZVNlbGVjdGVkOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VzID0gc3RhdGUub2JqZWN0cy5maWx0ZXIoKG8pID0+IG8uc2VsZWN0ZWQpO1xuXHRcdFx0XHRpZiAoIXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBzdGF0ZS5zZWxlY3RlZElkKTtcblx0XHRcdFx0XHRpZiAoYWN0aXZlKSBzb3VyY2VzLnB1c2goYWN0aXZlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXNvdXJjZXMubGVuZ3RoKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0c3RhdGUub2JqZWN0cy5mb3JFYWNoKChvKSA9PiAoby5zZWxlY3RlZCA9IGZhbHNlKSk7XG5cdFx0XHRcdGxldCBsYXN0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRcdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2Ygc291cmNlcykge1xuXHRcdFx0XHRcdGNvbnN0IGNvcHkgPSBjbG9uZU9iamVjdChzb3VyY2UpO1xuXHRcdFx0XHRcdGNvcHkuaWQgPSBuZXh0SWQoKTtcblx0XHRcdFx0XHRjb3B5Lm5hbWUgPSB1bmlxdWVOYW1lKHN0YXRlLm9iamVjdHMsIHNvdXJjZS5uYW1lKTtcblx0XHRcdFx0XHRjb3B5LnBvc2l0aW9uID0gW3NvdXJjZS5wb3NpdGlvblswXSArIDAuNywgc291cmNlLnBvc2l0aW9uWzFdLCBzb3VyY2UucG9zaXRpb25bMl0gKyAwLjddO1xuXHRcdFx0XHRcdGNvcHkuc2VsZWN0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHN0YXRlLm9iamVjdHMucHVzaChjb3B5KTtcblx0XHRcdFx0XHRsYXN0ID0gY29weS5pZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZElkID0gbGFzdDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0bWlycm9yU2VsZWN0ZWQ6IChheGlzOiAneCcgfCAneScgfCAneicgPSAneCcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gc3RhdGUuc2VsZWN0ZWRJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBheGlzID09PSAneCcgPyAwIDogYXhpcyA9PT0gJ3knID8gMSA6IDI7XG5cdFx0XHRcdG9iamVjdC5zY2FsZVtpbmRleF0gKj0gLTE7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNldENvbG9yOiAoaWQ6IHN0cmluZywgY29sb3I6IHN0cmluZykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBpZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0b2JqZWN0LmNvbG9yID0gY29sb3I7XG5cdFx0XHRcdGNvbnN0IHNsb3RzID0gb2JqZWN0Lmdlb21ldHJ5Py5zbG90cztcblx0XHRcdFx0aWYgKHNsb3RzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRvYmplY3QuZ2VvbWV0cnkgPSB7IC4uLm9iamVjdC5nZW9tZXRyeSwgc2xvdHM6IHNsb3RzLm1hcCgoc2xvdCwgaW5kZXgpID0+IChpbmRleCA9PT0gMCA/IHsgLi4uc2xvdCwgY29sb3IgfSA6IHNsb3QpKSB9IGFzIE1lc2g7XG5cdFx0XHRcdFx0b2JqZWN0LmNvbG9yVmVyc2lvbisrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNldE1hdGVyaWFsOiAoaWQ6IHN0cmluZywgcGF0Y2g6IFBhcnRpYWw8TWF0ZXJpYWw+KSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRvYmplY3QubWF0ZXJpYWwgPSB7IC4uLm9iamVjdC5tYXRlcmlhbCwgLi4ucGF0Y2ggfTtcblx0XHRcdFx0Y29uc3Qgc2xvdHMgPSBvYmplY3QuZ2VvbWV0cnk/LnNsb3RzO1xuXHRcdFx0XHRpZiAoc2xvdHM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdG9iamVjdC5nZW9tZXRyeSA9IHtcblx0XHRcdFx0XHRcdC4uLm9iamVjdC5nZW9tZXRyeSxcblx0XHRcdFx0XHRcdHNsb3RzOiBzbG90cy5tYXAoKHNsb3QsIGluZGV4KSA9PlxuXHRcdFx0XHRcdFx0XHRpbmRleCA9PT0gMFxuXHRcdFx0XHRcdFx0XHRcdD8ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQuLi5zbG90LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRlbWlzc2l2ZTogcGF0Y2guZW1pc3NpdmUgPz8gc2xvdC5lbWlzc2l2ZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0b3BhY2l0eTogcGF0Y2gub3BhY2l0eSA/PyBzbG90Lm9wYWNpdHksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1ldGFsbmVzczogcGF0Y2gubWV0YWxuZXNzID8/IHNsb3QubWV0YWxuZXNzLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRyb3VnaG5lc3M6IHBhdGNoLnJvdWdobmVzcyA/PyBzbG90LnJvdWdobmVzcyxcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHQ6IHNsb3QsXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdH0gYXMgTWVzaDtcblx0XHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0cGFpbnRPYmplY3Q6IChpZDogc3RyaW5nLCBjb2xvcjogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRvYmplY3QuY29sb3IgPSBjb2xvcjtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0c2V0VHJhbnNmb3JtOiAoaWQ6IHN0cmluZywgcGF0Y2g6IFBhcnRpYWw8UGljazxTY2VuZU9iamVjdCwgJ3Bvc2l0aW9uJyB8ICdyb3RhdGlvbicgfCAnc2NhbGUnPj4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRpZiAocGF0Y2gucG9zaXRpb24pIG9iamVjdC5wb3NpdGlvbiA9IFsuLi5wYXRjaC5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRcdFx0XHRpZiAocGF0Y2gucm90YXRpb24pIG9iamVjdC5yb3RhdGlvbiA9IFsuLi5wYXRjaC5yb3RhdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRcdFx0XHRpZiAocGF0Y2guc2NhbGUpIG9iamVjdC5zY2FsZSA9IFsuLi5wYXRjaC5zY2FsZV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZXRQaHlzaWNzOiAoaWQ6IHN0cmluZywgcGF0Y2g6IFBhcnRpYWw8UGh5c2ljc0JvZHk+KSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRvYmplY3QucGh5c2ljcyA9IHsgLi4ub2JqZWN0LnBoeXNpY3MsIC4uLnBhdGNoIH07XG5cdFx0XHRcdGlmIChvYmplY3QucGh5c2ljcy5keW5hbWljICYmICFvYmplY3QucGh5c2ljcy5ob21lKSBvYmplY3QucGh5c2ljcy5ob21lID0gWy4uLm9iamVjdC5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRcdFx0XHRpZiAocGF0Y2guZHluYW1pYyA9PT0gZmFsc2UpIG9iamVjdC5waHlzaWNzLnZlbG9jaXR5ID0gWzAsIDAsIDBdO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzdGVwUGh5c2ljczogKGR0OiBudW1iZXIsIGdyYXZpdHkgPSA5LjgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGR5bjogU2NlbmVPYmplY3RbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9iamVjdCBvZiBzdGF0ZS5vYmplY3RzKSB7XG5cdFx0XHRcdFx0aWYgKCFvYmplY3QucGh5c2ljcy5keW5hbWljIHx8IG9iamVjdC50eXBlID09PSAnbGlnaHQnIHx8IG9iamVjdC50eXBlID09PSAnY2FtZXJhJykgY29udGludWU7XG5cdFx0XHRcdFx0ZHluLnB1c2gob2JqZWN0KTtcblx0XHRcdFx0XHRjb25zdCBoYWxmSGVpZ2h0ID0gTWF0aC5tYXgoMC4xLCAob2JqZWN0Lmdlb21ldHJ5Py5yYWRpdXMgPz8gbWVzaEZvcihvYmplY3QudHlwZSk/LnJhZGl1cyA/PyAwLjUpICogTWF0aC5hYnMob2JqZWN0LnNjYWxlWzFdKSk7XG5cdFx0XHRcdFx0Y29uc3QgdmVsb2NpdHkgPSBvYmplY3QucGh5c2ljcy52ZWxvY2l0eTtcblx0XHRcdFx0XHR2ZWxvY2l0eVsxXSAtPSBncmF2aXR5ICogZHQ7XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBbLi4ub2JqZWN0LnBvc2l0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdFx0XHRcdFx0cG9zaXRpb25bMF0gKz0gdmVsb2NpdHlbMF0gKiBkdDtcblx0XHRcdFx0XHRwb3NpdGlvblsxXSArPSB2ZWxvY2l0eVsxXSAqIGR0O1xuXHRcdFx0XHRcdHBvc2l0aW9uWzJdICs9IHZlbG9jaXR5WzJdICogZHQ7XG5cdFx0XHRcdFx0aWYgKHBvc2l0aW9uWzFdIDw9IGhhbGZIZWlnaHQpIHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uWzFdID0gaGFsZkhlaWdodDtcblx0XHRcdFx0XHRcdHZlbG9jaXR5WzFdID0gLXZlbG9jaXR5WzFdICogb2JqZWN0LnBoeXNpY3MucmVzdGl0dXRpb247XG5cdFx0XHRcdFx0XHR2ZWxvY2l0eVswXSAqPSAwLjg2O1xuXHRcdFx0XHRcdFx0dmVsb2NpdHlbMl0gKj0gMC44Njtcblx0XHRcdFx0XHRcdGlmIChNYXRoLmFicyh2ZWxvY2l0eVsxXSkgPCAwLjM1KSB2ZWxvY2l0eVsxXSA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG9iamVjdC5wb3NpdGlvbiA9IHBvc2l0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE9iamVjdC10by1vYmplY3QgZWxhc3RpYyBzcGhlcmUgY29sbGlzaW9uc1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGR5bi5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGZvciAobGV0IGogPSBpICsgMTsgaiA8IGR5bi5sZW5ndGg7IGorKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgYSA9IGR5bltpXTtcblx0XHRcdFx0XHRcdGNvbnN0IGIgPSBkeW5bal07XG5cdFx0XHRcdFx0XHRjb25zdCByYSA9IE1hdGgubWF4KDAuMiwgKGEuZ2VvbWV0cnk/LnJhZGl1cyA/PyAwLjUpICogTWF0aC5tYXgoTWF0aC5hYnMoYS5zY2FsZVswXSksIE1hdGguYWJzKGEuc2NhbGVbMl0pKSAqIDAuNzUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmIgPSBNYXRoLm1heCgwLjIsIChiLmdlb21ldHJ5Py5yYWRpdXMgPz8gMC41KSAqIE1hdGgubWF4KE1hdGguYWJzKGIuc2NhbGVbMF0pLCBNYXRoLmFicyhiLnNjYWxlWzJdKSkgKiAwLjc1KTtcblx0XHRcdFx0XHRcdGNvbnN0IGR4ID0gYi5wb3NpdGlvblswXSAtIGEucG9zaXRpb25bMF07XG5cdFx0XHRcdFx0XHRjb25zdCBkeSA9IGIucG9zaXRpb25bMV0gLSBhLnBvc2l0aW9uWzFdO1xuXHRcdFx0XHRcdFx0Y29uc3QgZHogPSBiLnBvc2l0aW9uWzJdIC0gYS5wb3NpdGlvblsyXTtcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3QgPSBNYXRoLmh5cG90KGR4LCBkeSwgZHopO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWluRGlzdCA9IHJhICsgcmI7XG5cdFx0XHRcdFx0XHRpZiAoZGlzdCA+IDFlLTUgJiYgZGlzdCA8IG1pbkRpc3QpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbnggPSBkeCAvIGRpc3QsIG55ID0gZHkgLyBkaXN0LCBueiA9IGR6IC8gZGlzdDtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3ZlcmxhcCA9IChtaW5EaXN0IC0gZGlzdCkgKiAwLjU7XG5cdFx0XHRcdFx0XHRcdGEucG9zaXRpb24gPSBbYS5wb3NpdGlvblswXSAtIG54ICogb3ZlcmxhcCwgYS5wb3NpdGlvblsxXSAtIG55ICogb3ZlcmxhcCwgYS5wb3NpdGlvblsyXSAtIG56ICogb3ZlcmxhcF07XG5cdFx0XHRcdFx0XHRcdGIucG9zaXRpb24gPSBbYi5wb3NpdGlvblswXSArIG54ICogb3ZlcmxhcCwgYi5wb3NpdGlvblsxXSArIG55ICogb3ZlcmxhcCwgYi5wb3NpdGlvblsyXSArIG56ICogb3ZlcmxhcF07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJ2eCA9IGIucGh5c2ljcy52ZWxvY2l0eVswXSAtIGEucGh5c2ljcy52ZWxvY2l0eVswXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcnZ5ID0gYi5waHlzaWNzLnZlbG9jaXR5WzFdIC0gYS5waHlzaWNzLnZlbG9jaXR5WzFdO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBydnogPSBiLnBoeXNpY3MudmVsb2NpdHlbMl0gLSBhLnBoeXNpY3MudmVsb2NpdHlbMl07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZlbEFsb25nTm9ybWFsID0gcnZ4ICogbnggKyBydnkgKiBueSArIHJ2eiAqIG56O1xuXHRcdFx0XHRcdFx0XHRpZiAodmVsQWxvbmdOb3JtYWwgPCAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZSA9IE1hdGgubWluKGEucGh5c2ljcy5yZXN0aXR1dGlvbiwgYi5waHlzaWNzLnJlc3RpdHV0aW9uKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBqSW1wID0gKC0oMSArIGUpICogdmVsQWxvbmdOb3JtYWwpICogMC41O1xuXHRcdFx0XHRcdFx0XHRcdGEucGh5c2ljcy52ZWxvY2l0eVswXSAtPSBqSW1wICogbng7XG5cdFx0XHRcdFx0XHRcdFx0YS5waHlzaWNzLnZlbG9jaXR5WzFdIC09IGpJbXAgKiBueTtcblx0XHRcdFx0XHRcdFx0XHRhLnBoeXNpY3MudmVsb2NpdHlbMl0gLT0gakltcCAqIG56O1xuXHRcdFx0XHRcdFx0XHRcdGIucGh5c2ljcy52ZWxvY2l0eVswXSArPSBqSW1wICogbng7XG5cdFx0XHRcdFx0XHRcdFx0Yi5waHlzaWNzLnZlbG9jaXR5WzFdICs9IGpJbXAgKiBueTtcblx0XHRcdFx0XHRcdFx0XHRiLnBoeXNpY3MudmVsb2NpdHlbMl0gKz0gakltcCAqIG56O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHJlc2V0UGh5c2ljczogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9iamVjdCBvZiBzdGF0ZS5vYmplY3RzKSB7XG5cdFx0XHRcdFx0aWYgKCFvYmplY3QucGh5c2ljcy5keW5hbWljKSBjb250aW51ZTtcblx0XHRcdFx0XHRvYmplY3QucGh5c2ljcy52ZWxvY2l0eSA9IFswLCAwLCAwXTtcblx0XHRcdFx0XHRpZiAob2JqZWN0LnBoeXNpY3MuaG9tZSkgb2JqZWN0LnBvc2l0aW9uID0gWy4uLm9iamVjdC5waHlzaWNzLmhvbWVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdC8qKiBTaW11bGF0ZXMgcGh5c2ljcyBhbmQgYmFrZXMgdGhlIHJlc3VsdGluZyB0cmFqZWN0b3J5IGludG8gcmVhbCB0aW1lbGluZSBrZXlmcmFtZXMuICovXG5cdFx0YmFrZVBoeXNpY3NUb0tleWZyYW1lczogKGR1cmF0aW9uID0gMywgZnBzID0gMTUsIGdyYXZpdHkgPSA5LjgpOiBudW1iZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBnZXQoc2NlbmVTdG9yZSk7XG5cdFx0XHRjb25zdCBkeW5hbWljT2JqZWN0cyA9IHN0YXRlLm9iamVjdHMuZmlsdGVyKChvKSA9PiBvLnBoeXNpY3MuZHluYW1pYyAmJiBvLnR5cGUgIT09ICdsaWdodCcgJiYgby50eXBlICE9PSAnY2FtZXJhJyk7XG5cdFx0XHRpZiAoIWR5bmFtaWNPYmplY3RzLmxlbmd0aCkgcmV0dXJuIDA7XG5cdFx0XHRjb25zdCBiZWZvcmVBbmltID0gdGltZWxpbmVTdG9yZS5zbmFwc2hvdEFuaW1hdGlvbigpO1xuXHRcdFx0Y29uc3Qgc2ltID0gZHluYW1pY09iamVjdHMubWFwKChvKSA9PiAoe1xuXHRcdFx0XHRpZDogby5pZCxcblx0XHRcdFx0cG9zOiBbLi4uby5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRyb3Q6IFsuLi5vLnJvdGF0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdHNjbDogWy4uLm8uc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0dmVsOiBbLi4uby5waHlzaWNzLnZlbG9jaXR5XSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdHJlc3Q6IG8ucGh5c2ljcy5yZXN0aXR1dGlvbixcblx0XHRcdFx0aGFsZkg6IE1hdGgubWF4KDAuMSwgKG8uZ2VvbWV0cnk/LnJhZGl1cyA/PyBtZXNoRm9yKG8udHlwZSk/LnJhZGl1cyA/PyAwLjUpICogTWF0aC5hYnMoby5zY2FsZVsxXSkpLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgZHQgPSAxIC8gZnBzO1xuXHRcdFx0Y29uc3Qgc3RlcHMgPSBNYXRoLm1heCgyLCBNYXRoLnJvdW5kKGR1cmF0aW9uICogZnBzKSk7XG5cdFx0XHR0aW1lbGluZVN0b3JlLnNldER1cmF0aW9uKE1hdGgubWF4KGR1cmF0aW9uLCBnZXQodGltZWxpbmVTdG9yZSkuZHVyYXRpb24pKTtcblx0XHRcdGZvciAobGV0IHN0ZXAgPSAwOyBzdGVwIDw9IHN0ZXBzOyBzdGVwKyspIHtcblx0XHRcdFx0Y29uc3QgdCA9IHN0ZXAgKiBkdDtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHNpbSkge1xuXHRcdFx0XHRcdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoaXRlbS5pZCwge1xuXHRcdFx0XHRcdFx0dGltZTogdCxcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4uaXRlbS5wb3NdLFxuXHRcdFx0XHRcdFx0cm90YXRpb246IFsuLi5pdGVtLnJvdF0sXG5cdFx0XHRcdFx0XHRzY2FsZTogWy4uLml0ZW0uc2NsXSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpdGVtLnZlbFsxXSAtPSBncmF2aXR5ICogZHQ7XG5cdFx0XHRcdFx0aXRlbS5wb3NbMF0gKz0gaXRlbS52ZWxbMF0gKiBkdDtcblx0XHRcdFx0XHRpdGVtLnBvc1sxXSArPSBpdGVtLnZlbFsxXSAqIGR0O1xuXHRcdFx0XHRcdGl0ZW0ucG9zWzJdICs9IGl0ZW0udmVsWzJdICogZHQ7XG5cdFx0XHRcdFx0aWYgKGl0ZW0ucG9zWzFdIDw9IGl0ZW0uaGFsZkgpIHtcblx0XHRcdFx0XHRcdGl0ZW0ucG9zWzFdID0gaXRlbS5oYWxmSDtcblx0XHRcdFx0XHRcdGl0ZW0udmVsWzFdID0gLWl0ZW0udmVsWzFdICogaXRlbS5yZXN0O1xuXHRcdFx0XHRcdFx0aXRlbS52ZWxbMF0gKj0gMC44Njtcblx0XHRcdFx0XHRcdGl0ZW0udmVsWzJdICo9IDAuODY7XG5cdFx0XHRcdFx0XHRpZiAoTWF0aC5hYnMoaXRlbS52ZWxbMV0pIDwgMC4yNSkgaXRlbS52ZWxbMV0gPSAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWZ0ZXJBbmltID0gdGltZWxpbmVTdG9yZS5zbmFwc2hvdEFuaW1hdGlvbigpO1xuXHRcdFx0aWYgKGFuaW1hdGlvbkRhdGFLZXkoYmVmb3JlQW5pbSkgIT09IGFuaW1hdGlvbkRhdGFLZXkoYWZ0ZXJBbmltKSkge1xuXHRcdFx0XHRwYXN0LnB1c2goeyBraW5kOiAnYW5pbWF0aW9uJywgYmVmb3JlOiBiZWZvcmVBbmltLCBhZnRlcjogYWZ0ZXJBbmltIH0pO1xuXHRcdFx0XHR0cmltSGlzdG9yeSgpO1xuXHRcdFx0XHRmdXR1cmUubGVuZ3RoID0gMDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkeW5hbWljT2JqZWN0cy5sZW5ndGg7XG5cdFx0fSxcblxuXHRcdC8qKiBBZGRzIGEgY29ubmVjdGVkIEJvbmUgY2hhaW4gZm9yIHJpZ2dpbmcuICovXG5cdFx0YWRkQm9uZUNoYWluOiAoY291bnRPclBvczogbnVtYmVyIHwgVmVjMyA9IDMsIG1heWJlQ291bnQ/OiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0c3RhdGUub2JqZWN0cy5mb3JFYWNoKChvKSA9PiAoby5zZWxlY3RlZCA9IGZhbHNlKSk7XG5cdFx0XHRcdGxldCBwYXJlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgbGFzdElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRcdFx0Y29uc3QgY291bnQgPSB0eXBlb2YgY291bnRPclBvcyA9PT0gJ251bWJlcicgPyBjb3VudE9yUG9zIDogKHR5cGVvZiBtYXliZUNvdW50ID09PSAnbnVtYmVyJyA/IG1heWJlQ291bnQgOiAzKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2JqID0gbmV3T2JqZWN0KHN0YXRlLCAnYm9uZScsIGBCb25lLiR7U3RyaW5nKGkgKyAxKS5wYWRTdGFydCgyLCAnMCcpfWApO1xuXHRcdFx0XHRcdG9iai5wb3NpdGlvbiA9IFswLCAwLjMgKyBpICogMC40NSwgMF07XG5cdFx0XHRcdFx0b2JqLnJlc3RQb3NlID0ge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IFsuLi5vYmoucG9zaXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHRcdHJvdGF0aW9uOiBbMCwgMCwgMF0sXG5cdFx0XHRcdFx0XHRzY2FsZTogWzEsIDEsIDFdLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0b2JqLmRlcHRoID0gaTtcblx0XHRcdFx0XHRvYmoucGFyZW50ID0gcGFyZW50SWQ7XG5cdFx0XHRcdFx0b2JqLnNlbGVjdGVkID0gaSA9PT0gY291bnQgLSAxO1xuXHRcdFx0XHRcdGlmIChwYXJlbnRJZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gcGFyZW50SWQpO1xuXHRcdFx0XHRcdFx0aWYgKHApIHAuY2hpbGRyZW4ucHVzaChvYmouaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdGF0ZS5vYmplY3RzLnB1c2gob2JqKTtcblx0XHRcdFx0XHRwYXJlbnRJZCA9IG9iai5pZDtcblx0XHRcdFx0XHRsYXN0SWQgPSBvYmouaWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRJZCA9IGxhc3RJZDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHQvLyAtLS0tIEFuaW1hdGlvbiBoaXN0b3J5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRcdGJlZ2luQW5pbWF0aW9uRWRpdDogKCkgPT4ge1xuXHRcdFx0YW5pbWF0aW9uU25hcHNob3QgPSB0aW1lbGluZVN0b3JlLnNuYXBzaG90QW5pbWF0aW9uKCk7XG5cdFx0fSxcblx0XHRlbmRBbmltYXRpb25FZGl0OiAoKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBhbmltYXRpb25TbmFwc2hvdDtcblx0XHRcdGFuaW1hdGlvblNuYXBzaG90ID0gbnVsbDtcblx0XHRcdGlmICghYmVmb3JlKSByZXR1cm47XG5cdFx0XHRjb25zdCBhZnRlciA9IHRpbWVsaW5lU3RvcmUuc25hcHNob3RBbmltYXRpb24oKTtcblx0XHRcdGlmIChhbmltYXRpb25EYXRhS2V5KGJlZm9yZSkgPT09IGFuaW1hdGlvbkRhdGFLZXkoYWZ0ZXIpKSByZXR1cm47XG5cdFx0XHRwYXN0LnB1c2goeyBraW5kOiAnYW5pbWF0aW9uJywgYmVmb3JlLCBhZnRlciB9KTtcblx0XHRcdHRyaW1IaXN0b3J5KCk7XG5cdFx0XHRmdXR1cmUubGVuZ3RoID0gMDtcblx0XHR9LFxuXHRcdGFuaW1hdGlvbkVkaXQ6IChtdXRhdGU6ICgpID0+IHZvaWQpID0+IHtcblx0XHRcdGFuaW1hdGlvblNuYXBzaG90ID0gdGltZWxpbmVTdG9yZS5zbmFwc2hvdEFuaW1hdGlvbigpO1xuXHRcdFx0bXV0YXRlKCk7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBhbmltYXRpb25TbmFwc2hvdDtcblx0XHRcdGFuaW1hdGlvblNuYXBzaG90ID0gbnVsbDtcblx0XHRcdGlmICghYmVmb3JlKSByZXR1cm47XG5cdFx0XHRjb25zdCBhZnRlciA9IHRpbWVsaW5lU3RvcmUuc25hcHNob3RBbmltYXRpb24oKTtcblx0XHRcdGlmIChhbmltYXRpb25EYXRhS2V5KGJlZm9yZSkgPT09IGFuaW1hdGlvbkRhdGFLZXkoYWZ0ZXIpKSByZXR1cm47XG5cdFx0XHRwYXN0LnB1c2goeyBraW5kOiAnYW5pbWF0aW9uJywgYmVmb3JlLCBhZnRlciB9KTtcblx0XHRcdHRyaW1IaXN0b3J5KCk7XG5cdFx0XHRmdXR1cmUubGVuZ3RoID0gMDtcblx0XHR9LFxuXG5cdFx0YmVnaW5UcmFuc2Zvcm06IChtb2RlOiAndHJhbnNmb3JtJyB8ICdnZW9tZXRyeScgPSAndHJhbnNmb3JtJykgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBnZXQoc2NlbmVTdG9yZSk7XG5cdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKGl0ZW0pID0+IGl0ZW0uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpID8/IG51bGw7XG5cdFx0XHRjb25zdCBtZXNoID0gbW9kZSA9PT0gJ2dlb21ldHJ5JyAmJiBvYmplY3QgPyBtYXRlcmlhbGl6ZUdlb21ldHJ5KG9iamVjdCkgOiBudWxsO1xuXHRcdFx0dHJhbnNmb3JtU25hcHNob3QgPSB7XG5cdFx0XHRcdG1vZGUsXG5cdFx0XHRcdG9iamVjdElkOiBvYmplY3Q/LmlkID8/IG51bGwsXG5cdFx0XHRcdHRyYW5zZm9ybXM6IGNhcHR1cmVUcmFuc2Zvcm1zKHN0YXRlKSxcblx0XHRcdFx0dmVydGljZXM6IG1lc2ggPyBGbG9hdDMyQXJyYXkuZnJvbShtZXNoLnZlcnRpY2VzLmZsYXQoKSkgOiBudWxsLFxuXHRcdFx0fTtcblx0XHR9LFxuXHRcdGVuZFRyYW5zZm9ybTogKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSB0cmFuc2Zvcm1TbmFwc2hvdDtcblx0XHRcdGlmICghc3RhcnQpIHJldHVybjtcblx0XHRcdHRyYW5zZm9ybVNuYXBzaG90ID0gbnVsbDtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0KHNjZW5lU3RvcmUpO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSBjYXB0dXJlVHJhbnNmb3JtcyhzdGF0ZSk7XG5cdFx0XHRjb25zdCBtb3ZlZCA9IGRpZmZUcmFuc2Zvcm1zKHN0YXJ0LnRyYW5zZm9ybXMsIGFmdGVyKTtcblxuXHRcdFx0aWYgKHN0YXJ0Lm1vZGUgPT09ICdnZW9tZXRyeScgJiYgc3RhcnQub2JqZWN0SWQgJiYgc3RhcnQudmVydGljZXMpIHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChpdGVtKSA9PiBpdGVtLmlkID09PSBzdGFydC5vYmplY3RJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0KSByZXR1cm47XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBvYmplY3QuZ2VvbWV0cnk7XG5cdFx0XHRcdGlmICghbWVzaCkgcmV0dXJuO1xuXHRcdFx0XHRjb25zdCBiZWZvcmUgPSBzdGFydC52ZXJ0aWNlcztcblx0XHRcdFx0Y29uc3QgaW5kaWNlczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgYmVmb3JlVmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBhZnRlclZhbHVlczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgY291bnQgPSBNYXRoLm1pbihtZXNoLnZlcnRpY2VzLmxlbmd0aCwgYmVmb3JlLmxlbmd0aCAvIDMpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCB4ID0gbWVzaC52ZXJ0aWNlc1tpXVswXTtcblx0XHRcdFx0XHRjb25zdCB5ID0gbWVzaC52ZXJ0aWNlc1tpXVsxXTtcblx0XHRcdFx0XHRjb25zdCB6ID0gbWVzaC52ZXJ0aWNlc1tpXVsyXTtcblx0XHRcdFx0XHRpZiAoeCA9PT0gYmVmb3JlW2kgKiAzXSAmJiB5ID09PSBiZWZvcmVbaSAqIDMgKyAxXSAmJiB6ID09PSBiZWZvcmVbaSAqIDMgKyAyXSkgY29udGludWU7XG5cdFx0XHRcdFx0aW5kaWNlcy5wdXNoKGkpO1xuXHRcdFx0XHRcdGJlZm9yZVZhbHVlcy5wdXNoKGJlZm9yZVtpICogM10sIGJlZm9yZVtpICogMyArIDFdLCBiZWZvcmVbaSAqIDMgKyAyXSk7XG5cdFx0XHRcdFx0YWZ0ZXJWYWx1ZXMucHVzaCh4LCB5LCB6KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWluZGljZXMubGVuZ3RoKSByZXR1cm47XG5cdFx0XHRcdG9iamVjdC5nZW9tZXRyeVZlcnNpb24rKztcblx0XHRcdFx0cGFzdC5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnbWVzaCcsXG5cdFx0XHRcdFx0b2JqZWN0SWQ6IHN0YXJ0Lm9iamVjdElkLFxuXHRcdFx0XHRcdGluZGljZXMsXG5cdFx0XHRcdFx0YmVmb3JlOiBiZWZvcmVWYWx1ZXMsXG5cdFx0XHRcdFx0YWZ0ZXI6IGFmdGVyVmFsdWVzLFxuXHRcdFx0XHRcdHRyYW5zZm9ybXM6IG1vdmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dHJpbUhpc3RvcnkoKTtcblx0XHRcdFx0ZnV0dXJlLmxlbmd0aCA9IDA7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFtb3ZlZCkgcmV0dXJuO1xuXHRcdFx0Y29uc3QgYW5pbUJlZm9yZSA9IHRpbWVsaW5lU3RvcmUuc25hcHNob3RBbmltYXRpb24oKTtcblx0XHRcdC8vIFVwZGF0ZSByZXN0UG9zZSBvciBBdXRvLUtleSB3aGVuIHRpbWVsaW5lIGlzIGFjdGl2ZSBvciBvYmplY3QgYWxyZWFkeSBoYXMga2V5ZnJhbWVzXG5cdFx0XHRjb25zdCB0bCA9IGdldCh0aW1lbGluZVN0b3JlKTtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXMobW92ZWQuYWZ0ZXIpKSB7XG5cdFx0XHRcdGNvbnN0IG9iaiA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gaWQpO1xuXHRcdFx0XHRjb25zdCBrZXlzID0gdGwua2V5ZnJhbWVzLmdldChpZCkgPz8gW107XG5cdFx0XHRcdGNvbnN0IGJlZm9yZVBvc2UgPSBtb3ZlZC5iZWZvcmVbaWRdO1xuXHRcdFx0XHRjb25zdCBhZnRlclBvc2UgPSBtb3ZlZC5hZnRlcltpZF07XG5cdFx0XHRcdGlmIChvYmogJiYga2V5cy5sZW5ndGggPT09IDAgJiYgdGwuY3VycmVudFRpbWUgPD0gMC4wMikge1xuXHRcdFx0XHRcdG9iai5yZXN0UG9zZSA9IHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4uYWZ0ZXJQb3NlLnBvc2l0aW9uXSxcblx0XHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4uYWZ0ZXJQb3NlLnJvdGF0aW9uXSxcblx0XHRcdFx0XHRcdHNjYWxlOiBbLi4uYWZ0ZXJQb3NlLnNjYWxlXSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0bC5hdXRvS2V5ICYmICh0bC5zaG93IHx8IGtleXMubGVuZ3RoID4gMCkpIHtcblx0XHRcdFx0XHRpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgdGwuY3VycmVudFRpbWUgPiAwLjAyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGFydFBvc2UgPSBvYmo/LnJlc3RQb3NlID8/IGJlZm9yZVBvc2U7XG5cdFx0XHRcdFx0XHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKGlkLCB7XG5cdFx0XHRcdFx0XHRcdHRpbWU6IDAsXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4uc3RhcnRQb3NlLnBvc2l0aW9uXSxcblx0XHRcdFx0XHRcdFx0cm90YXRpb246IFsuLi5zdGFydFBvc2Uucm90YXRpb25dLFxuXHRcdFx0XHRcdFx0XHRzY2FsZTogWy4uLnN0YXJ0UG9zZS5zY2FsZV0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUoaWQsIHtcblx0XHRcdFx0XHRcdFx0dGltZTogdGwuY3VycmVudFRpbWUsXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4uYWZ0ZXJQb3NlLnBvc2l0aW9uXSxcblx0XHRcdFx0XHRcdFx0cm90YXRpb246IFsuLi5hZnRlclBvc2Uucm90YXRpb25dLFxuXHRcdFx0XHRcdFx0XHRzY2FsZTogWy4uLmFmdGVyUG9zZS5zY2FsZV0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZShpZCwge1xuXHRcdFx0XHRcdFx0XHR0aW1lOiB0bC5jdXJyZW50VGltZSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IFsuLi5hZnRlclBvc2UucG9zaXRpb25dLFxuXHRcdFx0XHRcdFx0XHRyb3RhdGlvbjogWy4uLmFmdGVyUG9zZS5yb3RhdGlvbl0sXG5cdFx0XHRcdFx0XHRcdHNjYWxlOiBbLi4uYWZ0ZXJQb3NlLnNjYWxlXSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYW5pbUFmdGVyID0gdGltZWxpbmVTdG9yZS5zbmFwc2hvdEFuaW1hdGlvbigpO1xuXHRcdFx0Y29uc3QgaGFzQW5pbUNoYW5nZSA9IGFuaW1hdGlvbkRhdGFLZXkoYW5pbUJlZm9yZSkgIT09IGFuaW1hdGlvbkRhdGFLZXkoYW5pbUFmdGVyKTtcblx0XHRcdHBhc3QucHVzaCh7XG5cdFx0XHRcdGtpbmQ6ICd0cmFuc2Zvcm0nLFxuXHRcdFx0XHRiZWZvcmU6IG1vdmVkLmJlZm9yZSxcblx0XHRcdFx0YWZ0ZXI6IG1vdmVkLmFmdGVyLFxuXHRcdFx0XHQuLi4oaGFzQW5pbUNoYW5nZSA/IHsgYW5pbUJlZm9yZSwgYW5pbUFmdGVyIH0gOiB7fSksXG5cdFx0XHR9KTtcblx0XHRcdHRyaW1IaXN0b3J5KCk7XG5cdFx0XHRmdXR1cmUubGVuZ3RoID0gMDtcblx0XHR9LFxuXG5cdFx0c2V0VGltZWxpbmVIaWRkZW46IChpZHM6IFNldDxzdHJpbmc+KSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gZ2V0KHNjZW5lU3RvcmUpO1xuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3Qgb2JqZWN0IG9mIGN1cnJlbnQub2JqZWN0cykge1xuXHRcdFx0XHRpZiAoQm9vbGVhbihvYmplY3QudGltZWxpbmVIaWRkZW4pICE9PSBpZHMuaGFzKG9iamVjdC5pZCkpIHtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFjaGFuZ2VkKSByZXR1cm47XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3Qgb2JqZWN0IG9mIHN0YXRlLm9iamVjdHMpIHtcblx0XHRcdFx0XHRvYmplY3QudGltZWxpbmVIaWRkZW4gPSBpZHMuaGFzKG9iamVjdC5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSk7XG5cdFx0fSxcblxuXHRcdGFwcGx5QW5pbWF0aW9uOiAodHJhbnNmb3JtczogTWFwPHN0cmluZywgeyBwb3NpdGlvbj86IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTsgcm90YXRpb24/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07IHNjYWxlPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdOyB2aXNpYmxlPzogYm9vbGVhbiB9PikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBvYmplY3Qgb2Ygc3RhdGUub2JqZWN0cykge1xuXHRcdFx0XHRcdGNvbnN0IHRyYW5zZm9ybSA9IHRyYW5zZm9ybXMuZ2V0KG9iamVjdC5pZCk7XG5cdFx0XHRcdFx0aWYgKCF0cmFuc2Zvcm0pIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGlmICh0cmFuc2Zvcm0ucG9zaXRpb24pIHtcblx0XHRcdFx0XHRcdG9iamVjdC5wb3NpdGlvblswXSA9IHRyYW5zZm9ybS5wb3NpdGlvblswXTtcblx0XHRcdFx0XHRcdG9iamVjdC5wb3NpdGlvblsxXSA9IHRyYW5zZm9ybS5wb3NpdGlvblsxXTtcblx0XHRcdFx0XHRcdG9iamVjdC5wb3NpdGlvblsyXSA9IHRyYW5zZm9ybS5wb3NpdGlvblsyXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRyYW5zZm9ybS5yb3RhdGlvbikge1xuXHRcdFx0XHRcdFx0b2JqZWN0LnJvdGF0aW9uWzBdID0gdHJhbnNmb3JtLnJvdGF0aW9uWzBdO1xuXHRcdFx0XHRcdFx0b2JqZWN0LnJvdGF0aW9uWzFdID0gdHJhbnNmb3JtLnJvdGF0aW9uWzFdO1xuXHRcdFx0XHRcdFx0b2JqZWN0LnJvdGF0aW9uWzJdID0gdHJhbnNmb3JtLnJvdGF0aW9uWzJdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodHJhbnNmb3JtLnNjYWxlKSB7XG5cdFx0XHRcdFx0XHRvYmplY3Quc2NhbGVbMF0gPSB0cmFuc2Zvcm0uc2NhbGVbMF07XG5cdFx0XHRcdFx0XHRvYmplY3Quc2NhbGVbMV0gPSB0cmFuc2Zvcm0uc2NhbGVbMV07XG5cdFx0XHRcdFx0XHRvYmplY3Quc2NhbGVbMl0gPSB0cmFuc2Zvcm0uc2NhbGVbMl07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0cmFuc2Zvcm0udmlzaWJsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRvYmplY3QudmlzaWJsZSA9IHRyYW5zZm9ybS52aXNpYmxlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHR1bmRvOiAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbmltYXRpb24gPSBwYXN0W3Bhc3QubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAoYW5pbWF0aW9uPy5raW5kID09PSAnYW5pbWF0aW9uJykge1xuXHRcdFx0XHRwYXN0LnBvcCgpO1xuXHRcdFx0XHR0aW1lbGluZVN0b3JlLnJlc3RvcmVBbmltYXRpb24oYW5pbWF0aW9uLmJlZm9yZSk7XG5cdFx0XHRcdGZ1dHVyZS5wdXNoKGFuaW1hdGlvbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXMgPSBwYXN0LnBvcCgpO1xuXHRcdFx0XHRpZiAoIXByZXZpb3VzKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGlmIChwcmV2aW91cy5raW5kID09PSAnc2NlbmUnKSB7XG5cdFx0XHRcdFx0ZnV0dXJlLnB1c2goeyBraW5kOiAnc2NlbmUnLCBzdGF0ZTogY2xvbmVTdGF0ZShzdGF0ZSkgfSk7XG5cdFx0XHRcdFx0cmVzdG9yZVNuYXBzaG90KHN0YXRlLCBwcmV2aW91cy5zdGF0ZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcmV2aW91cy5raW5kID09PSAndHJhbnNmb3JtJykge1xuXHRcdFx0XHRcdGFwcGx5VHJhbnNmb3JtcyhzdGF0ZSwgcHJldmlvdXMuYmVmb3JlKTtcblx0XHRcdFx0XHRpZiAocHJldmlvdXMuYW5pbUJlZm9yZSkgdGltZWxpbmVTdG9yZS5yZXN0b3JlQW5pbWF0aW9uKHByZXZpb3VzLmFuaW1CZWZvcmUpO1xuXHRcdFx0XHRcdGZ1dHVyZS5wdXNoKHByZXZpb3VzKTtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByZXZpb3VzLmtpbmQgPT09ICdhbmltYXRpb24nKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gcHJldmlvdXMub2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdD8uZ2VvbWV0cnkpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3QgbWVzaCA9IG9iamVjdC5nZW9tZXRyeTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwcmV2aW91cy5pbmRpY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmVydGV4ID0gbWVzaC52ZXJ0aWNlc1twcmV2aW91cy5pbmRpY2VzW2ldXTtcblx0XHRcdFx0XHRpZiAoIXZlcnRleCkgY29udGludWU7XG5cdFx0XHRcdFx0dmVydGV4WzBdID0gcHJldmlvdXMuYmVmb3JlW2kgKiAzXTtcblx0XHRcdFx0XHR2ZXJ0ZXhbMV0gPSBwcmV2aW91cy5iZWZvcmVbaSAqIDMgKyAxXTtcblx0XHRcdFx0XHR2ZXJ0ZXhbMl0gPSBwcmV2aW91cy5iZWZvcmVbaSAqIDMgKyAyXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtZXNoLnJhZGl1cyA9IGNvbXB1dGVSYWRpdXMobWVzaC52ZXJ0aWNlcyk7XG5cdFx0XHRcdG1lc2gubm9ybWFscyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHByZXZpb3VzLnRyYW5zZm9ybXMpIGFwcGx5VHJhbnNmb3JtcyhzdGF0ZSwgcHJldmlvdXMudHJhbnNmb3Jtcy5iZWZvcmUpO1xuXHRcdFx0XHRvYmplY3QuZ2VvbWV0cnlWZXJzaW9uKys7XG5cdFx0XHRcdGZ1dHVyZS5wdXNoKHByZXZpb3VzKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRyZWRvOiAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbmltYXRpb24gPSBmdXR1cmVbZnV0dXJlLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKGFuaW1hdGlvbj8ua2luZCA9PT0gJ2FuaW1hdGlvbicpIHtcblx0XHRcdFx0ZnV0dXJlLnBvcCgpO1xuXHRcdFx0XHR0aW1lbGluZVN0b3JlLnJlc3RvcmVBbmltYXRpb24oYW5pbWF0aW9uLmFmdGVyKTtcblx0XHRcdFx0cGFzdC5wdXNoKGFuaW1hdGlvbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgbmV4dCA9IGZ1dHVyZS5wb3AoKTtcblx0XHRcdFx0aWYgKCFuZXh0KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGlmIChuZXh0LmtpbmQgPT09ICdzY2VuZScpIHtcblx0XHRcdFx0XHRwYXN0LnB1c2goeyBraW5kOiAnc2NlbmUnLCBzdGF0ZTogY2xvbmVTdGF0ZShzdGF0ZSkgfSk7XG5cdFx0XHRcdFx0cmVzdG9yZVNuYXBzaG90KHN0YXRlLCBuZXh0LnN0YXRlKTtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5leHQua2luZCA9PT0gJ3RyYW5zZm9ybScpIHtcblx0XHRcdFx0XHRhcHBseVRyYW5zZm9ybXMoc3RhdGUsIG5leHQuYWZ0ZXIpO1xuXHRcdFx0XHRcdGlmIChuZXh0LmFuaW1BZnRlcikgdGltZWxpbmVTdG9yZS5yZXN0b3JlQW5pbWF0aW9uKG5leHQuYW5pbUFmdGVyKTtcblx0XHRcdFx0XHRwYXN0LnB1c2gobmV4dCk7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuZXh0LmtpbmQgPT09ICdhbmltYXRpb24nKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gbmV4dC5vYmplY3RJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0Py5nZW9tZXRyeSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBtZXNoID0gb2JqZWN0Lmdlb21ldHJ5O1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG5leHQuaW5kaWNlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IHZlcnRleCA9IG1lc2gudmVydGljZXNbbmV4dC5pbmRpY2VzW2ldXTtcblx0XHRcdFx0XHRpZiAoIXZlcnRleCkgY29udGludWU7XG5cdFx0XHRcdFx0dmVydGV4WzBdID0gbmV4dC5hZnRlcltpICogM107XG5cdFx0XHRcdFx0dmVydGV4WzFdID0gbmV4dC5hZnRlcltpICogMyArIDFdO1xuXHRcdFx0XHRcdHZlcnRleFsyXSA9IG5leHQuYWZ0ZXJbaSAqIDMgKyAyXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtZXNoLnJhZGl1cyA9IGNvbXB1dGVSYWRpdXMobWVzaC52ZXJ0aWNlcyk7XG5cdFx0XHRcdG1lc2gubm9ybWFscyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKG5leHQudHJhbnNmb3JtcykgYXBwbHlUcmFuc2Zvcm1zKHN0YXRlLCBuZXh0LnRyYW5zZm9ybXMuYWZ0ZXIpO1xuXHRcdFx0XHRvYmplY3QuZ2VvbWV0cnlWZXJzaW9uKys7XG5cdFx0XHRcdHBhc3QucHVzaChuZXh0KTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRjYW5VbmRvOiAoKSA9PiBwYXN0Lmxlbmd0aCA+IDAsXG5cdFx0Y2FuUmVkbzogKCkgPT4gZnV0dXJlLmxlbmd0aCA+IDAsXG5cdFx0aGlzdG9yeVNpemU6ICgpID0+ICh7IHBhc3Q6IHBhc3QubGVuZ3RoLCBmdXR1cmU6IGZ1dHVyZS5sZW5ndGggfSksXG5cdFx0dG9nZ2xlR2FtZU1vZGU6ICgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmdhbWVNb2RlID0gIXN0YXRlLmdhbWVNb2RlO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRhZGRTY29yZTogKGFtb3VudCA9IDEpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnNjb3JlICs9IGFtb3VudDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0c2V0U2NvcmU6IChzY29yZTogbnVtYmVyKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5zY29yZSA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQoc2NvcmUpKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0cmVzZXRTY29yZTogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0c3RhdGUuc2NvcmUgPSAwO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRyZXNldEdhbWVJbnB1dDogKCkgPT4ge1xuXHRcdFx0Z2FtZUlucHV0LnVwID0gZmFsc2U7XG5cdFx0XHRnYW1lSW5wdXQuZG93biA9IGZhbHNlO1xuXHRcdFx0Z2FtZUlucHV0LmxlZnQgPSBmYWxzZTtcblx0XHRcdGdhbWVJbnB1dC5yaWdodCA9IGZhbHNlO1xuXHRcdFx0Z2FtZUlucHV0Lmp1bXAgPSBmYWxzZTtcblx0XHR9LFxuXHRcdHNldEdhbWVJbnB1dDogKGRpcmVjdGlvbjoga2V5b2YgR2FtZUlucHV0LCBwcmVzc2VkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRnYW1lSW5wdXRbZGlyZWN0aW9uXSA9IHByZXNzZWQ7XG5cdFx0fSxcblx0XHRzZXRKdW1wOiAocHJlc3NlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0Z2FtZUlucHV0Lmp1bXAgPSBwcmVzc2VkO1xuXHRcdH0sXG5cdFx0Z2V0R2FtZUlucHV0OiAoKTogR2FtZUlucHV0ID0+ICh7IC4uLmdhbWVJbnB1dCB9KSxcblxuXHRcdC8vIC0tLS0gRWRpdCBtb2RlIC0tLS1cblx0XHRzZXRFZGl0TW9kZTogKGVkaXRNb2RlOiBib29sZWFuKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoc3RhdGUuZWRpdE1vZGUgPT09IGVkaXRNb2RlKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHN0YXRlLmVkaXRNb2RlID0gZWRpdE1vZGU7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkVmVydGljZXMgPSBbXTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRFZGdlcyA9IFtdO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEZhY2VzID0gW107XG5cdFx0XHRcdHN0YXRlLmhvdmVyID0gbnVsbDtcblx0XHRcdFx0aWYgKGVkaXRNb2RlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBzdGF0ZS5zZWxlY3RlZElkKTtcblx0XHRcdFx0XHRpZiAob2JqZWN0ICYmIG9iamVjdC50eXBlICE9PSAnbGlnaHQnICYmIG9iamVjdC50eXBlICE9PSAnY2FtZXJhJykge1xuXHRcdFx0XHRcdFx0bWF0ZXJpYWxpemVHZW9tZXRyeShvYmplY3QpO1xuXHRcdFx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IG9iamVjdCBvZiBzdGF0ZS5vYmplY3RzKSBvYmplY3Quc2VsZWN0aW9uVmVyc2lvbisrO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZXRFbGVtZW50TW9kZTogKGVsZW1lbnRNb2RlOiBFbGVtZW50S2luZCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0c3RhdGUuZWxlbWVudE1vZGUgPSBlbGVtZW50TW9kZTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRWZXJ0aWNlcyA9IFtdO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEVkZ2VzID0gW107XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkRmFjZXMgPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBvYmplY3Qgb2Ygc3RhdGUub2JqZWN0cykgb2JqZWN0LnNlbGVjdGlvblZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0c2V0SG92ZXI6IChob3ZlcjogU2NlbmVTdGF0ZVsnaG92ZXInXSkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXMgPSBzdGF0ZS5ob3Zlcjtcblx0XHRcdFx0aWYgKHByZXZpb3VzPy5raW5kID09PSBob3Zlcj8ua2luZCAmJiBwcmV2aW91cz8uaW5kZXggPT09IGhvdmVyPy5pbmRleCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRzdGF0ZS5ob3ZlciA9IGhvdmVyO1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAob2JqZWN0KSBvYmplY3Quc2VsZWN0aW9uVmVyc2lvbisrO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZWxlY3RFbGVtZW50OiAoa2luZDogRWxlbWVudEtpbmQsIGluZGV4OiBudW1iZXIsIGFkZGl0aXZlOiBib29sZWFuKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBraW5kID09PSAndmVydGV4JyA/ICdzZWxlY3RlZFZlcnRpY2VzJyA6IGtpbmQgPT09ICdlZGdlJyA/ICdzZWxlY3RlZEVkZ2VzJyA6ICdzZWxlY3RlZEZhY2VzJztcblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHN0YXRlW2tleV07XG5cdFx0XHRcdGNvbnN0IGV4aXN0cyA9IGN1cnJlbnQuaW5jbHVkZXMoaW5kZXgpO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzID0ga2luZCA9PT0gJ3ZlcnRleCcgPyBzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzIDogW107XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkRWRnZXMgPSBraW5kID09PSAnZWRnZScgPyBzdGF0ZS5zZWxlY3RlZEVkZ2VzIDogW107XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkRmFjZXMgPSBraW5kID09PSAnZmFjZScgPyBzdGF0ZS5zZWxlY3RlZEZhY2VzIDogW107XG5cdFx0XHRcdGlmIChhZGRpdGl2ZSAmJiBleGlzdHMpIHN0YXRlW2tleV0gPSBjdXJyZW50LmZpbHRlcigodmFsdWUpID0+IHZhbHVlICE9PSBpbmRleCk7XG5cdFx0XHRcdGVsc2UgaWYgKGFkZGl0aXZlKSBzdGF0ZVtrZXldID0gdW5pcXVlU29ydGVkKFsuLi5jdXJyZW50LCBpbmRleF0pO1xuXHRcdFx0XHRlbHNlIHN0YXRlW2tleV0gPSBbaW5kZXhdO1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAob2JqZWN0KSBvYmplY3Quc2VsZWN0aW9uVmVyc2lvbisrO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRzZWxlY3RFbGVtZW50czogKGtpbmQ6IEVsZW1lbnRLaW5kLCBpbmRpY2VzOiBudW1iZXJbXSwgYWRkaXRpdmU6IGJvb2xlYW4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGtpbmQgPT09ICd2ZXJ0ZXgnID8gJ3NlbGVjdGVkVmVydGljZXMnIDoga2luZCA9PT0gJ2VkZ2UnID8gJ3NlbGVjdGVkRWRnZXMnIDogJ3NlbGVjdGVkRmFjZXMnO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzID0ga2luZCA9PT0gJ3ZlcnRleCcgPyBzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzIDogW107XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkRWRnZXMgPSBraW5kID09PSAnZWRnZScgPyBzdGF0ZS5zZWxlY3RlZEVkZ2VzIDogW107XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkRmFjZXMgPSBraW5kID09PSAnZmFjZScgPyBzdGF0ZS5zZWxlY3RlZEZhY2VzIDogW107XG5cdFx0XHRcdHN0YXRlW2tleV0gPSBhZGRpdGl2ZSA/IHVuaXF1ZVNvcnRlZChbLi4uc3RhdGVba2V5XSwgLi4uaW5kaWNlc10pIDogdW5pcXVlU29ydGVkKGluZGljZXMpO1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAob2JqZWN0KSBvYmplY3Quc2VsZWN0aW9uVmVyc2lvbisrO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblx0XHRjbGVhckVsZW1lbnRTZWxlY3Rpb246ICgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkVmVydGljZXMgPSBbXTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRFZGdlcyA9IFtdO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEZhY2VzID0gW107XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gc3RhdGUuc2VsZWN0ZWRJZCk7XG5cdFx0XHRcdGlmIChvYmplY3QpIG9iamVjdC5zZWxlY3Rpb25WZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0LyoqIFRyYW5zbGF0ZXMvc2NhbGVzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgdmVydGljZXMsIGVkZ2VzLCBvciBmYWNlcyBpbiBFZGl0IE1vZGUuICovXG5cdFx0dHJhbnNsYXRlU2VsZWN0ZWRFbGVtZW50czogKGRlbHRhOiBWZWMzKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCAhb2JqZWN0Lmdlb21ldHJ5KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBvYmplY3QuZ2VvbWV0cnk7XG5cdFx0XHRcdGNvbnN0IHZJbmRpY2VzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0XHRcdGZvciAoY29uc3QgdiBvZiBzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzKSB2SW5kaWNlcy5hZGQodik7XG5cdFx0XHRcdGZvciAoY29uc3QgZSBvZiBzdGF0ZS5zZWxlY3RlZEVkZ2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRnZSA9IG1lc2guZWRnZXNbZV07XG5cdFx0XHRcdFx0aWYgKGVkZ2UpIHsgdkluZGljZXMuYWRkKGVkZ2VbMF0pOyB2SW5kaWNlcy5hZGQoZWRnZVsxXSk7IH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGYgb2Ygc3RhdGUuc2VsZWN0ZWRGYWNlcykge1xuXHRcdFx0XHRcdGNvbnN0IGZhY2UgPSBtZXNoLmZhY2VzW2ZdO1xuXHRcdFx0XHRcdGlmIChmYWNlKSBmb3IgKGNvbnN0IHYgb2YgZmFjZSkgdkluZGljZXMuYWRkKHYpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdkluZGljZXMuc2l6ZSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkeCBvZiB2SW5kaWNlcykge1xuXHRcdFx0XHRcdGNvbnN0IHYgPSBtZXNoLnZlcnRpY2VzW2lkeF07XG5cdFx0XHRcdFx0aWYgKCF2KSBjb250aW51ZTtcblx0XHRcdFx0XHR2WzBdICs9IGRlbHRhWzBdO1xuXHRcdFx0XHRcdHZbMV0gKz0gZGVsdGFbMV07XG5cdFx0XHRcdFx0dlsyXSArPSBkZWx0YVsyXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtZXNoLnJhZGl1cyA9IGNvbXB1dGVSYWRpdXMobWVzaC52ZXJ0aWNlcyk7XG5cdFx0XHRcdGlmIChtZXNoLnNtb290aCkgbWVzaC5ub3JtYWxzID0gY29tcHV0ZVZlcnRleE5vcm1hbHMobWVzaCk7XG5cdFx0XHRcdGVsc2UgbWVzaC5ub3JtYWxzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRvYmplY3QuZ2VvbWV0cnlWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0Ly8gLS0tLSBNZXNoIG9wZXJhdGlvbnMgLS0tLVxuXHRcdG1lc2hPcDogKG9wOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9KSA9PiB7XG5cdFx0XHRsZXQgZmFpbHVyZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gc3RhdGUuc2VsZWN0ZWRJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0IHx8IG9iamVjdC50eXBlID09PSAnbGlnaHQnIHx8IG9iamVjdC50eXBlID09PSAnY2FtZXJhJykgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBtZXNoID0gbWF0ZXJpYWxpemVHZW9tZXRyeShvYmplY3QpO1xuXHRcdFx0XHRsZXQgbmV4dDogTWVzaCB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRsZXQgbmV4dEVkZ2VzOiBbbnVtYmVyLCBudW1iZXJdW10gfCBudWxsID0gbnVsbDtcblx0XHRcdFx0bGV0IG5leHRWZXJ0czogbnVtYmVyW10gfCBudWxsID0gbnVsbDtcblx0XHRcdFx0bGV0IG5leHRGYWNlczogbnVtYmVyW10gfCBudWxsID0gbnVsbDtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRzd2l0Y2ggKG9wKSB7XG5cdFx0XHRcdFx0Y2FzZSAnc3ViZGl2aWRlJzpcblx0XHRcdFx0XHRcdG5leHQgPSBzdWJkaXZpZGUobWVzaCwgbWVzaC5zbW9vdGggPz8gdHJ1ZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdleHRydWRlJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmFjZXNUb0V4dHJ1ZGUgPSBzdGF0ZS5zZWxlY3RlZEZhY2VzLmxlbmd0aFxuXHRcdFx0XHRcdFx0XHQ/IHN0YXRlLnNlbGVjdGVkRmFjZXNcblx0XHRcdFx0XHRcdFx0OiBtZXNoLmZhY2VzLmxlbmd0aCA/IFswXSA6IFtdO1xuXHRcdFx0XHRcdFx0aWYgKCFmYWNlc1RvRXh0cnVkZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0cGFzdC5wb3AoKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bmV4dCA9IGV4dHJ1ZGVGYWNlcyhtZXNoLCBmYWNlc1RvRXh0cnVkZSwgcGFyYW1zLmFtb3VudCA/PyAwLjM1KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdpbnNldCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGZhY2VzVG9JbnNldCA9IHN0YXRlLnNlbGVjdGVkRmFjZXMubGVuZ3RoXG5cdFx0XHRcdFx0XHRcdD8gc3RhdGUuc2VsZWN0ZWRGYWNlc1xuXHRcdFx0XHRcdFx0XHQ6IG1lc2guZmFjZXMubGVuZ3RoID8gWzBdIDogW107XG5cdFx0XHRcdFx0XHRpZiAoIWZhY2VzVG9JbnNldC5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0cGFzdC5wb3AoKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bmV4dCA9IGluc2V0RmFjZXMobWVzaCwgZmFjZXNUb0luc2V0LCBwYXJhbXMuYW1vdW50ID8/IDAuMTgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ2RlbGV0ZSc6XG5cdFx0XHRcdFx0XHRpZiAoc3RhdGUuc2VsZWN0ZWRGYWNlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHN0YXRlLnNlbGVjdGVkRmFjZXMubGVuZ3RoID49IG1lc2guZmFjZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdFx0cGFzdC5wb3AoKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0bmV4dCA9IGRlbGV0ZU1lc2hGYWNlcyhtZXNoLCBzdGF0ZS5zZWxlY3RlZEZhY2VzKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUuZWxlbWVudE1vZGUgPT09ICdlZGdlJyAmJiBzdGF0ZS5zZWxlY3RlZEVkZ2VzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRuZXh0ID0gZGVsZXRlR2VvbWV0cnkobWVzaCwgJ2VkZ2UnLCBzdGF0ZS5zZWxlY3RlZEVkZ2VzKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUuZWxlbWVudE1vZGUgPT09ICd2ZXJ0ZXgnICYmIHN0YXRlLnNlbGVjdGVkVmVydGljZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdG5leHQgPSBkZWxldGVHZW9tZXRyeShtZXNoLCAndmVydGV4Jywgc3RhdGUuc2VsZWN0ZWRWZXJ0aWNlcyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwYXN0LnBvcCgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdkdXBsaWNhdGUnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmRpY2VzID1cblx0XHRcdFx0XHRcdFx0c3RhdGUuZWxlbWVudE1vZGUgPT09ICdmYWNlJ1xuXHRcdFx0XHRcdFx0XHRcdD8gKHN0YXRlLnNlbGVjdGVkRmFjZXMubGVuZ3RoID8gc3RhdGUuc2VsZWN0ZWRGYWNlcyA6IFswXSlcblx0XHRcdFx0XHRcdFx0XHQ6IHN0YXRlLmVsZW1lbnRNb2RlID09PSAnZWRnZSdcblx0XHRcdFx0XHRcdFx0XHRcdD8gKHN0YXRlLnNlbGVjdGVkRWRnZXMubGVuZ3RoID8gc3RhdGUuc2VsZWN0ZWRFZGdlcyA6IFswXSlcblx0XHRcdFx0XHRcdFx0XHRcdDogKHN0YXRlLnNlbGVjdGVkVmVydGljZXMubGVuZ3RoID8gc3RhdGUuc2VsZWN0ZWRWZXJ0aWNlcyA6IG1lc2gudmVydGljZXMubWFwKChfLCBpKSA9PiBpKSk7XG5cdFx0XHRcdFx0XHRjb25zdCBkdXAgPSBkdXBsaWNhdGVNZXNoR2VvbWV0cnkobWVzaCwgc3RhdGUuZWxlbWVudE1vZGUsIGluZGljZXMpO1xuXHRcdFx0XHRcdFx0bmV4dCA9IGR1cC5tZXNoO1xuXHRcdFx0XHRcdFx0bmV4dFZlcnRzID0gZHVwLm5ld1ZlcnRleEluZGljZXM7XG5cdFx0XHRcdFx0XHRuZXh0RmFjZXMgPSBkdXAubmV3RmFjZUluZGljZXM7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnbWVyZ2UnOlxuXHRcdFx0XHRcdFx0bmV4dCA9IG1lcmdlQnlEaXN0YW5jZShtZXNoLCBwYXJhbXMuYW1vdW50ID8/IDAuMDAxKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2ZsaXAnOlxuXHRcdFx0XHRcdFx0bmV4dCA9IGZsaXBOb3JtYWxzKG1lc2gpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnYXJyYXknOlxuXHRcdFx0XHRcdFx0bmV4dCA9IGFycmF5TWVzaChtZXNoLCBwYXJhbXMuYW1vdW50ID8/IHBhcmFtcy5jb3VudCA/PyAzLCBwYXJhbXMub2Zmc2V0ID8/IFsxLjI1LCAwLCAwXSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzb2xpZGlmeSc6XG5cdFx0XHRcdFx0XHRuZXh0ID0gc29saWRpZnlNZXNoKG1lc2gsIHBhcmFtcy5hbW91bnQgPz8gMC4xMik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzbW9vdGgnOlxuXHRcdFx0XHRcdFx0bmV4dCA9IHNtb290aE1lc2hWZXJ0aWNlcyhtZXNoLCBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHBhcmFtcy5hbW91bnQgPz8gcGFyYW1zLml0ZXJhdGlvbnMgPz8gMikpLCBwYXJhbXMuZmFjdG9yID8/IDAuNSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd1bndyYXAtYm94Jzpcblx0XHRcdFx0XHRcdG5leHQgPSB1bndyYXBNZXNoVVYobWVzaCwgJ2JveCcsIHBhcmFtcy5hbW91bnQgPz8gMSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd1bndyYXAtcGxhbmFyJzpcblx0XHRcdFx0XHRcdG5leHQgPSB1bndyYXBNZXNoVVYobWVzaCwgJ3BsYW5hcicsIHBhcmFtcy5hbW91bnQgPz8gMSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd1bndyYXAtY3lsaW5kcmljYWwnOlxuXHRcdFx0XHRcdFx0bmV4dCA9IHVud3JhcE1lc2hVVihtZXNoLCAnY3lsaW5kcmljYWwnLCBwYXJhbXMuYW1vdW50ID8/IDEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndW53cmFwLXNwaGVyaWNhbCc6XG5cdFx0XHRcdFx0XHRuZXh0ID0gdW53cmFwTWVzaFVWKG1lc2gsICdzcGhlcmljYWwnLCBwYXJhbXMuYW1vdW50ID8/IDEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnYmFrZS1hbyc6XG5cdFx0XHRcdFx0XHRuZXh0ID0gYmFrZU1lc2hWZXJ0ZXhDb2xvcnMobWVzaCwgJ2FvJyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdiYWtlLWxpZ2h0Jzpcblx0XHRcdFx0XHRcdG5leHQgPSBiYWtlTWVzaFZlcnRleENvbG9ycyhtZXNoLCAnbGlnaHQnKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2Jha2UtZ3JhZGllbnQnOlxuXHRcdFx0XHRcdFx0bmV4dCA9IGJha2VNZXNoVmVydGV4Q29sb3JzKG1lc2gsICdncmFkaWVudCcpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnYmFrZS1jdXJ2YXR1cmUnOlxuXHRcdFx0XHRcdFx0bmV4dCA9IGJha2VNZXNoVmVydGV4Q29sb3JzKG1lc2gsICdjdXJ2YXR1cmUnKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2xvb3BjdXQnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGFydCA9IHN0YXRlLnNlbGVjdGVkRWRnZXNbMF0gPz8gMDtcblx0XHRcdFx0XHRcdGNvbnN0IGN1dCA9IGxvb3BDdXQobWVzaCwgc3RhcnQsIHBhcmFtcy5hbW91bnQgPz8gcGFyYW1zLmN1dHMgPz8gMSk7XG5cdFx0XHRcdFx0XHRpZiAoIWN1dC5vaykge1xuXHRcdFx0XHRcdFx0XHRmYWlsdXJlID0gY3V0LmVycm9yLm1lc3NhZ2U7XG5cdFx0XHRcdFx0XHRcdHBhc3QucG9wKCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdG5leHQgPSBjdXQubWVzaDtcblx0XHRcdFx0XHRcdG5leHRFZGdlcyA9IGN1dC5lZGdlcztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdiZXZlbCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvcm5lcnMgPSBzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzLmxlbmd0aFxuXHRcdFx0XHRcdFx0XHQ/IHN0YXRlLnNlbGVjdGVkVmVydGljZXNcblx0XHRcdFx0XHRcdFx0OiBtZXNoLnZlcnRpY2VzLm1hcCgoXywgaW5kZXgpID0+IGluZGV4KTtcblx0XHRcdFx0XHRcdGNvbnN0IGJldmVsbGVkID0gYmV2ZWxWZXJ0aWNlcyhtZXNoLCBjb3JuZXJzLCBwYXJhbXMuYW1vdW50ID8/IDAuMDUsIHBhcmFtcy5zZWdtZW50cyA/PyAxKTtcblx0XHRcdFx0XHRcdGlmICghYmV2ZWxsZWQub2spIHtcblx0XHRcdFx0XHRcdFx0ZmFpbHVyZSA9IGJldmVsbGVkLmVycm9yLm1lc3NhZ2U7XG5cdFx0XHRcdFx0XHRcdHBhc3QucG9wKCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdG5leHQgPSBiZXZlbGxlZC5tZXNoO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ2JyaWRnZSc6IHtcblx0XHRcdFx0XHRcdGlmIChzdGF0ZS5zZWxlY3RlZEZhY2VzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGYxID0gbWVzaC5mYWNlc1tzdGF0ZS5zZWxlY3RlZEZhY2VzWzBdXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZjIgPSBtZXNoLmZhY2VzW3N0YXRlLnNlbGVjdGVkRmFjZXNbMV1dO1xuXHRcdFx0XHRcdFx0XHRuZXh0ID0gYnJpZGdlRWRnZUxvb3BzKG1lc2gsIGYxLCBmMik7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlLnNlbGVjdGVkRWRnZXMubGVuZ3RoID49IDIpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZTEgPSBtZXNoLmVkZ2VzW3N0YXRlLnNlbGVjdGVkRWRnZXNbMF1dO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlMiA9IG1lc2guZWRnZXNbc3RhdGUuc2VsZWN0ZWRFZGdlc1sxXV07XG5cdFx0XHRcdFx0XHRcdG5leHQgPSBicmlkZ2VFZGdlTG9vcHMobWVzaCwgW2UxWzBdLCBlMVsxXV0sIFtlMlswXSwgZTJbMV1dKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIEJyaWRnZSBib3VuZGFyeSBsb29wcyBvciBvcHBvc2l0ZSBmYWNlc1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmMSA9IG1lc2guZmFjZXNbMF07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGYyID0gbWVzaC5mYWNlc1ttZXNoLmZhY2VzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdFx0XHRuZXh0ID0gYnJpZGdlRWRnZUxvb3BzKG1lc2gsIGYxLCBmMik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnbWVyZ2UtY2VudGVyJzpcblx0XHRcdFx0XHRjYXNlICdtZXJnZS1maXJzdCc6XG5cdFx0XHRcdFx0Y2FzZSAnbWVyZ2UtbGFzdCc6XG5cdFx0XHRcdFx0Y2FzZSAnbWVyZ2UtY29sbGFwc2UnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBtb2RlID0gb3AgPT09ICdtZXJnZS1maXJzdCcgPyAnZmlyc3QnIDogb3AgPT09ICdtZXJnZS1sYXN0JyA/ICdsYXN0JyA6IG9wID09PSAnbWVyZ2UtY29sbGFwc2UnID8gJ2NvbGxhcHNlJyA6ICdjZW50ZXInO1xuXHRcdFx0XHRcdFx0Y29uc3QgdmVydHMgPSBzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzLmxlbmd0aCA/IHN0YXRlLnNlbGVjdGVkVmVydGljZXMgOiBtZXNoLnZlcnRpY2VzLm1hcCgoXywgaSkgPT4gaSk7XG5cdFx0XHRcdFx0XHRuZXh0ID0gbWVyZ2VWZXJ0aWNlcyhtZXNoLCB2ZXJ0cywgbW9kZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnZGlzc29sdmUnOiB7XG5cdFx0XHRcdFx0XHRpZiAoc3RhdGUuZWxlbWVudE1vZGUgPT09ICdmYWNlJyAmJiBzdGF0ZS5zZWxlY3RlZEZhY2VzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRuZXh0ID0gZGlzc29sdmVHZW9tZXRyeShtZXNoLCAnZmFjZScsIHN0YXRlLnNlbGVjdGVkRmFjZXMpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2VkZ2UnICYmIHN0YXRlLnNlbGVjdGVkRWRnZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdG5leHQgPSBkaXNzb2x2ZUdlb21ldHJ5KG1lc2gsICdlZGdlJywgc3RhdGUuc2VsZWN0ZWRFZGdlcyk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlLmVsZW1lbnRNb2RlID09PSAndmVydGV4JyAmJiBzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRuZXh0ID0gZGlzc29sdmVHZW9tZXRyeShtZXNoLCAndmVydGV4Jywgc3RhdGUuc2VsZWN0ZWRWZXJ0aWNlcyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwYXN0LnBvcCgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnc2VwYXJhdGUnOiB7XG5cdFx0XHRcdFx0XHRpZiAoIXN0YXRlLnNlbGVjdGVkRmFjZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdHBhc3QucG9wKCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHNlcCA9IHNlcGFyYXRlR2VvbWV0cnkobWVzaCwgc3RhdGUuc2VsZWN0ZWRGYWNlcyk7XG5cdFx0XHRcdFx0XHRuZXh0ID0gc2VwLnJlbWFpbmluZ01lc2g7XG5cdFx0XHRcdFx0XHQvLyBBZGQgc2VwYXJhdGVkIG1lc2ggYXMgYSBuZXcgb2JqZWN0XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdJZCA9ICdvYmpfJyArIERhdGUubm93KCkudG9TdHJpbmcoMzYpICsgJ18nICsgTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgNik7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdPYmo6IFNjZW5lT2JqZWN0ID0ge1xuXHRcdFx0XHRcdFx0XHQuLi5vYmplY3QsXG5cdFx0XHRcdFx0XHRcdGlkOiBuZXdJZCxcblx0XHRcdFx0XHRcdFx0bmFtZTogb2JqZWN0Lm5hbWUgKyAnX3NlcCcsXG5cdFx0XHRcdFx0XHRcdGdlb21ldHJ5OiBzZXAuc2VwYXJhdGVkTWVzaCxcblx0XHRcdFx0XHRcdFx0Z2VvbWV0cnlWZXJzaW9uOiAxLFxuXHRcdFx0XHRcdFx0XHRjb2xvclZlcnNpb246IDEsXG5cdFx0XHRcdFx0XHRcdHNlbGVjdGlvblZlcnNpb246IDEsXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBbLi4ub2JqZWN0LnBvc2l0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRzdGF0ZS5vYmplY3RzLnB1c2gobmV3T2JqKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdkZWNpbWF0ZSc6IHtcblx0XHRcdFx0XHRcdG5leHQgPSBkZWNpbWF0ZU1lc2gobWVzaCwgcGFyYW1zLnJhdGlvID8/IHBhcmFtcy5hbW91bnQgPz8gMC41KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdtaXJyb3InOiB7XG5cdFx0XHRcdFx0XHRuZXh0ID0gbWlycm9yTWVzaChtZXNoLCBwYXJhbXMuYXhpcyA/PyAneCcsIHBhcmFtcy50aHJlc2hvbGQgPz8gMC4wMDEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3NjcmV3Jzoge1xuXHRcdFx0XHRcdFx0bmV4dCA9IHNjcmV3U3Bpbk1lc2goXG5cdFx0XHRcdFx0XHRcdG1lc2gsXG5cdFx0XHRcdFx0XHRcdHBhcmFtcy5heGlzID8/ICd6Jyxcblx0XHRcdFx0XHRcdFx0cGFyYW1zLmFuZ2xlID8/IDM2MCxcblx0XHRcdFx0XHRcdFx0cGFyYW1zLnN0ZXBzID8/IDE2LFxuXHRcdFx0XHRcdFx0XHRwYXJhbXMucGl0Y2ggPz8gcGFyYW1zLmFtb3VudCA/PyAwLjVcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnYm9vbGVhbic6IHtcblx0XHRcdFx0XHRcdC8vIFRhcmdldCBvYmplY3QgZnJvbSBwYXJhbXMgb3IgbmV4dCBhdmFpbGFibGUgbWVzaCBvYmplY3Rcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldE9iaiA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCAhPT0gb2JqZWN0LmlkICYmIG8uZ2VvbWV0cnkpO1xuXHRcdFx0XHRcdFx0aWYgKHRhcmdldE9iaiAmJiB0YXJnZXRPYmouZ2VvbWV0cnkpIHtcblx0XHRcdFx0XHRcdFx0bmV4dCA9IGJvb2xlYW5NZXNoKG1lc2gsIHRhcmdldE9iai5nZW9tZXRyeSwgcGFyYW1zLm9wID8/ICdkaWZmZXJlbmNlJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwYXN0LnBvcCgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHBhc3QucG9wKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdFx0cGFzdC5wb3AoKTtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5ID0gbmV4dDtcblx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdG9iamVjdC5zZWxlY3Rpb25WZXJzaW9uKys7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkVmVydGljZXMgPSBbXTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRFZGdlcyA9IFtdO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEZhY2VzID0gW107XG5cdFx0XHRcdGlmIChuZXh0RWRnZXMpIHtcblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEVkZ2VzID0gbmV4dEVkZ2VzXG5cdFx0XHRcdFx0XHQubWFwKChlZGdlKSA9PiBuZXh0IS5lZGdlcy5maW5kSW5kZXgoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlWzBdID09PSBlZGdlWzBdICYmIGNhbmRpZGF0ZVsxXSA9PT0gZWRnZVsxXSkpXG5cdFx0XHRcdFx0XHQuZmlsdGVyKChpbmRleCkgPT4gaW5kZXggPj0gMCk7XG5cdFx0XHRcdFx0c3RhdGUuZWxlbWVudE1vZGUgPSAnZWRnZSc7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dFZlcnRzIHx8IG5leHRGYWNlcykge1xuXHRcdFx0XHRcdGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2ZhY2UnICYmIG5leHRGYWNlcz8ubGVuZ3RoKSBzdGF0ZS5zZWxlY3RlZEZhY2VzID0gbmV4dEZhY2VzO1xuXHRcdFx0XHRcdGVsc2UgaWYgKG5leHRWZXJ0cz8ubGVuZ3RoKSBzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzID0gbmV4dFZlcnRzO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG9wID09PSAnYmV2ZWwnKSB7XG5cdFx0XHRcdFx0c3RhdGUuZWxlbWVudE1vZGUgPSAndmVydGV4Jztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBmYWlsdXJlO1xuXHRcdH0sXG5cblx0XHQvLyAtLS0tIFNjdWxwdCAvIHBhaW50IChPcHRpbWl6ZWQgaW4tcGxhY2UgdmVydGV4IHVwZGF0ZXMpIC0tLS1cblx0XHRhcHBseUJydXNoOiAoXG5cdFx0XHRraW5kOiBzdHJpbmcsXG5cdFx0XHRsb2NhbFBvaW50OiBWZWMzLFxuXHRcdFx0cmFkaXVzOiBudW1iZXIsXG5cdFx0XHRzdHJlbmd0aDogbnVtYmVyLFxuXHRcdFx0c3ltbWV0cnk6IHsgeDogYm9vbGVhbjsgeTogYm9vbGVhbjsgejogYm9vbGVhbiB9IHwgbnVsbCxcblx0XHRcdGRlbHRhOiBWZWMzID0gWzAsIDAsIDBdLFxuXHRcdFx0cHVzaCA9IHRydWUsXG5cdFx0XHRvcHRpb25zPzpcblx0XHRcdFx0fCAoKHBvaW50OiBWZWMzKSA9PiBWZWMzKVxuXHRcdFx0XHR8IHtcblx0XHRcdFx0XHRcdGhhcmRuZXNzPzogbnVtYmVyO1xuXHRcdFx0XHRcdFx0aW52ZXJ0ZWQ/OiBib29sZWFuO1xuXHRcdFx0XHRcdFx0ZmFsbG9mZj86ICdzbW9vdGgnIHwgJ2xpbmVhcicgfCAnaGFyZCc7XG5cdFx0XHRcdFx0XHRwcmVzc3VyZT86IG51bWJlcjtcblx0XHRcdFx0XHRcdHN0cm9rZVZlY3Rvcj86IFZlYzM7XG5cdFx0XHRcdFx0XHRoaXROb3JtYWw/OiBWZWMzO1xuXHRcdFx0XHQgIH0sXG5cdFx0KSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCBvYmplY3QudHlwZSA9PT0gJ2xpZ2h0JyB8fCBvYmplY3QudHlwZSA9PT0gJ2NhbWVyYScpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0aWYgKHB1c2gpIHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0Y29uc3QgbWVzaCA9IG1hdGVyaWFsaXplR2VvbWV0cnkob2JqZWN0KTtcblx0XHRcdFx0aWYgKCFtZXNoLm5vcm1hbHMgfHwgbWVzaC5ub3JtYWxzLmxlbmd0aCAhPT0gbWVzaC52ZXJ0aWNlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRtZXNoLm5vcm1hbHMgPSBjb21wdXRlVmVydGV4Tm9ybWFscyhtZXNoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBub3JtYWxzID0gbWVzaC5ub3JtYWxzO1xuXHRcdFx0XHRsZXQgYWZmZWN0ZWRDb3VudCA9IDA7XG5cdFx0XHRcdGNvbnN0IGNlbnRyZXM6IFZlYzNbXSA9IFtsb2NhbFBvaW50XTtcblx0XHRcdFx0aWYgKHN5bW1ldHJ5KSB7XG5cdFx0XHRcdFx0aWYgKHN5bW1ldHJ5LngpIGNlbnRyZXMucHVzaChbLWxvY2FsUG9pbnRbMF0sIGxvY2FsUG9pbnRbMV0sIGxvY2FsUG9pbnRbMl1dKTtcblx0XHRcdFx0XHRpZiAoc3ltbWV0cnkueSkgY2VudHJlcy5wdXNoKFtsb2NhbFBvaW50WzBdLCAtbG9jYWxQb2ludFsxXSwgbG9jYWxQb2ludFsyXV0pO1xuXHRcdFx0XHRcdGlmIChzeW1tZXRyeS56KSBjZW50cmVzLnB1c2goW2xvY2FsUG9pbnRbMF0sIGxvY2FsUG9pbnRbMV0sIC1sb2NhbFBvaW50WzJdXSk7XG5cdFx0XHRcdFx0aWYgKHN5bW1ldHJ5LnggJiYgc3ltbWV0cnkueSkgY2VudHJlcy5wdXNoKFstbG9jYWxQb2ludFswXSwgLWxvY2FsUG9pbnRbMV0sIGxvY2FsUG9pbnRbMl1dKTtcblx0XHRcdFx0XHRpZiAoc3ltbWV0cnkueCAmJiBzeW1tZXRyeS56KSBjZW50cmVzLnB1c2goWy1sb2NhbFBvaW50WzBdLCBsb2NhbFBvaW50WzFdLCAtbG9jYWxQb2ludFsyXV0pO1xuXHRcdFx0XHRcdGlmIChzeW1tZXRyeS55ICYmIHN5bW1ldHJ5LnopIGNlbnRyZXMucHVzaChbbG9jYWxQb2ludFswXSwgLWxvY2FsUG9pbnRbMV0sIC1sb2NhbFBvaW50WzJdXSk7XG5cdFx0XHRcdFx0aWYgKHN5bW1ldHJ5LnggJiYgc3ltbWV0cnkueSAmJiBzeW1tZXRyeS56KSBjZW50cmVzLnB1c2goWy1sb2NhbFBvaW50WzBdLCAtbG9jYWxQb2ludFsxXSwgLWxvY2FsUG9pbnRbMl1dKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoa2luZCA9PT0gJ3NpbXBsaWZ5Jykge1xuXHRcdFx0XHRcdGZvciAobGV0IGMgPSAwOyBjIDwgY2VudHJlcy5sZW5ndGg7IGMrKykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2ltcGxpZmllZCA9IGRlY2ltYXRlTG9jYWwobWVzaCwgY2VudHJlc1tjXSwgcmFkaXVzKTtcblx0XHRcdFx0XHRcdGlmIChzaW1wbGlmaWVkICE9PSBtZXNoICYmIHNpbXBsaWZpZWQudmVydGljZXMubGVuZ3RoIDwgbWVzaC52ZXJ0aWNlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5ID0gc2ltcGxpZmllZDtcblx0XHRcdFx0XHRcdFx0YWZmZWN0ZWRDb3VudCsrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoYWZmZWN0ZWRDb3VudCkge1xuXHRcdFx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRcdFx0b2JqZWN0LnNlbGVjdGlvblZlcnNpb24rKztcblx0XHRcdFx0XHRcdG9iamVjdC5jb2xvclZlcnNpb24rKztcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHB1c2gpIHtcblx0XHRcdFx0XHRcdHBhc3QucG9wKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgaGFyZG5lc3MgPSAwLjU7XG5cdFx0XHRcdGxldCBpbnZlcnRlZCA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgZmFsbG9mZlR5cGU6ICdzbW9vdGgnIHwgJ2xpbmVhcicgfCAnaGFyZCcgPSAnc21vb3RoJztcblx0XHRcdFx0bGV0IHByZXNzdXJlID0gMTtcblx0XHRcdFx0bGV0IHN0cm9rZVZlYzogVmVjMyB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRsZXQgaGl0Tm9ybTogVmVjMyB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnICYmIG9wdGlvbnMgIT09IG51bGwpIHtcblx0XHRcdFx0XHRpZiAob3B0aW9ucy5oYXJkbmVzcyAhPT0gdW5kZWZpbmVkKSBoYXJkbmVzcyA9IG9wdGlvbnMuaGFyZG5lc3M7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMuaW52ZXJ0ZWQgIT09IHVuZGVmaW5lZCkgaW52ZXJ0ZWQgPSBvcHRpb25zLmludmVydGVkO1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLmZhbGxvZmYgIT09IHVuZGVmaW5lZCkgZmFsbG9mZlR5cGUgPSBvcHRpb25zLmZhbGxvZmY7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMucHJlc3N1cmUgIT09IHVuZGVmaW5lZCkgcHJlc3N1cmUgPSBvcHRpb25zLnByZXNzdXJlO1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLnN0cm9rZVZlY3Rvcikgc3Ryb2tlVmVjID0gb3B0aW9ucy5zdHJva2VWZWN0b3I7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMuaGl0Tm9ybWFsKSBoaXROb3JtID0gb3B0aW9ucy5oaXROb3JtYWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2lnbiA9IGludmVydGVkID8gLTEgOiAxO1xuXHRcdFx0XHRjb25zdCBlZmZTdHJlbmd0aCA9IHN0cmVuZ3RoICogTWF0aC5tYXgoMC4wNSwgTWF0aC5taW4oMiwgcHJlc3N1cmUpKTtcblx0XHRcdFx0Y29uc3QgbmVpZ2hib3VycyA9IGtpbmQgPT09ICdzbW9vdGgnIHx8IGtpbmQgPT09ICdjbGF5JyA/IG1lc2hBZGphY2VuY3kobWVzaCkgOiBudWxsO1xuXHRcdFx0XHRjb25zdCByMiA9IHJhZGl1cyAqIHJhZGl1cztcblx0XHRcdFx0Y29uc3QgaW52UmFkaXVzID0gMSAvIE1hdGgubWF4KDFlLTYsIHJhZGl1cyk7XG5cdFx0XHRcdGNvbnN0IHZlcnRzID0gbWVzaC52ZXJ0aWNlcztcblx0XHRcdFx0Y29uc3QgdkxlbiA9IHZlcnRzLmxlbmd0aDtcblxuXHRcdFx0XHRpZiAoa2luZCA9PT0gJ21hc2snKSB7XG5cdFx0XHRcdFx0aWYgKCFtZXNoLm1hc2sgfHwgbWVzaC5tYXNrLmxlbmd0aCAhPT0gdkxlbikgbWVzaC5tYXNrID0gbmV3IEFycmF5KHZMZW4pLmZpbGwoMCk7XG5cdFx0XHRcdFx0Zm9yIChsZXQgYyA9IDA7IGMgPCBjZW50cmVzLmxlbmd0aDsgYysrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjZW50cmUgPSBjZW50cmVzW2NdO1xuXHRcdFx0XHRcdFx0Y29uc3QgY3ggPSBjZW50cmVbMF0sIGN5ID0gY2VudHJlWzFdLCBjeiA9IGNlbnRyZVsyXTtcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdkxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHYgPSB2ZXJ0c1tpXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZHggPSB2WzBdIC0gY3gsIGR5ID0gdlsxXSAtIGN5LCBkeiA9IHZbMl0gLSBjejtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZDIgPSBkeCAqIGR4ICsgZHkgKiBkeSArIGR6ICogZHo7XG5cdFx0XHRcdFx0XHRcdGlmIChkMiA+IHIyKSBjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0YWZmZWN0ZWRDb3VudCsrO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0ID0gMSAtIE1hdGguc3FydChkMikgKiBpbnZSYWRpdXM7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGRlbHRhTWFzayA9IHQgKiB0ICogZWZmU3RyZW5ndGggKiBzaWduO1xuXHRcdFx0XHRcdFx0XHRtZXNoLm1hc2tbaV0gPSBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBtZXNoLm1hc2tbaV0gKyBkZWx0YU1hc2spKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGFmZmVjdGVkQ291bnQpIG9iamVjdC5jb2xvclZlcnNpb24rKztcblx0XHRcdFx0XHRlbHNlIGlmIChwdXNoKSBwYXN0LnBvcCgpO1xuXHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAobGV0IGMgPSAwOyBjIDwgY2VudHJlcy5sZW5ndGg7IGMrKykge1xuXHRcdFx0XHRcdGNvbnN0IGNlbnRyZSA9IGNlbnRyZXNbY107XG5cdFx0XHRcdFx0Y29uc3QgY3ggPSBjZW50cmVbMF0sIGN5ID0gY2VudHJlWzFdLCBjeiA9IGNlbnRyZVsyXTtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZMZW47IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdiA9IHZlcnRzW2ldO1xuXHRcdFx0XHRcdFx0Y29uc3QgZHggPSB2WzBdIC0gY3gsIGR5ID0gdlsxXSAtIGN5LCBkeiA9IHZbMl0gLSBjejtcblx0XHRcdFx0XHRcdGNvbnN0IGQyID0gZHggKiBkeCArIGR5ICogZHkgKyBkeiAqIGR6O1xuXHRcdFx0XHRcdFx0aWYgKGQyID4gcjIpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWFza1ZhbCA9IG1lc2gubWFzaz8uW2ldID8/IDA7XG5cdFx0XHRcdFx0XHRjb25zdCB1bm1hc2tlZCA9IE1hdGgubWF4KDAsIDEgLSBtYXNrVmFsKTtcblx0XHRcdFx0XHRcdGlmICh1bm1hc2tlZCA8PSAxZS00KSBjb250aW51ZTtcblx0XHRcdFx0XHRcdGFmZmVjdGVkQ291bnQrKztcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3QgPSBNYXRoLnNxcnQoZDIpO1xuXHRcdFx0XHRcdFx0Y29uc3QgdCA9IDEgLSBkaXN0ICogaW52UmFkaXVzO1xuXHRcdFx0XHRcdFx0bGV0IGZhbGxvZmY6IG51bWJlcjtcblx0XHRcdFx0XHRcdGlmIChmYWxsb2ZmVHlwZSA9PT0gJ2xpbmVhcicpIHtcblx0XHRcdFx0XHRcdFx0ZmFsbG9mZiA9IHQ7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGZhbGxvZmZUeXBlID09PSAnaGFyZCcpIHtcblx0XHRcdFx0XHRcdFx0ZmFsbG9mZiA9IGRpc3QgPCAwLjg1ICogcmFkaXVzID8gMSA6IDYuNiAqICgxIC0gZGlzdCAqIGludlJhZGl1cyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb3NpbmUgPSAwLjUgKiAoMSArIE1hdGguY29zKCgxIC0gdCkgKiBNYXRoLlBJKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGV4cCA9IE1hdGgubWF4KDAuMSwgMi4yICogKDEgLSBoYXJkbmVzcykgKyAwLjMpO1xuXHRcdFx0XHRcdFx0XHRmYWxsb2ZmID0gTWF0aC5wb3coY29zaW5lLCBleHApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgYW1vdW50ID0gZmFsbG9mZiAqIGVmZlN0cmVuZ3RoICogdW5tYXNrZWQ7XG5cdFx0XHRcdFx0XHRpZiAoa2luZCA9PT0gJ2RyYXcnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG4gPSBub3JtYWxzW2ldID8/IFswLCAxLCAwXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZGlzcCA9IDAuMTIgKiBhbW91bnQgKiBzaWduO1xuXHRcdFx0XHRcdFx0XHR2WzBdICs9IG5bMF0gKiBkaXNwO1xuXHRcdFx0XHRcdFx0XHR2WzFdICs9IG5bMV0gKiBkaXNwO1xuXHRcdFx0XHRcdFx0XHR2WzJdICs9IG5bMl0gKiBkaXNwO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChraW5kID09PSAnY2xheScpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbiA9IGhpdE5vcm0gPz8gbm9ybWFsc1tpXSA/PyBbMCwgMSwgMF07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHBsYW5lRGlzdCA9ICgwLjE0ICogc2lnbiAqIGVmZlN0cmVuZ3RoICogZmFsbG9mZiAtIChkeCAqIG5bMF0gKyBkeSAqIG5bMV0gKyBkeiAqIG5bMl0pKSAqIE1hdGgubWluKDEsIDAuODUgKiBhbW91bnQpO1xuXHRcdFx0XHRcdFx0XHR2WzBdICs9IG5bMF0gKiBwbGFuZURpc3Q7XG5cdFx0XHRcdFx0XHRcdHZbMV0gKz0gblsxXSAqIHBsYW5lRGlzdDtcblx0XHRcdFx0XHRcdFx0dlsyXSArPSBuWzJdICogcGxhbmVEaXN0O1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChraW5kID09PSAnc21vb3RoJykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsaXN0ID0gbmVpZ2hib3Vycz8uZ2V0KGkpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWxpc3QgfHwgIWxpc3QubGVuZ3RoKSBjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0bGV0IGF4ID0gMCwgYXkgPSAwLCBheiA9IDA7XG5cdFx0XHRcdFx0XHRcdGZvciAobGV0IGsgPSAwOyBrIDwgbGlzdC5sZW5ndGg7IGsrKykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG5iID0gdmVydHNbbGlzdFtrXV07XG5cdFx0XHRcdFx0XHRcdFx0YXggKz0gbmJbMF07XG5cdFx0XHRcdFx0XHRcdFx0YXkgKz0gbmJbMV07XG5cdFx0XHRcdFx0XHRcdFx0YXogKz0gbmJbMl07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgaW52TCA9IDEgLyBsaXN0Lmxlbmd0aDtcblx0XHRcdFx0XHRcdFx0Y29uc3Qga0ZhY3RvciA9IE1hdGgubWluKDEsIGFtb3VudCk7XG5cdFx0XHRcdFx0XHRcdHZbMF0gKz0gKGF4ICogaW52TCAtIHZbMF0pICoga0ZhY3Rvcjtcblx0XHRcdFx0XHRcdFx0dlsxXSArPSAoYXkgKiBpbnZMIC0gdlsxXSkgKiBrRmFjdG9yO1xuXHRcdFx0XHRcdFx0XHR2WzJdICs9IChheiAqIGludkwgLSB2WzJdKSAqIGtGYWN0b3I7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGtpbmQgPT09ICdpbmZsYXRlJykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuID0gbm9ybWFsc1tpXSA/PyBbMCwgMSwgMF07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGRpc3AgPSAwLjE1ICogYW1vdW50ICogc2lnbjtcblx0XHRcdFx0XHRcdFx0dlswXSArPSBuWzBdICogZGlzcDtcblx0XHRcdFx0XHRcdFx0dlsxXSArPSBuWzFdICogZGlzcDtcblx0XHRcdFx0XHRcdFx0dlsyXSArPSBuWzJdICogZGlzcDtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoa2luZCA9PT0gJ2dyYWInKSB7XG5cdFx0XHRcdFx0XHRcdHZbMF0gKz0gZGVsdGFbMF0gKiBhbW91bnQ7XG5cdFx0XHRcdFx0XHRcdHZbMV0gKz0gZGVsdGFbMV0gKiBhbW91bnQ7XG5cdFx0XHRcdFx0XHRcdHZbMl0gKz0gZGVsdGFbMl0gKiBhbW91bnQ7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGtpbmQgPT09ICdzbmFrZV9ob29rJykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzdiA9ICFzdHJva2VWZWMgfHwgKHN0cm9rZVZlY1swXSA9PT0gMCAmJiBzdHJva2VWZWNbMV0gPT09IDAgJiYgc3Ryb2tlVmVjWzJdID09PSAwKSA/IGRlbHRhIDogc3Ryb2tlVmVjO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzY2FsZUhvb2sgPSAxLjM1O1xuXHRcdFx0XHRcdFx0XHR2WzBdICs9IHN2WzBdICogYW1vdW50ICogc2NhbGVIb29rO1xuXHRcdFx0XHRcdFx0XHR2WzFdICs9IHN2WzFdICogYW1vdW50ICogc2NhbGVIb29rO1xuXHRcdFx0XHRcdFx0XHR2WzJdICs9IHN2WzJdICogYW1vdW50ICogc2NhbGVIb29rO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChraW5kID09PSAncGluY2gnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGtGYWN0b3IgPSBNYXRoLm1pbigwLjcsIDAuOCAqIGFtb3VudCkgKiBzaWduO1xuXHRcdFx0XHRcdFx0XHR2WzBdIC09IGR4ICoga0ZhY3Rvcjtcblx0XHRcdFx0XHRcdFx0dlsxXSAtPSBkeSAqIGtGYWN0b3I7XG5cdFx0XHRcdFx0XHRcdHZbMl0gLT0gZHogKiBrRmFjdG9yO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChraW5kID09PSAnY3JlYXNlJykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwaW5jaEZhY3RvciA9IE1hdGgubWluKDAuNjUsIDAuNyAqIGFtb3VudCk7XG5cdFx0XHRcdFx0XHRcdHZbMF0gLT0gZHggKiBwaW5jaEZhY3Rvcjtcblx0XHRcdFx0XHRcdFx0dlsxXSAtPSBkeSAqIHBpbmNoRmFjdG9yO1xuXHRcdFx0XHRcdFx0XHR2WzJdIC09IGR6ICogcGluY2hGYWN0b3I7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG4gPSBub3JtYWxzW2ldID8/IFswLCAxLCAwXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaW5kZW50ID0gMC4xMiAqIGFtb3VudCAqIChpbnZlcnRlZCA/IDEgOiAtMSk7XG5cdFx0XHRcdFx0XHRcdHZbMF0gKz0gblswXSAqIGluZGVudDtcblx0XHRcdFx0XHRcdFx0dlsxXSArPSBuWzFdICogaW5kZW50O1xuXHRcdFx0XHRcdFx0XHR2WzJdICs9IG5bMl0gKiBpbmRlbnQ7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGtpbmQgPT09ICdmbGF0dGVuJykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuID0gaGl0Tm9ybSA/PyBub3JtYWxzW2ldID8/IFswLCAxLCAwXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZGlzdGFuY2UgPSAoZHggKiBuWzBdICsgZHkgKiBuWzFdICsgZHogKiBuWzJdKSAqIE1hdGgubWluKDEsIGFtb3VudCk7XG5cdFx0XHRcdFx0XHRcdHZbMF0gLT0gblswXSAqIGRpc3RhbmNlO1xuXHRcdFx0XHRcdFx0XHR2WzFdIC09IG5bMV0gKiBkaXN0YW5jZTtcblx0XHRcdFx0XHRcdFx0dlsyXSAtPSBuWzJdICogZGlzdGFuY2U7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGtpbmQgPT09ICdmaWxsJykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuID0gaGl0Tm9ybSA/PyBub3JtYWxzW2ldID8/IFswLCAxLCAwXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZGlzdGFuY2UgPSBkeCAqIG5bMF0gKyBkeSAqIG5bMV0gKyBkeiAqIG5bMl07XG5cdFx0XHRcdFx0XHRcdGlmIChzaWduID4gMCAmJiBkaXN0YW5jZSA8IDApIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBrRmFjdG9yID0gZGlzdGFuY2UgKiBNYXRoLm1pbigxLCBhbW91bnQpO1xuXHRcdFx0XHRcdFx0XHRcdHZbMF0gLT0gblswXSAqIGtGYWN0b3I7XG5cdFx0XHRcdFx0XHRcdFx0dlsxXSAtPSBuWzFdICoga0ZhY3Rvcjtcblx0XHRcdFx0XHRcdFx0XHR2WzJdIC09IG5bMl0gKiBrRmFjdG9yO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHNpZ24gPCAwICYmIGRpc3RhbmNlIDwgMCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGtGYWN0b3IgPSBNYXRoLmFicyhkaXN0YW5jZSkgKiBNYXRoLm1pbigwLjUsIDAuNSAqIGFtb3VudCk7XG5cdFx0XHRcdFx0XHRcdFx0dlswXSAtPSBuWzBdICoga0ZhY3Rvcjtcblx0XHRcdFx0XHRcdFx0XHR2WzFdIC09IG5bMV0gKiBrRmFjdG9yO1xuXHRcdFx0XHRcdFx0XHRcdHZbMl0gLT0gblsyXSAqIGtGYWN0b3I7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFhZmZlY3RlZENvdW50KSB7XG5cdFx0XHRcdFx0aWYgKHB1c2gpIHBhc3QucG9wKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1lc2gucmFkaXVzID0gY29tcHV0ZVJhZGl1cyh2ZXJ0cyk7XG5cdFx0XHRcdG1lc2gubm9ybWFscyA9IGNvbXB1dGVWZXJ0ZXhOb3JtYWxzKG1lc2gpO1xuXHRcdFx0XHRvYmplY3QuZ2VvbWV0cnlWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0Y2xlYXJNYXNrOiAoaWQ/OiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldElkID0gaWQgPz8gc3RhdGUuc2VsZWN0ZWRJZDtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSB0YXJnZXRJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0IHx8ICFvYmplY3QuZ2VvbWV0cnkpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRpZiAob2JqZWN0Lmdlb21ldHJ5Lm1hc2spIG9iamVjdC5nZW9tZXRyeS5tYXNrLmZpbGwoMCk7XG5cdFx0XHRcdG9iamVjdC5jb2xvclZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRpbnZlcnRNYXNrOiAoaWQ/OiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldElkID0gaWQgPz8gc3RhdGUuc2VsZWN0ZWRJZDtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSB0YXJnZXRJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0IHx8ICFvYmplY3QuZ2VvbWV0cnkpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRjb25zdCB2TGVuID0gb2JqZWN0Lmdlb21ldHJ5LnZlcnRpY2VzLmxlbmd0aDtcblx0XHRcdFx0aWYgKG9iamVjdC5nZW9tZXRyeS5tYXNrICYmIG9iamVjdC5nZW9tZXRyeS5tYXNrLmxlbmd0aCA9PT0gdkxlbikge1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdkxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0XHRvYmplY3QuZ2VvbWV0cnkubWFza1tpXSA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIDEgLSAob2JqZWN0Lmdlb21ldHJ5Lm1hc2tbaV0gPz8gMCkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5Lm1hc2sgPSBuZXcgQXJyYXkodkxlbikuZmlsbCgxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0Ymx1ck1hc2s6IChpZD86IHN0cmluZykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0SWQgPSBpZCA/PyBzdGF0ZS5zZWxlY3RlZElkO1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHRhcmdldElkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QgfHwgIW9iamVjdC5nZW9tZXRyeSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBtZXNoID0gb2JqZWN0Lmdlb21ldHJ5O1xuXHRcdFx0XHRjb25zdCB2TGVuID0gbWVzaC52ZXJ0aWNlcy5sZW5ndGg7XG5cdFx0XHRcdGlmICghbWVzaC5tYXNrIHx8IG1lc2gubWFzay5sZW5ndGggIT09IHZMZW4pIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRjb25zdCBhZGogPSBtZXNoQWRqYWNlbmN5KG1lc2gpO1xuXHRcdFx0XHRjb25zdCBuZXh0ID0gbmV3IEFycmF5KHZMZW4pLmZpbGwoMCk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdkxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmJzID0gYWRqLmdldChpKTtcblx0XHRcdFx0XHRpZiAoIW5icyB8fCAhbmJzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0bmV4dFtpXSA9IG1lc2gubWFza1tpXTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgc3VtID0gMiAqIG1lc2gubWFza1tpXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IG5iIG9mIG5icykgc3VtICs9IG1lc2gubWFza1tuYl0gPz8gMDtcblx0XHRcdFx0XHRuZXh0W2ldID0gc3VtIC8gKG5icy5sZW5ndGggKyAyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtZXNoLm1hc2sgPSBuZXh0O1xuXHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0YmluZEFybWF0dXJlOiAoaWQ/OiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldElkID0gaWQgPz8gc3RhdGUuc2VsZWN0ZWRJZDtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSB0YXJnZXRJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IHJvb3RCb25lID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLnR5cGUgPT09ICdib25lJyAmJiAhby5wYXJlbnQpID8/IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby50eXBlID09PSAnYm9uZScpO1xuXHRcdFx0XHRpZiAocm9vdEJvbmUgJiYgcm9vdEJvbmUuaWQgIT09IG9iamVjdC5pZCkge1xuXHRcdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0XHRvYmplY3QucGFyZW50ID0gcm9vdEJvbmUuaWQ7XG5cdFx0XHRcdFx0aWYgKCFyb290Qm9uZS5jaGlsZHJlbi5pbmNsdWRlcyhvYmplY3QuaWQpKSByb290Qm9uZS5jaGlsZHJlbi5wdXNoKG9iamVjdC5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0cGFpbnRWZXJ0aWNlczogKFxuXHRcdFx0bG9jYWxQb2ludDogVmVjMyxcblx0XHRcdHJhZGl1czogbnVtYmVyLFxuXHRcdFx0Y29sb3I6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdHN0cmVuZ3RoID0gMSxcblx0XHRcdHB1c2ggPSB0cnVlLFxuXHRcdCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBzdGF0ZS5zZWxlY3RlZElkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QgfHwgb2JqZWN0LnR5cGUgPT09ICdsaWdodCcgfHwgb2JqZWN0LnR5cGUgPT09ICdjYW1lcmEnKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGlmIChwdXNoKSBwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBtYXRlcmlhbGl6ZUdlb21ldHJ5KG9iamVjdCk7XG5cdFx0XHRcdGlmICghbWVzaC5jb2xvcnMgfHwgbWVzaC5jb2xvcnMubGVuZ3RoICE9PSBtZXNoLnZlcnRpY2VzLmxlbmd0aCAqIDMpIG1lc2guY29sb3JzID0gbmV3IEFycmF5KG1lc2gudmVydGljZXMubGVuZ3RoICogMykuZmlsbCgxKTtcblx0XHRcdFx0bGV0IHRvdWNoZWQgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgcjIgPSByYWRpdXMgKiByYWRpdXM7XG5cdFx0XHRcdGNvbnN0IGludlJhZGl1cyA9IDEgLyBNYXRoLm1heCgxZS02LCByYWRpdXMpO1xuXHRcdFx0XHRjb25zdCBseCA9IGxvY2FsUG9pbnRbMF0sIGx5ID0gbG9jYWxQb2ludFsxXSwgbHogPSBsb2NhbFBvaW50WzJdO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1lc2gudmVydGljZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCB2ID0gbWVzaC52ZXJ0aWNlc1tpXTtcblx0XHRcdFx0XHRjb25zdCBkeCA9IHZbMF0gLSBseCwgZHkgPSB2WzFdIC0gbHksIGR6ID0gdlsyXSAtIGx6O1xuXHRcdFx0XHRcdGNvbnN0IGQyID0gZHggKiBkeCArIGR5ICogZHkgKyBkeiAqIGR6O1xuXHRcdFx0XHRcdGlmIChkMiA+IHIyKSBjb250aW51ZTtcblx0XHRcdFx0XHRjb25zdCB0ID0gMSAtIE1hdGguc3FydChkMikgKiBpbnZSYWRpdXM7XG5cdFx0XHRcdFx0Y29uc3QgZmFsbG9mZiA9IHQgKiB0ICogc3RyZW5ndGg7XG5cdFx0XHRcdFx0Y29uc3QgaTMgPSBpICogMztcblx0XHRcdFx0XHRtZXNoLmNvbG9yc1tpM10gKz0gKGNvbG9yWzBdIC0gbWVzaC5jb2xvcnNbaTNdKSAqIGZhbGxvZmY7XG5cdFx0XHRcdFx0bWVzaC5jb2xvcnNbaTMgKyAxXSArPSAoY29sb3JbMV0gLSBtZXNoLmNvbG9yc1tpMyArIDFdKSAqIGZhbGxvZmY7XG5cdFx0XHRcdFx0bWVzaC5jb2xvcnNbaTMgKyAyXSArPSAoY29sb3JbMl0gLSBtZXNoLmNvbG9yc1tpMyArIDJdKSAqIGZhbGxvZmY7XG5cdFx0XHRcdFx0dG91Y2hlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRvdWNoZWQpIG9iamVjdC5jb2xvclZlcnNpb24rKztcblx0XHRcdFx0ZWxzZSBpZiAocHVzaCkgcGFzdC5wb3AoKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0ZmlsbFZlcnRleENvbG9yOiAoaGV4OiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gc3RhdGUuc2VsZWN0ZWRJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0IHx8IG9iamVjdC50eXBlID09PSAnbGlnaHQnIHx8IG9iamVjdC50eXBlID09PSAnY2FtZXJhJykgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBtYXRlcmlhbGl6ZUdlb21ldHJ5KG9iamVjdCk7XG5cdFx0XHRcdGNvbnN0IHIgPSBwYXJzZUludChoZXguc2xpY2UoMSwgMyksIDE2KSAvIDI1NTtcblx0XHRcdFx0Y29uc3QgZyA9IHBhcnNlSW50KGhleC5zbGljZSgzLCA1KSwgMTYpIC8gMjU1O1xuXHRcdFx0XHRjb25zdCBiID0gcGFyc2VJbnQoaGV4LnNsaWNlKDUsIDcpLCAxNikgLyAyNTU7XG5cdFx0XHRcdG1lc2guY29sb3JzID0gbmV3IEFycmF5KG1lc2gudmVydGljZXMubGVuZ3RoICogMyk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWVzaC52ZXJ0aWNlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdG1lc2guY29sb3JzW2kgKiAzXSA9IHI7XG5cdFx0XHRcdFx0bWVzaC5jb2xvcnNbaSAqIDMgKyAxXSA9IGc7XG5cdFx0XHRcdFx0bWVzaC5jb2xvcnNbaSAqIDMgKyAyXSA9IGI7XG5cdFx0XHRcdH1cblx0XHRcdFx0b2JqZWN0LmNvbG9yVmVyc2lvbisrO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdC8vIC0tLS0gTWFya2VkIHBvcnRpb25zIGFuZCBtYXRlcmlhbCBzbG90cyAtLS0tXG5cblx0XHRtYXJrUG9ydGlvbjogKG9iamVjdElkOiBzdHJpbmcsIGZhY2VzOiBudW1iZXJbXSkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0c3RhdGUubWFya2VkT2JqZWN0SWQgPSBvYmplY3RJZDtcblx0XHRcdFx0c3RhdGUubWFya2VkRmFjZXMgPSBbLi4ubmV3IFNldChmYWNlcyldLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblx0XHRcdFx0c3RhdGUucG9ydGlvblZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRjbGVhclBvcnRpb246ICgpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLm1hcmtlZEZhY2VzID0gW107XG5cdFx0XHRcdHN0YXRlLm1hcmtlZE9iamVjdElkID0gbnVsbDtcblx0XHRcdFx0c3RhdGUucG9ydGlvblZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRhcHBseU1hdGVyaWFsUHJlc2V0OiAob2JqZWN0SWQ6IHN0cmluZywgcHJlc2V0SWQ6IHN0cmluZykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBvYmplY3RJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IHByZXNldCA9IHByZXNldEJ5SWQocHJlc2V0SWQpO1xuXHRcdFx0XHRpZiAoIXByZXNldCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IHNsb3QgPSBwcmVzZXRUb1Nsb3QocHJlc2V0KTtcblx0XHRcdFx0Y29uc3QgbWVzaCA9IG1hdGVyaWFsaXplR2VvbWV0cnkob2JqZWN0KTtcblx0XHRcdFx0Y29uc3QgbWFya2VkID0gc3RhdGUubWFya2VkT2JqZWN0SWQgPT09IG9iamVjdElkICYmIHN0YXRlLm1hcmtlZEZhY2VzLmxlbmd0aCA/IHN0YXRlLm1hcmtlZEZhY2VzIDogbnVsbDtcblx0XHRcdFx0aWYgKG1hcmtlZCkge1xuXHRcdFx0XHRcdGNvbnN0IHNsb3RJbmRleCA9IG1lc2guc2xvdHMubGVuZ3RoO1xuXHRcdFx0XHRcdGNvbnN0IG5leHQgPSBhc3NpZ25GYWNlc1RvU2xvdChtZXNoLCBtYXJrZWQsIHNsb3RJbmRleCk7XG5cdFx0XHRcdFx0bmV4dC5zbG90cyA9IFsuLi5tZXNoLnNsb3RzXTtcblx0XHRcdFx0XHRuZXh0LnNsb3RzW3Nsb3RJbmRleF0gPSBzbG90O1xuXHRcdFx0XHRcdG9iamVjdC5nZW9tZXRyeSA9IG5leHQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dCA9IGFzc2lnbkZhY2VzVG9TbG90KG1lc2gsIG1lc2guZmFjZXMubWFwKChfLCBpbmRleCkgPT4gaW5kZXgpLCAwKTtcblx0XHRcdFx0XHRuZXh0LnNsb3RzID0gWy4uLm1lc2guc2xvdHNdO1xuXHRcdFx0XHRcdG5leHQuc2xvdHNbMF0gPSBzbG90O1xuXHRcdFx0XHRcdG9iamVjdC5nZW9tZXRyeSA9IG5leHQ7XG5cdFx0XHRcdFx0b2JqZWN0LmNvbG9yID0gcHJlc2V0LmNvbG9yO1xuXHRcdFx0XHRcdG9iamVjdC5tYXRlcmlhbCA9IHtcblx0XHRcdFx0XHRcdGVtaXNzaXZlOiBwcmVzZXQuZW1pc3NpdmUsXG5cdFx0XHRcdFx0XHRvcGFjaXR5OiBwcmVzZXQub3BhY2l0eSxcblx0XHRcdFx0XHRcdG1ldGFsbmVzczogcHJlc2V0Lm1ldGFsbmVzcyxcblx0XHRcdFx0XHRcdHJvdWdobmVzczogcHJlc2V0LnJvdWdobmVzcyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9iamVjdC5nZW9tZXRyeVZlcnNpb24rKztcblx0XHRcdFx0b2JqZWN0LmNvbG9yVmVyc2lvbisrO1xuXHRcdFx0XHRvYmplY3Quc2VsZWN0aW9uVmVyc2lvbisrO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdGFwcGx5TWF0ZXJpYWxJbWFnZTogKG9iamVjdElkOiBzdHJpbmcsIGRhdGFVcmw6IHN0cmluZywgbmFtZTogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IG9iamVjdElkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRjb25zdCBtZXNoID0gbWF0ZXJpYWxpemVHZW9tZXRyeShvYmplY3QpO1xuXHRcdFx0XHRjb25zdCBuZXh0ID0gc2xvdEZyb21JbWFnZShuYW1lLCBkYXRhVXJsKTtcblx0XHRcdFx0Y29uc3QgbWFya2VkID0gc3RhdGUubWFya2VkT2JqZWN0SWQgPT09IG9iamVjdElkICYmIHN0YXRlLm1hcmtlZEZhY2VzLmxlbmd0aCA/IHN0YXRlLm1hcmtlZEZhY2VzIDogbnVsbDtcblx0XHRcdFx0aWYgKG1hcmtlZCkge1xuXHRcdFx0XHRcdGNvbnN0IHNsb3RJbmRleCA9IG1lc2guc2xvdHMubGVuZ3RoO1xuXHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBhc3NpZ25GYWNlc1RvU2xvdChtZXNoLCBtYXJrZWQsIHNsb3RJbmRleCk7XG5cdFx0XHRcdFx0dXBkYXRlZC5zbG90cyA9IFsuLi5tZXNoLnNsb3RzLCBuZXh0XTtcblx0XHRcdFx0XHRvYmplY3QuZ2VvbWV0cnkgPSB1cGRhdGVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBhc3NpZ25GYWNlc1RvU2xvdChtZXNoLCBtZXNoLmZhY2VzLm1hcCgoXywgaW5kZXgpID0+IGluZGV4KSwgMCk7XG5cdFx0XHRcdFx0dXBkYXRlZC5zbG90cyA9IFsuLi5tZXNoLnNsb3RzXTtcblx0XHRcdFx0XHR1cGRhdGVkLnNsb3RzWzBdID0gbmV4dDtcblx0XHRcdFx0XHRvYmplY3QuZ2VvbWV0cnkgPSB1cGRhdGVkO1xuXHRcdFx0XHRcdG9iamVjdC5jb2xvciA9IG5leHQuY29sb3I7XG5cdFx0XHRcdH1cblx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0dXBkYXRlTWF0ZXJpYWxTbG90OiAob2JqZWN0SWQ6IHN0cmluZywgc2xvdEluZGV4OiBudW1iZXIsIHBhdGNoOiBQYXJ0aWFsPE1hdGVyaWFsU2xvdD4pID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gb2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBtYXRlcmlhbGl6ZUdlb21ldHJ5KG9iamVjdCk7XG5cdFx0XHRcdGNvbnN0IHNsb3RzID0gWy4uLm1lc2guc2xvdHNdO1xuXHRcdFx0XHR3aGlsZSAoc2xvdHMubGVuZ3RoIDw9IHNsb3RJbmRleCkgc2xvdHMucHVzaCh7IC4uLnNsb3RzWzBdID8/IHNsb3RGcm9tT2JqZWN0KG9iamVjdCksIG5hbWU6IGBTbG90ICR7c2xvdHMubGVuZ3RofWAgfSk7XG5cdFx0XHRcdHNsb3RzW3Nsb3RJbmRleF0gPSB7IC4uLnNsb3RzW3Nsb3RJbmRleF0sIC4uLnBhdGNoIH07XG5cdFx0XHRcdG9iamVjdC5nZW9tZXRyeSA9IHsgLi4ubWVzaCwgc2xvdHMgfTtcblx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0YWRkTWF0ZXJpYWxTbG90OiAob2JqZWN0SWQ6IHN0cmluZywgbmFtZSA9ICdTbG90JykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBvYmplY3RJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0Y29uc3QgbWVzaCA9IG1hdGVyaWFsaXplR2VvbWV0cnkob2JqZWN0KTtcblx0XHRcdFx0Y29uc3Qgc2xvdHMgPSBbLi4ubWVzaC5zbG90cywgeyAuLi5zbG90RnJvbU9iamVjdChvYmplY3QpLCBuYW1lIH1dO1xuXHRcdFx0XHRvYmplY3QuZ2VvbWV0cnkgPSB7IC4uLm1lc2gsIHNsb3RzIH07XG5cdFx0XHRcdG9iamVjdC5nZW9tZXRyeVZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRjdXRPYmplY3Q6IChvYmplY3RJZDogc3RyaW5nLCBwbGFuZTogQ3V0UGxhbmUsIG1vZGU6ICdzcGxpdCcgfCAnbWFyaycpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gb2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBtZXNoID0gbWF0ZXJpYWxpemVHZW9tZXRyeShvYmplY3QpO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGlmIChtb2RlID09PSAnbWFyaycpIHtcblx0XHRcdFx0XHRjb25zdCB7IG5lZ2F0aXZlIH0gPSBjbGFzc2lmeUZhY2VzQnlQbGFuZShtZXNoLCBwbGFuZSk7XG5cdFx0XHRcdFx0aWYgKCFuZWdhdGl2ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHBhc3QucG9wKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHNsb3RJbmRleCA9IG1lc2guc2xvdHMubGVuZ3RoO1xuXHRcdFx0XHRcdGNvbnN0IG5leHQgPSBhc3NpZ25GYWNlc1RvU2xvdChtZXNoLCBuZWdhdGl2ZSwgc2xvdEluZGV4KTtcblx0XHRcdFx0XHRuZXh0LnNsb3RzID0gWy4uLm1lc2guc2xvdHNdO1xuXHRcdFx0XHRcdG5leHQuc2xvdHNbc2xvdEluZGV4XSA9IHsgLi4uc2xvdEZyb21PYmplY3Qob2JqZWN0KSwgbmFtZTogJ0N1dCBTdXJmYWNlJywgY29sb3I6ICcjZmY3YTZiJyB9O1xuXHRcdFx0XHRcdG9iamVjdC5nZW9tZXRyeSA9IG5leHQ7XG5cdFx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRcdG9iamVjdC5jb2xvclZlcnNpb24rKztcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBiaXNlY3RNZXNoKG1lc2gsIHBsYW5lKTtcblx0XHRcdFx0aWYgKCFyZXN1bHQucG9zaXRpdmUuZmFjZXMubGVuZ3RoIHx8ICFyZXN1bHQubmVnYXRpdmUuZmFjZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cGFzdC5wb3AoKTtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZ2FwID0gMC4xMjtcblx0XHRcdFx0Y29uc3QgbmVnYXRpdmUgPSBvZmZzZXRNZXNoKHJlc3VsdC5uZWdhdGl2ZSwgW1xuXHRcdFx0XHRcdHBsYW5lLm5vcm1hbFswXSAqIGdhcCxcblx0XHRcdFx0XHRwbGFuZS5ub3JtYWxbMV0gKiBnYXAsXG5cdFx0XHRcdFx0cGxhbmUubm9ybWFsWzJdICogZ2FwLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgbmFtZXMgPSBuZXcgU2V0KHN0YXRlLm9iamVjdHMubWFwKChpdGVtKSA9PiBpdGVtLm5hbWUpKTtcblx0XHRcdFx0Y29uc3QgcGlja05hbWUgPSAoYmFzZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0bGV0IGNhbmRpZGF0ZSA9IGJhc2U7XG5cdFx0XHRcdFx0bGV0IGluZGV4ID0gMTtcblx0XHRcdFx0XHR3aGlsZSAobmFtZXMuaGFzKGNhbmRpZGF0ZSkpIHtcblx0XHRcdFx0XHRcdGNhbmRpZGF0ZSA9IGAke2Jhc2V9LiR7U3RyaW5nKGluZGV4KS5wYWRTdGFydCgzLCAnMCcpfWA7XG5cdFx0XHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRuYW1lcy5hZGQoY2FuZGlkYXRlKTtcblx0XHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBiYXNlTmFtZSA9IG9iamVjdC5uYW1lO1xuXHRcdFx0XHRjb25zdCBuYW1lQSA9IHBpY2tOYW1lKGAke2Jhc2VOYW1lfV9QYXJ0X0FgKTtcblx0XHRcdFx0Y29uc3QgbmFtZUIgPSBwaWNrTmFtZShgJHtiYXNlTmFtZX1fUGFydF9CYCk7XG5cblx0XHRcdFx0b2JqZWN0Lm5hbWUgPSBuYW1lQTtcblx0XHRcdFx0Y29uc3QgcG9zaXRpdmUgPSB7IC4uLnJlc3VsdC5wb3NpdGl2ZSwgc2xvdHM6IG1lc2guc2xvdHMubWFwKChzbG90KSA9PiAoeyAuLi5zbG90IH0pKSwgZmFjZVNsb3Q6IFsuLi4ocmVzdWx0LnBvc2l0aXZlLmZhY2VTbG90ID8/IFtdKV0gfTtcblx0XHRcdFx0cG9zaXRpdmUuZ3JvdXBzID0gYnVpbGRHcm91cHMocG9zaXRpdmUpO1xuXHRcdFx0XHRvYmplY3QuZ2VvbWV0cnkgPSBwb3NpdGl2ZTtcblxuXHRcdFx0XHRjb25zdCBjb3B5ID0gY2xvbmVPYmplY3Qob2JqZWN0KTtcblx0XHRcdFx0Y29weS5pZCA9IG5leHRJZCgpO1xuXHRcdFx0XHRjb3B5Lm5hbWUgPSBuYW1lQjtcblx0XHRcdFx0Y29uc3QgbmVnYXRpdmVNZXNoID0geyAuLi5uZWdhdGl2ZSwgc2xvdHM6IG1lc2guc2xvdHMubWFwKChzbG90KSA9PiAoeyAuLi5zbG90IH0pKSwgZmFjZVNsb3Q6IFsuLi4obmVnYXRpdmUuZmFjZVNsb3QgPz8gW10pXSB9O1xuXHRcdFx0XHRuZWdhdGl2ZU1lc2guZ3JvdXBzID0gYnVpbGRHcm91cHMobmVnYXRpdmVNZXNoKTtcblx0XHRcdFx0Y29weS5nZW9tZXRyeSA9IG5lZ2F0aXZlTWVzaDtcblx0XHRcdFx0Y29weS5zZWxlY3RlZCA9IGZhbHNlO1xuXHRcdFx0XHRzdGF0ZS5vYmplY3RzLnB1c2goY29weSk7XG5cblx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0ZXh0cnVkZVBvcnRpb246IChvYmplY3RJZDogc3RyaW5nLCBmYWNlczogbnVtYmVyW10sIGRpc3RhbmNlOiBudW1iZXIpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gb2JqZWN0SWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBtZXNoID0gbWF0ZXJpYWxpemVHZW9tZXRyeShvYmplY3QpO1xuXHRcdFx0XHRpZiAoIWZhY2VzLmxlbmd0aCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdG9iamVjdC5nZW9tZXRyeSA9IGV4dHJ1ZGVSZWdpb24obWVzaCwgZmFjZXMsIGRpc3RhbmNlKTtcblx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0c2VyaWFsaXplOiAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGdldChzY2VuZVN0b3JlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG9iamVjdHM6IGNsb25lT2JqZWN0cyhzdGF0ZS5vYmplY3RzKSxcblx0XHRcdFx0c2VsZWN0ZWRJZDogc3RhdGUuc2VsZWN0ZWRJZCxcblx0XHRcdFx0c2NvcmU6IHN0YXRlLnNjb3JlLFxuXHRcdFx0fTtcblx0XHR9LFxuXHRcdGxvYWQ6IChvYmplY3RzOiBTY2VuZU9iamVjdFtdLCBzZWxlY3RlZElkOiBzdHJpbmcgfCBudWxsID0gbnVsbCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRsZXQgbWF4SWQgPSAwO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9iamVjdCBvZiBvYmplY3RzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSAvXm9iai0oXFxkKykkLy5leGVjKG9iamVjdC5pZCk7XG5cdFx0XHRcdFx0aWYgKG1hdGNoKSBtYXhJZCA9IE1hdGgubWF4KG1heElkLCBOdW1iZXIobWF0Y2hbMV0pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZENvdW50ZXIgPSBNYXRoLm1heChpZENvdW50ZXIsIG1heElkICsgMSk7XG5cdFx0XHRcdHN0YXRlLm9iamVjdHMgPSBjbG9uZU9iamVjdHMob2JqZWN0cykubWFwKChvYmopID0+ICh7XG5cdFx0XHRcdFx0Li4ub2JqLFxuXHRcdFx0XHRcdHJlc3RQb3NlOiBvYmoucmVzdFBvc2UgPz8ge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IFsuLi5vYmoucG9zaXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdFx0XHRcdHJvdGF0aW9uOiBbLi4ub2JqLnJvdGF0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0XHRcdFx0XHRzY2FsZTogWy4uLm9iai5zY2FsZV0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRJZCA9IHNlbGVjdGVkSWQ7XG5cdFx0XHRcdHN0YXRlLmVkaXRNb2RlID0gZmFsc2U7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkVmVydGljZXMgPSBbXTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRFZGdlcyA9IFtdO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEZhY2VzID0gW107XG5cdFx0XHRcdHN0YXRlLm9iamVjdHMuZm9yRWFjaCgob2JqZWN0KSA9PiAob2JqZWN0LnNlbGVjdGVkID0gb2JqZWN0LmlkID09PSBzZWxlY3RlZElkKSk7XG5cdFx0XHRcdGZvciAoY29uc3Qgb2JqZWN0IG9mIHN0YXRlLm9iamVjdHMpIHtcblx0XHRcdFx0XHRjb25zdCB1cmwgPSBvYmplY3QuZ2VvbWV0cnk/LnNsb3RzPy5maW5kKChzbG90KSA9PiBzbG90LmltYWdlVXJsKT8uaW1hZ2VVcmw7XG5cdFx0XHRcdFx0aWYgKHVybCkgcHJpbWVMYXllclRleHR1cmUodXJsLCAoKSA9PiByZWZyZXNoT2JqZWN0KG9iamVjdC5pZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHRcdHNldENhbWVyYVByb3BzOiAoaWQ6IHN0cmluZywgcGF0Y2g6IFBhcnRpYWw8Q2FtZXJhUHJvcHM+KSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QgfHwgb2JqZWN0LnR5cGUgIT09ICdjYW1lcmEnKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdG9iamVjdC5jYW1lcmFQcm9wcyA9IHtcblx0XHRcdFx0XHQuLi5vYmplY3QuY2FtZXJhUHJvcHMgPz8ge1xuXHRcdFx0XHRcdFx0Zm92OiA1MCxcblx0XHRcdFx0XHRcdHRhcmdldElkOiBudWxsLFxuXHRcdFx0XHRcdFx0dGFyZ2V0T2Zmc2V0OiBbMCwgMC41LCAwXSxcblx0XHRcdFx0XHRcdHRyYWNraW5nTW9kZTogJ2xvb2tfYXQnLFxuXHRcdFx0XHRcdFx0Zm9sbG93RGlzdGFuY2U6IDQuNSxcblx0XHRcdFx0XHRcdGZvbGxvd0hlaWdodDogMS44LFxuXHRcdFx0XHRcdFx0ZGFtcGluZzogMC4xLFxuXHRcdFx0XHRcdFx0YWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Li4ucGF0Y2gsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChwYXRjaC5hY3RpdmUpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IG90aGVyIG9mIHN0YXRlLm9iamVjdHMpIHtcblx0XHRcdFx0XHRcdGlmIChvdGhlci5pZCAhPT0gaWQgJiYgb3RoZXIuY2FtZXJhUHJvcHMpIG90aGVyLmNhbWVyYVByb3BzLmFjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHVwZGF0ZUNhbWVyYVRyYWNraW5nOiAoZHQgPSAwLjAxNiwgY3VycmVudFRpbWUgPSAwKSA9PiB7XG5cdFx0XHRjb25zdCBzbmFwID0gZ2V0KHNjZW5lU3RvcmUpO1xuXHRcdFx0Y29uc3QgaGFzVHJhY2tpbmdDYW0gPSBzbmFwLm9iamVjdHMuc29tZShcblx0XHRcdFx0KG8pID0+XG5cdFx0XHRcdFx0KG8udHlwZSA9PT0gJ2NhbWVyYScgfHwgby50eXBlLnN0YXJ0c1dpdGgoJ2NhbWVyYV8nKSkgJiZcblx0XHRcdFx0XHRvLmNhbWVyYVByb3BzICYmXG5cdFx0XHRcdFx0by5jYW1lcmFQcm9wcy50cmFja2luZ01vZGUgIT09ICdub25lJyAmJlxuXHRcdFx0XHRcdEJvb2xlYW4oby5jYW1lcmFQcm9wcy50YXJnZXRJZCksXG5cdFx0XHQpO1xuXHRcdFx0aWYgKCFoYXNUcmFja2luZ0NhbSkgcmV0dXJuO1xuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9iamVjdCBvZiBzdGF0ZS5vYmplY3RzKSB7XG5cdFx0XHRcdFx0aWYgKChvYmplY3QudHlwZSAhPT0gJ2NhbWVyYScgJiYgIW9iamVjdC50eXBlLnN0YXJ0c1dpdGgoJ2NhbWVyYV8nKSkgfHwgIW9iamVjdC5jYW1lcmFQcm9wcyB8fCBvYmplY3QuY2FtZXJhUHJvcHMudHJhY2tpbmdNb2RlID09PSAnbm9uZScpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldElkID0gb2JqZWN0LmNhbWVyYVByb3BzLnRhcmdldElkO1xuXHRcdFx0XHRcdGlmICghdGFyZ2V0SWQpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gdGFyZ2V0SWQpO1xuXHRcdFx0XHRcdGlmICghdGFyZ2V0KSBjb250aW51ZTtcblxuXHRcdFx0XHRcdGNvbnN0IG9mZnNldCA9IG9iamVjdC5jYW1lcmFQcm9wcy50YXJnZXRPZmZzZXQgPz8gWzAsIDAuNSwgMF07XG5cdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Q2VudGVyOiBWZWMzID0gW1xuXHRcdFx0XHRcdFx0dGFyZ2V0LnBvc2l0aW9uWzBdICsgb2Zmc2V0WzBdLFxuXHRcdFx0XHRcdFx0dGFyZ2V0LnBvc2l0aW9uWzFdICsgb2Zmc2V0WzFdLFxuXHRcdFx0XHRcdFx0dGFyZ2V0LnBvc2l0aW9uWzJdICsgb2Zmc2V0WzJdLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRpZiAob2JqZWN0LmNhbWVyYVByb3BzLnRyYWNraW5nTW9kZSA9PT0gJ2xvb2tfYXQnKSB7XG5cdFx0XHRcdFx0XHRvYmplY3Qucm90YXRpb24gPSBsb29rQXRFdWxlcihvYmplY3QucG9zaXRpb24sIHRhcmdldENlbnRlcik7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChvYmplY3QuY2FtZXJhUHJvcHMudHJhY2tpbmdNb2RlID09PSAnZm9sbG93Jykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzdCA9IG9iamVjdC5jYW1lcmFQcm9wcy5mb2xsb3dEaXN0YW5jZSA/PyA0LjU7XG5cdFx0XHRcdFx0XHRjb25zdCBoID0gb2JqZWN0LmNhbWVyYVByb3BzLmZvbGxvd0hlaWdodCA/PyAxLjg7XG5cdFx0XHRcdFx0XHRjb25zdCBiZWhpbmQgPSByb3RhdGVFdWxlcihbMCwgMCwgZGlzdF0sIHRhcmdldC5yb3RhdGlvbik7XG5cdFx0XHRcdFx0XHRjb25zdCBkZXNpcmVkUG9zOiBWZWMzID0gW1xuXHRcdFx0XHRcdFx0XHR0YXJnZXRDZW50ZXJbMF0gKyBiZWhpbmRbMF0sXG5cdFx0XHRcdFx0XHRcdHRhcmdldENlbnRlclsxXSArIGgsXG5cdFx0XHRcdFx0XHRcdHRhcmdldENlbnRlclsyXSArIGJlaGluZFsyXSxcblx0XHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0XHRjb25zdCBkYW1wID0gY2xhbXAob2JqZWN0LmNhbWVyYVByb3BzLmRhbXBpbmcgPz8gMC4xNSwgMC4wMSwgMSk7XG5cdFx0XHRcdFx0XHRvYmplY3QucG9zaXRpb25bMF0gKz0gKGRlc2lyZWRQb3NbMF0gLSBvYmplY3QucG9zaXRpb25bMF0pICogZGFtcDtcblx0XHRcdFx0XHRcdG9iamVjdC5wb3NpdGlvblsxXSArPSAoZGVzaXJlZFBvc1sxXSAtIG9iamVjdC5wb3NpdGlvblsxXSkgKiBkYW1wO1xuXHRcdFx0XHRcdFx0b2JqZWN0LnBvc2l0aW9uWzJdICs9IChkZXNpcmVkUG9zWzJdIC0gb2JqZWN0LnBvc2l0aW9uWzJdKSAqIGRhbXA7XG5cdFx0XHRcdFx0XHRvYmplY3Qucm90YXRpb24gPSBsb29rQXRFdWxlcihvYmplY3QucG9zaXRpb24sIHRhcmdldENlbnRlcik7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChvYmplY3QuY2FtZXJhUHJvcHMudHJhY2tpbmdNb2RlID09PSAnb3JiaXQnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXN0ID0gb2JqZWN0LmNhbWVyYVByb3BzLmZvbGxvd0Rpc3RhbmNlID8/IDQuNTtcblx0XHRcdFx0XHRcdGNvbnN0IGggPSBvYmplY3QuY2FtZXJhUHJvcHMuZm9sbG93SGVpZ2h0ID8/IDEuODtcblx0XHRcdFx0XHRcdGNvbnN0IHRoZXRhID0gY3VycmVudFRpbWUgKiAwLjc1O1xuXHRcdFx0XHRcdFx0b2JqZWN0LnBvc2l0aW9uWzBdID0gdGFyZ2V0Q2VudGVyWzBdICsgTWF0aC5zaW4odGhldGEpICogZGlzdDtcblx0XHRcdFx0XHRcdG9iamVjdC5wb3NpdGlvblsxXSA9IHRhcmdldENlbnRlclsxXSArIGg7XG5cdFx0XHRcdFx0XHRvYmplY3QucG9zaXRpb25bMl0gPSB0YXJnZXRDZW50ZXJbMl0gKyBNYXRoLmNvcyh0aGV0YSkgKiBkaXN0O1xuXHRcdFx0XHRcdFx0b2JqZWN0LnJvdGF0aW9uID0gbG9va0F0RXVsZXIob2JqZWN0LnBvc2l0aW9uLCB0YXJnZXRDZW50ZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0c3BsaXRMYXllcjogKGlkOiBzdHJpbmcsIHRpbWU/OiBudW1iZXIpOiB7IHBhcnRBSWQ6IHN0cmluZzsgcGFydEJJZDogc3RyaW5nIH0gfCBudWxsID0+IHtcblx0XHRcdGxldCByZXN1bHQ6IHsgcGFydEFJZDogc3RyaW5nOyBwYXJ0QklkOiBzdHJpbmcgfSB8IG51bGwgPSBudWxsO1xuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvcmlnID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBpZCk7XG5cdFx0XHRcdGlmICghb3JpZykgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCB0bCA9IGdldCh0aW1lbGluZVN0b3JlKTtcblx0XHRcdFx0Y29uc3Qgc3BsaXRUaW1lID0gdGltZSAhPT0gdW5kZWZpbmVkID8gdGltZSA6IHRsLmN1cnJlbnRUaW1lO1xuXHRcdFx0XHRjb25zdCBjbGlwID0gdGwuY2xpcHMuZ2V0KGlkKSA/PyB7IHN0YXJ0OiAwLCBlbmQ6IDE1IH07XG5cdFx0XHRcdGlmIChzcGxpdFRpbWUgPD0gY2xpcC5zdGFydCArIDAuMDUgfHwgc3BsaXRUaW1lID49IGNsaXAuZW5kIC0gMC4wNSkgcmV0dXJuIHN0YXRlO1xuXG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0dGltZWxpbmVTdG9yZS5zZXRDbGlwKGlkLCBjbGlwLnN0YXJ0LCBzcGxpdFRpbWUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld0lkID0gbmV4dElkKCk7XG5cdFx0XHRcdGNvbnN0IGNvcHkgPSBjbG9uZU9iamVjdChvcmlnKTtcblx0XHRcdFx0Y29weS5pZCA9IG5ld0lkO1xuXHRcdFx0XHRjb3B5Lm5hbWUgPSB1bmlxdWVOYW1lKHN0YXRlLm9iamVjdHMsIG9yaWcubmFtZSArICcgUGFydCAyJyk7XG5cdFx0XHRcdGNvcHkuc2VsZWN0ZWQgPSB0cnVlO1xuXHRcdFx0XHRvcmlnLnNlbGVjdGVkID0gZmFsc2U7XG5cdFx0XHRcdHN0YXRlLm9iamVjdHMucHVzaChjb3B5KTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRJZCA9IG5ld0lkO1xuXG5cdFx0XHRcdHRpbWVsaW5lU3RvcmUuc2V0Q2xpcChuZXdJZCwgc3BsaXRUaW1lLCBjbGlwLmVuZCk7XG5cblx0XHRcdFx0Ly8gU3BsaXQga2V5ZnJhbWVzXG5cdFx0XHRcdGNvbnN0IGFsbEtleXMgPSB0bC5rZXlmcmFtZXMuZ2V0KGlkKSA/PyBbXTtcblx0XHRcdFx0Y29uc3Qga2V5c0EgPSBhbGxLZXlzLmZpbHRlcigoaykgPT4gay50aW1lIDw9IHNwbGl0VGltZSk7XG5cdFx0XHRcdGNvbnN0IGtleXNCID0gYWxsS2V5cy5maWx0ZXIoKGspID0+IGsudGltZSA+PSBzcGxpdFRpbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGV2YWxNYXAgPSB0aW1lbGluZVN0b3JlLmV2YWx1YXRlKHNwbGl0VGltZSwgdGwuZWFzaW5nKTtcblx0XHRcdFx0Y29uc3QgY3V0VHJhbnNmb3JtID0gZXZhbE1hcC5nZXQoaWQpO1xuXHRcdFx0XHRjb25zdCBjdXRQb3NlID0ge1xuXHRcdFx0XHRcdHRpbWU6IHNwbGl0VGltZSxcblx0XHRcdFx0XHRwb3NpdGlvbjogY3V0VHJhbnNmb3JtPy5wb3NpdGlvbiA/IFsuLi5jdXRUcmFuc2Zvcm0ucG9zaXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA6IFsuLi5vcmlnLnBvc2l0aW9uXSxcblx0XHRcdFx0XHRyb3RhdGlvbjogY3V0VHJhbnNmb3JtPy5yb3RhdGlvbiA/IFsuLi5jdXRUcmFuc2Zvcm0ucm90YXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA6IFsuLi5vcmlnLnJvdGF0aW9uXSxcblx0XHRcdFx0XHRzY2FsZTogY3V0VHJhbnNmb3JtPy5zY2FsZSA/IFsuLi5jdXRUcmFuc2Zvcm0uc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA6IFsuLi5vcmlnLnNjYWxlXSxcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKCFrZXlzQS5zb21lKChrKSA9PiBNYXRoLmFicyhrLnRpbWUgLSBzcGxpdFRpbWUpIDwgMC4wMDEpKSBrZXlzQS5wdXNoKHsgLi4uY3V0UG9zZSB9KTtcblx0XHRcdFx0aWYgKCFrZXlzQi5zb21lKChrKSA9PiBNYXRoLmFicyhrLnRpbWUgLSBzcGxpdFRpbWUpIDwgMC4wMDEpKSBrZXlzQi51bnNoaWZ0KHsgLi4uY3V0UG9zZSB9KTtcblxuXHRcdFx0XHR0aW1lbGluZVN0b3JlLmxvYWRLZXlmcmFtZXMoe1xuXHRcdFx0XHRcdC4uLnRpbWVsaW5lU3RvcmUuc2VyaWFsaXplS2V5ZnJhbWVzKCksXG5cdFx0XHRcdFx0W2lkXToga2V5c0EsXG5cdFx0XHRcdFx0W25ld0lkXToga2V5c0IsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJlc3VsdCA9IHsgcGFydEFJZDogaWQsIHBhcnRCSWQ6IG5ld0lkIH07XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LFxuXG5cdFx0cmVwbGFjZU9iamVjdEdlb21ldHJ5OiAoaWQ6IHN0cmluZywgbmV3VHlwZTogc3RyaW5nKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QgfHwgb2JqZWN0LmxvY2tlZCkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdG9iamVjdC50eXBlID0gbmV3VHlwZTtcblx0XHRcdFx0Y29uc3QgbmV3TWVzaCA9IGNsb25lTWVzaChtZXNoRm9yKG5ld1R5cGUpID8/IG1lc2hGb3IoJ2N1YmUnKSEpO1xuXHRcdFx0XHRpZiAob2JqZWN0Lmdlb21ldHJ5Py5zbG90cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0bmV3TWVzaC5zbG90cyA9IFsuLi5vYmplY3QuZ2VvbWV0cnkuc2xvdHNdO1xuXHRcdFx0XHRcdG5ld01lc2guZmFjZVNsb3QgPSBuZXdNZXNoLmZhY2VzLm1hcCgoKSA9PiAwKTtcblx0XHRcdFx0XHRuZXdNZXNoLmdyb3VwcyA9IGJ1aWxkR3JvdXBzKG5ld01lc2gpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9iamVjdC5nZW9tZXRyeSA9IG5ld01lc2g7XG5cdFx0XHRcdG9iamVjdC5nZW9tZXRyeVZlcnNpb24rKztcblx0XHRcdFx0b2JqZWN0LmNvbG9yVmVyc2lvbisrO1xuXHRcdFx0XHRvYmplY3Quc2VsZWN0aW9uVmVyc2lvbisrO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdHJlcGxhY2VPYmplY3RNZWRpYTogKGlkOiBzdHJpbmcsIGRhdGFVcmw6IHN0cmluZywgd2lkdGggPSAxMjgwLCBoZWlnaHQgPSA3MjApID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gaWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCBvYmplY3QubG9ja2VkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0dXNlVGV4dHVyZVNsb3Qob2JqZWN0LCBkYXRhVXJsLCB3aWR0aCwgaGVpZ2h0KTtcblx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRvYmplY3QuY29sb3JWZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0c2V0T2JqZWN0T3BhY2l0eTogKGlkOiBzdHJpbmcsIG9wYWNpdHk6IG51bWJlcikgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBpZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0IHx8IG9iamVjdC5sb2NrZWQpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3QgdmFsID0gY2xhbXAob3BhY2l0eSwgMCwgMSk7XG5cdFx0XHRcdG9iamVjdC5tYXRlcmlhbC5vcGFjaXR5ID0gdmFsO1xuXHRcdFx0XHRpZiAob2JqZWN0Lmdlb21ldHJ5Py5zbG90cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzbG90IG9mIG9iamVjdC5nZW9tZXRyeS5zbG90cykgc2xvdC5vcGFjaXR5ID0gdmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9iamVjdC5jb2xvclZlcnNpb24rKztcblx0XHRcdFx0Y29uc3QgdGwgPSBnZXQodGltZWxpbmVTdG9yZSk7XG5cdFx0XHRcdGlmICh0bC5hdXRvS2V5KSB7XG5cdFx0XHRcdFx0dGltZWxpbmVTdG9yZS5hZGRDaGFubmVsS2V5ZnJhbWUoaWQsICdtYXRlcmlhbC5vcGFjaXR5JywgdGwuY3VycmVudFRpbWUsIHZhbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cdFx0Ly8gLS0tLSBFZGl0IFRhYiBTZWxlY3Rpb24gVG9vbHMgLS0tLVxuXHRcdHNlbGVjdExpbmtlZDogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBzdGF0ZS5zZWxlY3RlZElkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QgfHwgIW9iamVjdC5nZW9tZXRyeSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBtZXNoID0gb2JqZWN0Lmdlb21ldHJ5O1xuXHRcdFx0XHRjb25zdCBhZGogPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cdFx0XHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZiwgZklkeCkgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgdmkgb2YgZikge1xuXHRcdFx0XHRcdFx0aWYgKCFhZGouaGFzKHZpKSkgYWRqLnNldCh2aSwgW10pO1xuXHRcdFx0XHRcdFx0YWRqLmdldCh2aSkhLnB1c2goZklkeCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgdmlzaXRlZEZhY2VzID0gbmV3IFNldDxudW1iZXI+KHN0YXRlLnNlbGVjdGVkRmFjZXMpO1xuXHRcdFx0XHRjb25zdCB2aXNpdGVkVmVydHMgPSBuZXcgU2V0PG51bWJlcj4oc3RhdGUuc2VsZWN0ZWRWZXJ0aWNlcyk7XG5cdFx0XHRcdGNvbnN0IHF1ZXVlOiBudW1iZXJbXSA9IFsuLi5zdGF0ZS5zZWxlY3RlZFZlcnRpY2VzXTtcblx0XHRcdFx0Zm9yIChjb25zdCBmSWR4IG9mIHN0YXRlLnNlbGVjdGVkRmFjZXMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHZpIG9mIG1lc2guZmFjZXNbZklkeF0pIHtcblx0XHRcdFx0XHRcdGlmICghdmlzaXRlZFZlcnRzLmhhcyh2aSkpIHtcblx0XHRcdFx0XHRcdFx0dmlzaXRlZFZlcnRzLmFkZCh2aSk7XG5cdFx0XHRcdFx0XHRcdHF1ZXVlLnB1c2godmkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXF1ZXVlLmxlbmd0aCAmJiBtZXNoLnZlcnRpY2VzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHF1ZXVlLnB1c2goMCk7XG5cdFx0XHRcdFx0dmlzaXRlZFZlcnRzLmFkZCgwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHZpID0gcXVldWUucG9wKCkhO1xuXHRcdFx0XHRcdGNvbnN0IGZhY2VzID0gYWRqLmdldCh2aSkgfHwgW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBmSWR4IG9mIGZhY2VzKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXZpc2l0ZWRGYWNlcy5oYXMoZklkeCkpIHtcblx0XHRcdFx0XHRcdFx0dmlzaXRlZEZhY2VzLmFkZChmSWR4KTtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBvdGhlclZpIG9mIG1lc2guZmFjZXNbZklkeF0pIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIXZpc2l0ZWRWZXJ0cy5oYXMob3RoZXJWaSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHZpc2l0ZWRWZXJ0cy5hZGQob3RoZXJWaSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRxdWV1ZS5wdXNoKG90aGVyVmkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzID0gWy4uLnZpc2l0ZWRWZXJ0c107XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkRmFjZXMgPSBbLi4udmlzaXRlZEZhY2VzXTtcblx0XHRcdFx0b2JqZWN0LnNlbGVjdGlvblZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRzZWxlY3RMb29wOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCAhb2JqZWN0Lmdlb21ldHJ5KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBvYmplY3QuZ2VvbWV0cnk7XG5cdFx0XHRcdGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2VkZ2UnKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnQgPSBzdGF0ZS5zZWxlY3RlZEVkZ2VzWzBdID8/IDA7XG5cdFx0XHRcdFx0aWYgKCFtZXNoLmVkZ2VzW3N0YXJ0XSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRcdGNvbnN0IGVkZ2VJbmRleEJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRcdFx0XHRtZXNoLmVkZ2VzLmZvckVhY2goKFthLCBiXSwgaWR4KSA9PiB7XG5cdFx0XHRcdFx0XHRlZGdlSW5kZXhCeUtleS5zZXQoYSA8IGIgPyBgJHthfToke2J9YCA6IGAke2J9OiR7YX1gLCBpZHgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGVkID0gbmV3IFNldDxudW1iZXI+KHN0YXRlLnNlbGVjdGVkRWRnZXMubGVuZ3RoID8gc3RhdGUuc2VsZWN0ZWRFZGdlcyA6IFtzdGFydF0pO1xuXHRcdFx0XHRcdGNvbnN0IHF1ZXVlOiBudW1iZXJbXSA9IFsuLi5zZWxlY3RlZF07XG5cdFx0XHRcdFx0d2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cklkeCA9IHF1ZXVlLnBvcCgpITtcblx0XHRcdFx0XHRcdGNvbnN0IGN1ckVkZ2UgPSBtZXNoLmVkZ2VzW2N1cklkeF07XG5cdFx0XHRcdFx0XHRpZiAoIWN1ckVkZ2UpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBmIG9mIG1lc2guZmFjZXMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGYubGVuZ3RoICE9PSA0KSBjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBhID0gZltpXSwgYiA9IGZbKGkgKyAxKSAlIDRdO1xuXHRcdFx0XHRcdFx0XHRcdGlmICgoYSA9PT0gY3VyRWRnZVswXSAmJiBiID09PSBjdXJFZGdlWzFdKSB8fCAoYSA9PT0gY3VyRWRnZVsxXSAmJiBiID09PSBjdXJFZGdlWzBdKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qgb3BwQSA9IGZbKGkgKyAyKSAlIDRdLCBvcHBCID0gZlsoaSArIDMpICUgNF07XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBvcHBLZXkgPSBvcHBBIDwgb3BwQiA/IGAke29wcEF9OiR7b3BwQn1gIDogYCR7b3BwQn06JHtvcHBBfWA7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBvcHBFZGdlSWR4ID0gZWRnZUluZGV4QnlLZXkuZ2V0KG9wcEtleSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAob3BwRWRnZUlkeCAhPT0gdW5kZWZpbmVkICYmICFzZWxlY3RlZC5oYXMob3BwRWRnZUlkeCkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0c2VsZWN0ZWQuYWRkKG9wcEVkZ2VJZHgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRxdWV1ZS5wdXNoKG9wcEVkZ2VJZHgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEVkZ2VzID0gWy4uLnNlbGVjdGVkXTtcblx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2ZhY2UnKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnQgPSBzdGF0ZS5zZWxlY3RlZEZhY2VzWzBdID8/IDA7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBuZXcgU2V0PG51bWJlcj4oc3RhdGUuc2VsZWN0ZWRGYWNlcyk7XG5cdFx0XHRcdFx0bWVzaC5mYWNlcy5mb3JFYWNoKChmLCBpZHgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChNYXRoLmFicyhpZHggLSBzdGFydCkgPD0gMykgc2VsZWN0ZWQuYWRkKGlkeCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRGYWNlcyA9IFsuLi5zZWxlY3RlZF07XG5cdFx0XHRcdH1cblx0XHRcdFx0b2JqZWN0LnNlbGVjdGlvblZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRzZWxlY3RSaW5nOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCAhb2JqZWN0Lmdlb21ldHJ5KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBvYmplY3QuZ2VvbWV0cnk7XG5cdFx0XHRcdGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2VkZ2UnKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnQgPSBzdGF0ZS5zZWxlY3RlZEVkZ2VzWzBdID8/IDA7XG5cdFx0XHRcdFx0Y29uc3QgZWRnZSA9IG1lc2guZWRnZXNbc3RhcnRdO1xuXHRcdFx0XHRcdGlmICghZWRnZSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRcdGNvbnN0IGVkZ2VJbmRleEJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRcdFx0XHRtZXNoLmVkZ2VzLmZvckVhY2goKFthLCBiXSwgaWR4KSA9PiB7XG5cdFx0XHRcdFx0XHRlZGdlSW5kZXhCeUtleS5zZXQoYSA8IGIgPyBgJHthfToke2J9YCA6IGAke2J9OiR7YX1gLCBpZHgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGVkID0gbmV3IFNldDxudW1iZXI+KHN0YXRlLnNlbGVjdGVkRWRnZXMubGVuZ3RoID8gc3RhdGUuc2VsZWN0ZWRFZGdlcyA6IFtzdGFydF0pO1xuXHRcdFx0XHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZikgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGYubGVuZ3RoID09PSA0KSB7XG5cdFx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgYSA9IGZbaV0sIGIgPSBmWyhpICsgMSkgJSA0XTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoKGEgPT09IGVkZ2VbMF0gJiYgYiA9PT0gZWRnZVsxXSkgfHwgKGEgPT09IGVkZ2VbMV0gJiYgYiA9PT0gZWRnZVswXSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHMxYSA9IGZbKGkgKyAxKSAlIDRdLCBzMWIgPSBmWyhpICsgMikgJSA0XTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHMyYSA9IGZbKGkgKyAzKSAlIDRdLCBzMmIgPSBmW2ldO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc2lkZUEgPSBlZGdlSW5kZXhCeUtleS5nZXQoczFhIDwgczFiID8gYCR7czFhfToke3MxYn1gIDogYCR7czFifToke3MxYX1gKTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHNpZGVCID0gZWRnZUluZGV4QnlLZXkuZ2V0KHMyYSA8IHMyYiA/IGAke3MyYX06JHtzMmJ9YCA6IGAke3MyYn06JHtzMmF9YCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoc2lkZUEgIT09IHVuZGVmaW5lZCkgc2VsZWN0ZWQuYWRkKHNpZGVBKTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChzaWRlQiAhPT0gdW5kZWZpbmVkKSBzZWxlY3RlZC5hZGQoc2lkZUIpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkRWRnZXMgPSBbLi4uc2VsZWN0ZWRdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9iamVjdC5zZWxlY3Rpb25WZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0aW52ZXJ0U2VsZWN0aW9uOiAoKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCAhb2JqZWN0Lmdlb21ldHJ5KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBvYmplY3QuZ2VvbWV0cnk7XG5cdFx0XHRcdGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ3ZlcnRleCcpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50ID0gbmV3IFNldChzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzKTtcblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZFZlcnRpY2VzID0gbWVzaC52ZXJ0aWNlcy5tYXAoKF8sIGkpID0+IGkpLmZpbHRlcigoaSkgPT4gIWN1cnJlbnQuaGFzKGkpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2VkZ2UnKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudCA9IG5ldyBTZXQoc3RhdGUuc2VsZWN0ZWRFZGdlcyk7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRFZGdlcyA9IG1lc2guZWRnZXMubWFwKChfLCBpKSA9PiBpKS5maWx0ZXIoKGkpID0+ICFjdXJyZW50LmhhcyhpKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUuZWxlbWVudE1vZGUgPT09ICdmYWNlJykge1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSBuZXcgU2V0KHN0YXRlLnNlbGVjdGVkRmFjZXMpO1xuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkRmFjZXMgPSBtZXNoLmZhY2VzLm1hcCgoXywgaSkgPT4gaSkuZmlsdGVyKChpKSA9PiAhY3VycmVudC5oYXMoaSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9iamVjdC5zZWxlY3Rpb25WZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0c2VsZWN0U2ltaWxhcjogKF9jcml0ZXJpYTogJ3ZhbGVuY2UnIHwgJ2xlbmd0aCcgfCAnYXJlYScgfCAnbm9ybWFsJyA9ICdub3JtYWwnKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCAhb2JqZWN0Lmdlb21ldHJ5KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBvYmplY3QuZ2VvbWV0cnk7XG5cdFx0XHRcdGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ3ZlcnRleCcpIHtcblx0XHRcdFx0XHRjb25zdCB2SWR4ID0gc3RhdGUuc2VsZWN0ZWRWZXJ0aWNlc1swXSA/PyAwO1xuXHRcdFx0XHRcdGNvbnN0IGRlZ3JlZXMgPSBuZXcgSW50MzJBcnJheShtZXNoLnZlcnRpY2VzLmxlbmd0aCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBbYSwgYl0gb2YgbWVzaC5lZGdlcykge1xuXHRcdFx0XHRcdFx0aWYgKGEgPj0gMCAmJiBhIDwgZGVncmVlcy5sZW5ndGgpIGRlZ3JlZXNbYV0rKztcblx0XHRcdFx0XHRcdGlmIChiID49IDAgJiYgYiA8IGRlZ3JlZXMubGVuZ3RoKSBkZWdyZWVzW2JdKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHZhbGVuY2UgPSBkZWdyZWVzW3ZJZHhdID8/IDA7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2hlZDogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRlZ3JlZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGlmIChkZWdyZWVzW2ldID09PSB2YWxlbmNlKSBtYXRjaGVkLnB1c2goaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkVmVydGljZXMgPSBtYXRjaGVkO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlLmVsZW1lbnRNb2RlID09PSAnZWRnZScpIHtcblx0XHRcdFx0XHRjb25zdCBlSWR4ID0gc3RhdGUuc2VsZWN0ZWRFZGdlc1swXSA/PyAwO1xuXHRcdFx0XHRcdGNvbnN0IGVkZ2UgPSBtZXNoLmVkZ2VzW2VJZHhdO1xuXHRcdFx0XHRcdGlmIChlZGdlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2MCA9IG1lc2gudmVydGljZXNbZWRnZVswXV0sIHYxID0gbWVzaC52ZXJ0aWNlc1tlZGdlWzFdXTtcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldExlbiA9IE1hdGguaHlwb3QodjBbMF0gLSB2MVswXSwgdjBbMV0gLSB2MVsxXSwgdjBbMl0gLSB2MVsyXSk7XG5cdFx0XHRcdFx0XHRjb25zdCBtYXRjaGVkOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRcdFx0bWVzaC5lZGdlcy5mb3JFYWNoKChlLCBpZHgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXYwID0gbWVzaC52ZXJ0aWNlc1tlWzBdXSwgZXYxID0gbWVzaC52ZXJ0aWNlc1tlWzFdXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGVuID0gTWF0aC5oeXBvdChldjBbMF0gLSBldjFbMF0sIGV2MFsxXSAtIGV2MVsxXSwgZXYwWzJdIC0gZXYxWzJdKTtcblx0XHRcdFx0XHRcdFx0aWYgKE1hdGguYWJzKGxlbiAtIHRhcmdldExlbikgPCAwLjA1ICogdGFyZ2V0TGVuICsgMWUtNCkgbWF0Y2hlZC5wdXNoKGlkeCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHN0YXRlLnNlbGVjdGVkRWRnZXMgPSBtYXRjaGVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2ZhY2UnKSB7XG5cdFx0XHRcdFx0Y29uc3QgZklkeCA9IHN0YXRlLnNlbGVjdGVkRmFjZXNbMF0gPz8gMDtcblx0XHRcdFx0XHRjb25zdCBmYWNlID0gbWVzaC5mYWNlc1tmSWR4XTtcblx0XHRcdFx0XHRpZiAoZmFjZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbjAgPSBmYWNlTm9ybWFsKG1lc2gsIGZhY2UpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2hlZDogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0XHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZiwgaWR4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG4gPSBmYWNlTm9ybWFsKG1lc2gsIGYpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkb3RQcm9kID0gbjBbMF0gKiBuWzBdICsgbjBbMV0gKiBuWzFdICsgbjBbMl0gKiBuWzJdO1xuXHRcdFx0XHRcdFx0XHRpZiAoZG90UHJvZCA+IDAuODUpIG1hdGNoZWQucHVzaChpZHgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEZhY2VzID0gbWF0Y2hlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0b2JqZWN0LnNlbGVjdGlvblZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRib3hTZWxlY3Q6IChyZWN0OiB7IG1pblg6IG51bWJlcjsgbWluWTogbnVtYmVyOyBtYXhYOiBudW1iZXI7IG1heFk6IG51bWJlciB9LCBwcm9qZWN0Rm46ICh2OiBWZWMzKSA9PiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsKSA9PlxuXHRcdFx0dXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IHN0YXRlLnNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAoIW9iamVjdCB8fCAhb2JqZWN0Lmdlb21ldHJ5KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG1lc2ggPSBvYmplY3QuZ2VvbWV0cnk7XG5cdFx0XHRcdGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ3ZlcnRleCcpIHtcblx0XHRcdFx0XHRjb25zdCBzZWw6IG51bWJlcltdID0gW107XG5cdFx0XHRcdFx0bWVzaC52ZXJ0aWNlcy5mb3JFYWNoKCh2LCBpZHgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHB0ID0gcHJvamVjdEZuKHYpO1xuXHRcdFx0XHRcdFx0aWYgKHB0ICYmIHB0LnggPj0gcmVjdC5taW5YICYmIHB0LnggPD0gcmVjdC5tYXhYICYmIHB0LnkgPj0gcmVjdC5taW5ZICYmIHB0LnkgPD0gcmVjdC5tYXhZKSB7XG5cdFx0XHRcdFx0XHRcdHNlbC5wdXNoKGlkeCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRWZXJ0aWNlcyA9IHNlbDtcblx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2ZhY2UnKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRcdG1lc2guZmFjZXMuZm9yRWFjaCgoZiwgaWR4KSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjID0gZmFjZUNlbnRlcihtZXNoLCBmKTtcblx0XHRcdFx0XHRcdGNvbnN0IHB0ID0gcHJvamVjdEZuKGMpO1xuXHRcdFx0XHRcdFx0aWYgKHB0ICYmIHB0LnggPj0gcmVjdC5taW5YICYmIHB0LnggPD0gcmVjdC5tYXhYICYmIHB0LnkgPj0gcmVjdC5taW5ZICYmIHB0LnkgPD0gcmVjdC5tYXhZKSB7XG5cdFx0XHRcdFx0XHRcdHNlbC5wdXNoKGlkeCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRGYWNlcyA9IHNlbDtcblx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5lbGVtZW50TW9kZSA9PT0gJ2VkZ2UnKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRcdG1lc2guZWRnZXMuZm9yRWFjaCgoZSwgaWR4KSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB2MCA9IG1lc2gudmVydGljZXNbZVswXV0sIHYxID0gbWVzaC52ZXJ0aWNlc1tlWzFdXTtcblx0XHRcdFx0XHRcdGNvbnN0IG1pZDogVmVjMyA9IFsodjBbMF0gKyB2MVswXSkgLyAyLCAodjBbMV0gKyB2MVsxXSkgLyAyLCAodjBbMl0gKyB2MVsyXSkgLyAyXTtcblx0XHRcdFx0XHRcdGNvbnN0IHB0ID0gcHJvamVjdEZuKG1pZCk7XG5cdFx0XHRcdFx0XHRpZiAocHQgJiYgcHQueCA+PSByZWN0Lm1pblggJiYgcHQueCA8PSByZWN0Lm1heFggJiYgcHQueSA+PSByZWN0Lm1pblkgJiYgcHQueSA8PSByZWN0Lm1heFkpIHtcblx0XHRcdFx0XHRcdFx0c2VsLnB1c2goaWR4KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEVkZ2VzID0gc2VsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9iamVjdC5zZWxlY3Rpb25WZXJzaW9uKys7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0Ly8gLS0tLSBFZGl0IFRhYiBPYmplY3QgTGV2ZWwgVG9vbHMgLS0tLVxuXHRcdHNldE9yaWdpbjogKG1vZGU6ICdnZW9tZXRyeScgfCAnY3Vyc29yJyB8ICdjZW50ZXInLCBjdXJzb3JQb3NpdGlvbjogVmVjMyA9IFswLCAwLCAwXSkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBzdGF0ZS5zZWxlY3RlZElkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3QgbWVzaCA9IG1hdGVyaWFsaXplR2VvbWV0cnkob2JqZWN0KTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRpZiAobW9kZSA9PT0gJ2dlb21ldHJ5Jykge1xuXHRcdFx0XHRcdGxldCBtaW5YID0gSW5maW5pdHksIG1pblkgPSBJbmZpbml0eSwgbWluWiA9IEluZmluaXR5O1xuXHRcdFx0XHRcdGxldCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5LCBtYXhaID0gLUluZmluaXR5O1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdiBvZiBtZXNoLnZlcnRpY2VzKSB7XG5cdFx0XHRcdFx0XHRpZiAodlswXSA8IG1pblgpIG1pblggPSB2WzBdOyBpZiAodlswXSA+IG1heFgpIG1heFggPSB2WzBdO1xuXHRcdFx0XHRcdFx0aWYgKHZbMV0gPCBtaW5ZKSBtaW5ZID0gdlsxXTsgaWYgKHZbMV0gPiBtYXhZKSBtYXhZID0gdlsxXTtcblx0XHRcdFx0XHRcdGlmICh2WzJdIDwgbWluWikgbWluWiA9IHZbMl07IGlmICh2WzJdID4gbWF4WikgbWF4WiA9IHZbMl07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGN4ID0gKG1pblggKyBtYXhYKSAvIDI7XG5cdFx0XHRcdFx0Y29uc3QgY3kgPSAobWluWSArIG1heFkpIC8gMjtcblx0XHRcdFx0XHRjb25zdCBjeiA9IChtaW5aICsgbWF4WikgLyAyO1xuXHRcdFx0XHRcdG1lc2gudmVydGljZXMuZm9yRWFjaCgodikgPT4ge1xuXHRcdFx0XHRcdFx0dlswXSAtPSBjeDsgdlsxXSAtPSBjeTsgdlsyXSAtPSBjejtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb25zdCByb3QgPSByb3RhdGVFdWxlcihbY3ggKiBvYmplY3Quc2NhbGVbMF0sIGN5ICogb2JqZWN0LnNjYWxlWzFdLCBjeiAqIG9iamVjdC5zY2FsZVsyXV0sIG9iamVjdC5yb3RhdGlvbik7XG5cdFx0XHRcdFx0b2JqZWN0LnBvc2l0aW9uID0gW29iamVjdC5wb3NpdGlvblswXSArIHJvdFswXSwgb2JqZWN0LnBvc2l0aW9uWzFdICsgcm90WzFdLCBvYmplY3QucG9zaXRpb25bMl0gKyByb3RbMl1dO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG1vZGUgPT09ICdjdXJzb3InKSB7XG5cdFx0XHRcdFx0Y29uc3QgZHggPSBjdXJzb3JQb3NpdGlvblswXSAtIG9iamVjdC5wb3NpdGlvblswXTtcblx0XHRcdFx0XHRjb25zdCBkeSA9IGN1cnNvclBvc2l0aW9uWzFdIC0gb2JqZWN0LnBvc2l0aW9uWzFdO1xuXHRcdFx0XHRcdGNvbnN0IGR6ID0gY3Vyc29yUG9zaXRpb25bMl0gLSBvYmplY3QucG9zaXRpb25bMl07XG5cdFx0XHRcdFx0bWVzaC52ZXJ0aWNlcy5mb3JFYWNoKCh2KSA9PiB7XG5cdFx0XHRcdFx0XHR2WzBdIC09IGR4IC8gb2JqZWN0LnNjYWxlWzBdO1xuXHRcdFx0XHRcdFx0dlsxXSAtPSBkeSAvIG9iamVjdC5zY2FsZVsxXTtcblx0XHRcdFx0XHRcdHZbMl0gLT0gZHogLyBvYmplY3Quc2NhbGVbMl07XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0b2JqZWN0LnBvc2l0aW9uID0gWy4uLmN1cnNvclBvc2l0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVzaC52ZXJ0aWNlcy5mb3JFYWNoKCh2KSA9PiB7XG5cdFx0XHRcdFx0XHR2WzBdICs9IG9iamVjdC5wb3NpdGlvblswXSAvIG9iamVjdC5zY2FsZVswXTtcblx0XHRcdFx0XHRcdHZbMV0gKz0gb2JqZWN0LnBvc2l0aW9uWzFdIC8gb2JqZWN0LnNjYWxlWzFdO1xuXHRcdFx0XHRcdFx0dlsyXSArPSBvYmplY3QucG9zaXRpb25bMl0gLyBvYmplY3Quc2NhbGVbMl07XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0b2JqZWN0LnBvc2l0aW9uID0gWzAsIDAsIDBdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1lc2gucmFkaXVzID0gY29tcHV0ZVJhZGl1cyhtZXNoLnZlcnRpY2VzKTtcblx0XHRcdFx0b2JqZWN0Lmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdGFwcGx5VHJhbnNmb3JtYXRpb246ICh0eXBlOiAnbG9jYXRpb24nIHwgJ3JvdGF0aW9uJyB8ICdzY2FsZScgfCAnYWxsJykgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBzdGF0ZS5zZWxlY3RlZElkKTtcblx0XHRcdFx0aWYgKCFvYmplY3QpIHJldHVybiBzdGF0ZTtcblx0XHRcdFx0Y29uc3QgbWVzaCA9IG1hdGVyaWFsaXplR2VvbWV0cnkob2JqZWN0KTtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRpZiAodHlwZSA9PT0gJ3NjYWxlJyB8fCB0eXBlID09PSAnYWxsJykge1xuXHRcdFx0XHRcdG1lc2gudmVydGljZXMuZm9yRWFjaCgodikgPT4ge1xuXHRcdFx0XHRcdFx0dlswXSAqPSBvYmplY3Quc2NhbGVbMF07XG5cdFx0XHRcdFx0XHR2WzFdICo9IG9iamVjdC5zY2FsZVsxXTtcblx0XHRcdFx0XHRcdHZbMl0gKj0gb2JqZWN0LnNjYWxlWzJdO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdG9iamVjdC5zY2FsZSA9IFsxLCAxLCAxXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZSA9PT0gJ3JvdGF0aW9uJyB8fCB0eXBlID09PSAnYWxsJykge1xuXHRcdFx0XHRcdG1lc2gudmVydGljZXMgPSBtZXNoLnZlcnRpY2VzLm1hcCgodikgPT4gcm90YXRlRXVsZXIodiwgb2JqZWN0LnJvdGF0aW9uKSk7XG5cdFx0XHRcdFx0b2JqZWN0LnJvdGF0aW9uID0gWzAsIDAsIDBdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlID09PSAnbG9jYXRpb24nIHx8IHR5cGUgPT09ICdhbGwnKSB7XG5cdFx0XHRcdFx0bWVzaC52ZXJ0aWNlcy5mb3JFYWNoKCh2KSA9PiB7XG5cdFx0XHRcdFx0XHR2WzBdICs9IG9iamVjdC5wb3NpdGlvblswXTtcblx0XHRcdFx0XHRcdHZbMV0gKz0gb2JqZWN0LnBvc2l0aW9uWzFdO1xuXHRcdFx0XHRcdFx0dlsyXSArPSBvYmplY3QucG9zaXRpb25bMl07XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0b2JqZWN0LnBvc2l0aW9uID0gWzAsIDAsIDBdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1lc2gucmFkaXVzID0gY29tcHV0ZVJhZGl1cyhtZXNoLnZlcnRpY2VzKTtcblx0XHRcdFx0aWYgKG1lc2guc21vb3RoIHx8IG1lc2gubm9ybWFscykgbWVzaC5ub3JtYWxzID0gY29tcHV0ZVZlcnRleE5vcm1hbHMobWVzaCk7XG5cdFx0XHRcdG9iamVjdC5nZW9tZXRyeVZlcnNpb24rKztcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRjbGVhclRyYW5zZm9ybWF0aW9uOiAodHlwZTogJ2xvY2F0aW9uJyB8ICdyb3RhdGlvbicgfCAnc2NhbGUnIHwgJ2FsbCcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gc3RhdGUuc2VsZWN0ZWRJZCk7XG5cdFx0XHRcdGlmICghb2JqZWN0KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0aWYgKHR5cGUgPT09ICdsb2NhdGlvbicgfHwgdHlwZSA9PT0gJ2FsbCcpIG9iamVjdC5wb3NpdGlvbiA9IFswLCAwLCAwXTtcblx0XHRcdFx0aWYgKHR5cGUgPT09ICdyb3RhdGlvbicgfHwgdHlwZSA9PT0gJ2FsbCcpIG9iamVjdC5yb3RhdGlvbiA9IFswLCAwLCAwXTtcblx0XHRcdFx0aWYgKHR5cGUgPT09ICdzY2FsZScgfHwgdHlwZSA9PT0gJ2FsbCcpIG9iamVjdC5zY2FsZSA9IFsxLCAxLCAxXTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRzZXRQYXJlbnQ6IChjaGlsZElkOiBzdHJpbmcsIHBhcmVudElkOiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBjaGlsZElkKTtcblx0XHRcdFx0Y29uc3QgcGFyZW50ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBwYXJlbnRJZCk7XG5cdFx0XHRcdGlmICghY2hpbGQgfHwgIXBhcmVudCB8fCBjaGlsZC5pZCA9PT0gcGFyZW50LmlkKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdC8vIEd1YXJkIGFnYWluc3QgY2lyY3VsYXIgaGllcmFyY2h5IGN5Y2xlc1xuXHRcdFx0XHRsZXQgY3Vyc29yOiBTY2VuZU9iamVjdCB8IHVuZGVmaW5lZCA9IHBhcmVudDtcblx0XHRcdFx0Y29uc3QgdmlzaXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHR3aGlsZSAoY3Vyc29yPy5wYXJlbnQpIHtcblx0XHRcdFx0XHRpZiAoY3Vyc29yLnBhcmVudCA9PT0gY2hpbGRJZCB8fCB2aXNpdGVkLmhhcyhjdXJzb3IuaWQpKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdFx0dmlzaXRlZC5hZGQoY3Vyc29yLmlkKTtcblx0XHRcdFx0XHRjdXJzb3IgPSBzdGF0ZS5vYmplY3RzLmZpbmQoKG8pID0+IG8uaWQgPT09IGN1cnNvciEucGFyZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwdXNoSGlzdG9yeShzdGF0ZSk7XG5cdFx0XHRcdGlmIChjaGlsZC5wYXJlbnQgJiYgY2hpbGQucGFyZW50ICE9PSBwYXJlbnRJZCkge1xuXHRcdFx0XHRcdGNvbnN0IG9sZFBhcmVudCA9IHN0YXRlLm9iamVjdHMuZmluZCgobykgPT4gby5pZCA9PT0gY2hpbGQucGFyZW50KTtcblx0XHRcdFx0XHRpZiAob2xkUGFyZW50KSBvbGRQYXJlbnQuY2hpbGRyZW4gPSBvbGRQYXJlbnQuY2hpbGRyZW4uZmlsdGVyKChpZCkgPT4gaWQgIT09IGNoaWxkSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNoaWxkLnBhcmVudCA9IHBhcmVudElkO1xuXHRcdFx0XHRpZiAoIXBhcmVudC5jaGlsZHJlbi5pbmNsdWRlcyhjaGlsZElkKSkgcGFyZW50LmNoaWxkcmVuLnB1c2goY2hpbGRJZCk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXG5cdFx0Y2xlYXJQYXJlbnQ6IChjaGlsZElkOiBzdHJpbmcpID0+XG5cdFx0XHR1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBjaGlsZElkKTtcblx0XHRcdFx0aWYgKCFjaGlsZCB8fCAhY2hpbGQucGFyZW50KSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0Y29uc3QgcGFyZW50ID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBjaGlsZC5wYXJlbnQpO1xuXHRcdFx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRcdFx0cGFyZW50LmNoaWxkcmVuID0gcGFyZW50LmNoaWxkcmVuLmZpbHRlcigoaWQpID0+IGlkICE9PSBjaGlsZElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWxldGUgY2hpbGQucGFyZW50O1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSxcblxuXHRcdGpvaW5TZWxlY3RlZDogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlID0gc3RhdGUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSBzdGF0ZS5zZWxlY3RlZElkKTtcblx0XHRcdFx0aWYgKCFhY3RpdmUgfHwgIWFjdGl2ZS5nZW9tZXRyeSkgcmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRjb25zdCBvdGhlclNlbGVjdGVkID0gc3RhdGUub2JqZWN0cy5maWx0ZXIoKG8pID0+IG8uc2VsZWN0ZWQgJiYgby5pZCAhPT0gYWN0aXZlLmlkICYmIG8uZ2VvbWV0cnkpO1xuXHRcdFx0XHRpZiAoIW90aGVyU2VsZWN0ZWQubGVuZ3RoKSByZXR1cm4gc3RhdGU7XG5cdFx0XHRcdHB1c2hIaXN0b3J5KHN0YXRlKTtcblx0XHRcdFx0Y29uc3QgbWVzaGVzVG9Kb2luID0gW1xuXHRcdFx0XHRcdHsgbWVzaDogYWN0aXZlLmdlb21ldHJ5LCBwb3NpdGlvbjogWzAsIDAsIDBdIGFzIFZlYzMsIHNjYWxlOiBbMSwgMSwgMV0gYXMgVmVjMyB9LFxuXHRcdFx0XHRcdC4uLm90aGVyU2VsZWN0ZWQubWFwKChvKSA9PiAoe1xuXHRcdFx0XHRcdFx0bWVzaDogby5nZW9tZXRyeSEsXG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogW1xuXHRcdFx0XHRcdFx0XHQoby5wb3NpdGlvblswXSAtIGFjdGl2ZS5wb3NpdGlvblswXSkgLyBhY3RpdmUuc2NhbGVbMF0sXG5cdFx0XHRcdFx0XHRcdChvLnBvc2l0aW9uWzFdIC0gYWN0aXZlLnBvc2l0aW9uWzFdKSAvIGFjdGl2ZS5zY2FsZVsxXSxcblx0XHRcdFx0XHRcdFx0KG8ucG9zaXRpb25bMl0gLSBhY3RpdmUucG9zaXRpb25bMl0pIC8gYWN0aXZlLnNjYWxlWzJdLFxuXHRcdFx0XHRcdFx0XSBhcyBWZWMzLFxuXHRcdFx0XHRcdFx0c2NhbGU6IFtcblx0XHRcdFx0XHRcdFx0by5zY2FsZVswXSAvIGFjdGl2ZS5zY2FsZVswXSxcblx0XHRcdFx0XHRcdFx0by5zY2FsZVsxXSAvIGFjdGl2ZS5zY2FsZVsxXSxcblx0XHRcdFx0XHRcdFx0by5zY2FsZVsyXSAvIGFjdGl2ZS5zY2FsZVsyXSxcblx0XHRcdFx0XHRcdF0gYXMgVmVjMyxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdF07XG5cdFx0XHRcdGFjdGl2ZS5nZW9tZXRyeSA9IGpvaW5NZXNoZXMobWVzaGVzVG9Kb2luKTtcblx0XHRcdFx0YWN0aXZlLmdlb21ldHJ5VmVyc2lvbisrO1xuXHRcdFx0XHRjb25zdCBvdGhlcklkcyA9IG5ldyBTZXQob3RoZXJTZWxlY3RlZC5tYXAoKG8pID0+IG8uaWQpKTtcblx0XHRcdFx0c3RhdGUub2JqZWN0cyA9IHN0YXRlLm9iamVjdHMuZmlsdGVyKChvKSA9PiAhb3RoZXJJZHMuaGFzKG8uaWQpKTtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fSksXG5cblx0XHRjbGVhcjogKCkgPT5cblx0XHRcdHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdFx0cHVzaEhpc3Rvcnkoc3RhdGUpO1xuXHRcdFx0XHRzdGF0ZS5vYmplY3RzID0gW107XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkSWQgPSBudWxsO1xuXHRcdFx0XHRzdGF0ZS5zY29yZSA9IDA7XG5cdFx0XHRcdHN0YXRlLmVkaXRNb2RlID0gZmFsc2U7XG5cdFx0XHRcdHN0YXRlLnNlbGVjdGVkVmVydGljZXMgPSBbXTtcblx0XHRcdFx0c3RhdGUuc2VsZWN0ZWRFZGdlcyA9IFtdO1xuXHRcdFx0XHRzdGF0ZS5zZWxlY3RlZEZhY2VzID0gW107XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0pLFxuXHR9O1xufVxuXG5leHBvcnQgY29uc3Qgc2NlbmVTdG9yZSA9IGNyZWF0ZVNjZW5lU3RvcmUoKTtcblxuZXhwb3J0IGNvbnN0IHNlbGVjdGVkT2JqZWN0ID0gZGVyaXZlZChzY2VuZVN0b3JlLCAoJHNjZW5lKSA9PiAkc2NlbmUub2JqZWN0cy5maW5kKChvKSA9PiBvLmlkID09PSAkc2NlbmUuc2VsZWN0ZWRJZCkgfHwgbnVsbCk7XG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLFFBQVEsY0FBYztBQUNyRCxTQUFvQixXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssUUFBUSxlQUFlO0FBQzFFLFNBQ0MsU0FBUyxFQUNULGlCQUFpQixFQUNqQixvQkFBb0IsRUFDcEIsV0FBVyxFQUNYLFNBQVMsRUFDVCxhQUFhLEVBQ2Isb0JBQW9CLEVBQ3BCLFdBQVcsSUFBSSxlQUFlLEVBQzlCLFlBQVksRUFDWixXQUFXLEVBQ1gsVUFBVSxFQUNWLE9BQU8sRUFDUCxlQUFlLEVBQ2Ysa0JBQWtCLEVBQ2xCLFlBQVksRUFDWixTQUFTLEVBQ1QsWUFBWSxFQUNaLGVBQWUsRUFDZixhQUFhLEVBQ2IsY0FBYyxFQUNkLGdCQUFnQixFQUNoQixxQkFBcUIsRUFDckIsZ0JBQWdCLEVBQ2hCLFVBQVUsRUFDVixZQUFZLEVBQ1osYUFBYSxFQUNiLGFBQWEsRUFDYixXQUFXLEVBQ1gsVUFBVSxFQUNWLFVBQVUsRUFDVixVQUFVLFFBR0osYUFBYTtBQUNwQixTQUNDLFVBQVUsRUFDVixvQkFBb0IsRUFDcEIsYUFBYSxFQUNiLFVBQVUsUUFFSixlQUFlO0FBQ3RCLFNBQVMsVUFBVSxFQUFFLFlBQVksRUFBRSxhQUFhLFFBQVEsa0JBQWtCO0FBQzFFLFNBQVMsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLFFBQVEsY0FBYztBQUN0RixTQUFTLGFBQWEsRUFBRSxPQUFPLFFBQVEsaUJBQWlCO0FBQ3hELFNBQVMsYUFBYSxRQUFnQyxZQUFZO0FBMkZsRSxPQUFPLE1BQU0sWUFBWSxHQUFHLFNBQVM7QUFFckMsT0FBTyxNQUFNLFVBQWlDLEdBQUc7QUFDaEQ7QUFDQTtFQUFFLElBQUksRUFBRSxNQUFNO0VBQUUsS0FBSyxFQUFFLE1BQU07RUFBRSxJQUFJLEVBQUUsTUFBTTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUNwRjtFQUFFLElBQUksRUFBRSxRQUFRO0VBQUUsS0FBSyxFQUFFLFdBQVc7RUFBRSxJQUFJLEVBQUUsUUFBUTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUM3RjtFQUFFLElBQUksRUFBRSxXQUFXO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxJQUFJLEVBQUUsUUFBUTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUNqRztFQUFFLElBQUksRUFBRSxVQUFVO0VBQUUsS0FBSyxFQUFFLFVBQVU7RUFBRSxJQUFJLEVBQUUsVUFBVTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUNoRztFQUFFLElBQUksRUFBRSxNQUFNO0VBQUUsS0FBSyxFQUFFLE1BQU07RUFBRSxJQUFJLEVBQUUsTUFBTTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUNwRjtFQUFFLElBQUksRUFBRSxPQUFPO0VBQUUsS0FBSyxFQUFFLE9BQU87RUFBRSxJQUFJLEVBQUUsT0FBTztFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUN2RjtFQUFFLElBQUksRUFBRSxPQUFPO0VBQUUsS0FBSyxFQUFFLE9BQU87RUFBRSxJQUFJLEVBQUUsT0FBTztFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUN2RjtFQUFFLElBQUksRUFBRSxRQUFRO0VBQUUsS0FBSyxFQUFFLFFBQVE7RUFBRSxJQUFJLEVBQUUsT0FBTztFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUN6RjtFQUFFLElBQUksRUFBRSxNQUFNO0VBQUUsS0FBSyxFQUFFLE1BQU07RUFBRSxJQUFJLEVBQUUsT0FBTztFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUNyRjtFQUFFLElBQUksRUFBRSxTQUFTO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxJQUFJLEVBQUUsTUFBTTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUMxRjtFQUFFLElBQUksRUFBRSxNQUFNO0VBQUUsS0FBSyxFQUFFLE1BQU07RUFBRSxJQUFJLEVBQUUsVUFBVTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQyxFQUN4RjtFQUFFLElBQUksRUFBRSxTQUFTO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxJQUFJLEVBQUUsUUFBUTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQU8sQ0FBQztBQUU1RjtBQUNBO0VBQUUsSUFBSSxFQUFFLGNBQWM7RUFBRSxLQUFLLEVBQUUsY0FBYztFQUFFLElBQUksRUFBRSxPQUFPO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDLEVBQ3RHO0VBQUUsSUFBSSxFQUFFLGNBQWM7RUFBRSxLQUFLLEVBQUUsZUFBZTtFQUFFLElBQUksRUFBRSxPQUFPO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDLEVBQ3ZHO0VBQUUsSUFBSSxFQUFFLFlBQVk7RUFBRSxLQUFLLEVBQUUsTUFBTTtFQUFFLElBQUksRUFBRSxPQUFPO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDLEVBQzVGO0VBQUUsSUFBSSxFQUFFLGFBQWE7RUFBRSxLQUFLLEVBQUUsYUFBYTtFQUFFLElBQUksRUFBRSxPQUFPO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDO0FBRXBHO0FBQ0E7RUFBRSxJQUFJLEVBQUUsT0FBTztFQUFFLEtBQUssRUFBRSxhQUFhO0VBQUUsSUFBSSxFQUFFLE1BQU07RUFBRSxLQUFLLEVBQUUsWUFBWTtFQUFFLFFBQVEsRUFBRTtBQUFRLENBQUMsRUFDN0Y7RUFBRSxJQUFJLEVBQUUsV0FBVztFQUFFLEtBQUssRUFBRSxXQUFXO0VBQUUsSUFBSSxFQUFFLE1BQU07RUFBRSxLQUFLLEVBQUUsWUFBWTtFQUFFLFFBQVEsRUFBRTtBQUFRLENBQUMsRUFDL0Y7RUFBRSxJQUFJLEVBQUUsWUFBWTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsSUFBSSxFQUFFLE1BQU07RUFBRSxLQUFLLEVBQUUsWUFBWTtFQUFFLFFBQVEsRUFBRTtBQUFRLENBQUMsRUFDakc7RUFBRSxJQUFJLEVBQUUsWUFBWTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsSUFBSSxFQUFFLE1BQU07RUFBRSxLQUFLLEVBQUUsWUFBWTtFQUFFLFFBQVEsRUFBRTtBQUFRLENBQUM7QUFFakc7QUFDQTtFQUFFLElBQUksRUFBRSxRQUFRO0VBQUUsS0FBSyxFQUFFLGFBQWE7RUFBRSxJQUFJLEVBQUUsUUFBUTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQVMsQ0FBQyxFQUNqRztFQUFFLElBQUksRUFBRSxjQUFjO0VBQUUsS0FBSyxFQUFFLGNBQWM7RUFBRSxJQUFJLEVBQUUsUUFBUTtFQUFFLEtBQUssRUFBRSxZQUFZO0VBQUUsUUFBUSxFQUFFO0FBQVMsQ0FBQztBQUV4RztBQUNBO0VBQUUsSUFBSSxFQUFFLFlBQVk7RUFBRSxLQUFLLEVBQUUsWUFBWTtFQUFFLElBQUksRUFBRSxNQUFNO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDLEVBQ2pHO0VBQUUsSUFBSSxFQUFFLGNBQWM7RUFBRSxLQUFLLEVBQUUsUUFBUTtFQUFFLElBQUksRUFBRSxNQUFNO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDLEVBQy9GO0VBQUUsSUFBSSxFQUFFLFlBQVk7RUFBRSxLQUFLLEVBQUUsWUFBWTtFQUFFLElBQUksRUFBRSxNQUFNO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDLEVBQ2pHO0VBQUUsSUFBSSxFQUFFLGNBQWM7RUFBRSxLQUFLLEVBQUUsY0FBYztFQUFFLElBQUksRUFBRSxRQUFRO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDLEVBQ3ZHO0VBQUUsSUFBSSxFQUFFLGNBQWM7RUFBRSxLQUFLLEVBQUUsY0FBYztFQUFFLElBQUksRUFBRSxPQUFPO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDLEVBQ3RHO0VBQUUsSUFBSSxFQUFFLGFBQWE7RUFBRSxLQUFLLEVBQUUsYUFBYTtFQUFFLElBQUksRUFBRSxPQUFPO0VBQUUsS0FBSyxFQUFFLFlBQVk7RUFBRSxRQUFRLEVBQUU7QUFBUSxDQUFDO0FBRXBHO0FBQ0E7RUFBRSxJQUFJLEVBQUUsU0FBUztFQUFF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RSxFQUFFO1FBQUUsTUFBTSxFQUFFLEdBQUc7UUFBRSxNQUFNLEVBQUU7TUFBSSxDQUFDO0lBQ2xFLEtBQUssTUFBTTtNQUFFLE9BQU87UUFBRSxRQUFRLEVBQUUsRUFBRTtRQUFFLE1BQU0sRUFBRSxHQUFHO1FBQUUsTUFBTSxFQUFFO01BQUksQ0FBQztJQUM5RCxLQUFLLE9BQU87TUFBRSxPQUFPO1FBQUUsUUFBUSxFQUFFLEVBQUU7UUFBRSxLQUFLLEVBQUUsRUFBRTtRQUFFLE1BQU0sRUFBRSxJQUFJO1FBQUUsSUFBSSxFQUFFO01BQUssQ0FBQztJQUMxRSxLQUFLLE1BQU07TUFBRSxPQUFPO1FBQUUsS0FBSyxFQUFFLEdBQUc7UUFBRSxLQUFLLEVBQUUsR0FBRztRQUFFLEtBQUssRUFBRTtNQUFJLENBQUM7SUFDMUQsS0FBSyxPQUFPO01BQUUsT0FBTztRQUFFLEtBQUssRUFBRSxHQUFHO1FBQUUsS0FBSyxFQUFFO01BQUksQ0FBQztJQUMvQyxLQUFLLFFBQVE7TUFBRSxPQUFPO1FBQUUsUUFBUSxFQUFFLEVBQUU7UUFBRSxNQUFNLEVBQUU7TUFBSSxDQUFDO0lBQ25ELEtBQUssTUFBTTtNQUFFLE9BQU87UUFBRSxPQUFPLEVBQUUsQ0FBQztRQUFFLE9BQU8sRUFBRSxDQUFDO1FBQUUsS0FBSyxFQUFFLEdBQUc7UUFBRSxLQUFLLEVBQUU7TUFBSSxDQUFDO0lBQ3RFLEtBQUssU0FBUztNQUFFLE9BQU87UUFBRSxLQUFLLEVBQUUsQ0FBQztRQUFFLE1BQU0sRUFBRSxHQUFHO1FBQUUsTUFBTSxFQUFFO01BQUksQ0FBQztJQUM3RCxLQUFLLE1BQU07TUFBRSxPQUFPO1FBQUUsUUFBUSxFQUFFLEVBQUU7UUFBRSxXQUFXLEVBQUUsR0FBRztRQUFFLFdBQVcsRUFBRSxHQUFHO1FBQUUsTUFBTSxFQUFFO01BQUksQ0FBQztJQUNyRixLQUFLLFNBQVM7TUFBRSxPQUFPO1FBQUUsUUFBUSxFQUFFLEVBQUU7UUFBRSxLQUFLLEVBQUUsQ0FBQztRQUFFLE1BQU0sRUFBRSxJQUFJO1FBQUUsTUFBTSxFQUFF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Q0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RSxJQUFJLFFBQVEsQ0FBQyxDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsSUFBSSxRQUFRLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNGLElBQUksUUFBUSxDQUFDLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzRixJQUFJLFFBQVEsQ0FBQyxDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUs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TSxNQUFNLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUUsQ0FBQyxJQUFLLENBQUMsQ0FBQyxFQUFFLEtBQUssUUFBUSxDQUFDO01BQzNELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLE9BQU8sS0FBSztNQUM3QyxXQUFXLENBQUMsS0FBSyxDQUFDO01BQ2xCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU07TUFDNUMsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssSUFBSSxFQUFFO1FBQ2pFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7VUFDOUIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkY7TUFDRCxDQUFDLE1BQU07UUFDTixNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO01BQy9DO01BQ0EsTUFBTSxDQUFDLFlBQVksRUFBRTtNQUNyQixPQUFPLEtBQUs7SUFDYixDQUFDLENBQUM7SUFFSCxRQUFRLEVBQUcsRUFBVyxJQUNyQixNQUFNLENBQUUsS0FBSyxJQUFLO01BQ2pCLE1BQU0sUUFBUSxHQUFHLEVBQUUsSUFBSSxLQUFLLENBQUMsVUFBVTtNQUN2QyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBRSxDQUFDLElBQUssQ0FBQyxD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LENBQUUsQ0FBQyxJQUFLLENBQUMsQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLFVBQVUsQ0FBQztNQUNuRSxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLE9BQU8sS0FBSztNQUNoRixJQUFJLElBQUksRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDO01BQzVCLE1BQU0sSUFBSSxHQUFHLG1CQUFtQixDQUFDLE1BQU0sQ0FBQztNQUN4QyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO01BQzlILElBQUksT0FBTyxHQUFHLEtBQUs7TUFDbkIsTUFBTSxFQUFFLEdBQUcsTUFBTSxHQUFHLE1BQU07TUFDMUIsTUFBTSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQztNQUM1QyxNQUFNLEVBQUUsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQUUsRUFBRSxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFBRSxFQUFFLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQztNQUNoRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDOUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDMUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7VUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7VUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7UUFDcEQsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUNiLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVM7UUFDdkMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxRQUFRO1FBQ2hDLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDO1FBQ2hCLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxPQUFPO1FBQ3pELElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxJQUFJLE9BQU87UUFDakUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLElBQUksT0FBTztRQUNqRSxPQUFPLEdBQUcsSUFBSTtNQUNmO01BQ0EsSUFBSSxPQUFPLEVBQUUsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDLEtBQzlCLElBQUksSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztNQUN6QixPQUFPLEtBQUs7SUFDYixDQUFDLENBQUM7SUFDSCxlQUFlLEVBQUcsR0FBVyxJQUM1QixNQUFNLENBQUUsS0FBSyxJQUFLO01BQ2pCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFFLENBQUMsSUFBSyxDQUFDLENBQUMsRUFBRSxLQUFLLEtBQUssQ0FBQyxVQUFVLENBQUM7TUFDbkUsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxPQUFPLEtBQUs7TUFDaEYsV0FBVyxDQUFDLEtBQUssQ0FBQztNQUNsQixNQUFNLElBQUksR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUM7TUFDeEMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUc7TUFDN0MsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUc7TUFDN0MsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUc7TUFDN0MsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7TUFDakQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQzlDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7UUFDdEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7UUFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxH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SSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQzdCLElBQUksSUFBSSxFQUFFO1VBQ1QsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7VUFDOUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztVQUN6RSxNQUFNLE9BQWlCLEdBQUcsRUFBRTtVQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEtBQUs7WUFDOUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Y0FBRSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RSxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxHQUFHLElBQUksR0FBRyxTQUFTLEdBQUcsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1VBQzNF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QUFDLENBQUMsR0FBRyxJQUFJLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7VUFDMUQsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1VBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNEO1FBQ0EsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUM7UUFDNUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUM7UUFDNUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUM7UUFDNUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUUsQ0FBQyxJQUFLO1VBQzVCLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFO1VBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUU7VUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRTtRQUNuQyxDQUFDLENBQUM7UUFDRixNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDNUcsTUFBTSxDQUFDLFFBQVEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FB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