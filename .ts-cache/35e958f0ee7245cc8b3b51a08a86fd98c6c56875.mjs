import { writable, get } from 'svelte/store';
import { PRIMITIVES, sceneStore } from './scene';
import { timelineStore } from './timeline';
import { uiStore } from './ui';
const initialState = {
  current: 'move',
  snap: false,
  space: 'world',
  pivot: 'median',
  agentPrompt: '',
  cutMode: 'split',
  selectionMode: 'single',
  axisConstraint: 'all',
  uniformScale: true,
  activeParamTool: null,
  toolParams: {
    extrude: {
      amount: 0.35
    },
    bevel: {
      amount: 0.05,
      segments: 1
    },
    loopcut: {
      amount: 1
    },
    inset: {
      amount: 0.18
    },
    decimate: {
      ratio: 0.5
    },
    solidify: {
      amount: 0.12
    },
    smooth: {
      iterations: 2,
      factor: 0.5
    },
    array: {
      count: 3,
      offset: [1.25, 0, 0]
    },
    screw: {
      axis: 'z',
      angle: 360,
      steps: 16,
      pitch: 0.5
    },
    boolean: {
      op: 'difference'
    },
    subdivide: {
      levels: 1
    }
  }
};
const COLOR_NAMES = {
  red: '#ff6b6b',
  orange: '#ffa94d',
  yellow: '#ffd43b',
  green: '#51d88a',
  teal: '#3dd9a8',
  cyan: '#5cb8ff',
  blue: '#4c8dff',
  purple: '#a78bfa',
  violet: '#b197fc',
  pink: '#f472b6',
  white: '#f1f3f9',
  grey: '#9aa3b8',
  gray: '#9aa3b8',
  black: '#14161d'
};
const PRIMITIVE_WORDS = {
  cube: 'cube',
  box: 'cube',
  sphere: 'sphere',
  ball: 'sphere',
  cylinder: 'cylinder',
  cone: 'cone',
  torus: 'torus',
  donut: 'torus',
  ring: 'torus',
  plane: 'plane',
  floor: 'plane',
  ground: 'plane',
  coin: 'coin',
  light: 'light',
  lamp: 'light',
  sun: 'light',
  camera: 'camera',
  bone: 'bone'
};
function parseColor(text) {
  const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(text);
  if (hex) return hex[0];
  for (const [name, value] of Object.entries(COLOR_NAMES)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) return value;
  }
  return null;
}
function parseNumbers(text) {
  return (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(value => Number.isFinite(value));
}
function selectedObject() {
  const state = get(sceneStore);
  return state.objects.find(object => object.id === state.selectedId) || null;
}
function findObjectByName(text) {
  const state = get(sceneStore);
  const lower = text.toLowerCase();
  const matches = state.objects.filter(object => lower.includes(object.name.toLowerCase()));
  return matches.sort((a, b) => b.name.length - a.name.length)[0] || null;
}
function resolveTarget(text) {
  const named = findObjectByName(text);
  return named || selectedObject();
}
function report(message, type = 'info') {
  uiStore.showToast(message, type, 2600);
}
function vectorFrom(numbers, fallback) {
  if (numbers.length >= 3) return [numbers[0], numbers[1], numbers[2]];
  return fallback;
}
function addPrimitiveCommand(text) {
  const words = text.toLowerCase();
  if (!/\b(add|create|make|place|new)\b/.test(words)) return false;
  const entries = Object.entries(PRIMITIVE_WORDS);
  let type = '';
  for (const [word, primitive] of entries) {
    if (new RegExp(`\\b${word}(?:e?s)?\\b`, 'i').test(words)) {
      type = primitive;
      break;
    }
  }
  if (!type) return false;
  const numbers = parseNumbers(words);
  let count = 1;
  const countMatch = /\b(\d+)\b/.exec(words);
  if (countMatch) {
    const value = Number(countMatch[1]);
    if (value >= 1 && value <= 25) count = value;
  }
  const color = parseColor(text);
  const definition = PRIMITIVES.find(primitive => primitive.type === type);
  const positionNumbers = numbers.length >= 3 ? numbers.slice(-3) : null;
  const created = [];
  for (let index = 0; index < count; index++) {
    sceneStore.addPrimitive(type, positionNumbers && index === 0 ? positionNumbers : undefined);
    const id = get(sceneStore).selectedId;
    if (id) created.push(id);
  }
  if (color) {
    for (const id of created) sceneStore.setColor(id, color);
  }
  report(`Added ${count > 1 ? `${count} ` : ''}${definition?.label.toLowerCase() || type}${count > 1 ? 's' : ''}.`, 'success');
  return true;
}
function animateCommand(text) {
  const words = text.toLowerCase();
  if (!/\b(animate|spin|rotate|bounce|orbit|fall|drop)\b/.test(words)) return false;
  const target = resolveTarget(text);
  if (!target) {
    report('Select an object before asking for an animation.', 'warning');
    return true;
  }
  const duration = Math.max(1, Math.min(10, parseNumbers(words).find(value => value >= 1 && value <= 10) || 2));
  const start = {
    time: 0,
    position: [...target.position],
    rotation: [...target.rotation],
    scale: [...target.scale]
  };
  if (/\bspin\b/.test(words)) {
    timelineStore.addKeyframe(target.id, start);
    timelineStore.addKeyframe(target.id, {
      ...start,
      time: duration,
      rotation: [start.rotation[0], start.rotation[1] + Math.PI * 2, start.rotation[2]]
    });
    report(`Spinning ${target.name} over ${duration}s.`, 'success');
  } else if (/\bbounce\b/.test(words)) {
    timelineStore.addKeyframe(target.id, start);
    timelineStore.addKeyframe(target.id, {
      ...start,
      time: duration / 2,
      position: [start.position[0], start.position[1] + 2, start.position[2]]
    });
    timelineStore.addKeyframe(target.id, {
      ...start,
      time: duration
    });
    report(`Bouncing ${target.name} over ${duration}s.`, 'success');
  } else if (/\borbit\b/.test(words)) {
    const radius = Math.hypot(start.position[0], start.position[2]) || 2;
    for (let index = 0; index <= 4; index++) {
      const angle = index / 4 * Math.PI * 2;
      timelineStore.addKeyframe(target.id, {
        ...start,
        time: duration * index / 4,
        position: [Math.cos(angle) * radius, start.position[1], Math.sin(angle) * radius]
      });
    }
    report(`Orbiting ${target.name} over ${duration}s.`, 'success');
  } else if (/\b(fall|drop)\b/.test(words)) {
    timelineStore.addKeyframe(target.id, start);
    timelineStore.addKeyframe(target.id, {
      ...start,
      time: duration,
      position: [start.position[0], 0, start.position[2]]
    });
    report(`${target.name} will fall over ${duration}s.`, 'success');
  } else {
    timelineStore.addKeyframe(target.id, start);
    timelineStore.addKeyframe(target.id, {
      ...start,
      time: duration,
      rotation: [start.rotation[0], start.rotation[1] + Math.PI, start.rotation[2]]
    });
    report(`Animated ${target.name} over ${duration}s.`, 'success');
  }
  timelineStore.setDuration(Math.max(duration, get(timelineStore).duration));
  timelineStore.setPlaying(true);
  return true;
}
function runCommand(raw) {
  const text = raw.trim();
  const words = text.toLowerCase();
  if (!text) return;
  if (/\b(help|commands)\b/.test(words)) {
    report('Try: add cube, add 3 red spheres, select Cube, move to 2 0 0, spin, drop, play, undo.', 'info');
    return;
  }
  if (/\b(undo)\b/.test(words)) {
    sceneStore.undo();
    report('Undo.', 'success');
    return;
  }
  if (/\b(redo)\b/.test(words)) {
    sceneStore.redo();
    report('Redo.', 'success');
    return;
  }
  if (/\b(clear|reset)\b/.test(words) && !/\b(reset score)\b/.test(words)) {
    sceneStore.clear();
    timelineStore.clearKeyframes();
    report('Scene cleared. Undo is available.', 'success');
    return;
  }
  if (/\b(reset score|score reset)\b/.test(words)) {
    sceneStore.resetScore();
    report('Score reset.', 'success');
    return;
  }
  if (/\b(play game|game mode|start game)\b/.test(words)) {
    const state = get(sceneStore);
    if (!state.gameMode) sceneStore.toggleGameMode();
    report('Game mode on. Use arrow keys or the on-screen pad.', 'success');
    return;
  }
  if (/\b(stop game|exit game|end game)\b/.test(words)) {
    const state = get(sceneStore);
    if (state.gameMode) sceneStore.toggleGameMode();
    sceneStore.resetGameInput();
    report('Game mode off.', 'success');
    return;
  }
  if (/\b(play|start)\b/.test(words) && !/\b(play game)\b/.test(words)) {
    timelineStore.setShow(true);
    timelineStore.setPlaying(true);
    report('Playing timeline.', 'success');
    return;
  }
  if (/\b(pause|stop)\b/.test(words)) {
    timelineStore.setPlaying(false);
    report('Timeline paused.', 'success');
    return;
  }
  if (/\b(add key|keyframe)\b/.test(words)) {
    const target = resolveTarget(text);
    if (!target) {
      report('Select an object before adding a keyframe.', 'warning');
      return;
    }
    const time = get(timelineStore).currentTime;
    timelineStore.addKeyframe(target.id, {
      time,
      position: [...target.position],
      rotation: [...target.rotation],
      scale: [...target.scale]
    });
    report(`Keyframe added for ${target.name} at ${time.toFixed(2)}s.`, 'success');
    return;
  }
  if (/\b(delete|remove)\b/.test(words)) {
    const target = findObjectByName(text);
    if (target) {
      sceneStore.deleteObject(target.id);
      timelineStore.removeKeyframesFor(target.id);
      report(`Deleted ${target.name}.`, 'success');
      return;
    }
    sceneStore.deleteSelected();
    report('Deleted selected object.', 'success');
    return;
  }
  if (/\b(select)\b/.test(words)) {
    const target = findObjectByName(text);
    if (target) {
      sceneStore.selectObject(target.id);
      report(`Selected ${target.name}.`, 'success');
    } else {
      report('No matching object. Check the outliner for names.', 'warning');
    }
    return;
  }
  if (/\b(color|paint|make.*(red|blue|green|yellow|purple|pink|white|black))\b/.test(words)) {
    const target = resolveTarget(text);
    const color = parseColor(text);
    if (!target) {
      report('Select an object before changing its color.', 'warning');
      return;
    }
    if (!color) {
      report('I could not find a color name in that request.', 'warning');
      return;
    }
    sceneStore.setColor(target.id, color);
    report(`Colored ${target.name}.`, 'success');
    return;
  }
  if (/\b(move|translate)\b/.test(words)) {
    const target = resolveTarget(text);
    if (!target) {
      report('Select an object before moving it.', 'warning');
      return;
    }
    const numbers = parseNumbers(words);
    if (!numbers.length) {
      report('Give me a position, for example: move to 2 0 0.', 'warning');
      return;
    }
    const position = /by\b/.test(words) && numbers.length >= 3 ? [target.position[0] + numbers[0], target.position[1] + numbers[1], target.position[2] + numbers[2]] : vectorFrom(numbers, target.position);
    sceneStore.setTransform(target.id, {
      position
    });
    report(`Moved ${target.name}.`, 'success');
    return;
  }
  if (/\b(rotate|turn)\b/.test(words)) {
    const target = resolveTarget(text);
    if (!target) {
      report('Select an object before rotating it.', 'warning');
      return;
    }
    const numbers = parseNumbers(words);
    const radians = (numbers.length >= 3 ? numbers : [0, 45, 0]).map(value => value * Math.PI / 180);
    sceneStore.setTransform(target.id, {
      rotation: [target.rotation[0] + radians[0], target.rotation[1] + radians[1], target.rotation[2] + radians[2]]
    });
    report(`Rotated ${target.name}.`, 'success');
    return;
  }
  if (/\b(scale|resize|size)\b/.test(words)) {
    const target = resolveTarget(text);
    if (!target) {
      report('Select an object before scaling it.', 'warning');
      return;
    }
    const numbers = parseNumbers(words);
    const factor = numbers[0] && numbers[0] > 0 ? numbers[0] : 1.25;
    sceneStore.setTransform(target.id, {
      scale: [target.scale[0] * factor, target.scale[1] * factor, target.scale[2] * factor]
    });
    report(`Scaled ${target.name}.`, 'success');
    return;
  }
  if (animateCommand(text)) return;
  if (addPrimitiveCommand(text)) return;
  report('I did not understand that. Type "help" for example commands.', 'warning');
}
function createToolStore() {
  const {
    subscribe,
    set,
    update
  } = writable(initialState);
  return {
    subscribe,
    set,
    setTool: tool => update(state => {
      state.current = tool;
      return state;
    }),
    /** Pans the viewport, useful on a touch screen. */
    setPan: () => update(state => {
      state.current = 'pan';
      return state;
    }),
    toggleSnap: () => update(state => {
      state.snap = !state.snap;
      return state;
    }),
    setSpace: space => update(state => {
      state.space = space;
      return state;
    }),
    setPivot: pivot => update(state => {
      state.pivot = pivot;
      return state;
    }),
    setAgentPrompt: prompt => update(state => {
      state.agentPrompt = prompt;
      return state;
    }),
    setCutMode: mode => update(state => {
      state.cutMode = mode;
      return state;
    }),
    setSelectionMode: mode => update(state => {
      state.selectionMode = mode;
      return state;
    }),
    setAxisConstraint: axis => update(state => {
      state.axisConstraint = axis;
      return state;
    }),
    setUniformScale: uniform => update(state => {
      state.uniformScale = uniform;
      return state;
    }),
    setActiveParamTool: tool => update(state => {
      state.activeParamTool = tool;
      return state;
    }),
    setToolParam: (tool, key, value) => update(state => {
      if (!state.toolParams[tool]) state.toolParams[tool] = {};
      state.toolParams[tool][key] = value;
      return state;
    }),
    runAgent: () => {
      const state = get(toolStore);
      const prompt = state.agentPrompt.trim();
      if (!prompt) {
        report('Describe what to build or animate first.', 'warning');
        return;
      }
      runCommand(prompt);
      update(current => {
        current.agentPrompt = '';
        return current;
      });
    },
    runCommand: command => runCommand(command),
    undo: () => sceneStore.undo(),
    redo: () => sceneStore.redo()
  };
}
export const toolStore = createToolStore();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsidG9vbHMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgd3JpdGFibGUsIGdldCB9IGZyb20gJ3N2ZWx0ZS9zdG9yZSc7XG5pbXBvcnQgeyBQUklNSVRJVkVTLCBzY2VuZVN0b3JlIH0gZnJvbSAnLi9zY2VuZSc7XG5pbXBvcnQgeyB0aW1lbGluZVN0b3JlIH0gZnJvbSAnLi90aW1lbGluZSc7XG5pbXBvcnQgeyB1aVN0b3JlIH0gZnJvbSAnLi91aSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVG9vbFN0YXRlIHtcblx0Y3VycmVudDogc3RyaW5nO1xuXHRzbmFwOiBib29sZWFuO1xuXHRzcGFjZTogJ3dvcmxkJyB8ICdsb2NhbCcgfCAndmlldycgfCAnbm9ybWFsJyB8ICdjdXJzb3InO1xuXHRwaXZvdDogJ21lZGlhbicgfCAnaW5kaXZpZHVhbCcgfCAnYWN0aXZlJyB8ICdjdXJzb3InIHwgJ2Jib3gnO1xuXHRhZ2VudFByb21wdDogc3RyaW5nO1xuXHQvKiogSG93IHRoZSBzY2lzc29ycyB0b29sIGN1dHM6IHR3byBoYWx2ZXMgb3IgYSBtYXJrZWQgc2lkZS4gKi9cblx0Y3V0TW9kZTogJ3NwbGl0JyB8ICdtYXJrJztcblx0c2VsZWN0aW9uTW9kZTogJ3NpbmdsZScgfCAnYm94JyB8ICdsYXNzbyc7XG5cdGF4aXNDb25zdHJhaW50OiAnYWxsJyB8ICd4JyB8ICd5JyB8ICd6Jztcblx0dW5pZm9ybVNjYWxlOiBib29sZWFuO1xuXHRhY3RpdmVQYXJhbVRvb2w6IHN0cmluZyB8IG51bGw7XG5cdHRvb2xQYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT47XG59XG5cbmNvbnN0IGluaXRpYWxTdGF0ZTogVG9vbFN0YXRlID0ge1xuXHRjdXJyZW50OiAnbW92ZScsXG5cdHNuYXA6IGZhbHNlLFxuXHRzcGFjZTogJ3dvcmxkJyxcblx0cGl2b3Q6ICdtZWRpYW4nLFxuXHRhZ2VudFByb21wdDogJycsXG5cdGN1dE1vZGU6ICdzcGxpdCcsXG5cdHNlbGVjdGlvbk1vZGU6ICdzaW5nbGUnLFxuXHRheGlzQ29uc3RyYWludDogJ2FsbCcsXG5cdHVuaWZvcm1TY2FsZTogdHJ1ZSxcblx0YWN0aXZlUGFyYW1Ub29sOiBudWxsLFxuXHR0b29sUGFyYW1zOiB7XG5cdFx0ZXh0cnVkZTogeyBhbW91bnQ6IDAuMzUgfSxcblx0XHRiZXZlbDogeyBhbW91bnQ6IDAuMDUsIHNlZ21lbnRzOiAxIH0sXG5cdFx0bG9vcGN1dDogeyBhbW91bnQ6IDEgfSxcblx0XHRpbnNldDogeyBhbW91bnQ6IDAuMTggfSxcblx0XHRkZWNpbWF0ZTogeyByYXRpbzogMC41IH0sXG5cdFx0c29saWRpZnk6IHsgYW1vdW50OiAwLjEyIH0sXG5cdFx0c21vb3RoOiB7IGl0ZXJhdGlvbnM6IDIsIGZhY3RvcjogMC41IH0sXG5cdFx0YXJyYXk6IHsgY291bnQ6IDMsIG9mZnNldDogWzEuMjUsIDAsIDBdIH0sXG5cdFx0c2NyZXc6IHsgYXhpczogJ3onLCBhbmdsZTogMzYwLCBzdGVwczogMTYsIHBpdGNoOiAwLjUgfSxcblx0XHRib29sZWFuOiB7IG9wOiAnZGlmZmVyZW5jZScgfSxcblx0XHRzdWJkaXZpZGU6IHsgbGV2ZWxzOiAxIH0sXG5cdH0sXG59O1xuXG5jb25zdCBDT0xPUl9OQU1FUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0cmVkOiAnI2ZmNmI2YicsXG5cdG9yYW5nZTogJyNmZmE5NGQnLFxuXHR5ZWxsb3c6ICcjZmZkNDNiJyxcblx0Z3JlZW46ICcjNTFkODhhJyxcblx0dGVhbDogJyMzZGQ5YTgnLFxuXHRjeWFuOiAnIzVjYjhmZicsXG5cdGJsdWU6ICcjNGM4ZGZmJyxcblx0cHVycGxlOiAnI2E3OGJmYScsXG5cdHZpb2xldDogJyNiMTk3ZmMnLFxuXHRwaW5rOiAnI2Y0NzJiNicsXG5cdHdoaXRlOiAnI2YxZjNmOScsXG5cdGdyZXk6ICcjOWFhM2I4Jyxcblx0Z3JheTogJyM5YWEzYjgnLFxuXHRibGFjazogJyMxNDE2MWQnLFxufTtcblxuY29uc3QgUFJJTUlUSVZFX1dPUkRTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRjdWJlOiAnY3ViZScsXG5cdGJveDogJ2N1YmUnLFxuXHRzcGhlcmU6ICdzcGhlcmUnLFxuXHRiYWxsOiAnc3BoZXJlJyxcblx0Y3lsaW5kZXI6ICdjeWxpbmRlcicsXG5cdGNvbmU6ICdjb25lJyxcblx0dG9ydXM6ICd0b3J1cycsXG5cdGRvbnV0OiAndG9ydXMnLFxuXHRyaW5nOiAndG9ydXMnLFxuXHRwbGFuZTogJ3BsYW5lJyxcblx0Zmxvb3I6ICdwbGFuZScsXG5cdGdyb3VuZDogJ3BsYW5lJyxcblx0Y29pbjogJ2NvaW4nLFxuXHRsaWdodDogJ2xpZ2h0Jyxcblx0bGFtcDogJ2xpZ2h0Jyxcblx0c3VuOiAnbGlnaHQnLFxuXHRjYW1lcmE6ICdjYW1lcmEnLFxuXHRib25lOiAnYm9uZScsXG59O1xuXG5mdW5jdGlvbiBwYXJzZUNvbG9yKHRleHQ6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRjb25zdCBoZXggPSAvIyhbMC05YS1mXXs2fXxbMC05YS1mXXszfSlcXGIvaS5leGVjKHRleHQpO1xuXHRpZiAoaGV4KSByZXR1cm4gaGV4WzBdO1xuXHRmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoQ09MT1JfTkFNRVMpKSB7XG5cdFx0aWYgKG5ldyBSZWdFeHAoYFxcXFxiJHtuYW1lfVxcXFxiYCwgJ2knKS50ZXN0KHRleHQpKSByZXR1cm4gdmFsdWU7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHBhcnNlTnVtYmVycyh0ZXh0OiBzdHJpbmcpOiBudW1iZXJbXSB7XG5cdHJldHVybiAodGV4dC5tYXRjaCgvLT9cXGQrKD86XFwuXFxkKyk/L2cpIHx8IFtdKS5tYXAoTnVtYmVyKS5maWx0ZXIoKHZhbHVlKSA9PiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpKTtcbn1cblxuZnVuY3Rpb24gc2VsZWN0ZWRPYmplY3QoKSB7XG5cdGNvbnN0IHN0YXRlID0gZ2V0KHNjZW5lU3RvcmUpO1xuXHRyZXR1cm4gc3RhdGUub2JqZWN0cy5maW5kKChvYmplY3QpID0+IG9iamVjdC5pZCA9PT0gc3RhdGUuc2VsZWN0ZWRJZCkgfHwgbnVsbDtcbn1cblxuZnVuY3Rpb24gZmluZE9iamVjdEJ5TmFtZSh0ZXh0OiBzdHJpbmcpIHtcblx0Y29uc3Qgc3RhdGUgPSBnZXQoc2NlbmVTdG9yZSk7XG5cdGNvbnN0IGxvd2VyID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuXHRjb25zdCBtYXRjaGVzID0gc3RhdGUub2JqZWN0cy5maWx0ZXIoKG9iamVjdCkgPT4gbG93ZXIuaW5jbHVkZXMob2JqZWN0Lm5hbWUudG9Mb3dlckNhc2UoKSkpO1xuXHRyZXR1cm4gbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiBiLm5hbWUubGVuZ3RoIC0gYS5uYW1lLmxlbmd0aClbMF0gfHwgbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVRhcmdldCh0ZXh0OiBzdHJpbmcpIHtcblx0Y29uc3QgbmFtZWQgPSBmaW5kT2JqZWN0QnlOYW1lKHRleHQpO1xuXHRyZXR1cm4gbmFtZWQgfHwgc2VsZWN0ZWRPYmplY3QoKTtcbn1cblxuZnVuY3Rpb24gcmVwb3J0KG1lc3NhZ2U6IHN0cmluZywgdHlwZTogJ2luZm8nIHwgJ3N1Y2Nlc3MnIHwgJ3dhcm5pbmcnIHwgJ2Vycm9yJyA9ICdpbmZvJykge1xuXHR1aVN0b3JlLnNob3dUb2FzdChtZXNzYWdlLCB0eXBlLCAyNjAwKTtcbn1cblxuZnVuY3Rpb24gdmVjdG9yRnJvbShudW1iZXJzOiBudW1iZXJbXSwgZmFsbGJhY2s6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSk6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG5cdGlmIChudW1iZXJzLmxlbmd0aCA+PSAzKSByZXR1cm4gW251bWJlcnNbMF0sIG51bWJlcnNbMV0sIG51bWJlcnNbMl1dO1xuXHRyZXR1cm4gZmFsbGJhY2s7XG59XG5cbmZ1bmN0aW9uIGFkZFByaW1pdGl2ZUNvbW1hbmQodGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IHdvcmRzID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuXHRpZiAoIS9cXGIoYWRkfGNyZWF0ZXxtYWtlfHBsYWNlfG5ldylcXGIvLnRlc3Qod29yZHMpKSByZXR1cm4gZmFsc2U7XG5cdGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhQUklNSVRJVkVfV09SRFMpO1xuXHRsZXQgdHlwZSA9ICcnO1xuXHRmb3IgKGNvbnN0IFt3b3JkLCBwcmltaXRpdmVdIG9mIGVudHJpZXMpIHtcblx0XHRpZiAobmV3IFJlZ0V4cChgXFxcXGIke3dvcmR9KD86ZT9zKT9cXFxcYmAsICdpJykudGVzdCh3b3JkcykpIHtcblx0XHRcdHR5cGUgPSBwcmltaXRpdmU7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblx0aWYgKCF0eXBlKSByZXR1cm4gZmFsc2U7XG5cblx0Y29uc3QgbnVtYmVycyA9IHBhcnNlTnVtYmVycyh3b3Jkcyk7XG5cdGxldCBjb3VudCA9IDE7XG5cdGNvbnN0IGNvdW50TWF0Y2ggPSAvXFxiKFxcZCspXFxiLy5leGVjKHdvcmRzKTtcblx0aWYgKGNvdW50TWF0Y2gpIHtcblx0XHRjb25zdCB2YWx1ZSA9IE51bWJlcihjb3VudE1hdGNoWzFdKTtcblx0XHRpZiAodmFsdWUgPj0gMSAmJiB2YWx1ZSA8PSAyNSkgY291bnQgPSB2YWx1ZTtcblx0fVxuXHRjb25zdCBjb2xvciA9IHBhcnNlQ29sb3IodGV4dCk7XG5cdGNvbnN0IGRlZmluaXRpb24gPSBQUklNSVRJVkVTLmZpbmQoKHByaW1pdGl2ZSkgPT4gcHJpbWl0aXZlLnR5cGUgPT09IHR5cGUpO1xuXHRjb25zdCBwb3NpdGlvbk51bWJlcnMgPSBudW1iZXJzLmxlbmd0aCA+PSAzID8gbnVtYmVycy5zbGljZSgtMykgOiBudWxsO1xuXG5cdGNvbnN0IGNyZWF0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjb3VudDsgaW5kZXgrKykge1xuXHRcdHNjZW5lU3RvcmUuYWRkUHJpbWl0aXZlKHR5cGUsIHBvc2l0aW9uTnVtYmVycyAmJiBpbmRleCA9PT0gMCA/IChwb3NpdGlvbk51bWJlcnMgYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdKSA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgaWQgPSBnZXQoc2NlbmVTdG9yZSkuc2VsZWN0ZWRJZDtcblx0XHRpZiAoaWQpIGNyZWF0ZWQucHVzaChpZCk7XG5cdH1cblx0aWYgKGNvbG9yKSB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBjcmVhdGVkKSBzY2VuZVN0b3JlLnNldENvbG9yKGlkLCBjb2xvcik7XG5cdH1cblx0cmVwb3J0KGBBZGRlZCAke2NvdW50ID4gMSA/IGAke2NvdW50fSBgIDogJyd9JHtkZWZpbml0aW9uPy5sYWJlbC50b0xvd2VyQ2FzZSgpIHx8IHR5cGV9JHtjb3VudCA+IDEgPyAncycgOiAnJ30uYCwgJ3N1Y2Nlc3MnKTtcblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGFuaW1hdGVDb21tYW5kKHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB3b3JkcyA9IHRleHQudG9Mb3dlckNhc2UoKTtcblx0aWYgKCEvXFxiKGFuaW1hdGV8c3Bpbnxyb3RhdGV8Ym91bmNlfG9yYml0fGZhbGx8ZHJvcClcXGIvLnRlc3Qod29yZHMpKSByZXR1cm4gZmFsc2U7XG5cdGNvbnN0IHRhcmdldCA9IHJlc29sdmVUYXJnZXQodGV4dCk7XG5cdGlmICghdGFyZ2V0KSB7XG5cdFx0cmVwb3J0KCdTZWxlY3QgYW4gb2JqZWN0IGJlZm9yZSBhc2tpbmcgZm9yIGFuIGFuaW1hdGlvbi4nLCAnd2FybmluZycpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IGR1cmF0aW9uID0gTWF0aC5tYXgoMSwgTWF0aC5taW4oMTAsIHBhcnNlTnVtYmVycyh3b3JkcykuZmluZCgodmFsdWUpID0+IHZhbHVlID49IDEgJiYgdmFsdWUgPD0gMTApIHx8IDIpKTtcblx0Y29uc3Qgc3RhcnQgPSB7XG5cdFx0dGltZTogMCxcblx0XHRwb3NpdGlvbjogWy4uLnRhcmdldC5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdHJvdGF0aW9uOiBbLi4udGFyZ2V0LnJvdGF0aW9uXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0c2NhbGU6IFsuLi50YXJnZXQuc2NhbGVdIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0fTtcblxuXHRpZiAoL1xcYnNwaW5cXGIvLnRlc3Qod29yZHMpKSB7XG5cdFx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSh0YXJnZXQuaWQsIHN0YXJ0KTtcblx0XHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKHRhcmdldC5pZCwge1xuXHRcdFx0Li4uc3RhcnQsXG5cdFx0XHR0aW1lOiBkdXJhdGlvbixcblx0XHRcdHJvdGF0aW9uOiBbc3RhcnQucm90YXRpb25bMF0sIHN0YXJ0LnJvdGF0aW9uWzFdICsgTWF0aC5QSSAqIDIsIHN0YXJ0LnJvdGF0aW9uWzJdXSxcblx0XHR9KTtcblx0XHRyZXBvcnQoYFNwaW5uaW5nICR7dGFyZ2V0Lm5hbWV9IG92ZXIgJHtkdXJhdGlvbn1zLmAsICdzdWNjZXNzJyk7XG5cdH0gZWxzZSBpZiAoL1xcYmJvdW5jZVxcYi8udGVzdCh3b3JkcykpIHtcblx0XHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKHRhcmdldC5pZCwgc3RhcnQpO1xuXHRcdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUodGFyZ2V0LmlkLCB7XG5cdFx0XHQuLi5zdGFydCxcblx0XHRcdHRpbWU6IGR1cmF0aW9uIC8gMixcblx0XHRcdHBvc2l0aW9uOiBbc3RhcnQucG9zaXRpb25bMF0sIHN0YXJ0LnBvc2l0aW9uWzFdICsgMiwgc3RhcnQucG9zaXRpb25bMl1dLFxuXHRcdH0pO1xuXHRcdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUodGFyZ2V0LmlkLCB7IC4uLnN0YXJ0LCB0aW1lOiBkdXJhdGlvbiB9KTtcblx0XHRyZXBvcnQoYEJvdW5jaW5nICR7dGFyZ2V0Lm5hbWV9IG92ZXIgJHtkdXJhdGlvbn1zLmAsICdzdWNjZXNzJyk7XG5cdH0gZWxzZSBpZiAoL1xcYm9yYml0XFxiLy50ZXN0KHdvcmRzKSkge1xuXHRcdGNvbnN0IHJhZGl1cyA9IE1hdGguaHlwb3Qoc3RhcnQucG9zaXRpb25bMF0sIHN0YXJ0LnBvc2l0aW9uWzJdKSB8fCAyO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPD0gNDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgYW5nbGUgPSAoaW5kZXggLyA0KSAqIE1hdGguUEkgKiAyO1xuXHRcdFx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSh0YXJnZXQuaWQsIHtcblx0XHRcdFx0Li4uc3RhcnQsXG5cdFx0XHRcdHRpbWU6IChkdXJhdGlvbiAqIGluZGV4KSAvIDQsXG5cdFx0XHRcdHBvc2l0aW9uOiBbTWF0aC5jb3MoYW5nbGUpICogcmFkaXVzLCBzdGFydC5wb3NpdGlvblsxXSwgTWF0aC5zaW4oYW5nbGUpICogcmFkaXVzXSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXBvcnQoYE9yYml0aW5nICR7dGFyZ2V0Lm5hbWV9IG92ZXIgJHtkdXJhdGlvbn1zLmAsICdzdWNjZXNzJyk7XG5cdH0gZWxzZSBpZiAoL1xcYihmYWxsfGRyb3ApXFxiLy50ZXN0KHdvcmRzKSkge1xuXHRcdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUodGFyZ2V0LmlkLCBzdGFydCk7XG5cdFx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSh0YXJnZXQuaWQsIHtcblx0XHRcdC4uLnN0YXJ0LFxuXHRcdFx0dGltZTogZHVyYXRpb24sXG5cdFx0XHRwb3NpdGlvbjogW3N0YXJ0LnBvc2l0aW9uWzBdLCAwLCBzdGFydC5wb3NpdGlvblsyXV0sXG5cdFx0fSk7XG5cdFx0cmVwb3J0KGAke3RhcmdldC5uYW1lfSB3aWxsIGZhbGwgb3ZlciAke2R1cmF0aW9ufXMuYCwgJ3N1Y2Nlc3MnKTtcblx0fSBlbHNlIHtcblx0XHR0aW1lbGluZVN0b3JlLmFkZEtleWZyYW1lKHRhcmdldC5pZCwgc3RhcnQpO1xuXHRcdHRpbWVsaW5lU3RvcmUuYWRkS2V5ZnJhbWUodGFyZ2V0LmlkLCB7XG5cdFx0XHQuLi5zdGFydCxcblx0XHRcdHRpbWU6IGR1cmF0aW9uLFxuXHRcdFx0cm90YXRpb246IFtzdGFydC5yb3RhdGlvblswXSwgc3RhcnQucm90YXRpb25bMV0gKyBNYXRoLlBJLCBzdGFydC5yb3RhdGlvblsyXV0sXG5cdFx0fSk7XG5cdFx0cmVwb3J0KGBBbmltYXRlZCAke3RhcmdldC5uYW1lfSBvdmVyICR7ZHVyYXRpb259cy5gLCAnc3VjY2VzcycpO1xuXHR9XG5cdHRpbWVsaW5lU3RvcmUuc2V0RHVyYXRpb24oTWF0aC5tYXgoZHVyYXRpb24sIGdldCh0aW1lbGluZVN0b3JlKS5kdXJhdGlvbikpO1xuXHR0aW1lbGluZVN0b3JlLnNldFBsYXlpbmcodHJ1ZSk7XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBydW5Db21tYW5kKHJhdzogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IHRleHQgPSByYXcudHJpbSgpO1xuXHRjb25zdCB3b3JkcyA9IHRleHQudG9Mb3dlckNhc2UoKTtcblx0aWYgKCF0ZXh0KSByZXR1cm47XG5cblx0aWYgKC9cXGIoaGVscHxjb21tYW5kcylcXGIvLnRlc3Qod29yZHMpKSB7XG5cdFx0cmVwb3J0KCdUcnk6IGFkZCBjdWJlLCBhZGQgMyByZWQgc3BoZXJlcywgc2VsZWN0IEN1YmUsIG1vdmUgdG8gMiAwIDAsIHNwaW4sIGRyb3AsIHBsYXksIHVuZG8uJywgJ2luZm8nKTtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKC9cXGIodW5kbylcXGIvLnRlc3Qod29yZHMpKSB7XG5cdFx0c2NlbmVTdG9yZS51bmRvKCk7XG5cdFx0cmVwb3J0KCdVbmRvLicsICdzdWNjZXNzJyk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmICgvXFxiKHJlZG8pXFxiLy50ZXN0KHdvcmRzKSkge1xuXHRcdHNjZW5lU3RvcmUucmVkbygpO1xuXHRcdHJlcG9ydCgnUmVkby4nLCAnc3VjY2VzcycpO1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoL1xcYihjbGVhcnxyZXNldClcXGIvLnRlc3Qod29yZHMpICYmICEvXFxiKHJlc2V0IHNjb3JlKVxcYi8udGVzdCh3b3JkcykpIHtcblx0XHRzY2VuZVN0b3JlLmNsZWFyKCk7XG5cdFx0dGltZWxpbmVTdG9yZS5jbGVhcktleWZyYW1lcygpO1xuXHRcdHJlcG9ydCgnU2NlbmUgY2xlYXJlZC4gVW5kbyBpcyBhdmFpbGFibGUuJywgJ3N1Y2Nlc3MnKTtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKC9cXGIocmVzZXQgc2NvcmV8c2NvcmUgcmVzZXQpXFxiLy50ZXN0KHdvcmRzKSkge1xuXHRcdHNjZW5lU3RvcmUucmVzZXRTY29yZSgpO1xuXHRcdHJlcG9ydCgnU2NvcmUgcmVzZXQuJywgJ3N1Y2Nlc3MnKTtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKC9cXGIocGxheSBnYW1lfGdhbWUgbW9kZXxzdGFydCBnYW1lKVxcYi8udGVzdCh3b3JkcykpIHtcblx0XHRjb25zdCBzdGF0ZSA9IGdldChzY2VuZVN0b3JlKTtcblx0XHRpZiAoIXN0YXRlLmdhbWVNb2RlKSBzY2VuZVN0b3JlLnRvZ2dsZUdhbWVNb2RlKCk7XG5cdFx0cmVwb3J0KCdHYW1lIG1vZGUgb24uIFVzZSBhcnJvdyBrZXlzIG9yIHRoZSBvbi1zY3JlZW4gcGFkLicsICdzdWNjZXNzJyk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmICgvXFxiKHN0b3AgZ2FtZXxleGl0IGdhbWV8ZW5kIGdhbWUpXFxiLy50ZXN0KHdvcmRzKSkge1xuXHRcdGNvbnN0IHN0YXRlID0gZ2V0KHNjZW5lU3RvcmUpO1xuXHRcdGlmIChzdGF0ZS5nYW1lTW9kZSkgc2NlbmVTdG9yZS50b2dnbGVHYW1lTW9kZSgpO1xuXHRcdHNjZW5lU3RvcmUucmVzZXRHYW1lSW5wdXQoKTtcblx0XHRyZXBvcnQoJ0dhbWUgbW9kZSBvZmYuJywgJ3N1Y2Nlc3MnKTtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKC9cXGIocGxheXxzdGFydClcXGIvLnRlc3Qod29yZHMpICYmICEvXFxiKHBsYXkgZ2FtZSlcXGIvLnRlc3Qod29yZHMpKSB7XG5cdFx0dGltZWxpbmVTdG9yZS5zZXRTaG93KHRydWUpO1xuXHRcdHRpbWVsaW5lU3RvcmUuc2V0UGxheWluZyh0cnVlKTtcblx0XHRyZXBvcnQoJ1BsYXlpbmcgdGltZWxpbmUuJywgJ3N1Y2Nlc3MnKTtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKC9cXGIocGF1c2V8c3RvcClcXGIvLnRlc3Qod29yZHMpKSB7XG5cdFx0dGltZWxpbmVTdG9yZS5zZXRQbGF5aW5nKGZhbHNlKTtcblx0XHRyZXBvcnQoJ1RpbWVsaW5lIHBhdXNlZC4nLCAnc3VjY2VzcycpO1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoL1xcYihhZGQga2V5fGtleWZyYW1lKVxcYi8udGVzdCh3b3JkcykpIHtcblx0XHRjb25zdCB0YXJnZXQgPSByZXNvbHZlVGFyZ2V0KHRleHQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXBvcnQoJ1NlbGVjdCBhbiBvYmplY3QgYmVmb3JlIGFkZGluZyBhIGtleWZyYW1lLicsICd3YXJuaW5nJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRpbWUgPSBnZXQodGltZWxpbmVTdG9yZSkuY3VycmVudFRpbWU7XG5cdFx0dGltZWxpbmVTdG9yZS5hZGRLZXlmcmFtZSh0YXJnZXQuaWQsIHtcblx0XHRcdHRpbWUsXG5cdFx0XHRwb3NpdGlvbjogWy4uLnRhcmdldC5wb3NpdGlvbl0gYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuXHRcdFx0cm90YXRpb246IFsuLi50YXJnZXQucm90YXRpb25dIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcblx0XHRcdHNjYWxlOiBbLi4udGFyZ2V0LnNjYWxlXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG5cdFx0fSk7XG5cdFx0cmVwb3J0KGBLZXlmcmFtZSBhZGRlZCBmb3IgJHt0YXJnZXQubmFtZX0gYXQgJHt0aW1lLnRvRml4ZWQoMil9cy5gLCAnc3VjY2VzcycpO1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoL1xcYihkZWxldGV8cmVtb3ZlKVxcYi8udGVzdCh3b3JkcykpIHtcblx0XHRjb25zdCB0YXJnZXQgPSBmaW5kT2JqZWN0QnlOYW1lKHRleHQpO1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdHNjZW5lU3RvcmUuZGVsZXRlT2JqZWN0KHRhcmdldC5pZCk7XG5cdFx0XHR0aW1lbGluZVN0b3JlLnJlbW92ZUtleWZyYW1lc0Zvcih0YXJnZXQuaWQpO1xuXHRcdFx0cmVwb3J0KGBEZWxldGVkICR7dGFyZ2V0Lm5hbWV9LmAsICdzdWNjZXNzJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNjZW5lU3RvcmUuZGVsZXRlU2VsZWN0ZWQoKTtcblx0XHRyZXBvcnQoJ0RlbGV0ZWQgc2VsZWN0ZWQgb2JqZWN0LicsICdzdWNjZXNzJyk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmICgvXFxiKHNlbGVjdClcXGIvLnRlc3Qod29yZHMpKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZmluZE9iamVjdEJ5TmFtZSh0ZXh0KTtcblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRzY2VuZVN0b3JlLnNlbGVjdE9iamVjdCh0YXJnZXQuaWQpO1xuXHRcdFx0cmVwb3J0KGBTZWxlY3RlZCAke3RhcmdldC5uYW1lfS5gLCAnc3VjY2VzcycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXBvcnQoJ05vIG1hdGNoaW5nIG9iamVjdC4gQ2hlY2sgdGhlIG91dGxpbmVyIGZvciBuYW1lcy4nLCAnd2FybmluZycpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKC9cXGIoY29sb3J8cGFpbnR8bWFrZS4qKHJlZHxibHVlfGdyZWVufHllbGxvd3xwdXJwbGV8cGlua3x3aGl0ZXxibGFjaykpXFxiLy50ZXN0KHdvcmRzKSkge1xuXHRcdGNvbnN0IHRhcmdldCA9IHJlc29sdmVUYXJnZXQodGV4dCk7XG5cdFx0Y29uc3QgY29sb3IgPSBwYXJzZUNvbG9yKHRleHQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXBvcnQoJ1NlbGVjdCBhbiBvYmplY3QgYmVmb3JlIGNoYW5naW5nIGl0cyBjb2xvci4nLCAnd2FybmluZycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWNvbG9yKSB7XG5cdFx0XHRyZXBvcnQoJ0kgY291bGQgbm90IGZpbmQgYSBjb2xvciBuYW1lIGluIHRoYXQgcmVxdWVzdC4nLCAnd2FybmluZycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzY2VuZVN0b3JlLnNldENvbG9yKHRhcmdldC5pZCwgY29sb3IpO1xuXHRcdHJlcG9ydChgQ29sb3JlZCAke3RhcmdldC5uYW1lfS5gLCAnc3VjY2VzcycpO1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoL1xcYihtb3ZlfHRyYW5zbGF0ZSlcXGIvLnRlc3Qod29yZHMpKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gcmVzb2x2ZVRhcmdldCh0ZXh0KTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmVwb3J0KCdTZWxlY3QgYW4gb2JqZWN0IGJlZm9yZSBtb3ZpbmcgaXQuJywgJ3dhcm5pbmcnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbnVtYmVycyA9IHBhcnNlTnVtYmVycyh3b3Jkcyk7XG5cdFx0aWYgKCFudW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0cmVwb3J0KCdHaXZlIG1lIGEgcG9zaXRpb24sIGZvciBleGFtcGxlOiBtb3ZlIHRvIDIgMCAwLicsICd3YXJuaW5nJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gL2J5XFxiLy50ZXN0KHdvcmRzKSAmJiBudW1iZXJzLmxlbmd0aCA+PSAzXG5cdFx0XHQ/IFt0YXJnZXQucG9zaXRpb25bMF0gKyBudW1iZXJzWzBdLCB0YXJnZXQucG9zaXRpb25bMV0gKyBudW1iZXJzWzFdLCB0YXJnZXQucG9zaXRpb25bMl0gKyBudW1iZXJzWzJdXSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl1cblx0XHRcdDogdmVjdG9yRnJvbShudW1iZXJzLCB0YXJnZXQucG9zaXRpb24pO1xuXHRcdHNjZW5lU3RvcmUuc2V0VHJhbnNmb3JtKHRhcmdldC5pZCwgeyBwb3NpdGlvbiB9KTtcblx0XHRyZXBvcnQoYE1vdmVkICR7dGFyZ2V0Lm5hbWV9LmAsICdzdWNjZXNzJyk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmICgvXFxiKHJvdGF0ZXx0dXJuKVxcYi8udGVzdCh3b3JkcykpIHtcblx0XHRjb25zdCB0YXJnZXQgPSByZXNvbHZlVGFyZ2V0KHRleHQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXBvcnQoJ1NlbGVjdCBhbiBvYmplY3QgYmVmb3JlIHJvdGF0aW5nIGl0LicsICd3YXJuaW5nJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG51bWJlcnMgPSBwYXJzZU51bWJlcnMod29yZHMpO1xuXHRcdGNvbnN0IHJhZGlhbnMgPSAobnVtYmVycy5sZW5ndGggPj0gMyA/IG51bWJlcnMgOiBbMCwgNDUsIDBdKS5tYXAoKHZhbHVlKSA9PiAodmFsdWUgKiBNYXRoLlBJKSAvIDE4MCk7XG5cdFx0c2NlbmVTdG9yZS5zZXRUcmFuc2Zvcm0odGFyZ2V0LmlkLCB7XG5cdFx0XHRyb3RhdGlvbjogW3RhcmdldC5yb3RhdGlvblswXSArIHJhZGlhbnNbMF0sIHRhcmdldC5yb3RhdGlvblsxXSArIHJhZGlhbnNbMV0sIHRhcmdldC5yb3RhdGlvblsyXSArIHJhZGlhbnNbMl1dLFxuXHRcdH0pO1xuXHRcdHJlcG9ydChgUm90YXRlZCAke3RhcmdldC5uYW1lfS5gLCAnc3VjY2VzcycpO1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoL1xcYihzY2FsZXxyZXNpemV8c2l6ZSlcXGIvLnRlc3Qod29yZHMpKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gcmVzb2x2ZVRhcmdldCh0ZXh0KTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmVwb3J0KCdTZWxlY3QgYW4gb2JqZWN0IGJlZm9yZSBzY2FsaW5nIGl0LicsICd3YXJuaW5nJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG51bWJlcnMgPSBwYXJzZU51bWJlcnMod29yZHMpO1xuXHRcdGNvbnN0IGZhY3RvciA9IG51bWJlcnNbMF0gJiYgbnVtYmVyc1swXSA+IDAgPyBudW1iZXJzWzBdIDogMS4yNTtcblx0XHRzY2VuZVN0b3JlLnNldFRyYW5zZm9ybSh0YXJnZXQuaWQsIHsgc2NhbGU6IFt0YXJnZXQuc2NhbGVbMF0gKiBmYWN0b3IsIHRhcmdldC5zY2FsZVsxXSAqIGZhY3RvciwgdGFyZ2V0LnNjYWxlWzJdICogZmFjdG9yXSB9KTtcblx0XHRyZXBvcnQoYFNjYWxlZCAke3RhcmdldC5uYW1lfS5gLCAnc3VjY2VzcycpO1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoYW5pbWF0ZUNvbW1hbmQodGV4dCkpIHJldHVybjtcblx0aWYgKGFkZFByaW1pdGl2ZUNvbW1hbmQodGV4dCkpIHJldHVybjtcblx0cmVwb3J0KCdJIGRpZCBub3QgdW5kZXJzdGFuZCB0aGF0LiBUeXBlIFwiaGVscFwiIGZvciBleGFtcGxlIGNvbW1hbmRzLicsICd3YXJuaW5nJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRvb2xTdG9yZSgpIHtcblx0Y29uc3QgeyBzdWJzY3JpYmUsIHNldCwgdXBkYXRlIH0gPSB3cml0YWJsZTxUb29sU3RhdGU+KGluaXRpYWxTdGF0ZSk7XG5cblx0cmV0dXJuIHtcblx0XHRzdWJzY3JpYmUsXG5cdFx0c2V0LFxuXHRcdHNldFRvb2w6ICh0b29sOiBzdHJpbmcpID0+IHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdHN0YXRlLmN1cnJlbnQgPSB0b29sO1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH0pLFxuXHRcdC8qKiBQYW5zIHRoZSB2aWV3cG9ydCwgdXNlZnVsIG9uIGEgdG91Y2ggc2NyZWVuLiAqL1xuXHRcdHNldFBhbjogKCkgPT4gdXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0c3RhdGUuY3VycmVudCA9ICdwYW4nO1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH0pLFxuXHRcdHRvZ2dsZVNuYXA6ICgpID0+IHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdHN0YXRlLnNuYXAgPSAhc3RhdGUuc25hcDtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9KSxcblx0XHRzZXRTcGFjZTogKHNwYWNlOiBUb29sU3RhdGVbJ3NwYWNlJ10pID0+IHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdHN0YXRlLnNwYWNlID0gc3BhY2U7XG5cdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0fSksXG5cdFx0c2V0UGl2b3Q6IChwaXZvdDogVG9vbFN0YXRlWydwaXZvdCddKSA9PiB1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRzdGF0ZS5waXZvdCA9IHBpdm90O1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH0pLFxuXHRcdHNldEFnZW50UHJvbXB0OiAocHJvbXB0OiBzdHJpbmcpID0+IHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdHN0YXRlLmFnZW50UHJvbXB0ID0gcHJvbXB0O1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH0pLFxuXHRcdHNldEN1dE1vZGU6IChtb2RlOiAnc3BsaXQnIHwgJ21hcmsnKSA9PiB1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRzdGF0ZS5jdXRNb2RlID0gbW9kZTtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9KSxcblx0XHRzZXRTZWxlY3Rpb25Nb2RlOiAobW9kZTogJ3NpbmdsZScgfCAnYm94JyB8ICdsYXNzbycpID0+IHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdHN0YXRlLnNlbGVjdGlvbk1vZGUgPSBtb2RlO1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH0pLFxuXHRcdHNldEF4aXNDb25zdHJhaW50OiAoYXhpczogJ2FsbCcgfCAneCcgfCAneScgfCAneicpID0+IHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdHN0YXRlLmF4aXNDb25zdHJhaW50ID0gYXhpcztcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9KSxcblx0XHRzZXRVbmlmb3JtU2NhbGU6ICh1bmlmb3JtOiBib29sZWFuKSA9PiB1cGRhdGUoKHN0YXRlKSA9PiB7XG5cdFx0XHRzdGF0ZS51bmlmb3JtU2NhbGUgPSB1bmlmb3JtO1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH0pLFxuXHRcdHNldEFjdGl2ZVBhcmFtVG9vbDogKHRvb2w6IHN0cmluZyB8IG51bGwpID0+IHVwZGF0ZSgoc3RhdGUpID0+IHtcblx0XHRcdHN0YXRlLmFjdGl2ZVBhcmFtVG9vbCA9IHRvb2w7XG5cdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0fSksXG5cdFx0c2V0VG9vbFBhcmFtOiAodG9vbDogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4gdXBkYXRlKChzdGF0ZSkgPT4ge1xuXHRcdFx0aWYgKCFzdGF0ZS50b29sUGFyYW1zW3Rvb2xdKSBzdGF0ZS50b29sUGFyYW1zW3Rvb2xdID0ge307XG5cdFx0XHRzdGF0ZS50b29sUGFyYW1zW3Rvb2xdW2tleV0gPSB2YWx1ZTtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9KSxcblx0XHRydW5BZ2VudDogKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBnZXQodG9vbFN0b3JlKTtcblx0XHRcdGNvbnN0IHByb21wdCA9IHN0YXRlLmFnZW50UHJvbXB0LnRyaW0oKTtcblx0XHRcdGlmICghcHJvbXB0KSB7XG5cdFx0XHRcdHJlcG9ydCgnRGVzY3JpYmUgd2hhdCB0byBidWlsZCBvciBhbmltYXRlIGZpcnN0LicsICd3YXJuaW5nJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJ1bkNvbW1hbmQocHJvbXB0KTtcblx0XHRcdHVwZGF0ZSgoY3VycmVudCkgPT4ge1xuXHRcdFx0XHRjdXJyZW50LmFnZW50UHJvbXB0ID0gJyc7XG5cdFx0XHRcdHJldHVybiBjdXJyZW50O1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRydW5Db21tYW5kOiAoY29tbWFuZDogc3RyaW5nKSA9PiBydW5Db21tYW5kKGNvbW1hbmQpLFxuXHRcdHVuZG86ICgpID0+IHNjZW5lU3RvcmUudW5kbygpLFxuXHRcdHJlZG86ICgpID0+IHNjZW5lU3RvcmUucmVkbygpLFxuXHR9O1xufVxuXG5leHBvcnQgY29uc3QgdG9vbFN0b3JlID0gY3JlYXRlVG9vbFN0b3JlKCk7XG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsUUFBUSxFQUFFLEdBQUcsUUFBUSxjQUFjO0FBQzVDLFNBQVMsVUFBVSxFQUFFLFVBQVUsUUFBUSxTQUFTO0FBQ2hELFNBQVMsYUFBYSxRQUFRLFlBQVk7QUFDMUMsU0FBUyxPQUFPLFFBQVEsTUFBTTtBQWlCOUIsTUFBTSxZQUF1QixHQUFHO0VBQy9CLE9BQU8sRUFBRSxNQUFNO0VBQ2YsSUFBSSxFQUFFLEtBQUs7RUFDWCxLQUFLLEVBQUUsT0FBTztFQUNkLEtBQUssRUFBRSxRQUFRO0VBQ2YsV0FBVyxFQUFFLEVBQUU7RUFDZixPQUFPLEVBQUUsT0FBTztFQUNoQixhQUFhLEVBQUUsUUFBUTtFQUN2QixjQUFjLEVBQUUsS0FBSztFQUNyQixZQUFZLEVBQUUsSUFBSTtFQUNsQixlQUFlLEVBQUUsSUFBSTtFQUNyQixVQUFVLEVBQUU7SUFDWCxPQUFPLEVBQUU7TUFBRSxNQUFNLEVBQUU7SUFBSyxDQUFDO0lBQ3pCLEtBQUssRUFBRTtNQUFFLE1BQU0sRUFBRSxJQUFJO01BQUUsUUFBUSxFQUFFO0lBQUUsQ0FBQztJQUNwQyxPQUFPLEVBQUU7TUFBRSxNQUFNLEVBQUU7SUFBRSxDQUFDO0lBQ3RCLEtBQUssRUFBRTtNQUFFLE1BQU0sRUFBRTtJQUFLLENBQUM7SUFDdkIsUUFBUSxFQUFFO01BQUUsS0FBSyxFQUFFO0lBQUksQ0FBQztJQUN4QixRQUFRLEVBQUU7TUFBRSxNQUFNLEVBQUU7SUFBSyxD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