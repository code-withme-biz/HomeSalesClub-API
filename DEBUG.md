## Debugging api with VSCode

Added two VS Code configs for debugging:

- "Launch Backend Debug" to start the backend in debug mode
- "Launch Civil Tester Debug" to start the civil tester in debug mode
Put breakpoints with f5 and start in debug mode with F5.

The launch.json also contains a commented preLaunchTask, uncomment if you want to compile before starting debugging.

### Build for debug

```
npm run build:dev
```

### Watch

Incremental building was enabled to quickly recompile if source code is modified. Run:
```
npm run watch
```
and leave it running on console. It will automatically rebuild when code changed.
