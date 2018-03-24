üWave SoundCloud Media Source
=============================

[![Greenkeeper badge](https://badges.greenkeeper.io/u-wave/u-wave-source-soundcloud.svg)](https://greenkeeper.io/)

A üWave media source for searching songs from SoundCloud.

## Installation

```
npm install --save u-wave-source-soundcloud
```

## Usage

```js
import uwave from 'u-wave-core';
import soundCloudSource from 'u-wave-source-soundcloud';

const uw = uwave({ /* your config */ });

uw.source('soundcloud', soundCloudSource, {
  // Get an API key by registering an app here:
  // http://soundcloud.com/you/apps
  key: 'Your SoundCloud API Key'
});
```

## License

[MIT](./LICENSE)
