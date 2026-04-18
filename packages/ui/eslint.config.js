import path from "node:path"

export default [
  {
    languageOptions: {
      parserOptions: {
        project: true, // or ["./tsconfig.json"]
        tsconfigRootDir: path.resolve(__dirname),
      },
    },
  },
]
