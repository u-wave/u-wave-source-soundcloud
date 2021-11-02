const promisifyTape = require('tape-promise').default;
const tape = require('tape');
const nock = require('nock');
const path = require('path');
const fs = require('fs');
const soundCloudSource = require('..');

const test = promisifyTape(tape);

const FAKE_V1_KEY = 'da5ad14e8278aedac18ba470373c7634';
const FAKE_V2_KEY = 'YxQYlFPNletSMSZ4b8Svv9FTYgbNbM79';

const createSourceV1 = () => soundCloudSource({}, { key: FAKE_V1_KEY });
const createSourceV2 = () => soundCloudSource({});

const WEB_HOST = 'https://soundcloud.com';
const API_V1_HOST = 'https://api.soundcloud.com';
const API_V2_HOST = 'https://api-v2.soundcloud.com';

const fixture = (name) => path.join(__dirname, 'responses', `${name}.json`);

test('v1', ({ test }) => {
  test('searching for videos', async (t) => {
    const src = createSourceV1();

    nock(API_V1_HOST).get('/tracks')
      .query({
        q: 'oceanfromtheblue',
        client_id: FAKE_V1_KEY,
        offset: 0,
        limit: 50,
      })
      .replyWithFile(200, fixture('search'));

    const results = await src.search('oceanfromtheblue');

    // Limit is 50 but the results fixture only contains 10 :)
    t.is(results.length, 10);

    results.forEach((item) => {
      t.true('artist' in item);
      t.true('title' in item);
    });

    t.end();
  });

  test('get videos by id', async (t) => {
    const src = createSourceV1();

    nock(API_V1_HOST).get('/tracks')
      .query({
        client_id: FAKE_V1_KEY,
        ids: '389870604,346713308',
      })
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

  test('missing authentication', async (t) => {
    const src = createSourceV1();

    nock(API_V1_HOST).get('/tracks')
      .query({
        client_id: FAKE_V1_KEY,
        ids: '389870604,346713308',
      })
      .reply(401, () => {
        return JSON.parse(fs.readFileSync(fixture('401'), 'utf8'));
      });

    try {
      await src.get(['389870604', '346713308']);
    } catch (error) {
      t.ok(error.message.includes('A request must contain the Authorization header'));
      return t.end();
    }

    t.fail('expected error');
  });
});

test('v2', ({ test }) => {
  test('searching for videos', async (t) => {
    nock(WEB_HOST)
      .get('/discover').reply(200, '<script crossorigin src="/fake.js"></script>')
      .get('/fake.js').reply(200, `({client_id:"${FAKE_V2_KEY}"})`);
    nock(API_V2_HOST).get('/search/tracks')
      .query({
        q: 'oceanfromtheblue',
        client_id: FAKE_V2_KEY,
        offset: 0,
        limit: 50,
      })
      .replyWithFile(200, fixture('search2'));

    const src = createSourceV2();
    const results = await src.search('oceanfromtheblue');

    // Limit is 50 but the results fixture only contains 20 :)
    t.is(results.length, 20);

    results.forEach((item) => {
      t.true('artist' in item);
      t.true('title' in item);
    });

    t.end();
  });
});
