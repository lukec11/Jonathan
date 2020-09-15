module.exports = {
  env: {
    commonjs: false,
    es2021: true,
    node: true
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    'no-prototype-builtins': 'off'
  }
};
