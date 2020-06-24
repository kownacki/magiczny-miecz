import resolve from 'rollup-plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import {terser} from 'rollup-plugin-terser';

export default [{
  input: 'utils/lodashBundle.js',
  output: {
    file: 'resources/scripts/lodashBundle.js',
    format: 'module',
  },
  plugins: [
    resolve(),
    commonjs(),
    terser(),
  ],
}];
