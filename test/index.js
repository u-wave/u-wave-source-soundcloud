import promisifyTape from 'tape-promise';
import tape from 'tape';
import nock from 'nock';
import path from 'path';
import fs from 'fs';
import soundCloudSource from '../src';

const test = promisifyTape(tape);

const FAKE_KEY = 'da5ad14e8278aedac18ba470373c7634';

const createSource = () => soundCloudSource({}, { key: FAKE_KEY });

const API_HOST = 'https://api.soundcloud.com';

const fixture = name => path.join(__dirname, 'responses', `${name}.json`);

test('providing a key is required', (t) => {
  t.throws(
    () => soundCloudSource({}),
    /Expected a SoundCloud API key/,
  );

  t.end();
});

test('searching for videos', async (t) => {
  const src = createSource();

  nock(API_HOST).get('/tracks')
    .query(true)
    .replyWithFile(200, fixture('search'));

  const results = await src.search('oceanfromtheblue');

  t.is(results.length, 10);

  results.forEach((item) => {
    t.true('artist' in item);
    t.true('title' in item);
  });

  t.end();
});

test('get videos by id', async (t) => {
  const src = createSource();

  nock(API_HOST).get('/tracks')
    .query(true)
    .reply(200, () => [
      JSON.parse(fs.readFileSync(fixture('track.389870604'), 'utf8')),
      JSON.parse(fs.readFileSync(fixture('track.346713308'), 'utf8')),
    ]);

  const items = await src.get(['389870604', '346713308']);

  t.is(items.length, 2);

  t.is(items[0].artist, 'oceanfromtheblue(오션)');
  t.is(items[1].artist, 'slchld');

  t.end();
});
