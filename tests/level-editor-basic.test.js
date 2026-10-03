/**
 * LevelEditor 基础加载测试（W-B11）。
 * 仅验证模块能正常 import、实例化、切换启用状态，不涉及完整 UI 交互。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { LevelEditor } from '../src/world/LevelEditor.js';

beforeAll(() => {
  // 简易 window/document 模拟
  global.window = {
    document: {
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: (tag) => {
        const el = { 
          style: {}, 
          innerHTML: '', 
          querySelector: () => ({ addEventListener: () => {}, value: '' }),
          addEventListener: () => {},
          appendChild: () => {},
          remove: () => {}
        };
        if (tag === 'select') el.value = '';
        return el;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  };
  global.document = global.window.document;
});

afterAll(() => {
  delete global.window;
  delete global.document;
});

describe('LevelEditor 基础加载', () => {
  it('能被 import 且暴露 LevelEditor 类', () => {
    expect(LevelEditor).toBeDefined();
    expect(typeof LevelEditor).toBe('function');
  });

  it('可实例化且不抛错', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const renderer = { dispose: () => {}, domElement: { addEventListener: () => {} } };
    const canvas = { addEventListener: () => {}, getContext: () => ({}) };
    
    const editor = new LevelEditor(scene, camera, renderer, canvas);
    expect(editor).toBeInstanceOf(LevelEditor);
    expect(editor.enabled).toBe(false);
    
    editor.dispose();
  });

  it('toggle() 能切换启用状态', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const renderer = { dispose: () => {}, domElement: { addEventListener: () => {} } };
    const canvas = { addEventListener: () => {}, getContext: () => ({}) };
    
    const editor = new LevelEditor(scene, camera, renderer, canvas);
    
    editor.toggle();
    expect(editor.enabled).toBe(true);
    
    editor.toggle();
    expect(editor.enabled).toBe(false);
    
    editor.dispose();
  });
});