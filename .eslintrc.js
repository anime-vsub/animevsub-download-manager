module.exports = {
  // https://eslint.org/docs/user-guide/configuring#configuration-cascading-and-hierarchy
  // This option interrupts the configuration hierarchy at this file
  // Remove this if you have an higher level ESLint config file (it usually happens into a monorepos)
  root: true,

  // https://eslint.vuejs.org/user-guide/#how-to-use-a-custom-parser
  // Must use parserOptions instead of "parser" to allow vue-eslint-parser to keep working
  // `parser: 'vue-eslint-parser'` is already included with any 'plugin:vue/**' config and should be omitted
  parserOptions: {
    parser: require.resolve("@typescript-eslint/parser"),
    project: "tsconfig.json",
    ecmaVersion: "latest",
    sourceType: "module"
  },

  env: {
    browser: true,
    es2022: true,
    node: true,
    "vue/setup-compiler-macros": true
  },

  // Rules order is important, please avoid shuffling them
  extends: [
    // Base ESLint recommended rules
    // 'eslint:recommended',

    // https://github.com/typescript-eslint/typescript-eslint/tree/master/packages/eslint-plugin#usage
    // ESLint typescript rules
    "plugin:@typescript-eslint/recommended",
    "@tachibana-shin/eslint-config",
    // https://github.com/prettier/eslint-config-prettier#installation
    // usage with Prettier, provided by 'eslint-config-prettier'.
    "prettier",
    "plugin:oxlint/recommended"
  ],

  plugins: [
    // required to apply rules which need type information
    "@typescript-eslint",
    "eslint-plugin-oxlint"
  ],

  // add your custom rules here
  rules: {
    "prefer-promise-reject-errors": "off",

    quotes: ["warn", "double", { avoidEscape: true }],

    // this rule, if on, would require explicit return type on the `render` function
    "@typescript-eslint/explicit-function-return-type": "off",

    // in plain CommonJS modules, you can't use `import foo = require('foo')` to pass this rule, so it has to be disabled
    "@typescript-eslint/no-var-requires": "off",

    // The core 'no-unused-vars' rules (in the eslint:recommended ruleset)
    // does not work with type definitions
    "no-unused-vars": "off",

    // allow debugger during development only
    "no-debugger": process.env.NODE_ENV === "production" ? "error" : "off",
    "n/no-unpublished-import": "off",
    "functional/immutable-data": "off",
    "vue/multi-word-component-names": "off",
    "eslint-comments/no-unlimited-disable": "off",
    "vue/no-use-v-if-with-v-for": "off",
    "functional/prefer-immutable-types": "off",
    "@typescript-eslint/space-before-blocks": "off",
    "no-undef": "off",
    "functional/no-let": "off",
    "vue/valid-v-for": "off",
    "functional/no-loop-statements": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/no-floating-promises": "error",
    "n/no-unsupported-features/node-builtins": "off",
    "no-void": [
      "error",
      {
        allowAsStatement: true
      }
    ]
  }
}
