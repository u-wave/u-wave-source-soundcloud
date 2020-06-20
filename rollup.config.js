import typescript from 'rollup-plugin-typescript2';
import nodeResolve from '@rollup/plugin-node-resolve';
import isBuiltinModule from 'is-builtin-module';

const pkg = require('./package.json');

const external = Object.keys(pkg.dependencies);

export default {
  input: 'src/index.ts',
  output: [{
    file: pkg.main,
    exports: 'default',
    format: 'cjs',
    sourcemap: true,
  }, {
    file: pkg.module,
    format: 'es',
    sourcemap: true,
  }],
  external: (id) => isBuiltinModule(id) || external.some((m) => id.split('/')[0] === m),
  plugins: [
    typescript(),
    nodeResolve(),
  ],
};
