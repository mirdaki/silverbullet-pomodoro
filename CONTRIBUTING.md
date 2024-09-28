# Contributing 

## Build
To build this plug, make sure you have [SilverBullet installed with Deno](https://silverbullet.md/Install/Deno). Then, build the plug with:

```shell
deno task build
```

Or to watch for changes and rebuild automatically

```shell
deno task watch
```

Or to do a debug build and generate a sourcemap

```shell
deno task debug-build
```

Then, copy the resulting `.plug.js` file into your space's `_plug` folder. Or build and copy in one command:

```shell
deno task build && cp *.plug.js /my/space/_plug/
```

SilverBullet will automatically sync and load the new version of the plug, just watch the logs (browser and server) to see when this happens.
