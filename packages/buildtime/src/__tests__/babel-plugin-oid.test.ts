import { describe, it, expect } from 'bun:test';
import { transformSync } from '@babel/core';
import { babelPluginOid } from '../babel-plugin-oid.js';

function transform(code: string, filename = '/project/src/App.tsx'): string {
  const result = transformSync(code, {
    filename,
    plugins: [
      ['@babel/plugin-syntax-typescript', { isTSX: true }],
      [babelPluginOid, { root: '/project' }],
    ],
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
  });
  return result?.code ?? '';
}

describe('babelPluginOid', () => {
  it('injects oid attribute on JSX elements', () => {
    const code = `<h1>Hello</h1>`;
    const result = transform(code);
    expect(result).toContain('oid="src/App.tsx:1:1"');
  });

  it('handles nested elements', () => {
    const code = `<div><span>Text</span></div>`;
    const result = transform(code);
    expect(result).toContain('oid="src/App.tsx:1:1"'); // div
    expect(result).toContain('oid="src/App.tsx:1:6"'); // span
  });

  it('preserves existing attributes', () => {
    const code = `<button className="btn">Click</button>`;
    const result = transform(code);
    expect(result).toContain('className="btn"');
    expect(result).toContain('oid="src/App.tsx:1:1"');
  });

  it('does not add duplicate oid if already present', () => {
    const code = `<h1 oid="existing">Hello</h1>`;
    const result = transform(code);
    expect(result).toContain('oid="existing"');
    expect(result).not.toContain('oid="src/App.tsx');
  });

  it('handles self-closing elements', () => {
    const code = `<img src="test.png" />`;
    const result = transform(code);
    expect(result).toContain('oid="src/App.tsx:1:1"');
  });

  it('handles components with PascalCase names', () => {
    const code = `<MyComponent prop="value" />`;
    const result = transform(code);
    expect(result).toContain('oid="src/App.tsx:1:1"');
  });

  it('handles multiline JSX correctly', () => {
    const code = `
function App() {
  return (
    <div>
      <h1>Title</h1>
    </div>
  );
}`;
    const result = transform(code);
    // div is on line 4, column 5
    expect(result).toContain('oid="src/App.tsx:4:5"');
    // h1 is on line 5, column 7
    expect(result).toContain('oid="src/App.tsx:5:7"');
  });

  it('handles relative paths correctly', () => {
    const result = transformSync(`<h1>Hello</h1>`, {
      filename: '/project/src/components/Button.tsx',
      plugins: [
        ['@babel/plugin-syntax-typescript', { isTSX: true }],
        [babelPluginOid, { root: '/project' }],
      ],
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
    });
    // Should create proper relative path
    expect(result?.code).toContain('oid="src/components/Button.tsx:1:1"');
  });

  it('handles JSX fragments', () => {
    const code = `<><h1>A</h1><h2>B</h2></>`;
    const result = transform(code);
    // Fragments themselves don't get oid (they're not elements), but children do
    expect(result).toContain('oid="src/App.tsx:1:3"'); // h1
    expect(result).toContain('oid="src/App.tsx:1:13"'); // h2
  });

  it('handles expressions in JSX', () => {
    const code = `<div>{items.map(item => <span key={item.id}>{item.name}</span>)}</div>`;
    const result = transform(code);
    expect(result).toContain('oid="src/App.tsx:1:1"'); // div
    expect(result).toContain('oid="src/App.tsx:1:25"'); // span
  });
});
