import copy from 'rollup-plugin-copy';
import del from 'rollup-plugin-delete';
import resolve from 'rollup-plugin-node-resolve';
import {terser} from 'rollup-plugin-terser';
import minifyHTML from 'rollup-plugin-minify-html-literals';
import {namePrefix} from '../config.js';

export default [{
  input: `src/${namePrefix}-app.js`,
  output: {
    dir: 'dist/src',
    format: 'module',
  },
  plugins: [
    del({targets: 'dist'}),
    copy({
      targets: [
        {src: 'index.html', dest: 'dist'},
        {src: 'index.html', dest: 'dist', rename: '404.html'},
        {src: 'resources', dest: 'dist'},
        {src: 'node_modules/@ckeditor', dest: 'dist/node_modules'},
      ],
    }),
    resolve(),
    minifyHTML(),
    terser(),
  ],
  manualChunks(id) {
    if (id.includes('@material') || id.includes('lit-element')) {
      return 'elements';
    }
  }
}, {
  input: 'src/styles/shared-styles.js',
  output: {
    file: 'dist/src/styles/shared-styles.js',
    format: 'module',
  },
  plugins: [
    resolve(),
    minifyHTML(),
    terser(),
  ],
}];
