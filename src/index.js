import Promise from 'bluebird';
import requestCb from 'request';
import getArtistTitle from 'get-artist-title';

const request = Promise.promisify(requestCb.defaults({
  baseUrl: 'https://api.soundcloud.com',
  json: true
}));

const PAGE_SIZE = 50;

function enlargeThumbnail(thumbnail) {
  // Use larger thumbnail images:
  // -large is 100x100, -crop is 400x400.
  return thumbnail ? thumbnail.replace('-large.', '-crop.') : null;
}

function getThumbnailUrl(item) {
  const thumbnail = item.artwork_url || (item.user && item.user.avatar_url);

  return enlargeThumbnail(thumbnail);
}

function normalizeMedia(media) {
  const [artist, title] = getArtistTitle(media.title, {
    defaultArtist: media.user.username
  });

  const sourceData = {
    fullTitle: media.title,
    permalinkUrl: media.permalink_url,
    streamUrl: media.stream_url,
    artistUrl: media.user.permalink_url,
    username: media.user.username
  };
  return {
    sourceID: media.id,
    sourceData,
    artist,
    title,
    duration: Math.round(parseInt(media.duration / 1000, 10)),
    thumbnail: getThumbnailUrl(media),
    restricted: []
  };
}

export default function soundCloudSource(uw, opts = {}) {
  const params = { client_id: opts.key };

  async function resolve(url) {
    const response = await request('/resolve', {
      qs: { ...params, url }
    });
    return normalizeMedia(response.body);
  }

  function sortSourceIDsAndURLs(list) {
    const urls = [];
    const sourceIDs = [];
    list.forEach((item) => {
      if (/^https?:/.test(item)) {
        urls.push(item);
      } else {
        sourceIDs.push(item);
      }
    });
    return { urls, sourceIDs };
  }

  async function get(sourceIDsAndURLs) {
    const { urls, sourceIDs } = sortSourceIDsAndURLs(sourceIDsAndURLs);

    // Use the `/resolve` endpoint when items are added by their URL.
    const urlsPromise = Promise.all(urls.map(resolve));
    const sourceIDsPromise = request('/tracks', {
      qs: {
        ...params,
        ids: sourceIDs.join(',')
      }
    }).then(response => response.body);

    const [urlItems, sourceIDItems] = await Promise.all([urlsPromise, sourceIDsPromise]);

    // Ensure the results order is the same as the sourceIDs parameter order.
    // TODO deal with nonexistant source IDs
    const items = {};
    urls.forEach((url, index) => {
      const item = urlItems[index];
      items[url] = item;
    });
    sourceIDItems.forEach((sound) => {
      const item = normalizeMedia(sound);
      items[item.sourceID] = item;
    });
    return sourceIDsAndURLs.map(input => items[input]);
  }

  async function search(query, offset = 0) {
    if (/^https?:\/\/(api\.)?soundcloud\.com\//.test(query)) {
      const track = await resolve(query);
      return [track];
    }
    const response = await request('/tracks', {
      qs: {
        ...params,
        offset,
        q: query,
        limit: PAGE_SIZE
      }
    });

    return response.body.map(normalizeMedia);
  }

  return {
    search,
    get: get // eslint-disable-line object-shorthand
  };
}
