import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";
import importPlugin from "eslint-plugin-import";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";

const sharedRules = {
    ...reactPlugin.configs.recommended.rules,
    ...reactHooksPlugin.configs.recommended.rules,
    ...nextPlugin.configs.recommended.rules,
    "import/no-anonymous-default-export": "warn",
    "react/no-unknown-property": "off",
    "react/prop-types": "off",
    "react/react-in-jsx-scope": "off",
    "react/jsx-no-target-blank": "off",
    "jsx-a11y/alt-text": [
        "warn",
        {
            elements: ["img"],
            img: ["Image"],
        },
    ],
    "jsx-a11y/aria-props": "warn",
    "jsx-a11y/aria-proptypes": "warn",
    "jsx-a11y/aria-unsupported-elements": "warn",
    "jsx-a11y/role-has-required-aria-props": "warn",
    "jsx-a11y/role-supports-aria-props": "warn",
};

const sharedConfig = {
    languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        globals: {
            ...globals.browser,
            ...globals.node,
        },
    },
    plugins: {
        "@next/next": nextPlugin,
        "jsx-a11y": jsxA11yPlugin,
        "react-hooks": reactHooksPlugin,
        react: reactPlugin,
        import: importPlugin,
    },
    settings: {
        react: {
            version: "detect",
        },
    },
    rules: sharedRules,
};

export default defineConfig([
    globalIgnores([
        "node_modules/**",
        ".next/**",
        "out/**",
        "target/**",
        "target-*/**",
        "src-tauri/target*/**",
    ]),
    {
        ...sharedConfig,
        files: ["**/*.{js,jsx,mjs,cjs}"],
        languageOptions: {
            ...sharedConfig.languageOptions,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
    },
    {
        ...sharedConfig,
        files: ["**/*.{ts,tsx,mts,cts}"],
        languageOptions: {
            ...sharedConfig.languageOptions,
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
    },
]);
