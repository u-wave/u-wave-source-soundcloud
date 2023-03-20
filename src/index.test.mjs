import { expect, describe, it } from 'vitest';
import nock from 'nock';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import soundCloudSource from '..';

const FAKE_V1_KEY = 'da5ad14e8278aedac18ba470373c7634';
const FAKE_V2_KEY = 'YxQYlFPNletSMSZ4b8Svv9FTYgbNbM79';

const logger = pino();

const createSourceV1 = () => soundCloudSource({ logger }, { key: FAKE_V1_KEY });
const createSourceV2 = () => soundCloudSource({ logger });

const WEB_HOST = 'https://soundcloud.com';
const API_V1_HOST = 'https://api.soundcloud.com';
const API_V2_HOST = 'https://api-v2.soundcloud.com';

const CONTEXT = {};
const fixture = (name) => path.join(__dirname, '__fixtures__', `${name}.json`);

describe('v1', () => {
  it('searching for videos', async () => {
    const src = createSourceV1();

    nock(API_V1_HOST).get('/tracks')
      .query({
        q: 'oceanfromtheblue',
        client_id: FAKE_V1_KEY,
        offset: 0,
        limit: 50,
      })
      .replyWithFile(200, fixture('search'));

    const results = await src.search(CONTEXT, 'oceanfromtheblue');

    // Limit is 50 but the results fixture only contains 10 :)
    expect(results.length).toBe(10);

    results.forEach((item) => {
      expect(item).toHaveProperty('artist');
      expect(item).toHaveProperty('title');
    });
  });

  it('get videos by id', async () => {
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

    const items = await src.get(CONTEXT, ['389870604', '346713308']);

    expect(items).toHaveLength(2);

    expect(items[0].artist).toBe('oceanfromtheblue(오션)');
    expect(items[1].artist).toBe('slchld');
  });

  it('missing authentication', async () => {
    const src = createSourceV1();

    nock(API_V1_HOST).get('/tracks')
      .query({
        client_id: FAKE_V1_KEY,
        ids: '389870604,346713308',
      })
      .reply(401, () => {
        return JSON.parse(fs.readFileSync(fixture('401'), 'utf8'));
      });

    await expect(() => src.get(CONTEXT, ['389870604', '346713308'])).rejects.toThrow(/A request must contain the Authorization header/);
  });
});

describe('v2', () => {
  it('searching for videos', async () => {
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
    const results = await src.search(CONTEXT, 'oceanfromtheblue');

    // Limit is 50 but the results fixture only contains 20 :)
    expect(results).toHaveLength(20);

    results.forEach((item) => {
      expect(item).toHaveProperty('artist');
      expect(item).toHaveProperty('title');
    });
  });
});
