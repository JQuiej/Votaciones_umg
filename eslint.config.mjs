import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    "rules": {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      // Desactiva la regla de "no-unused-vars" (variables no usadas)
    "@typescript-eslint/no-unused-vars": "off", 
    // Desactiva la regla de "no-explicit-any" (uso de tipo 'any')
    "@typescript-eslint/no-explicit-any": "off", 
    // Desactiva la regla de 'no-img-element' (uso de <img> en lugar de <Image>)
    "@next/next/no-img-element": "off" 
    }
  }
];

export default eslintConfig;